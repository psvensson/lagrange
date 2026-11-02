/**
 * H1 pinned-toolchain Hono component qualification owner
 * (solve/specs/standard-http-service-api/requirements.md sections 4.1, 4.5, 7.2).
 *
 * Owns the pinned toolchain/package identities, the qualified vs unsupported
 * guest runtime facility inventory under the sealed engine feature profile,
 * and the `pinned-toolchain-hono-component` receipt builder and validator.
 */
import {createHash} from 'node:crypto';

const HASH_ALGORITHM = 'sha256';
const DIGEST_PREFIX = 'sha256:';
const HEX_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

const PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID =
  'pinned-toolchain-hono-component';
const PINNED_HONO_COMPONENT_RECEIPT_SCHEMA =
  'lagrange.hono-component-qualification.v1';

const PINNED_HONO_TOOLCHAIN_VERSIONS = Object.freeze({
  componentizeJs: '0.21.0',
  esbuild: '0.27.2',
  hono: '4.13.14',
  jcoTranspile: '0.4.2',
});

const QUALIFIED_HONO_GUEST_FACILITIES = Object.freeze([
  'Request',
  'Response',
  'Headers',
  'Headers.prototype.getSetCookie',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'ReadableStream',
  'atob',
  'btoa',
  'async-export-promise',
  'lagrange:cell/context#call-binding',
  'lagrange:cell/call-context#emit',
  'hono-router',
  'zero-operation-http-only-service',
]);

const UNSUPPORTED_HONO_GUEST_FACILITIES = Object.freeze([
  'AsyncLocalStorage',
  'hono/context-storage',
  'ambient-outbound-fetch',
  'ambient-clocks',
  'ambient-random',
  'call-binding-in-call-mode',
  'request-context-in-call-mode',
  'lagrange-server-root-import',
  'node-builtin-imports',
]);

const RECEIPT_VALIDATION_STATUS = Object.freeze({
  INVALID: 'invalid',
  VALID: 'valid',
});

const RECEIPT_ERROR_CODE = Object.freeze({
  ARTIFACT_INVALID: 'HONO_RECEIPT_ARTIFACT_INVALID',
  FACILITY_MISMATCH: 'HONO_RECEIPT_FACILITY_MISMATCH',
  OBSERVATION_FAILED: 'HONO_RECEIPT_OBSERVATION_FAILED',
  RECEIPT_ID_MISMATCH: 'HONO_RECEIPT_ID_MISMATCH',
  SCHEMA_MISMATCH: 'HONO_RECEIPT_SCHEMA_MISMATCH',
  TOOLCHAIN_MISMATCH: 'HONO_RECEIPT_TOOLCHAIN_MISMATCH',
});

const RECEIPT_ERROR_MESSAGE = Object.freeze({
  DISTRIBUTED_ARTIFACT_INVALID:
    'distributedService artifact digests or byte length invalid',
  OBSERVATIONS_MISSING: 'receipt observations record is missing',
  QUALIFIED_FACILITIES_MISMATCH:
    'qualifiedFacilities does not match QUALIFIED_HONO_GUEST_FACILITIES',
  RECEIPT_ID_MISMATCH: 'receiptId must equal pinned-toolchain-hono-component',
  SCHEMA_MISMATCH:
    'schema must equal lagrange.hono-component-qualification.v1',
  TOOLCHAIN_MISSING: 'receipt toolchain record is missing',
  UNSUPPORTED_FACILITIES_MISMATCH:
    'unsupportedFacilities does not match UNSUPPORTED_HONO_GUEST_FACILITIES',
  ZERO_OP_ARTIFACT_INVALID:
    'zeroOperationService artifact digests, byte length, or operationCount invalid',
});

const OBSERVATION_KEYS = Object.freeze([
  'healthRouteOk',
  'asyncJsonAndHostCallOk',
  'binaryBodyRoundTripOk',
  'multiSetCookiePreserved',
  'hostCallRefusalPropagated',
  'zeroOperationRouteOk',
  'callModeIsolatesRequestImports',
]);

function computeSha256Digest(input) {
  const bytes = typeof input === 'string' ?
    Buffer.from(input, UTF8_ENCODING) :
    Buffer.from(input);
  const hex = createHash(HASH_ALGORITHM).update(bytes).digest(HEX_ENCODING);
  return `${DIGEST_PREFIX}${hex}`;
}

function isValidSha256Digest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function hasExactStringList(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function hasValidArtifactDigests(artifact) {
  return (
    isValidSha256Digest(artifact.entryDigest) &&
    isValidSha256Digest(artifact.bundledEntryDigest) &&
    isValidSha256Digest(artifact.componentDigest)
  );
}

function validateArtifactRecord(artifact, requireZeroOperations = false) {
  if (!artifact || typeof artifact !== 'object') {
    return false;
  }
  const sizeValid =
    Number.isSafeInteger(artifact.componentByteLength) &&
    artifact.componentByteLength > 0;
  if (!hasValidArtifactDigests(artifact) || !sizeValid) {
    return false;
  }
  return !requireZeroOperations || artifact.operationCount === 0;
}

function buildPinnedHonoComponentReceipt({
  distributedArtifact,
  zeroOperationArtifact,
  observations,
  toolchain = PINNED_HONO_TOOLCHAIN_VERSIONS,
} = {}) {
  return Object.freeze({
    artifacts: Object.freeze({
      distributedService: Object.freeze({...distributedArtifact}),
      zeroOperationService: Object.freeze({...zeroOperationArtifact}),
    }),
    observations: Object.freeze({
      ...observations,
      qualifiedFacilities: Object.freeze([...QUALIFIED_HONO_GUEST_FACILITIES]),
      unsupportedFacilities: Object.freeze([
        ...UNSUPPORTED_HONO_GUEST_FACILITIES,
      ]),
    }),
    receiptId: PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID,
    schema: PINNED_HONO_COMPONENT_RECEIPT_SCHEMA,
    toolchain: Object.freeze({...toolchain}),
  });
}

function validateToolchainMatches(toolchain, errors) {
  if (!toolchain || typeof toolchain !== 'object') {
    errors.push({
      code: RECEIPT_ERROR_CODE.TOOLCHAIN_MISMATCH,
      message: RECEIPT_ERROR_MESSAGE.TOOLCHAIN_MISSING,
    });
    return;
  }
  for (const [key, expectedVersion] of Object.entries(
    PINNED_HONO_TOOLCHAIN_VERSIONS,
  )) {
    if (toolchain[key] !== expectedVersion) {
      errors.push({
        code: RECEIPT_ERROR_CODE.TOOLCHAIN_MISMATCH,
        message: `toolchain.${key} expected ${expectedVersion}, got ${toolchain[key]}`,
      });
    }
  }
}

function validateObservations(observations, errors) {
  if (!observations || typeof observations !== 'object') {
    errors.push({
      code: RECEIPT_ERROR_CODE.OBSERVATION_FAILED,
      message: RECEIPT_ERROR_MESSAGE.OBSERVATIONS_MISSING,
    });
    return;
  }
  for (const key of OBSERVATION_KEYS) {
    if (observations[key] !== true) {
      errors.push({
        code: RECEIPT_ERROR_CODE.OBSERVATION_FAILED,
        message: `observation ${key} must be true`,
      });
    }
  }
  if (!hasExactStringList(
    observations.qualifiedFacilities,
    QUALIFIED_HONO_GUEST_FACILITIES,
  )) {
    errors.push({
      code: RECEIPT_ERROR_CODE.FACILITY_MISMATCH,
      message: RECEIPT_ERROR_MESSAGE.QUALIFIED_FACILITIES_MISMATCH,
    });
  }
  if (!hasExactStringList(
    observations.unsupportedFacilities,
    UNSUPPORTED_HONO_GUEST_FACILITIES,
  )) {
    errors.push({
      code: RECEIPT_ERROR_CODE.FACILITY_MISMATCH,
      message: RECEIPT_ERROR_MESSAGE.UNSUPPORTED_FACILITIES_MISMATCH,
    });
  }
}

function validateReceiptIdentity(receipt, errors) {
  if (receipt?.receiptId !== PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID) {
    errors.push({
      code: RECEIPT_ERROR_CODE.RECEIPT_ID_MISMATCH,
      message: RECEIPT_ERROR_MESSAGE.RECEIPT_ID_MISMATCH,
    });
  }
  if (receipt?.schema !== PINNED_HONO_COMPONENT_RECEIPT_SCHEMA) {
    errors.push({
      code: RECEIPT_ERROR_CODE.SCHEMA_MISMATCH,
      message: RECEIPT_ERROR_MESSAGE.SCHEMA_MISMATCH,
    });
  }
}

function validateReceiptArtifacts(artifacts, errors) {
  if (!validateArtifactRecord(artifacts?.distributedService, false)) {
    errors.push({
      code: RECEIPT_ERROR_CODE.ARTIFACT_INVALID,
      message: RECEIPT_ERROR_MESSAGE.DISTRIBUTED_ARTIFACT_INVALID,
    });
  }
  if (!validateArtifactRecord(artifacts?.zeroOperationService, true)) {
    errors.push({
      code: RECEIPT_ERROR_CODE.ARTIFACT_INVALID,
      message: RECEIPT_ERROR_MESSAGE.ZERO_OP_ARTIFACT_INVALID,
    });
  }
}

function validatePinnedHonoComponentReceipt(receipt) {
  const errors = [];
  validateReceiptIdentity(receipt, errors);
  validateToolchainMatches(receipt?.toolchain, errors);
  validateReceiptArtifacts(receipt?.artifacts, errors);
  validateObservations(receipt?.observations, errors);
  return Object.freeze({
    errors: Object.freeze(errors),
    status: errors.length === 0 ?
      RECEIPT_VALIDATION_STATUS.VALID :
      RECEIPT_VALIDATION_STATUS.INVALID,
  });
}

export {
  PINNED_HONO_COMPONENT_RECEIPT_SCHEMA,
  PINNED_HONO_TOOLCHAIN_VERSIONS,
  PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID,
  QUALIFIED_HONO_GUEST_FACILITIES,
  RECEIPT_ERROR_CODE,
  RECEIPT_VALIDATION_STATUS,
  UNSUPPORTED_HONO_GUEST_FACILITIES,
  buildPinnedHonoComponentReceipt,
  computeSha256Digest,
  validatePinnedHonoComponentReceipt,
};
