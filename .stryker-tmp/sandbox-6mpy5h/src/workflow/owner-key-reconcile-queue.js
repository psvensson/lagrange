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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { RECONCILE_QUEUE_SUBSYSTEM, RECONCILE_QUEUE_LOG_MSG, RECONCILE_QUEUE_ERROR_MSG, RECONCILE_QUEUE_DIAGNOSTIC, RECONCILE_QUEUE_EVENT, STALE_FENCE_SAMPLE_CAPACITY } from './reconcile-queue-constants.js';

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
    if (stryMutAct_9fa48("166938")) {
      {}
    } else {
      stryCov_9fa48("166938");
      super();
      if (stryMutAct_9fa48("166941") ? typeof options.reconcileFn === 'function' : stryMutAct_9fa48("166940") ? false : stryMutAct_9fa48("166939") ? true : (stryCov_9fa48("166939", "166940", "166941"), typeof options.reconcileFn !== (stryMutAct_9fa48("166942") ? "" : (stryCov_9fa48("166942"), 'function')))) {
        if (stryMutAct_9fa48("166943")) {
          {}
        } else {
          stryCov_9fa48("166943");
          throw new Error(RECONCILE_QUEUE_ERROR_MSG.RECONCILE_FN_REQUIRED);
        }
      }
      this.reconcileFn = options.reconcileFn;
      this.name = stryMutAct_9fa48("166946") ? options.name && RECONCILE_QUEUE_SUBSYSTEM : stryMutAct_9fa48("166945") ? false : stryMutAct_9fa48("166944") ? true : (stryCov_9fa48("166944", "166945", "166946"), options.name || RECONCILE_QUEUE_SUBSYSTEM);

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
      this.staleClaims = stryMutAct_9fa48("166947") ? ["Stryker was here"] : (stryCov_9fa48("166947"), []);
      this.draining = stryMutAct_9fa48("166948") ? true : (stryCov_9fa48("166948"), false);
      this.stopped = stryMutAct_9fa48("166949") ? true : (stryCov_9fa48("166949"), false);

      // Aggregate counters for stale-fence diagnostics.
      this._staleFenceRejectionCount = 0;
      this._staleInFlightDeferralCount = 0;

      // Bounded ring buffer for recent stale-fence event samples.
      this._staleFenceSamples = stryMutAct_9fa48("166950") ? ["Stryker was here"] : (stryCov_9fa48("166950"), []);
      this._staleFenceSampleIndex = 0;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(this.name) : console;
    }
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
    if (stryMutAct_9fa48("166951")) {
      {}
    } else {
      stryCov_9fa48("166951");
      if (stryMutAct_9fa48("166954") ? false : stryMutAct_9fa48("166953") ? true : stryMutAct_9fa48("166952") ? ownerKey : (stryCov_9fa48("166952", "166953", "166954"), !ownerKey)) {
        if (stryMutAct_9fa48("166955")) {
          {}
        } else {
          stryCov_9fa48("166955");
          throw new Error(RECONCILE_QUEUE_ERROR_MSG.OWNER_KEY_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("166957") ? false : stryMutAct_9fa48("166956") ? true : (stryCov_9fa48("166956", "166957"), this.stopped)) {
        if (stryMutAct_9fa48("166958")) {
          {}
        } else {
          stryCov_9fa48("166958");
          return stryMutAct_9fa48("166959") ? true : (stryCov_9fa48("166959"), false);
        }
      }
      const fenceToken = stryMutAct_9fa48("166960") ? options.fenceToken : (stryCov_9fa48("166960"), options?.fenceToken);
      if (stryMutAct_9fa48("166963") ? fenceToken !== undefined || fenceToken !== null : stryMutAct_9fa48("166962") ? false : stryMutAct_9fa48("166961") ? true : (stryCov_9fa48("166961", "166962", "166963"), (stryMutAct_9fa48("166965") ? fenceToken === undefined : stryMutAct_9fa48("166964") ? true : (stryCov_9fa48("166964", "166965"), fenceToken !== undefined)) && (stryMutAct_9fa48("166967") ? fenceToken === null : stryMutAct_9fa48("166966") ? true : (stryCov_9fa48("166966", "166967"), fenceToken !== null)))) {
        if (stryMutAct_9fa48("166968")) {
          {}
        } else {
          stryCov_9fa48("166968");
          const currentFence = this.fenceTokens.get(ownerKey);
          if (stryMutAct_9fa48("166971") ? currentFence !== undefined || fenceToken < currentFence : stryMutAct_9fa48("166970") ? false : stryMutAct_9fa48("166969") ? true : (stryCov_9fa48("166969", "166970", "166971"), (stryMutAct_9fa48("166973") ? currentFence === undefined : stryMutAct_9fa48("166972") ? true : (stryCov_9fa48("166972", "166973"), currentFence !== undefined)) && (stryMutAct_9fa48("166976") ? fenceToken >= currentFence : stryMutAct_9fa48("166975") ? fenceToken <= currentFence : stryMutAct_9fa48("166974") ? true : (stryCov_9fa48("166974", "166975", "166976"), fenceToken < currentFence)))) {
            if (stryMutAct_9fa48("166977")) {
              {}
            } else {
              stryCov_9fa48("166977");
              const diagnostic = stryMutAct_9fa48("166978") ? {} : (stryCov_9fa48("166978"), {
                type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
                queue: this.name,
                ownerKey,
                reason,
                providedToken: fenceToken,
                currentToken: currentFence,
                timestamp: Date.now()
              });
              this.staleClaims.push(diagnostic);
              stryMutAct_9fa48("166979") ? this._staleFenceRejectionCount-- : (stryCov_9fa48("166979"), this._staleFenceRejectionCount++);
              this._pushStaleFenceSample(diagnostic);
              this.emit(RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_ENQUEUE, diagnostic);
              this.logger.debug(RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, stryMutAct_9fa48("166980") ? {} : (stryCov_9fa48("166980"), {
                ...diagnostic
              }));
              return stryMutAct_9fa48("166981") ? true : (stryCov_9fa48("166981"), false);
            }
          }
          this.fenceTokens.set(ownerKey, fenceToken);
        }
      }
      const existing = this.pending.get(ownerKey);
      if (stryMutAct_9fa48("166983") ? false : stryMutAct_9fa48("166982") ? true : (stryCov_9fa48("166982", "166983"), existing)) {
        if (stryMutAct_9fa48("166984")) {
          {}
        } else {
          stryCov_9fa48("166984");
          existing.reasons.add(reason);
          if (stryMutAct_9fa48("166987") ? context === undefined : stryMutAct_9fa48("166986") ? false : stryMutAct_9fa48("166985") ? true : (stryCov_9fa48("166985", "166986", "166987"), context !== undefined)) {
            if (stryMutAct_9fa48("166988")) {
              {}
            } else {
              stryCov_9fa48("166988");
              existing.context = context;
            }
          }
          if (stryMutAct_9fa48("166991") ? fenceToken !== undefined || fenceToken !== null : stryMutAct_9fa48("166990") ? false : stryMutAct_9fa48("166989") ? true : (stryCov_9fa48("166989", "166990", "166991"), (stryMutAct_9fa48("166993") ? fenceToken === undefined : stryMutAct_9fa48("166992") ? true : (stryCov_9fa48("166992", "166993"), fenceToken !== undefined)) && (stryMutAct_9fa48("166995") ? fenceToken === null : stryMutAct_9fa48("166994") ? true : (stryCov_9fa48("166994", "166995"), fenceToken !== null)))) {
            if (stryMutAct_9fa48("166996")) {
              {}
            } else {
              stryCov_9fa48("166996");
              existing.fenceToken = fenceToken;
            }
          }
          this.logger.debug(RECONCILE_QUEUE_LOG_MSG.DEDUP_MERGED, stryMutAct_9fa48("166997") ? {} : (stryCov_9fa48("166997"), {
            queue: this.name,
            ownerKey,
            reason,
            pendingReasons: Array.from(existing.reasons)
          }));
          this.scheduleDrain();
          return stryMutAct_9fa48("166998") ? true : (stryCov_9fa48("166998"), false);
        }
      }
      const reasons = new Set();
      reasons.add(reason);
      const item = stryMutAct_9fa48("166999") ? {} : (stryCov_9fa48("166999"), {
        ownerKey,
        reasons,
        context: (stryMutAct_9fa48("167002") ? context === undefined : stryMutAct_9fa48("167001") ? false : stryMutAct_9fa48("167000") ? true : (stryCov_9fa48("167000", "167001", "167002"), context !== undefined)) ? context : null
      });
      if (stryMutAct_9fa48("167005") ? fenceToken !== undefined || fenceToken !== null : stryMutAct_9fa48("167004") ? false : stryMutAct_9fa48("167003") ? true : (stryCov_9fa48("167003", "167004", "167005"), (stryMutAct_9fa48("167007") ? fenceToken === undefined : stryMutAct_9fa48("167006") ? true : (stryCov_9fa48("167006", "167007"), fenceToken !== undefined)) && (stryMutAct_9fa48("167009") ? fenceToken === null : stryMutAct_9fa48("167008") ? true : (stryCov_9fa48("167008", "167009"), fenceToken !== null)))) {
        if (stryMutAct_9fa48("167010")) {
          {}
        } else {
          stryCov_9fa48("167010");
          item.fenceToken = fenceToken;
        }
      }
      this.pending.set(ownerKey, item);
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.ENQUEUED, stryMutAct_9fa48("167011") ? {} : (stryCov_9fa48("167011"), {
        queue: this.name,
        ownerKey,
        reason
      }));
      this.scheduleDrain();
      return stryMutAct_9fa48("167012") ? false : (stryCov_9fa48("167012"), true);
    }
  }

  /**
   * Schedule a drain if not already draining.
   * Uses a microtask to batch rapid enqueues.
   * @private
   */
  scheduleDrain() {
    if (stryMutAct_9fa48("167013")) {
      {}
    } else {
      stryCov_9fa48("167013");
      if (stryMutAct_9fa48("167016") ? this.draining && this.stopped : stryMutAct_9fa48("167015") ? false : stryMutAct_9fa48("167014") ? true : (stryCov_9fa48("167014", "167015", "167016"), this.draining || this.stopped)) {
        if (stryMutAct_9fa48("167017")) {
          {}
        } else {
          stryCov_9fa48("167017");
          return;
        }
      }
      this.draining = stryMutAct_9fa48("167018") ? false : (stryCov_9fa48("167018"), true);
      Promise.resolve().then(stryMutAct_9fa48("167019") ? () => undefined : (stryCov_9fa48("167019"), () => this.drain()));
    }
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
    if (stryMutAct_9fa48("167020")) {
      {}
    } else {
      stryCov_9fa48("167020");
      try {
        if (stryMutAct_9fa48("167021")) {
          {}
        } else {
          stryCov_9fa48("167021");
          while (stryMutAct_9fa48("167023") ? this.pending.size > 0 || !this.stopped : stryMutAct_9fa48("167022") ? false : (stryCov_9fa48("167022", "167023"), (stryMutAct_9fa48("167026") ? this.pending.size <= 0 : stryMutAct_9fa48("167025") ? this.pending.size >= 0 : stryMutAct_9fa48("167024") ? true : (stryCov_9fa48("167024", "167025", "167026"), this.pending.size > 0)) && (stryMutAct_9fa48("167027") ? this.stopped : (stryCov_9fa48("167027"), !this.stopped)))) {
            if (stryMutAct_9fa48("167028")) {
              {}
            } else {
              stryCov_9fa48("167028");
              const entries = Array.from(this.pending.entries());
              this.pending.clear();
              let processedAny = stryMutAct_9fa48("167029") ? true : (stryCov_9fa48("167029"), false);
              for (const [ownerKey, item] of entries) {
                if (stryMutAct_9fa48("167030")) {
                  {}
                } else {
                  stryCov_9fa48("167030");
                  if (stryMutAct_9fa48("167032") ? false : stryMutAct_9fa48("167031") ? true : (stryCov_9fa48("167031", "167032"), this.stopped)) {
                    if (stryMutAct_9fa48("167033")) {
                      {}
                    } else {
                      stryCov_9fa48("167033");
                      break;
                    }
                  }
                  if (stryMutAct_9fa48("167035") ? false : stryMutAct_9fa48("167034") ? true : (stryCov_9fa48("167034", "167035"), this.inFlight.has(ownerKey))) {
                    if (stryMutAct_9fa48("167036")) {
                      {}
                    } else {
                      stryCov_9fa48("167036");
                      this._deferInFlightItem(ownerKey, item);
                      continue;
                    }
                  }

                  // Validate fence token before claiming.
                  const itemFence = item.fenceToken;
                  if (stryMutAct_9fa48("167039") ? itemFence !== undefined || itemFence !== null : stryMutAct_9fa48("167038") ? false : stryMutAct_9fa48("167037") ? true : (stryCov_9fa48("167037", "167038", "167039"), (stryMutAct_9fa48("167041") ? itemFence === undefined : stryMutAct_9fa48("167040") ? true : (stryCov_9fa48("167040", "167041"), itemFence !== undefined)) && (stryMutAct_9fa48("167043") ? itemFence === null : stryMutAct_9fa48("167042") ? true : (stryCov_9fa48("167042", "167043"), itemFence !== null)))) {
                    if (stryMutAct_9fa48("167044")) {
                      {}
                    } else {
                      stryCov_9fa48("167044");
                      const currentFence = this.fenceTokens.get(ownerKey);
                      if (stryMutAct_9fa48("167047") ? currentFence !== undefined || itemFence < currentFence : stryMutAct_9fa48("167046") ? false : stryMutAct_9fa48("167045") ? true : (stryCov_9fa48("167045", "167046", "167047"), (stryMutAct_9fa48("167049") ? currentFence === undefined : stryMutAct_9fa48("167048") ? true : (stryCov_9fa48("167048", "167049"), currentFence !== undefined)) && (stryMutAct_9fa48("167052") ? itemFence >= currentFence : stryMutAct_9fa48("167051") ? itemFence <= currentFence : stryMutAct_9fa48("167050") ? true : (stryCov_9fa48("167050", "167051", "167052"), itemFence < currentFence)))) {
                        if (stryMutAct_9fa48("167053")) {
                          {}
                        } else {
                          stryCov_9fa48("167053");
                          this._recordStaleFenceDiagnostic(ownerKey, item, itemFence, currentFence);
                          continue;
                        }
                      }
                    }
                  }
                  processedAny = stryMutAct_9fa48("167054") ? false : (stryCov_9fa48("167054"), true);
                  this.inFlight.add(ownerKey);
                  this.logger.debug(RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_CLAIMED, stryMutAct_9fa48("167055") ? {} : (stryCov_9fa48("167055"), {
                    queue: this.name,
                    ownerKey
                  }));
                  const reasons = Array.from(item.reasons);
                  try {
                    if (stryMutAct_9fa48("167056")) {
                      {}
                    } else {
                      stryCov_9fa48("167056");
                      await this.reconcileFn(ownerKey, reasons, item.context);
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("167057")) {
                      {}
                    } else {
                      stryCov_9fa48("167057");
                      this.logger.warn(RECONCILE_QUEUE_LOG_MSG.DRAIN_ERROR, stryMutAct_9fa48("167058") ? {} : (stryCov_9fa48("167058"), {
                        queue: this.name,
                        ownerKey,
                        reasons,
                        error: error.message
                      }));
                    }
                  } finally {
                    if (stryMutAct_9fa48("167059")) {
                      {}
                    } else {
                      stryCov_9fa48("167059");
                      this.inFlight.delete(ownerKey);
                      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_RELEASED, stryMutAct_9fa48("167060") ? {} : (stryCov_9fa48("167060"), {
                        queue: this.name,
                        ownerKey
                      }));
                    }
                  }
                }
              }

              // If every item in the batch was deferred (all in-flight),
              // break to avoid a spin loop. Deferred items are picked up
              // when the active reconcile completes and a subsequent
              // enqueue triggers scheduleDrain.
              if (stryMutAct_9fa48("167063") ? false : stryMutAct_9fa48("167062") ? true : stryMutAct_9fa48("167061") ? processedAny : (stryCov_9fa48("167061", "167062", "167063"), !processedAny)) {
                if (stryMutAct_9fa48("167064")) {
                  {}
                } else {
                  stryCov_9fa48("167064");
                  break;
                }
              }
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("167065")) {
          {}
        } else {
          stryCov_9fa48("167065");
          this.draining = stryMutAct_9fa48("167066") ? true : (stryCov_9fa48("167066"), false);
          // If deferred items remain, schedule another drain so they
          // are picked up after the in-flight reconciles complete.
          if (stryMutAct_9fa48("167069") ? this.pending.size > 0 || !this.stopped : stryMutAct_9fa48("167068") ? false : stryMutAct_9fa48("167067") ? true : (stryCov_9fa48("167067", "167068", "167069"), (stryMutAct_9fa48("167072") ? this.pending.size <= 0 : stryMutAct_9fa48("167071") ? this.pending.size >= 0 : stryMutAct_9fa48("167070") ? true : (stryCov_9fa48("167070", "167071", "167072"), this.pending.size > 0)) && (stryMutAct_9fa48("167073") ? this.stopped : (stryCov_9fa48("167073"), !this.stopped)))) {
            if (stryMutAct_9fa48("167074")) {
              {}
            } else {
              stryCov_9fa48("167074");
              this.scheduleDrain();
            }
          }
        }
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
    if (stryMutAct_9fa48("167075")) {
      {}
    } else {
      stryCov_9fa48("167075");
      const existing = this.pending.get(ownerKey);
      if (stryMutAct_9fa48("167077") ? false : stryMutAct_9fa48("167076") ? true : (stryCov_9fa48("167076", "167077"), existing)) {
        if (stryMutAct_9fa48("167078")) {
          {}
        } else {
          stryCov_9fa48("167078");
          for (const r of item.reasons) {
            if (stryMutAct_9fa48("167079")) {
              {}
            } else {
              stryCov_9fa48("167079");
              existing.reasons.add(r);
            }
          }
          if (stryMutAct_9fa48("167082") ? item.context !== null || item.context !== undefined : stryMutAct_9fa48("167081") ? false : stryMutAct_9fa48("167080") ? true : (stryCov_9fa48("167080", "167081", "167082"), (stryMutAct_9fa48("167084") ? item.context === null : stryMutAct_9fa48("167083") ? true : (stryCov_9fa48("167083", "167084"), item.context !== null)) && (stryMutAct_9fa48("167086") ? item.context === undefined : stryMutAct_9fa48("167085") ? true : (stryCov_9fa48("167085", "167086"), item.context !== undefined)))) {
            if (stryMutAct_9fa48("167087")) {
              {}
            } else {
              stryCov_9fa48("167087");
              existing.context = item.context;
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("167088")) {
          {}
        } else {
          stryCov_9fa48("167088");
          this.pending.set(ownerKey, item);
        }
      }
      const diagnostic = stryMutAct_9fa48("167089") ? {} : (stryCov_9fa48("167089"), {
        type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
        queue: this.name,
        ownerKey,
        reasons: Array.from(item.reasons),
        timestamp: Date.now()
      });
      this.staleClaims.push(diagnostic);
      stryMutAct_9fa48("167090") ? this._staleInFlightDeferralCount-- : (stryCov_9fa48("167090"), this._staleInFlightDeferralCount++);
      this._pushStaleFenceSample(diagnostic);
      this.emit(RECONCILE_QUEUE_EVENT.STALE_CLAIM_DEFERRED, diagnostic);
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.IN_FLIGHT_DEFERRED, stryMutAct_9fa48("167091") ? {} : (stryCov_9fa48("167091"), {
        ...diagnostic
      }));
    }
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
  _recordStaleFenceDiagnostic(ownerKey, item, providedToken, currentToken) {
    if (stryMutAct_9fa48("167092")) {
      {}
    } else {
      stryCov_9fa48("167092");
      const diagnostic = stryMutAct_9fa48("167093") ? {} : (stryCov_9fa48("167093"), {
        type: RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
        queue: this.name,
        ownerKey,
        reasons: Array.from(item.reasons),
        providedToken,
        currentToken,
        timestamp: Date.now()
      });
      this.staleClaims.push(diagnostic);
      stryMutAct_9fa48("167094") ? this._staleFenceRejectionCount-- : (stryCov_9fa48("167094"), this._staleFenceRejectionCount++);
      this._pushStaleFenceSample(diagnostic);
      this.emit(RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN, diagnostic);
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.STALE_FENCE_REJECTED, stryMutAct_9fa48("167095") ? {} : (stryCov_9fa48("167095"), {
        ...diagnostic
      }));
    }
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
    if (stryMutAct_9fa48("167096")) {
      {}
    } else {
      stryCov_9fa48("167096");
      if (stryMutAct_9fa48("167100") ? this._staleFenceSamples.length >= STALE_FENCE_SAMPLE_CAPACITY : stryMutAct_9fa48("167099") ? this._staleFenceSamples.length <= STALE_FENCE_SAMPLE_CAPACITY : stryMutAct_9fa48("167098") ? false : stryMutAct_9fa48("167097") ? true : (stryCov_9fa48("167097", "167098", "167099", "167100"), this._staleFenceSamples.length < STALE_FENCE_SAMPLE_CAPACITY)) {
        if (stryMutAct_9fa48("167101")) {
          {}
        } else {
          stryCov_9fa48("167101");
          this._staleFenceSamples.push(sample);
        }
      } else {
        if (stryMutAct_9fa48("167102")) {
          {}
        } else {
          stryCov_9fa48("167102");
          this._staleFenceSamples[this._staleFenceSampleIndex] = sample;
        }
      }
      this._staleFenceSampleIndex = stryMutAct_9fa48("167103") ? (this._staleFenceSampleIndex + 1) * STALE_FENCE_SAMPLE_CAPACITY : (stryCov_9fa48("167103"), (stryMutAct_9fa48("167104") ? this._staleFenceSampleIndex - 1 : (stryCov_9fa48("167104"), this._staleFenceSampleIndex + 1)) % STALE_FENCE_SAMPLE_CAPACITY);
    }
  }

  /**
   * Check whether an owner key currently has an active reconcile
   * execution.
   * @param {string} ownerKey
   * @return {boolean}
   */
  isInFlight(ownerKey) {
    if (stryMutAct_9fa48("167105")) {
      {}
    } else {
      stryCov_9fa48("167105");
      return this.inFlight.has(ownerKey);
    }
  }

  /**
   * Return the number of pending (not yet drained) items.
   * @return {number}
   */
  get size() {
    if (stryMutAct_9fa48("167106")) {
      {}
    } else {
      stryCov_9fa48("167106");
      return this.pending.size;
    }
  }

  /**
   * Check whether an owner key is currently pending.
   * @param {string} ownerKey
   * @return {boolean}
   */
  has(ownerKey) {
    if (stryMutAct_9fa48("167107")) {
      {}
    } else {
      stryCov_9fa48("167107");
      return this.pending.has(ownerKey);
    }
  }

  /**
   * Return a diagnostics snapshot of the queue state.
   * Exposes reconcile queue state by owner key per Requirement 9.
   * @return {Object}
   */
  getDiagnostics() {
    if (stryMutAct_9fa48("167108")) {
      {}
    } else {
      stryCov_9fa48("167108");
      const fenceEntries = {};
      for (const [key, token] of this.fenceTokens) {
        if (stryMutAct_9fa48("167109")) {
          {}
        } else {
          stryCov_9fa48("167109");
          fenceEntries[key] = token;
        }
      }
      return stryMutAct_9fa48("167110") ? {} : (stryCov_9fa48("167110"), {
        queue: this.name,
        pendingKeys: Array.from(this.pending.keys()),
        inFlightKeys: Array.from(this.inFlight),
        fenceTokens: fenceEntries,
        staleClaims: stryMutAct_9fa48("167111") ? this.staleClaims : (stryCov_9fa48("167111"), this.staleClaims.slice()),
        staleFenceRejectionCount: this._staleFenceRejectionCount,
        staleInFlightDeferralCount: this._staleInFlightDeferralCount,
        recentStaleFenceSamples: stryMutAct_9fa48("167112") ? this._staleFenceSamples : (stryCov_9fa48("167112"), this._staleFenceSamples.slice()),
        draining: this.draining,
        stopped: this.stopped
      });
    }
  }

  /**
   * Stop the queue. No further items will be processed.
   */
  shutdown() {
    if (stryMutAct_9fa48("167113")) {
      {}
    } else {
      stryCov_9fa48("167113");
      this.stopped = stryMutAct_9fa48("167114") ? false : (stryCov_9fa48("167114"), true);
      this.pending.clear();
      this.inFlight.clear();
      this.fenceTokens.clear();
      this.logger.debug(RECONCILE_QUEUE_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("167115") ? {} : (stryCov_9fa48("167115"), {
        queue: this.name
      }));
    }
  }
}
export { OwnerKeyReconcileQueue };