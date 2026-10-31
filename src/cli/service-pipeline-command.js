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

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  canonicalJson,
  deriveTenantPackageId,
  sha256Json,
} from '../control-plane/owners/service-install-catalog-contract.js';
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
  restampDeploymentBindings,
  writeDeploymentTree,
} from '../service/service-deployment-record-generator.js';
import {
  SERVICE_COMPONENT_BUILD_ERROR_CODE,
  ServiceComponentBuildError,
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
  INSPECT: 'inspect',
  NORMALIZE: 'normalize',
  RECORDS: 'records',
});
const ACTIVE_STATE = 'active';

const SERVICE_PIPELINE_COMMAND_ERROR_CODE = Object.freeze({
  BUILD_FAILED: 'BUILD_FAILED',
  MISSING_GENERATED_ARTIFACTS: 'BUILD_FAILED',
  MISSING_SOURCE: 'MISSING_SOURCE',
  MISSING_COMPONENTIZE: 'MISSING_COMPONENTIZE',
});

const SERVICE_PIPELINE_COMMAND_ERROR_NAME = 'ServicePipelineCommandError';
const ERR_MODULE_NOT_FOUND_CODE = 'ERR_MODULE_NOT_FOUND';
const DIST_DIRECTORY_NAME = 'dist';

class ServicePipelineCommandError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = SERVICE_PIPELINE_COMMAND_ERROR_NAME;
    this.code = code;
    this.stage = options.stage || SERVICE_PIPELINE_STAGE.BUILD;
  }
}
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
const JSON_EXTENSION = '.json';
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
  DEPLOY_BUILD_REQUIRED:
    'deploy requires a built service artifact (run `lagrange service build` first)',
  DEPLOY_REGISTRATION_REQUIRED:
    'deploy requires registered immutable identities (run `lagrange service publish` first or provide registration)',
  IDEMPOTENCY_KEY_REQUIRED: '--idempotency-key is required',
  INSPECT_SERVICE_NAME_REQUIRED: 'service name is required for inspect',
  NO_PACKAGE_ID: 'INSTALL SERVICE returned no package_id row',
  PUBLISH_BUILD_REQUIRED:
    'publish requires a built service artifact (run `lagrange service build` first)',
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
  if (typeof writeOutput === 'function') {
    await writeOutput(JSON.stringify({
      bindings: result.records.bindings.map((binding) => binding.name),
      entry: entry.outputPath,
      handlers: ir.handlers.map((handler) => handler.id),
      operations: ir.operations.map((operation) => operation.id),
      service: ir.name,
      typings: typings.outputPath,
      written: [entry.outputPath, typings.outputPath, ...written],
    }));
  }
  return {ir, records: result.records};
}

// Stamping the build's real artifact descriptor back into manifest.json
// binds the deployed records to the exact bytes that were validated;
// the manifest validator re-admits the stamped record before it is
// written. The generated bindings pin the digest of that manifest
// (the binding contract's package_id + manifest_digest identity), and
// generate computed them over the pre-build placeholder artifact, so
// the stamp must also restamp every binding target's manifest_digest —
// otherwise CREATE BINDING deterministically rejects the deploy with
// PACKAGE_STATE_CORRUPT for every genuinely built component.
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
  await restampDeploymentBindings(projectDirectory, validation.manifest)
    .catch((error) => {
      throw pipelineFailure(
        SERVICE_PIPELINE_STAGE.BUILD,
        `binding restamp failed: ${error.message}`, error);
    });
  return manifest;
}

async function loadComponentBuilder(componentizeServiceOverride) {
  if (componentizeServiceOverride) {
    return componentizeServiceOverride;
  }
  try {
    const mod = await import('../service/service-component-build.js');
    return mod.buildServiceComponent || mod.componentizeService;
  } catch (error) {
    if (error?.code === ERR_MODULE_NOT_FOUND_CODE ||
        error?.code === SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_COMPILER) {
      throw new ServicePipelineCommandError(
        SERVICE_PIPELINE_COMMAND_ERROR_CODE.MISSING_COMPONENTIZE,
        `MISSING_COMPONENTIZE: ${error.message || error}`,
        {cause: error},
      );
    }
    throw error;
  }
}

function resolveVerifiedBuildEntryPath(projectDirectory) {
  const defaultEntryPath = path.join(projectDirectory, GENERATED_ENTRY_FILE);
  if (fs.existsSync(defaultEntryPath)) {
    return defaultEntryPath;
  }
  const altEntryPath = path.join(projectDirectory, 'generated', 'component-entry.js');
  if (fs.existsSync(altEntryPath)) {
    return altEntryPath;
  }
  const sourcePath = path.join(projectDirectory, SERVICE_MODULE_FILE);
  if (!fs.existsSync(sourcePath)) {
    throw new ServicePipelineCommandError(
      SERVICE_PIPELINE_COMMAND_ERROR_CODE.MISSING_SOURCE,
      `${SERVICE_MODULE_FILE} was not found in ${projectDirectory}`,
    );
  }
  throw new ServicePipelineCommandError(
    SERVICE_PIPELINE_COMMAND_ERROR_CODE.BUILD_FAILED,
    `generated/component-entry.js was not found in ${projectDirectory}; run lagrange service generate before lagrange service build`,
  );
}

async function invokeComponentBuilder(builder, entryPath) {
  try {
    const buildResult = await builder({entryPath, sourcePath: entryPath});
    return buildResult.component;
  } catch (error) {
    if (error instanceof ServiceComponentBuildError) {
      if (error.code === SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_COMPILER ||
          error.code === ERR_MODULE_NOT_FOUND_CODE) {
        throw new ServicePipelineCommandError(
          SERVICE_PIPELINE_COMMAND_ERROR_CODE.MISSING_COMPONENTIZE,
          `MISSING_COMPONENTIZE: ${error.message}`,
          {cause: error},
        );
      }
      throw error;
    }
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.COMPONENTIZE,
      SERVICE_PIPELINE_MESSAGE.COMPONENTIZE_FAILED + error.message,
      error,
    );
  }
}

async function runBuild({
  buildComponent = null,
  componentizeService: componentizeOverride = null,
  createLocalOciLayoutBuilder,
  platform = DEFAULT_PLATFORM,
  projectDirectory,
  sourceDateEpoch = DEFAULT_SOURCE_DATE_EPOCH,
  writeOutput,
} = {}) {
  const entryPath = resolveVerifiedBuildEntryPath(projectDirectory);
  const componentPath = path.join(
    projectDirectory, LAGRANGE_DIRECTORY, COMPONENT_FILE);
  const distComponentPath = path.join(
    projectDirectory, DIST_DIRECTORY_NAME, COMPONENT_FILE);

  const builder = buildComponent || await loadComponentBuilder(componentizeOverride);
  const component = await invokeComponentBuilder(builder, entryPath);
  await mkdir(path.join(projectDirectory, LAGRANGE_DIRECTORY), {recursive: true});
  await writeFile(componentPath, component);
  await mkdir(path.join(projectDirectory, DIST_DIRECTORY_NAME), {recursive: true});
  await writeFile(distComponentPath, component);

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
  if (typeof writeOutput === 'function') {
    await writeOutput(JSON.stringify({
      component: componentPath,
      digest: descriptor.digest,
      sizeBytes: descriptor.sizeBytes,
    }));
  }
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

const PUBLISH_SQL = 'PUBLISH SERVICE ARTIFACT $1';
const RECEIPT_FILE = 'publish-receipt.json';

async function executeDeployStatement(execute, statement, payload, stage) {
  try {
    return await execute(statement, [JSON.stringify(payload)]);
  } catch (error) {
    throw pipelineFailure(
      stage, `${statement.split(SQL_PARAMETER_SUFFIX)[0]} rejected: ${error.message}`,
      error);
  }
}

async function runPublish({
  createSqlClient,
  projectDirectory,
  writeOutput,
}) {
  const stage = SERVICE_PIPELINE_STAGE.BUILD;
  const manifestPath = deploymentFile(projectDirectory, MANIFEST_FILE);
  const manifest = await readJsonFile(manifestPath, stage);
  if (manifest.artifact?.digest === PLACEHOLDER_DIGEST) {
    throw pipelineFailure(
      stage,
      SERVICE_PIPELINE_MESSAGE.PUBLISH_BUILD_REQUIRED,
    );
  }
  const componentPath = path.join(
    projectDirectory, LAGRANGE_DIRECTORY, COMPONENT_FILE);
  let componentBytes;
  try {
    componentBytes = await readFile(componentPath);
  } catch (error) {
    throw pipelineFailure(
      stage,
      `cannot read built component ${componentPath}: ${error.message}`,
      error,
    );
  }
  const bindings = await readJsonFile(
    deploymentFile(projectDirectory, BINDINGS_FILE), stage);
  const accessPolicies = await readJsonFile(
    deploymentFile(projectDirectory, ACCESS_POLICY_FILE), stage);

  const payloadDigest = `sha256:${createHash('sha256').update(componentBytes).digest('hex')}`;
  const artifactDigest = manifest.artifact.digest;
  const manifestDigest = sha256Json(canonicalJson(manifest));

  const sqlClient = createSqlClient();
  const execute = (statement, parameters) =>
    sqlClient.execute(statement, parameters);

  const publishPayload = {
    artifact_digest: artifactDigest,
    bytes: componentBytes.toString('base64'),
    manifest,
    media_type: manifest.artifact.media_type || 'application/wasm',
    payload_digest: payloadDigest,
    total_size: componentBytes.length,
  };

  await executeDeployStatement(
    execute,
    PUBLISH_SQL,
    publishPayload,
    stage,
  );

  const packageId = deriveTenantPackageId(manifest, 'default');
  const receipt = {
    accessPolicies,
    artifactDigest,
    bindings,
    config: {},
    manifest,
    manifestDigest,
    packageId,
    service: manifest.name,
  };

  const receiptPath = path.join(
    projectDirectory, LAGRANGE_DIRECTORY, RECEIPT_FILE);
  await writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, JSON_INDENT)}\n`,
    TEXT_ENCODING,
  );

  if (typeof writeOutput === 'function') {
    await writeOutput(JSON.stringify({
      artifactDigest,
      manifestDigest,
      packageId,
      receipt: receiptPath,
      service: manifest.name,
    }));
  }
  return receipt;
}

async function resolveDeployRegistration(registration, candidate, stage) {
  if (registration) return registration;
  if (!candidate) return null;
  const receiptPath = candidate.endsWith('.json') ?
    candidate :
    path.join(candidate, LAGRANGE_DIRECTORY, RECEIPT_FILE);
  try {
    return JSON.parse(await readFile(receiptPath, TEXT_ENCODING));
  } catch (_receiptError) {
    try {
      const manifestCandidate = await readJsonFile(
        deploymentFile(candidate, MANIFEST_FILE), stage);
      const bindingsCandidate = await readJsonFile(
        deploymentFile(candidate, BINDINGS_FILE), stage);
      const policiesCandidate = await readJsonFile(
        deploymentFile(candidate, ACCESS_POLICY_FILE), stage);
      return {
        accessPolicies: policiesCandidate,
        bindings: bindingsCandidate,
        manifest: manifestCandidate,
      };
    } catch (_candidateError) {
      return null;
    }
  }
}

function assertDeployRegistration(effectiveManifest, effectiveBindings, stage) {
  if (!effectiveManifest || !effectiveBindings) {
    throw pipelineFailure(
      stage,
      SERVICE_PIPELINE_MESSAGE.DEPLOY_REGISTRATION_REQUIRED,
    );
  }
  if (effectiveManifest.artifact?.digest === PLACEHOLDER_DIGEST) {
    throw pipelineFailure(
      stage,
      SERVICE_PIPELINE_MESSAGE.DEPLOY_BUILD_REQUIRED,
    );
  }
}

async function createBindings(execute, effectiveBindings, packageId, stage) {
  const created = [];
  for (const binding of effectiveBindings) {
    await executeDeployStatement(
      execute, DEPLOY_SQL.CREATE_BINDING, withPackageId(binding, packageId),
      stage);
    created.push(binding.name);
  }
  return created;
}

function resolveEffectiveRegistration(deployRegistration, options) {
  const reg = deployRegistration || {};
  return {
    accessPolicies: reg.accessPolicies || options.accessPolicies || [],
    bindings: reg.bindings || options.bindings || null,
    config: options.config || reg.config || {},
    manifest: reg.manifest || options.manifest || null,
  };
}

function resolveDeployPackageId(installed, deployRegistration, optionsPackageId) {
  const rowPackageId = installed.rows?.[0]?.package_id;
  const packageId = rowPackageId ||
    deployRegistration?.packageId ||
    optionsPackageId ||
    null;
  if (typeof packageId !== PACKAGE_ID_TYPE) {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.DEPLOY,
      SERVICE_PIPELINE_MESSAGE.NO_PACKAGE_ID,
    );
  }
  return packageId;
}

async function runDeploy(options = {}) {
  const idempotencyKey = options.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw pipelineFailure(
      SERVICE_PIPELINE_STAGE.DEPLOY,
      SERVICE_PIPELINE_MESSAGE.IDEMPOTENCY_KEY_REQUIRED);
  }
  const stage = SERVICE_PIPELINE_STAGE.DEPLOY;
  const candidate = options.target || options.projectDirectory || null;
  const deployRegistration = await resolveDeployRegistration(
    options.registration, candidate, stage);

  const effective = resolveEffectiveRegistration(deployRegistration, options);
  assertDeployRegistration(effective.manifest, effective.bindings, stage);

  const sqlClient = options.createSqlClient();
  const execute = (statement, parameters) =>
    sqlClient.execute(statement, parameters);

  const installed = await executeDeployStatement(
    execute, DEPLOY_SQL.INSTALL, {
      config: effective.config,
      idempotency_key: idempotencyKey,
      manifest: effective.manifest,
    }, stage);
  const packageId = resolveDeployPackageId(
    installed, deployRegistration, options.packageId);

  const created = await createBindings(
    execute, effective.bindings, packageId, stage);
  const configured = await configureAccessPolicies(
    execute, effective.bindings, effective.accessPolicies, stage);
  if (typeof options.writeOutput === 'function') {
    await options.writeOutput(JSON.stringify({
      bindings: created,
      packageId,
      policies: configured,
      service: effective.manifest.name,
    }));
  }
  return {
    bindings: created,
    packageId,
    policies: configured,
    service: effective.manifest.name,
  };
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

const INSPECT_SQL = 'SHOW SERVICE $1';

async function readServiceNameFromReceipt(receiptPath) {
  try {
    const parsed = JSON.parse(await readFile(receiptPath, TEXT_ENCODING));
    return parsed.service || parsed.manifest?.name || null;
  } catch (_receiptError) {
    return null;
  }
}

function resolveRegistrationServiceName(serviceName, registration) {
  if (serviceName) return serviceName;
  if (registration?.service) return registration.service;
  return registration?.manifest?.name || null;
}

function resolveCandidateReceiptPath(candidate) {
  if (candidate.endsWith(JSON_EXTENSION)) return candidate;
  return path.join(candidate, LAGRANGE_DIRECTORY, RECEIPT_FILE);
}

async function resolveInspectServiceName(
  serviceName,
  registration,
  candidate,
  stage,
) {
  const resolved = resolveRegistrationServiceName(serviceName, registration);
  if (resolved) return resolved;
  if (!candidate) return null;
  const receiptPath = resolveCandidateReceiptPath(candidate);
  const fromReceipt = await readServiceNameFromReceipt(receiptPath);
  if (fromReceipt) return fromReceipt;
  try {
    const manifestCandidate = await readJsonFile(
      deploymentFile(candidate, MANIFEST_FILE), stage);
    return manifestCandidate?.name || path.basename(candidate);
  } catch (_manifestError) {
    return path.basename(candidate);
  }
}

function isInspectReady(statusRow) {
  return statusRow?.rollout_state === ACTIVE_STATE ||
    statusRow?.desired_state === ACTIVE_STATE;
}

async function runInspect(options = {}) {
  const stage = SERVICE_PIPELINE_STAGE.INSPECT;
  const candidate = options.target || options.projectDirectory || null;
  const effectiveName = await resolveInspectServiceName(
    options.serviceName, options.registration, candidate, stage);
  if (!effectiveName) {
    throw pipelineFailure(
      stage,
      SERVICE_PIPELINE_MESSAGE.INSPECT_SERVICE_NAME_REQUIRED,
    );
  }

  const sqlClient = options.createSqlClient();
  const result = await executeDeployStatement(
    (statement, parameters) => sqlClient.execute(statement, parameters),
    INSPECT_SQL,
    {service_name: effectiveName},
    stage,
  );
  const rows = result?.rows || [];
  const statusRow = rows[0] || null;
  const ready = isInspectReady(statusRow);
  const inspection = {
    ready,
    row: statusRow,
    rows,
    service: effectiveName,
  };
  if (typeof options.writeOutput === 'function') {
    await options.writeOutput(JSON.stringify(inspection));
  }
  return inspection;
}

export {
  SERVICE_PIPELINE_COMMAND_ERROR_CODE,
  runBuild,
  runDeploy,
  runGenerate,
  runInspect,
  runPublish,
};
