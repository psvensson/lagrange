import {createHash} from 'node:crypto';

import {
  DEPLOYMENT_BINDING_BUDGET_FIELDS,
  DEPLOYMENT_BINDING_BUDGET_LIMITS,
} from '../constants/deployment-binding.js';
import {
  DEPLOYMENT_BINDING_SOURCE_INTERFACE,
  isDeploymentBindingCellSourceKind,
  normalizeDeploymentBinding,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  normalizeExternalServiceManifest,
} from '../service/external-service-manifest.js';
import {parseOciReference} from '../wasm-service/oci-reference.js';

const REQUEST_CELL_RUNTIME_ERROR_CODE = Object.freeze({
  ARTIFACT_MISMATCH: 'request_cell_artifact_mismatch',
  BINDING_INVALID: 'request_cell_binding_invalid',
  BUDGET_INVALID: 'request_cell_budget_invalid',
  EXPORT_MISMATCH: 'request_cell_export_mismatch',
  RUNTIME_REF_INVALID: 'request_cell_runtime_ref_invalid',
});

const REQUEST_CELL_RUNTIME_ERROR_NAME = 'RequestCellRuntimeContractError';
const NORMALIZED_MANIFEST_ACCEPTED_STATUS = 'accepted';
const WASM_COMPONENT_MEDIA_TYPE = 'application/wasm';
const WASM_COMPONENT_RUNTIME_KIND = 'wasm_component';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const LIST_SEPARATOR = ',';
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const REQUEST_CELL_CONTRACT_FIELD = Object.freeze({
  BUDGETS_PATH: '/budgets',
  BUDGETS_PATH_PREFIX: '/budgets/',
  BINDING_CAPABILITIES: 'Binding capabilities',
  BINDING_DIGEST: 'binding_digest',
  BINDING_PROJECTION: 'binding_projection',
  EXPORT_NAME: 'target.export_name',
  PACKAGE_ID: 'target.package_id',
  PAYLOAD_DIGEST: 'payload_digest',
  RESOURCE_BUDGET: 'resource_budget',
  RUNTIME_CONFIG: 'runtime_config',
  RUNTIME_REF: 'runtime_ref',
  SERVICE_ID: 'service_id',
});
const REQUEST_CELL_CONTRACT_MESSAGE = Object.freeze({
  ARTIFACT_CAPABILITIES_MISMATCH:
    'loaded Artifact capabilities do not match the Binding projection',
  ARTIFACT_IDENTITY_MISMATCH:
    'loaded Artifact does not match the immutable Binding identity',
  BINDING_PROJECTION_INVALID:
    'binding_projection must describe a runtime-enabled Binding',
  BUDGETS_INVALID:
    'resource_budget is outside the Binding budget contract',
  BUDGETS_MISMATCH:
    'runtime budgets do not match the immutable Binding',
  COMPONENT_DIGEST_MISMATCH:
    'loaded Component bytes do not match the OCI payload digest',
  EXPORT_MISMATCH:
    'runtime export does not match the immutable Binding target',
  LINEAGE_MISMATCH:
    'Binding projection lineage does not match the desired service',
  RUNTIME_REF_INVALID:
    'runtime_ref must pin an OCI artifact digest',
  SELECTED_EXPORT_MISSING:
    'loaded Artifact does not declare the selected export',
  TARGET_IDENTITY_INVALID:
    'Binding target identity is invalid',
});
class RequestCellRuntimeContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = REQUEST_CELL_RUNTIME_ERROR_NAME;
    this.code = code;
  }
}

function fail(code, message) {
  throw new RequestCellRuntimeContractError(code, message);
}

function parseJsonObject(value, code, field) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(code, `${field} must contain an object`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof RequestCellRuntimeContractError) throw error;
    fail(code, `${field} must contain valid JSON`);
  }
}

function requireString(value, code, field) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(code, `${field} must be a non-empty string`);
  }
  return value;
}

function requireSortedUniqueStrings(value, field) {
  if (!Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      `${field} must contain strings`,
    );
  }
  const normalized = [...new Set(value)].sort();
  if (normalized.length !== value.length ||
      normalized.some((entry, index) => entry !== value[index])) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      `${field} must be sorted and unique`,
    );
  }
  return Object.freeze(normalized);
}

function requireBudgets(rawBudgets) {
  const budgets = parseJsonObject(
    rawBudgets,
    REQUEST_CELL_RUNTIME_ERROR_CODE.BUDGET_INVALID,
    REQUEST_CELL_CONTRACT_FIELD.RESOURCE_BUDGET,
  );
  const fieldsAreValid =
    Object.keys(budgets).length === DEPLOYMENT_BINDING_BUDGET_FIELDS.length &&
    DEPLOYMENT_BINDING_BUDGET_FIELDS.every((field) => {
      const value = budgets[field];
      const limits = DEPLOYMENT_BINDING_BUDGET_LIMITS[field];
      return Number.isSafeInteger(value) &&
        value >= limits.minimum &&
        value <= limits.maximum;
    });
  if (!fieldsAreValid ||
      budgets.wall_time_ms < budgets.cpu_time_ms) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BUDGET_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.BUDGETS_INVALID,
    );
  }
  return Object.freeze(Object.fromEntries(
    DEPLOYMENT_BINDING_BUDGET_FIELDS.map(
      (field) => [field, budgets[field]],
    ),
  ));
}

function parseBindingProjection(definition) {
  const projection = parseJsonObject(
    definition.binding_projection,
    REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
    REQUEST_CELL_CONTRACT_FIELD.BINDING_PROJECTION,
  );
  let declaration;
  try {
    const {capabilities, ...bindingInput} = projection.declaration;
    declaration = {
      ...normalizeDeploymentBinding(bindingInput),
      capabilities,
    };
  } catch (error) {
    if (error?.path === REQUEST_CELL_CONTRACT_FIELD.BUDGETS_PATH ||
        error?.path?.startsWith(
          REQUEST_CELL_CONTRACT_FIELD.BUDGETS_PATH_PREFIX,
        )) {
      fail(
        REQUEST_CELL_RUNTIME_ERROR_CODE.BUDGET_INVALID,
        REQUEST_CELL_CONTRACT_MESSAGE.BUDGETS_INVALID,
      );
    }
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.BINDING_PROJECTION_INVALID,
    );
  }
  if (!isDeploymentBindingCellSourceKind(declaration.source.kind)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.BINDING_PROJECTION_INVALID,
    );
  }
  if (projection.binding_digest !== definition.binding_digest ||
      projection.binding_version_id !== definition.binding_version_id) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.LINEAGE_MISMATCH,
    );
  }
  const target = declaration.target;
  if (!target || !SHA256_PATTERN.test(target.manifest_digest)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.TARGET_IDENTITY_INVALID,
    );
  }
  return {declaration, projection, target};
}

function resolvePinnedArtifactDigest(definition) {
  const runtimeRef = requireString(
    definition.runtime_ref ?? definition.runtimeRef,
    REQUEST_CELL_RUNTIME_ERROR_CODE.RUNTIME_REF_INVALID,
    REQUEST_CELL_CONTRACT_FIELD.RUNTIME_REF,
  );
  const parsed = parseOciReference(runtimeRef);
  if (!parsed.valid || !parsed.digest) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.RUNTIME_REF_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.RUNTIME_REF_INVALID,
    );
  }
  return parsed.digest;
}

function isRequestCellDefinition(definition) {
  return definition?.binding_projection !== undefined ||
    definition?.binding_version_id !== undefined ||
    definition?.binding_digest !== undefined;
}

function projectRequestCellRuntime(definition) {
  const {declaration, projection, target} =
    parseBindingProjection(definition);
  const runtimeConfig = parseJsonObject(
    definition.runtime_config ?? definition.runtimeConfig,
    REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
    REQUEST_CELL_CONTRACT_FIELD.RUNTIME_CONFIG,
  );
  if (runtimeConfig.export_name !== target.export_name) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.EXPORT_MISMATCH,
      REQUEST_CELL_CONTRACT_MESSAGE.EXPORT_MISMATCH,
    );
  }
  const budgets = requireBudgets(definition.resource_budget);
  const declaredBudgets = requireBudgets(declaration.budgets);
  if (JSON.stringify(budgets) !== JSON.stringify(declaredBudgets)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.BUDGET_INVALID,
      REQUEST_CELL_CONTRACT_MESSAGE.BUDGETS_MISMATCH,
    );
  }
  return Object.freeze({
    artifactDigest: resolvePinnedArtifactDigest(definition),
    bindingDigest: requireString(
      projection.binding_digest,
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_FIELD.BINDING_DIGEST,
    ),
    budgets,
    capabilities: requireSortedUniqueStrings(
      declaration.capabilities,
      REQUEST_CELL_CONTRACT_FIELD.BINDING_CAPABILITIES,
    ),
    exportName: requireString(
      target.export_name,
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_FIELD.EXPORT_NAME,
    ),
    manifestDigest: target.manifest_digest,
    packageId: requireString(
      target.package_id,
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_FIELD.PACKAGE_ID,
    ),
    serviceId: requireString(
      definition.serviceId ?? definition.service_id,
      REQUEST_CELL_RUNTIME_ERROR_CODE.BINDING_INVALID,
      REQUEST_CELL_CONTRACT_FIELD.SERVICE_ID,
    ),
    sourceKind: declaration.source.kind,
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(LIST_SEPARATOR)}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(LIST_SEPARATOR)}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(canonicalJson(value))
    .digest(HASH_ENCODING)}`;
}

function sha256Bytes(value) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)}`;
}

function artifactIdentityMatches(runtime, artifact, manifest) {
  if (!artifact || !manifest) return false;
  return [
    [artifact.packageId, runtime.packageId],
    [artifact.manifestDigest, runtime.manifestDigest],
    [artifact.artifactDigest, runtime.artifactDigest],
    [manifest.artifact.digest, runtime.artifactDigest],
    [manifest.artifact.media_type, WASM_COMPONENT_MEDIA_TYPE],
    [manifest.runtime.kind, WASM_COMPONENT_RUNTIME_KIND],
    [sha256Json(manifest), runtime.manifestDigest],
    [sha256Json(artifact.manifest), runtime.manifestDigest],
  ].every(([actual, expected]) => actual === expected);
}

function requireArtifactIdentity(runtime, artifact) {
  const result = normalizeExternalServiceManifest(artifact?.manifest);
  const manifest =
    result.status === NORMALIZED_MANIFEST_ACCEPTED_STATUS ?
      result.manifest :
      null;
  if (!artifactIdentityMatches(runtime, artifact, manifest)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_CELL_CONTRACT_MESSAGE.ARTIFACT_IDENTITY_MISMATCH,
    );
  }
  return manifest;
}

function requireSelectedExport(runtime, manifest) {
  const selectedExport = manifest.exports?.find(
    (entry) => entry.name === runtime.exportName,
  );
  if (!selectedExport ||
      selectedExport.interface !==
        DEPLOYMENT_BINDING_SOURCE_INTERFACE[runtime.sourceKind]) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.EXPORT_MISMATCH,
      REQUEST_CELL_CONTRACT_MESSAGE.SELECTED_EXPORT_MISSING,
    );
  }
  return selectedExport;
}

function requireArtifactCapabilities(runtime, manifest) {
  const capabilities = [...(manifest.capabilities || [])].sort();
  if (JSON.stringify(capabilities) !== JSON.stringify(runtime.capabilities)) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_CELL_CONTRACT_MESSAGE.ARTIFACT_CAPABILITIES_MISMATCH,
    );
  }
}

function requireComponentBytes(artifact) {
  const componentBytes =
    Buffer.isBuffer(artifact.bytes) ||
      artifact.bytes instanceof Uint8Array ?
      Buffer.from(artifact.bytes) :
      null;
  if (!componentBytes ||
      sha256Bytes(componentBytes) !== artifact.payloadDigest) {
    fail(
      REQUEST_CELL_RUNTIME_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_CELL_CONTRACT_MESSAGE.COMPONENT_DIGEST_MISMATCH,
    );
  }
  return componentBytes;
}

function bindRequestCellArtifact(runtime, artifact) {
  const manifest = requireArtifactIdentity(runtime, artifact);
  requireSelectedExport(runtime, manifest);
  requireArtifactCapabilities(runtime, manifest);
  return Object.freeze({
    ...runtime,
    bytes: requireComponentBytes(artifact),
    payloadDigest: requireString(
      artifact.payloadDigest,
      REQUEST_CELL_RUNTIME_ERROR_CODE.ARTIFACT_MISMATCH,
      REQUEST_CELL_CONTRACT_FIELD.PAYLOAD_DIGEST,
    ),
  });
}

export {
  bindRequestCellArtifact,
  isRequestCellDefinition,
  projectRequestCellRuntime,
};
