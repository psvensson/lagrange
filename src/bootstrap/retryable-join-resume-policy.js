import {
  BOOTSTRAP_API_PROBE_REASON,
} from './bootstrap-api-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_SEED_CONTACT_FAILURE_KIND,
  RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE,
  RETRYABLE_JOIN_RESUME_FAILURE_PROFILE,
} from './node-joining-constants.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';

/**
 * Enforce that retryable-join resume classification receives a real phase.
 * @param {Object|null|undefined} failureContext
 * @return {string}
 */
function requireRetryableJoinResumeFailurePhase(failureContext) {
  const phase = readStateField(failureContext?.phase);
  if (phase === STATE_ABSENT) {
    throw new Error(
      JOINING_ERROR_MSG.RETRYABLE_JOIN_RESUME_FAILURE_PHASE_REQUIRED,
    );
  }
  return phase;
}

/**
 * Capture pre-cleanup join phase and message before failure handling sets FAILED.
 * @param {string} phase
 * @param {Error|Object|null|undefined} error
 * @return {{phase: string, error?: string}}
 */
function buildJoiningFailureContext(phase, error) {
  const context = {
    phase: requireRetryableJoinResumeFailurePhase({phase}),
  };
  if (typeof error?.message === 'string' && error.message.length > 0) {
    context.error = error.message;
  }
  return context;
}

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
  buildJoiningFailureContext,
  isLimitedResumeBootstrapNotReadyFailure,
  normalizeRetryableJoinResumeAttemptBudgetMode,
  requireRetryableJoinResumeFailurePhase,
  resolveRetryableJoinMinimumMaxElapsedMs,
  resolveRetryableJoinResumeAttemptBudgetMode,
};
