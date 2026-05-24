/**
 * WebSocketTransportProvider - WebSocket implementation of TransportProvider.
 *
 * Refactors existing WebSocket functionality into the transport abstraction layer.
 * Supports connection establishment with identification handshake, message sending
 * with acknowledgment, ping/pong health checks, and reconnection with exponential
 * backoff.
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import WebSocket from 'ws';
import {TransportProvider} from './transport-provider.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TRANSPORT_TYPE} from '../constants/transport-types.js';
import {
  CONNECTION_STATE,
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  WS_MESSAGE_TYPE,
} from '../constants/transport.js';
import {
  LOCAL_STR_STRING,
  WS_PROVIDER_ERROR_MSG,
  WS_PROVIDER_LOCAL_MSG,
  WS_PROVIDER_LOG_MSG,
  WS_PROVIDER_SUBSYSTEM,
} from './websocket-transport-provider-constants.js';

/**
 * WebSocketTransportProvider implements the TransportProvider interface
 * for WebSocket-based communication.
 */
class WebSocketTransportProvider extends TransportProvider {
  /**
   * Create a new WebSocketTransportProvider.
   * @param {Object} options - Configuration options
   * @param {string} [options.localNodeId] - Local node ID for identification
   * @param {string} [options.localAddress] - Local service address
   */
  constructor(options = {}) {
    super();

    this.localNodeId = options.localNodeId || uuidv4();
    this.localAddress = options.localAddress || null;

    // Event emitter for transport events
    this.events = new EventEmitter();

    // Active connections (connectionId -> connection info)
    this.connections = new Map();

    // Pending messages awaiting acknowledgment (messageId -> pending info)
    this.pendingMessages = new Map();

    // Configuration from ConfigurationManager
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

    // Logging
    this.logger = LoggingService.getInstance().forSubsystem(WS_PROVIDER_SUBSYSTEM);

    // State
    this.available = true;
    this.isShuttingDown = false;
  }

  /**
   * Get the transport type identifier.
   * @return {string} Transport type ('ws')
   */
  getType() {
    return TRANSPORT_TYPE.WEBSOCKET;
  }

  /**
   * Check if this transport is currently available.
   * @return {boolean} True if transport can accept connections
   */
  isAvailable() {
    return this.available && !this.isShuttingDown;
  }

  /**
   * Connect to a remote endpoint.
   * @param {Object} endpoint - Endpoint record from node_endpoints table
   * @param {string} endpoint.endpoint_id - Unique identifier for the endpoint
   * @param {string} endpoint.node_id - Target node ID
   * @param {string} endpoint.transport_type - Transport type (must be 'ws')
   * @param {string} endpoint.address - WebSocket address (e.g., ws://host:port)
   * @param {number} endpoint.priority - Endpoint priority
   * @param {Object|string} endpoint.metadata - Transport-specific configuration
   * @param {string} endpoint.status - Endpoint status
   * @return {Promise<Object>} Connection object with connection details
   * @throws {Error} If connection fails
   */
  async connect(endpoint) {
    if (!this.isAvailable()) {
      const error = this.createTransportError(
        WS_PROVIDER_ERROR_MSG.PROVIDER_UNAVAILABLE,
        WS_PROVIDER_LOG_MSG.PROVIDER_UNAVAILABLE,
        endpoint,
      );
      throw error;
    }

    const connectionId = uuidv4();
    const address = endpoint.address;

    this.logger.debug(WS_PROVIDER_LOG_MSG.CONNECTING, {
      connectionId,
      nodeId: endpoint.node_id,
      address,
    });

    const connectionInfo = {
      connectionId,
      nodeId: endpoint.node_id,
      endpointId: endpoint.endpoint_id,
      address,
      ws: null,
      state: CONNECTION_STATE.CONNECTING,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastPingTime: null,
      lastPongTime: null,
      latency: null,
      pingInterval: null,
      metadata: this.parseMetadata(endpoint.metadata),
    };

    this.connections.set(connectionId, connectionInfo);

    await this.establishConnection(connectionInfo);

    return {
      connectionId,
      nodeId: endpoint.node_id,
      endpointId: endpoint.endpoint_id,
      transportType: this.getType(),
      state: connectionInfo.state,
      createdAt: connectionInfo.createdAt,
    };
  }

  /**
   * Establish WebSocket connection to endpoint.
   * @param {Object} connectionInfo - Connection information
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    return new Promise((resolve, reject) => {
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const ws = new WebSocket(connectionInfo.address);

      // Set connection timeout
      timeoutId = setTimeout(() => {
        cleanup();
        ws.terminate();
        connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
        const error = this.createTransportError(
          WS_PROVIDER_ERROR_MSG.CONNECTION_TIMEOUT,
          'Connection timeout',
          {address: connectionInfo.address},
        );
        reject(error);
      }, this.messageTimeoutMs);

      ws.on(TRANSPORT_EVENT.OPEN, () => {
        cleanup();
        connectionInfo.ws = ws;
        connectionInfo.state = CONNECTION_STATE.CONNECTED;
        connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
        connectionInfo.lastActivity = Date.now();

        this.logger.info(WS_PROVIDER_LOG_MSG.CONNECTED, {
          connectionId: connectionInfo.connectionId,
          nodeId: connectionInfo.nodeId,
          address: connectionInfo.address,
        });

        // Send identification message
        this.sendIdentification(connectionInfo);

        // Start ping interval
        this.startPingInterval(connectionInfo);

        this.events.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {
          connectionId: connectionInfo.connectionId,
          nodeId: connectionInfo.nodeId,
        });

        resolve();
      });

      ws.on(TRANSPORT_EVENT.MESSAGE, (data) => {
        this.handleMessage(connectionInfo, data);
      });

      ws.on(TRANSPORT_EVENT.CLOSE, () => {
        cleanup();
        this.handleConnectionClose(connectionInfo);
      });

      ws.on(TRANSPORT_EVENT.ERROR, (error) => {
        this.logger.error(WS_PROVIDER_LOG_MSG.CONNECTION_FAILED, {
          connectionId: connectionInfo.connectionId,
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });

        if (connectionInfo.state === CONNECTION_STATE.CONNECTING) {
          cleanup();
          connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
          const transportError = this.createTransportError(
            WS_PROVIDER_ERROR_MSG.CONNECTION_FAILED,
            WS_PROVIDER_ERROR_MSG.connectionFailed(
              connectionInfo.address,
              error.message,
            ),
            {address: connectionInfo.address},
            error,
          );
          reject(transportError);
        }
      });
    });
  }

  /**
   * Send identification message to peer.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  sendIdentification(connectionInfo) {
    const message = {
      type: WS_MESSAGE_TYPE.IDENTIFY,
      nodeId: this.localNodeId,
      address: this.localAddress,
      timestamp: Date.now(),
    };

    this.sendRaw(connectionInfo.ws, message);

    this.logger.debug(WS_PROVIDER_LOG_MSG.IDENTIFICATION_SENT, {
      connectionId: connectionInfo.connectionId,
      nodeId: this.localNodeId,
    });
  }

  /**
   * Handle incoming message.
   * @param {Object} connectionInfo - Connection information
   * @param {Buffer|string} data - Message data
   * @private
   */
  handleMessage(connectionInfo, data) {
    connectionInfo.lastActivity = Date.now();

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      this.logger.error(WS_PROVIDER_LOCAL_MSG.FAILED_TO_PARSE_MESSAGE, {
        connectionId: connectionInfo.connectionId,
        error: error.message,
      });
      throw error;
    }

    this.logger.debug(WS_PROVIDER_LOG_MSG.MESSAGE_RECEIVED, {
      connectionId: connectionInfo.connectionId,
      type: message.type,
      messageId: message.messageId,
    });

    // Handle identification
    if (message.type === WS_MESSAGE_TYPE.IDENTIFY) {
      this.handleIdentification(connectionInfo, message);
      return;
    }

    // Handle ping
    if (message.type === WS_MESSAGE_TYPE.PING) {
      this.sendRaw(connectionInfo.ws, {
        type: WS_MESSAGE_TYPE.PONG,
        timestamp: Date.now(),
      });
      return;
    }

    // Handle pong
    if (message.type === WS_MESSAGE_TYPE.PONG) {
      connectionInfo.lastPongTime = Date.now();
      if (connectionInfo.lastPingTime) {
        connectionInfo.latency = connectionInfo.lastPongTime -
          connectionInfo.lastPingTime;
      }
      this.logger.debug(WS_PROVIDER_LOG_MSG.PONG_RECEIVED, {
        connectionId: connectionInfo.connectionId,
        latency: connectionInfo.latency,
      });
      return;
    }

    // Handle acknowledgment
    if (message.type === WS_MESSAGE_TYPE.ACK) {
      this.handleAcknowledgment(message);
      return;
    }

    // Emit message event for other message types
    this.events.emit(TRANSPORT_EVENT.MESSAGE, {
      connectionId: connectionInfo.connectionId,
      nodeId: connectionInfo.nodeId,
      message,
    });
  }

  /**
   * Handle identification message from peer.
   * @param {Object} connectionInfo - Connection information
   * @param {Object} message - Identification message
   * @private
   */
  handleIdentification(connectionInfo, message) {
    this.logger.debug(WS_PROVIDER_LOG_MSG.IDENTIFICATION_RECEIVED, {
      connectionId: connectionInfo.connectionId,
      remoteNodeId: message.nodeId,
    });

    this.events.emit(TRANSPORT_EVENT.PEER_IDENTIFIED, {
      connectionId: connectionInfo.connectionId,
      nodeId: message.nodeId,
    });
  }

  /**
   * Handle acknowledgment message.
   * @param {Object} message - Acknowledgment message
   * @private
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;

    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);

      if (acknowledged) {
        pending.resolve({
          success: true,
          messageId,
          acknowledged: true,
          latency: Date.now() - pending.sentAt,
          ...rest,
        });
      } else {
        pending.reject(new Error(
          error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED,
        ));
      }
    }
  }

  /**
   * Handle connection close.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  handleConnectionClose(connectionInfo) {
    this.logger.info(WS_PROVIDER_LOG_MSG.DISCONNECTED, {
      connectionId: connectionInfo.connectionId,
      nodeId: connectionInfo.nodeId,
    });

    connectionInfo.state = CONNECTION_STATE.DISCONNECTED;
    connectionInfo.ws = null;

    // Stop ping interval
    if (connectionInfo.pingInterval) {
      clearInterval(connectionInfo.pingInterval);
      connectionInfo.pingInterval = null;
    }

    this.events.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {
      connectionId: connectionInfo.connectionId,
      nodeId: connectionInfo.nodeId,
    });

    // Schedule reconnection if not shutting down
    if (!this.isShuttingDown) {
      this.scheduleReconnect(connectionInfo);
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error(WS_PROVIDER_LOG_MSG.MAX_RECONNECTS_REACHED, {
        connectionId: connectionInfo.connectionId,
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = CONNECTION_STATE.CLOSED;
      return;
    }

    connectionInfo.state = CONNECTION_STATE.RECONNECTING;
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;

    const delay = this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );

    this.logger.debug(WS_PROVIDER_LOG_MSG.RECONNECTING, {
      connectionId: connectionInfo.connectionId,
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(WS_PROVIDER_LOG_MSG.RECONNECT_FAILED, {
          connectionId: connectionInfo.connectionId,
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        throw error;
      }
    }, delay);
  }

  /**
   * Start ping interval for connection health monitoring.
   * @param {Object} connectionInfo - Connection information
   * @private
   */
  startPingInterval(connectionInfo) {
    connectionInfo.pingInterval = setInterval(() => {
      if (connectionInfo.ws &&
          connectionInfo.ws.readyState === WebSocket.OPEN) {
        connectionInfo.lastPingTime = Date.now();
        this.sendRaw(connectionInfo.ws, {
          type: WS_MESSAGE_TYPE.PING,
          timestamp: connectionInfo.lastPingTime,
        });
        this.logger.debug(WS_PROVIDER_LOG_MSG.PING_SENT, {
          connectionId: connectionInfo.connectionId,
        });
      }
    }, this.pingIntervalMs);
    connectionInfo.pingInterval.unref();
  }

  /**
   * Send a message through an established connection.
   * @param {Object} connection - Active connection object from connect()
   * @param {Object} message - Message to send
   * @return {Promise<Object>} Delivery result with acknowledgment status
   * @throws {Error} If send fails
   */
  async send(connection, message) {
    const connectionInfo = this.connections.get(connection.connectionId);

    if (!connectionInfo ||
        connectionInfo.state !== CONNECTION_STATE.CONNECTED) {
      return {
        success: false,
        error: WS_PROVIDER_ERROR_MSG.CONNECTION_CLOSED,
      };
    }

    const messageId = message.messageId || uuidv4();
    const sentAt = Date.now();

    this.logger.debug(WS_PROVIDER_LOG_MSG.SENDING_MESSAGE, {
      connectionId: connection.connectionId,
      messageId,
    });

    return new Promise((resolve, reject) => {
      const wsMessage = {
        type: WS_MESSAGE_TYPE.SERVICE_MESSAGE,
        messageId,
        sourceNodeId: this.localNodeId,
        sourceAddress: this.localAddress,
        ...message,
        timestamp: sentAt,
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        resolve({
          success: false,
          messageId,
          error: WS_PROVIDER_ERROR_MSG.MESSAGE_TIMEOUT,
        });
      }, this.messageTimeoutMs);

      // Track pending message
      this.pendingMessages.set(messageId, {
        messageId,
        resolve,
        reject,
        timeout,
        sentAt,
      });

      // Send message
      this.sendRaw(connectionInfo.ws, wsMessage);

      connectionInfo.lastActivity = Date.now();

      this.logger.debug(WS_PROVIDER_LOG_MSG.MESSAGE_SENT, {
        connectionId: connection.connectionId,
        messageId,
      });
    });
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   * @private
   */
  sendRaw(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Close a connection.
   * @param {Object} connection - Connection to close
   * @return {Promise<void>}
   */
  async disconnect(connection) {
    const connectionInfo = this.connections.get(connection.connectionId);

    if (!connectionInfo) {
      return;
    }

    this.logger.debug(WS_PROVIDER_LOG_MSG.DISCONNECTING, {
      connectionId: connection.connectionId,
      nodeId: connectionInfo.nodeId,
    });

    // Stop ping interval
    if (connectionInfo.pingInterval) {
      clearInterval(connectionInfo.pingInterval);
      connectionInfo.pingInterval = null;
    }

    // Close WebSocket - use terminate() for immediate cleanup
    if (connectionInfo.ws) {
      connectionInfo.ws.terminate();
      connectionInfo.ws = null;
    }

    connectionInfo.state = CONNECTION_STATE.CLOSED;
    this.connections.delete(connection.connectionId);

    this.logger.info(WS_PROVIDER_LOG_MSG.DISCONNECTED, {
      connectionId: connection.connectionId,
      nodeId: connectionInfo.nodeId,
    });
  }

  /**
   * Get health status of a connection.
   * @param {Object} connection - Connection to check
   * @return {Object} Health status with latency, state, lastActivity
   */
  getHealthStatus(connection) {
    const connectionInfo = this.connections.get(connection.connectionId);

    if (!connectionInfo) {
      return {
        state: CONNECTION_STATE.CLOSED,
        latency: null,
        lastActivity: null,
        healthy: false,
      };
    }

    const now = Date.now();
    const isConnected = connectionInfo.state === CONNECTION_STATE.CONNECTED;
    const isWebSocketOpen = connectionInfo.ws &&
      connectionInfo.ws.readyState === WebSocket.OPEN;
    const isRecentActivity = connectionInfo.lastActivity &&
      (now - connectionInfo.lastActivity) < (this.pingIntervalMs * TRANSPORT_NUM.TWO);

    this.logger.debug(WS_PROVIDER_LOG_MSG.HEALTH_CHECK, {
      connectionId: connection.connectionId,
      state: connectionInfo.state,
      latency: connectionInfo.latency,
      healthy: isConnected && isWebSocketOpen,
    });

    return {
      state: connectionInfo.state,
      latency: connectionInfo.latency,
      lastActivity: connectionInfo.lastActivity,
      lastPingTime: connectionInfo.lastPingTime,
      lastPongTime: connectionInfo.lastPongTime,
      healthy: isConnected && isWebSocketOpen && isRecentActivity,
    };
  }

  /**
   * Shutdown the transport provider.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(WS_PROVIDER_LOG_MSG.SHUTDOWN_STARTED, {
      connectionCount: this.connections.size,
    });

    this.isShuttingDown = true;
    this.available = false;

    // Close all connections
    for (const [connectionId, connectionInfo] of this.connections) {
      // Stop ping interval
      if (connectionInfo.pingInterval) {
        clearInterval(connectionInfo.pingInterval);
        connectionInfo.pingInterval = null;
      }

      // Close WebSocket - use terminate() for immediate cleanup
      if (connectionInfo.ws) {
        connectionInfo.ws.terminate();
        connectionInfo.ws = null;
      }

      connectionInfo.state = CONNECTION_STATE.CLOSED;

      this.logger.debug(WS_PROVIDER_LOG_MSG.DISCONNECTED, {
        connectionId,
        nodeId: connectionInfo.nodeId,
      });
    }

    // Clear pending messages
    for (const [messageId, pending] of this.pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(WS_PROVIDER_LOCAL_MSG.PROVIDER_SHUTDOWN));
      this.logger.debug(WS_PROVIDER_LOCAL_MSG.PENDING_MESSAGE_CANCELLED, {
        messageId,
      });
    }

    this.connections.clear();
    this.pendingMessages.clear();

    this.events.emit(TRANSPORT_EVENT.SHUTDOWN, {
      transportType: this.getType(),
    });

    this.logger.info(WS_PROVIDER_LOG_MSG.SHUTDOWN_COMPLETE);
  }

  /**
   * Create a standardized transport error.
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} endpoint - Endpoint that was attempted
   * @param {Error} [cause] - Original error if available
   * @return {Error} Standardized transport error
   * @private
   */
  createTransportError(code, message, endpoint, cause = null) {
    const error = new Error(message);
    error.code = code;
    error.transportType = this.getType();
    error.endpoint = endpoint;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  /**
   * Parse endpoint metadata.
   * @param {Object|string} metadata - Metadata to parse
   * @return {Object} Parsed metadata object
   * @private
   */
  parseMetadata(metadata) {
    if (!metadata) {
      return {};
    }
    if (typeof metadata === LOCAL_STR_STRING) {
      try {
        return JSON.parse(metadata);
      } catch (_error) {
        return {};
      }
    }
    return metadata;
  }

  /**
   * Get the event emitter for subscribing to transport events.
   * @return {EventEmitter} Event emitter
   */
  getEventEmitter() {
    return this.events;
  }

  /**
   * Get the number of active connections.
   * @return {number} Number of connections
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Set the local node ID for identification.
   * @param {string} nodeId - Local node ID
   */
  setLocalNodeId(nodeId) {
    this.localNodeId = nodeId;
  }

  /**
   * Set the local address for identification.
   * @param {string} address - Local address
   */
  setLocalAddress(address) {
    this.localAddress = address;
  }
}

export {
  WebSocketTransportProvider,
  WS_PROVIDER_SUBSYSTEM,
  WS_PROVIDER_LOG_MSG,
  WS_PROVIDER_ERROR_MSG,
};
