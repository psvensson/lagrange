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
  TYPEOF,
} from '../../constants/index.js';

const LOCAL_STR_1JITK = 'missingPartitionLeaders=';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_19TB4 = 'missingMessageGroupLeaders=';
const LOCAL_STR_159CY = 'missingPartitionLeaderNodes=';
const LOCAL_STR_1AWHD = 'missingMessageGroupLeaderNodes=';
const LOCAL_STR_SPACE = ' ';
const MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES = 1;
const MIN_SEED_CONTACT_REQUEST_TIMEOUT_MS = NUM.ONE;
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

function isRetryableSeedContactCode(code) {
  return code === BOOTSTRAP_PIPELINE_ERROR_CODE
    .LEADER_METADATA_INCOMPLETE ||
    code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY ||
    code === BOOTSTRAP_PIPELINE_ERROR_CODE
      .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT ||
    code === BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE
      .ASSIGNMENT_TOKEN_UNKNOWN;
}

function normalizeRetryableSeedContactEvidence(value) {
  if (!value || typeof value !== TYPEOF.OBJECT) {
    return null;
  }
  const code = typeof value.code === TYPEOF.STRING ?
    value.code :
    null;
  const statusCode = Number.isFinite(value.statusCode) ?
    Math.floor(value.statusCode) :
    null;
  if (isRetryableSeedContactCode(code) !== true &&
      statusCode !== HTTP_STATUS.SERVICE_UNAVAILABLE) {
    return null;
  }
  const normalized = {
    ...value,
  };
  if (statusCode !== null) {
    normalized.statusCode = statusCode;
  }
  if (Number.isFinite(value.retryAfterMs)) {
    normalized.retryAfterMs = Math.floor(value.retryAfterMs);
  }
  return normalized;
}

function isBootstrapNotReadySeedContactEvidence(value) {
  return value?.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
}

function normalizeSeedContactEvidenceReasons(value) {
  if (!Array.isArray(value?.reasons)) {
    return [];
  }
  return value.reasons.filter((reason) =>
    typeof reason === TYPEOF.STRING && reason.length > NUM.ZERO,
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

function resolveRetryableSeedContactFailureAction(options = {}) {
  if (options.classification?.retryable !== true) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION.TERMINAL;
  }
  const elapsedMs = Number.isFinite(options.elapsedMs) ?
    Math.max(NUM.ZERO, Math.floor(options.elapsedMs)) :
    NUM.ZERO;
  const retryTimeoutMs = Number.isFinite(options.retryTimeoutMs) ?
    Math.max(NUM.ZERO, Math.floor(options.retryTimeoutMs)) :
    NUM.ZERO;
  if (elapsedMs >= retryTimeoutMs) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE;
  }
  const retryableSeedContactOutcomeBudgetExhausted =
    options.hasRetryableSeedContactEvidence === true &&
    Number.isFinite(options.retryableSeedContactEvidenceRetryBudget) &&
    options.retryableSeedContactEvidenceRetryBudget <= NUM.ZERO;
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
    return Math.max(NUM.ZERO, Math.floor(hint));
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
      typeof error.responseJson === TYPEOF.OBJECT) {
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

  if (typeof error.message !== TYPEOF.STRING) {
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
      details.missingPartitionLeaders.length > NUM.ZERO) {
    parts.push(LOCAL_STR_1JITK +
      details.missingPartitionLeaders.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingMessageGroupLeaders) &&
      details.missingMessageGroupLeaders.length > NUM.ZERO) {
    parts.push(LOCAL_STR_19TB4 +
      details.missingMessageGroupLeaders.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingPartitionLeaderNodes) &&
      details.missingPartitionLeaderNodes.length > NUM.ZERO) {
    parts.push(LOCAL_STR_159CY +
      details.missingPartitionLeaderNodes.join(LOCAL_STR_COMMA));
  }
  if (Array.isArray(details.missingMessageGroupLeaderNodes) &&
      details.missingMessageGroupLeaderNodes.length > NUM.ZERO) {
    parts.push(LOCAL_STR_1AWHD +
      details.missingMessageGroupLeaderNodes.join(LOCAL_STR_COMMA));
  }

  return parts.length > NUM.ZERO ? parts.join(LOCAL_STR_SPACE) : STRING.UNKNOWN;
}

export {
  MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES,
  RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE,
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  SEED_READINESS_TIMEOUT_MSG,
  formatLeaderMetadataDetails,
  isRetryableSeedContactCode,
  normalizeRetryableSeedContactEvidence,
  parseBootstrapError,
  resolveBootstrapNotReadySeedContactFailureKind,
  resolveRetryableSeedContactFailureAction,
  resolveSeedContactAttemptTimeoutMs,
  resolveSeedContactRequestTimeoutMs,
  resolveSeedContactRetryAfterMs,
};
