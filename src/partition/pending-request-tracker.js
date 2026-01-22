/**
 * PendingRequestTracker - Map-based request tracking with timeout management.
 * Replaces EventEmitter-based ACK handling to prevent memory leaks.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import {LoggingService} from '../logging/logging-service.js';

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
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000;
    this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;
    this.cleanupTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('pending-request-tracker') : console;
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
        this.logger.warn('Request timed out', {
          requestId,
          timeoutMs,
          type: metadata.type,
        });
        reject(new Error(`ACK timeout after ${timeoutMs}ms for request ${requestId}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        metadata,
        startedAt: Date.now(),
      });

      this.logger.debug('Tracking request', {
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

      this.logger.debug('Request resolved', {
        requestId,
        durationMs: Date.now() - pending.startedAt,
      });

      return true;
    }

    this.logger.debug('No pending request found for resolution', {requestId});
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

      this.logger.debug('Request rejected', {
        requestId,
        error: errorObj.message,
      });

      return true;
    }

    this.logger.debug('No pending request found for rejection', {requestId});
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
      pending.reject(new Error('Tracker shutdown'));
    }

    this.pendingRequests.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (count > 0) {
      this.logger.info('Cleared pending requests on shutdown', {count});
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
    let cleanedCount = 0;

    for (const [requestId, pending] of this.pendingRequests) {
      const timeoutMs = pending.metadata?.timeoutMs || this.defaultTimeoutMs;
      const elapsed = now - pending.startedAt;

      // Add buffer to timeout to avoid race conditions
      if (elapsed > timeoutMs + 5000) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        pending.reject(new Error(`Stale request cleanup after ${elapsed}ms`));
        cleanedCount++;

        this.logger.warn('Cleaned up stale request', {
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
