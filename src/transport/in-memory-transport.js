/**
 * InMemoryTransport - Local message passing for single-node bootstrap.
 * Supports Raft consensus messages between local replicas.
 * Requirements: 4.1
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Transport message types.
 */
const TransportMessageType = {
  RAFT_APPEND_ENTRIES: 'raft_append_entries',
  RAFT_APPEND_ENTRIES_RESPONSE: 'raft_append_entries_response',
  RAFT_REQUEST_VOTE: 'raft_request_vote',
  RAFT_REQUEST_VOTE_RESPONSE: 'raft_request_vote_response',
  MESSAGE_DELIVERY: 'message_delivery',
  MESSAGE_ACK: 'message_ack',
};

/**
 * InMemoryTransport provides local message passing for single-node scenarios.
 * Used during bootstrap when all replicas are on the same node.
 */
class InMemoryTransport extends EventEmitter {
  /**
   * Create a new InMemoryTransport.
   * @param {Object} options - Configuration options.
   * @param {string} options.localAddress - Local service address.
   */
  constructor(options = {}) {
    super();

    this.localAddress = options.localAddress || `local-${uuidv4()}`;
    this.transportId = uuidv4();

    // Registry of local services (address -> handler)
    this.localServices = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();

    // Message delivery callbacks
    this.deliveryCallbacks = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.deliveryTimeoutMs = config.get('transport.deliveryTimeoutMs') || 5000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('in-memory-transport') : console;

    // State
    this.initialized = false;
    this.messageCount = 0;
  }

  /**
   * Initialize the transport.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.debug('Initializing InMemoryTransport', {
      transportId: this.transportId,
      localAddress: this.localAddress,
    });

    this.initialized = true;

    this.emit('initialized', {
      transportId: this.transportId,
      localAddress: this.localAddress,
    });
  }

  /**
   * Register a local service to receive messages.
   * @param {string} address - Service address.
   * @param {Function} handler - Message handler function.
   */
  register(address, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.localServices.set(address, handler);

    this.logger.debug('Registered local service', {
      address,
      transportId: this.transportId,
      totalServices: this.localServices.size,
    });
  }

  /**
   * Unregister a local service.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.localServices.delete(address);

    this.logger.debug('Unregistered local service', {
      address,
      transportId: this.transportId,
      totalServices: this.localServices.size,
    });
  }

  /**
   * Deliver a message to a target service.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message) {
    if (!this.initialized) {
      await this.initialize();
    }

    const messageId = message.messageId || uuidv4();
    this.messageCount++;

    this.logger.debug('Delivering message', {
      messageId,
      targetAddress,
      sourceAddress: this.localAddress,
      messageType: message.type,
    });

    // Check if target is registered locally
    const handler = this.localServices.get(targetAddress);

    if (!handler) {
      this.logger.debug('Target service not found locally', {
        messageId,
        targetAddress,
        registeredServices: Array.from(this.localServices.keys()),
      });

      return {
        messageId,
        acknowledged: false,
        error: 'Target service not found',
      };
    }

    // Create delivery envelope
    const envelope = {
      messageId,
      sourceAddress: this.localAddress,
      targetAddress,
      payload: message,
      timestamp: Date.now(),
    };

    try {
      // Deliver synchronously (in-memory)
      const result = await Promise.race([
        this.deliverToHandler(handler, envelope),
        this.createTimeout(messageId),
      ]);

      return {
        messageId,
        acknowledged: result.acknowledged !== false,
        result: result,
      };
    } catch (error) {
      this.logger.error('Message delivery failed', {
        messageId,
        targetAddress,
        error: error.message,
      });

      return {
        messageId,
        acknowledged: false,
        error: error.message,
      };
    }
  }

  /**
   * Deliver message to handler.
   * @param {Function} handler - Message handler.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Handler result.
   * @private
   */
  async deliverToHandler(handler, envelope) {
    try {
      const result = await handler(envelope);
      return result || {acknowledged: true};
    } catch (error) {
      this.logger.error('Handler threw error', {
        messageId: envelope.messageId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a delivery timeout promise.
   * @param {string} messageId - Message ID.
   * @return {Promise<never>} Timeout promise.
   * @private
   */
  createTimeout(messageId) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Delivery timeout for message ${messageId}`));
      }, this.deliveryTimeoutMs);
    });
  }

  /**
   * Send a Raft AppendEntries RPC.
   * @param {string} targetAddress - Target replica address.
   * @param {Object} appendEntries - AppendEntries data.
   * @return {Promise<Object>} Response.
   */
  async sendAppendEntries(targetAddress, appendEntries) {
    return this.deliver(targetAddress, {
      type: TransportMessageType.RAFT_APPEND_ENTRIES,
      ...appendEntries,
    });
  }

  /**
   * Send a Raft RequestVote RPC.
   * @param {string} targetAddress - Target replica address.
   * @param {Object} requestVote - RequestVote data.
   * @return {Promise<Object>} Response.
   */
  async sendRequestVote(targetAddress, requestVote) {
    return this.deliver(targetAddress, {
      type: TransportMessageType.RAFT_REQUEST_VOTE,
      ...requestVote,
    });
  }

  /**
   * Broadcast a message to all registered services except self.
   * @param {Object} message - Message to broadcast.
   * @return {Promise<Array<Object>>} Array of delivery results.
   */
  async broadcast(message) {
    const results = [];

    for (const [address] of this.localServices) {
      if (address !== this.localAddress) {
        const result = await this.deliver(address, message);
        results.push({address, ...result});
      }
    }

    return results;
  }

  /**
   * Get the number of registered services.
   * @return {number} Service count.
   */
  getServiceCount() {
    return this.localServices.size;
  }

  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    return Array.from(this.localServices.keys());
  }

  /**
   * Get transport statistics.
   * @return {Object} Transport stats.
   */
  getStats() {
    return {
      transportId: this.transportId,
      localAddress: this.localAddress,
      initialized: this.initialized,
      registeredServices: this.localServices.size,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
    };
  }

  /**
   * Check if a service is registered.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    return this.localServices.has(address);
  }

  /**
   * Shutdown the transport.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug('Shutting down InMemoryTransport', {
      transportId: this.transportId,
    });

    // Clear all registrations
    this.localServices.clear();
    this.pendingMessages.clear();
    this.deliveryCallbacks.clear();

    this.initialized = false;

    this.emit('shutdown', {transportId: this.transportId});
  }
}

export {
  InMemoryTransport,
  TransportMessageType,
};
