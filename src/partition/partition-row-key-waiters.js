// FIFO settlement waiter queue and structured wait-receipt custody for
// partition row-key session concurrency.
// Keeps the oldest waiting transaction per row key first in wakeup order,
// retains receipt custody across WAITING_ON_KEY -> REEVALUATING ->
// REPARKED | ACQUIRED | TERMINAL transitions bound to
// (sessionId, sessionEpoch, originalDeadlineMs), and dooms ACTIVE unproposed
// deadlock-cycle victims while releasing their provisional row-key claims.

const ROW_KEY_WAIT_RECEIPT_STATE = Object.freeze({
  WAITING_ON_KEY: 'WAITING_ON_KEY',
  REEVALUATING: 'REEVALUATING',
  REPARKED: 'REPARKED',
  ACQUIRED: 'ACQUIRED',
  TERMINAL: 'TERMINAL',
});

const ROW_KEY_WAIT_CYCLE_FAILURE_REASON = 'ROW_KEY_WAIT_CYCLE_DETECTED';
const ROW_KEY_WAIT_CYCLE_SQLSTATE = '40001';
const ROW_KEY_WAIT_CYCLE_FAILURE_CODE = 'participant_transaction_already_active';
const REPLAY_DIVERGED_FAILURE_CODE = 'participant_transaction_replay_diverged';
const DEFAULT_UNSCOPED_SENTINEL = '*';
const SESSION_PHASE_ACTIVE = 'ACTIVE';
const SESSION_PHASE_DOOMED = 'DOOMED';
const TERMINAL_REASON_EXPIRED = 'expired';
const TERMINAL_REASON_STALE_EPOCH = 'stale_epoch_timeout';
const TERMINAL_REASON_SESSION_CLOSED = 'session_closed';
const TERMINAL_REASON_CLAIMS_RELEASED = 'claims_released';
const TERMINAL_REASON_REBASE_REFUSED = 'rebase_refused';
const TERMINAL_REASON_NOT_PARTICIPANT = 'not_participant_query';
const TERMINAL_REASON_REFUSED = 'refused';
const TERMINAL_REASON_ATTEMPTS_EXHAUSTED = 'attempts_exhausted';

const NON_DOOMABLE_SESSION_STATES = new Set([
  'PREPARING', 'PREPARED', 'COMMITTED', 'COMMITTING', 'ROLLED_BACK', 'REFUSED',
]);

const COMPLETION_TARGET_STATES = new Set([
  ROW_KEY_WAIT_RECEIPT_STATE.REPARKED,
  ROW_KEY_WAIT_RECEIPT_STATE.ACQUIRED,
  ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL,
]);

let nextWaitReceiptId = 0;

function rowKeyWaitersOf(service) {
  if (service.rowKeyWaiters === undefined) service.rowKeyWaiters = new Set();
  return service.rowKeyWaiters;
}

function sessionWaitContextsOf(service) {
  if (service.rowKeySessionWaitContexts === undefined) {
    service.rowKeySessionWaitContexts = new WeakMap();
  }
  return service.rowKeySessionWaitContexts;
}

function readServiceNowMs(service) {
  const now = service?.timeSource?.now?.();
  return Number.isFinite(now) ? now : Date.now();
}

const resolveSessionIdOf = (session) => session?.identity?.sessionId ?? null;
const resolveParticipantIdOf = (session) => session?.identity?.participantId ?? null;
const resolveTransactionIdOf = (session) => session?.identity?.transactionId ?? null;
const resolveSessionEpochOf = (session) => session?.identity?.transactionEpoch ?? null;

function recordSessionReceipt(session, receipt) {
  if (!session || typeof session !== 'object') return;
  session.lastWaitReceipt = receipt;
  if (!Array.isArray(session.waitReceipts)) session.waitReceipts = [];
  if (!session.waitReceipts.includes(receipt)) session.waitReceipts.push(receipt);
}

function clearReceiptTimer(receipt) {
  if (receipt && receipt.timer !== null) {
    clearTimeout(receipt.timer);
    receipt.timer = null;
  }
}

function isReceiptBoundToLiveSession(receipt, session = receipt?.session) {
  if (!receipt) return false;
  if (receipt.session === null) return session === null;
  if (!session || receipt.session !== session) return false;
  if (session.phase === SESSION_PHASE_DOOMED || session.status === SESSION_PHASE_DOOMED) {
    return false;
  }
  return resolveSessionIdOf(session) === receipt.sessionId &&
    resolveSessionEpochOf(session) === receipt.sessionEpoch;
}

function isReceiptSessionClosed(service, receipt, isSessionClosedFn = null) {
  if (!receipt) return true;
  if (receipt.session === null) return false;
  if (!isReceiptBoundToLiveSession(receipt, receipt.session)) return true;
  const checkClosed = isSessionClosedFn ?? service?.rowKeyWaiterPolicy?.isSessionClosed ?? null;
  return checkClosed !== null ? Boolean(checkClosed(receipt.session)) : false;
}

function bindRowKeyWaitServiceNotifier(service, notifyFn) {
  if (service && notifyFn) service.rowKeyWaiterNotifier = notifyFn;
}

function triggerServiceWaiterNotification(service, cyclePolicy = null) {
  if (!service) return;
  if (service.rowKeyWaiterNotifier) {
    service.rowKeyWaiterNotifier(service);
    return;
  }
  if (service.rowKeyWaiterPolicy) {
    runFifoRowKeyWaiterPass(service, service.rowKeyWaiterPolicy);
    return;
  }
  if (cyclePolicy) {
    runFifoRowKeyWaiterPass(service, {
      isSessionClosed: cyclePolicy.isSessionClosed,
      hasConflict: (waiterSession, rowKey) =>
        cyclePolicy.listHolderSessions(service, waiterSession, rowKey).length > 0,
      unscopedSentinel: DEFAULT_UNSCOPED_SENTINEL,
    });
  }
}

function getActiveSessionWaitContext(service, session) {
  if (!service || !session || typeof session !== 'object') return null;
  const map = service.rowKeySessionWaitContexts;
  const ctx = map?.get(session) ?? null;
  if (!ctx) return null;
  if (ctx.sessionId !== resolveSessionIdOf(session) ||
      ctx.sessionEpoch !== resolveSessionEpochOf(session)) {
    map.delete(session);
    return null;
  }
  return ctx;
}

function setActiveSessionWaitContext(service, session, fields) {
  if (!service || !session || typeof session !== 'object') return null;
  const map = sessionWaitContextsOf(service);
  const existing = getActiveSessionWaitContext(service, session);
  const originalDeadlineMs = Number.isFinite(existing?.originalDeadlineMs) ?
    existing.originalDeadlineMs :
    fields.originalDeadlineMs;
  const updated = {
    session,
    sessionId: resolveSessionIdOf(session),
    sessionEpoch: resolveSessionEpochOf(session),
    originalDeadlineMs,
    lastReceipt: fields.lastReceipt ?? null,
  };
  map.set(session, updated);
  return updated;
}

function clearActiveSessionWaitContext(service, session) {
  if (!service || !session) return;
  service.rowKeySessionWaitContexts?.delete(session);
}

/**
 * Bind or read the remaining wait budget for `session` from its original
 * conflict-wait deadline (never renewing the deadline across re-parks).
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Waiting participant session.
 * @param {number} candidateDeadlineMs - Initial deadline timestamp in ms.
 * @return {number} Remaining budget in milliseconds.
 */
function prepareSessionRowKeyWaitBudget(service, session, candidateDeadlineMs) {
  const nowMs = readServiceNowMs(service);
  if (!session || typeof session !== 'object') return candidateDeadlineMs - nowMs;
  const ctx = setActiveSessionWaitContext(service, session, {
    originalDeadlineMs: candidateDeadlineMs,
    lastReceipt: session.lastWaitReceipt ?? null,
  });
  return ctx.originalDeadlineMs - nowMs;
}

function settleClosedWaiterInPass(waiters, waiter) {
  if (waiter.state === ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY) {
    waiter.settleTerminal(TERMINAL_REASON_SESSION_CLOSED);
    return;
  }
  clearReceiptTimer(waiter);
  waiters.delete(waiter);
  if (waiter.state === ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING) {
    waiter.state = ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
    waiter.terminalReason = TERMINAL_REASON_SESSION_CLOSED;
  }
}

function occupyPassKey(passState, awaitedKey) {
  if (awaitedKey === passState.unscopedSentinel) {
    passState.wokenUnscoped = true;
    return;
  }
  passState.wokenKeys.add(awaitedKey);
}

function isPassKeyBlocked(passState, awaitedKey) {
  const isUnscoped = awaitedKey === passState.unscopedSentinel;
  if (passState.wokenUnscoped || passState.wokenKeys.has(awaitedKey)) return true;
  if (isUnscoped && passState.wokenKeys.size > 0) {
    passState.wokenUnscoped = true;
    return true;
  }
  return false;
}

function evaluateOneWaiterInPass(service, waiters, waiter, passState) {
  if (isReceiptSessionClosed(service, waiter, passState.isSessionClosed)) {
    settleClosedWaiterInPass(waiters, waiter);
    return;
  }
  const awaitedKey = waiter.awaitedKey ?? waiter.rowKey;
  if (waiter.state === ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING) {
    occupyPassKey(passState, awaitedKey);
    return;
  }
  if (isPassKeyBlocked(passState, awaitedKey)) return;
  if (!passState.hasConflict(waiter.session, awaitedKey)) {
    occupyPassKey(passState, awaitedKey);
    waiter.wakeForReevaluation();
  }
}

function runFifoRowKeyWaiterPass(service, {
  isSessionClosed,
  hasConflict,
  unscopedSentinel = DEFAULT_UNSCOPED_SENTINEL,
}) {
  const waiters = service?.rowKeyWaiters;
  if (!waiters || waiters.size === 0) return;
  const passState = {
    isSessionClosed, hasConflict, unscopedSentinel,
    wokenKeys: new Set(), wokenUnscoped: false,
  };
  for (const waiter of [...waiters]) {
    evaluateOneWaiterInPass(service, waiters, waiter, passState);
  }
}

/**
 * Wake eligible waiting sessions in strict FIFO registration order (at most one
 * active or reevaluating waiter per row key per notification pass), plus any
 * waiter whose session is no longer active.
 * @param {Object} service - Partition service leader.
 * @param {{isSessionClosed: Function, hasConflict: Function, unscopedSentinel: string}} policy
 */
function notifyFifoRowKeyWaiters(service, {
  isSessionClosed,
  hasConflict,
  unscopedSentinel = DEFAULT_UNSCOPED_SENTINEL,
}) {
  if (service) {
    service.rowKeyWaiterPolicy = {isSessionClosed, hasConflict, unscopedSentinel};
  }
  runFifoRowKeyWaiterPass(service, {isSessionClosed, hasConflict, unscopedSentinel});
}

function retireSupersededSessionWaiters(service, session, nextRowKey) {
  if (!service?.rowKeyWaiters || !session) return;
  for (const existing of [...service.rowKeyWaiters]) {
    if (existing.session === session &&
        existing.state === ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING) {
      clearReceiptTimer(existing);
      existing.state = ROW_KEY_WAIT_RECEIPT_STATE.REPARKED;
      existing.nextRowKey = nextRowKey;
      service.rowKeyWaiters.delete(existing);
    }
  }
}

function createStructuredWaitReceipt(service, session, rowKey, originalDeadlineMs) {
  const receipt = {
    receiptId: (nextWaitReceiptId += 1),
    session: session ?? null,
    sessionId: resolveSessionIdOf(session),
    participantId: resolveParticipantIdOf(session),
    transactionId: resolveTransactionIdOf(session),
    sessionEpoch: resolveSessionEpochOf(session),
    originalDeadlineMs,
    awaitedKey: rowKey,
    rowKey,
    nextRowKey: null,
    state: ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY,
    terminalReason: null,
    timer: null,
    wakeForReevaluation: null,
    settleTerminal: null,
    triggerTimeout: null,
    resolve: null,
  };
  recordSessionReceipt(session, receipt);
  setActiveSessionWaitContext(service, session, {originalDeadlineMs, lastReceipt: receipt});
  return receipt;
}

function resolveInitialAndRemainingWaitMs(service, session, boundedWaitMs) {
  const nowMs = readServiceNowMs(service);
  const requestedMs = Math.max(1, Math.floor(boundedWaitMs));
  const ctx = getActiveSessionWaitContext(service, session);
  const originalDeadlineMs = Number.isFinite(ctx?.originalDeadlineMs) ?
    ctx.originalDeadlineMs :
    nowMs + requestedMs;
  return {
    originalDeadlineMs,
    effectiveWaitMs: Math.min(requestedMs, originalDeadlineMs - nowMs),
  };
}

/**
 * Enqueue a bounded conflict-settlement waiter and resolve with
 * `{waited, settled, receipt}`. Preserves `originalDeadlineMs` across re-parks
 * for the same `(sessionId, sessionEpoch)` and binds timeouts to that exact
 * session and epoch.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Waiting participant session.
 * @param {string} rowKey - Conflicting row key or sentinel.
 * @param {number} boundedWaitMs - Positive wait limit in milliseconds.
 * @return {Promise<{waited: boolean, settled: boolean, receipt: Object}>} Wait outcome.
 */
function enqueueBoundedRowKeyWaiter(service, session, rowKey, boundedWaitMs) {
  retireSupersededSessionWaiters(service, session, rowKey);
  const {originalDeadlineMs, effectiveWaitMs} =
    resolveInitialAndRemainingWaitMs(service, session, boundedWaitMs);
  const receipt = createStructuredWaitReceipt(service, session, rowKey, originalDeadlineMs);
  if (effectiveWaitMs <= 0) {
    receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
    receipt.terminalReason = TERMINAL_REASON_EXPIRED;
    clearActiveSessionWaitContext(service, session);
    return Promise.resolve({waited: false, settled: false, receipt});
  }
  return new Promise((resolve) => {
    const waiters = rowKeyWaitersOf(service);
    let settledOnce = false;
    receipt.wakeForReevaluation = () => {
      if (settledOnce || receipt.state !== ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY) return false;
      settledOnce = true;
      clearReceiptTimer(receipt);
      receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING;
      resolve({waited: true, settled: true, receipt});
      return true;
    };
    receipt.settleTerminal = (reason, extra = {}) => {
      if (settledOnce) return false;
      settledOnce = true;
      clearReceiptTimer(receipt);
      waiters.delete(receipt);
      receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
      receipt.terminalReason = reason;
      resolve({waited: true, settled: false, receipt, ...extra});
      return true;
    };
    receipt.triggerTimeout = () => {
      if (settledOnce || receipt.state !== ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY) return false;
      const closedOrReplaced = isReceiptSessionClosed(service, receipt);
      const reason = closedOrReplaced ? TERMINAL_REASON_STALE_EPOCH : TERMINAL_REASON_EXPIRED;
      if (!closedOrReplaced) clearActiveSessionWaitContext(service, session);
      return receipt.settleTerminal(reason, closedOrReplaced ? {staleEpochIgnored: true} : {});
    };
    receipt.resolve = (settled) =>
      (settled === true ? receipt.wakeForReevaluation() : receipt.triggerTimeout());
    waiters.add(receipt);
    receipt.timer = setTimeout(() => {
      receipt.triggerTimeout();
    }, Math.max(1, Math.floor(effectiveWaitMs)));
  });
}

/**
 * Ensure an active `REEVALUATING` receipt exists for a woken or immediately
 * settled wait before running reevaluation.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Waiting participant session.
 * @param {string} rowKey - Awaited row key.
 * @param {number} originalDeadlineMs - Initial conflict-wait deadline.
 * @param {Object|null} [existingReceipt] - Receipt returned by wait outcome.
 * @return {Object} Receipt in REEVALUATING (or TERMINAL) state.
 */
function ensureRowKeyReevaluationReceipt(
  service, session, rowKey, originalDeadlineMs, existingReceipt = null,
) {
  if (existingReceipt) return existingReceipt;
  const lastReceipt = session?.lastWaitReceipt ?? null;
  if (lastReceipt &&
      lastReceipt.awaitedKey === rowKey &&
      lastReceipt.state === ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL) {
    return lastReceipt;
  }
  const receipt = createStructuredWaitReceipt(service, session, rowKey, originalDeadlineMs);
  receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING;
  return receipt;
}

function isReparkedOutcome(outcome) {
  if (outcome.reparked === true) return true;
  return typeof outcome.nextRowKey === 'string' && outcome.nextRowKey.length > 0;
}

const isAcquiredOutcome = (outcome) =>
  outcome.acquired === true || outcome.answer?.success === true;

function resolveReevaluationTargetState(outcome = {}) {
  if (COMPLETION_TARGET_STATES.has(outcome.state)) return outcome.state;
  if (isReparkedOutcome(outcome)) return ROW_KEY_WAIT_RECEIPT_STATE.REPARKED;
  return isAcquiredOutcome(outcome) ?
    ROW_KEY_WAIT_RECEIPT_STATE.ACQUIRED :
    ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
}

function applyReceiptCompletionState(service, receipt, targetState, outcome) {
  clearReceiptTimer(receipt);
  service?.rowKeyWaiters?.delete(receipt);
  if (COMPLETION_TARGET_STATES.has(receipt.state)) {
    if (receipt.state !== ROW_KEY_WAIT_RECEIPT_STATE.REPARKED) {
      clearActiveSessionWaitContext(service, receipt.session);
    }
    return receipt.state;
  }
  receipt.state = targetState;
  if (targetState === ROW_KEY_WAIT_RECEIPT_STATE.REPARKED) {
    receipt.nextRowKey = outcome.nextRowKey ?? null;
    setActiveSessionWaitContext(service, receipt.session, {
      originalDeadlineMs: receipt.originalDeadlineMs,
      lastReceipt: receipt,
    });
  } else {
    receipt.terminalReason = outcome.reason ?? null;
    clearActiveSessionWaitContext(service, receipt.session);
  }
  return targetState;
}

/**
 * Single owner completion transition for row-key wait reevaluation.
 * Performs queue removal, timer cleanup, state transition
 * (`REEVALUATING -> REPARKED | ACQUIRED | TERMINAL`), budget custody update,
 * and old-key FIFO wake handoff. Completed receipts remain immutable.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} receipt - Wait receipt being completed.
 * @param {Object} [outcome] - Reevaluation outcome descriptor.
 * @return {{state: string, receipt: Object|null, answer: *}}
 */
function completeRowKeyWaitReevaluation(service, receipt, outcome = {}) {
  const targetState = resolveReevaluationTargetState(outcome);
  const effectiveState = receipt ?
    applyReceiptCompletionState(service, receipt, targetState, outcome) :
    targetState;
  triggerServiceWaiterNotification(service, outcome.policy ?? null);
  return {state: effectiveState, receipt: receipt ?? null, answer: outcome.answer ?? null};
}

function clearProvisionalSessionFootprint(session) {
  if (!session || typeof session !== 'object') return false;
  let released = false;
  if (session.touchedRowKeys instanceof Set && session.touchedRowKeys.size > 0) {
    session.touchedRowKeys.clear();
    released = true;
  }
  if (session.hasUnscopedWrite === true) {
    session.hasUnscopedWrite = false;
    released = true;
  }
  if (session.stagedLockClaims?.rowKeys instanceof Set &&
      session.stagedLockClaims.rowKeys.size > 0) {
    session.stagedLockClaims.rowKeys.clear();
    released = true;
  }
  if (session.stagedLockClaims?.hasUnscopedWrite === true) {
    session.stagedLockClaims.hasUnscopedWrite = false;
    released = true;
  }
  return released;
}

function terminateSessionWaitReceipts(service, session) {
  const waiters = service?.rowKeyWaiters;
  if (!waiters || waiters.size === 0 || !session) return false;
  let removed = false;
  for (const receipt of [...waiters]) {
    if (receipt.session !== session) continue;
    removed = true;
    if (receipt.state === ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY) {
      receipt.settleTerminal(TERMINAL_REASON_CLAIMS_RELEASED);
    } else {
      clearReceiptTimer(receipt);
      waiters.delete(receipt);
      receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
      receipt.terminalReason = TERMINAL_REASON_CLAIMS_RELEASED;
    }
  }
  return removed;
}

/**
 * Single owner claim-release transition for a participant session.
 * Releases provisional row-key and staged lock claims, terminates any pending
 * wait receipts owned by the session, and wakes the next eligible FIFO waiters.
 * @param {Object} service - Partition service leader.
 * @param {Object|null} session - Participant session releasing claims.
 * @param {Object|null} [cyclePolicy] - Optional cycle policy override.
 * @return {{released: boolean, terminatedWaiters: boolean}}
 */
function releaseRowKeySessionClaims(service, session, cyclePolicy = null) {
  const released = clearProvisionalSessionFootprint(session);
  const terminatedWaiters = terminateSessionWaitReceipts(service, session);
  clearActiveSessionWaitContext(service, session);
  triggerServiceWaiterNotification(service, cyclePolicy);
  return {released, terminatedWaiters};
}

function isActiveWaitReceiptForCycle(waiter, isSessionClosed) {
  if (!waiter?.session || isSessionClosed(waiter.session)) return false;
  return waiter.state === undefined ||
    waiter.state === ROW_KEY_WAIT_RECEIPT_STATE.WAITING_ON_KEY ||
    waiter.state === ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING;
}

function collectAwaitedKeysBySession(waiters, isSessionClosed) {
  const awaitedBySession = new Map();
  for (const waiter of waiters) {
    if (!isActiveWaitReceiptForCycle(waiter, isSessionClosed)) continue;
    const key = waiter.awaitedKey ?? waiter.rowKey;
    let keys = awaitedBySession.get(waiter.session);
    if (keys === undefined) {
      keys = [];
      awaitedBySession.set(waiter.session, keys);
    }
    keys.push(key);
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

function isActiveSessionPhase(session) {
  if (session.phase === SESSION_PHASE_ACTIVE) return true;
  return session.phase === undefined && session.status === SESSION_PHASE_ACTIVE;
}

/**
 * Determine whether `session` is an ACTIVE, unproposed session that can be
 * safely doomed on local wait-for cycle detection.
 * @param {Object|null} session - Candidate participant session.
 * @return {boolean}
 */
function canDoomSessionOnLocalWaitCycle(session) {
  if (!session || typeof session !== 'object') return false;
  if (NON_DOOMABLE_SESSION_STATES.has(session.phase) ||
      NON_DOOMABLE_SESSION_STATES.has(session.status) ||
      NON_DOOMABLE_SESSION_STATES.has(session.state)) {
    return false;
  }
  if (!isActiveSessionPhase(session)) return false;
  if (session.sealed !== null && session.sealed !== undefined) return false;
  return session.inFlight !== true && session.proposed !== true;
}

function doomActiveSessionOnWaitCycle(service, session, rowKey, policy) {
  if (!canDoomSessionOnLocalWaitCycle(session)) {
    return {doomed: false, released: false, receipt: null};
  }
  const ctx = getActiveSessionWaitContext(service, session);
  const originalDeadlineMs = ctx?.originalDeadlineMs ?? readServiceNowMs(service);
  session.phase = SESSION_PHASE_DOOMED;
  if (session.status !== undefined) session.status = SESSION_PHASE_DOOMED;
  session.doomCode = ROW_KEY_WAIT_CYCLE_FAILURE_CODE;
  session.failureReason = ROW_KEY_WAIT_CYCLE_FAILURE_REASON;
  session.deadlockDetected = true;
  session.cycleAwaitedRowKey = rowKey;
  const {released} = releaseRowKeySessionClaims(service, session, policy);
  const receipt = createStructuredWaitReceipt(service, session, rowKey, originalDeadlineMs);
  receipt.state = ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL;
  receipt.terminalReason = ROW_KEY_WAIT_CYCLE_FAILURE_REASON;
  clearActiveSessionWaitContext(service, session);
  return {doomed: true, released, receipt};
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
  let cycleDetected = enqueueUnvisitedHolders(
    queue, visited, listHolderSessions(service, session, rowKey), session);
  while (!cycleDetected && queue.length > 0) {
    const holder = queue.shift();
    if (visited.has(holder)) continue;
    visited.add(holder);
    if (holderFormsCycle(service, holder, session, awaitedBySession, queue, visited,
      listHolderSessions)) {
      cycleDetected = true;
    }
  }
  if (cycleDetected) {
    doomActiveSessionOnWaitCycle(service, session, rowKey, {isSessionClosed, listHolderSessions});
  }
  return cycleDetected;
}

function classifyRowKeyReevaluationAnswer(reevaluated) {
  let classified;
  if (reevaluated === null) {
    classified = {
      done: true,
      outcome: {
        state: ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL,
        reason: TERMINAL_REASON_NOT_PARTICIPANT,
        answer: null,
      },
    };
  } else if (reevaluated.success === true) {
    classified = {
      done: true,
      outcome: {state: ROW_KEY_WAIT_RECEIPT_STATE.ACQUIRED, answer: reevaluated},
    };
  } else if (reevaluated.failureCode !== ROW_KEY_WAIT_CYCLE_FAILURE_CODE ||
      typeof reevaluated.detail !== 'string') {
    classified = {
      done: true,
      outcome: {
        state: ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL,
        reason: TERMINAL_REASON_REFUSED,
        answer: reevaluated,
      },
    };
  } else {
    classified = {
      done: false,
      outcome: {
        state: ROW_KEY_WAIT_RECEIPT_STATE.REPARKED,
        nextRowKey: reevaluated.detail,
        answer: reevaluated,
      },
    };
  }
  return classified;
}

function decorateParticipantRowKeyWaitFailure(service, session, answer) {
  if (!answer || answer.success === true) return answer;
  if (answer.failureCode === REPLAY_DIVERGED_FAILURE_CODE && session) {
    releaseRowKeySessionClaims(service, session);
    return answer;
  }
  const isCycleRefusal = answer.failureCode === ROW_KEY_WAIT_CYCLE_FAILURE_CODE &&
    (session?.deadlockDetected === true ||
      session?.failureReason === ROW_KEY_WAIT_CYCLE_FAILURE_REASON ||
      answer.failureReason === ROW_KEY_WAIT_CYCLE_FAILURE_REASON);
  if (!isCycleRefusal) return answer;
  return {
    ...answer,
    failureCode: ROW_KEY_WAIT_CYCLE_FAILURE_CODE,
    failureReason: ROW_KEY_WAIT_CYCLE_FAILURE_REASON,
    deadlockDetected: true,
    conflict: true,
    retryable: true,
    sqlState: ROW_KEY_WAIT_CYCLE_SQLSTATE,
  };
}

function resolveTerminalAttemptReceipt(service, session, receipt, awaitedKey, originalDeadlineMs) {
  const needsFreshAttemptReceipt =
    (!receipt ||
      (COMPLETION_TARGET_STATES.has(receipt.state) &&
        receipt.state !== ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL)) &&
    typeof awaitedKey === 'string' &&
    awaitedKey.length > 0;
  if (!needsFreshAttemptReceipt) return receipt;
  const deadlineMs = Number.isFinite(originalDeadlineMs) ?
    originalDeadlineMs :
    readServiceNowMs(service);
  const created = createStructuredWaitReceipt(service, session, awaitedKey, deadlineMs);
  created.state = ROW_KEY_WAIT_RECEIPT_STATE.REEVALUATING;
  return created;
}

function finishTerminalRowKeyWaitReevaluation(
  service, session, receipt, reason, answer, awaitedKey = null, originalDeadlineMs = null,
) {
  const targetReceipt = resolveTerminalAttemptReceipt(
    service, session, receipt, awaitedKey, originalDeadlineMs);
  const existingReason = targetReceipt?.terminalReason ?? null;
  const defaultReason = session?.deadlockDetected === true ?
    ROW_KEY_WAIT_CYCLE_FAILURE_REASON :
    TERMINAL_REASON_EXPIRED;
  completeRowKeyWaitReevaluation(service, targetReceipt, {
    state: ROW_KEY_WAIT_RECEIPT_STATE.TERMINAL,
    reason: reason ?? existingReason ?? defaultReason,
    answer,
  });
  return decorateParticipantRowKeyWaitFailure(service, session, answer);
}

function finishRebaseRefusedRowKeyWaitReevaluation(service, session, receipt, answer) {
  return finishTerminalRowKeyWaitReevaluation(
    service, session, receipt, TERMINAL_REASON_REBASE_REFUSED, answer);
}

function finishAttemptsExhaustedRowKeyWaitReevaluation(
  service, session, receipt, answer, originalDeadlineMs = null,
) {
  return finishTerminalRowKeyWaitReevaluation(
    service, session, receipt, TERMINAL_REASON_ATTEMPTS_EXHAUSTED,
    answer, answer?.detail ?? null, originalDeadlineMs);
}

export {
  bindRowKeyWaitServiceNotifier,
  canDoomSessionOnLocalWaitCycle,
  classifyRowKeyReevaluationAnswer,
  completeRowKeyWaitReevaluation,
  decorateParticipantRowKeyWaitFailure,
  enqueueBoundedRowKeyWaiter,
  ensureRowKeyReevaluationReceipt,
  finishAttemptsExhaustedRowKeyWaitReevaluation,
  finishRebaseRefusedRowKeyWaitReevaluation,
  finishTerminalRowKeyWaitReevaluation,
  hasRowKeyWaitForCycle,
  notifyFifoRowKeyWaiters,
  prepareSessionRowKeyWaitBudget,
  releaseRowKeySessionClaims,
};
