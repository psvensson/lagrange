/**
 * RouterConnectionManager - Connection lifecycle management for MessageRouter.
 *
 * Handles WebSocket connection lifecycle including:
 * - Connection establishment and tracking
 * - Connection close handling
 * - Automatic reconnection with exponential backoff
 * - Ping/pong health checks
 *
 * Requirements: 1.2, 1.8
 *
 * @module transport/router-connection-manager
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import WebSocket from 'ws';
import {
  CONNECTION_STATE,
  ROUTER_LOG_MSG,
  ROUTER_ERROR_MSG,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
} from '../constants/transport.js';

const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;

/**
 * RouterConnectionManager handles connection lifecycle for MessageRouter.
 *
 * This class manages:
 * - Connection state tracking
 * - Connection close handling with cleanup
 * - Automatic reconnection with exponential backoff
 * - Ping interval management for connection health
 *
 * @interface
 * @extends EventEmitter
 *
 * @description
 * RouterConnectionManager is responsible for all connection lifecycle operations
 * in the MessageRouter. It emits events when connections change state and handles
 * automatic reconnection for outgoing connections.
 *
 * Key features:
 * - Exponential backoff for reconnection attempts
 * - Configurable ping intervals for health checks
 * - Self-connection detection (no reconnection for self)
 * - Clean resource cleanup on connection close
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.nodeId - Local node ID
 * @param {Object} options.logger - Logger instance
 * @param {Map} options.nodeConnections - Map of node connections
 * @param {number} [options.reconnectIntervalMs] - Base reconnect interval
 * @param {number} [options.reconnectMaxAttempts] - Max reconnection attempts
 * @param {number} [options.reconnectBackoffMultiplier] - Backoff multiplier
 * @param {number} [options.pingIntervalMs] - Ping interval in milliseconds
 * @param {Function} options.sendRaw - Function to send raw messages
 * @param {Function} options.establishConnection - Function to establish connections
 * @param {Function} options.failOutboundQueue - Function to fail outbound queue
 * @param {Function} options.failPendingMessagesForNode - Function to fail pending messages
 *
 * @fires RouterConnectionManager#connectionClosed - When a connection is closed
 * @fires RouterConnectionManager#selfDisconnect - When self-connection is lost
 * @fires RouterConnectionManager#reconnectScheduled - When reconnection is scheduled
 * @fires RouterConnectionManager#reconnectFailed - When reconnection fails
 * @fires RouterConnectionManager#maxReconnectsReached - When max attempts reached
 *
 * @example
 * const connectionManager = new RouterConnectionManager({
 *   nodeId: 'node-1',
 *   logger: loggingService.forSubsystem('message-router'),
 *   nodeConnections: new Map(),
 *   sendRaw: (ws, message) => ws.send(JSON.stringify(message)),
 *   establishConnection: async (info) => { ... },
 *   failOutboundQueue: (nodeId, error) => { ... },
 *   failPendingMessagesForNode: (nodeId, error) => { ... },
 * });
 */
class RouterConnectionManager extends EventEmitter {
  /**
   * Create a new RouterConnectionManager instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.logger - Logger instance.
   * @param {Map} options.nodeConnections - Map of node connections.
   * @param {number} [options.reconnectIntervalMs] - Base reconnect interval.
   * @param {number} [options.reconnectMaxAttempts] - Max reconnection attempts.
   * @param {number} [options.reconnectBackoffMultiplier] - Backoff multiplier.
   * @param {number} [options.pingIntervalMs] - Ping interval in milliseconds.
   * @param {Function} options.sendRaw - Function to send raw messages.
   * @param {Function} options.establishConnection - Function to establish connections.
   * @param {Function} options.failOutboundQueue - Function to fail outbound queue.
   * @param {Function} options.failPendingMessagesForNode - Function to fail pending messages.
   */
  constructor(options) {
    super();

    if (!options.nodeId) {
      throw new Error('RouterConnectionManager requires nodeId');
    }
    if (!options.logger) {
      throw new Error('RouterConnectionManager requires logger');
    }
    if (!options.nodeConnections) {
      throw new Error('RouterConnectionManager requires nodeConnections');
    }
    if (!options.sendRaw) {
      throw new Error('RouterConnectionManager requires sendRaw function');
    }
    if (!options.establishConnection) {
      throw new Error('RouterConnectionManager requires establishConnection function');
    }
    if (!options.failOutboundQueue) {
      throw new Error('RouterConnectionManager requires failOutboundQueue function');
    }
    if (!options.failPendingMessagesForNode) {
      throw new Error('RouterConnectionManager requires failPendingMessagesForNode function');
    }

    this.nodeId = options.nodeId;
    this.logger = options.logger;
    this.nodeConnections = options.nodeConnections;
    this.sendRaw = options.sendRaw;
    this.establishConnection = options.establishConnection;
    this.failOutboundQueue = options.failOutboundQueue;
    this.failPendingMessagesForNode = options.failPendingMessagesForNode;

    // Configuration with defaults
    this.reconnectIntervalMs = options.reconnectIntervalMs ||
      TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS;
    this.reconnectMaxAttempts = options.reconnectMaxAttempts ||
      TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS;
    this.reconnectBackoffMultiplier = options.reconnectBackoffMultiplier ||
      TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER;
    this.pingIntervalMs = options.pingIntervalMs ||
      TRANSPORT_DEFAULT.PING_INTERVAL_MS;

    // State
    this.isShuttingDown = false;
  }

  /**
   * Set the shutdown state.
   * @param {boolean} shuttingDown - Whether the router is shutting down.
   */
  setShuttingDown(shuttingDown) {
    this.isShuttingDown = shuttingDown;
  }

  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   */
  handleConnectionClose(nodeId) {
    const connection = this.nodeConnections.get(nodeId);

    if (connection) {
      this.logger.info(ROUTER_LOG_MSG.CONNECTION_CLOSED, {
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

      const disconnectError = new Error(
        ROUTER_ERROR_MSG.connectionClosed(nodeId),
      );
      this.failOutboundQueue(nodeId, disconnectError);
      this.failPendingMessagesForNode(nodeId, disconnectError);

      this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, {nodeId});

      if (this.isShuttingDown) {
        return;
      }

      // Self-disconnection is fatal - do not attempt reconnection
      if (connection.isSelfConnection) {
        this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_LOST, {
          nodeId,
          connectionId: connection.connectionId,
        });
        this.emit(TRANSPORT_EVENT.SELF_DISCONNECT, {nodeId});
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
   */
  scheduleReconnect(connectionInfo) {
    if (this.isShuttingDown) {
      return;
    }
    if (connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.logger.error(ROUTER_LOG_MSG.MAX_RECONNECTS_REACHED, {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      connectionInfo.state = ConnectionState.CLOSED;
      this.emit('maxReconnectsReached', {
        nodeId: connectionInfo.nodeId,
        attempts: connectionInfo.reconnectAttempts,
      });
      return;
    }

    connectionInfo.state = ConnectionState.RECONNECTING;
    connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE;

    const delay = this.reconnectIntervalMs *
      Math.pow(
        this.reconnectBackoffMultiplier,
        connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE,
      );

    this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    this.emit('reconnectScheduled', {
      nodeId: connectionInfo.nodeId,
      attempt: connectionInfo.reconnectAttempts,
      delayMs: delay,
    });

    connectionInfo.reconnectTimeout = setTimeout(async () => {
      try {
        await this.establishConnection(connectionInfo);
      } catch (error) {
        this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        this.emit('reconnectFailed', {
          nodeId: connectionInfo.nodeId,
          error: error.message,
        });
        // Schedule next reconnect attempt
        this.scheduleReconnect(connectionInfo);
      }
    }, delay);
  }

  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
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
    // Unref to allow process exit when this is the only timer
    connectionInfo.pingInterval.unref();
  }

  /**
   * Stop ping interval for a connection.
   * @param {Object} connectionInfo - Connection information.
   */
  stopPingInterval(connectionInfo) {
    if (connectionInfo.pingInterval) {
      clearInterval(connectionInfo.pingInterval);
      connectionInfo.pingInterval = null;
    }
  }

  /**
   * Cancel scheduled reconnection for a connection.
   * @param {Object} connectionInfo - Connection information.
   */
  cancelReconnect(connectionInfo) {
    if (connectionInfo.reconnectTimeout) {
      clearTimeout(connectionInfo.reconnectTimeout);
      connectionInfo.reconnectTimeout = null;
    }
  }

  /**
   * Clean up all connection resources.
   * @param {Object} connectionInfo - Connection information.
   */
  cleanupConnection(connectionInfo) {
    this.stopPingInterval(connectionInfo);
    this.cancelReconnect(connectionInfo);
  }

  /**
   * Create a new connection info object.
   * @param {string} nodeId - Node ID.
   * @param {string} address - Node address.
   * @param {Object} [options={}] - Additional options.
   * @param {boolean} [options.isSelfConnection=false] - Whether this is a self-connection.
   * @return {Object} Connection info object.
   */
  createConnectionInfo(nodeId, address, options = {}) {
    return {
      connectionId: uuidv4(),
      nodeId,
      address,
      ws: null,
      state: ConnectionState.CONNECTING,
      reconnectAttempts: TRANSPORT_NUM.ZERO,
      isIncoming: false,
      isSelfConnection: options.isSelfConnection || false,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a connection info object for an incoming connection.
   * @param {WebSocket} ws - WebSocket connection.
   * @return {Object} Connection info object.
   */
  createIncomingConnectionInfo(ws) {
    return {
      connectionId: uuidv4(),
      ws,
      state: ConnectionState.CONNECTED,
      nodeId: null,
      isIncoming: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state or null if not connected.
   */
  getConnectionState(nodeId) {
    const connection = this.nodeConnections.get(nodeId);
    return connection ? connection.state : null;
  }

  /**
   * Check if a connection exists and is connected.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if connected.
   */
  isConnected(nodeId) {
    const connection = this.nodeConnections.get(nodeId);
    return connection && connection.state === ConnectionState.CONNECTED;
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
}

export {
  RouterConnectionManager,
  ConnectionState,
  RouterMessageType,
};
