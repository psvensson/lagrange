// FIFO settlement waiter queue for partition row-key session concurrency.
// Keeps the oldest waiting transaction per row key first in wakeup order
// without stampeding concurrent waiters on the same key.

function rowKeyWaitersOf(service) {
  if (service.rowKeyWaiters === undefined) {
    service.rowKeyWaiters = new Set();
  }
  return service.rowKeyWaiters;
}

/**
 * Wake eligible waiting sessions in strict FIFO registration order (at most one
 * active waiter per row key per notification pass), plus any waiter whose
 * session is no longer active.
 * @param {Object} service - Partition service leader.
 * @param {{isSessionClosed: Function, hasConflict: Function, unscopedSentinel: string}} policy
 */
function notifyFifoRowKeyWaiters(service, {
  isSessionClosed,
  hasConflict,
  unscopedSentinel,
}) {
  const waiters = service.rowKeyWaiters;
  if (!waiters || waiters.size === 0) {
    return;
  }
  const wokenKeys = new Set();
  let wokenUnscoped = false;
  for (const waiter of [...waiters]) {
    if (isSessionClosed(waiter.session)) {
      waiters.delete(waiter);
      waiter.resolve(true);
      continue;
    }
    const isUnscoped = waiter.rowKey === unscopedSentinel;
    if (wokenUnscoped || (isUnscoped && wokenKeys.size > 0) ||
        wokenKeys.has(waiter.rowKey)) {
      if (isUnscoped) wokenUnscoped = true;
      continue;
    }
    if (!hasConflict(waiter.session, waiter.rowKey)) {
      waiters.delete(waiter);
      if (isUnscoped) wokenUnscoped = true;
      else wokenKeys.add(waiter.rowKey);
      waiter.resolve(true);
    }
  }
}

/**
 * Enqueue a bounded conflict-settlement waiter and resolve with {waited, settled}.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Waiting participant session.
 * @param {string} rowKey - Conflicting row key or sentinel.
 * @param {number} boundedWaitMs - Positive wait limit in milliseconds.
 * @return {Promise<{waited: boolean, settled: boolean}>} Wait outcome.
 */
function enqueueBoundedRowKeyWaiter(service, session, rowKey, boundedWaitMs) {
  return new Promise((resolve) => {
    const waiters = rowKeyWaitersOf(service);
    let timer = null;
    const waiter = {
      session,
      rowKey,
      resolve(settled) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        waiters.delete(waiter);
        resolve({waited: true, settled});
      },
    };
    waiters.add(waiter);
    timer = setTimeout(() => waiter.resolve(false), boundedWaitMs);
  });
}

export {
  enqueueBoundedRowKeyWaiter,
  notifyFifoRowKeyWaiters,
};
