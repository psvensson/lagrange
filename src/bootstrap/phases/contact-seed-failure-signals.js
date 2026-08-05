/**
 * Contact Seed Failure Signals — pure retry and error evidence utilities for
 * the seed contact phase.
 */

import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
} from '../bootstrap-api-constants.js';
import {
  JOINING_SEED_CONTACT_FAILURE_KIND,
} from '../node-joining-constants.js';
import {
  HTTP_STATUS,
  NUM,
  STRING,
  TIME_MS,
} from '../../constants/index.js';

const LOCAL_STR_MISSINGPARTITIONLEADERS = 'missingPartitionLeaders=';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_MISSINGMESSAGEGROUPLEADERS = 'missingMessageGroupLeaders=';
const LOCAL_STR_MISSINGPARTITIONLEADERNODES = 'missingPartitionLeaderNodes=';
const LOCAL_STR_MISSINGMESSAGEGROUPLEADERNODES = 'missingMessageGroupLeaderNodes=';
const LOCAL_STR_SPACE = ' ';
const PRESSURE_STATE_PRESENT = 'present';
const MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES = 1;
const MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS = 1;
const RETAINED_BOOTSTRAP_NOT_READY_REQUEST_TIMEOUT_MS =
  TIME_MS.SECOND * NUM.FIVE;
const RETRYABLE_SEED_CONTACT_FAILURE_ACTION = Object.freeze({
  CLEAR_RETAINED_EVIDENCE_AND_RETRY: 'clear_retained_evidence_and_retry',
  RETRY: 'retry',
  SURFACE: 'surface',
  TERMINAL: 'terminal',
});
const RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE = Object.freeze({
  FRESH: 'fresh',
  NONE: 'none',
  RETAINED: 'retained',
});
const BOOTSTRAP_NOT_READY_LIMITED_RESUME_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);
const SEED_CONTACT_PRESSURE_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);
const BOOTSTRAP_NOT_READY_LIMITED_RESUME_FAILURE_KIND_BY_REASON =
  Object.freeze({
    [BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED]:
      JOINING_SEED_CONTACT_FAILURE_KIND.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
    [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED]:
      JOINING_SEED_CONTACT_FAILURE_KIND.REQUEST_EXECUTION_BUDGET_EXHAUSTED,
  });

const SEED_READINESS_TIMEOUT_MSG = (ms) =>
  `seed readiness timeout after ${ms}ms`;
const HTTP_ERROR_MESSAGE_PATTERN = /^HTTP (\d+):\s*(.*)$/s;
const RETRYABLE_SEED_CONTACT_TRANSPORT_ERROR_CODES = Object.freeze([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
]);
const RETRYABLE_SEED_CONTACT_TRANSPORT_MESSAGE_FRAGMENTS = Object.freeze([
  'fetch failed',
  'network error',
  'connection closed',
  'connection refused',
  'connection reset',
  'socket hang up',
]);

function isRetryableSeedContactCode(code) {
  return code === BOOTSTRAP_PIPELINE_ERROR_CODE
    .LEADER_METADATA_INCOMPLETE ||
    code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY ||
    code === BOOTSTRAP_PIPELINE_ERROR_CODE
      .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT ||
    code === BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW ||
    code === BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE
      .ASSIGNMENT_TOKEN_UNKNOWN;
}

function isRetryableSeedContactTransportFailure(error, options = {}) {
  if (!error ||
      options.parsedError ||
      Number.isFinite(options.statusCode)) {
    return false;
  }

  const candidateCodes = [
    error.code,
    error.cause?.code,
  ];
  if (candidateCodes.some((code) =>
    RETRYABLE_SEED_CONTACT_TRANSPORT_ERROR_CODES.includes(code),
  )) {
    return true;
  }

  if (typeof error.message !== 'string') {
    return false;
  }
  const message = error.message.toLowerCase();
  return RETRYABLE_SEED_CONTACT_TRANSPORT_MESSAGE_FRAGMENTS.some((fragment) =>
    message.includes(fragment),
  );
}

// The seed-contact failure classification aggregates four independent
// retryable signals: a typed retryable code, a retryable timeout message, a
// 503 status, and a transport-level failure. Any one makes the failure
// retryable.
function isRetryableSeedContactFailure(fields) {
  return fields.retryableCode ||
    fields.retryableTimeout ||
    fields.retryableStatus ||
    fields.retryableTransportFailure;
}

// A 400/409 carrying a whitelisted retryable code (e.g. the lease-window
// changed-address conflict) is retryable-with-backoff, not terminal: the seed
// explicitly classified it as a wait. Only an untyped/unwhitelisted one stays
// on the terminal path.
function isTerminalSeedContactValidationOrConflict(fields) {
  return !fields.retryableCode &&
    (fields.statusCode === HTTP_STATUS.BAD_REQUEST ||
      fields.statusCode === HTTP_STATUS.CONFLICT);
}

// Derive the classification fields from one seed-contact error: parsed
// bootstrap response, HTTP status, typed code, and the per-signal retryable
// flags. Kept as one field-derivation helper so the classifier method itself
// stays a thin composition and the lease-window 409 policy lives in exactly
// one place.
function deriveSeedContactFailureFields(error, retryableTimeoutErrorMessage) {
  const parsedError = error.bootstrapResponse ||
    parseBootstrapError(error);
  const statusCode = Number.isFinite(error?.statusCode) ?
    Math.floor(error.statusCode) :
    (Number.isFinite(parsedError?.statusCode) ?
      Math.floor(parsedError.statusCode) :
      null);
  const code = typeof parsedError?.code === 'string' ?
    parsedError.code :
    null;
  const retryableCode = isRetryableSeedContactCode(code);
  const retryableTimeout =
    error?.message === retryableTimeoutErrorMessage;
  const retryableStatus =
    statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE;
  const retryableTransportFailure =
    isRetryableSeedContactTransportFailure(error, {
      parsedError,
      statusCode,
    });
  const fields = {
    retryableCode,
    retryableTimeout,
    retryableStatus,
    retryableTransportFailure,
    statusCode,
  };
  const terminalValidationOrConflict =
    isTerminalSeedContactValidationOrConflict(fields);
  return {
    parsedError,
    statusCode,
    code,
    retryAfterMs: resolveSeedContactRetryAfterMs(error, parsedError),
    retryableCode,
    retryableTimeout,
    retryableStatus,
    retryableTransportFailure,
    retryable: isRetryableSeedContactFailure(fields),
    terminalValidationOrConflict,
  };
}

// Whether a parsed failure is worth retaining as retryable evidence: a typed
// retryable code (any status, so the lease-window 409 is kept), or an untyped
// 503. The retained evidence lets the joiner survive the retry budget window
// instead of giving up on a wait the seed explicitly typed.
function isRetainedSeedContactEvidence(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const code = typeof value.code === 'string' ? value.code : null;
  return isRetryableSeedContactCode(code) === true ||
    value.statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE;
}

function isBootstrapNotReadySeedContactEvidence(value) {
  return value?.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
}

function normalizeSeedContactEvidenceReasons(value) {
  if (!Array.isArray(value?.reasons)) {
    return [];
  }
  return value.reasons.filter((reason) =>
    typeof reason === 'string' && reason.length > 0,
  );
}

function resolveBootstrapNotReadySeedContactFailureKind(value) {
  if (isBootstrapNotReadySeedContactEvidence(value) !== true) {
    return null;
  }
  const reasons = normalizeSeedContactEvidenceReasons(value);
  const limitedResumeReason = BOOTSTRAP_NOT_READY_LIMITED_RESUME_REASON_CODES
    .find((reason) => reasons.includes(reason));
  if (limitedResumeReason) {
    return BOOTSTRAP_NOT_READY_LIMITED_RESUME_FAILURE_KIND_BY_REASON[
      limitedResumeReason
    ];
  }
  return JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY;
}

function isSeedContactPressureEvidence(value) {
  const reasons = normalizeSeedContactEvidenceReasons(value);
  if (SEED_CONTACT_PRESSURE_REASON_CODES.some((reason) =>
    reasons.includes(reason),
  )) {
    return true;
  }
  const pressureAction = value?.pressureAction;
  const pressureReason = value?.pressureReason;
  return value?.details?.pressure?.state === PRESSURE_STATE_PRESENT ||
    (
      typeof pressureAction === 'string' &&
      pressureAction.length > 0
    ) ||
    (
      typeof pressureReason === 'string' &&
      pressureReason.length > 0
    );
}

function resolveRetryableSeedContactFailureAction(options = {}) {
  if (options.classification?.retryable !== true) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION.TERMINAL;
  }
  const elapsedMs = Number.isFinite(options.elapsedMs) ?
    Math.max(0, Math.floor(options.elapsedMs)) :
    0;
  const retryTimeoutMs = Number.isFinite(options.retryTimeoutMs) ?
    Math.max(0, Math.floor(options.retryTimeoutMs)) :
    0;
  if (elapsedMs >= retryTimeoutMs) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE;
  }
  const retryableSeedContactOutcomeBudgetExhausted =
    options.hasRetryableSeedContactEvidence === true &&
    Number.isFinite(options.retryableSeedContactEvidenceRetryBudget) &&
    options.retryableSeedContactEvidenceRetryBudget <= 0;
  if (retryableSeedContactOutcomeBudgetExhausted === true &&
      options.classification?.retryableTimeout === true &&
      options.retryableSeedContactEvidenceSource ===
        RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.RETAINED) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION
      .CLEAR_RETAINED_EVIDENCE_AND_RETRY;
  }
  return retryableSeedContactOutcomeBudgetExhausted === true ?
    RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE :
    RETRYABLE_SEED_CONTACT_FAILURE_ACTION.RETRY;
}

function resolveSeedContactRequestTimeoutMs(options = {}) {
  return Number.isFinite(options.configuredHttpTimeoutMs) ?
    Math.max(
      MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS,
      Math.floor(options.configuredHttpTimeoutMs),
    ) :
    MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS;
}

function resolveSeedContactAttemptTimeoutMs(options = {}) {
  const requestTimeoutMs = resolveSeedContactRequestTimeoutMs({
    configuredHttpTimeoutMs: options.configuredHttpTimeoutMs,
  });
  const remainingRetryBudgetMs = Number.isFinite(options.remainingRetryBudgetMs) ?
    Math.max(
      MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS,
      Math.floor(options.remainingRetryBudgetMs),
    ) :
    requestTimeoutMs;
  const retainedBootstrapNotReadyTimeoutMs =
    isBootstrapNotReadySeedContactEvidence(
      options.retryableSeedContactEvidence,
    ) ?
      Math.max(
        RETAINED_BOOTSTRAP_NOT_READY_REQUEST_TIMEOUT_MS,
        Number.isFinite(options.retryableSeedContactEvidence?.retryAfterMs) ?
          Math.floor(options.retryableSeedContactEvidence.retryAfterMs) :
          MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS,
      ) :
      requestTimeoutMs;
  return Math.min(
    requestTimeoutMs,
    remainingRetryBudgetMs,
    retainedBootstrapNotReadyTimeoutMs,
  );
}

/**
 * Resolve retry hint (ms) from parsed body and transport metadata.
 * Pure function - no instance state needed.
 * @param {Error} error
 * @param {Object|null} parsedError
 * @return {number|null}
 */
function resolveSeedContactRetryAfterMs(error, parsedError) {
  const hintCandidates = [
    error?.retryAfterMs,
    parsedError?.retryAfterMs,
    parsedError?.retry_after_ms,
  ];
  for (const hint of hintCandidates) {
    if (!Number.isFinite(hint)) {
      continue;
    }
    return Math.max(0, Math.floor(hint));
  }
  return null;
}

/**
 * Parse bootstrap HTTP error bodies from the default HTTP client.
 * Pure function - no instance state needed.
 * @param {Error} error
 * @return {Object|null}
 */
function parseBootstrapError(error) {
  if (!error) {
    return null;
  }

  if (error.responseJson &&
      typeof error.responseJson === 'object') {
    const parsedFromJson = {...error.responseJson};
    if (Number.isFinite(error.statusCode) &&
        !Number.isFinite(parsedFromJson.statusCode)) {
      parsedFromJson.statusCode = Math.floor(error.statusCode);
    }
    if (Number.isFinite(error.retryAfterMs) &&
        !Number.isFinite(parsedFromJson.retryAfterMs)) {
      parsedFromJson.retryAfterMs = Math.floor(error.retryAfterMs);
    }
    return parsedFromJson;
  }

  if (typeof error.message !== 'string') {
    return null;
  }

  const match = error.message.match(HTTP_ERROR_MESSAGE_PATTERN);
  if (!match) {
    return null;
  }

  const statusCode = Number.parseInt(match[1], 10);
  try {
    const parsed = JSON.parse(match[2]);
    if (Number.isFinite(statusCode) &&
        !Number.isFinite(parsed.statusCode)) {
      parsed.statusCode = statusCode;
    }
    return parsed;
  } catch (_parseError) {
    if (!Number.isFinite(statusCode)) {
      return null;
    }
    return {statusCode};
  }
}

/**
 * Format leader metadata details for error reporting.
 * Pure function - no instance state needed.
 * @param {Object} details
 * @return {string}
 */
function formatLeaderMetadataDetails(details) {
  const parts = [];
  if (Array.isArray(details.missingPartitionLeaders) &&
      details.missingPartitionLeaders.length > 0) {
    parts.push(LOCAL_STR_MISSINGPARTITIONLEADERS +
      details.missingPartitionLeaders.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingMessageGroupLeaders) &&
      details.missingMessageGroupLeaders.length > 0) {
    parts.push(LOCAL_STR_MISSINGMESSAGEGROUPLEADERS +
      details.missingMessageGroupLeaders.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingPartitionLeaderNodes) &&
      details.missingPartitionLeaderNodes.length > 0) {
    parts.push(LOCAL_STR_MISSINGPARTITIONLEADERNODES +
      details.missingPartitionLeaderNodes.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingMessageGroupLeaderNodes) &&
      details.missingMessageGroupLeaderNodes.length > 0) {
    parts.push(LOCAL_STR_MISSINGMESSAGEGROUPLEADERNODES +
      details.missingMessageGroupLeaderNodes.join(LOCAL_STR_COMMA));
  }

  return parts.length > 0 ? parts.join(LOCAL_STR_SPACE) : STRING.UNKNOWN;
}

export {
  MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES,
  RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE,
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  SEED_READINESS_TIMEOUT_MSG,
  deriveSeedContactFailureFields,
  formatLeaderMetadataDetails,
  isRetainedSeedContactEvidence,
  isRetryableSeedContactCode,
  parseBootstrapError,
  resolveBootstrapNotReadySeedContactFailureKind,
  isSeedContactPressureEvidence,
  resolveRetryableSeedContactFailureAction,
  resolveSeedContactAttemptTimeoutMs,
  resolveSeedContactRequestTimeoutMs,
  resolveSeedContactRetryAfterMs,
};
