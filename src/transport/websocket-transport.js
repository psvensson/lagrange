/**
 * WebSocketTransport - Inter-node communication using WebSocket.
 * Supports single WebSocket connection per node pair.
 * Requirements: 9.1, 4.16
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
 * WebSocket message types.
 */
const WSMessageType = {
  RAFT_MESSAGE: 'raft_message',
  SERVICE_MESSAGE: 'service_message',
  PING: 'ping',
  PONG: 'pong',
  ACK: 'ack',
};

/**
 * WebSocketTransport provides inter-node communication.
 * Maintains single WebSocket connection per node pair.
 */
class WebSocketTransport extends EventEmitter {
  /**
   * Create a new WebSocketTransport.
   * @param {Object} options - Configuration options.
   * @param {string} options.localNodeId - Local node ID.
   * @param {string} options.localAddress - Local service address.
   * @param {Array<Object>} options.peerNodes - Peer node configurations.
   */
  constructor(options = {}) {
    super();

    this.localNodeId = options.localNodeId || uuidv4();
    this.localAddress = options.localAddress || `ws-${this.localNodeId}`;
    this.transportId = uuidv4();

    // Peer connections (nodeId -> connection info)
    this.connections = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();

    // Message handlers by address
    this.messageHandlers = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.reconnectIntervalMs = config.get('transport.reconnectIntervalMs') || 1000;
    this.reconnectMaxAttempts = config.get('transport.reconnectMaxAttempts') || 10;
    this.reconnectBackoffMultiplier =
      config.get('transport.reconnectBackoffMultiplier') || 1.5;
    this.pingIntervalMs = config.get('transport.pingIntervalMs') || 30000;
    this.messageTimeoutMs = config.get('transport.messageTimeoutMs') || 5000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('websocket-transport') : console;

    // State
    this.initialized = false;
    this.messageCount = 0;

    // WebSocket server (if acting as server)
    this.server = null;
  }

  /**
   * Initialize the transport.
   * @param {Object} options - Initialization options.
   * @param {number} options.port - Port to listen on (if server).
   * @param {Array<Object>} options.peerNodes - Peer nodes to connect to.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    this.logger.debug('Initializing WebSocketTransport', {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });

    // Connect to peer nodes if provided
    if (options.peerNodes && options.peerNodes.length > 0) {
      for (const peer of options.peerNodes) {
        await this.connectToPeer(peer);
      }
    }

    this.initialized = true;

    this.emit('initialized', {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });
  }

  /**
   * Start WebSocket server.
   * @param {number} port - Port to listen on.
   * @return {Promise<void>}
   */
  async startServer(port) {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({port});

        this.server.on('connection', (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });

        this.server.on('listening', () => {
          this.logger.info('WebSocket server listening', {
            port,
            transportId: this.transportId,
          });
          resolve();
        });

        this.server.on('error', (error) => {
          this.logger.error('WebSocket server error', {
            error: error.message,
            transportId: this.transportId,
          });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket connection.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    const connectionId = uuidv4();

    this.logger.debug('Incoming WebSocket connection', {
      connectionId,
      transportId: this.transportId,
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
    this.connections.set(connectionId, {
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
   * Connect to a peer node.
   * @param {Object} peer - Peer configuration.
   * @param {string} peer.nodeId - Peer node ID.
   * @param {string} peer.address - Peer WebSocket address.
   * @return {Promise<void>}
   */
  async connectToPeer(peer) {
    const {nodeId, address} = peer;

    // Check if already connected
    if (this.connections.has(nodeId)) {
      const existing = this.connections.get(nodeId);
      if (existing.state === ConnectionState.CONNECTED) {
        this.logger.debug('Already connected to peer', {nodeId});
        return;
      }
    }

    this.logger.debug('Connecting to peer', {
      nodeId,
      address,
      transportId: this.transportId,
    });

    const connectionInfo = {
      connectionId: uuidv4(),
      nodeId,
      address,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: 0,
      isIncoming: false,
      createdAt: Date.now(),
    };

    this.connections.set(nodeId, connectionInfo);

    await this.establishConnection(connectionInfo);
  }

  /**
   * Establish WebSocket connection to peer.
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

          this.logger.info('Connected to peer', {
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
   * Send identification message to peer.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    const message = {
      type: 'identify',
      nodeId: this.localNodeId,
      address: this.localAddress,
      timestamp: Date.now(),
    };

    this.sendRaw(connectionInfo.ws, message);
  }

  /**
   * Handle incoming message.
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
      if (message.type === 'identify') {
        this.handleIdentification(connectionId, ws, message);
        return;
      }

      // Handle ping/pong
      if (message.type === WSMessageType.PING) {
        this.sendRaw(ws, {type: WSMessageType.PONG, timestamp: Date.now()});
        return;
      }

      if (message.type === WSMessageType.PONG) {
        // Update connection health
        return;
      }

      // Handle acknowledgment
      if (message.type === WSMessageType.ACK) {
        this.handleAcknowledgment(message);
        return;
      }

      // Handle service message
      if (message.type === WSMessageType.SERVICE_MESSAGE ||
          message.type === WSMessageType.RAFT_MESSAGE) {
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
   * Handle identification message.
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
    const connection = this.connections.get(connectionId);
    if (connection && connection.isIncoming) {
      connection.nodeId = nodeId;

      // Re-key by node ID
      this.connections.delete(connectionId);
      this.connections.set(nodeId, connection);
    }

    this.emit('peerIdentified', {nodeId, connectionId});
  }

  /**
   * Handle service message.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  async handleServiceMessage(ws, message) {
    const {targetAddress, messageId, payload} = message;

    // Find handler for target address
    const handler = this.messageHandlers.get(targetAddress);

    if (handler) {
      try {
        // Await the handler result in case it's async
        const result = await handler({
          messageId,
          payload,
          sourceAddress: message.sourceAddress,
          sourceNodeId: message.sourceNodeId,
        });

        // Send acknowledgment with flat structure - spread handler result directly
        const ack = {
          type: WSMessageType.ACK,
          messageId,
          acknowledged: true,
        };
        if (result && typeof result === 'object') {
          const {acknowledged: _ack, type: handlerType, ...rest} = result;
          Object.assign(ack, rest);
          if (handlerType) {
            ack.responseType = handlerType;
          }
        }
        this.sendRaw(ws, ack);
      } catch (error) {
        this.sendRaw(ws, {
          type: WSMessageType.ACK,
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

      // Send acknowledgment
      this.sendRaw(ws, {
        type: WSMessageType.ACK,
        messageId,
        acknowledged: true,
      });
    }
  }

  /**
   * Handle acknowledgment message.
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
        // Flat structure - spread all fields from ACK
        pending.resolve({messageId, acknowledged: true, ...rest});
      } else {
        pending.reject(new Error(error || 'Message not acknowledged'));
      }
    }
  }

  /**
   * Handle connection close.
   * @param {string} nodeId - Node ID.
   * @private
   */
  handleConnectionClose(nodeId) {
    const connection = this.connections.get(nodeId);

    if (connection) {
      this.logger.info('Connection closed', {
        nodeId,
        connectionId: connection.connectionId,
      });

      connection.state = ConnectionState.DISCONNECTED;
      connection.ws = null;

      // Stop ping interval
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
        connection.pingInterval = null;
      }

      this.emit('connectionClosed', {nodeId});

      // Attempt reconnection for outgoing connections
      if (!connection.isIncoming) {
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

    setTimeout(async () => {
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
          type: WSMessageType.PING,
          timestamp: Date.now(),
        });
      }
    }, this.pingIntervalMs);
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
  }

  /**
   * Deliver a message to a target node/service.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   */
  async deliver(targetAddress, message, options = {}) {
    const {targetNodeId} = options;
    const messageId = message.messageId || uuidv4();
    this.messageCount++;

    // Find connection to target node
    let connection = null;
    if (targetNodeId) {
      connection = this.connections.get(targetNodeId);
    } else {
      // Try to find connection by iterating
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.CONNECTED) {
          connection = conn;
          break;
        }
      }
    }

    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      return {
        messageId,
        acknowledged: false,
        error: 'No connection to target node',
      };
    }

    return this.sendMessage(connection, targetAddress, messageId, message);
  }

  /**
   * Send message through connection.
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
        type: WSMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: this.localAddress,
        sourceNodeId: this.localNodeId,
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
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    const connection = this.connections.get(nodeId);
    return connection ? connection.state : null;
  }

  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    const connected = [];
    for (const [nodeId, connection] of this.connections) {
      if (connection.state === ConnectionState.CONNECTED) {
        connected.push(nodeId);
      }
    }
    return connected;
  }

  /**
   * Get transport statistics.
   * @return {Object} Transport stats.
   */
  getStats() {
    const connectionStats = {};
    for (const [nodeId, connection] of this.connections) {
      connectionStats[nodeId] = {
        state: connection.state,
        isIncoming: connection.isIncoming,
        reconnectAttempts: connection.reconnectAttempts,
      };
    }

    return {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
      localAddress: this.localAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessages: this.pendingMessages.size,
      connections: connectionStats,
      connectedNodes: this.getConnectedNodes().length,
    };
  }

  /**
   * Shutdown the transport.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug('Shutting down WebSocketTransport', {
      transportId: this.transportId,
    });

    // Close all connections
    for (const [, connection] of this.connections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      if (connection.ws) {
        connection.ws.close();
      }
    }

    // Close server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    // Clear pending messages
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Transport shutdown'));
    }

    this.connections.clear();
    this.pendingMessages.clear();
    this.messageHandlers.clear();
    this.initialized = false;

    this.emit('shutdown', {transportId: this.transportId});
  }
}

export {
  WebSocketTransport,
  ConnectionState,
  WSMessageType,
};
