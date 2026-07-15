import {
  BOOTSTRAP_API_PROBE_REASON,
} from './bootstrap-api-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_SEED_CONTACT_FAILURE_KIND,
  RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE,
  RETRYABLE_JOIN_RESUME_FAILURE_PROFILE,
} from './node-joining-constants.js';

const LIMITED_RESUME_FAILURE_KINDS = Object.freeze([
  JOINING_SEED_CONTACT_FAILURE_KIND.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
  JOINING_SEED_CONTACT_FAILURE_KIND.REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);

const LIMITED_RESUME_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
]);

function hasBootstrapResponseReason(error, reasonCodes) {
  const reasons = Array.isArray(error?.bootstrapResponse?.reasons) ?
    error.bootstrapResponse.reasons :
    [];
  return reasonCodes.some((reasonCode) => reasons.includes(reasonCode));
}

function isLimitedResumeBootstrapNotReadyFailure(error) {
  return LIMITED_RESUME_FAILURE_KINDS.includes(
    error?.seedContactFailureKind,
  ) || hasBootstrapResponseReason(error, LIMITED_RESUME_REASON_CODES);
}

function normalizeRetryableJoinResumeAttemptBudgetMode(value) {
  return Object.values(RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE)
    .includes(value) ?
    value :
    JOINING_DEFAULT.retryableFailureResumeAttemptBudgetMode;
}

function resolveRetryableJoinResumeAttemptBudgetMode(
  failureProfile,
  configuredMode,
) {
  if (failureProfile === RETRYABLE_JOIN_RESUME_FAILURE_PROFILE
    .CONTACTING_SEED_BOOTSTRAP_NOT_READY) {
    return RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY;
  }
  return normalizeRetryableJoinResumeAttemptBudgetMode(configuredMode);
}

function resolveRetryableJoinMinimumMaxElapsedMs(options = {}) {
  const retryWindowMs = Number.isFinite(options.retryWindowMs) ?
    Math.max(0, Math.floor(options.retryWindowMs)) :
    0;
  const httpTimeoutMs = Number.isFinite(options.httpTimeoutMs) ?
    Math.max(0, Math.floor(options.httpTimeoutMs)) :
    0;
  const defaultMaxElapsedMs =
    JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs;
  const contactSeedWindowMs = retryWindowMs + httpTimeoutMs;
  const latePhaseWindowMs =
    retryWindowMs <= defaultMaxElapsedMs ?
      defaultMaxElapsedMs + retryWindowMs :
      contactSeedWindowMs;
  return Math.max(0, contactSeedWindowMs, latePhaseWindowMs);
}

export {
  isLimitedResumeBootstrapNotReadyFailure,
  normalizeRetryableJoinResumeAttemptBudgetMode,
  resolveRetryableJoinMinimumMaxElapsedMs,
  resolveRetryableJoinResumeAttemptBudgetMode,
};
