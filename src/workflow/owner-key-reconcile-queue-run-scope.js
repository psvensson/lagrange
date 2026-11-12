// The reconcile queue's run boundary: what an enqueue of an owner key whose
// reconcile is in flight does, and when a re-enqueued key may run again.
//
// The class this closes (D1): a reconcile re-enqueued its own owner key with
// the input it had just evaluated and the queue drained it on a microtask, so
// the same input was re-evaluated for ever while timers and I/O starved. The
// queue cannot tell a replay from a real change by looking at the input, and
// it cannot tell an enqueue made by the run itself from an event that
// arrived during it without async-context tracking (AsyncLocalStorage turns
// on promise hooks process-wide; measured ~3x on an await-heavy loop, so the
// queue does not pay for it). In the manner of a controller work queue (a
// key dirtied while processing runs again after it, and repeated requeues of
// one key are rate-limited):
//
//  - Turn boundary. Every drain starts on its own host turn (the queue's
//    one drain scheduler, a macrotask), so no chain of runs can starve
//    timers or I/O.
//  - Declarations. An enqueue made while the key is in flight may declare
//    `selfRequeue`: `{changed}` names what changed (admitted; restarts the
//    key's rate limit), `{delayMs}` is held until the delay has passed. A
//    malformed declaration is a programming error (TypeError).
//  - Rate limit. A key re-enqueued during each of its consecutive runs with
//    no declared change gets FREE_RUNS successors on the next host turn; after that each successor is held, doubling from BASE_MS up to
//    MAX_MS, and each hold is counted, sampled, emitted and logged. A held
//    run is never dropped (a same-key wake may be a real change the queue
//    cannot recognise, R12); it is only never admitted at once.
//  - A hold never replays over newer input: an enqueue of the key while it
//    is not in flight releases the hold first and its input overrides.
import {
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_EVENT,
  RECONCILE_QUEUE_IN_FLIGHT_REQUEUE,
  RECONCILE_QUEUE_LOG_MSG,
  RECONCILE_QUEUE_REQUEUE_RATE_LIMIT,
  STALE_FENCE_SAMPLE_CAPACITY,
} from './reconcile-queue-constants.js';
import {
  mergeWorkItemCompletionWaiters,
  rejectWorkItemCompletionWaiters,
} from './owner-key-reconcile-completion.js';
import {snapshotSetValues} from './owner-key-reconcile-queue-snapshots.js';

const MapConstructor = Map;
const SetConstructor = Set;
const TypeErrorConstructor = TypeError;
const arrayPush = Function.call.bind(Array.prototype.push);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const setAdd = Function.call.bind(Set.prototype.add);
const setClear = Function.call.bind(Set.prototype.clear);
const setDelete = Function.call.bind(Set.prototype.delete);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const numberIsSafeInteger = Number.isSafeInteger;
const objectHasOwn = Object.hasOwn;
const mathMin = Math.min;
const SELF_REQUEUE_OPTION = 'selfRequeue';
const CHANGED_FIELD = 'changed';
const DELAY_FIELD = 'delayMs';

/**
 * Initialise the run-boundary state a queue owns.
 * @param {Object} queue
 * @return {void}
 */
function initializeReconcileRunScope(queue) {
  /** @type {Set<string>} in-flight keys whose successor names a change */
  queue.declaredChangeOwnerKeys = new SetConstructor();
  /** @type {Map<string, {timer: *, item: Object|null, entries: Array}>} */
  queue.heldRequeues = new MapConstructor();
  /** @type {Map<string, number>} consecutive undeclared successors per key */
  queue.requeueStreaks = new MapConstructor();
  queue.releasingHeldOwnerKey = null;
  queue._rateLimitedRequeueCount = 0;
  queue._rateLimitedRequeueSamples = [];
  queue._rateLimitedRequeueSampleIndex = 0;
}

function readSelfRequeueDeclaration(options) {
  if (!options || !objectHasOwn(options, SELF_REQUEUE_OPTION)) {
    return RECONCILE_QUEUE_IN_FLIGHT_REQUEUE.UNDECLARED;
  }
  const declaration = options[SELF_REQUEUE_OPTION];
  const hasChanged = declaration && objectHasOwn(declaration, CHANGED_FIELD);
  const hasDelay = declaration && objectHasOwn(declaration, DELAY_FIELD);
  if (hasChanged && !hasDelay &&
      typeof declaration[CHANGED_FIELD] === 'string' &&
      declaration[CHANGED_FIELD].length > 0) {
    return RECONCILE_QUEUE_IN_FLIGHT_REQUEUE.CHANGED;
  }
  if (hasDelay && !hasChanged &&
      numberIsSafeInteger(declaration[DELAY_FIELD]) &&
      declaration[DELAY_FIELD] > 0) {
    return RECONCILE_QUEUE_IN_FLIGHT_REQUEUE.DELAYED;
  }
  throw new TypeErrorConstructor(
    RECONCILE_QUEUE_ERROR_MSG.SELF_REQUEUE_DECLARATION_INVALID);
}

function stripSelfRequeueDeclaration(options) {
  if (!options || !objectHasOwn(options, SELF_REQUEUE_OPTION)) {
    return options;
  }
  const stripped = {...options};
  delete stripped[SELF_REQUEUE_OPTION];
  return stripped;
}

function releaseHeldRequeue(queue, ownerKey) {
  const held = mapGet(queue.heldRequeues, ownerKey);
  if (!held) {
    return;
  }
  mapDelete(queue.heldRequeues, ownerKey);
  queue.clearTimeoutFn(held.timer);
  if (held.item) {
    const pending = mapGet(queue.pending, ownerKey);
    if (pending) {
      // The pending input is newer than the held one: keep its context.
      setForEach(held.item.reasons, (reason) => setAdd(pending.reasons, reason));
      mergeWorkItemCompletionWaiters(pending, held.item);
    } else {
      mapSet(queue.pending, ownerKey, held.item);
    }
  }
  // The held work itself is not newer input: it keeps the rate limit.
  queue.releasingHeldOwnerKey = ownerKey;
  try {
    for (const entry of held.entries) {
      queue.enqueue(ownerKey, entry.reason, entry.context, entry.options);
    }
  } finally {
    queue.releasingHeldOwnerKey = null;
  }
  queue.scheduleDrain();
}

function holdFor(queue, ownerKey, delayMs) {
  let held = mapGet(queue.heldRequeues, ownerKey);
  if (!held) {
    held = {timer: null, item: null, entries: []};
    mapSet(queue.heldRequeues, ownerKey, held);
    const armed = held;
    held.timer = queue.setTimeoutFn(() => {
      if (mapGet(queue.heldRequeues, ownerKey) === armed) {
        releaseHeldRequeue(queue, ownerKey);
      }
    }, delayMs);
  }
  return held;
}

/**
 * Apply the in-flight re-enqueue contract to one enqueue.
 * @param {Object} queue
 * @param {string} ownerKey
 * @param {string} reason
 * @param {*} context
 * @param {Object|undefined} options
 * @return {boolean} true when the enqueue was held (not admitted now)
 */
function holdRequeueIfOwed(queue, ownerKey, reason, context, options) {
  const declaration = readSelfRequeueDeclaration(options);
  if (queue.stopped || !ownerKey ||
      queue.releasingHeldOwnerKey === ownerKey) {
    return false;
  }
  if (!setHas(queue.inFlight, ownerKey)) {
    // Input from outside a run supersedes a held one: release it first so
    // this enqueue's input overrides it.
    if (mapGet(queue.heldRequeues, ownerKey)) {
      releaseHeldRequeue(queue, ownerKey);
    }
    return false;
  }
  if (declaration === RECONCILE_QUEUE_IN_FLIGHT_REQUEUE.DELAYED) {
    const held = holdFor(queue, ownerKey,
      options[SELF_REQUEUE_OPTION][DELAY_FIELD]);
    arrayPush(held.entries,
      {reason, context, options: stripSelfRequeueDeclaration(options)});
    return true;
  }
  if (declaration === RECONCILE_QUEUE_IN_FLIGHT_REQUEUE.CHANGED) {
    setAdd(queue.declaredChangeOwnerKeys, ownerKey);
  }
  return false;
}

function resolveRateLimitDelayMs(streak) {
  const limited = streak - RECONCILE_QUEUE_REQUEUE_RATE_LIMIT.FREE_RUNS;
  if (limited <= 0) {
    return 0;
  }
  return mathMin(
    RECONCILE_QUEUE_REQUEUE_RATE_LIMIT.BASE_MS * (2 ** (limited - 1)),
    RECONCILE_QUEUE_REQUEUE_RATE_LIMIT.MAX_MS,
  );
}

function recordRateLimitedRequeue(queue, ownerKey, item, streak, delayMs) {
  const diagnostic = {
    type: RECONCILE_QUEUE_DIAGNOSTIC.RATE_LIMITED_REQUEUE,
    queue: queue.name,
    ownerKey,
    reasons: snapshotSetValues(item.reasons),
    consecutiveRuns: streak,
    delayMs,
    timestamp: queue.now(),
  };
  queue._rateLimitedRequeueCount++;
  const samples = queue._rateLimitedRequeueSamples;
  const index = queue._rateLimitedRequeueSampleIndex;
  if (samples.length < STALE_FENCE_SAMPLE_CAPACITY) {
    arrayPush(samples, diagnostic);
  } else {
    samples[index] = diagnostic;
  }
  queue._rateLimitedRequeueSampleIndex =
    (index + 1) % STALE_FENCE_SAMPLE_CAPACITY;
  queue.emit(RECONCILE_QUEUE_EVENT.RATE_LIMITED_REQUEUE, diagnostic);
  queue.logger.warn(RECONCILE_QUEUE_LOG_MSG.RATE_LIMITED_REQUEUE, diagnostic);
}

/**
 * Close a run of one owner key. A key already pending again was re-enqueued
 * during the run: past the free runs of an undeclared streak its next run
 * waits for the rate-limit delay.
 * @param {Object} queue
 * @param {string} ownerKey
 * @return {void}
 */
function closeReconcileRun(queue, ownerKey) {
  const declaredChange = setHas(queue.declaredChangeOwnerKeys, ownerKey);
  setDelete(queue.declaredChangeOwnerKeys, ownerKey);
  const successor = mapGet(queue.pending, ownerKey);
  if (queue.stopped || !successor || declaredChange) {
    mapDelete(queue.requeueStreaks, ownerKey);
  } else {
    mapSet(queue.requeueStreaks, ownerKey,
      (mapGet(queue.requeueStreaks, ownerKey) || 0) + 1);
  }
  if (queue.stopped || !successor) {
    return;
  }
  const streak = mapGet(queue.requeueStreaks, ownerKey) || 0;
  const delayMs = resolveRateLimitDelayMs(streak);
  if (delayMs > 0) {
    mapDelete(queue.pending, ownerKey);
    const held = holdFor(queue, ownerKey, delayMs);
    if (held.item) {
      setForEach(successor.reasons, (reason) => setAdd(held.item.reasons, reason));
      held.item.context = successor.context;
      mergeWorkItemCompletionWaiters(held.item, successor);
    } else {
      held.item = successor;
    }
    recordRateLimitedRequeue(queue, ownerKey, successor, streak, delayMs);
  }
}

/**
 * Drop held re-enqueues: one owner key (discard) or all (shutdown). Their
 * completion waiters are rejected with the given error.
 * @param {Object} queue
 * @param {string|null} ownerKey null for every key
 * @param {Error} error
 * @return {boolean} whether anything was held
 */
function dropHeldRequeues(queue, ownerKey, error) {
  let dropped = false;
  mapForEach(queue.heldRequeues, (held, key) => {
    if (ownerKey !== null && key !== ownerKey) {
      return;
    }
    dropped = true;
    queue.clearTimeoutFn(held.timer);
    rejectWorkItemCompletionWaiters(held.item, error);
    for (const entry of held.entries) {
      rejectWorkItemCompletionWaiters({
        completionWaiters: entry.options?.completionWaiter ?
          [entry.options.completionWaiter] : [],
      }, error);
    }
  });
  if (ownerKey === null) {
    queue.heldRequeues = new MapConstructor();
    queue.requeueStreaks = new MapConstructor();
    setClear(queue.declaredChangeOwnerKeys);
  } else {
    mapDelete(queue.heldRequeues, ownerKey);
    mapDelete(queue.requeueStreaks, ownerKey);
  }
  return dropped;
}

export {
  closeReconcileRun,
  dropHeldRequeues,
  holdRequeueIfOwed,
  initializeReconcileRunScope,
};
