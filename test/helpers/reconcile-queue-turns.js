// The reconcile queue drains on its own host turn (setImmediate), so a test
// waits for queue work by turns or by the queue's own idle signal, never by
// counting microtask ticks.

/**
 * One host turn: any drain the queue scheduled before this call has run
 * (and started its reconciles up to their first await).
 * @return {Promise<void>}
 */
function drainTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Wait until the queue's current work is idle, bounded by a number of host
 * turns so a test whose reconcile is deliberately held still continues.
 * @param {Object} queue an OwnerKeyReconcileQueue
 * @param {number} [maxTurns]
 * @return {Promise<void>}
 */
async function settleReconcileQueue(queue, maxTurns = 50) {
  for (let turn = 0; turn < maxTurns; turn += 1) {
    await drainTurn();
    if (queue.isCurrentWorkIdle()) {
      return;
    }
  }
}

/**
 * Settle every reconcile queue a ReplicaDispatchService owns, until all are
 * idle together (one queue's run may enqueue into another).
 * @param {Object} service a ReplicaDispatchService
 * @param {number} [maxTurns]
 * @return {Promise<void>}
 */
async function settleReplicaDispatchQueues(service, maxTurns = 50) {
  const queues = [
    ...service.operationDispatchQueues,
    service.nodeReadyRetryQueue,
    service.membershipPublicationAdvanceQueue,
  ];
  for (let turn = 0; turn < maxTurns; turn += 1) {
    await drainTurn();
    if (queues.every((queue) => queue.isCurrentWorkIdle())) {
      return;
    }
  }
}

export {drainTurn, settleReconcileQueue, settleReplicaDispatchQueues};
