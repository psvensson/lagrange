/**
 * `lagrange service generate|build|deploy` — the code-first CLI pipeline
 * over the service compiler.
 *
 *   - generate: lagrange.service.js -> normalized IR -> generated
 *     component entry + deterministic .lagrange/deployment tree (through
 *     the real manifest/binding/policy validators).
 *   - build: componentizes the generated entry through the shared
 *     componentize owner into .lagrange/component.wasm, then publishes a
 *     verified local OCI layout whose artifact descriptor is stamped
 *     back into manifest.json (so what deploys is exactly what was
 *     validated).
 *   - deploy: replays the generated records over the existing pgwire
 *     service-lifecycle SQL grammar (INSTALL SERVICE / CREATE BINDING /
 *     CONFIGURE SERVICE ACCESS), substituting the INSTALL-returned
 *     package id into the placeholder targets. Every statement goes
 *     through the grammar owner — no control-plane RPC, no direct
 *     system-table writes — and any validator or policy rejection aborts
 *     the sequence (fail-closed).
 *
 * The artifact digest is only knowable after the build, so the
 * pre-build tree carries the record generator's placeholder artifact
 * descriptor; `build` revalidates the stamped manifest through the
 * external-service-manifest validator before writing it back.
 */

import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  validateExternalServiceManifest,
} from '../service/external-service-manifest.js';
import {
  emitServiceEntry,
} from '../service/service-entry-generator.js';
import {
  emitServiceTypings,
} from '../service/service-typings-generator.js';
import {
  buildDeploymentRecords,
  writeDeploymentTree,
} from '../service/service-deployment-record-generator.js';
import {
  componentizeService,
} from '../service/service-component-build.js';
import {
  normalizeServiceSource,
} from '../service/service-source-contract.js';

const SERVICE_PIPELINE_ERROR_NAME = 'ServicePipelineError';
const SERVICE_PIPELINE_STAGE = Object.freeze({
  BUILD: 'build',
  COMPONENTIZE: 'componentize',
  DEPLOY: 'deploy',
  GENERATE: 'generate',
  NORMALIZE: 'normalize',
  RECORDS: 'records',
});
const SERVICE_MODULE_FILE = 'lagrange.service.js';
const GENERATED_ENTRY_FILE = 'generated-entry.js';
const GENERATED_TYPINGS_FILE = 'runtime-types.d.ts';
const GENERATED_ENTRY_MODULE_SPECIFIER = `./${SERVICE_MODULE_FILE}`;
const LAGRANGE_DIRECTORY = '.lagrange';
const COMPONENT_FILE = 'component.wasm';
const MANIFEST_FILE = 'manifest.json';
const BINDINGS_FILE = 'bindings.json';
const ACCESS_POLICY_FILE = 'access-policy.json';
const DEPLOYMENT_SUBDIRECTORY = 'deployment';
const JSON_INDENT = 2;
const TEXT_ENCODING = 'utf8';

// The grammar statements deploy replays; the payloads are the generated
// records themselves (with the real package id substituted), so the SQL
// ingress contract and the lifecycle command owner stay the sole
// validators of what reaches the control plane.
const DEPLOY_SQL = Object.freeze({
  CONFIGURE_ACCESS: 'CONFIGURE SERVICE ACCESS $1',
  CREATE_BINDING: 'CREATE BINDING $1',
  INSTALL: 'INSTALL SERVICE $1',
});
const LOCAL_OCI_ARTIFACT_SOURCE_KIND = 'local_oci_layout';
const EMPTY_POLICY_TABLES = Object.freeze([]);
const EMPTY_POLICY_CALLS = Object.freeze([]);
const ACCESS_POLICY_SCHEMA_VERSION = 2;
const DEFAULT_PLATFORM = 'linux/amd64';
const DEFAULT_SOURCE_DATE_EPOCH = 1_700_000_000;
const PACKAGE_ID_TYPE = 'string';
const ACCEPTED_STATUS = 'accepted';
const REQUEST_SOURCE_KIND = 'request';
const PLACEHOLDER_DIGEST = `sha256:${'0'.repeat(64)}`;
const PLACEHOLDER_REF = 'placeholder.invalid/pending-build:0';
const SQL_PARAMETER_SUFFIX = ' $';
const SERVICE_PIPELINE_MESSAGE = Object.freeze({
  COMPONENTIZE_FAILED:
    'componentize failed (run `lagrange service generate` first): ',
  DEPLOY_LAYOUT_REQUIRED:
    'deploy requires the build layout path (run `lagrange service ' +
    'build` and pass --layout <path>)',
  IDEMPOTENCY_KEY_REQUIRED: '--idempotency-key is required',
  NO_PACKAGE_ID: 'INSTALL SERVICE returned no package_id row',
});

class ServicePipelineError extends Error {
  constructor(stage, message, options = {}) {
    super(message, options);
    this.name = SERVICE_PIPELINE_ERROR_NAME;
    this.stage = stage;
  }
}

function pipelineFailure(stage, message, cause) {
  return new ServicePipelineError(stage, message, {cause});
}

function deploymentDirectory(projectDirectory) {
  return path.join(
    projectDirectory, LAGRANGE_DIRECTORY, DEPLOYMENT_SUBDIRECTORY);
}

function deploymentFile(projectDirectory, fileName) {
  return path.join(deploymentDirectory(projectDirectory), fileName);
}

async function readJsonFile(filePath, stage) {
  let raw;
  try {
    raw = await readFile(filePath, TEXT_ENCODING);
  } catch (error) {
    throw pipelineFailure(
      stage, `cannot read ${filePath}: ${error.message}`, error);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw pipelineFailure(
      stage, `${filePath} is not valid JSON: ${error.message}`, error);
  }
}

async function loadNormalizedService(projectDirectory) {
  const modulePath = path.join(projectDirectory, SERVICE_MODULE_FILE);
  const normalized = await normalizeServiceSource(modulePath);
  if (normalized.status !== ACCEPTED_STATUS) {
    const first = normalized.errors[0];
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.NORMALIZE,
      `${SERVICE_MODULE_FILE} rejected: ${first.code} at ${first.path} ` +
        `(${first.message})`,
    );
  }
  return normalized.ir;
}

// The pre-build tree carries the generator's placeholder artifact
// descriptor; `build` stamps the real one and revalidates.
function placeholderArtifact() {
  return {
    digest: PLACEHOLDER_DIGEST,
    ref: PLACEHOLDER_REF,
    sizeBytes: 0,
  };
}

async function runGenerate({projectDirectory, writeOutput}) {
  const ir = await loadNormalizedService(projectDirectory);
  const entry = await emitServiceEntry({
    moduleSpecifier: GENERATED_ENTRY_MODULE_SPECIFIER,
    outputPath: path.join(projectDirectory, GENERATED_ENTRY_FILE),
  }).catch((error) => {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.GENERATE,
      `entry emission failed: ${error.message}`, error);
  });
  const result = buildDeploymentRecords({artifact: placeholderArtifact(), ir});
  if (result.status !== ACCEPTED_STATUS) {
    const first = result.errors[0];
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.RECORDS,
      `deployment records rejected: ${first.code} at ${first.path} ` +
        `(${first.message})`,
    );
  }
  const written = await writeDeploymentTree(
    result.records, projectDirectory);
  const typings = await emitServiceTypings({
    ir,
    outputPath: path.join(projectDirectory, GENERATED_TYPINGS_FILE),
  }).catch((error) => {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.GENERATE,
      `typings emission failed: ${error.message}`, error);
  });
  await writeOutput(JSON.stringify({
    bindings: result.records.bindings.map((binding) => binding.name),
    entry: entry.outputPath,
    handlers: ir.handlers.map((handler) => handler.id),
    operations: ir.operations.map((operation) => operation.id),
    service: ir.name,
    typings: typings.outputPath,
    written: [entry.outputPath, typings.outputPath, ...written],
  }));
  return {ir, records: result.records};
}

// Stamping the build's real artifact descriptor back into manifest.json
// binds the deployed records to the exact bytes that were validated;
// the manifest validator re-admits the stamped record before it is
// written.
async function stampArtifactDescriptor(projectDirectory, descriptor) {
  const manifestPath = deploymentFile(projectDirectory, MANIFEST_FILE);
  const manifest = await readJsonFile(
    manifestPath, SERVICE_PIPELINE_STAGE.BUILD);
  manifest.artifact = {
    digest: descriptor.digest,
    media_type: manifest.artifact.media_type,
    ref: manifest.artifact.ref,
    size_bytes: descriptor.sizeBytes,
    type: manifest.artifact.type,
  };
  const validation = validateExternalServiceManifest(manifest);
  if (!validation.valid) {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.BUILD,
      `stamped manifest rejected: ${validation.errors[0].message}`,
    );
  }
  await writeFile(
    manifestPath, `${JSON.stringify(manifest, null, JSON_INDENT)}\n`,
    TEXT_ENCODING);
  return manifest;
}

async function runBuild({
  createLocalOciLayoutBuilder,
  platform = DEFAULT_PLATFORM,
  projectDirectory,
  sourceDateEpoch = DEFAULT_SOURCE_DATE_EPOCH,
  writeOutput,
}) {
  const entryPath = path.join(projectDirectory, GENERATED_ENTRY_FILE);
  const componentPath = path.join(
    projectDirectory, LAGRANGE_DIRECTORY, COMPONENT_FILE);
  let component;
  try {
    ({component} = await componentizeService({sourcePath: entryPath}));
  } catch (error) {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.COMPONENTIZE,
      SERVICE_PIPELINE_MESSAGE.COMPONENTIZE_FAILED + error.message,
      error,
    );
  }
  await writeFile(componentPath, component);
  const receipt = await createLocalOciLayoutBuilder().build({
    outputRoot: path.join(projectDirectory, LAGRANGE_DIRECTORY),
    platform,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    sourceDateEpoch,
    wasm: {payloadPath: componentPath},
  }).catch((error) => {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.BUILD,
      `OCI layout build failed: ${error.message}`, error);
  });
  const descriptor = receipt.topManifestDescriptor;
  await stampArtifactDescriptor(projectDirectory, {
    digest: descriptor.digest,
    sizeBytes: descriptor.sizeBytes,
  });
  await writeOutput(JSON.stringify({
    component: componentPath,
    digest: descriptor.digest,
    layout: receipt.layoutPath,
    sizeBytes: descriptor.sizeBytes,
  }));
  return {componentPath, descriptor, layoutPath: receipt.layoutPath};
}

// Substitute the real INSTALL-returned package id into a generated
// binding's placeholder target, keeping the rest of the record verbatim
// (re-normalization by the SQL grammar is idempotent).
function withPackageId(binding, packageId) {
  return {
    budgets: binding.budgets,
    name: binding.name,
    schema_version: binding.schema_version,
    source: binding.source,
    target: {...binding.target, package_id: packageId},
  };
}

async function executeDeployStatement(execute, statement, payload, stage) {
  try {
    return await execute(statement, [JSON.stringify(payload)]);
  } catch (error) {
    throw pipelineFailure(
      stage, `${statement.split(SQL_PARAMETER_SUFFIX)[0]} rejected: ${error.message}`,
      error);
  }
}

async function runDeploy({
  createSqlClient,
  idempotencyKey,
  layoutPath,
  projectDirectory,
  writeOutput,
}) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.DEPLOY,
      SERVICE_PIPELINE_MESSAGE.IDEMPOTENCY_KEY_REQUIRED);
  }
  const stage = SERVICE_PIPELINE_STAGE.DEPLOY;
  const manifest = await readJsonFile(
    deploymentFile(projectDirectory, MANIFEST_FILE), stage);
  const bindings = await readJsonFile(
    deploymentFile(projectDirectory, BINDINGS_FILE), stage);
  const accessPolicies = await readJsonFile(
    deploymentFile(projectDirectory, ACCESS_POLICY_FILE), stage);
  if (typeof layoutPath !== 'string' || layoutPath.length === 0) {
    throw pipelineFailure(
      stage,
      SERVICE_PIPELINE_MESSAGE.DEPLOY_LAYOUT_REQUIRED,
    );
  }
  const sqlClient = createSqlClient();
  const execute = (statement, parameters) =>
    sqlClient.execute(statement, parameters);

  const installed = await executeDeployStatement(
    execute, DEPLOY_SQL.INSTALL, {
      artifact_source: {
        kind: LOCAL_OCI_ARTIFACT_SOURCE_KIND,
        location: layoutPath,
      },
      config: {},
      idempotency_key: idempotencyKey,
      manifest,
    }, stage);
  const packageId = installed.rows?.[0]?.package_id;
  if (typeof packageId !== PACKAGE_ID_TYPE) {
    throw pipelineFailure(
      stage, SERVICE_PIPELINE_MESSAGE.NO_PACKAGE_ID);
  }

  const created = [];
  for (const binding of bindings) {
    await executeDeployStatement(
      execute, DEPLOY_SQL.CREATE_BINDING, withPackageId(binding, packageId),
      stage);
    created.push(binding.name);
  }
  const configured = await configureAccessPolicies(
    execute, bindings, accessPolicies, stage);
  await writeOutput(JSON.stringify({
    bindings: created,
    packageId,
    policies: configured,
    service: manifest.name,
  }));
  return {bindings: created, packageId, policies: configured};
}

// The access-policy phase: replay every record's policy, then complete
// coverage for any request Binding the records left without one.
async function configureAccessPolicies(
  execute, bindings, accessPolicies, stage) {
  const configured = [];
  for (const policy of accessPolicies) {
    await executeDeployStatement(
      execute, DEPLOY_SQL.CONFIGURE_ACCESS, policy, stage);
    configured.push(policy.binding_name);
  }
  // Every request Binding needs a runtime access policy for its request
  // Cell to be admitted (fail-closed: policy_not_found is a denial). The
  // compiler emits one only where there are outbound calls to authorize,
  // so deploy completes the coverage with an empty (no-calls, no-tables)
  // policy for any request Binding the records left uncovered — through
  // the same CONFIGURE SERVICE ACCESS grammar, no owner bypass.
  const policiedBindings = new Set(configured);
  for (const binding of bindings) {
    if (binding.source?.kind !== REQUEST_SOURCE_KIND ||
        policiedBindings.has(binding.name)) {
      continue;
    }
    await executeDeployStatement(execute, DEPLOY_SQL.CONFIGURE_ACCESS, {
      binding_name: binding.name,
      calls: [...EMPTY_POLICY_CALLS],
      schema_version: ACCESS_POLICY_SCHEMA_VERSION,
      tables: [...EMPTY_POLICY_TABLES],
    }, stage);
    configured.push(binding.name);
  }
  return configured;
}

export {
  ServicePipelineError,
  runBuild,
  runDeploy,
  runGenerate,
};
