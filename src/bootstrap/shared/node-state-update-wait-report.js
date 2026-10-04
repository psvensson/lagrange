/**
 * A retryable node-state update that ran out of targets and same-target
 * retries is a spent retry bound, reported here (subject: the node state,
 * since heartbeats re-fire it).
 */

import {reportWaitBoundSpent} from '../../logging/wait-bound-spent.js';

const NODE_STATE_UPDATE_DELIVERY_WAIT = Object.freeze({
  wait: 'nodeStateUpdateTargetCandidates',
  awaited: 'node-state update delivered to a control-plane target',
});

/**
 * @param {Object} logger - Site logger.
 * @param {string} nodeId - Reporting node.
 * @param {Error} error - The last delivery error.
 * @param {Object} failure - {targetAddress, state, publicationMode, attempts,
 *   sameTargetRetryCount, deliveryTimeoutBudgetMs, elapsedMs}.
 * @return {void}
 */
function reportNodeStateUpdateDeliverySpent(logger, nodeId, error, failure) {
  reportWaitBoundSpent(logger, {
    ...NODE_STATE_UPDATE_DELIVERY_WAIT,
    boundMs: Number.isFinite(failure.deliveryTimeoutBudgetMs) ?
      failure.deliveryTimeoutBudgetMs :
      null,
    elapsedMs: failure.elapsedMs,
    lastObserved: {
      attempts: failure.attempts,
      sameTargetRetryCount: failure.sameTargetRetryCount,
      lastTargetAddress: failure.targetAddress,
      lastErrorCode: error?.code ?? null,
      lastError: error.message,
    },
    scope: {
      nodeId,
      state: failure.state,
      publicationMode: failure.publicationMode,
    },
    subject: failure.state,
  });
}

export {reportNodeStateUpdateDeliverySpent};
