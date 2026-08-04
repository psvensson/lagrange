/**
 * Owner of deployment-record generation from a normalized service IR.
 *
 * From a fixed IR (src/service/service-source-contract.js) this module
 * derives the .lagrange deployment tree records — manifest, bindings,
 * access policies, and deployment plan — with the existing contracts as
 * final authority: the manifest is whatever validateExternalServiceManifest
 * accepts, every binding must survive normalizeDeploymentBinding plus
 * bindDeploymentArtifact, and every access policy must pass the runtime
 * access-policy normalizer before it is emitted. No deployment contract
 * rule is re-implemented here; owner rejections propagate verbatim.
 *
 * This module does NOT own IR normalization (service-source-contract),
 * componentization/builds (a later rung), or deployment execution.
 * Generated binding names appear only in .lagrange output; no
 * developer-facing surface documents or accepts them as input.
 */

import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
  DeploymentBindingError,
  bindDeploymentArtifact,
  canonicalJson,
  normalizeDeploymentBinding,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  RuntimeAccessPolicyError,
  normalizePolicyInput,
} from '../control-plane/owners/runtime-access-policy-owner.js';
import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
  validateExternalServiceManifest,
} from './external-service-manifest.js';

const DEPLOYMENT_RECORD_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

// Deterministic generated binding names (epic sealed decision 2):
// <service>--request--<kebab(handlerId)> and
// <service>--call--<kebab(operationId)>. These names exist only in
// .lagrange output records.
const GENERATED_BINDING_INFIX = Object.freeze({
  [DEPLOYMENT_BINDING_SOURCE_KIND.CALL]: '--call--',
  [DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST]: '--request--',
});
const CAMEL_TO_KEBAB_BOUNDARY = /([a-z0-9])([A-Z])/gu;
const KEBAB_BOUNDARY_REPLACEMENT = '$1-$2';

// The one component export per source kind. The manifest validator owns
// the name grammar and the binding contract owns the export/interface
// match; these are only the generated output values.
const GENERATED_EXPORT_NAME = Object.freeze({
  [DEPLOYMENT_BINDING_SOURCE_KIND.CALL]: 'run',
  [DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST]: 'handle-request',
});

// Input stamps validated by the owning contracts: a wrong value here is
// rejected by normalizeDeploymentBinding / normalizePolicyInput /
// validateExternalServiceManifest, so the rules stay owner-side.
const GENERATED_BINDING_SCHEMA_VERSION = 2;
const GENERATED_ACCESS_POLICY_SCHEMA_VERSION = 2;
const MANIFEST_ARTIFACT_TYPE = 'oci';
const GENERATED_POLICY_TABLES = Object.freeze([]);

// Grammar-shaped placeholder package id; deployment fills the real id.
// deployment-plan.json documents it via package_id_placeholder.
const PACKAGE_ID_PLACEHOLDER_PREFIX = 'service-package-';
const PACKAGE_ID_PLACEHOLDER_DIGIT = '0';
const PACKAGE_ID_PLACEHOLDER_DIGIT_COUNT = 64;
const SERVICE_PACKAGE_ID_PLACEHOLDER = PACKAGE_ID_PLACEHOLDER_PREFIX +
  PACKAGE_ID_PLACEHOLDER_DIGIT.repeat(PACKAGE_ID_PLACEHOLDER_DIGIT_COUNT);

// Budget defaults for generated bindings
// (examples/call-binding-account-summary/call-binding-example-contract.js);
// a build receipt supplies the artifact descriptor in later rungs, and
// these named defaults supply the budget envelopes.
const CALL_BINDING_BUDGET_DEFAULTS = Object.freeze({
  context_bytes: 8_192,
  cpu_time_ms: 2_000,
  input_bytes: 1_048_576,
  memory_bytes: 128 * 1024 * 1024,
  output_bytes: 65_536,
  wall_time_ms: 30_000,
});

// The outer request Binding's own budget envelope: its wall budget must
// cover the nested distributed call, whose effective deadline is the
// tighter of this outer budget and the platform's bridged-call default.
const REQUEST_BINDING_BUDGET_DEFAULTS = Object.freeze({
  context_bytes: 8_192,
  cpu_time_ms: 2_000,
  input_bytes: 65_536,
  memory_bytes: 128 * 1024 * 1024,
  output_bytes: 65_536,
  wall_time_ms: 30_000,
});

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const DIGEST_PREFIX = 'sha256:';

const DEPLOYMENT_TREE_DIRECTORY_SEGMENTS = Object.freeze([
  '.lagrange',
  'deployment',
]);
const DEPLOYMENT_TREE_FILE_BY_RECORD = Object.freeze({
  accessPolicies: 'access-policy.json',
  bindings: 'bindings.json',
  deploymentPlan: 'deployment-plan.json',
  manifest: 'manifest.json',
});
const RECORD_FILE_ENCODING = 'utf8';
const RECORD_TRAILING_NEWLINE = '\n';
const MISSING_RECORD_MESSAGE =
  'writeDeploymentTree requires the records object of an accepted result';

// The naming owner's own uniqueness rule (house precedent: the manifest
// owner's duplicate-export-name admission check). Two logical ids that
// kebab-collide onto one generated name would emit a non-injective plan and
// an un-installable binding set, so a collision is rejected here rather than
// deferred to the deployment owner.
const DEPLOYMENT_RECORD_ERROR_CODE = Object.freeze({
  GENERATED_NAME_COLLISION: 'generated_name_collision',
});
const GENERATED_NAME_COLLISION_PATH_PREFIX = '/bindings/';
const GENERATED_NAME_COLLISION_MESSAGE =
  'distinct logical ids collide onto one generated binding name';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

// The single naming owner for generated binding names. camelCase logical
// ids (handler ids, operation ids) become kebab-case name tails.
function generatedBindingName(serviceName, sourceKind, logicalId) {
  const kebabId = logicalId
    .replace(CAMEL_TO_KEBAB_BOUNDARY, KEBAB_BOUNDARY_REPLACEMENT)
    .toLowerCase();
  return `${serviceName}${GENERATED_BINDING_INFIX[sourceKind]}${kebabId}`;
}

function manifestDigestOf(manifest) {
  return DIGEST_PREFIX + createHash(HASH_ALGORITHM)
    .update(canonicalJson(manifest))
    .digest(HASH_ENCODING);
}

function buildManifestInput(ir, artifact) {
  const exportDeclarations = [];
  if (ir.handlers.length > 0) {
    exportDeclarations.push({
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST,
      name: GENERATED_EXPORT_NAME[DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST],
    });
  }
  if (ir.operations.length > 0) {
    exportDeclarations.push({
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.CALL,
      name: GENERATED_EXPORT_NAME[DEPLOYMENT_BINDING_SOURCE_KIND.CALL],
    });
  }
  return {
    artifact: {
      digest: artifact.digest,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      ref: artifact.ref,
      size_bytes: artifact.sizeBytes,
      type: MANIFEST_ARTIFACT_TYPE,
    },
    exports: exportDeclarations,
    name: ir.name,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    version: ir.version,
  };
}

function bindingTarget(sourceKind, manifestDigest) {
  return {
    export_name: GENERATED_EXPORT_NAME[sourceKind],
    manifest_digest: manifestDigest,
    package_id: SERVICE_PACKAGE_ID_PLACEHOLDER,
  };
}

function buildBindingDeclarations(ir, manifestDigest) {
  const declarations = [];
  for (const handler of ir.handlers) {
    declarations.push({
      budgets: {...REQUEST_BINDING_BUDGET_DEFAULTS},
      name: generatedBindingName(
        ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST, handler.id),
      schema_version: GENERATED_BINDING_SCHEMA_VERSION,
      source: {
        kind: DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST,
        method: handler.method,
        path: handler.path,
      },
      target: bindingTarget(
        DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST, manifestDigest),
    });
  }
  for (const operation of ir.operations) {
    const callBindingName = generatedBindingName(
      ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.CALL, operation.id);
    declarations.push({
      budgets: {...CALL_BINDING_BUDGET_DEFAULTS},
      name: callBindingName,
      schema_version: GENERATED_BINDING_SCHEMA_VERSION,
      source: {
        kind: DEPLOYMENT_BINDING_SOURCE_KIND.CALL,
        name: callBindingName,
        statement: operation.statement.text,
      },
      target: bindingTarget(
        DEPLOYMENT_BINDING_SOURCE_KIND.CALL, manifestDigest),
    });
  }
  return declarations;
}

// Admission through the real owners: the normalized declaration is what
// gets emitted, and binding it against the manifest proves the target
// export/interface pair without any local re-check.
function admitBinding(declaration, manifest, manifestDigest) {
  const normalized = normalizeDeploymentBinding(declaration);
  bindDeploymentArtifact(normalized, {
    manifest,
    manifestDigest,
    packageId: SERVICE_PACKAGE_ID_PLACEHOLDER,
  });
  return normalized;
}

// Exactly one policy record per handler with a non-empty calls entry;
// handlers without calls get no policy record. The raw payload shape is
// emitted, but only after the policy normalizer accepts it.
function buildAccessPolicyPayloads(ir) {
  const payloads = [];
  for (const handler of ir.handlers) {
    if (handler.allowedOperations.length === 0) continue;
    const payload = {
      binding_name: generatedBindingName(
        ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST, handler.id),
      calls: handler.allowedOperations.map((operationId) => ({
        binding: generatedBindingName(
          ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.CALL, operationId),
      })),
      schema_version: GENERATED_ACCESS_POLICY_SCHEMA_VERSION,
      tables: [...GENERATED_POLICY_TABLES],
    };
    normalizePolicyInput(payload);
    payloads.push(payload);
  }
  return payloads;
}

// The logical-id -> generated-binding-name map: exactly one entry per
// handler and per operation. Deploy replaces package_id_placeholder with
// the real package id when the artifact is installed.
function buildDeploymentPlan(ir) {
  const handlers = {};
  for (const handler of ir.handlers) {
    handlers[handler.id] = {
      binding: generatedBindingName(
        ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST, handler.id),
    };
  }
  const operations = {};
  for (const operation of ir.operations) {
    operations[operation.id] = {
      binding: generatedBindingName(
        ir.name, DEPLOYMENT_BINDING_SOURCE_KIND.CALL, operation.id),
    };
  }
  return {
    handlers,
    operations,
    package_id_placeholder: SERVICE_PACKAGE_ID_PLACEHOLDER,
  };
}

function rejectedResult(errors) {
  return deepFreeze({
    errors: errors.map(({code, message, path: errorPath}) =>
      ({code, message, path: errorPath})),
    status: DEPLOYMENT_RECORD_STATUS.REJECTED,
  });
}

function isOwnerRejection(error) {
  return error instanceof DeploymentBindingError ||
    error instanceof RuntimeAccessPolicyError;
}

// A generated name owns exactly one declaration; any name emitted by more
// than one declaration is a collision and rejected with the naming owner's
// own diagnostic before the records reach the deployment owner.
function generatedNameCollisionErrors(declarations) {
  const declarationsByName = new Map();
  for (const declaration of declarations) {
    const existing = declarationsByName.get(declaration.name) || [];
    existing.push(declaration);
    declarationsByName.set(declaration.name, existing);
  }
  const errors = [];
  for (const [name, group] of declarationsByName) {
    if (group.length < 2) continue;
    errors.push({
      code: DEPLOYMENT_RECORD_ERROR_CODE.GENERATED_NAME_COLLISION,
      message: `${GENERATED_NAME_COLLISION_MESSAGE}: ${name}`,
      path: `${GENERATED_NAME_COLLISION_PATH_PREFIX}${name}`,
    });
  }
  return errors;
}

function buildDeploymentRecords(input) {
  const {artifact, ir} = input;
  const manifestResult =
    validateExternalServiceManifest(buildManifestInput(ir, artifact));
  if (!manifestResult.valid) {
    return rejectedResult(manifestResult.errors);
  }
  const {manifest} = manifestResult;
  const manifestDigest = manifestDigestOf(manifest);
  const declarations = buildBindingDeclarations(ir, manifestDigest);
  const collisions = generatedNameCollisionErrors(declarations);
  if (collisions.length > 0) return rejectedResult(collisions);
  try {
    const bindings = declarations
      .map((declaration) => admitBinding(declaration, manifest, manifestDigest));
    return deepFreeze({
      records: {
        accessPolicies: buildAccessPolicyPayloads(ir),
        bindings,
        deploymentPlan: buildDeploymentPlan(ir),
        manifest,
      },
      status: DEPLOYMENT_RECORD_STATUS.ACCEPTED,
    });
  } catch (caught) {
    if (isOwnerRejection(caught)) return rejectedResult([caught]);
    throw caught;
  }
}

// Deterministic serialization: canonical (key-sorted) JSON plus a single
// trailing newline per file, so repeated runs from the same IR reproduce
// a byte-identical tree.
async function writeDeploymentTree(records, outputRoot) {
  for (const recordKey of Object.keys(DEPLOYMENT_TREE_FILE_BY_RECORD)) {
    if (records?.[recordKey] === undefined) {
      throw new TypeError(MISSING_RECORD_MESSAGE);
    }
  }
  const directory =
    path.join(outputRoot, ...DEPLOYMENT_TREE_DIRECTORY_SEGMENTS);
  await mkdir(directory, {recursive: true});
  const written = [];
  for (const [recordKey, fileName] of
    Object.entries(DEPLOYMENT_TREE_FILE_BY_RECORD)) {
    const filePath = path.join(directory, fileName);
    await writeFile(
      filePath,
      canonicalJson(records[recordKey]) + RECORD_TRAILING_NEWLINE,
      RECORD_FILE_ENCODING,
    );
    written.push(filePath);
  }
  written.sort();
  return Object.freeze(written);
}

export {
  DEPLOYMENT_RECORD_ERROR_CODE,
  DEPLOYMENT_RECORD_STATUS,
  buildDeploymentRecords,
  writeDeploymentTree,
};
