
import {resolveTimeSource} from '../time/time-source.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_SHARED_NODE = 'shared-node';
const LOCAL_STR_FUNCTION = 'function';

const DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS = 25;
const SHARED_LEADER_ACTIVATION_SCHEDULERS = new Map();

function normalizeSpacingMs(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS;
}

// One node's leader-activation pacing, shared by every replica service on
// that node. Its lifetime is bounded by its users: each acquireShared() is a
// lease the caller returns with releaseShared() when it shuts down, and the
// last release shuts the scheduler down and drops it from the registry. A
// node's next generation of services therefore gets a fresh scheduler on its
// own clock, and nothing stays armed once every user has shut down.
class LeaderActivationScheduler {
  static acquireShared(options = {}) {
    const nodeId = typeof options.nodeId === 'string' && options.nodeId.length > 0 ?
      options.nodeId :
      'shared-node';
    let scheduler = SHARED_LEADER_ACTIVATION_SCHEDULERS.get(nodeId);
    if (scheduler) {
      scheduler.configure(options);
    } else {
      scheduler = new LeaderActivationScheduler(options);
      SHARED_LEADER_ACTIVATION_SCHEDULERS.set(nodeId, scheduler);
    }
    scheduler.sharedLeaseCount += 1;
    return scheduler;
  }

  static resetSharedForTests() {
    for (const scheduler of SHARED_LEADER_ACTIVATION_SCHEDULERS.values()) {
      scheduler.shutdown();
    }
    SHARED_LEADER_ACTIVATION_SCHEDULERS.clear();
  }

  constructor(options = {}) {
    this.nodeId =
      typeof options.nodeId === LOCAL_STR_STRING && options.nodeId.length > 0 ?
        options.nodeId :
        LOCAL_STR_SHARED_NODE;
    this.spacingMs = normalizeSpacingMs(options.spacingMs);
    // Activation spacing is a node's own pacing, so it reads that node's
    // clock. Unsupplied, it is the host clock exactly as before.
    this.timeSource = resolveTimeSource(options);
    this.queue = [];
    this.nextEntryId = 1;
    this.dispatchTimer = null;
    this.lastDispatchAt = 0;
    this.destroyed = false;
    this.sharedLeaseCount = 0;
  }

  releaseShared() {
    if (this.sharedLeaseCount === 0) {
      return;
    }
    this.sharedLeaseCount -= 1;
    if (this.sharedLeaseCount > 0) {
      return;
    }
    this.shutdown();
    if (SHARED_LEADER_ACTIVATION_SCHEDULERS.get(this.nodeId) === this) {
      SHARED_LEADER_ACTIVATION_SCHEDULERS.delete(this.nodeId);
    }
  }

  configure(options = {}) {
    this.spacingMs = normalizeSpacingMs(
      options.spacingMs ?? this.spacingMs,
    );
    this.scheduleDrain();
  }

  enqueue(run) {
    if (this.destroyed || typeof run !== LOCAL_STR_FUNCTION) {
      return {cancel: () => {}};
    }

    const entry = {
      id: this.nextEntryId,
      run,
      canceled: false,
    };
    this.nextEntryId += 1;
    this.queue.push(entry);
    this.scheduleDrain();

    return {
      cancel: () => {
        entry.canceled = true;
      },
    };
  }

  scheduleDrain() {
    if (this.destroyed || this.dispatchTimer || this.queue.length === 0) {
      return;
    }

    const delayMs = Math.max(
      0,
      (this.lastDispatchAt + this.spacingMs) - this.timeSource.now(),
    );
    this.dispatchTimer = this.timeSource.setTimeout(() => {
      this.dispatchTimer = null;
      this.dispatchNext();
    }, delayMs);
    if (typeof this.dispatchTimer?.unref === LOCAL_STR_FUNCTION) {
      this.dispatchTimer.unref();
    }
  }

  dispatchNext() {
    if (this.destroyed) {
      return;
    }

    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry || entry.canceled) {
        continue;
      }
      this.lastDispatchAt = this.timeSource.now();
      try {
        const result = entry.run();
        if (result && typeof result.catch === LOCAL_STR_FUNCTION) {
          result.catch(() => {});
        }
      } finally {
        this.scheduleDrain();
      }
      return;
    }
  }

  shutdown() {
    this.destroyed = true;
    this.queue.length = 0;
    if (this.dispatchTimer) {
      this.timeSource.clearTimeout(this.dispatchTimer);
      this.dispatchTimer = null;
    }
  }
}

export {
  DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS,
  LeaderActivationScheduler,
};
