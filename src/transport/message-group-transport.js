/**
 * MessageGroupTransport - Routes all messages through message groups.
 * Provides location transparency for partition replicas.
 * Requirements: 4.6, 4.9, 4.10, 4.13, 4.14
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Message types for MessageGroupTransport.
 */
const MGTransportMessageType = {
  RAFT_APPEND_ENTRIES: 'mg_raft_append_entries',
  RAFT_APPEND_ENTRIES_RESPONSE: 'mg_raft_append_entries_response',
  RAFT_REQUEST_VOTE: 'mg_raft_request_vote',
  RAFT_REQUEST_VOTE_RESPONSE: 'mg_raft_request_vote_response',
  SERVICE_MESSAGE: 'mg_service_message',
  SERVICE_RESPONSE: 'mg_service_response',
};

/**
 * MessageGroupTransport routes all messages through message groups.
 * This provides location transparency - services don't need to know
 * where their peers are physically located.
 */
class MessageGroupTransport extends EventEmitter {
  /**
   * Create a new MessageGroupTransport.
   * @param {Object} options - Configuration options.
   * @param {string} options.localAddress - Local service address.
   * @param {string} options.localNodeId - Local node ID.
   * @param {Function} options.getLocalMessageGroup - Function to get local message group.
   * @param {Function} options.resolveServiceLocation - Function to resolve service location.
   */
  constructor(options = {}) {
    super();

    this.localAddress = options.localAddress || `mg-transport-${uuidv4()}`;
    this.localNodeId = options.localNodeId || 'unknown';
    this.transportId = uuidv4();

    // Function to get local message group for sending
    this.getLocalMessageGroup = options.getLocalMessageGroup || null;

    // Function to resolve service address to node location
    this.resolveServiceLocation = options.resolveServiceLocation || null;

    // Message handlers by address
    this.messageHandlers = new Map();

    // Pending messages awaiting response
    this.pendingMessages = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.messageTimeoutMs = config.get('transport.messageTimeoutMs') || 5000;
    this.retryMaxAttempts = config.get('transport.retryMaxAttempts') || 3;
    this.retryInitialDelayMs = config.get('transport.retryInitialDelayMs') || 100;
    this.retryBackoffMultiplier = config.get('transport.retryBackoffMultiplier') || 2;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('message-group-transport') : console;

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

    this.logger.debug('Initializing MessageGroupTransport', {
      transportId: this.transportId,
      localAddress: this.localAddress,
      localNodeId: this.localNodeId,
    });

    this.initialized = true;

    this.emit('initialized', {
      transportId: this.transportId,
      localAddress: this.localAddress,
    });
  }

  /**
   * Set the function to get local message group.
   * @param {Function} fn - Function that returns local message group.
   */
  setMessageGroupProvider(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Message group provider must be a function');
    }
    this.getLocalMessageGroup = fn;
  }

  /**
   * Set the function to resolve service location.
   * @param {Function} fn - Function that resolves service address to node.
   */
  setServiceLocationResolver(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Service location resolver must be a function');
    }
    this.resolveServiceLocation = fn;
  }

  /**
   * Register a message handler for an address.
   * @param {string} address - Service address.
   * @param {Function} handler - Message handler.
   */
  register(address, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.messageHandlers.set(address, handler);

    this.logger.debug('Registered message handler', {
      address,
      transportId: this.transportId,
    });
  }

  /**
   * Unregister a message handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.messageHandlers.delete(address);

    this.logger.debug('Unregistered message handler', {
      address,
      transportId: this.transportId,
    });
  }

  /**
   * Deliver a message to a target service through message groups.
   * This is the main entry point for sending messages.
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

    this.logger.debug('Delivering message via message group', {
      messageId,
      targetAddress,
      sourceAddress: this.localAddress,
      messageType: message.type,
    });

    // Check if target is local (same transport)
    const localHandler = this.messageHandlers.get(targetAddress);
    if (localHandler) {
      return this.deliverLocal(targetAddress, messageId, message, localHandler);
    }

    // Route through message group
    return this.deliverViaMessageGroup(targetAddress, messageId, message);
  }

  /**
   * Deliver message locally (same node).
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} message - Message payload.
   * @param {Function} handler - Local handler.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverLocal(targetAddress, messageId, message, handler) {
    this.logger.debug('Delivering locally', {
      messageId,
      targetAddress,
    });

    try {
      const envelope = {
        messageId,
        sourceAddress: this.localAddress,
        sourceNodeId: this.localNodeId,
        targetAddress,
        payload: message,
        timestamp: Date.now(),
        isLocal: true,
      };

      const result = await handler(envelope);

      return {
        messageId,
        acknowledged: result?.acknowledged !== false,
        result,
        deliveryType: 'local',
      };
    } catch (error) {
      this.logger.error('Local delivery failed', {
        messageId,
        targetAddress,
        error: error.message,
      });

      return {
        messageId,
        acknowledged: false,
        error: error.message,
        deliveryType: 'local',
      };
    }
  }

  /**
   * Deliver message via message group (remote or routed).
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} message - Message payload.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverViaMessageGroup(targetAddress, messageId, message) {
    // Get local message group
    if (!this.getLocalMessageGroup) {
      return {
        messageId,
        acknowledged: false,
        error: 'No message group provider configured',
      };
    }

    const messageGroup = await this.getLocalMessageGroup();
    if (!messageGroup) {
      return {
        messageId,
        acknowledged: false,
        error: 'No local message group available',
      };
    }

    this.logger.debug('Routing through message group', {
      messageId,
      targetAddress,
      messageGroupId: messageGroup.groupId,
    });

    // Create transport envelope
    const envelope = {
      type: MGTransportMessageType.SERVICE_MESSAGE,
      messageId,
      sourceAddress: this.localAddress,
      sourceNodeId: this.localNodeId,
      targetAddress,
      payload: message,
      timestamp: Date.now(),
    };

    try {
      // Send through message group
      const result = await messageGroup.sendMessage(targetAddress, envelope);

      return {
        messageId,
        acknowledged: result.status === 'delivered' ||
                      result.status === 'acknowledged',
        result,
        deliveryType: 'message_group',
      };
    } catch (error) {
      this.logger.error('Message group delivery failed', {
        messageId,
        targetAddress,
        error: error.message,
      });

      return {
        messageId,
        acknowledged: false,
        error: error.message,
        deliveryType: 'message_group',
      };
    }
  }

  /**
   * Handle incoming message from message group.
   * Called by message group when a message arrives for a local service.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Processing result.
   */
  async handleIncomingMessage(envelope) {
    const {messageId, targetAddress, payload, sourceAddress, sourceNodeId} = envelope;

    this.logger.debug('Handling incoming message', {
      messageId,
      targetAddress,
      sourceAddress,
      sourceNodeId,
    });

    // Find handler for target
    const handler = this.messageHandlers.get(targetAddress);

    if (!handler) {
      this.logger.warn('No handler for target address', {
        messageId,
        targetAddress,
        registeredAddresses: Array.from(this.messageHandlers.keys()),
      });

      // Emit event for external handling
      this.emit('unhandledMessage', envelope);

      return {
        messageId,
        acknowledged: false,
        error: 'No handler for target address',
      };
    }

    try {
      const result = await handler({
        messageId,
        sourceAddress,
        sourceNodeId,
        targetAddress,
        payload,
        timestamp: envelope.timestamp,
        isLocal: false,
      });

      return {
        messageId,
        acknowledged: result?.acknowledged !== false,
        result,
      };
    } catch (error) {
      this.logger.error('Handler error', {
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
   * Send a Raft AppendEntries RPC through message group.
   * @param {string} targetAddress - Target replica address.
   * @param {Object} appendEntries - AppendEntries data.
   * @return {Promise<Object>} Response.
   */
  async sendAppendEntries(targetAddress, appendEntries) {
    return this.deliver(targetAddress, {
      type: MGTransportMessageType.RAFT_APPEND_ENTRIES,
      ...appendEntries,
    });
  }

  /**
   * Send a Raft RequestVote RPC through message group.
   * @param {string} targetAddress - Target replica address.
   * @param {Object} requestVote - RequestVote data.
   * @return {Promise<Object>} Response.
   */
  async sendRequestVote(targetAddress, requestVote) {
    return this.deliver(targetAddress, {
      type: MGTransportMessageType.RAFT_REQUEST_VOTE,
      ...requestVote,
    });
  }

  /**
   * Broadcast a message to multiple targets.
   * @param {Array<string>} targetAddresses - Target addresses.
   * @param {Object} message - Message to broadcast.
   * @return {Promise<Array<Object>>} Array of delivery results.
   */
  async broadcast(targetAddresses, message) {
    const results = await Promise.all(
      targetAddresses
        .filter((addr) => addr !== this.localAddress)
        .map((addr) => this.deliver(addr, message)),
    );

    return results;
  }

  /**
   * Check if a service is registered locally.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    return this.messageHandlers.has(address);
  }

  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    return Array.from(this.messageHandlers.keys());
  }

  /**
   * Get transport statistics.
   * @return {Object} Transport stats.
   */
  getStats() {
    return {
      transportId: this.transportId,
      localAddress: this.localAddress,
      localNodeId: this.localNodeId,
      initialized: this.initialized,
      messageCount: this.messageCount,
      registeredServices: this.messageHandlers.size,
      pendingMessages: this.pendingMessages.size,
      hasMessageGroupProvider: !!this.getLocalMessageGroup,
      hasServiceLocationResolver: !!this.resolveServiceLocation,
    };
  }

  /**
   * Shutdown the transport.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug('Shutting down MessageGroupTransport', {
      transportId: this.transportId,
    });

    // Clear pending messages
    for (const [, pending] of this.pendingMessages) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      if (pending.reject) {
        pending.reject(new Error('Transport shutdown'));
      }
    }

    this.messageHandlers.clear();
    this.pendingMessages.clear();
    this.initialized = false;

    this.emit('shutdown', {transportId: this.transportId});
  }
}

export {
  MessageGroupTransport,
  MGTransportMessageType,
};
