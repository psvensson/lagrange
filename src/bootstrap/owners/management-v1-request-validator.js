import {createHash, timingSafeEqual} from 'node:crypto';
import {HTTP_STATUS} from '../../constants/index.js';
import {
  ALLOWED_MANAGEMENT_OPERATION_KINDS,
  FORBIDDEN_MANAGEMENT_OPERATION_KINDS,
  MANAGEMENT_ERROR_CODE,
  MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_V1_CONTRACT,
} from './management-v1-constants.js';

const MANAGEMENT_OPERATION_ERROR_NAME = 'ManagementOperationError';
const DIGEST_ALGORITHM_SHA256 = 'sha256';
const DIGEST_ENCODING_HEX = 'hex';
const MAX_REQUESTED_BY_LENGTH = 128;
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

const ALLOWED_ENVELOPE_KEYS = new Set([
  'schemaVersion',
  'operationId',
  'clusterId',
  'sequence',
  'kind',
  'parameters',
  'protocolVersion',
  'capabilityVersion',
  'createdAtMs',
  'expiresAtMs',
  'requestedBy',
  'requestDigest',
  'sourceContract',
  'sourceContractVersion',
]);

const ALLOWED_PARAMS = Object.freeze({
  [MANAGEMENT_OPERATION_KIND.NOOP]: ['reason'],
  [MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE]: ['targetVersion', 'targetArtifactDigest'],
  [MANAGEMENT_OPERATION_KIND.CREATE_BACKUP]: ['backupId', 'destinationUri'],
  [MANAGEMENT_OPERATION_KIND.DECOMMISSION_NODE]: ['lagrangeNodeId'],
});

class ManagementOperationError extends Error {
  constructor(code, message = code, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message);
    this.name = MANAGEMENT_OPERATION_ERROR_NAME;
    this.code = code;
    this.status = statusCode;
    this.statusCode = statusCode;
  }
}

function failValidation(code, status = HTTP_STATUS.BAD_REQUEST) {
  throw new ManagementOperationError(code, code, status);
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

function computeCanonicalOperationDigest(e) {
  const p = e?.parameters ?? {};
  const s = {};
  for (const k of Object.keys(p).sort()) s[k] = p[k];
  const obj = {
    schemaVersion: e.schemaVersion,
    operationId: e.operationId,
    clusterId: e.clusterId,
    sequence: e.sequence,
    kind: e.kind,
    parameters: s,
    protocolVersion: e.protocolVersion,
    capabilityVersion: e.capabilityVersion,
    createdAtMs: e.createdAtMs,
    expiresAtMs: e.expiresAtMs,
    requestedBy: e.requestedBy,
  };
  return createHash(DIGEST_ALGORITHM_SHA256)
    .update(JSON.stringify(obj))
    .digest(DIGEST_ENCODING_HEX);
}

function isBoundedString(v, min, max) {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

function isMinSafeInteger(v, min) {
  return Number.isSafeInteger(v) && v >= min;
}

function checkVersionField(val, expected, code) {
  if (val !== undefined && val !== expected) failValidation(code, HTTP_STATUS.CONFLICT);
}

function validateEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    failValidation(MANAGEMENT_ERROR_CODE.OPERATION_TYPE_INVALID);
  }
  for (const k of Object.keys(input)) {
    if (!ALLOWED_ENVELOPE_KEYS.has(k)) {
      failValidation(MANAGEMENT_ERROR_CODE.OPERATION_UNKNOWN_FIELD);
    }
  }
  const c = MANAGEMENT_V1_CONTRACT;
  const e = MANAGEMENT_ERROR_CODE;
  if (input.schemaVersion !== c.SCHEMA_VERSION) {
    failValidation(e.OPERATION_SCHEMA_UNSUPPORTED, HTTP_STATUS.CONFLICT);
  }
  checkVersionField(input.sourceContract, c.SOURCE_CONTRACT, e.OPERATION_CONTRACT_UNSUPPORTED);
  checkVersionField(
    input.sourceContractVersion,
    c.SOURCE_CONTRACT_VERSION,
    e.OPERATION_CONTRACT_UNSUPPORTED,
  );
  checkVersionField(input.protocolVersion, c.PROTOCOL_VERSION, e.OPERATION_PROTOCOL_UNSUPPORTED);
  checkVersionField(
    input.capabilityVersion,
    c.CAPABILITY_VERSION,
    e.OPERATION_CAPABILITY_VERSION_UNSUPPORTED,
  );
}

function validateCore(input) {
  const c = MANAGEMENT_V1_CONTRACT;
  const e = MANAGEMENT_ERROR_CODE;
  if (typeof input.kind !== 'string') failValidation(e.OPERATION_VALUE_INVALID);
  if (FORBIDDEN_MANAGEMENT_OPERATION_KINDS.includes(input.kind)) {
    failValidation(e.OPERATION_KIND_FORBIDDEN);
  }
  if (!ALLOWED_MANAGEMENT_OPERATION_KINDS.includes(input.kind)) {
    failValidation(e.OPERATION_KIND_UNSUPPORTED);
  }
  const ok =
    isBoundedString(input.operationId, c.MIN_OPERATION_ID_LENGTH, c.MAX_OPERATION_ID_LENGTH) &&
    isBoundedString(input.clusterId, c.MIN_CLUSTER_ID_LENGTH, c.MAX_CLUSTER_ID_LENGTH) &&
    typeof input.requestDigest === 'string' &&
    input.requestDigest.length === c.REQUEST_DIGEST_HEX_LENGTH &&
    HEX_64_REGEX.test(input.requestDigest);
  if (!ok) failValidation(e.OPERATION_VALUE_INVALID);
}

function validateDeployBackupParams(kind, p) {
  const c = MANAGEMENT_V1_CONTRACT;
  const e = MANAGEMENT_ERROR_CODE;
  if (kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE) {
    const okVer = isBoundedString(
      p.targetVersion,
      c.MIN_TARGET_VERSION_LENGTH,
      c.MAX_TARGET_VERSION_LENGTH,
    );
    const okDig =
      p.targetArtifactDigest == null ||
      isBoundedString(
        p.targetArtifactDigest,
        c.MIN_ARTIFACT_DIGEST_LENGTH,
        c.MAX_ARTIFACT_DIGEST_LENGTH,
      );
    if (!okVer || !okDig) failValidation(e.OPERATION_VALUE_INVALID);
  } else {
    const okBkp =
      isBoundedString(p.backupId, c.MIN_BACKUP_ID_LENGTH, c.MAX_BACKUP_ID_LENGTH) &&
      isBoundedString(p.destinationUri, c.MIN_DESTINATION_URI_LENGTH, c.MAX_DESTINATION_URI_LENGTH);
    if (!okBkp) failValidation(e.OPERATION_VALUE_INVALID);
  }
}

function validateParams(kind, p) {
  const c = MANAGEMENT_V1_CONTRACT;
  const e = MANAGEMENT_ERROR_CODE;
  if (!p || typeof p !== 'object' || Array.isArray(p)) failValidation(e.OPERATION_TYPE_INVALID);
  for (const k of Object.keys(p)) {
    if (!ALLOWED_PARAMS[kind].includes(k)) failValidation(e.OPERATION_PARAMETER_UNKNOWN_FIELD);
  }
  if (kind === MANAGEMENT_OPERATION_KIND.NOOP) {
    if (
      p.reason !== undefined &&
      !isBoundedString(p.reason, c.MIN_NOOP_REASON_LENGTH, c.MAX_NOOP_REASON_LENGTH)
    ) {
      failValidation(e.OPERATION_VALUE_INVALID);
    }
  } else if (kind === MANAGEMENT_OPERATION_KIND.DECOMMISSION_NODE) {
    if (!isBoundedString(p.lagrangeNodeId, c.MIN_NODE_ID_LENGTH, c.MAX_NODE_ID_LENGTH)) {
      failValidation(e.OPERATION_VALUE_INVALID);
    }
  } else {
    validateDeployBackupParams(kind, p);
  }
}

function validateB3Fields(input) {
  const e = MANAGEMENT_ERROR_CODE;
  if (input.sequence !== undefined && !isMinSafeInteger(input.sequence, 1)) {
    failValidation(e.OPERATION_VALUE_INVALID);
  }
  if (input.createdAtMs !== undefined && !isMinSafeInteger(input.createdAtMs, 0)) {
    failValidation(e.OPERATION_VALUE_INVALID);
  }
  if (
    input.requestedBy !== undefined &&
    !isBoundedString(input.requestedBy, 1, MAX_REQUESTED_BY_LENGTH)
  ) {
    failValidation(e.OPERATION_VALUE_INVALID);
  }
}

function validateB3Expiry(input) {
  if (input.expiresAtMs === undefined) return;
  const c = MANAGEMENT_V1_CONTRACT;
  if (!isMinSafeInteger(input.expiresAtMs, 0)) {
    failValidation(MANAGEMENT_ERROR_CODE.OPERATION_VALUE_INVALID);
  }
  if (input.createdAtMs !== undefined) {
    const delta = input.expiresAtMs - input.createdAtMs;
    if (delta <= 0 || delta > c.MAX_VALIDITY_DURATION_MS) {
      failValidation(MANAGEMENT_ERROR_CODE.OPERATION_VALUE_INVALID);
    }
  }
}

function validateB3Digest(input) {
  const full =
    input.sequence !== undefined &&
    input.createdAtMs !== undefined &&
    input.expiresAtMs !== undefined &&
    input.requestedBy !== undefined;
  if (full && !constantTimeEqual(input.requestDigest, computeCanonicalOperationDigest(input))) {
    failValidation(MANAGEMENT_ERROR_CODE.OPERATION_DIGEST_MISMATCH);
  }
}

function validateManagementV1OperationRequest(input, _options = {}) {
  validateEnvelope(input);
  validateCore(input);
  validateParams(input.kind, input.parameters);
  validateB3Fields(input);
  validateB3Expiry(input);
  validateB3Digest(input);
  return input;
}

export {
  computeCanonicalOperationDigest,
  failValidation,
  isBoundedString,
  validateManagementV1OperationRequest,
};
