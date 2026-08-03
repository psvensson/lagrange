/**
 * Bounded shard-dispatch pool — the named concurrency owner for the
 * call-cell invocation path (brief:
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §2).
 *
 * Runs independent per-slot tasks with at most `limit` in flight,
 * preferring slot order, starting the next admissible task as one
 * settles. Two admission constraints hold at all times:
 *
 *  1. at most `limit` tasks run concurrently (policy-owned bound);
 *  2. tasks sharing an admission key never overlap — the WASI cell
 *     runtime allows one active invocation per component instance, so
 *     shards resolved to the same host node must serialize there while
 *     shards on other hosts proceed in parallel.
 *
 * Admission stops permanently on the first task rejection or once the
 * shared absolute deadline passes; already-started tasks always settle.
 * The pool is a pure mechanism: it never throws for task failures and
 * never interprets typed routing errors — it returns one settled
 * summary and the invocation owner maps it to typed outcomes
 * deterministically (stable slot order, never completion order).
 *
 * This is deliberately a small in-invocation scheduler loop, not a
 * generic scheduler: no queue survives the call, no work is shared
 * across invocations, and the concurrency limit is policy-derived
 * configuration, never caller input.
 */

const SHARD_TASK_STATUS = Object.freeze({
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
});

const SHARD_ADMISSION_STOP = Object.freeze({
  NONE: 'none',
  FAILURE: 'failure',
  DEADLINE: 'deadline',
});

const SHARD_POOL_ARGUMENT_MESSAGE = Object.freeze({
  LIMIT_REQUIRED:
    'runBoundedShardDispatch requires a positive integer limit',
  RUN_SLOT_REQUIRED:
    'runBoundedShardDispatch requires a runSlot(slot, index) function',
  SLOTS_REQUIRED:
    'runBoundedShardDispatch requires a slots array',
});

// Slots without an admission key are unconstrained; the sentinel keeps
// the key-exclusion set free of them without encoding state as null.
const UNCONSTRAINED_ADMISSION_KEY = Symbol('unconstrained-admission-key');

function assertPoolArguments({slots, limit, runSlot}) {
  if (!Array.isArray(slots)) {
    throw new TypeError(SHARD_POOL_ARGUMENT_MESSAGE.SLOTS_REQUIRED);
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError(SHARD_POOL_ARGUMENT_MESSAGE.LIMIT_REQUIRED);
  }
  if (typeof runSlot !== 'function') {
    throw new TypeError(SHARD_POOL_ARGUMENT_MESSAGE.RUN_SLOT_REQUIRED);
  }
}

function resolveAdmissionKey(admissionKeyOf, slot, index) {
  if (typeof admissionKeyOf !== 'function') {
    return UNCONSTRAINED_ADMISSION_KEY;
  }
  const key = admissionKeyOf(slot, index);
  return typeof key === 'string' && key.length > 0 ?
    key :
    UNCONSTRAINED_ADMISSION_KEY;
}

/**
 * @param {object} options
 * @param {Array} options.slots per-slot descriptors, admitted preferring
 *   slot order
 * @param {number} options.limit maximum concurrently running tasks
 * @param {Function} options.runSlot async (slot, index) => result
 * @param {Function} [options.admissionKeyOf] (slot, index) => string;
 *   slots sharing a returned key never run concurrently (host-instance
 *   exclusivity); non-string/empty results leave the slot unconstrained
 * @param {number} [options.deadlineMs] shared absolute epoch-ms deadline;
 *   admission (never settlement) stops once it passes
 * @param {Function} [options.nowProvider] clock override for tests
 * @return {Promise<{settled: Array, unadmitted: Array, admissionStop:
 *   string, peakConcurrent: number}>} settled entries are
 *   {index, status, value|reason} in slot order for every admitted slot;
 *   unadmitted entries are {index, cause} for slots never started.
 */
async function runBoundedShardDispatch(options) {
  assertPoolArguments(options);
  const {slots, limit, runSlot} = options;
  const now = typeof options.nowProvider === 'function' ?
    options.nowProvider :
    Date.now;
  const deadlineMs = Number.isFinite(options.deadlineMs) ?
    options.deadlineMs :
    Number.POSITIVE_INFINITY;
  const admissionKeys = slots.map((slot, index) =>
    resolveAdmissionKey(options.admissionKeyOf, slot, index));
  const settled = [];
  const pendingIndexes = slots.map((_, index) => index);
  const inFlight = new Map();
  const inFlightKeys = new Set();
  let peakConcurrent = 0;
  let admissionStop = SHARD_ADMISSION_STOP.NONE;

  function admitNext() {
    while (admissionStop === SHARD_ADMISSION_STOP.NONE &&
        inFlight.size < limit && pendingIndexes.length > 0) {
      if (now() >= deadlineMs) {
        admissionStop = SHARD_ADMISSION_STOP.DEADLINE;
        return;
      }
      // Prefer slot order, but never head-of-line block: the lowest
      // pending slot whose admission key is idle starts now.
      const pendingPosition = pendingIndexes.findIndex((slotIndex) =>
        admissionKeys[slotIndex] === UNCONSTRAINED_ADMISSION_KEY ||
        !inFlightKeys.has(admissionKeys[slotIndex]));
      if (pendingPosition === -1) {
        return;
      }
      const [index] = pendingIndexes.splice(pendingPosition, 1);
      const key = admissionKeys[index];
      if (key !== UNCONSTRAINED_ADMISSION_KEY) {
        inFlightKeys.add(key);
      }
      const task = Promise.resolve()
        .then(() => runSlot(slots[index], index))
        .then(
          (value) => ({index, status: SHARD_TASK_STATUS.FULFILLED, value}),
          (reason) => ({index, reason, status: SHARD_TASK_STATUS.REJECTED}),
        );
      inFlight.set(index, {key, task});
      peakConcurrent = Math.max(peakConcurrent, inFlight.size);
    }
  }

  admitNext();
  while (inFlight.size > 0) {
    const record = await Promise.race(
      [...inFlight.values()].map((entry) => entry.task));
    const entry = inFlight.get(record.index);
    inFlight.delete(record.index);
    if (entry.key !== UNCONSTRAINED_ADMISSION_KEY) {
      inFlightKeys.delete(entry.key);
    }
    settled.push(record);
    if (record.status === SHARD_TASK_STATUS.REJECTED) {
      admissionStop = SHARD_ADMISSION_STOP.FAILURE;
    }
    admitNext();
  }

  const unadmitted = pendingIndexes.map((index) => ({
    cause: admissionStop,
    index,
  }));
  settled.sort((left, right) => left.index - right.index);
  return {admissionStop, peakConcurrent, settled, unadmitted};
}

export {
  SHARD_ADMISSION_STOP,
  SHARD_TASK_STATUS,
  runBoundedShardDispatch,
};
