import {ENTRYPOINT_ENV} from './constants/entrypoint.js';
import {
  normalizeRetryableJoinResumeAttemptBudgetMode,
} from './bootstrap/retryable-join-resume-policy.js';
import {parsePositiveTimeoutMs} from './entrypoint-runtime-helpers.js';

function resolveNodeJoiningConfig(env = {}) {
  const joiningConfig = {
    autoResumeRetryableFailures: true,
    retryableFailureResumeAttemptBudgetMode:
      normalizeRetryableJoinResumeAttemptBudgetMode(
        env[ENTRYPOINT_ENV
          .JOINING_RETRYABLE_FAILURE_RESUME_ATTEMPT_BUDGET_MODE],
      ),
  };
  const joinHttpTimeoutMs = parsePositiveTimeoutMs(
    env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
  );
  if (joinHttpTimeoutMs !== null) {
    joiningConfig.httpTimeoutMs = joinHttpTimeoutMs;
  }
  const joinLeadershipWaitTimeoutMs = parsePositiveTimeoutMs(
    env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
  );
  if (joinLeadershipWaitTimeoutMs !== null) {
    joiningConfig.leadershipWaitTimeoutMs = joinLeadershipWaitTimeoutMs;
  }
  return joiningConfig;
}

export {resolveNodeJoiningConfig};
