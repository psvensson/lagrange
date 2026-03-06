/**
 * OwnerKeyReconcileQueue — enqueue-only reconcile queue with
 * owner-key de-duplication and single-in-flight enforcement.
 *
 * Events enqueue owner keys with typed reason codes. The queue
 * de-duplicates by owner key: if an owner key is already pending,
 * the new reason is merged into the existing entry. A drain loop
 * processes pending items by calling the reconcile callback.
 *
 * At most one reconcile execution is active per owner key. If an
 * owner key is already in-flight when the drain loop reaches it,
 * the item is deferred back into the pending map and a typed
 * stale-claim diagnostic is recorded.
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
   */
  constructor(options = {}) {
    super();

    if (typeof options.reconcileFn !== 'function') {
      throw new Error(RECONCILE_QUEUE_ERROR_MSG.RECONCILE_FN_REQUIRED);
    }

    this.reconcileFn = options.reconcileFn;
    this.name = options.name || RECONCILE_QUEUE_SUBSYSTEM;

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
   * Drain pending items by calling reconcileFn for each.
   *
   * Items whose owner key is already in-flight are deferred back
   * into the pending map and picked up once the active reconcile
   * for that key completes. This guarantees at most one reconcile
   * execution per owner key.
   * @private
   */
  async drain() {
    try {
      while (this.pending.size > 0 && !this.stopped) {
        const entries = Array.from(this.pending.entries());
        this.pending.clear();

        let processedAny = false;
        for (const [ownerKey, item] of entries) {
          if (this.stopped) {
            break;
          }

          if (this.inFlight.has(ownerKey)) {
            this._deferInFlightItem(ownerKey, item);
            continue;
          }

          // Validate fence token before claiming.
          const itemFence = item.fenceToken;
          if (itemFence !== undefined && itemFence !== null) {
            const currentFence = this.fenceTokens.get(ownerKey);
            if (currentFence !== undefined &&
                itemFence < currentFence) {
              this._recordStaleFenceDiagnostic(
                ownerKey, item, itemFence, currentFence,
              );
              continue;
            }
          }

          processedAny = true;
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
          } catch (error) {
            this.logger.warn(RECONCILE_QUEUE_LOG_MSG.DRAIN_ERROR, {
              queue: this.name,
              ownerKey,
              reasons,
              error: error.message,
            });
          } finally {
            this.inFlight.delete(ownerKey);
            this.logger.debug(
              RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_RELEASED, {
                queue: this.name,
                ownerKey,
              });
          }
        }

        // If every item in the batch was deferred (all in-flight),
        // break to avoid a spin loop. Deferred items are picked up
        // when the active reconcile completes and a subsequent
        // enqueue triggers scheduleDrain.
        if (!processedAny) {
          break;
        }
      }
    } finally {
      this.draining = false;
      // If deferred items remain, schedule another drain so they
      // are picked up after the in-flight reconciles complete.
      if (this.pending.size > 0 && !this.stopped) {
        this.scheduleDrain();
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

  /**
   * Return the number of pending (not yet drained) items.
   * @return {number}
   */
  get size() {
    return this.pending.size;
  }

  /**
   * Check whether an owner key is currently pending.
   * @param {string} ownerKey
   * @return {boolean}
   */
  has(ownerKey) {
    return this.pending.has(ownerKey);
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
    return {
      queue: this.name,
      pendingKeys: Array.from(this.pending.keys()),
      inFlightKeys: Array.from(this.inFlight),
      fenceTokens: fenceEntries,
      staleClaims: this.staleClaims.slice(),
      staleFenceRejectionCount: this._staleFenceRejectionCount,
      staleInFlightDeferralCount: this._staleInFlightDeferralCount,
      recentStaleFenceSamples: this._staleFenceSamples.slice(),
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
    this.inFlight.clear();
    this.fenceTokens.clear();
    this.logger.debug(RECONCILE_QUEUE_LOG_MSG.SHUTDOWN, {
      queue: this.name,
    });
  }
}

export {OwnerKeyReconcileQueue};
