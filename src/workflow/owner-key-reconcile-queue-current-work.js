// The reconcile queue's CURRENT-WORK completion contract.
//
// "Has everything you already admitted finished?" is a different question from
// "will you ever work again", and only the first one has an answer a caller
// can wait on. Three pieces of the queue's own lifecycle answer it and nothing
// else: `draining` is true from the moment an enqueue schedules a drain until
// that drain has claimed what it can, which is what stops a queue with work
// admitted but not yet claimed from reading as idle; `pending` holds items no
// reconcile has claimed; `inFlight` holds owner keys whose reconcile is
// running. Idle is never inferred from timers, host turns or promise counts,
// because a reconcile chain need not create any of them.
//
// Future work is deliberately excluded: an item waiting for its retry instant,
// an exhausted item and the ordinary periodic cadence are the timer owner's
// business.

const arrayPush = Function.call.bind(Array.prototype.push);
const mapSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
);
const setSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Set.prototype, 'size').get,
);

/**
 * @param {Object} queue
 * @return {boolean}
 */
function isReconcileQueueCurrentWorkIdle(queue) {
  return queue.draining === false &&
    mapSize(queue.pending) === 0 &&
    setSize(queue.inFlight) === 0;
}

/**
 * @param {Object} queue
 * @return {Promise<void>}
 */
function awaitReconcileQueueCurrentWorkIdle(queue) {
  if (isReconcileQueueCurrentWorkIdle(queue)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    arrayPush(queue._currentWorkIdleWaiters, resolve);
  });
}

/**
 * Release current-work waiters, if the queue has actually become idle.
 *
 * Every caller invokes this AFTER any follow-on drain has been scheduled, so a
 * reconcile that completes while more work is already pending cannot be
 * observed as idle in the gap between the two.
 * @param {Object} queue
 * @return {void}
 */
function notifyReconcileQueueCurrentWorkIdle(queue) {
  if (queue._currentWorkIdleWaiters.length === 0 ||
    !isReconcileQueueCurrentWorkIdle(queue)) {
    return;
  }
  const waiters = queue._currentWorkIdleWaiters;
  queue._currentWorkIdleWaiters = [];
  for (const resolve of waiters) resolve();
}

export {
  awaitReconcileQueueCurrentWorkIdle,
  isReconcileQueueCurrentWorkIdle,
  notifyReconcileQueueCurrentWorkIdle,
};
