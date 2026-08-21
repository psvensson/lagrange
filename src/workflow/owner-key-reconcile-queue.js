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
import {
  clearRetryState,
  clearRetryTimer,
  deferRetryableDrainFailure,
  normalizeReconcileQueueRetryPolicy,
  wakeRetryWorkItem,
} from './reconcile-queue-retry-ownership.js';
import {
  appendCompletionWaiter,
  enqueueAndWaitForOwner,
  mergeWorkItemCompletionWaiters,
  rejectAllQueueCompletionWaiters,
  rejectStaleFenceCompletionWaiter,
  rejectStoppedCompletionWaiter,
  rejectWorkItemCompletionWaiters,
  resolveWorkItemCompletionWaiters,
} from './owner-key-reconcile-completion.js';
import {
  appendSnapshotValue,
  buildReconcileQueueDiagnostics,
  defineSnapshotValue,
  snapshotMapEntries,
  snapshotSetValues,
} from './owner-key-reconcile-queue-snapshots.js';

const LOCAL_STR_FUNCTION = 'function';
const MapConstructor = Map;
const mapClear = Function.call.bind(Map.prototype.clear);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
);
const numberIsSafeInteger = Number.isSafeInteger;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setClear = Function.call.bind(Set.prototype.clear);
const setDelete = Function.call.bind(Set.prototype.delete);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const setSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Set.prototype, 'size').get,
);
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_MAX_ITEMS_PER_DRAIN = Number.POSITIVE_INFINITY;

function normalizeMaxConcurrency(value) {
  return numberIsSafeInteger(value) && value > 0 ?
    value :
    DEFAULT_MAX_CONCURRENCY;
}

function normalizeMaxItemsPerDrain(value) {
  return numberIsSafeInteger(value) && value > 0 ?
    value :
    DEFAULT_MAX_ITEMS_PER_DRAIN;
}

function defaultDrainScheduler(callback) {
  Promise.resolve().then(callback);
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
    this.maxItemsPerDrain = normalizeMaxItemsPerDrain(
      options.maxItemsPerDrain,
    );
    this.scheduleDrainFn =
      typeof options.scheduleDrainFn === LOCAL_STR_FUNCTION ?
        options.scheduleDrainFn :
        defaultDrainScheduler;
    this.now = typeof options.now === LOCAL_STR_FUNCTION ?
      options.now :
      Date.now;
    this.setTimeoutFn = typeof options.setTimeoutFn === LOCAL_STR_FUNCTION ?
      options.setTimeoutFn :
      setTimeout;
    this.clearTimeoutFn =
      typeof options.clearTimeoutFn === LOCAL_STR_FUNCTION ?
        options.clearTimeoutFn :
        clearTimeout;

    /** @type {Map<string, ReconcileWorkItem>} */
    this.pending = new MapConstructor();
    /** @type {Set<string>} Owner keys with an active reconcile. */
    this.inFlight = new SetConstructor();
    /** @type {Map<string, ReconcileWorkItem>} Claimed owner work. */
    this.inFlightItems = new MapConstructor();
    /**
     * Current fence token (owner epoch) per owner key.
     * @type {Map<string, number>}
     */
    this.fenceTokens = new MapConstructor();
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
    this.retryWorkItems = new MapConstructor();
    /** @type {Map<string, Object>} */
    this.retryStates = new MapConstructor();
    /** @type {Map<string, ReconcileWorkItem>} */
    this.exhaustedWorkItems = new MapConstructor();
    /** @type {Map<string, Object>} */
    this.exhaustedRetryStates = new MapConstructor();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.retryTimers = new MapConstructor();
    this._retryableDrainFailureCount = 0;
    this._retryableDrainExhaustedCount = 0;
    this._retryableDrainFailureSamples = [];
    this._retryableDrainFailureSampleIndex = 0;
    this.retrySampleCapacity = STALE_FENCE_SAMPLE_CAPACITY;

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
    const admission = this._resolveEnqueueAdmission(
      ownerKey,
      reason,
      options,
    );
    if (!admission.accepted) {
      return false;
    }
    const {completionWaiter, fenceToken} = admission;
    const existing = mapGet(this.pending, ownerKey);
    if (existing) {
      this._mergeEnqueuedWork(
        existing,
        reason,
        context,
        fenceToken,
        completionWaiter,
      );
      this.scheduleDrain();
      return false;
    }

    if (this._mergeDeferredWork(
      ownerKey,
      reason,
      context,
      fenceToken,
      completionWaiter,
    )) {
      return false;
    }

    const reasons = new SetConstructor();
    setAdd(reasons, reason);
    const item = {
      ownerKey,
      reasons,
      context: context !== undefined ? context : null,
      completionWaiters: [],
    };
    appendCompletionWaiter(item, completionWaiter);
    if (fenceToken !== undefined && fenceToken !== null) {
      item.fenceToken = fenceToken;
    }
    mapSet(this.pending, ownerKey, item);

    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.ENQUEUED, {
      queue: this.name,
      ownerKey,
      reason,
    });

    this.scheduleDrain();
    return true;
  }

  _resolveEnqueueAdmission(ownerKey, reason, options) {
    if (!ownerKey) {
      throw new Error(RECONCILE_QUEUE_ERROR_MSG.OWNER_KEY_REQUIRED);
    }
    const completionWaiter = options?.completionWaiter || null;
    if (this.stopped) {
      rejectStoppedCompletionWaiter(completionWaiter, this.name);
      return {accepted: false, completionWaiter, fenceToken: null};
    }
    const fenceToken = options?.fenceToken;
    const accepted = this._acceptEnqueueFence(
      ownerKey,
      reason,
      fenceToken,
      completionWaiter,
    );
    return {accepted, completionWaiter, fenceToken};
  }

  /**
   * Enqueue through the same single-owner serialization path and resolve only
   * after that owner has completed the accepted reconciliation.
   *
   * This is the commit-boundary form of enqueue. Callers must use it when an
   * upstream acknowledgement would otherwise confuse queue admission with
   * authoritative completion.
   *
   * @param {string} ownerKey
   * @param {string} reason
   * @param {*} [context]
   * @param {Object} [options]
   * @return {Promise<*>}
   */
  enqueueAndWait(ownerKey, reason, context, options = {}) {
    return enqueueAndWaitForOwner(
      this, ownerKey, reason, context, options,
    );
  }

  _mergeDeferredWork(
    ownerKey,
    reason,
    context,
    fenceToken,
    completionWaiter,
  ) {
    const retrying = mapGet(this.retryWorkItems, ownerKey);
    if (retrying) {
      const reset = this._maybeResetRetryAttempts(
        ownerKey, retrying, reason, context,
      );
      this._mergeEnqueuedWork(
        retrying,
        reason,
        context,
        fenceToken,
        completionWaiter,
      );
      if (reset) {
        mapSet(this.pending, ownerKey, retrying);
        this.scheduleDrain();
      } else {
        this._wakeRetryWorkItem(ownerKey);
      }
      return true;
    }
    const exhausted = mapGet(this.exhaustedWorkItems, ownerKey);
    if (!exhausted) {
      return false;
    }
    if (this._maybeResetRetryAttempts(
      ownerKey, exhausted, reason, context,
    )) {
      return false;
    }
    this._mergeEnqueuedWork(
      exhausted,
      reason,
      context,
      fenceToken,
      completionWaiter,
    );
    return true;
  }

  _acceptEnqueueFence(ownerKey, reason, fenceToken, completionWaiter = null) {
    if (fenceToken === undefined || fenceToken === null) {
      return true;
    }
    const currentFence = mapGet(this.fenceTokens, ownerKey);
    if (currentFence === undefined || fenceToken >= currentFence) {
      mapSet(this.fenceTokens, ownerKey, fenceToken);
      return true;
    }
    const diagnostic = {
      type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
      queue: this.name,
      ownerKey,
      reason,
      providedToken: fenceToken,
      currentToken: currentFence,
      timestamp: this.now(),
    };
    appendSnapshotValue(this.staleClaims, diagnostic);
    this._staleFenceRejectionCount++;
    this._pushStaleFenceSample(diagnostic);
    this.emit(RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_ENQUEUE, diagnostic);
    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, diagnostic);
    rejectStaleFenceCompletionWaiter(completionWaiter);
    return false;
  }

  _mergeEnqueuedWork(
    item,
    reason,
    context,
    fenceToken,
    completionWaiter = null,
  ) {
    setAdd(item.reasons, reason);
    if (context !== undefined) {
      item.context = context;
    }
    if (fenceToken !== undefined && fenceToken !== null) {
      item.fenceToken = fenceToken;
    }
    appendCompletionWaiter(item, completionWaiter);
    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.DEDUP_MERGED, {
      queue: this.name,
      ownerKey: item.ownerKey,
      reason,
      pendingReasons: snapshotSetValues(item.reasons),
    });
  }

  _maybeResetRetryAttempts(ownerKey, item, reason, context) {
    let shouldReset = false;
    try {
      shouldReset = this.retryPolicy.shouldResetAttempts(
        item.context,
        context,
        {ownerKey, queue: this.name, reason},
      ) === true;
    } catch (_resetClassifierError) {
      shouldReset = false;
    }
    if (!shouldReset) {
      return false;
    }
    this._clearRetryState(ownerKey);
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
    this.scheduleDrainFn(() => this.drain());
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
      const entries = snapshotMapEntries(this.pending);

      let claimed = 0;
      for (let index = 0; index < entries.length; index++) {
        if (claimed >= this.maxItemsPerDrain) {
          break;
        }
        const ownerKey = entries[index][0];
        const item = entries[index][1];
        mapDelete(this.pending, ownerKey);
        if (!this._claimPendingItem(ownerKey, item)) {
          break;
        }
        claimed++;
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
    if (setHas(this.inFlight, ownerKey)) {
      this._deferInFlightItem(ownerKey, item);
      return true;
    }
    if (setSize(this.inFlight) >= this.maxConcurrency) {
      mapSet(this.pending, ownerKey, item);
      return false;
    }

    const itemFence = item.fenceToken;
    if (itemFence !== undefined && itemFence !== null) {
      const currentFence = mapGet(this.fenceTokens, ownerKey);
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
    setAdd(this.inFlight, ownerKey);
    mapSet(this.inFlightItems, ownerKey, item);
    this.logger.debug(
      RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_CLAIMED, {
        queue: this.name,
        ownerKey,
      });

    const reasons = snapshotSetValues(item.reasons);
    try {
      const result = await this.reconcileFn(
        ownerKey, reasons, item.context,
      );
      this._clearRetryState(ownerKey);
      resolveWorkItemCompletionWaiters(item, result);
    } catch (error) {
      const retryHandled =
        this._deferRetryableDrainFailure(ownerKey, item, reasons, error);
      if (!retryHandled) {
        this._clearRetryState(ownerKey);
        rejectWorkItemCompletionWaiters(item, error);
        this.logger.warn(RECONCILE_QUEUE_LOG_MSG.DRAIN_ERROR, {
          queue: this.name,
          ownerKey,
          reasons,
          error: error.message,
        });
      }
    } finally {
      setDelete(this.inFlight, ownerKey);
      mapDelete(this.inFlightItems, ownerKey);
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
      mapSize(this.pending) === 0 ||
      setSize(this.inFlight) >= this.maxConcurrency
    ) {
      return;
    }
    let available = false;
    mapForEach(this.pending, (_item, ownerKey) => {
      if (!setHas(this.inFlight, ownerKey)) available = true;
    });
    if (available) this.scheduleDrain();
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
    const existing = mapGet(this.pending, ownerKey);
    if (existing) {
      setForEach(item.reasons, (reason) => setAdd(existing.reasons, reason));
      if (item.context !== null && item.context !== undefined) {
        existing.context = item.context;
      }
      mergeWorkItemCompletionWaiters(existing, item);
    } else {
      mapSet(this.pending, ownerKey, item);
    }

    const diagnostic = {
      type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
      queue: this.name,
      ownerKey,
      reasons: snapshotSetValues(item.reasons),
      timestamp: this.now(),
    };
    appendSnapshotValue(this.staleClaims, diagnostic);
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

  _deferRetryableDrainFailure(ownerKey, item, reasons, error) {
    return deferRetryableDrainFailure(
      this,
      ownerKey,
      item,
      reasons,
      error,
    );
  }

  _wakeRetryWorkItem(ownerKey) {
    return wakeRetryWorkItem(this, ownerKey);
  }

  _clearRetryTimer(ownerKey) {
    clearRetryTimer(this, ownerKey);
  }

  _clearRetryState(ownerKey) {
    clearRetryState(this, ownerKey);
  }

  snapshotReasons(reasons) {
    return snapshotSetValues(reasons);
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
      reasons: snapshotSetValues(item.reasons),
      providedToken,
      currentToken,
      timestamp: this.now(),
    };
    appendSnapshotValue(this.staleClaims, diagnostic);
    this._staleFenceRejectionCount++;
    this._pushStaleFenceSample(diagnostic);
    this.emit(
      RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN,
      diagnostic,
    );
    rejectWorkItemCompletionWaiters(
      item,
      new Error(RECONCILE_QUEUE_ERROR_MSG.STALE_FENCE_TOKEN),
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
      appendSnapshotValue(this._staleFenceSamples, sample);
    } else {
      defineSnapshotValue(
        this._staleFenceSamples,
        this._staleFenceSampleIndex,
        sample,
      );
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
    return setHas(this.inFlight, ownerKey);
  }

  configureRetryPolicy(policy = {}) {
    this.retryPolicy = normalizeReconcileQueueRetryPolicy({
      ...this.retryPolicy,
      ...policy,
    });
  }

  promotePending(ownerKey) {
    const item = mapGet(this.pending, ownerKey);
    if (!item) {
      return false;
    }
    mapDelete(this.pending, ownerKey);
    const promoted = new MapConstructor();
    mapSet(promoted, ownerKey, item);
    mapForEach(this.pending, (pendingItem, pendingOwnerKey) => {
      mapSet(promoted, pendingOwnerKey, pendingItem);
    });
    this.pending = promoted;
    return true;
  }

  /**
   * Discard queued or deferred work for one exact owner key. Active work is
   * allowed to finish, but cannot leave a retry or pending successor behind.
   * @param {string} ownerKey
   * @return {boolean} Whether queued or deferred state was removed.
   */
  discard(ownerKey) {
    const discardedItems = [
      mapGet(this.pending, ownerKey),
      mapGet(this.retryWorkItems, ownerKey),
      mapGet(this.exhaustedWorkItems, ownerKey),
    ];
    const removed = mapDelete(this.pending, ownerKey) ||
      mapHas(this.retryWorkItems, ownerKey) ||
      mapHas(this.exhaustedWorkItems, ownerKey);
    this._clearRetryState(ownerKey);
    const discardError = new Error(`${this.name} discarded ${ownerKey}`);
    for (let index = 0; index < discardedItems.length; index++) {
      rejectWorkItemCompletionWaiters(
        discardedItems[index],
        discardError,
      );
    }
    return removed;
  }

  /**
   * Return the number of pending (not yet drained) items.
   * @return {number}
   */
  get size() {
    const pendingKeys = new SetConstructor();
    mapForEach(this.pending,
      (_item, ownerKey) => setAdd(pendingKeys, ownerKey));
    mapForEach(this.retryWorkItems,
      (_item, ownerKey) => setAdd(pendingKeys, ownerKey));
    return setSize(pendingKeys);
  }

  /**
   * Check whether an owner key is currently pending.
   * @param {string} ownerKey
   * @return {boolean}
   */
  has(ownerKey) {
    return mapHas(this.pending, ownerKey) ||
      mapHas(this.retryWorkItems, ownerKey);
  }

  /**
   * Return a diagnostics snapshot of the queue state.
   * Exposes reconcile queue state by owner key per Requirement 9.
   * @return {Object}
   */
  getDiagnostics() {
    return buildReconcileQueueDiagnostics(this);
  }

  /**
   * Stop the queue. No further items will be processed.
   */
  shutdown() {
    this.stopped = true;
    rejectAllQueueCompletionWaiters(this);
    mapClear(this.pending);
    mapClear(this.retryWorkItems);
    mapClear(this.retryStates);
    mapClear(this.exhaustedWorkItems);
    mapClear(this.exhaustedRetryStates);
    mapForEach(this.retryTimers, (retryTimer) => {
      this.clearTimeoutFn(retryTimer);
    });
    mapClear(this.retryTimers);
    setClear(this.inFlight);
    mapClear(this.inFlightItems);
    mapClear(this.fenceTokens);
    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.SHUTDOWN, {
      queue: this.name,
    });
  }
}

export {OwnerKeyReconcileQueue};
