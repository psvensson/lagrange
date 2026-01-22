/**
 * RPCClient - Request-response pattern over message groups.
 *
 * Provides an RPC abstraction that uses message groups as transport,
 * handling correlation IDs and timeouts internally.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';

/**
 * RPCClient provides request-response semantics over message groups.
 * Handles correlation IDs and timeouts internally.
 */
class RPCClient extends EventEmitter {
  /**
   * Create a new RPCClient.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageGroupService - Message group service for transport.
   * @param {number} [options.defaultTimeoutMs=30000] - Default timeout in milliseconds.
   */
  constructor(options = {}) {
    super();

    this.messageGroupService = options.messageGroupService || null;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000;

    // Pending requests: correlationId -> {resolve, reject, timeout, sentAt}
    this.pendingRequests = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('rpc-client') : console;

    // Statistics
    this.stats = {
      requestsSent: 0,
      responsesReceived: 0,
      timeouts: 0,
      errors: 0,
    };
  }

  /**
   * Set the message group service for transport.
   * @param {Object} messageGroupService - Message group service instance.
   */
  setMessageGroupService(messageGroupService) {
    this.messageGroupService = messageGroupService;
  }

  /**
   * Make an RPC call to a target service.
   * @param {string} target - Target service address.
   * @param {Object} request - Request payload.
   * @param {Object} [options={}] - Options including timeout.
   * @param {number} [options.timeout] - Timeout in milliseconds.
   * @return {Promise<Object>} Response from target.
   */
  async call(target, request, options = {}) {
    if (!this.messageGroupService) {
      throw new Error('RPCClient: No message group service configured');
    }

    const correlationId = uuidv4();
    const timeoutMs = options.timeout || this.defaultTimeoutMs;

    this.logger.debug('RPC call initiated', {
      correlationId,
      target,
      timeoutMs,
    });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        const pending = this.pendingRequests.get(correlationId);
        if (pending) {
          this.pendingRequests.delete(correlationId);
          this.stats.timeouts++;

          this.logger.debug('RPC timeout', {
            correlationId,
            target,
            timeoutMs,
          });

          this.emit('timeout', {correlationId, target, timeoutMs});
          reject(new Error(`RPC timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Track pending request
      this.pendingRequests.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        sentAt: Date.now(),
        target,
      });

      this.stats.requestsSent++;

      // Send via message group
      this.messageGroupService.sendMessage(target, {
        correlationId,
        ...request,
      }).then((result) => {
        // Check if request was already handled (timeout or response)
        if (!this.pendingRequests.has(correlationId)) {
          return;
        }

        // If the message group returns a direct response, handle it
        // ACK structure is flat - correlationId is directly on result
        if (result && result.correlationId === correlationId) {
          this.handleResponse(correlationId, result);
        }
      }).catch((error) => {
        // Check if request was already handled
        const pending = this.pendingRequests.get(correlationId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(correlationId);
          this.stats.errors++;

          this.logger.error('RPC send failed', {
            correlationId,
            target,
            error: error.message,
          });

          reject(error);
        }
      });
    });
  }

  /**
   * Handle response from target (called by message handler).
   * @param {string} correlationId - Correlation ID from the response.
   * @param {Object} response - Response payload.
   * @return {boolean} True if response was matched to a pending request.
   */
  handleResponse(correlationId, response) {
    const pending = this.pendingRequests.get(correlationId);

    if (!pending) {
      this.logger.debug('No pending request for correlation ID', {
        correlationId,
      });
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(correlationId);
    this.stats.responsesReceived++;

    const latencyMs = Date.now() - pending.sentAt;

    this.logger.debug('RPC response received', {
      correlationId,
      latencyMs,
    });

    this.emit('response', {correlationId, latencyMs, response});
    pending.resolve(response);

    return true;
  }

  /**
   * Get the number of pending requests.
   * @return {number} Number of pending requests.
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }

  /**
   * Check if there is a pending request for a correlation ID.
   * @param {string} correlationId - Correlation ID to check.
   * @return {boolean} True if there is a pending request.
   */
  hasPendingRequest(correlationId) {
    return this.pendingRequests.has(correlationId);
  }

  /**
   * Get statistics about RPC calls.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Cancel a pending request.
   * @param {string} correlationId - Correlation ID of request to cancel.
   * @param {string} [reason='Cancelled'] - Reason for cancellation.
   * @return {boolean} True if request was cancelled.
   */
  cancelRequest(correlationId, reason = 'Cancelled') {
    const pending = this.pendingRequests.get(correlationId);

    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(correlationId);

    this.logger.debug('RPC request cancelled', {
      correlationId,
      reason,
    });

    pending.reject(new Error(`RPC cancelled: ${reason}`));
    return true;
  }

  /**
   * Shutdown the RPC client, cancelling all pending requests.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug('Shutting down RPC client', {
      pendingRequests: this.pendingRequests.size,
    });

    // Cancel all pending requests
    for (const [_correlationId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('RPC client shutdown'));
    }

    this.pendingRequests.clear();
    this.emit('shutdown');
  }
}

export {RPCClient};
