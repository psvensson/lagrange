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

function collectAwaitedKeysBySession(waiters, isSessionClosed) {
  const awaitedBySession = new Map();
  for (const waiter of waiters) {
    if (!waiter.session || isSessionClosed(waiter.session)) continue;
    let keys = awaitedBySession.get(waiter.session);
    if (keys === undefined) {
      keys = [];
      awaitedBySession.set(waiter.session, keys);
    }
    keys.push(waiter.rowKey);
  }
  return awaitedBySession;
}

function enqueueUnvisitedHolders(queue, visited, holders, selfSession) {
  for (const holder of holders) {
    if (holder === selfSession) return true;
    if (!visited.has(holder)) queue.push(holder);
  }
  return false;
}

function holderFormsCycle(service, holder, session, awaitedBySession, queue, visited, listHolders) {
  const awaitedKeys = awaitedBySession.get(holder);
  if (!awaitedKeys) return false;
  for (const nextKey of awaitedKeys) {
    if (enqueueUnvisitedHolders(queue, visited, listHolders(service, holder, nextKey), session)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect whether parking `session` on `rowKey` creates a wait-for cycle with
 * currently parked row-key waiters on the same partition service.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Candidate waiting participant session.
 * @param {string} rowKey - Conflicting row key or sentinel.
 * @param {{isSessionClosed: Function, listHolderSessions: Function}} policy
 * @return {boolean} True when waiting would form a cycle.
 */
function hasRowKeyWaitForCycle(service, session, rowKey, {
  isSessionClosed,
  listHolderSessions,
}) {
  const waiters = service?.rowKeyWaiters;
  if (!session || !waiters || waiters.size === 0) return false;
  const awaitedBySession = collectAwaitedKeysBySession(waiters, isSessionClosed);
  const visited = new Set([session]);
  const queue = [];
  if (enqueueUnvisitedHolders(queue, visited, listHolderSessions(service, session, rowKey),
    session)) {
    return true;
  }
  while (queue.length > 0) {
    const holder = queue.shift();
    if (visited.has(holder)) continue;
    visited.add(holder);
    if (holderFormsCycle(service, holder, session, awaitedBySession, queue, visited,
      listHolderSessions)) {
      return true;
    }
  }
  return false;
}

export {
  enqueueBoundedRowKeyWaiter,
  hasRowKeyWaitForCycle,
  notifyFifoRowKeyWaiters,
};
