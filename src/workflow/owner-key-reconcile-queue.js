/**
 * OwnerKeyReconcileQueue — enqueue-only reconcile queue with
 * owner-key de-duplication and single-in-flight enforcement.
 *
 * Events enqueue owner keys with typed reason codes. The queue
 * de-duplicates by owner key: if an owner key is already pending,
 * the new reason is merged into the existing entry. A drain loop
 * processes pending items by calling the reconcile callback.
 *
 * At most one reconcile execution is active per owner key, and total
 * in-flight work is bounded by the configured concurrency ceiling.
 * If an owner key is already in-flight when the drain loop reaches it,
 * the item is deferred back into the pending map and a typed stale-claim
 * diagnostic is recorded.
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {
  RECONCILE_QUEUE_SUBSYSTEM,
  RECONCILE_QUEUE_LOG_MSG,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_EVENT,
  STALE_FENCE_SAMPLE_CAPACITY,
} from './reconcile-queue-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_THOUSAND = 1000;
const DEFAULT_MAX_CONCURRENCY = 1;
const RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE =
  'retryable_drain_failure';
const RECONCILE_QUEUE_RETRYABLE_DRAIN_DEFERRED =
  'retryable_drain_deferred';
const RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE_LOG_MSG =
  'Reconcile queue item deferred after retryable drain failure';

function defaultRetryableDrainFailureClassifier() {
  return false;
}

function defaultRetryableDrainFailureRetryAfterMs(error) {
  return Number.isFinite(error?.retryAfterMs) &&
    error.retryAfterMs > 0 ?
    Math.floor(error.retryAfterMs) :
    LOCAL_NUM_THOUSAND;
}

function defaultRetryableDrainFailureReason() {
  return RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE;
}

function normalizeReconcileQueueRetryPolicy(policy = {}) {
  const source = policy && typeof policy === LOCAL_STR_OBJECT ? policy : {};
  return Object.freeze({
    isRetryableError:
      typeof source.isRetryableError === LOCAL_STR_FUNCTION ?
        source.isRetryableError :
        defaultRetryableDrainFailureClassifier,
    getRetryAfterMs:
      typeof source.getRetryAfterMs === LOCAL_STR_FUNCTION ?
        source.getRetryAfterMs :
        defaultRetryableDrainFailureRetryAfterMs,
    getFailureReason:
      typeof source.getFailureReason === LOCAL_STR_FUNCTION ?
        source.getFailureReason :
        defaultRetryableDrainFailureReason,
  });
}

function normalizeRetryAfterMs(value) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    LOCAL_NUM_THOUSAND;
}

function normalizeMaxConcurrency(value) {
  return Number.isSafeInteger(value) && value > 0 ?
    value :
    DEFAULT_MAX_CONCURRENCY;
}

function getRetryableDrainFailureMessage(error) {
  if (typeof error === LOCAL_STR_STRING) {
    return error;
  }
  if (typeof error?.message === LOCAL_STR_STRING) {
    return error.message;
  }
  return RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE;
}

function getRetryableDrainFailureCode(error) {
  if (typeof error?.code === LOCAL_STR_STRING) {
    return error.code;
  }
  if (typeof error?.errorCode === LOCAL_STR_STRING) {
    return error.errorCode;
  }
  return '';
}

function maybeUnrefTimer(timer) {
  if (typeof timer?.unref === LOCAL_STR_FUNCTION) {
    timer.unref();
  }
}

/**
 * @typedef {Object} ReconcileWorkItem
 * @property {string} ownerKey - The owner key for this work item.
 * @property {Set<string>} reasons - Accumulated reason codes.
 * @property {*} context - Optional context payload from the
 *   most recent enqueue call for this owner key.
 * @property {number} [fenceToken] - Owner epoch / lease token.
 */

class OwnerKeyReconcileQueue extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Function} options.reconcileFn - Async callback invoked
   *   for each dequeued item: (ownerKey, reasons, context) => Promise.
   * @param {string} [options.name] - Queue name for logging.
   * @param {number} [options.maxConcurrency=1] - Maximum number of
   *   different owner keys that may reconcile concurrently.
   */
  constructor(options = {}) {
    super();

    if (typeof options.reconcileFn !== LOCAL_STR_FUNCTION) {
      throw new Error(RECONCILE_QUEUE_ERROR_MSG.RECONCILE_FN_REQUIRED);
    }

    this.reconcileFn = options.reconcileFn;
    this.name = options.name || RECONCILE_QUEUE_SUBSYSTEM;
    this.maxConcurrency = normalizeMaxConcurrency(options.maxConcurrency);

    /** @type {Map<string, ReconcileWorkItem>} */
    this.pending = new Map();
    /** @type {Set<string>} Owner keys with an active reconcile. */
    this.inFlight = new Set();
    /**
     * Current fence token (owner epoch) per owner key.
     * @type {Map<string, number>}
     */
    this.fenceTokens = new Map();
    /** @type {Array<Object>} Recent stale-claim diagnostic entries. */
    this.staleClaims = [];
    this.draining = false;
    this.stopped = false;

    // Aggregate counters for stale-fence diagnostics.
    this._staleFenceRejectionCount = 0;
    this._staleInFlightDeferralCount = 0;

    // Bounded ring buffer for recent stale-fence event samples.
    this._staleFenceSamples = [];
    this._staleFenceSampleIndex = 0;
    this.retryPolicy = normalizeReconcileQueueRetryPolicy(
      options.retryPolicy || options,
    );
    /** @type {Map<string, ReconcileWorkItem>} */
    this.retryWorkItems = new Map();
    /** @type {Map<string, Object>} */
    this.retryStates = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.retryTimers = new Map();
    this._retryableDrainFailureCount = 0;
    this._retryableDrainFailureSamples = [];
    this._retryableDrainFailureSampleIndex = 0;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(this.name) : console;
  }

  /**
   * Enqueue an owner key for reconciliation.
   *
   * If the owner key is already pending, the reason is merged and
   * the context is updated. Otherwise a new entry is created.
   *
   * When a fence token is provided, it is validated against the
   * current token for this owner key. If the provided token is
   * strictly less than the current one, the enqueue is rejected
   * as stale and a diagnostic is recorded.
   *
   * @param {string} ownerKey - Owner key to reconcile.
   * @param {string} reason - Typed reason code from RECONCILE_REASON.
   * @param {*} [context] - Optional context payload.
   * @param {Object} [options] - Enqueue options.
   * @param {number} [options.fenceToken] - Owner epoch / lease token.
   * @return {boolean} True if a new entry was created, false if merged
   *   or rejected.
   */
  enqueue(ownerKey, reason, context, options) {
    if (!ownerKey) {
      throw new Error(RECONCILE_QUEUE_ERROR_MSG.OWNER_KEY_REQUIRED);
    }
    if (this.stopped) {
      return false;
    }

    const fenceToken = options?.fenceToken;
    if (fenceToken !== undefined && fenceToken !== null) {
      const currentFence = this.fenceTokens.get(ownerKey);
      if (currentFence !== undefined && fenceToken < currentFence) {
        const diagnostic = {
          type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
          queue: this.name,
          ownerKey,
          reason,
          providedToken: fenceToken,
          currentToken: currentFence,
          timestamp: Date.now(),
        };
        this.staleClaims.push(diagnostic);
        this._staleFenceRejectionCount++;
        this._pushStaleFenceSample(diagnostic);
        this.emit(
          RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_ENQUEUE,
          diagnostic,
        );
        this.logger.debug(
          RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, {
            ...diagnostic,
          });
        return false;
      }
      this.fenceTokens.set(ownerKey, fenceToken);
    }

    const existing = this.pending.get(ownerKey);
    if (existing) {
      existing.reasons.add(reason);
      if (context !== undefined) {
        existing.context = context;
      }
      if (fenceToken !== undefined && fenceToken !== null) {
        existing.fenceToken = fenceToken;
      }
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.DEDUP_MERGED, {
        queue: this.name,
        ownerKey,
        reason,
        pendingReasons: Array.from(existing.reasons),
      });
      this.scheduleDrain();
      return false;
    }

    const retrying = this.retryWorkItems.get(ownerKey);
    if (retrying) {
      retrying.reasons.add(reason);
      if (context !== undefined) {
        retrying.context = context;
      }
      if (fenceToken !== undefined && fenceToken !== null) {
        retrying.fenceToken = fenceToken;
      }
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.DEDUP_MERGED, {
        queue: this.name,
        ownerKey,
        reason,
        pendingReasons: Array.from(retrying.reasons),
      });
      this._wakeRetryWorkItem(ownerKey);
      return false;
    }

    const reasons = new Set();
    reasons.add(reason);
    const item = {
      ownerKey,
      reasons,
      context: context !== undefined ? context : null,
    };
    if (fenceToken !== undefined && fenceToken !== null) {
      item.fenceToken = fenceToken;
    }
    this.pending.set(ownerKey, item);

    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.ENQUEUED, {
      queue: this.name,
      ownerKey,
      reason,
    });

    this.scheduleDrain();
    return true;
  }

  /**
   * Schedule a drain if not already draining.
   * Uses a microtask to batch rapid enqueues.
   * @private
   */
  scheduleDrain() {
    if (this.draining || this.stopped) {
      return;
    }
    this.draining = true;
    Promise.resolve().then(() => this.drain());
  }

  /**
   * Claim pending items and start one reconcile per available owner key.
   *
   * Items whose owner key is already in-flight are deferred back
   * into the pending map and picked up once the active reconcile
   * for that key completes. This guarantees at most one reconcile
   * execution per owner key while allowing unrelated owner keys to
   * make progress independently.
   * @private
   */
  drain() {
    try {
      const entries = Array.from(this.pending.entries());

      for (const [ownerKey, item] of entries) {
        this.pending.delete(ownerKey);
        if (!this._claimPendingItem(ownerKey, item)) {
          break;
        }
      }
    } finally {
      this.draining = false;
      this._schedulePendingDrainIfAvailable();
    }
  }

  _claimPendingItem(ownerKey, item) {
    if (this.stopped) {
      return false;
    }
    if (this.inFlight.has(ownerKey)) {
      this._deferInFlightItem(ownerKey, item);
      return true;
    }
    if (this.inFlight.size >= this.maxConcurrency) {
      this.pending.set(ownerKey, item);
      return false;
    }

    const itemFence = item.fenceToken;
    if (itemFence !== undefined && itemFence !== null) {
      const currentFence = this.fenceTokens.get(ownerKey);
      if (currentFence !== undefined &&
          itemFence < currentFence) {
        this._recordStaleFenceDiagnostic(
          ownerKey, item, itemFence, currentFence,
        );
        return true;
      }
    }

    this._startReconcile(ownerKey, item);
    return true;
  }

  async _startReconcile(ownerKey, item) {
    this.inFlight.add(ownerKey);
    this.logger.debug(
      RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_CLAIMED, {
        queue: this.name,
        ownerKey,
      });

    const reasons = Array.from(item.reasons);
    try {
      await this.reconcileFn(
        ownerKey, reasons, item.context,
      );
      this._clearRetryState(ownerKey);
    } catch (error) {
      const retryDeferred =
        this._deferRetryableDrainFailure(ownerKey, item, reasons, error);
      if (!retryDeferred) {
        this._clearRetryState(ownerKey);
        this.logger.warn(RECONCILE_QUEUE_LOG_MSG.DRAIN_ERROR, {
          queue: this.name,
          ownerKey,
          reasons,
          error: error.message,
        });
      }
    } finally {
      this.inFlight.delete(ownerKey);
      this.logger.debug(
        RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_RELEASED, {
          queue: this.name,
          ownerKey,
        });
      this._schedulePendingDrainIfAvailable();
    }
  }

  _schedulePendingDrainIfAvailable() {
    if (
      this.stopped ||
      this.pending.size === 0 ||
      this.inFlight.size >= this.maxConcurrency
    ) {
      return;
    }
    for (const ownerKey of this.pending.keys()) {
      if (!this.inFlight.has(ownerKey)) {
        this.scheduleDrain();
        return;
      }
    }
  }

  /**
   * Defer a work item whose owner key is already in-flight.
   *
   * The item is merged back into the pending map (preserving any
   * reasons already accumulated there) and a typed stale-claim
   * diagnostic is recorded.
   *
   * @param {string} ownerKey
   * @param {ReconcileWorkItem} item
   * @private
   */
  _deferInFlightItem(ownerKey, item) {
    const existing = this.pending.get(ownerKey);
    if (existing) {
      for (const r of item.reasons) {
        existing.reasons.add(r);
      }
      if (item.context !== null && item.context !== undefined) {
        existing.context = item.context;
      }
    } else {
      this.pending.set(ownerKey, item);
    }

    const diagnostic = {
      type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
      queue: this.name,
      ownerKey,
      reasons: Array.from(item.reasons),
      timestamp: Date.now(),
    };
    this.staleClaims.push(diagnostic);
    this._staleInFlightDeferralCount++;
    this._pushStaleFenceSample(diagnostic);
    this.emit(
      RECONCILE_QUEUE_EVENT.STALE_CLAIM_DEFERRED,
      diagnostic,
    );

    this.logger.debug(
      RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_DEFERRED, {
        ...diagnostic,
      });
  }

  _shouldRetryDrainFailure(ownerKey, item, error) {
    try {
      return this.retryPolicy.isRetryableError(
        error,
        item.context,
        {ownerKey, queue: this.name},
      ) === true;
    } catch (_classifierError) {
      return false;
    }
  }

  _resolveRetryAfterMs(ownerKey, item, error) {
    try {
      return normalizeRetryAfterMs(
        this.retryPolicy.getRetryAfterMs(
          error,
          item.context,
          {ownerKey, queue: this.name},
        ),
      );
    } catch (_retryAfterError) {
      return LOCAL_NUM_THOUSAND;
    }
  }

  _resolveFailureReason(ownerKey, item, error) {
    try {
      const reason = this.retryPolicy.getFailureReason(
        error,
        item.context,
        {ownerKey, queue: this.name},
      );
      return typeof reason === LOCAL_STR_STRING &&
        reason.length > 0 ?
        reason :
        RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE;
    } catch (_reasonError) {
      return RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE;
    }
  }

  _deferRetryableDrainFailure(ownerKey, item, reasons, error) {
    if (
      this.stopped ||
      this.pending.has(ownerKey) ||
      !this._shouldRetryDrainFailure(ownerKey, item, error)
    ) {
      return false;
    }
    const baseRetryAfterMs = this._resolveRetryAfterMs(ownerKey, item, error);
    const timestamp = Date.now();
    const previousState = this.retryStates.get(ownerKey);
    const failureCount =
      Number.isFinite(previousState?.failureCount) ?
        previousState.failureCount + 1 :
        1;
    const retryAfterMs = baseRetryAfterMs;
    const errorCode = getRetryableDrainFailureCode(error);
    const retryState = {
      type: RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE,
      queue: this.name,
      ownerKey,
      reasons,
      failureReason: this._resolveFailureReason(ownerKey, item, error),
      retryAfterMs,
      baseRetryAfterMs,
      nextAttemptAt: timestamp + retryAfterMs,
      failureCount,
      errorMessage: getRetryableDrainFailureMessage(error),
      ...(errorCode.length > 0 ? {errorCode} : {}),
      timestamp,
    };
    item.retryState = retryState;
    this.retryStates.set(ownerKey, retryState);
    this.retryWorkItems.set(ownerKey, item);
    this._retryableDrainFailureCount++;
    this._pushRetryableDrainFailureSample(retryState);
    this.emit(RECONCILE_QUEUE_RETRYABLE_DRAIN_DEFERRED, retryState);
    this._scheduleRetryDrain(ownerKey, retryAfterMs);
    this.logger.warn(RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE_LOG_MSG, {
      ...retryState,
    });
    return true;
  }

  _scheduleRetryDrain(ownerKey, retryAfterMs) {
    this._clearRetryTimer(ownerKey);
    const timer = setTimeout(() => {
      this.retryTimers.delete(ownerKey);
      this._wakeRetryWorkItem(ownerKey);
    }, retryAfterMs);
    maybeUnrefTimer(timer);
    this.retryTimers.set(ownerKey, timer);
  }

  _wakeRetryWorkItem(ownerKey) {
    if (this.stopped) {
      return false;
    }
    const item = this.retryWorkItems.get(ownerKey);
    if (!item) {
      return false;
    }
    this._clearRetryTimer(ownerKey);
    this.retryWorkItems.delete(ownerKey);
    const existing = this.pending.get(ownerKey);
    if (existing) {
      for (const reason of item.reasons) {
        existing.reasons.add(reason);
      }
      if (item.context !== null && item.context !== undefined) {
        existing.context = item.context;
      }
      if (item.fenceToken !== undefined && item.fenceToken !== null) {
        existing.fenceToken = item.fenceToken;
      }
    } else {
      this.pending.set(ownerKey, item);
    }
    this.scheduleDrain();
    return true;
  }

  _clearRetryTimer(ownerKey) {
    const retryTimer = this.retryTimers.get(ownerKey);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(ownerKey);
    }
  }

  _clearRetryState(ownerKey) {
    this._clearRetryTimer(ownerKey);
    this.retryStates.delete(ownerKey);
    this.retryWorkItems.delete(ownerKey);
  }

  _pushRetryableDrainFailureSample(sample) {
    if (
      this._retryableDrainFailureSamples.length <
      STALE_FENCE_SAMPLE_CAPACITY
    ) {
      this._retryableDrainFailureSamples.push(sample);
    } else {
      this._retryableDrainFailureSamples[
        this._retryableDrainFailureSampleIndex
      ] = sample;
    }
    this._retryableDrainFailureSampleIndex =
      (this._retryableDrainFailureSampleIndex + 1) %
      STALE_FENCE_SAMPLE_CAPACITY;
  }

  /**
   * Record a stale-fence diagnostic when a work item's fence token
   * is older than the current token for its owner key.
   *
   * @param {string} ownerKey
   * @param {ReconcileWorkItem} item
   * @param {number} providedToken
   * @param {number} currentToken
   * @private
   */
  _recordStaleFenceDiagnostic(
    ownerKey, item, providedToken, currentToken,
  ) {
    const diagnostic = {
      type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
      queue: this.name,
      ownerKey,
      reasons: Array.from(item.reasons),
      providedToken,
      currentToken,
      timestamp: Date.now(),
    };
    this.staleClaims.push(diagnostic);
    this._staleFenceRejectionCount++;
    this._pushStaleFenceSample(diagnostic);
    this.emit(
      RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN,
      diagnostic,
    );

    this.logger.debug(
      RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, {
        ...diagnostic,
      });
  }

  /**
   * Push a diagnostic sample into the bounded ring buffer.
   * When the buffer reaches capacity, the oldest entry is
   * overwritten.
   *
   * @param {Object} sample - Diagnostic event payload.
   * @private
   */
  _pushStaleFenceSample(sample) {
    if (this._staleFenceSamples.length < STALE_FENCE_SAMPLE_CAPACITY) {
      this._staleFenceSamples.push(sample);
    } else {
      this._staleFenceSamples[this._staleFenceSampleIndex] = sample;
    }
    this._staleFenceSampleIndex =
      (this._staleFenceSampleIndex + 1) % STALE_FENCE_SAMPLE_CAPACITY;
  }

  /**
   * Check whether an owner key currently has an active reconcile
   * execution.
   * @param {string} ownerKey
   * @return {boolean}
   */
  isInFlight(ownerKey) {
    return this.inFlight.has(ownerKey);
  }

  configureRetryPolicy(policy = {}) {
    this.retryPolicy = normalizeReconcileQueueRetryPolicy({
      ...this.retryPolicy,
      ...policy,
    });
  }

  /**
   * Return the number of pending (not yet drained) items.
   * @return {number}
   */
  get size() {
    const pendingKeys = new Set(this.pending.keys());
    for (const ownerKey of this.retryWorkItems.keys()) {
      pendingKeys.add(ownerKey);
    }
    return pendingKeys.size;
  }

  /**
   * Check whether an owner key is currently pending.
   * @param {string} ownerKey
   * @return {boolean}
   */
  has(ownerKey) {
    return this.pending.has(ownerKey) || this.retryWorkItems.has(ownerKey);
  }

  /**
   * Return a diagnostics snapshot of the queue state.
   * Exposes reconcile queue state by owner key per Requirement 9.
   * @return {Object}
   */
  getDiagnostics() {
    const fenceEntries = {};
    for (const [key, token] of this.fenceTokens) {
      fenceEntries[key] = token;
    }
    const retryStates = {};
    for (const [key, retryState] of this.retryStates) {
      retryStates[key] = {...retryState};
    }
    return {
      queue: this.name,
      maxConcurrency: this.maxConcurrency,
      pendingKeys: Array.from(this.pending.keys()),
      retryingKeys: Array.from(this.retryWorkItems.keys()),
      inFlightKeys: Array.from(this.inFlight),
      fenceTokens: fenceEntries,
      staleClaims: this.staleClaims.slice(),
      staleFenceRejectionCount: this._staleFenceRejectionCount,
      staleInFlightDeferralCount: this._staleInFlightDeferralCount,
      recentStaleFenceSamples: this._staleFenceSamples.slice(),
      retryStates,
      retryableDrainFailureCount: this._retryableDrainFailureCount,
      recentRetryableDrainFailureSamples:
        this._retryableDrainFailureSamples.slice(),
      draining: this.draining,
      stopped: this.stopped,
    };
  }

  /**
   * Stop the queue. No further items will be processed.
   */
  shutdown() {
    this.stopped = true;
    this.pending.clear();
    this.retryWorkItems.clear();
    this.retryStates.clear();
    for (const retryTimer of this.retryTimers.values()) {
      clearTimeout(retryTimer);
    }
    this.retryTimers.clear();
    this.inFlight.clear();
    this.fenceTokens.clear();
    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.SHUTDOWN, {
      queue: this.name,
    });
  }
}

export {OwnerKeyReconcileQueue};
