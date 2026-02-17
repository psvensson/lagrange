/**
 * PendingRequestTracker - Map-based request tracking with timeout management.
 * Replaces EventEmitter-based ACK handling to prevent memory leaks.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM} from '../constants/index.js';
import {
  PARTITION_SUBSYSTEM,
  PENDING_REQUEST_DEFAULT,
  PENDING_REQUEST_ERROR_MSG,
  PENDING_REQUEST_LOG_MSG,
} from './partition-constants.js';

const WAIT_TIME_BUCKETS = Object.freeze([
  {upperBoundMs: 10, label: 'le_10ms'},
  {upperBoundMs: 50, label: 'le_50ms'},
  {upperBoundMs: 100, label: 'le_100ms'},
  {upperBoundMs: 250, label: 'le_250ms'},
  {upperBoundMs: 500, label: 'le_500ms'},
  {upperBoundMs: 1000, label: 'le_1000ms'},
  {upperBoundMs: 5000, label: 'le_5000ms'},
]);
const WAIT_TIME_BUCKET_OVERFLOW = 'gt_5000ms';

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
    this.pendingRequests = new Map();
    this.defaultTimeoutMs = options.defaultTimeoutMs ||
      PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ||
      PENDING_REQUEST_DEFAULT.CLEANUP_INTERVAL_MS;
    this.maxPendingRequests = Number.isFinite(options.maxPendingRequests) &&
      options.maxPendingRequests > NUM.ZERO ?
      Math.floor(options.maxPendingRequests) :
      PENDING_REQUEST_DEFAULT.MAX_PENDING_REQUESTS;
    this.cleanupTimer = null;
    this.stats = this.createStatsState();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.PENDING_REQUEST_TRACKER) : console;
  }

  /**
   * Create baseline tracker statistics state.
   * @return {Object}
   * @private
   */
  createStatsState() {
    return {
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
      waitTimeHistogram: this.createWaitTimeHistogram(),
    };
  }

  /**
   * Create a fresh wait-time histogram bucket map.
   * @return {Object}
   * @private
   */
  createWaitTimeHistogram() {
    const histogram = {};
    for (const bucket of WAIT_TIME_BUCKETS) {
      histogram[bucket.label] = NUM.ZERO;
    }
    histogram[WAIT_TIME_BUCKET_OVERFLOW] = NUM.ZERO;
    return histogram;
  }

  /**
   * Resolve histogram bucket label for a wait duration.
   * @param {number} durationMs
   * @return {string}
   * @private
   */
  resolveWaitTimeBucket(durationMs) {
    const normalized = Number.isFinite(durationMs) ?
      Math.max(NUM.ZERO, Math.floor(durationMs)) :
      NUM.ZERO;
    for (const bucket of WAIT_TIME_BUCKETS) {
      if (normalized <= bucket.upperBoundMs) {
        return bucket.label;
      }
    }
    return WAIT_TIME_BUCKET_OVERFLOW;
  }

  /**
   * Record a wait-time observation in aggregate stats.
   * @param {number} durationMs
   * @private
   */
  recordWaitTime(durationMs) {
    const normalized = Number.isFinite(durationMs) ?
      Math.max(NUM.ZERO, Math.floor(durationMs)) :
      NUM.ZERO;
    this.stats.waitTimeSampleCount += NUM.ONE;
    this.stats.waitTimeTotalMs += normalized;
    this.stats.waitTimeMaxMs = Math.max(
      this.stats.waitTimeMaxMs,
      normalized,
    );
    const bucket = this.resolveWaitTimeBucket(normalized);
    this.stats.waitTimeHistogram[bucket] =
      (this.stats.waitTimeHistogram[bucket] || NUM.ZERO) + NUM.ONE;
  }

  /**
   * Update max pending watermark using current queue size.
   * @private
   */
  updateMaxPendingObserved() {
    this.stats.maxPendingObserved = Math.max(
      this.stats.maxPendingObserved,
      this.pendingRequests.size,
    );
  }

  /**
   * Track a pending request.
   * @param {string} requestId - Unique request ID.
   * @param {Object} metadata - Request metadata (type, targetNode, etc.).
   * @return {Promise<Object>} Promise that resolves with ACK or rejects on timeout.
   */
  track(requestId, metadata = {}) {
    if (this.pendingRequests.size >= this.maxPendingRequests) {
      this.stats.backpressureRejectTotal += NUM.ONE;
      this.logger.warn(PENDING_REQUEST_LOG_MSG.BACKPRESSURE_APPLIED, {
        requestId,
        type: metadata.type,
        pendingCount: this.pendingRequests.size,
        maxPendingRequests: this.maxPendingRequests,
      });
      throw new Error(
        PENDING_REQUEST_ERROR_MSG.backpressure(this.maxPendingRequests),
      );
    }

    return new Promise((resolve, reject) => {
      const timeoutMs = metadata.timeoutMs || this.defaultTimeoutMs;
      const startedAt = Date.now();

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.recordWaitTime(Date.now() - startedAt);
        this.stats.timedOutTotal += NUM.ONE;
        this.stats.rejectedTotal += NUM.ONE;
        this.logger.warn(PENDING_REQUEST_LOG_MSG.REQUEST_TIMED_OUT, {
          requestId,
          timeoutMs,
          type: metadata.type,
        });
        reject(new Error(PENDING_REQUEST_ERROR_MSG.ackTimeout(timeoutMs, requestId)));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        metadata,
        startedAt,
      });
      this.stats.trackedTotal += NUM.ONE;
      this.updateMaxPendingObserved();

      this.logger.debug(PENDING_REQUEST_LOG_MSG.TRACKING_REQUEST, {
        requestId,
        type: metadata.type,
        targetAddress: metadata.targetAddress,
      });
    });
  }

  /**
   * Resolve a pending request with an ACK.
   * @param {string} requestId - Request ID from ACK.
   * @param {Object} ack - ACK response.
   * @return {boolean} True if request was found and resolved.
   */
  resolve(requestId, ack) {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(requestId);
      pending.resolve(ack);
      const durationMs = Date.now() - pending.startedAt;
      this.recordWaitTime(durationMs);
      this.stats.resolvedTotal += NUM.ONE;

      this.logger.debug(PENDING_REQUEST_LOG_MSG.REQUEST_RESOLVED, {
        requestId,
        durationMs,
      });

      return true;
    }

    this.logger.debug(PENDING_REQUEST_LOG_MSG.NO_PENDING_REQUEST_RESOLVE, {requestId});
    return false;
  }

  /**
   * Reject a pending request with an error.
   * @param {string} requestId - Request ID.
   * @param {Error|string} error - Error to reject with.
   * @return {boolean} True if request was found and rejected.
   */
  reject(requestId, error) {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(requestId);

      const errorObj = error instanceof Error ? error : new Error(error);
      pending.reject(errorObj);
      this.recordWaitTime(Date.now() - pending.startedAt);
      this.stats.rejectedTotal += NUM.ONE;

      this.logger.debug(PENDING_REQUEST_LOG_MSG.REQUEST_REJECTED, {
        requestId,
        error: errorObj.message,
      });

      return true;
    }

    this.logger.debug(PENDING_REQUEST_LOG_MSG.NO_PENDING_REQUEST_REJECT, {requestId});
    return false;
  }

  /**
   * Check if a request is pending.
   * @param {string} requestId - Request ID to check.
   * @return {boolean} True if request is pending.
   */
  hasPending(requestId) {
    return this.pendingRequests.has(requestId);
  }

  /**
   * Get count of pending requests.
   * @return {number} Number of pending requests.
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }

  /**
   * Get bounded queue and lifecycle statistics.
   * @return {Object}
   */
  getStats() {
    const pendingCount = this.pendingRequests.size;
    const saturationPercent = this.maxPendingRequests > NUM.ZERO ?
      Math.round((pendingCount / this.maxPendingRequests) * NUM.HUNDRED) :
      NUM.ZERO;
    const waitTimeSampleCount = this.stats.waitTimeSampleCount;
    const waitTimeAvgMs = waitTimeSampleCount > NUM.ZERO ?
      Math.round(this.stats.waitTimeTotalMs / waitTimeSampleCount) :
      NUM.ZERO;
    return {
      pendingCount,
      maxPendingRequests: this.maxPendingRequests,
      availableCapacity: Math.max(
        NUM.ZERO,
        this.maxPendingRequests - pendingCount,
      ),
      saturationPercent,
      trackedTotal: this.stats.trackedTotal,
      resolvedTotal: this.stats.resolvedTotal,
      rejectedTotal: this.stats.rejectedTotal,
      timedOutTotal: this.stats.timedOutTotal,
      staleCleanedTotal: this.stats.staleCleanedTotal,
      backpressureRejectTotal: this.stats.backpressureRejectTotal,
      maxPendingObserved: this.stats.maxPendingObserved,
      waitTime: {
        sampleCount: waitTimeSampleCount,
        avgMs: waitTimeAvgMs,
        maxMs: this.stats.waitTimeMaxMs,
        histogram: {...this.stats.waitTimeHistogram},
      },
    };
  }

  /**
   * Get metadata for a pending request.
   * @param {string} requestId - Request ID.
   * @return {Object|null} Request metadata or null if not found.
   */
  getMetadata(requestId) {
    const pending = this.pendingRequests.get(requestId);
    return pending ? pending.metadata : null;
  }

  /**
   * Get all pending request IDs.
   * @return {Array<string>} Array of pending request IDs.
   */
  getPendingIds() {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Clear all pending requests (for shutdown).
   * Rejects all pending promises with a shutdown error.
   */
  clear() {
    const count = this.pendingRequests.size;

    for (const [_requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      this.recordWaitTime(Date.now() - pending.startedAt);
      pending.reject(new Error(PENDING_REQUEST_LOG_MSG.TRACKER_SHUTDOWN));
    }
    this.stats.rejectedTotal += count;

    this.pendingRequests.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (count > NUM.ZERO) {
      this.logger.info(PENDING_REQUEST_LOG_MSG.CLEARED_PENDING_REQUESTS, {count});
    }
  }

  /**
   * Start periodic cleanup of stale entries.
   * This is a safety mechanism - normally requests are cleaned up via resolve/reject/timeout.
   */
  startPeriodicCleanup() {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleRequests();
    }, this.cleanupIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up stale requests that have exceeded their timeout.
   * This is a safety mechanism for requests where the timeout callback failed.
   * @return {number} Number of stale requests cleaned up.
   */
  cleanupStaleRequests() {
    const now = Date.now();
    let cleanedCount = NUM.ZERO;

    for (const [requestId, pending] of this.pendingRequests) {
      const timeoutMs = pending.metadata?.timeoutMs || this.defaultTimeoutMs;
      const elapsed = now - pending.startedAt;

      // Add buffer to timeout to avoid race conditions
      if (elapsed > timeoutMs + PENDING_REQUEST_DEFAULT.STALE_REQUEST_BUFFER_MS) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        this.recordWaitTime(elapsed);
        pending.reject(new Error(PENDING_REQUEST_ERROR_MSG.staleRequest(elapsed)));
        cleanedCount += NUM.ONE;
        this.stats.staleCleanedTotal += NUM.ONE;
        this.stats.rejectedTotal += NUM.ONE;

        this.logger.warn(PENDING_REQUEST_LOG_MSG.CLEANED_STALE_REQUEST, {
          requestId,
          elapsed,
          timeoutMs,
        });
      }
    }

    return cleanedCount;
  }
}

export {PendingRequestTracker};
