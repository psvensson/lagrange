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
   */
  constructor(options = {}) {
    this.pendingRequests = new Map();
    this.defaultTimeoutMs = options.defaultTimeoutMs ||
      PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ||
      PENDING_REQUEST_DEFAULT.CLEANUP_INTERVAL_MS;
    this.cleanupTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.PENDING_REQUEST_TRACKER) : console;
  }

  /**
   * Track a pending request.
   * @param {string} requestId - Unique request ID.
   * @param {Object} metadata - Request metadata (type, targetNode, etc.).
   * @return {Promise<Object>} Promise that resolves with ACK or rejects on timeout.
   */
  track(requestId, metadata = {}) {
    return new Promise((resolve, reject) => {
      const timeoutMs = metadata.timeoutMs || this.defaultTimeoutMs;

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.logger.warn(PENDING_REQUEST_LOG_MSG.REQUEST_TIMED_OUT, {
          requestId,
          timeoutMs,
          type: metadata.type,
        });
        reject(new Error(PENDING_REQUEST_ERROR_MSG.ACK_TIMEOUT(timeoutMs, requestId)));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        metadata,
        startedAt: Date.now(),
      });

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

      this.logger.debug(PENDING_REQUEST_LOG_MSG.REQUEST_RESOLVED, {
        requestId,
        durationMs: Date.now() - pending.startedAt,
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
      pending.reject(new Error(PENDING_REQUEST_LOG_MSG.TRACKER_SHUTDOWN));
    }

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
        pending.reject(new Error(PENDING_REQUEST_ERROR_MSG.STALE_REQUEST(elapsed)));
        cleanedCount += NUM.ONE;

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
