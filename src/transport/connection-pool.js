/**
 * ConnectionPool - Manages active connections with TTL-based lifecycle.
 *
 * Connections are cached here (not endpoint information). The pool provides
 * on-demand connection management with automatic cleanup of idle connections.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.7
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {COLUMN} from '../constants/index.js';
import {
  CONNECTION_STATE,
  TRANSPORT_DEFAULT,
} from '../constants/transport.js';


/**
 * Subsystem name for logging.
 */
const POOL_SUBSYSTEM = 'connection-pool';

/**
 * Log messages for ConnectionPool.
 */
const POOL_LOG_MSG = Object.freeze({
  GETTING_CONNECTION: 'Getting connection for node',
  CONNECTION_REUSED: 'Reusing existing connection',
  CONNECTION_CREATED: 'Created new connection',
  CONNECTION_RELEASED: 'Connection released, TTL reset',
  CONNECTION_CLOSED: 'Connection closed',
  CONNECTION_NOT_FOUND: 'Connection not found for node',
  CLOSING_IDLE_CONNECTIONS: 'Closing idle connections',
  IDLE_CONNECTION_CLOSED: 'Idle connection closed (TTL expired)',
  CLEANUP_COMPLETE: 'Idle connection cleanup complete',
  SHUTDOWN_STARTED: 'Connection pool shutdown started',
  SHUTDOWN_COMPLETE: 'Connection pool shutdown complete',
  CLEANUP_INTERVAL_STARTED: 'Cleanup interval started',
  CLEANUP_INTERVAL_STOPPED: 'Cleanup interval stopped',
});

/**
 * Error messages for ConnectionPool.
 */
const POOL_ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'Node ID is required',
  ENDPOINT_REQUIRED: 'Endpoint is required',
  PROVIDER_REQUIRED: 'Provider is required',
  CONNECTION_FAILED: 'Failed to establish connection',
  connectionFailed: (nodeId, message) =>
    `Failed to connect to node ${nodeId}: ${message}`,
});

/**
 * ConnectionPool manages active connections with TTL lifecycle.
 * Connections are cached here (not endpoint information).
 */
class ConnectionPool {
  /**
   * Create a new ConnectionPool instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.ttlMs] - Connection TTL in milliseconds
   * @param {number} [options.cleanupIntervalMs] - Cleanup interval in milliseconds
   */
  constructor(options = {}) {
    const config = ConfigurationManager.getInstance();

    this.ttlMs = options.ttlMs ??
      config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_TTL_MS) ??
      TRANSPORT_DEFAULT.CONNECTION_POOL_TTL_MS;

    this.cleanupIntervalMs = options.cleanupIntervalMs ??
      config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS) ??
      TRANSPORT_DEFAULT.CONNECTION_POOL_CLEANUP_INTERVAL_MS;

    this.connections = new Map();
    this.logger = LoggingService.getInstance().forSubsystem(POOL_SUBSYSTEM);
    this.cleanupIntervalId = null;
    this.isShuttingDown = false;
  }

  /**
   * Start the cleanup interval for idle connections.
   */
  startCleanupInterval() {
    if (this.cleanupIntervalId) {
      return;
    }

    this.cleanupIntervalId = setInterval(() => {
      this.closeIdleConnections();
    }, this.cleanupIntervalMs);
    this.cleanupIntervalId.unref();

    this.logger.debug(POOL_LOG_MSG.CLEANUP_INTERVAL_STARTED, {
      intervalMs: this.cleanupIntervalMs,
    });
  }

  /**
   * Stop the cleanup interval.
   */
  stopCleanupInterval() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      this.logger.debug(POOL_LOG_MSG.CLEANUP_INTERVAL_STOPPED);
    }
  }

  /**
   * Get or create a connection to a node via specific endpoint.
   *
   * If a connection already exists for the node, it is returned and its TTL
   * is reset. Otherwise, a new connection is established using the provider.
   *
   * @param {string} nodeId - Target node ID
   * @param {Object} endpoint - Endpoint to connect to
   * @param {Object} provider - TransportProvider to use for connection
   * @return {Promise<Object>} Active connection object
   * @throws {Error} If nodeId, endpoint, or provider is not provided
   * @throws {Error} If connection fails
   */
  async getConnection(nodeId, endpoint, provider) {
    if (!nodeId) {
      throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
    }
    if (!endpoint) {
      throw new Error(POOL_ERROR_MSG.ENDPOINT_REQUIRED);
    }
    if (!provider) {
      throw new Error(POOL_ERROR_MSG.PROVIDER_REQUIRED);
    }

    this.logger.debug(POOL_LOG_MSG.GETTING_CONNECTION, {nodeId});

    // Check for existing connection
    const existing = this.connections.get(nodeId);
    if (existing && existing.state === CONNECTION_STATE.CONNECTED) {
      // Reset TTL on reuse
      this.resetTtl(existing);
      this.logger.debug(POOL_LOG_MSG.CONNECTION_REUSED, {
        nodeId,
        connectionId: existing.connectionId,
      });
      return existing;
    }

    // Establish new connection
    const now = Date.now();
    const connectionId = uuidv4();

    const connectionEntry = {
      connectionId,
      nodeId,
      endpointId: endpoint[COLUMN.ENDPOINT_ID],
      transportType: endpoint[COLUMN.TRANSPORT_TYPE],
      state: CONNECTION_STATE.CONNECTING,
      createdAt: now,
      lastActivity: now,
      ttlExpiresAt: now + this.ttlMs,
      providerConnection: null,
    };

    this.connections.set(nodeId, connectionEntry);

    const providerConnection = await provider.connect(endpoint);

    connectionEntry.providerConnection = providerConnection;
    connectionEntry.state = CONNECTION_STATE.CONNECTED;
    connectionEntry.lastActivity = Date.now();
    this.resetTtl(connectionEntry);

    this.logger.info(POOL_LOG_MSG.CONNECTION_CREATED, {
      nodeId,
      connectionId,
      endpointId: endpoint[COLUMN.ENDPOINT_ID],
      transportType: endpoint[COLUMN.TRANSPORT_TYPE],
    });

    return connectionEntry;
  }

  /**
   * Release a connection (reset TTL timer).
   *
   * This should be called after a message is sent through the connection
   * to indicate the connection is still in use.
   *
   * @param {string} nodeId - Node ID
   */
  releaseConnection(nodeId) {
    if (!nodeId) {
      throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
    }

    const connection = this.connections.get(nodeId);
    if (!connection) {
      this.logger.debug(POOL_LOG_MSG.CONNECTION_NOT_FOUND, {nodeId});
      return;
    }

    this.resetTtl(connection);
    this.logger.debug(POOL_LOG_MSG.CONNECTION_RELEASED, {
      nodeId,
      connectionId: connection.connectionId,
      ttlExpiresAt: connection.ttlExpiresAt,
    });
  }

  /**
   * Close a specific connection.
   *
   * @param {string} nodeId - Node ID
   * @param {Object} [provider] - TransportProvider to use for disconnection
   * @return {Promise<boolean>} True if connection was closed, false if not found
   */
  async closeConnection(nodeId, provider) {
    if (!nodeId) {
      throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
    }

    const connection = this.connections.get(nodeId);
    if (!connection) {
      this.logger.debug(POOL_LOG_MSG.CONNECTION_NOT_FOUND, {nodeId});
      return false;
    }

    // Disconnect via provider if available
    if (provider && connection.providerConnection) {
      await provider.disconnect(connection.providerConnection);
    }

    connection.state = CONNECTION_STATE.CLOSED;
    this.connections.delete(nodeId);

    this.logger.info(POOL_LOG_MSG.CONNECTION_CLOSED, {
      nodeId,
      connectionId: connection.connectionId,
    });

    return true;
  }

  /**
   * Close all idle connections that exceeded TTL.
   *
   * @return {Promise<number>} Number of connections closed
   */
  async closeIdleConnections() {
    if (this.isShuttingDown) {
      return 0;
    }

    this.logger.debug(POOL_LOG_MSG.CLOSING_IDLE_CONNECTIONS);

    const now = Date.now();
    const expiredNodeIds = [];

    for (const [nodeId, connection] of this.connections) {
      if (connection.ttlExpiresAt <= now) {
        expiredNodeIds.push(nodeId);
      }
    }

    let closedCount = 0;
    for (const nodeId of expiredNodeIds) {
      const connection = this.connections.get(nodeId);
      if (connection) {
        connection.state = CONNECTION_STATE.CLOSED;
        this.connections.delete(nodeId);
        closedCount++;

        this.logger.info(POOL_LOG_MSG.IDLE_CONNECTION_CLOSED, {
          nodeId,
          connectionId: connection.connectionId,
          idleMs: now - connection.lastActivity,
        });
      }
    }

    this.logger.debug(POOL_LOG_MSG.CLEANUP_COMPLETE, {
      closedCount,
      remainingConnections: this.connections.size,
    });

    return closedCount;
  }

  /**
   * Shutdown all connections.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(POOL_LOG_MSG.SHUTDOWN_STARTED, {
      connectionCount: this.connections.size,
    });

    this.isShuttingDown = true;
    this.stopCleanupInterval();

    // Close all connections
    for (const [nodeId, connection] of this.connections) {
      connection.state = CONNECTION_STATE.CLOSED;
      this.logger.debug(POOL_LOG_MSG.CONNECTION_CLOSED, {
        nodeId,
        connectionId: connection.connectionId,
      });
    }

    this.connections.clear();

    this.logger.info(POOL_LOG_MSG.SHUTDOWN_COMPLETE);
  }

  /**
   * Reset the TTL for a connection.
   *
   * @param {Object} connection - Connection entry to reset TTL for
   * @private
   */
  resetTtl(connection) {
    const now = Date.now();
    connection.lastActivity = now;
    connection.ttlExpiresAt = now + this.ttlMs;
  }

  /**
   * Get the number of active connections.
   *
   * @return {number} Number of connections in the pool
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Check if a connection exists for a node.
   *
   * @param {string} nodeId - Node ID to check
   * @return {boolean} True if connection exists
   */
  hasConnection(nodeId) {
    return this.connections.has(nodeId);
  }

  /**
   * Get connection info for a node (without the provider connection).
   *
   * @param {string} nodeId - Node ID
   * @return {Object|null} Connection info or null if not found
   */
  getConnectionInfo(nodeId) {
    const connection = this.connections.get(nodeId);
    if (!connection) {
      return null;
    }

    // Return a copy without the provider connection
    return {
      connectionId: connection.connectionId,
      nodeId: connection.nodeId,
      endpointId: connection.endpointId,
      transportType: connection.transportType,
      state: connection.state,
      createdAt: connection.createdAt,
      lastActivity: connection.lastActivity,
      ttlExpiresAt: connection.ttlExpiresAt,
    };
  }

  /**
   * Get the configured TTL in milliseconds.
   *
   * @return {number} TTL in milliseconds
   */
  getTtlMs() {
    return this.ttlMs;
  }
}

export {
  ConnectionPool,
  POOL_SUBSYSTEM,
  POOL_LOG_MSG,
  POOL_ERROR_MSG,
};
