import {MembershipLifecycleController} from
  './control-plane/membership-lifecycle-controller.js';
import {STARTUP_JOIN_MODE} from './bootstrap/rejoin-hints-constants.js';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
} from './query/application-database-constants.js';
import {createApplicationDatabaseError} from
  './query/application-database-error.js';
import {
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_RUNTIME_VALUE,
} from './constants/entrypoint.js';

const LOCAL_STR_ABORT = 'abort';
const LOCAL_STR_UNAVAILABLE = 'unavailable';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;

function throwIfStartupAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED,
      APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOPPED,
    );
  }
}

function waitForJoinRetry(delayMs, signal) {
  throwIfStartupAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener(LOCAL_STR_ABORT, abort);
      resolve();
    }, delayMs);
    signal?.addEventListener(LOCAL_STR_ABORT, abort, {once: true});
  });
}

function createJoinMembershipLifecycleController(options) {
  return new MembershipLifecycleController({
    nodeId: options.nodeId,
    startupMode: options.startupMode,
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    delegates: {
      onDrainIntent: ({intent}) => {
        const bootstrapAPI = options.getBootstrapAPI();
        if (bootstrapAPI?.markDraining) {
          return bootstrapAPI.markDraining({
            drainDeadlineMs: intent.drainDeadlineMs,
            reasonCode: intent.reasonCode,
          });
        }
        return {
          phase: LOCAL_STR_UNAVAILABLE,
          reasons: intent.reasonCode ? [intent.reasonCode] : [],
          draining: true,
          drainDeadlineMs: intent.drainDeadlineMs,
        };
      },
    },
  });
}

function resolveJoinStartupValues(options) {
  const seedNodeAddress = String(options.seedNodeAddress || '');
  return Object.freeze({
    seedNodeAddress,
    seedNodeAddresses: Array.isArray(options.seedNodeAddresses) &&
      options.seedNodeAddresses.length > LOCAL_NUM_ZERO ?
      options.seedNodeAddresses :
      [seedNodeAddress],
    startupMode: typeof options.startupMode === 'string' &&
      options.startupMode.length > LOCAL_NUM_ZERO ?
      options.startupMode :
      STARTUP_JOIN_MODE.FRESH_JOIN,
  });
}

async function resolveFailedJoinReattempt(options) {
  const joinAttempt = Number.isInteger(options.joinAttempt) ?
    options.joinAttempt :
    LOCAL_NUM_ZERO;
  options.logger.error(ENTRYPOINT_LOG_MSG.FAILED_JOIN, {
    error: options.joinResult.error,
    phase: options.joinResult.phase,
    retryable: options.joinResult.retryable === true,
    attempt: joinAttempt,
  });
  await options.bootstrapAPI.shutdown();
  await options.nodeJoiningService.cleanup();
  const allowed = options.joinResult.retryable === true &&
    joinAttempt + LOCAL_NUM_ONE < options.reattemptPolicy.maxAttempts;
  if (!allowed) {
    throw new Error(
      options.joinResult.error || ENTRYPOINT_LOG_MSG.FAILED_JOIN,
    );
  }
  const cappedExponent = Math.min(
    joinAttempt,
    options.reattemptPolicy.backoffCapExponent,
  );
  const backoffMs = Math.min(
    options.reattemptPolicy.maxDelayMs,
    options.reattemptPolicy.baseDelayMs *
      Math.pow(LOCAL_NUM_TWO, cappedExponent),
  );
  const delayMs = Math.max(
    Number.isFinite(options.joinResult.retryAfterMs) ?
      options.joinResult.retryAfterMs :
      LOCAL_NUM_ZERO,
    backoffMs,
  );
  options.logger.warn(ENTRYPOINT_RUNTIME_VALUE.REATTEMPT_JOIN, {
    nodeId: options.nodeId,
    attempt: joinAttempt + LOCAL_NUM_ONE,
    maxAttempts: options.reattemptPolicy.maxAttempts,
    delayMs,
  });
  await waitForJoinRetry(delayMs, options.signal);
  return Object.freeze({
    joinAttempt: joinAttempt + LOCAL_NUM_ONE,
    previousLifecycleStateMachine:
      options.nodeJoiningService.getLifecycleStateMachine(),
  });
}

function resolveJoinedClusterId(nodeJoiningService, persistedClusterId) {
  const joinedClusterId = nodeJoiningService.bootstrapResponse?.clusterId;
  return typeof joinedClusterId === 'string' && joinedClusterId.length > 0 ?
    joinedClusterId :
    persistedClusterId;
}

export {
  createJoinMembershipLifecycleController,
  resolveFailedJoinReattempt,
  resolveJoinedClusterId,
  resolveJoinStartupValues,
  throwIfStartupAborted,
};
