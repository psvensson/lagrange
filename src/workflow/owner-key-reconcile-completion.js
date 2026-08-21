/**
 * Completion boundary for owner-key reconciliation. Queue admission and owner
 * completion are different events; this module owns the one waiter state and
 * the only settlement rules connecting them.
 */
import {RECONCILE_QUEUE_ERROR_MSG} from './reconcile-queue-constants.js';
import {appendSnapshotValue} from './owner-key-reconcile-queue-snapshots.js';

const PromiseConstructor = Promise;
const mapForEach = Function.call.bind(Map.prototype.forEach);
const COMPLETION_WAITER_METHOD = Object.freeze({
  REJECT: 'reject',
  RESOLVE: 'resolve',
});

function createQueueStoppedError(queueName) {
  return new Error(`${queueName} is stopped`);
}

function appendCompletionWaiter(item, waiter) {
  if (!waiter) return;
  if (!Array.isArray(item.completionWaiters)) {
    item.completionWaiters = [];
  }
  appendSnapshotValue(item.completionWaiters, waiter);
}

function settleCompletionWaiter(waiter, method, value) {
  if (!waiter || waiter.settled === true) return;
  waiter.settled = true;
  waiter[method](value);
}

function settleWorkItemWaiters(item, method, value) {
  const waiters = Array.isArray(item?.completionWaiters) ?
    item.completionWaiters : [];
  for (let index = 0; index < waiters.length; index++) {
    settleCompletionWaiter(waiters[index], method, value);
  }
}

function resolveWorkItemCompletionWaiters(item, result) {
  settleWorkItemWaiters(item, COMPLETION_WAITER_METHOD.RESOLVE, result);
}

function rejectWorkItemCompletionWaiters(item, error) {
  settleWorkItemWaiters(item, COMPLETION_WAITER_METHOD.REJECT, error);
}

function mergeWorkItemCompletionWaiters(target, source) {
  const waiters = Array.isArray(source?.completionWaiters) ?
    source.completionWaiters : [];
  for (let index = 0; index < waiters.length; index++) {
    appendCompletionWaiter(target, waiters[index]);
  }
}

function enqueueAndWaitForOwner(queue, ownerKey, reason, context, options) {
  return new PromiseConstructor((resolve, reject) => {
    queue.enqueue(ownerKey, reason, context, {
      ...options,
      completionWaiter: {resolve, reject, settled: false},
    });
  });
}

function rejectAllQueueCompletionWaiters(queue) {
  const stoppedError = createQueueStoppedError(queue.name);
  const rejectItems = (items) => {
    mapForEach(items, (item) => {
      rejectWorkItemCompletionWaiters(item, stoppedError);
    });
  };
  rejectItems(queue.pending);
  rejectItems(queue.retryWorkItems);
  rejectItems(queue.exhaustedWorkItems);
  rejectItems(queue.inFlightItems);
}

function rejectStoppedCompletionWaiter(waiter, queueName) {
  settleCompletionWaiter(
    waiter,
    COMPLETION_WAITER_METHOD.REJECT,
    createQueueStoppedError(queueName),
  );
}

function rejectStaleFenceCompletionWaiter(waiter) {
  settleCompletionWaiter(
    waiter,
    COMPLETION_WAITER_METHOD.REJECT,
    new Error(RECONCILE_QUEUE_ERROR_MSG.STALE_FENCE_TOKEN),
  );
}

export {
  appendCompletionWaiter,
  enqueueAndWaitForOwner,
  mergeWorkItemCompletionWaiters,
  rejectAllQueueCompletionWaiters,
  rejectStaleFenceCompletionWaiter,
  rejectStoppedCompletionWaiter,
  rejectWorkItemCompletionWaiters,
  resolveWorkItemCompletionWaiters,
};
