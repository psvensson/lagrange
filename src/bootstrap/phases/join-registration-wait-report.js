/**
 * Join node registration retries a retryable control-plane failure up to a
 * maximum attempt count; an exhausted count is reported here. A
 * non-retryable error is a plain failure, not a spent bound, and is left to
 * the caller.
 */

import {reportWaitBoundSpent} from '../../logging/wait-bound-spent.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';

const JOIN_NODE_REGISTRATION_WAIT = Object.freeze({
  wait: 'JOIN_NODE_REGISTRATION_MAX_ATTEMPTS',
  awaited: 'join node registration accepted by the control plane',
});

/**
 * @param {Object} phase - The query-system-state phase.
 * @param {Error} error - The last registration error.
 * @param {Object} spent - {attempt, maxAttempts, elapsedMs}.
 * @return {void}
 */
function reportJoinRegistrationRetriesSpent(phase, error, spent) {
  if (!isRetryableControlPlaneError(error)) {
    return;
  }
  reportWaitBoundSpent(phase.delegates.getLogger(), {
    ...JOIN_NODE_REGISTRATION_WAIT,
    boundMs: null,
    elapsedMs: spent.elapsedMs,
    lastObserved: {
      attempts: spent.attempt,
      maxAttempts: spent.maxAttempts,
      lastErrorCode: error?.code ?? null,
      lastError: error?.message || String(error),
      retryAfterMs: getControlPlaneRetryAfterMs(error),
    },
    scope: {nodeId: phase.nodeId},
  });
}

export {reportJoinRegistrationRetriesSpent};
