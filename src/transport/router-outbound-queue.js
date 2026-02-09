/**
 * RouterOutboundQueue - Outbound message queue management for MessageRouter.
 *
 * Handles per-node outbound delivery queues with configurable concurrency limits.
 * Provides queue management for message delivery to remote nodes.
 *
 * Requirements: 1.2, 1.8
 *
 * @module transport/router-outbound-queue
 */

import {
  ROUTER_ERROR_MSG,
  TRANSPORT_DEFAULT,
  TRANSPORT_NUM,
} from '../constants/transport.js';

/**
 * RouterOutboundQueue manages per-node outbound delivery queues.
 *
 * This class manages:
 * - Per-node queue creation and tracking
 * - Concurrency limits for outbound deliveries
 * - Queue processing with in-flight tracking
 * - Graceful and immediate queue failure handling
 *
 * @interface
 *
 * @description
 * RouterOutboundQueue is responsible for managing outbound message delivery
 * queues in the MessageRouter. Each node has its own queue with configurable
 * concurrency limits to prevent overwhelming remote nodes.
 *
 * Key features:
 * - Per-node queue isolation
 * - Configurable max concurrent deliveries per node
 * - In-flight delivery tracking
 * - Graceful shutdown support (no unhandled rejections)
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {number} [options.maxConcurrent] - Max concurrent deliveries per node
 * @param {Object} [options.logger] - Logger instance
 *
 * @method getOutboundQueue
 * @description Get or create outbound queue for a node.
 * @param {string} nodeId - Target node ID
 * @return {Object} Queue state object
 *
 * @method isOutboundQueueAvailable
 * @description Check if the outbound queue has immediate capacity for a node.
 * @param {string} nodeId - Target node ID
 * @return {boolean} True if capacity is available
 *
 * @method enqueueOutbound
 * @description Enqueue a delivery for a node with per-node concurrency limits.
 * @param {string} nodeId - Target node ID
 * @param {Function} deliverFn - Function that returns a Promise result
 * @return {Promise<Object>} Delivery result
 *
 * @method processOutboundQueue
 * @description Process queued outbound deliveries for a node.
 * @param {string} nodeId - Target node ID
 * @return {void}
 *
 * @method failOutboundQueue
 * @description Fail queued outbound deliveries for a node.
 * @param {string} nodeId - Target node ID
 * @param {Error} error - Error to reject with
 * @return {void}
 *
 * @method failOutboundQueueGracefully
 * @description Gracefully fail queued outbound deliveries (no rejection).
 * @param {string} nodeId - Target node ID
 * @param {Error} error - Error to return as a failed delivery
 * @return {void}
 *
 * @method clear
 * @description Clear all outbound queues.
 * @return {void}
 *
 * @method getStats
 * @description Get statistics for all outbound queues.
 * @return {Object} Queue statistics
 *
 * @example
 * const outboundQueue = new RouterOutboundQueue({
 *   maxConcurrent: 2,
 *   logger: loggingService.forSubsystem('message-router'),
 * });
 *
 * // Enqueue a delivery
 * const result = await outboundQueue.enqueueOutbound('node-2', async () => {
 *   return await sendMessage(message);
 * });
 *
 * // Check capacity
 * if (outboundQueue.isOutboundQueueAvailable('node-2')) {
 *   // Queue has capacity
 * }
 *
 * // Fail queue on disconnect
 * outboundQueue.failOutboundQueue('node-2', new Error('Connection lost'));
 */
class RouterOutboundQueue {
  /**
   * Create a new RouterOutboundQueue instance.
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.maxConcurrent] - Max concurrent deliveries per node.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    const configuredMaxConcurrent = options.maxConcurrent;
    this.maxConcurrent =
      Number.isFinite(configuredMaxConcurrent) &&
      configuredMaxConcurrent > TRANSPORT_NUM.ZERO ?
        Math.floor(configuredMaxConcurrent) :
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY;

    this.logger = options.logger || console;

    // Per-node outbound delivery queues
    this.outboundQueues = new Map();
  }

  /**
   * Get or create outbound queue for a node.
   * @param {string} nodeId - Target node ID.
   * @return {Object} Queue state.
   */
  getOutboundQueue(nodeId) {
    if (!this.outboundQueues.has(nodeId)) {
      this.outboundQueues.set(nodeId, {
        nodeId,
        inFlight: TRANSPORT_NUM.ZERO,
        pending: [],
        maxConcurrent: this.maxConcurrent,
      });
    }
    return this.outboundQueues.get(nodeId);
  }

  /**
   * Check if the outbound queue has immediate capacity for a node.
   * @param {string} nodeId - Target node ID.
   * @return {boolean} True if capacity is available.
   */
  isOutboundQueueAvailable(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    return queue.inFlight < queue.maxConcurrent;
  }

  /**
   * Enqueue a delivery for a node with per-node concurrency limits.
   * @param {string} nodeId - Target node ID.
   * @param {Function} deliverFn - Function that returns a Promise result.
   * @return {Promise<Object>} Delivery result.
   */
  enqueueOutbound(nodeId, deliverFn) {
    const queue = this.getOutboundQueue(nodeId);

    return new Promise((resolve, reject) => {
      queue.pending.push({deliverFn, resolve, reject});
      this.processOutboundQueue(nodeId);
    });
  }

  /**
   * Process queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   */
  processOutboundQueue(nodeId) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.inFlight < queue.maxConcurrent &&
      queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      queue.inFlight += TRANSPORT_NUM.ONE;

      Promise.resolve()
        .then(() => item.deliverFn())
        .then((result) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.resolve(result);
          this.processOutboundQueue(nodeId);
        })
        .catch((error) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          item.reject(error);
          this.processOutboundQueue(nodeId);
        });
    }
  }

  /**
   * Fail queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   */
  failOutboundQueue(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      item.reject(error);
    }
  }

  /**
   * Gracefully fail queued outbound deliveries (no rejection).
   * Used during shutdown to avoid unhandled rejections from fire-and-forget tasks.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to return as a failed delivery.
   */
  failOutboundQueueGracefully(nodeId, error) {
    const queue = this.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }

    const errorMessage = error?.message || ROUTER_ERROR_MSG.SHUTDOWN;
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      item.resolve({
        acknowledged: false,
        error: errorMessage,
        shutdown: true,
      });
    }
  }

  /**
   * Clear all outbound queues.
   */
  clear() {
    this.outboundQueues.clear();
  }

  /**
   * Get statistics for all outbound queues.
   * @return {Object} Queue statistics with count and per-node details.
   */
  getStats() {
    const stats = {
      queueCount: this.outboundQueues.size,
      queues: {},
    };

    for (const [nodeId, queue] of this.outboundQueues) {
      stats.queues[nodeId] = {
        inFlight: queue.inFlight,
        pending: queue.pending.length,
        maxConcurrent: queue.maxConcurrent,
      };
    }

    return stats;
  }

  /**
   * Get all node IDs with active queues.
   * @return {Array<string>} Node IDs with queues.
   */
  getQueuedNodeIds() {
    return Array.from(this.outboundQueues.keys());
  }
}

export {
  RouterOutboundQueue,
};
