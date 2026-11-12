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
import {
  mergeWorkItemCompletionWaiters,
  rejectWorkItemCompletionWaiters,
} from './owner-key-reconcile-completion.js';

const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);

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

/**
 * Defer a work item whose owner key is already in flight: merge it back into
 * the pending map (preserving reasons already accumulated there) and record
 * the typed stale-claim diagnostic.
 * @param {Object} queue
 * @param {string} ownerKey
 * @param {Object} item
 * @return {void}
 */
function deferInFlightWorkItem(queue, ownerKey, item) {
  const existing = mapGet(queue.pending, ownerKey);
  if (existing) {
    setForEach(item.reasons, (reason) => setAdd(existing.reasons, reason));
    if (item.context !== null && item.context !== undefined) {
      existing.context = item.context;
    }
    mergeWorkItemCompletionWaiters(existing, item);
  } else {
    mapSet(queue.pending, ownerKey, item);
  }
  const diagnostic = {
    type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
    queue: queue.name,
    ownerKey,
    reasons: snapshotSetValues(item.reasons),
    timestamp: queue.now(),
  };
  queue._staleInFlightDeferralCount++;
  recordStaleFenceDiagnosticSamples(
    queue,
    diagnostic,
    STALE_FENCE_SAMPLE_CAPACITY,
  );
  queue.emit(RECONCILE_QUEUE_EVENT.STALE_CLAIM_DEFERRED, diagnostic);
  queue.logger.debug(RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_DEFERRED, {
    ...diagnostic,
  });
}

export {deferInFlightWorkItem, recordStaleFenceRejection};
