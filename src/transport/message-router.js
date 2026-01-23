/**
 * MessageRouter - Unified message routing for local and cross-node communication.
 * Routes messages through local handlers or WebSocket connections.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import WebSocket, {WebSocketServer} from 'ws';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Connection state enumeration.
 */
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
};

/**
 * Message types for WebSocket communication.
 */
const RouterMessageType = {
  SERVICE_MESSAGE: 'service_message',
  ACK: 'ack',
  IDENTIFY: 'identify',
  PING: 'ping',
  PONG: 'pong',
};

/**
 * MessageRouter provides unified message routing for both local and remote services.
 * - Local messages are delivered directly to registered handlers
 * - Remote messages are sent via WebSocket connections to other nodes
 */
class MessageRouter extends EventEmitter {
  /**
   * Create a new MessageRouter.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address (for WebSocket server).
   * @param {number} options.wsPort - WebSocket server port.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress || `ws://localhost:${options.wsPort || 8080}`;
    this.wsPort = options.wsPort || null;
    this.routerId = uuidv4();

    // Registered handlers (address -> handler function)
    // Handlers are invoked when messages arrive via WebSocket
    this.handlers = new Map();

    // Node connections (nodeId -> connection info)
    // Includes self-connection for local routing
    this.nodeConnections = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.messageTimeoutMs = config.get('transport.messageTimeoutMs') || 5000;
    this.reconnectIntervalMs = config.get('transport.reconnectIntervalMs') || 1000;
    this.reconnectMaxAttempts = config.get('transport.reconnectMaxAttempts') || 10;
    this.pingIntervalMs = config.get('transport.pingIntervalMs') || 30000;
    this.reconnectBackoffMultiplier =
      config.get('transport.reconnectBackoffMultiplier') || 1.5;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('message-router') : console;

    // State
    this.initialized = false;
    this.server = null;
    this.messageCount = 0;

    // Function to resolve service address to node ID
    this.resolveServiceNode = options.resolveServiceNode || null;
  }

  /**
   * Initialize the message router.
   * Starts WebSocket server and establishes self-connection for uniform routing.
   * Requirements: 2.2, 8.2
   * @param {Object} options - Initialization options.
   * @param {boolean} options.startServer - Whether to start WebSocket server.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing MessageRouter', {
      routerId: this.routerId,
      nodeId: this.nodeId,
      wsPort: this.wsPort,
    });

    // Start WebSocket server if port specified
    if (options.startServer && this.wsPort) {
      await this.startServer();

      // Establish self-connection for uniform message routing
      // All messages (local and remote) go through WebSocket
      try {
        await this.connectToSelf();
      } catch (error) {
        this.logger.error('Failed to establish self-connection', {
          error: error.message,
          nodeId: this.nodeId,
        });
        // Clean up server if self-connection fails
        if (this.server) {
          await new Promise((resolve) => this.server.close(resolve));
          this.server = null;
        }
        throw new Error(`Self-connection failed: ${error.message}`);
      }
    }

    this.initialized = true;

    this.emit('initialized', {
      routerId: this.routerId,
      nodeId: this.nodeId,
    });
  }

  /**
   * Start WebSocket server to accept incoming connections.
   * @return {Promise<void>}
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({port: this.wsPort});

        this.server.on('connection', (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });

        this.server.on('listening', () => {
          this.logger.info('MessageRouter WebSocket server listening', {
            port: this.wsPort,
            routerId: this.routerId,
          });
          resolve();
        });

        this.server.on('error', (error) => {
          this.logger.error('MessageRouter WebSocket server error', {
            error: error.message,
            routerId: this.routerId,
          });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket connection from another node.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();

    this.logger.debug('Incoming WebSocket connection', {
      connectionId,
      routerId: this.routerId,
    });

    // Set up message handler
    ws.on('message', (data) => {
      this.handleMessage(connectionId, ws, data);
    });

    ws.on('close', () => {
      this.handleConnectionClose(connectionId);
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket connection error', {
        connectionId,
        error: error.message,
      });
    });

    // Store connection temporarily until we know the peer node ID
    this.nodeConnections.set(connectionId, {
      connectionId,
      ws,
      state: ConnectionState.CONNECTED,
      nodeId: null,
      isIncoming: true,
      createdAt: Date.now(),
    });

    this.emit('connectionEstablished', {connectionId, incoming: true});
  }

  /**
   * Connect to self via loopback.
   * This enables uniform routing for all messages - local and remote use the same path.
   * Requirements: 2.1, 2.4
   * @return {Promise<void>}
   */
  async connectToSelf() {
    const selfAddress = `ws://localhost:${this.wsPort}`;
    this.logger.debug('Establishing self-connection', {
      nodeId: this.nodeId,
      address: selfAddress,
    });
    await this.connectToNode(this.nodeId, selfAddress, {isSelfConnection: true});
  }

  /**
   * Connect to a remote node via WebSocket.
   * @param {string} nodeId - Remote node ID.
   * @param {string} address - Remote node WebSocket address.
   * @param {Object} options - Connection options.
   * @param {boolean} options.isSelfConnection - Whether this is a self-connection.
   * @return {Promise<void>}
   */
  async connectToNode(nodeId, address, options = {}) {
    // Check if already connected
    if (this.nodeConnections.has(nodeId)) {
      const existing = this.nodeConnections.get(nodeId);
      if (existing.state === ConnectionState.CONNECTED) {
        this.logger.debug('Already connected to node', {nodeId});
        return;
      }
    }

    this.logger.debug('Connecting to node', {
      nodeId,
      address,
      routerId: this.routerId,
    });

    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId,
      address,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: 0,
      isIncoming: false,
      isSelfConnection: options.isSelfConnection || false,
      createdAt: Date.now(),
    };

    this.nodeConnections.set(nodeId, connectionInfo);

    await this.establishConnection(connectionInfo);
  }

  /**
   * Establish WebSocket connection to a remote node.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(connectionInfo.address);

        ws.on('open', () => {
          connectionInfo.ws = ws;
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = 0;

          this.logger.info('Connected to node', {
            nodeId: connectionInfo.nodeId,
            address: connectionInfo.address,
          });

          // Send identification message
          this.sendIdentification(connectionInfo);

          // Start ping interval
          this.startPingInterval(connectionInfo);

          this.emit('connectionEstablished', {
            nodeId: connectionInfo.nodeId,
            connectionId: connectionInfo.connectionId,
          });

          resolve();
        });

        ws.on('message', (data) => {
          this.handleMessage(connectionInfo.nodeId, ws, data);
        });

        ws.on('close', () => {
          this.handleConnectionClose(connectionInfo.nodeId);
        });

        ws.on('error', (error) => {
          this.logger.error('WebSocket error', {
            nodeId: connectionInfo.nodeId,
            error: error.message,
          });

          if (connectionInfo.state === ConnectionState.CONNECTING) {
            reject(error);
          }
        });
      } catch (error) {
        connectionInfo.state = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Send identification message to remote node.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    const message = {
      type: RouterMessageType.IDENTIFY,
      nodeId: this.nodeId,
      address: this.nodeAddress,
      timestamp: Date.now(),
    };

    this.sendRaw(connectionInfo.ws, message);
  }

  /**
   * Handle incoming message from WebSocket.
   * @param {string} connectionId - Connection or node ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(connectionId, ws, data) {
    try {
      const message = JSON.parse(data.toString());

      this.logger.debug('Received message', {
        connectionId,
        type: message.type,
        messageId: message.messageId,
      });

      // Handle identification
      if (message.type === RouterMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }

      // Handle ping/pong
      if (message.type === RouterMessageType.PING) {
        this.sendRaw(ws, {type: RouterMessageType.PONG, timestamp: Date.now()});
        return;
      }

      if (message.type === RouterMessageType.PONG) {
        // Update connection health
        return;
      }

      // Handle acknowledgment
      if (message.type === RouterMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }

      // Handle service message
      if (message.type === RouterMessageType.SERVICE_MESSAGE) {
        this.handleServiceMessage(ws, message);
        return;
      }

      // Unknown message type
      this.logger.warn('Unknown message type', {
        type: message.type,
        connectionId,
      });
    } catch (error) {
      this.logger.error('Failed to parse message', {
        connectionId,
        error: error.message,
      });
    }
  }

  /**
   * Handle identification message from remote node.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   * @private
   */
  handleIdentification(connectionId, ws, message) {
    const {nodeId} = message;

    this.logger.debug('Received identification', {
      connectionId,
      nodeId,
    });

    // Update connection with node ID
    const connection = this.nodeConnections.get(connectionId);
    if (connection && connection.isIncoming) {
      connection.nodeId = nodeId;

      // Only re-key if there's no existing connection for this nodeId
      // This prevents the incoming side of a self-connection from overwriting
      // the outgoing side
      if (!this.nodeConnections.has(nodeId)) {
        this.nodeConnections.delete(connectionId);
        this.nodeConnections.set(nodeId, connection);
      }
      // If there's already a connection for this nodeId (e.g., self-connection),
      // keep the incoming connection under its original connectionId
    }

    this.emit('nodeIdentified', {nodeId, connectionId});
  }

  /**
   * Handle service message from remote node.
   * Flattens handler result into ACK to avoid nested result structures.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  handleServiceMessage(ws, message) {
    const {targetAddress, messageId, payload} = message;

    this.logger.debug('Handling service message', {
      messageId,
      targetAddress,
      sourceNodeId: message.sourceNodeId,
      registeredHandlers: Array.from(this.handlers.keys()),
      hasHandler: this.handlers.has(targetAddress),
    });

    // Find handler for target address
    const handler = this.handlers.get(targetAddress);

    if (handler) {
      try {
        // Create envelope similar to InMemoryTransport
        const envelope = {
          messageId,
          sourceAddress: message.sourceAddress,
          sourceNodeId: message.sourceNodeId,
          targetAddress,
          payload,
          timestamp: message.timestamp,
        };

        // Call handler (may be sync or async)
        const resultPromise = Promise.resolve(handler(envelope));

        resultPromise
          .then((result) => {
            // Flatten handler result into ACK - spread result fields directly
            // This avoids nested {result: {result: ...}} structures
            const ack = {
              type: RouterMessageType.ACK,
              messageId,
              acknowledged: true,
            };
            // Spread handler result fields (excluding 'acknowledged' to avoid override)
            // Keep handler's 'type' as 'responseType' to preserve it
            if (result && typeof result === 'object') {
              const {acknowledged: _ack, type: handlerType, ...rest} = result;
              Object.assign(ack, rest);
              if (handlerType) {
                ack.responseType = handlerType;
              }
            }
            this.sendRaw(ws, ack);
          })
          .catch((error) => {
            this.sendRaw(ws, {
              type: RouterMessageType.ACK,
              messageId,
              acknowledged: false,
              error: error.message,
            });
          });
      } catch (error) {
        this.sendRaw(ws, {
          type: RouterMessageType.ACK,
          messageId,
          acknowledged: false,
          error: error.message,
        });
      }
    } else {
      // No handler - emit event for external handling
      this.emit('message', {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });

      // Send acknowledgment (message received but no handler)
      this.sendRaw(ws, {
        type: RouterMessageType.ACK,
        messageId,
        acknowledged: true,
        noHandler: true,
      });
    }
  }

  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;

    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);

      if (acknowledged) {
        // Pass through flat structure - spread all fields from ACK
        pending.resolve({messageId, acknowledged: true, ...rest});
      } else {
        pending.reject(new Error(error || 'Message not acknowledged'));
      }
    }
  }

  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   * @private
   */
  handleConnectionClose(nodeId) {
    const connection = this.nodeConnections.get(nodeId);

    if (connection) {
      this.logger.info('Connection closed', {
        nodeId,
        connectionId: connection.connectionId,
        isSelfConnection: connection.isSelfConnection,
      });

      connection.state = ConnectionState.DISCONNECTED;
      connection.ws = null;

      // Stop ping interval
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }

      this.emit('connectionClosed', {nodeId});

      // Self-disconnection is fatal - do not attempt reconnection
      if (connection.isSelfConnection) {
        this.logger.error('Self-connection lost - fatal error', {
          nodeId,
          connectionId: connection.connectionId,
        });
        this.emit('selfDisconnect', {nodeId});
        return;
      }

      // Attempt reconnection for outgoing connections to other nodes
      if (!connection.isIncoming && connection.address) {
        this.scheduleReconnect(connection);
      }
    }
  }

  /**
   * Schedule reconnection attempt.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error('Max reconnection attempts reached', {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = ConnectionState.CLOSED;
      return;
    }

    connectionInfo.state = ConnectionState.RECONNECTING;
    connectionInfo.reconnectAttempts++;

    const delay = this.reconnectIntervalMs *
      Math.pow(this.reconnectBackoffMultiplier, connectionInfo.reconnectAttempts - 1);

    this.logger.debug('Scheduling reconnection', {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    connectionInfo.reconnectTimeout = setTimeout(async () => {
      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error('Reconnection failed', {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        this.scheduleReconnect(connectionInfo);
      }
    }, delay);
  }

  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (connectionInfo.ws &&
          connectionInfo.ws.readyState === WebSocket.OPEN) {
        this.sendRaw(connectionInfo.ws, {
          type: RouterMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
  }

  /**
   * Register a service handler.
   * The handler will be invoked when messages arrive for this address.
   * Requirements: 5.1
   * @param {string} address - Service address in unified format (nodeId/entityType/entityId).
   * @param {Function} handler - Message handler function.
   * @param {Object} options - Registration options.
   * @param {boolean} options.skipValidation - Skip address validation (for legacy addresses).
   */
  register(address, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    // Validate address format unless explicitly skipped
    if (!options.skipValidation && !this.isValidAddress(address)) {
      throw new Error(
        `Invalid address format: ${address}. ` +
        'Expected format: nodeId/entityType/entityId where entityType is one of: ' +
        'message-group, partition, lifecycle, service',
      );
    }

    this.handlers.set(address, handler);

    this.logger.debug('Registered handler', {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Parse a unified address into its components.
   * Address format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.2, 9.1
   * @param {string} address - Address to parse.
   * @return {Object} Parsed address with nodeId, entityType, entityId.
   *                  Returns null values for malformed addresses.
   */
  parseAddress(address) {
    if (!address || typeof address !== 'string') {
      return {nodeId: null, entityType: null, entityId: null};
    }

    const parts = address.split('/');
    return {
      nodeId: parts[0] || null,
      entityType: parts[1] || null,
      entityId: parts[2] || null,
    };
  }

  /**
   * Validate that an address follows the unified format.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Valid entityTypes: message-group, partition, lifecycle, service
   * Requirements: 1.1, 1.3
   * @param {string} address - Address to validate.
   * @return {boolean} True if address is valid.
   */
  isValidAddress(address) {
    if (!address || typeof address !== 'string') {
      return false;
    }

    const parts = address.split('/');
    if (parts.length !== 3) {
      return false;
    }

    const [nodeId, entityType, entityId] = parts;

    // All parts must be non-empty
    if (!nodeId || !entityType || !entityId) {
      return false;
    }

    // entityType must be one of the valid types
    const validTypes = ['message-group', 'partition', 'lifecycle', 'service'];
    return validTypes.includes(entityType);
  }

  /**
   * Unregister a service handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    this.handlers.delete(address);

    this.logger.debug('Unregistered handler', {
      address,
      routerId: this.routerId,
      totalHandlers: this.handlers.size,
    });
  }

  /**
   * Set the function to resolve service address to node ID.
   * @param {Function} resolver - Function(address) => nodeId or null.
   */
  setServiceNodeResolver(resolver) {
    this.resolveServiceNode = resolver;
  }

  /**
   * Deliver a message to a target service via WebSocket.
   * All messages go through WebSocket, including local messages via self-connection.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID (if known).
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const messageId = message.messageId || uuidv4();
    this.messageCount++;

    // Determine target node - always route via WebSocket
    let targetNodeId = options.targetNodeId;

    // If no targetNodeId provided, try to extract from address or use resolver
    if (!targetNodeId) {
      // Try to parse nodeId from unified address format (nodeId/entityType/entityId)
      const parsed = this.parseAddress(targetAddress);
      if (parsed.nodeId) {
        targetNodeId = parsed.nodeId;
      }
    }

    // Fall back to resolver if still no nodeId
    if (!targetNodeId && this.resolveServiceNode) {
      targetNodeId = this.resolveServiceNode(targetAddress);
    }

    // If still no targetNodeId, assume it's a local address (for backward compatibility)
    // and use self nodeId
    if (!targetNodeId) {
      targetNodeId = this.nodeId;
    }

    // Deliver via WebSocket connection
    return this.deliverRemote(targetAddress, messageId, message, targetNodeId);
  }

  /**
   * Deliver message to node via WebSocket.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverRemote(targetAddress, messageId, payload, targetNodeId) {
    const connection = this.nodeConnections.get(targetNodeId);

    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      this.logger.debug('No connection to target node', {
        messageId,
        targetAddress,
        targetNodeId,
      });

      return {
        messageId,
        acknowledged: false,
        error: `No connection to node ${targetNodeId}`,
      };
    }

    return this.sendMessage(connection, targetAddress, messageId, payload);
  }

  /**
   * Send message through WebSocket connection.
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Send result.
   * @private
   */
  sendMessage(connection, targetAddress, messageId, payload) {
    return new Promise((resolve, reject) => {
      const message = {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: `${this.nodeId}/router`,
        sourceNodeId: this.nodeId,
        payload,
        timestamp: Date.now(),
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve({
          messageId,
          acknowledged: false,
          error: 'Message timeout',
        });
      }, this.messageTimeoutMs);

      // Track pending message
      this.pendingMessages.set(messageId, {
        messageId,
        resolve,
        reject,
        timeout,
        sentAt: Date.now(),
      });

      // Send message
      this.sendRaw(connection.ws, message);
    });
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Message to send.
   * @private
   */
  sendRaw(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if a service is registered.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    return this.handlers.has(address);
  }

  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    const connection = this.nodeConnections.get(nodeId);
    return connection ? connection.state : null;
  }

  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    const connected = [];
    for (const [_nodeId, connection] of this.nodeConnections) {
      if (connection.state === ConnectionState.CONNECTED && connection.nodeId) {
        connected.push(connection.nodeId);
      }
    }
    return connected;
  }

  /**
   * Check if self-connection is established.
   * @return {boolean} True if self-connection exists and is connected.
   */
  hasSelfConnection() {
    const connection = this.nodeConnections.get(this.nodeId);
    return connection &&
           connection.isSelfConnection &&
           connection.state === ConnectionState.CONNECTED;
  }

  /**
   * Get router statistics.
   * @return {Object} Router stats.
   */
  getStats() {
    const connectionStats = {};
    for (const [nodeId, connection] of this.nodeConnections) {
      connectionStats[nodeId] = {
        state: connection.state,
        isIncoming: connection.isIncoming,
        reconnectAttempts: connection.reconnectAttempts,
      };
    }

    return {
      routerId: this.routerId,
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
      handlers: this.handlers.size,
      connections: connectionStats,
      connectedNodes: this.getConnectedNodes().length,
    };
  }

  /**
   * Shutdown the message router.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug('Shutting down MessageRouter', {
      routerId: this.routerId,
    });

    // Clear pending messages first to avoid timeout callbacks
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Router shutdown'));
    }
    this.pendingMessages.clear();

    // Close all connections and wait for them to close
    const closePromises = [];
    for (const [, connection] of this.nodeConnections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
        connection.reconnectTimeout = null;
      }
      if (connection.ws) {
        const ws = connection.ws;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          closePromises.push(new Promise((resolve) => {
            ws.once('close', resolve);
            ws.terminate(); // Force close instead of graceful close
          }));
        }
      }
    }

    // Wait for all connections to close (with timeout that gets cleared)
    if (closePromises.length > 0) {
      let timeoutId;
      await Promise.race([
        Promise.all(closePromises),
        new Promise((resolve) => {
          timeoutId = setTimeout(resolve, 100);
        }),
      ]).finally(() => {
        clearTimeout(timeoutId);
      });
    }

    // Close server and all its client connections
    if (this.server) {
      // Terminate all clients connected to the server
      for (const client of this.server.clients) {
        client.terminate();
      }
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      this.server = null;
    }

    this.nodeConnections.clear();
    this.handlers.clear();
    this.initialized = false;

    this.emit('shutdown', {routerId: this.routerId});
  }
}

export {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
};
