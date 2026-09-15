// The stale-fence rejection record: one diagnostic, emitted, sampled, logged,
// and delivered to the waiting caller as a typed failure.
//
// It lives beside the queue rather than inside it because it is entirely
// bookkeeping: the queue decides that a claim is stale, and this records what
// that decision was and tells everyone who needs to know.
import {
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_EVENT,
  RECONCILE_QUEUE_LOG_MSG,
  STALE_FENCE_SAMPLE_CAPACITY,
} from './reconcile-queue-constants.js';
import {
  recordStaleFenceDiagnosticSamples,
  snapshotSetValues,
} from './owner-key-reconcile-queue-snapshots.js';
import {rejectWorkItemCompletionWaiters} from './owner-key-reconcile-completion.js';

/**
 * @param {Object} queue
 * @param {string} ownerKey
 * @param {Object} item
 * @param {number} providedToken
 * @param {number} currentToken
 * @return {void}
 */
function recordStaleFenceRejection(
  queue, ownerKey, item, providedToken, currentToken,
) {
  const diagnostic = {
    type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
    queue: queue.name,
    ownerKey,
    reasons: snapshotSetValues(item.reasons),
    providedToken,
    currentToken,
    timestamp: queue.now(),
  };
  queue._staleFenceRejectionCount++;
  recordStaleFenceDiagnosticSamples(
    queue,
    diagnostic,
    STALE_FENCE_SAMPLE_CAPACITY,
  );
  queue.emit(RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN, diagnostic);
  rejectWorkItemCompletionWaiters(
    item,
    new Error(RECONCILE_QUEUE_ERROR_MSG.STALE_FENCE_TOKEN),
  );
  queue.logger.debug(RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, {
    ...diagnostic,
  });
}

export {recordStaleFenceRejection};
