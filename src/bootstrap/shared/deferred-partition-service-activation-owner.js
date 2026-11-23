import {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
} from '../../node/replica-state-machine-registered-activation.js';
import {
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
} from '../join-promotion-state-owner.js';

const DEFAULT_RETRY_DELAY_MS = 250; // ends-on: all pending durable-rejoin partition replicas activate or retire
const DEFAULT_READY_WAIT_TIMEOUT_MS = 30000; // ends-on: all pending durable-rejoin partition replicas activate or retire
const MIN_POSITIVE_MS = 1;

const DEFERRED_ACTIVATION_ERROR_TEXT = Object.freeze({
  REPLICA_SEPARATOR: ', ',
  timedOut: (replicaSummary) =>
    `Replica activation ${REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE}: ` +
    `deferred durable-rejoin activation timed out for [${replicaSummary}]`,
});

function positiveMs(value, defaultValue) {
  return Number.isFinite(value) && value >= MIN_POSITIVE_MS ?
    Math.floor(value) :
    defaultValue;
}

function buildPendingActivationTimeoutError(pendingReplicaIds, lastError) {
  const replicaSummary = pendingReplicaIds.join(
    DEFERRED_ACTIVATION_ERROR_TEXT.REPLICA_SEPARATOR,
  );
  const error = new Error(
    DEFERRED_ACTIVATION_ERROR_TEXT.timedOut(replicaSummary),
  );
  error.code = REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE;
  error.errorCode = error.code;
  error.deferRetry = true;
  error.pendingReplicaIds = [...pendingReplicaIds];
  if (lastError) {
    error.cause = lastError;
  }
  return error;
}

function defaultScheduleTimer(callback, delayMs) {
  return setTimeout(callback, delayMs);
}

function defaultCancelTimer(timer) {
  clearTimeout(timer);
}

function defaultNow() {
  return Date.now();
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Owns deferred durable-rejoin partition replica activation obligations on a
 * joining node so transient authority loss is retained under each replica's
 * exact runtime identity instead of triggering destructive join teardown.
 */
class DeferredPartitionServiceActivationOwner {
  constructor(delegates = {}) {
    this.delegates = delegates;
    this.scheduleTimer = delegates.scheduleTimer ?? defaultScheduleTimer;
    this.cancelTimer = delegates.cancelTimer ?? defaultCancelTimer;
    this.now = delegates.now ?? defaultNow;
    this.sleep = delegates.sleep ?? defaultSleep;
    this.pendingEntries = new Map();
    this.retryTimer = null;
    this.inFlightRetry = null;
  }

  hasPending() {
    return this.pendingEntries.size > 0;
  }

  pendingReplicaIds() {
    return [...this.pendingEntries.keys()];
  }

  getLastError() {
    let lastError = null;
    for (const entry of this.pendingEntries.values()) {
      if (entry?.lastError) {
        lastError = entry.lastError;
      }
    }
    return lastError;
  }

  isStopped() {
    return this.delegates.isStopped?.() === true;
  }

  isExactCurrentService(replicaId, expectedService) {
    if (!expectedService) return false;
    return this.delegates.getPartitionService?.(replicaId) === expectedService;
  }

  recordDeferred({
    replicaId,
    partitionId,
    service,
    expectedReplicaIncarnation = null,
    error,
  }) {
    if (this.isStopped() || !this.isExactCurrentService(replicaId, service)) {
      return;
    }
    const existing = this.pendingEntries.get(replicaId);
    const incarnation = Number.isSafeInteger(expectedReplicaIncarnation) ?
      expectedReplicaIncarnation :
      (existing?.expectedReplicaIncarnation ?? null);
    this.pendingEntries.set(replicaId, {
      replicaId,
      partitionId,
      service,
      expectedReplicaIncarnation: incarnation,
      lastError: error || null,
    });
  }

  markSettled(replicaId) {
    this.pendingEntries.delete(replicaId);
    if (!this.hasPending()) {
      this.clearRetryTimer();
    }
  }

  async retireSuperseded({replicaId, partitionId, service, error}) {
    this.pendingEntries.delete(replicaId);
    if (!this.hasPending()) {
      this.clearRetryTimer();
    }
    if (!this.isExactCurrentService(replicaId, service)) {
      return;
    }
    await this.delegates.retireSupersededReplica?.({
      replicaId,
      partitionId,
      service,
      error,
    });
  }

  clearRetryTimer() {
    if (this.retryTimer !== null) {
      this.cancelTimer(this.retryTimer);
      this.retryTimer = null;
    }
  }

  clear() {
    this.clearRetryTimer();
    this.pendingEntries.clear();
  }

  syncRestoreState() {
    const currentState = this.delegates.getDurableRejoinRestoreState?.();
    if (this.hasPending()) {
      this.delegates.setDurableRejoinRestoreState?.(
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING,
      );
      return;
    }
    if (currentState === JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING) {
      this.delegates.setDurableRejoinRestoreState?.(
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED,
      );
    }
  }

  scheduleRetry() {
    if (this.retryTimer !== null || this.isStopped() || !this.hasPending()) {
      return;
    }
    const retryDelayMs = positiveMs(
      this.delegates.getRetryDelayMs?.(),
      DEFAULT_RETRY_DELAY_MS,
    );
    const timer = this.scheduleTimer(() => {
      this.retryTimer = null;
      if (this.isStopped() || !this.hasPending()) {
        return;
      }
      void this.retryPendingIfNeeded().catch(() => {});
    }, retryDelayMs);
    timer?.unref?.();
    this.retryTimer = timer;
  }

  collectLivePendingReplicaIds() {
    const liveIds = [];
    for (const [replicaId, entry] of this.pendingEntries.entries()) {
      if (this.isExactCurrentService(replicaId, entry.service)) {
        liveIds.push(replicaId);
      } else {
        this.pendingEntries.delete(replicaId);
      }
    }
    return liveIds;
  }

  async runSingleRetryPass() {
    const liveIds = this.collectLivePendingReplicaIds();
    if (liveIds.length === 0) {
      this.clearRetryTimer();
      this.syncRestoreState();
      return 0;
    }
    const expectedReplicaIncarnationByReplicaId = new Map();
    for (const replicaId of liveIds) {
      const incarnation =
        this.pendingEntries.get(replicaId)?.expectedReplicaIncarnation;
      if (Number.isSafeInteger(incarnation)) {
        expectedReplicaIncarnationByReplicaId.set(replicaId, incarnation);
      }
    }
    const activatedCount = await this.delegates.activateReplicaBatch(liveIds, {
      deferTransientFailures: true,
      retireSupersededReplicas: true,
      skipMissingHandlerPreflight: true,
      expectedReplicaIncarnationByReplicaId,
    });
    this.syncRestoreState();
    return activatedCount;
  }

  async retryPendingIfNeeded() {
    if (this.isStopped() || !this.hasPending()) {
      this.clearRetryTimer();
      this.syncRestoreState();
      return 0;
    }
    if (this.inFlightRetry !== null) {
      return this.inFlightRetry;
    }
    const pass = this.runSingleRetryPass().finally(() => {
      this.inFlightRetry = null;
    });
    this.inFlightRetry = pass;
    return pass;
  }

  async settleBeforeDeadline(deadlineMs, delayMs) {
    if (!this.hasPending()) {
      this.clearRetryTimer();
      this.syncRestoreState();
      return;
    }
    if (this.isStopped()) {
      throw buildPendingActivationTimeoutError(
        this.pendingReplicaIds(),
        this.getLastError(),
      );
    }
    await this.retryPendingIfNeeded();
    if (!this.hasPending()) {
      this.clearRetryTimer();
      this.syncRestoreState();
      return;
    }
    const remainingMs = deadlineMs - this.now();
    if (remainingMs <= 0) {
      this.syncRestoreState();
      throw buildPendingActivationTimeoutError(
        this.pendingReplicaIds(),
        this.getLastError(),
      );
    }
    await this.sleep(Math.min(delayMs, remainingMs));
    return this.settleBeforeDeadline(deadlineMs, delayMs);
  }

  async awaitSettledForReadySignal(options = {}) {
    if (!this.hasPending()) {
      return;
    }
    const timeoutMs = positiveMs(
      options.timeoutMs ?? this.delegates.getReadyWaitTimeoutMs?.(),
      DEFAULT_READY_WAIT_TIMEOUT_MS,
    );
    const delayMs = positiveMs(
      options.retryDelayMs ?? this.delegates.getRetryDelayMs?.(),
      DEFAULT_RETRY_DELAY_MS,
    );
    const deadlineMs = this.now() + timeoutMs;
    await this.settleBeforeDeadline(deadlineMs, delayMs);
  }
}

export {
  DeferredPartitionServiceActivationOwner,
};
