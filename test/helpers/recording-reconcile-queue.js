// A REAL OwnerKeyReconcileQueue for tests that observe what an owner enqueues
// without running its reconcile: the drain port is a no-op, so admitted work
// stays queued for inspection. It replaces hand-copied queue fakes, so every
// enqueue goes through the queue's own admission, merge and retry rules.
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';

const SEEDED_REASON = 'test_seeded';
const QUIET_LOGGER = Object.freeze({
  debug() {}, info() {}, warn() {}, error() {},
});

function toWorkItem(ownerKey, value) {
  if (value?.reasons instanceof Set) {
    return value;
  }
  return {
    ownerKey,
    reasons: new Set(value?.reasons || [SEEDED_REASON]),
    context: value?.context ?? null,
    completionWaiters: [],
  };
}

/**
 * A Map whose test-side seeding (`set`, constructor entries) stores a
 * well-formed queue work item from a `{context}` shorthand. The queue itself
 * writes through Map.prototype directly and is unaffected.
 */
class SeedMap extends Map {
  constructor(entries = []) {
    super();
    for (const [ownerKey, value] of entries) {
      this.set(ownerKey, value);
    }
  }

  set(ownerKey, value) {
    return super.set(ownerKey, toWorkItem(ownerKey, value));
  }
}

/**
 * @param {Object} [options]
 * @param {Array} [options.enqueued] receives {ownerKey, reason, context,
 *   options} for every enqueue call
 * @param {SeedMap} [options.pending] adopted as the queue's pending map
 * @param {SeedMap} [options.retryWorkItems] adopted as its retry map
 * @param {Function} [options.onConfigureRetryPolicy] sees each policy the
 *   owner configures
 * @return {OwnerKeyReconcileQueue}
 */
function createRecordingReconcileQueue(options = {}) {
  const queue = new OwnerKeyReconcileQueue({
    name: 'recording-reconcile-queue',
    scheduleDrainFn: () => {},
    reconcileFn: async () => {},
  });
  queue.logger = QUIET_LOGGER;
  if (options.pending) queue.pending = options.pending;
  if (options.retryWorkItems) queue.retryWorkItems = options.retryWorkItems;
  const enqueued = options.enqueued || [];
  const enqueue = queue.enqueue.bind(queue);
  queue.enqueue = (ownerKey, reason, context, enqueueOptions) => {
    enqueued.push({ownerKey, reason, context, options: enqueueOptions});
    return enqueue(ownerKey, reason, context, enqueueOptions);
  };
  if (options.onConfigureRetryPolicy) {
    const configure = queue.configureRetryPolicy.bind(queue);
    queue.configureRetryPolicy = (policy) => {
      options.onConfigureRetryPolicy(policy);
      configure(policy);
    };
  }
  return queue;
}

export {SeedMap, createRecordingReconcileQueue};
