import {NUM} from '../constants/index.js';

const DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS = 25;
const SHARED_LEADER_ACTIVATION_SCHEDULERS = new Map();

function normalizeSpacingMs(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS;
}

class LeaderActivationScheduler {
  static getShared(options = {}) {
    const nodeId = typeof options.nodeId === 'string' && options.nodeId.length > 0 ?
      options.nodeId :
      'shared-node';
    const existing = SHARED_LEADER_ACTIVATION_SCHEDULERS.get(nodeId);
    if (existing) {
      existing.configure(options);
      return existing;
    }
    const scheduler = new LeaderActivationScheduler(options);
    SHARED_LEADER_ACTIVATION_SCHEDULERS.set(nodeId, scheduler);
    return scheduler;
  }

  static resetSharedForTests() {
    for (const scheduler of SHARED_LEADER_ACTIVATION_SCHEDULERS.values()) {
      scheduler.shutdown();
    }
    SHARED_LEADER_ACTIVATION_SCHEDULERS.clear();
  }

  constructor(options = {}) {
    this.nodeId = typeof options.nodeId === 'string' && options.nodeId.length > 0 ?
      options.nodeId :
      'shared-node';
    this.spacingMs = normalizeSpacingMs(options.spacingMs);
    this.queue = [];
    this.nextEntryId = NUM.ONE;
    this.dispatchTimer = null;
    this.lastDispatchAt = NUM.ZERO;
    this.destroyed = false;
  }

  configure(options = {}) {
    this.spacingMs = normalizeSpacingMs(
      options.spacingMs ?? this.spacingMs,
    );
    this.scheduleDrain();
  }

  enqueue(run) {
    if (this.destroyed || typeof run !== 'function') {
      return {cancel: () => {}};
    }

    const entry = {
      id: this.nextEntryId,
      run,
      canceled: false,
    };
    this.nextEntryId += NUM.ONE;
    this.queue.push(entry);
    this.scheduleDrain();

    return {
      cancel: () => {
        entry.canceled = true;
      },
    };
  }

  scheduleDrain() {
    if (this.destroyed || this.dispatchTimer || this.queue.length === NUM.ZERO) {
      return;
    }

    const delayMs = Math.max(
      NUM.ZERO,
      (this.lastDispatchAt + this.spacingMs) - Date.now(),
    );
    this.dispatchTimer = setTimeout(() => {
      this.dispatchTimer = null;
      this.dispatchNext();
    }, delayMs);
    if (typeof this.dispatchTimer?.unref === 'function') {
      this.dispatchTimer.unref();
    }
  }

  dispatchNext() {
    if (this.destroyed) {
      return;
    }

    while (this.queue.length > NUM.ZERO) {
      const entry = this.queue.shift();
      if (!entry || entry.canceled) {
        continue;
      }
      this.lastDispatchAt = Date.now();
      try {
        const result = entry.run();
        if (result && typeof result.catch === 'function') {
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
    this.queue.length = NUM.ZERO;
    if (this.dispatchTimer) {
      clearTimeout(this.dispatchTimer);
      this.dispatchTimer = null;
    }
  }
}

export {
  DEFAULT_LEADER_ACTIVATION_NODE_SPACING_MS,
  LeaderActivationScheduler,
};
