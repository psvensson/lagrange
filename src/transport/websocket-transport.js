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
import {
  CONNECTION_STATE,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_FORMAT,
  TRANSPORT_NUM,
  TRANSPORT_SUBSYSTEM,
  TRANSPORT_TYPEOF,
  WS_ERROR_MSG,
  WS_LOG_MSG,
  WS_MESSAGE_TYPE,
} from '../constants/transport.js';
import {
  buildTransportStats,
  createIncomingConnectionRecord,
  createOutgoingConnectionRecord,
  findConnectedConnection,
} from './websocket-transport-connection-records.js';
import {
  buildDeliveryMessage,
  buildIdentificationMessage,
  buildMessageTimeoutResult,
  buildNoConnectionResult,
  buildPendingMessageRecord,
  buildPongMessage,
  buildServiceAcknowledgment,
  buildServiceFailureAcknowledgment,
} from './websocket-transport-messages.js';

const ConnectionState = CONNECTION_STATE;
const WSMessageType = WS_MESSAGE_TYPE;

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
    this.localAddress = options.localAddress ||
      TRANSPORT_FORMAT.buildLocalAddress(this.localNodeId);
    this.transportId = uuidv4();

    // Peer connections (nodeId -> connection info)
    this.connections = new Map();

    // Pending messages awaiting acknowledgment
    this.pendingMessages = new Map();

    // Message handlers by address
    this.messageHandlers = new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.reconnectIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS;
    this.reconnectMaxAttempts =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) ||
      TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS;
    this.reconnectBackoffMultiplier =
      config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) ||
      TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER;
    this.pingIntervalMs =
      config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) ||
      TRANSPORT_DEFAULT.PING_INTERVAL_MS;
    this.messageTimeoutMs =
      config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
    this.wsHost =
      config.get(TRANSPORT_CONFIG_KEY.WS_HOST) ||
      TRANSPORT_DEFAULT.WS_HOST;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.WEBSOCKET) : console;

    // State
    this.initialized = false;
    this.messageCount = TRANSPORT_NUM.ZERO;

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

    this.logger.debug(WS_LOG_MSG.INITIALIZING, {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });

    // Connect to peer nodes if provided
    if (options.peerNodes &&
        options.peerNodes.length > TRANSPORT_NUM.ZERO) {
      for (const peer of options.peerNodes) {
        await this.connectToPeer(peer);
      }
    }

    this.initialized = true;

    this.emit(TRANSPORT_EVENT.INITIALIZED, {
      transportId: this.transportId,
      localNodeId: this.localNodeId,
    });
  }

  /**
   * Start WebSocket server.
   * @param {number} port - Port to listen on.
   * @param {string} [host] - Host/interface to bind to.
   * @return {Promise<void>}
   */
  async startServer(port, host = null) {
    return new Promise((resolve, reject) => {
      try {
        // Prefer binding to a specific host (usually 127.0.0.1) to avoid sandbox
        // restrictions that may disallow binding to 0.0.0.0.
        const bindHost = host || this.wsHost || TRANSPORT_DEFAULT.WS_HOST;
        this.server = new WebSocketServer({port, host: bindHost});

        this.server.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
          this.handleIncomingConnection(ws, req);
        });

        this.server.on(TRANSPORT_EVENT.LISTENING, () => {
          this.logger.info(WS_LOG_MSG.SERVER_LISTENING, {
            port,
            host: this.server?.options?.host || bindHost,
            transportId: this.transportId,
          });
          resolve();
        });

        this.server.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(WS_LOG_MSG.SERVER_ERROR, {
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

    this.logger.debug(WS_LOG_MSG.INCOMING_CONNECTION, {
      connectionId,
      transportId: this.transportId,
    });

    // Set up message handler
    ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(connectionId, ws, data);
    });

    ws.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleConnectionClose(connectionId);
    });

    ws.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(WS_LOG_MSG.CONNECTION_ERROR, {
        connectionId,
        error: error.message,
      });
    });

    const connection = createIncomingConnectionRecord(connectionId, ws);

    // Store connection temporarily until we know the peer node ID
    this.connections.set(connectionId, connection);

    this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
      connectionId,
      incoming: true,
    });
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
        this.logger.debug(WS_LOG_MSG.ALREADY_CONNECTED, {nodeId});
        return;
      }
    }

    this.logger.debug(WS_LOG_MSG.CONNECTING, {
      nodeId,
      address,
      transportId: this.transportId,
    });

    const connectionInfo = createOutgoingConnectionRecord({
      connectionId: uuidv4(),
      nodeId,
      address,
    });

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

        ws.on(TRANSPORT_EVENT.OPEN, () => {
          connectionInfo.ws = ws;
          connectionInfo.state = ConnectionState.CONNECTED;
          connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;

          this.logger.info(WS_LOG_MSG.CONNECTED, {
            nodeId: connectionInfo.nodeId,
            address: connectionInfo.address,
          });

          // Send identification message
          this.sendIdentification(connectionInfo);

          // Start ping interval
          this.startPingInterval(connectionInfo);

          this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
            nodeId: connectionInfo.nodeId,
            connectionId: connectionInfo.connectionId,
          });

          resolve();
        });

        ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
          this.handleMessage(connectionInfo.nodeId, ws, data);
        });

        ws.on(TRANSPORT_EVENT.CLOSE, () => {
          this.handleConnectionClose(connectionInfo.nodeId);
        });

        ws.on(TRANSPORT_EVENT.ERROR, (error) => {
          this.logger.error(WS_LOG_MSG.WS_ERROR, {
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
    this.sendRaw(
      connectionInfo.ws,
      buildIdentificationMessage(this.localNodeId, this.localAddress),
    );
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

      this.logger.debug(WS_LOG_MSG.MESSAGE_RECEIVED, {
        connectionId,
        type: message.type,
        messageId: message.messageId,
      });

      // Handle identification
      if (message.type === WSMessageType.IDENTIFY) {
        this.handleIdentification(connectionId, ws, message);
        return;
      }

      // Handle ping/pong
      if (message.type === WSMessageType.PING) {
        this.sendRaw(ws, buildPongMessage());
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
      this.logger.warn(WS_LOG_MSG.MESSAGE_UNKNOWN, {
        type: message.type,
        connectionId,
      });
    } catch (error) {
      this.logger.error(WS_LOG_MSG.MESSAGE_PARSE_FAILED, {
        connectionId,
        error: error.message,
      });
      throw error;
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

    this.logger.debug(WS_LOG_MSG.IDENTIFICATION_RECEIVED, {
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

    this.emit(TRANSPORT_EVENT.PEER_IDENTIFIED, {nodeId, connectionId});
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

        this.sendRaw(ws, buildServiceAcknowledgment(messageId, result));
      } catch (error) {
        this.sendRaw(ws, buildServiceFailureAcknowledgment(messageId, error));
      }
    } else {
      // No handler - emit event for external handling
      this.emit(TRANSPORT_EVENT.MESSAGE, {
        messageId,
        targetAddress,
        payload,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
      });

      // Send acknowledgment
      this.sendRaw(ws, buildServiceAcknowledgment(messageId));
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
        pending.reject(new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED));
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
      this.logger.info(WS_LOG_MSG.CONNECTION_CLOSED, {
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

      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {nodeId});

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
      this.logger.error(WS_LOG_MSG.MAX_RECONNECTS_REACHED, {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = ConnectionState.CLOSED;
      return;
    }

    connectionInfo.state = ConnectionState.RECONNECTING;
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;

    const delay = this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );

    this.logger.debug(WS_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(async () => {
      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(WS_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        throw error;
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
    connectionInfo.pingInterval.unref();
  }

  /**
   * Register a message handler for an address.
   * @param {string} address - Service address.
   * @param {Function} handler - Message handler.
   */
  register(address, handler) {
    if (typeof handler !== TRANSPORT_TYPEOF.FUNCTION) {
      throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
    }

    this.messageHandlers.set(address, handler);

    this.logger.debug(WS_LOG_MSG.HANDLER_REGISTERED, {
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
    this.messageCount += TRANSPORT_NUM.ONE;

    const connection = targetNodeId ?
      this.connections.get(targetNodeId) :
      findConnectedConnection(this.connections);

    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      return buildNoConnectionResult(messageId);
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
      const message = buildDeliveryMessage({
        messageId,
        targetAddress,
        sourceAddress: this.localAddress,
        sourceNodeId: this.localNodeId,
        payload,
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve(buildMessageTimeoutResult(messageId));
      }, this.messageTimeoutMs);

      // Track pending message
      this.pendingMessages.set(messageId, buildPendingMessageRecord({
        messageId,
        resolve,
        reject,
        timeout,
      }));

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
    return buildTransportStats({
      transportId: this.transportId,
      localNodeId: this.localNodeId,
      localAddress: this.localAddress,
      initialized: this.initialized,
      messageCount: this.messageCount,
      pendingMessageCount: this.pendingMessages.size,
      connections: this.connections,
      connectedNodeCount: this.getConnectedNodes().length,
    });
  }

  /**
   * Shutdown the transport.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.debug(WS_LOG_MSG.SHUTTING_DOWN, {
      transportId: this.transportId,
    });

    // Close all connections - use terminate() for immediate cleanup
    for (const [, connection] of this.connections) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      if (connection.ws) {
        connection.ws.terminate();
      }
    }

    // Close server and underlying HTTP server
    if (this.server) {
      // Terminate all connected clients first
      for (const client of this.server.clients || []) {
        client.terminate();
      }

      const httpServer = this.server._server || null;

      await new Promise((resolve) => {
        this.server.close(resolve);
      });

      // Also close the underlying HTTP server if present
      if (httpServer) {
        if (typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION) {
          httpServer.closeAllConnections();
        }
        await new Promise((resolve) => {
          httpServer.close(resolve);
        });
        if (typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION) {
          httpServer.unref();
        }
      }
    }

    // Clear pending messages
    for (const [, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(WS_ERROR_MSG.SHUTDOWN));
    }

    this.connections.clear();
    this.pendingMessages.clear();
    this.messageHandlers.clear();
    this.initialized = false;

    this.emit(TRANSPORT_EVENT.SHUTDOWN, {transportId: this.transportId});
  }
}

export {
  WebSocketTransport,
  ConnectionState,
  WSMessageType,
};
