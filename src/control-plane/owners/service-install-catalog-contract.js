import {createHash} from 'node:crypto';

import {TABLES} from '../../constants/index.js';
import {normalizeExternalServiceManifest} from
  '../../service/external-service-manifest.js';

const SERVICE_INSTALL_DESIRED_STATE = Object.freeze({
  ACTIVE: 'active',
  INSTALLED: 'installed',
  REMOVED: 'removed',
});

const SERVICE_INSTALL_ROLLOUT_STATE = Object.freeze({
  CONVERGED: 'converged',
  FAILED: 'failed',
  PENDING: 'pending',
  RECONCILING: 'reconciling',
  RECORDED_NOT_RUNNING: 'recorded_not_running',
  REMOVED: 'removed',
  REMOVING: 'removing',
});

const SERVICE_INSTALL_FAILURE_CODE = Object.freeze({
  ACTIVATION_UNSUPPORTED: 'activation_unsupported',
  ARTIFACT_REJECTED: 'artifact_rejected',
  AUTHORIZATION_DENIED: 'authorization_denied',
  CAPABILITY_DENIED: 'capability_denied',
  COMPATIBILITY_REJECTED: 'compatibility_rejected',
  DEPENDENCY_UNSATISFIED: 'dependency_unsatisfied',
  HEALTH_CHECK_FAILED: 'health_check_failed',
  MANIFEST_REJECTED: 'manifest_rejected',
  RECONCILIATION_FAILED: 'reconciliation_failed',
  ROLLOUT_TIMEOUT: 'rollout_timeout',
});

const SERVICE_INSTALL_FAILURE_PHASE = Object.freeze({
  ACTIVATION: 'activation',
  ADMISSION: 'admission',
  HEALTH: 'health',
  RECONCILIATION: 'reconciliation',
  REMOVAL: 'removal',
  RESOLUTION: 'resolution',
  VALIDATION: 'validation',
});

const SERVICE_INSTALL_CATALOG_ERROR_CODE = Object.freeze({
  ACTUAL_STATE_FIELD_FORBIDDEN: 'actual_state_field_forbidden',
  AMBIGUOUS_ARTIFACT_DIGEST: 'ambiguous_artifact_digest',
  ARTIFACT_NOT_ANALYZABLE: 'artifact_not_analyzable',
  ARTIFACT_NOT_RESOLVED: 'artifact_not_resolved',
  CONCURRENT_MODIFICATION: 'concurrent_catalog_modification',
  CORRUPT_RECORD: 'corrupt_catalog_record',
  FAILURE_CONFLICT: 'failure_conflict',
  INSTALLATION_CONFLICT: 'installation_conflict',
  INSTALLATION_NOT_FOUND: 'installation_not_found',
  INVALID_FIELD: 'invalid_field',
  INVALID_TRANSITION: 'invalid_rollout_transition',
  OPERATION_CONFLICT: 'operation_conflict',
  PACKAGE_CONFLICT: 'package_conflict',
  PACKAGE_NOT_FOUND: 'package_not_found',
  REVISION_CONFLICT: 'revision_conflict',
  REVISION_NOT_FOUND: 'revision_not_found',
});

const SERVICE_INSTALL_CATALOG_OWNER_NAME = Object.freeze({
  CATALOG: 'service-install-catalog-owner',
  ENDPOINTS: 'service-endpoints-owner',
  FAILURES: 'service-install-failures-owner',
  INSTALLATIONS: 'service-installations-owner',
  PACKAGES: 'service-install-packages-owner',
  REVISIONS: 'service-install-revisions-owner',
  SERVICE_DEFINITIONS: 'service-definitions-owner',
  SERVICES: 'services-owner',
});

const SERVICE_INSTALL_CATALOG_PATH = Object.freeze({
  ARTIFACT_DIGEST: '/artifactDigest',
  BINDABLE_ARTIFACT: '/bindableArtifact',
  ELIGIBLE_PACKAGE_IDS: '/eligiblePackageIds',
  FAILURE: '/failure',
  FAILURE_ID: '/failure/failureId',
  FAILURE_INSTALLATION_ID: '/failure/installationId',
  FAILURE_RETRYABLE: '/failure/retryable',
  GATEWAY: '/gateway',
  INSTALLATION: '/installation',
  INSTALLATION_ID: '/installation/installationId',
  INSTALLATION_OPERATION_ID: '/installation/operationId',
  INSTALLATION_REVISION_ID: '/installation/revisionId',
  NOW: '/now',
  PACKAGE: '/package',
  PACKAGE_ID: '/package/packageId',
  PACKAGE_MANIFEST: '/package/manifest',
  PACKAGE_MANIFEST_DIGEST: '/package/manifestDigest',
  PACKAGE_MANIFEST_ARTIFACT_MEDIA_TYPE:
    '/package/manifest/artifact/media_type',
  PACKAGE_MANIFEST_ARTIFACT_REF: '/package/manifest/artifact/ref',
  PACKAGE_MANIFEST_NAME: '/package/manifest/name',
  PACKAGE_MANIFEST_RUNTIME_KIND: '/package/manifest/runtime/kind',
  PACKAGE_MANIFEST_VERSION: '/package/manifest/version',
  PACKAGE_RESOLVED_ARTIFACT: '/package/resolvedArtifact',
  REVISION: '/revision',
  REVISION_ID: '/revision/revisionId',
  REVISION_PACKAGE_ID: '/revision/packageId',
  ROLLOUT: '/rollout',
  ROLLOUT_INSTALLATION_ID: '/rollout/installationId',
  ROLLOUT_STATE: '/rollout/rolloutState',
});

const SERVICE_INSTALL_CATALOG_MESSAGE = Object.freeze({
  ACTUAL_STATE_OWNED_ELSEWHERE:
    'actual service state belongs to canonical runtime owners',
  ARTIFACT_DIGEST_AMBIGUOUS:
    'OCI artifact digest does not identify one installed declaration',
  ARTIFACT_NOT_ANALYZABLE:
    'only schema-v2 artifact declarations are bindable',
  ARTIFACT_MISMATCH:
    'resolved artifact must match the normalized manifest and signature policy',
  ARTIFACT_REQUIRED: 'verified artifact resolution is required',
  CLOCK_INVALID: 'catalog clock must return a non-negative safe integer',
  CONCURRENT_INSTALLATION_UPDATE:
    'installation changed during the catalog mutation',
  FAILURE_IMMUTABLE: 'failure identity is immutable',
  FAILURE_REQUIRES_RECORD: 'failed rollout requires a typed failure record',
  GATEWAY_OPERATION_LOOKUP_FAILED: 'authoritative operation lookup failed',
  GATEWAY_OPERATION_LOOKUP_INVALID:
    'authoritative operation lookup returned a malformed result',
  GATEWAY_READ_INVALID:
    'authoritative catalog read returned a malformed record',
  GATEWAY_WRITE_INVALID:
    'authoritative catalog write returned a malformed result',
  INSTALLATION_IMMUTABLE:
    'installation intent cannot be changed by replay',
  INSTALLATION_MISSING: 'installation does not exist',
  INSTALLATION_STATE_CORRUPT:
    'durable installation state is outside the catalog contract',
  MANIFEST_REQUIRED: 'a normalized external manifest is required',
  MANIFEST_NOT_NORMALIZED:
    'external manifest must match its canonical normalized form',
  PACKAGE_ELIGIBILITY_DUPLICATE:
    'eligible package identities must be unique',
  PACKAGE_ELIGIBILITY_REQUIRED:
    'authenticated eligible package identities are required',
  PACKAGE_STATE_CORRUPT:
    'durable package state is outside the catalog contract',
  OPERATION_CONFLICT: 'operation identity is already in use',
  PACKAGE_IMMUTABLE: 'package identity is immutable',
  PACKAGE_MISSING: 'package does not exist',
  RETRYABLE_BOOLEAN: 'retryable must be boolean',
  REVISION_IMMUTABLE: 'revision identity is immutable',
  REVISION_MISSING: 'revision does not exist',
  ROLLOUT_TRANSITION_INVALID: 'rollout transition is not allowed',
});

const SERVICE_INSTALL_CATALOG_LITERAL = Object.freeze({
  ERROR_NAME: 'ServiceInstallCatalogError',
  HASH_ALGORITHM: 'sha256',
  HASH_ENCODING: 'hex',
  RESOLVED: 'resolved',
});

const SIGNATURE_STATUS = Object.freeze([
  'unsigned_allowed',
  'verification_disabled',
  'verified',
]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BINDABLE_MANIFEST_SCHEMA_VERSION = 2;
const MAX_IDENTIFIER_LENGTH = 256;
const FORBIDDEN_ACTUAL_FIELDS = new Set([
  'actualState', 'actual_state', 'address', 'endpoint', 'endpoints',
  'health', 'healthStatus', 'health_status', 'nodeId', 'node_id',
  'raftRole', 'raft_role', 'replicaId', 'replica_id', 'running',
  'runtimeProcess', 'runtime_process', 'status',
]);

const PACKAGE_FIELDS = Object.freeze([
  'packageId', 'manifest', 'resolvedArtifact',
]);
const REVISION_FIELDS = Object.freeze(['revisionId', 'packageId', 'config']);
const INSTALLATION_FIELDS = Object.freeze([
  'desiredState', 'installationId', 'operationId', 'revisionId',
  'serviceDefinitionId',
]);
const ROLLOUT_FIELDS = Object.freeze(['installationId', 'rolloutState']);
const FAILURE_FIELDS = Object.freeze([
  'failureCode', 'failureId', 'failurePhase', 'installationId', 'retryable',
]);

const PACKAGE_IDENTITY_FIELDS = Object.freeze([
  'package_id', 'package_name', 'package_version', 'manifest_schema_version',
  'runtime_kind', 'artifact_ref', 'artifact_digest', 'artifact_media_type',
  'payload_media_type', 'signature_status', 'normalized_manifest',
]);
const PACKAGE_STORED_STRING_FIELDS = Object.freeze([
  'artifact_media_type',
  'artifact_ref',
  'normalized_manifest',
  'package_id',
  'package_name',
  'package_version',
  'payload_media_type',
  'runtime_kind',
  'signature_status',
]);
const REVISION_IDENTITY_FIELDS = Object.freeze([
  'revision_id', 'package_id', 'artifact_digest', 'config_digest',
  'normalized_config',
]);
const INSTALLATION_INTENT_FIELDS = Object.freeze([
  'installation_id', 'revision_id', 'service_definition_id', 'desired_state',
  'operation_id',
]);
const FAILURE_IDENTITY_FIELDS = Object.freeze([
  'failure_id', 'installation_id', 'revision_id', 'failure_code',
  'failure_phase', 'retryable',
]);

const ROLLOUT_TRANSITIONS = Object.freeze({
  [SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
    SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    SERVICE_INSTALL_ROLLOUT_STATE.REMOVING,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.PENDING]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
    SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    SERVICE_INSTALL_ROLLOUT_STATE.REMOVING,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.FAILED]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
    SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
    SERVICE_INSTALL_ROLLOUT_STATE.REMOVING,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.REMOVING]: Object.freeze([
    SERVICE_INSTALL_ROLLOUT_STATE.REMOVED,
  ]),
  [SERVICE_INSTALL_ROLLOUT_STATE.REMOVED]: Object.freeze([]),
});

class ServiceInstallCatalogError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = SERVICE_INSTALL_CATALOG_LITERAL.ERROR_NAME;
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ServiceInstallCatalogError(code, path, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertShape(value, allowedFields, path) {
  if (!isPlainObject(value)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must be a plain object`);
  }
  for (const field of Object.keys(value)) {
    if (FORBIDDEN_ACTUAL_FIELDS.has(field)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.ACTUAL_STATE_FIELD_FORBIDDEN,
        `${path}/${field}`,
        SERVICE_INSTALL_CATALOG_MESSAGE.ACTUAL_STATE_OWNED_ELSEWHERE);
    }
    if (!allowedFields.includes(field)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
        `${path}/${field}`, `unsupported catalog field: ${field}`);
    }
  }
}

function isCanonicalIdentifier(value) {
  return typeof value === 'string' && value.trim() === value &&
    value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH &&
    !/\s/.test(value);
}

function requireIdentifier(value, path) {
  if (!isCanonicalIdentifier(value)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must be a bounded non-whitespace identifier`);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must be a non-empty string`);
  }
  return value;
}

function requireDigest(value, path) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must be a canonical sha256 digest`);
  }
  return value;
}

function requireEligiblePackageIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
      SERVICE_INSTALL_CATALOG_PATH.ELIGIBLE_PACKAGE_IDS,
      SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_ELIGIBILITY_REQUIRED);
  }
  const eligible = new Set(value.map((packageId) =>
    requireIdentifier(packageId, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_ID)));
  if (eligible.size !== value.length) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
      SERVICE_INSTALL_CATALOG_PATH.ELIGIBLE_PACKAGE_IDS,
      SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_ELIGIBILITY_DUPLICATE);
  }
  return eligible;
}

function requireEnum(value, enumObject, path) {
  if (!Object.values(enumObject).includes(value)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} is unsupported`);
  }
  return value;
}

function normalizeJson(value, path, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must contain JSON values only`);
  }
  if (seen.has(value)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
      `${path} must not contain cycles`);
  }
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((entry, index) =>
      normalizeJson(entry, `${path}/${index}`, seen));
  } else {
    if (!isPlainObject(value)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD, path,
        `${path} must contain plain JSON objects only`);
    }
    normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJson(value[key], `${path}/${key}`, seen);
    }
  }
  seen.delete(value);
  return normalized;
}

function canonicalJson(value, path) {
  return JSON.stringify(normalizeJson(value, path));
}

function sha256Json(canonicalValue) {
  const digest = createHash(SERVICE_INSTALL_CATALOG_LITERAL.HASH_ALGORITHM)
    .update(canonicalValue)
    .digest(SERVICE_INSTALL_CATALOG_LITERAL.HASH_ENCODING);
  return `sha256:${digest}`;
}

function requireNormalizedManifest(value) {
  if (!isPlainObject(value) || !isPlainObject(value.artifact) ||
      !isPlainObject(value.runtime)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST,
      SERVICE_INSTALL_CATALOG_MESSAGE.MANIFEST_REQUIRED);
  }
  const normalized = normalizeExternalServiceManifest(value);
  if (!normalized?.manifest) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST,
      SERVICE_INSTALL_CATALOG_MESSAGE.MANIFEST_REQUIRED);
  }
  if (canonicalJson(value, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST) !==
      canonicalJson(
        normalized.manifest, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST,
      SERVICE_INSTALL_CATALOG_MESSAGE.MANIFEST_NOT_NORMALIZED);
  }
  return normalized.manifest;
}

function requireResolvedArtifact(manifest, value) {
  if (!isPlainObject(value) ||
      value.status !== SERVICE_INSTALL_CATALOG_LITERAL.RESOLVED ||
      !isPlainObject(value.artifact)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_RESOLVED,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_RESOLVED_ARTIFACT,
      SERVICE_INSTALL_CATALOG_MESSAGE.ARTIFACT_REQUIRED);
  }
  const artifact = value.artifact;
  const matchesManifest = SHA256_PATTERN.test(manifest.artifact.digest) &&
    artifact.digest === manifest.artifact.digest &&
    artifact.payloadMediaType === manifest.artifact.media_type;
  const signatureAccepted = SIGNATURE_STATUS.includes(artifact.signature?.status);
  if (!matchesManifest || !signatureAccepted) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_RESOLVED,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_RESOLVED_ARTIFACT,
      SERVICE_INSTALL_CATALOG_MESSAGE.ARTIFACT_MISMATCH);
  }
  return artifact;
}

function buildPackageRow(request, timestamp) {
  const manifest = requireNormalizedManifest(request.manifest);
  const artifact = requireResolvedArtifact(manifest, request.resolvedArtifact);
  return {
    package_id: requireIdentifier(
      request.packageId, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_ID),
    package_name: requireString(
      manifest.name, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_NAME),
    package_version: requireString(
      manifest.version, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_VERSION),
    manifest_schema_version: manifest.schema_version,
    runtime_kind: requireString(manifest.runtime.kind,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_RUNTIME_KIND),
    artifact_ref: requireString(manifest.artifact.ref,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_ARTIFACT_REF),
    artifact_digest: manifest.artifact.digest,
    artifact_media_type: requireString(manifest.artifact.media_type,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_ARTIFACT_MEDIA_TYPE),
    payload_media_type: artifact.payloadMediaType,
    signature_status: artifact.signature.status,
    normalized_manifest: canonicalJson(
      manifest, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function sameFields(left, right, fields) {
  return fields.every((field) => left?.[field] === right?.[field]);
}

function createActualStateReferences(serviceDefinitionId) {
  return deepFreeze({
    serviceDefinition: {
      owner: SERVICE_INSTALL_CATALOG_OWNER_NAME.SERVICE_DEFINITIONS,
      table: TABLES.SERVICE_DEFINITIONS,
      serviceDefinitionId,
    },
    serviceInstances: {
      owner: SERVICE_INSTALL_CATALOG_OWNER_NAME.SERVICES,
      table: TABLES.SERVICES,
      serviceDefinitionId,
    },
    serviceEndpoints: {
      owner: SERVICE_INSTALL_CATALOG_OWNER_NAME.ENDPOINTS,
      table: TABLES.SERVICE_ENDPOINTS,
      serviceDefinitionId,
    },
  });
}

function packageRowHasInspectableFields(row) {
  return isPlainObject(row) && PACKAGE_STORED_STRING_FIELDS.every(
    (field) => typeof row[field] === 'string' && row[field].length > 0,
  ) && isCanonicalIdentifier(row.package_id) &&
    Number.isSafeInteger(row.manifest_schema_version) &&
    Number.isSafeInteger(row.created_at) && row.created_at >= 0 &&
    Number.isSafeInteger(row.updated_at) && row.updated_at >= row.created_at &&
    SHA256_PATTERN.test(row.artifact_digest);
}

function parseCanonicalPackageManifest(normalizedManifest) {
  try {
    const manifest = JSON.parse(normalizedManifest);
    const canonical = canonicalJson(
      manifest, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST);
    return {canonical, manifest};
  } catch (_error) {
    return null;
  }
}

function packageManifestMatchesRow(manifest, row) {
  if (!isPlainObject(manifest) || !isPlainObject(manifest.artifact) ||
      !isPlainObject(manifest.runtime)) return false;
  return [
    [manifest.schema_version, row.manifest_schema_version],
    [manifest.name, row.package_name],
    [manifest.version, row.package_version],
    [manifest.runtime.kind, row.runtime_kind],
    [manifest.artifact.ref, row.artifact_ref],
    [manifest.artifact.digest, row.artifact_digest],
    [manifest.artifact.media_type, row.artifact_media_type],
    [row.payload_media_type, row.artifact_media_type],
  ].every(([manifestValue, rowValue]) => manifestValue === rowValue) &&
    SIGNATURE_STATUS.includes(row.signature_status);
}

function inspectPackageRow(row) {
  const parsed = packageRowHasInspectableFields(row) ?
    parseCanonicalPackageManifest(row.normalized_manifest) : null;
  const normalized = parsed ?
    normalizeExternalServiceManifest(parsed.manifest) : null;
  const normalizedCanonical = normalized?.manifest ? canonicalJson(
    normalized.manifest, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST) : null;
  if (!parsed || parsed.canonical !== row.normalized_manifest ||
      normalizedCanonical !== row.normalized_manifest ||
      !packageManifestMatchesRow(normalized.manifest, row)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST,
      SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_STATE_CORRUPT);
  }
  return deepFreeze({
    manifest: normalized.manifest,
    manifestDigest: sha256Json(parsed.canonical),
  });
}

function projectPackage(row) {
  const inspected = inspectPackageRow(row);
  return deepFreeze({
    packageId: row.package_id,
    name: row.package_name,
    version: row.package_version,
    manifestSchemaVersion: row.manifest_schema_version,
    manifestDigest: inspected.manifestDigest,
    runtimeKind: row.runtime_kind,
    artifactDigest: row.artifact_digest,
    signatureStatus: row.signature_status,
  });
}

function projectBindableArtifact(row, expectedManifestDigest = null) {
  const inspected = inspectPackageRow(row);
  if (expectedManifestDigest !== null &&
      inspected.manifestDigest !== expectedManifestDigest) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
      SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_DIGEST,
      SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_STATE_CORRUPT);
  }
  if (row.manifest_schema_version !== BINDABLE_MANIFEST_SCHEMA_VERSION) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_ANALYZABLE,
      SERVICE_INSTALL_CATALOG_PATH.BINDABLE_ARTIFACT,
      SERVICE_INSTALL_CATALOG_MESSAGE.ARTIFACT_NOT_ANALYZABLE);
  }
  return deepFreeze({
    packageId: row.package_id,
    manifestDigest: inspected.manifestDigest,
    artifactDigest: row.artifact_digest,
    manifest: inspected.manifest,
  });
}

function projectRevision(row) {
  return deepFreeze({
    revisionId: row.revision_id,
    packageId: row.package_id,
    artifactDigest: row.artifact_digest,
    configDigest: row.config_digest,
  });
}

function assertInstallationRecord(row) {
  if (!row || !Object.values(SERVICE_INSTALL_DESIRED_STATE)
    .includes(row.desired_state) ||
      !Object.values(SERVICE_INSTALL_ROLLOUT_STATE)
        .includes(row.rollout_state)) {
    fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
      SERVICE_INSTALL_CATALOG_PATH.INSTALLATION,
      SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_STATE_CORRUPT);
  }
}

function projectInstallation(row) {
  assertInstallationRecord(row);
  return deepFreeze({
    installationId: row.installation_id,
    revisionId: row.revision_id,
    serviceDefinitionId: row.service_definition_id,
    desiredState: row.desired_state,
    rolloutState: row.rollout_state,
    operationId: row.operation_id,
    latestFailureId: row.latest_failure_id || null,
    actualStateReferences:
      createActualStateReferences(row.service_definition_id),
  });
}

function projectFailure(row) {
  return deepFreeze({
    failureId: row.failure_id,
    installationId: row.installation_id,
    revisionId: row.revision_id,
    code: row.failure_code,
    phase: row.failure_phase,
    retryable: row.retryable === 1,
    occurredAt: row.occurred_at,
  });
}

export {
  FAILURE_FIELDS,
  FAILURE_IDENTITY_FIELDS,
  INSTALLATION_FIELDS,
  INSTALLATION_INTENT_FIELDS,
  PACKAGE_FIELDS,
  PACKAGE_IDENTITY_FIELDS,
  REVISION_FIELDS,
  REVISION_IDENTITY_FIELDS,
  ROLLOUT_FIELDS,
  ROLLOUT_TRANSITIONS,
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  SERVICE_INSTALL_CATALOG_MESSAGE,
  SERVICE_INSTALL_CATALOG_OWNER_NAME,
  SERVICE_INSTALL_CATALOG_PATH,
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
  ServiceInstallCatalogError,
  assertInstallationRecord,
  assertShape,
  buildPackageRow,
  canonicalJson,
  deepFreeze,
  fail,
  isPlainObject,
  projectFailure,
  projectInstallation,
  projectBindableArtifact,
  projectPackage,
  projectRevision,
  requireEnum,
  requireDigest,
  requireEligiblePackageIds,
  requireIdentifier,
  sameFields,
  sha256Json,
};
