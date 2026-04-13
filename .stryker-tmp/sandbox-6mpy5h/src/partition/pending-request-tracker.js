/**
 * PendingRequestTracker - Map-based request tracking with timeout management.
 * Replaces EventEmitter-based ACK handling to prevent memory leaks.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM } from '../constants/index.js';
import { PARTITION_SUBSYSTEM, PENDING_REQUEST_DEFAULT, PENDING_REQUEST_ERROR_MSG, PENDING_REQUEST_LOG_MSG } from './partition-constants.js';
const WAIT_TIME_BUCKETS = Object.freeze(stryMutAct_9fa48("107472") ? [] : (stryCov_9fa48("107472"), [stryMutAct_9fa48("107473") ? {} : (stryCov_9fa48("107473"), {
  upperBoundMs: 10,
  label: stryMutAct_9fa48("107474") ? "" : (stryCov_9fa48("107474"), 'le_10ms')
}), stryMutAct_9fa48("107475") ? {} : (stryCov_9fa48("107475"), {
  upperBoundMs: 50,
  label: stryMutAct_9fa48("107476") ? "" : (stryCov_9fa48("107476"), 'le_50ms')
}), stryMutAct_9fa48("107477") ? {} : (stryCov_9fa48("107477"), {
  upperBoundMs: 100,
  label: stryMutAct_9fa48("107478") ? "" : (stryCov_9fa48("107478"), 'le_100ms')
}), stryMutAct_9fa48("107479") ? {} : (stryCov_9fa48("107479"), {
  upperBoundMs: 250,
  label: stryMutAct_9fa48("107480") ? "" : (stryCov_9fa48("107480"), 'le_250ms')
}), stryMutAct_9fa48("107481") ? {} : (stryCov_9fa48("107481"), {
  upperBoundMs: 500,
  label: stryMutAct_9fa48("107482") ? "" : (stryCov_9fa48("107482"), 'le_500ms')
}), stryMutAct_9fa48("107483") ? {} : (stryCov_9fa48("107483"), {
  upperBoundMs: 1000,
  label: stryMutAct_9fa48("107484") ? "" : (stryCov_9fa48("107484"), 'le_1000ms')
}), stryMutAct_9fa48("107485") ? {} : (stryCov_9fa48("107485"), {
  upperBoundMs: 5000,
  label: stryMutAct_9fa48("107486") ? "" : (stryCov_9fa48("107486"), 'le_5000ms')
})]));
const WAIT_TIME_BUCKET_OVERFLOW = stryMutAct_9fa48("107487") ? "" : (stryCov_9fa48("107487"), 'gt_5000ms');

/**
 * PendingRequestTracker manages pending lifecycle requests using a Map.
 * Each request is tracked with resolve/reject callbacks and automatic timeout.
 */
class PendingRequestTracker {
  /**
   * Create a new PendingRequestTracker.
   * @param {Object} options - Configuration options.
   * @param {number} options.defaultTimeoutMs - Default timeout in milliseconds (default: 30000).
   * @param {number} options.cleanupIntervalMs - Cleanup interval in milliseconds (default: 60000).
   * @param {number} options.maxPendingRequests - Maximum tracked requests before backpressure.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("107488")) {
      {}
    } else {
      stryCov_9fa48("107488");
      this.pendingRequests = new Map();
      this.defaultTimeoutMs = stryMutAct_9fa48("107491") ? options.defaultTimeoutMs && PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS : stryMutAct_9fa48("107490") ? false : stryMutAct_9fa48("107489") ? true : (stryCov_9fa48("107489", "107490", "107491"), options.defaultTimeoutMs || PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS);
      this.cleanupIntervalMs = stryMutAct_9fa48("107494") ? options.cleanupIntervalMs && PENDING_REQUEST_DEFAULT.CLEANUP_INTERVAL_MS : stryMutAct_9fa48("107493") ? false : stryMutAct_9fa48("107492") ? true : (stryCov_9fa48("107492", "107493", "107494"), options.cleanupIntervalMs || PENDING_REQUEST_DEFAULT.CLEANUP_INTERVAL_MS);
      this.maxPendingRequests = (stryMutAct_9fa48("107497") ? Number.isFinite(options.maxPendingRequests) || options.maxPendingRequests > NUM.ZERO : stryMutAct_9fa48("107496") ? false : stryMutAct_9fa48("107495") ? true : (stryCov_9fa48("107495", "107496", "107497"), Number.isFinite(options.maxPendingRequests) && (stryMutAct_9fa48("107500") ? options.maxPendingRequests <= NUM.ZERO : stryMutAct_9fa48("107499") ? options.maxPendingRequests >= NUM.ZERO : stryMutAct_9fa48("107498") ? true : (stryCov_9fa48("107498", "107499", "107500"), options.maxPendingRequests > NUM.ZERO)))) ? Math.floor(options.maxPendingRequests) : PENDING_REQUEST_DEFAULT.MAX_PENDING_REQUESTS;
      this.cleanupTimer = null;
      this.stats = this.createStatsState();

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(PARTITION_SUBSYSTEM.PENDING_REQUEST_TRACKER) : console;
    }
  }

  /**
   * Create baseline tracker statistics state.
   * @return {Object}
   * @private
   */
  createStatsState() {
    if (stryMutAct_9fa48("107501")) {
      {}
    } else {
      stryCov_9fa48("107501");
      return stryMutAct_9fa48("107502") ? {} : (stryCov_9fa48("107502"), {
        trackedTotal: NUM.ZERO,
        resolvedTotal: NUM.ZERO,
        rejectedTotal: NUM.ZERO,
        timedOutTotal: NUM.ZERO,
        staleCleanedTotal: NUM.ZERO,
        backpressureRejectTotal: NUM.ZERO,
        maxPendingObserved: NUM.ZERO,
        waitTimeSampleCount: NUM.ZERO,
        waitTimeTotalMs: NUM.ZERO,
        waitTimeMaxMs: NUM.ZERO,
        waitTimeHistogram: this.createWaitTimeHistogram()
      });
    }
  }

  /**
   * Create a fresh wait-time histogram bucket map.
   * @return {Object}
   * @private
   */
  createWaitTimeHistogram() {
    if (stryMutAct_9fa48("107503")) {
      {}
    } else {
      stryCov_9fa48("107503");
      const histogram = {};
      for (const bucket of WAIT_TIME_BUCKETS) {
        if (stryMutAct_9fa48("107504")) {
          {}
        } else {
          stryCov_9fa48("107504");
          histogram[bucket.label] = NUM.ZERO;
        }
      }
      histogram[WAIT_TIME_BUCKET_OVERFLOW] = NUM.ZERO;
      return histogram;
    }
  }

  /**
   * Resolve histogram bucket label for a wait duration.
   * @param {number} durationMs
   * @return {string}
   * @private
   */
  resolveWaitTimeBucket(durationMs) {
    if (stryMutAct_9fa48("107505")) {
      {}
    } else {
      stryCov_9fa48("107505");
      const normalized = Number.isFinite(durationMs) ? stryMutAct_9fa48("107506") ? Math.min(NUM.ZERO, Math.floor(durationMs)) : (stryCov_9fa48("107506"), Math.max(NUM.ZERO, Math.floor(durationMs))) : NUM.ZERO;
      for (const bucket of WAIT_TIME_BUCKETS) {
        if (stryMutAct_9fa48("107507")) {
          {}
        } else {
          stryCov_9fa48("107507");
          if (stryMutAct_9fa48("107511") ? normalized > bucket.upperBoundMs : stryMutAct_9fa48("107510") ? normalized < bucket.upperBoundMs : stryMutAct_9fa48("107509") ? false : stryMutAct_9fa48("107508") ? true : (stryCov_9fa48("107508", "107509", "107510", "107511"), normalized <= bucket.upperBoundMs)) {
            if (stryMutAct_9fa48("107512")) {
              {}
            } else {
              stryCov_9fa48("107512");
              return bucket.label;
            }
          }
        }
      }
      return WAIT_TIME_BUCKET_OVERFLOW;
    }
  }

  /**
   * Record a wait-time observation in aggregate stats.
   * @param {number} durationMs
   * @private
   */
  recordWaitTime(durationMs) {
    if (stryMutAct_9fa48("107513")) {
      {}
    } else {
      stryCov_9fa48("107513");
      const normalized = Number.isFinite(durationMs) ? stryMutAct_9fa48("107514") ? Math.min(NUM.ZERO, Math.floor(durationMs)) : (stryCov_9fa48("107514"), Math.max(NUM.ZERO, Math.floor(durationMs))) : NUM.ZERO;
      stryMutAct_9fa48("107515") ? this.stats.waitTimeSampleCount -= NUM.ONE : (stryCov_9fa48("107515"), this.stats.waitTimeSampleCount += NUM.ONE);
      stryMutAct_9fa48("107516") ? this.stats.waitTimeTotalMs -= normalized : (stryCov_9fa48("107516"), this.stats.waitTimeTotalMs += normalized);
      this.stats.waitTimeMaxMs = stryMutAct_9fa48("107517") ? Math.min(this.stats.waitTimeMaxMs, normalized) : (stryCov_9fa48("107517"), Math.max(this.stats.waitTimeMaxMs, normalized));
      const bucket = this.resolveWaitTimeBucket(normalized);
      this.stats.waitTimeHistogram[bucket] = stryMutAct_9fa48("107518") ? (this.stats.waitTimeHistogram[bucket] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("107518"), (stryMutAct_9fa48("107521") ? this.stats.waitTimeHistogram[bucket] && NUM.ZERO : stryMutAct_9fa48("107520") ? false : stryMutAct_9fa48("107519") ? true : (stryCov_9fa48("107519", "107520", "107521"), this.stats.waitTimeHistogram[bucket] || NUM.ZERO)) + NUM.ONE);
    }
  }

  /**
   * Update max pending watermark using current queue size.
   * @private
   */
  updateMaxPendingObserved() {
    if (stryMutAct_9fa48("107522")) {
      {}
    } else {
      stryCov_9fa48("107522");
      this.stats.maxPendingObserved = stryMutAct_9fa48("107523") ? Math.min(this.stats.maxPendingObserved, this.pendingRequests.size) : (stryCov_9fa48("107523"), Math.max(this.stats.maxPendingObserved, this.pendingRequests.size));
    }
  }

  /**
   * Track a pending request.
   * @param {string} requestId - Unique request ID.
   * @param {Object} metadata - Request metadata (type, targetNode, etc.).
   * @return {Promise<Object>} Promise that resolves with ACK or rejects on timeout.
   */
  track(requestId, metadata = {}) {
    if (stryMutAct_9fa48("107524")) {
      {}
    } else {
      stryCov_9fa48("107524");
      if (stryMutAct_9fa48("107528") ? this.pendingRequests.size < this.maxPendingRequests : stryMutAct_9fa48("107527") ? this.pendingRequests.size > this.maxPendingRequests : stryMutAct_9fa48("107526") ? false : stryMutAct_9fa48("107525") ? true : (stryCov_9fa48("107525", "107526", "107527", "107528"), this.pendingRequests.size >= this.maxPendingRequests)) {
        if (stryMutAct_9fa48("107529")) {
          {}
        } else {
          stryCov_9fa48("107529");
          stryMutAct_9fa48("107530") ? this.stats.backpressureRejectTotal -= NUM.ONE : (stryCov_9fa48("107530"), this.stats.backpressureRejectTotal += NUM.ONE);
          this.logger.warn(PENDING_REQUEST_LOG_MSG.BACKPRESSURE_APPLIED, stryMutAct_9fa48("107531") ? {} : (stryCov_9fa48("107531"), {
            requestId,
            type: metadata.type,
            pendingCount: this.pendingRequests.size,
            maxPendingRequests: this.maxPendingRequests
          }));
          throw new Error(PENDING_REQUEST_ERROR_MSG.backpressure(this.maxPendingRequests));
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("107532")) {
          {}
        } else {
          stryCov_9fa48("107532");
          const timeoutMs = stryMutAct_9fa48("107535") ? metadata.timeoutMs && this.defaultTimeoutMs : stryMutAct_9fa48("107534") ? false : stryMutAct_9fa48("107533") ? true : (stryCov_9fa48("107533", "107534", "107535"), metadata.timeoutMs || this.defaultTimeoutMs);
          const startedAt = Date.now();
          const timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("107536")) {
              {}
            } else {
              stryCov_9fa48("107536");
              this.pendingRequests.delete(requestId);
              this.recordWaitTime(stryMutAct_9fa48("107537") ? Date.now() + startedAt : (stryCov_9fa48("107537"), Date.now() - startedAt));
              stryMutAct_9fa48("107538") ? this.stats.timedOutTotal -= NUM.ONE : (stryCov_9fa48("107538"), this.stats.timedOutTotal += NUM.ONE);
              stryMutAct_9fa48("107539") ? this.stats.rejectedTotal -= NUM.ONE : (stryCov_9fa48("107539"), this.stats.rejectedTotal += NUM.ONE);
              this.logger.warn(PENDING_REQUEST_LOG_MSG.REQUEST_TIMED_OUT, stryMutAct_9fa48("107540") ? {} : (stryCov_9fa48("107540"), {
                requestId,
                timeoutMs,
                type: metadata.type
              }));
              reject(new Error(PENDING_REQUEST_ERROR_MSG.ackTimeout(timeoutMs, requestId)));
            }
          }, timeoutMs);
          this.pendingRequests.set(requestId, stryMutAct_9fa48("107541") ? {} : (stryCov_9fa48("107541"), {
            resolve,
            reject,
            timeoutId,
            metadata,
            startedAt
          }));
          stryMutAct_9fa48("107542") ? this.stats.trackedTotal -= NUM.ONE : (stryCov_9fa48("107542"), this.stats.trackedTotal += NUM.ONE);
          this.updateMaxPendingObserved();
          this.logger.debug(PENDING_REQUEST_LOG_MSG.TRACKING_REQUEST, stryMutAct_9fa48("107543") ? {} : (stryCov_9fa48("107543"), {
            requestId,
            type: metadata.type,
            targetAddress: metadata.targetAddress
          }));
        }
      });
    }
  }

  /**
   * Resolve a pending request with an ACK.
   * @param {string} requestId - Request ID from ACK.
   * @param {Object} ack - ACK response.
   * @return {boolean} True if request was found and resolved.
   */
  resolve(requestId, ack) {
    if (stryMutAct_9fa48("107544")) {
      {}
    } else {
      stryCov_9fa48("107544");
      const pending = this.pendingRequests.get(requestId);
      if (stryMutAct_9fa48("107546") ? false : stryMutAct_9fa48("107545") ? true : (stryCov_9fa48("107545", "107546"), pending)) {
        if (stryMutAct_9fa48("107547")) {
          {}
        } else {
          stryCov_9fa48("107547");
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(requestId);
          pending.resolve(ack);
          const durationMs = stryMutAct_9fa48("107548") ? Date.now() + pending.startedAt : (stryCov_9fa48("107548"), Date.now() - pending.startedAt);
          this.recordWaitTime(durationMs);
          stryMutAct_9fa48("107549") ? this.stats.resolvedTotal -= NUM.ONE : (stryCov_9fa48("107549"), this.stats.resolvedTotal += NUM.ONE);
          this.logger.debug(PENDING_REQUEST_LOG_MSG.REQUEST_RESOLVED, stryMutAct_9fa48("107550") ? {} : (stryCov_9fa48("107550"), {
            requestId,
            durationMs
          }));
          return stryMutAct_9fa48("107551") ? false : (stryCov_9fa48("107551"), true);
        }
      }
      this.logger.debug(PENDING_REQUEST_LOG_MSG.NO_PENDING_REQUEST_RESOLVE, stryMutAct_9fa48("107552") ? {} : (stryCov_9fa48("107552"), {
        requestId
      }));
      return stryMutAct_9fa48("107553") ? true : (stryCov_9fa48("107553"), false);
    }
  }

  /**
   * Reject a pending request with an error.
   * @param {string} requestId - Request ID.
   * @param {Error|string} error - Error to reject with.
   * @return {boolean} True if request was found and rejected.
   */
  reject(requestId, error) {
    if (stryMutAct_9fa48("107554")) {
      {}
    } else {
      stryCov_9fa48("107554");
      const pending = this.pendingRequests.get(requestId);
      if (stryMutAct_9fa48("107556") ? false : stryMutAct_9fa48("107555") ? true : (stryCov_9fa48("107555", "107556"), pending)) {
        if (stryMutAct_9fa48("107557")) {
          {}
        } else {
          stryCov_9fa48("107557");
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(requestId);
          const errorObj = error instanceof Error ? error : new Error(error);
          pending.reject(errorObj);
          this.recordWaitTime(stryMutAct_9fa48("107558") ? Date.now() + pending.startedAt : (stryCov_9fa48("107558"), Date.now() - pending.startedAt));
          stryMutAct_9fa48("107559") ? this.stats.rejectedTotal -= NUM.ONE : (stryCov_9fa48("107559"), this.stats.rejectedTotal += NUM.ONE);
          this.logger.debug(PENDING_REQUEST_LOG_MSG.REQUEST_REJECTED, stryMutAct_9fa48("107560") ? {} : (stryCov_9fa48("107560"), {
            requestId,
            error: errorObj.message
          }));
          return stryMutAct_9fa48("107561") ? false : (stryCov_9fa48("107561"), true);
        }
      }
      this.logger.debug(PENDING_REQUEST_LOG_MSG.NO_PENDING_REQUEST_REJECT, stryMutAct_9fa48("107562") ? {} : (stryCov_9fa48("107562"), {
        requestId
      }));
      return stryMutAct_9fa48("107563") ? true : (stryCov_9fa48("107563"), false);
    }
  }

  /**
   * Check if a request is pending.
   * @param {string} requestId - Request ID to check.
   * @return {boolean} True if request is pending.
   */
  hasPending(requestId) {
    if (stryMutAct_9fa48("107564")) {
      {}
    } else {
      stryCov_9fa48("107564");
      return this.pendingRequests.has(requestId);
    }
  }

  /**
   * Get count of pending requests.
   * @return {number} Number of pending requests.
   */
  getPendingCount() {
    if (stryMutAct_9fa48("107565")) {
      {}
    } else {
      stryCov_9fa48("107565");
      return this.pendingRequests.size;
    }
  }

  /**
   * Get bounded queue and lifecycle statistics.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("107566")) {
      {}
    } else {
      stryCov_9fa48("107566");
      const pendingCount = this.pendingRequests.size;
      const saturationPercent = (stryMutAct_9fa48("107570") ? this.maxPendingRequests <= NUM.ZERO : stryMutAct_9fa48("107569") ? this.maxPendingRequests >= NUM.ZERO : stryMutAct_9fa48("107568") ? false : stryMutAct_9fa48("107567") ? true : (stryCov_9fa48("107567", "107568", "107569", "107570"), this.maxPendingRequests > NUM.ZERO)) ? Math.round(stryMutAct_9fa48("107571") ? pendingCount / this.maxPendingRequests / NUM.HUNDRED : (stryCov_9fa48("107571"), (stryMutAct_9fa48("107572") ? pendingCount * this.maxPendingRequests : (stryCov_9fa48("107572"), pendingCount / this.maxPendingRequests)) * NUM.HUNDRED)) : NUM.ZERO;
      const waitTimeSampleCount = this.stats.waitTimeSampleCount;
      const waitTimeAvgMs = (stryMutAct_9fa48("107576") ? waitTimeSampleCount <= NUM.ZERO : stryMutAct_9fa48("107575") ? waitTimeSampleCount >= NUM.ZERO : stryMutAct_9fa48("107574") ? false : stryMutAct_9fa48("107573") ? true : (stryCov_9fa48("107573", "107574", "107575", "107576"), waitTimeSampleCount > NUM.ZERO)) ? Math.round(stryMutAct_9fa48("107577") ? this.stats.waitTimeTotalMs * waitTimeSampleCount : (stryCov_9fa48("107577"), this.stats.waitTimeTotalMs / waitTimeSampleCount)) : NUM.ZERO;
      return stryMutAct_9fa48("107578") ? {} : (stryCov_9fa48("107578"), {
        pendingCount,
        maxPendingRequests: this.maxPendingRequests,
        availableCapacity: stryMutAct_9fa48("107579") ? Math.min(NUM.ZERO, this.maxPendingRequests - pendingCount) : (stryCov_9fa48("107579"), Math.max(NUM.ZERO, stryMutAct_9fa48("107580") ? this.maxPendingRequests + pendingCount : (stryCov_9fa48("107580"), this.maxPendingRequests - pendingCount))),
        saturationPercent,
        trackedTotal: this.stats.trackedTotal,
        resolvedTotal: this.stats.resolvedTotal,
        rejectedTotal: this.stats.rejectedTotal,
        timedOutTotal: this.stats.timedOutTotal,
        staleCleanedTotal: this.stats.staleCleanedTotal,
        backpressureRejectTotal: this.stats.backpressureRejectTotal,
        maxPendingObserved: this.stats.maxPendingObserved,
        waitTime: stryMutAct_9fa48("107581") ? {} : (stryCov_9fa48("107581"), {
          sampleCount: waitTimeSampleCount,
          avgMs: waitTimeAvgMs,
          maxMs: this.stats.waitTimeMaxMs,
          histogram: stryMutAct_9fa48("107582") ? {} : (stryCov_9fa48("107582"), {
            ...this.stats.waitTimeHistogram
          })
        })
      });
    }
  }

  /**
   * Get metadata for a pending request.
   * @param {string} requestId - Request ID.
   * @return {Object|null} Request metadata or null if not found.
   */
  getMetadata(requestId) {
    if (stryMutAct_9fa48("107583")) {
      {}
    } else {
      stryCov_9fa48("107583");
      const pending = this.pendingRequests.get(requestId);
      return pending ? pending.metadata : null;
    }
  }

  /**
   * Get all pending request IDs.
   * @return {Array<string>} Array of pending request IDs.
   */
  getPendingIds() {
    if (stryMutAct_9fa48("107584")) {
      {}
    } else {
      stryCov_9fa48("107584");
      return Array.from(this.pendingRequests.keys());
    }
  }

  /**
   * Clear all pending requests (for shutdown).
   * Rejects all pending promises with a shutdown error.
   */
  clear() {
    if (stryMutAct_9fa48("107585")) {
      {}
    } else {
      stryCov_9fa48("107585");
      const count = this.pendingRequests.size;
      for (const [_requestId, pending] of this.pendingRequests) {
        if (stryMutAct_9fa48("107586")) {
          {}
        } else {
          stryCov_9fa48("107586");
          clearTimeout(pending.timeoutId);
          this.recordWaitTime(stryMutAct_9fa48("107587") ? Date.now() + pending.startedAt : (stryCov_9fa48("107587"), Date.now() - pending.startedAt));
          pending.reject(new Error(PENDING_REQUEST_LOG_MSG.TRACKER_SHUTDOWN));
        }
      }
      stryMutAct_9fa48("107588") ? this.stats.rejectedTotal -= count : (stryCov_9fa48("107588"), this.stats.rejectedTotal += count);
      this.pendingRequests.clear();
      if (stryMutAct_9fa48("107590") ? false : stryMutAct_9fa48("107589") ? true : (stryCov_9fa48("107589", "107590"), this.cleanupTimer)) {
        if (stryMutAct_9fa48("107591")) {
          {}
        } else {
          stryCov_9fa48("107591");
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
      }
      if (stryMutAct_9fa48("107595") ? count <= NUM.ZERO : stryMutAct_9fa48("107594") ? count >= NUM.ZERO : stryMutAct_9fa48("107593") ? false : stryMutAct_9fa48("107592") ? true : (stryCov_9fa48("107592", "107593", "107594", "107595"), count > NUM.ZERO)) {
        if (stryMutAct_9fa48("107596")) {
          {}
        } else {
          stryCov_9fa48("107596");
          this.logger.info(PENDING_REQUEST_LOG_MSG.CLEARED_PENDING_REQUESTS, stryMutAct_9fa48("107597") ? {} : (stryCov_9fa48("107597"), {
            count
          }));
        }
      }
    }
  }

  /**
   * Start periodic cleanup of stale entries.
   * This is a safety mechanism - normally requests are cleaned up via resolve/reject/timeout.
   */
  startPeriodicCleanup() {
    if (stryMutAct_9fa48("107598")) {
      {}
    } else {
      stryCov_9fa48("107598");
      if (stryMutAct_9fa48("107600") ? false : stryMutAct_9fa48("107599") ? true : (stryCov_9fa48("107599", "107600"), this.cleanupTimer)) {
        if (stryMutAct_9fa48("107601")) {
          {}
        } else {
          stryCov_9fa48("107601");
          return;
        }
      }
      this.cleanupTimer = setInterval(() => {
        if (stryMutAct_9fa48("107602")) {
          {}
        } else {
          stryCov_9fa48("107602");
          this.cleanupStaleRequests();
        }
      }, this.cleanupIntervalMs);

      // Ensure timer doesn't prevent process exit
      if (stryMutAct_9fa48("107604") ? false : stryMutAct_9fa48("107603") ? true : (stryCov_9fa48("107603", "107604"), this.cleanupTimer.unref)) {
        if (stryMutAct_9fa48("107605")) {
          {}
        } else {
          stryCov_9fa48("107605");
          this.cleanupTimer.unref();
        }
      }
    }
  }

  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup() {
    if (stryMutAct_9fa48("107606")) {
      {}
    } else {
      stryCov_9fa48("107606");
      if (stryMutAct_9fa48("107608") ? false : stryMutAct_9fa48("107607") ? true : (stryCov_9fa48("107607", "107608"), this.cleanupTimer)) {
        if (stryMutAct_9fa48("107609")) {
          {}
        } else {
          stryCov_9fa48("107609");
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
      }
    }
  }

  /**
   * Clean up stale requests that have exceeded their timeout.
   * This is a safety mechanism for requests where the timeout callback failed.
   * @return {number} Number of stale requests cleaned up.
   */
  cleanupStaleRequests() {
    if (stryMutAct_9fa48("107610")) {
      {}
    } else {
      stryCov_9fa48("107610");
      const now = Date.now();
      let cleanedCount = NUM.ZERO;
      for (const [requestId, pending] of this.pendingRequests) {
        if (stryMutAct_9fa48("107611")) {
          {}
        } else {
          stryCov_9fa48("107611");
          const timeoutMs = stryMutAct_9fa48("107614") ? pending.metadata?.timeoutMs && this.defaultTimeoutMs : stryMutAct_9fa48("107613") ? false : stryMutAct_9fa48("107612") ? true : (stryCov_9fa48("107612", "107613", "107614"), (stryMutAct_9fa48("107615") ? pending.metadata.timeoutMs : (stryCov_9fa48("107615"), pending.metadata?.timeoutMs)) || this.defaultTimeoutMs);
          const elapsed = stryMutAct_9fa48("107616") ? now + pending.startedAt : (stryCov_9fa48("107616"), now - pending.startedAt);

          // Add buffer to timeout to avoid race conditions
          if (stryMutAct_9fa48("107620") ? elapsed <= timeoutMs + PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS : stryMutAct_9fa48("107619") ? elapsed >= timeoutMs + PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS : stryMutAct_9fa48("107618") ? false : stryMutAct_9fa48("107617") ? true : (stryCov_9fa48("107617", "107618", "107619", "107620"), elapsed > (stryMutAct_9fa48("107621") ? timeoutMs - PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS : (stryCov_9fa48("107621"), timeoutMs + PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS)))) {
            if (stryMutAct_9fa48("107622")) {
              {}
            } else {
              stryCov_9fa48("107622");
              clearTimeout(pending.timeoutId);
              this.pendingRequests.delete(requestId);
              this.recordWaitTime(elapsed);
              pending.reject(new Error(PENDING_REQUEST_ERROR_MSG.staleRequest(elapsed)));
              stryMutAct_9fa48("107623") ? cleanedCount -= NUM.ONE : (stryCov_9fa48("107623"), cleanedCount += NUM.ONE);
              stryMutAct_9fa48("107624") ? this.stats.staleCleanedTotal -= NUM.ONE : (stryCov_9fa48("107624"), this.stats.staleCleanedTotal += NUM.ONE);
              stryMutAct_9fa48("107625") ? this.stats.rejectedTotal -= NUM.ONE : (stryCov_9fa48("107625"), this.stats.rejectedTotal += NUM.ONE);
              this.logger.warn(PENDING_REQUEST_LOG_MSG.CLEANED_STALE_REQUEST, stryMutAct_9fa48("107626") ? {} : (stryCov_9fa48("107626"), {
                requestId,
                elapsed,
                timeoutMs
              }));
            }
          }
        }
      }
      return cleanedCount;
    }
  }
}
export { PendingRequestTracker };