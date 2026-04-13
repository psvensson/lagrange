/**
 * ConnectionPool - Manages active connections with TTL-based lifecycle.
 *
 * Connections are cached here (not endpoint information). The pool provides
 * on-demand connection management with automatic cleanup of idle connections.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.7
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { COLUMN } from '../constants/index.js';
import { CONNECTION_STATE, TRANSPORT_DEFAULT } from '../constants/transport.js';

/**
 * Subsystem name for logging.
 */
const POOL_SUBSYSTEM = stryMutAct_9fa48("155065") ? "" : (stryCov_9fa48("155065"), 'connection-pool');

/**
 * Log messages for ConnectionPool.
 */
const POOL_LOG_MSG = Object.freeze(stryMutAct_9fa48("155066") ? {} : (stryCov_9fa48("155066"), {
  GETTING_CONNECTION: stryMutAct_9fa48("155067") ? "" : (stryCov_9fa48("155067"), 'Getting connection for node'),
  CONNECTION_REUSED: stryMutAct_9fa48("155068") ? "" : (stryCov_9fa48("155068"), 'Reusing existing connection'),
  CONNECTION_CREATED: stryMutAct_9fa48("155069") ? "" : (stryCov_9fa48("155069"), 'Created new connection'),
  CONNECTION_RELEASED: stryMutAct_9fa48("155070") ? "" : (stryCov_9fa48("155070"), 'Connection released, TTL reset'),
  CONNECTION_CLOSED: stryMutAct_9fa48("155071") ? "" : (stryCov_9fa48("155071"), 'Connection closed'),
  CONNECTION_NOT_FOUND: stryMutAct_9fa48("155072") ? "" : (stryCov_9fa48("155072"), 'Connection not found for node'),
  CLOSING_IDLE_CONNECTIONS: stryMutAct_9fa48("155073") ? "" : (stryCov_9fa48("155073"), 'Closing idle connections'),
  IDLE_CONNECTION_CLOSED: stryMutAct_9fa48("155074") ? "" : (stryCov_9fa48("155074"), 'Idle connection closed (TTL expired)'),
  CLEANUP_COMPLETE: stryMutAct_9fa48("155075") ? "" : (stryCov_9fa48("155075"), 'Idle connection cleanup complete'),
  SHUTDOWN_STARTED: stryMutAct_9fa48("155076") ? "" : (stryCov_9fa48("155076"), 'Connection pool shutdown started'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("155077") ? "" : (stryCov_9fa48("155077"), 'Connection pool shutdown complete'),
  CLEANUP_INTERVAL_STARTED: stryMutAct_9fa48("155078") ? "" : (stryCov_9fa48("155078"), 'Cleanup interval started'),
  CLEANUP_INTERVAL_STOPPED: stryMutAct_9fa48("155079") ? "" : (stryCov_9fa48("155079"), 'Cleanup interval stopped')
}));

/**
 * Error messages for ConnectionPool.
 */
const POOL_ERROR_MSG = Object.freeze(stryMutAct_9fa48("155080") ? {} : (stryCov_9fa48("155080"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("155081") ? "" : (stryCov_9fa48("155081"), 'Node ID is required'),
  ENDPOINT_REQUIRED: stryMutAct_9fa48("155082") ? "" : (stryCov_9fa48("155082"), 'Endpoint is required'),
  PROVIDER_REQUIRED: stryMutAct_9fa48("155083") ? "" : (stryCov_9fa48("155083"), 'Provider is required'),
  CONNECTION_FAILED: stryMutAct_9fa48("155084") ? "" : (stryCov_9fa48("155084"), 'Failed to establish connection'),
  connectionFailed: stryMutAct_9fa48("155085") ? () => undefined : (stryCov_9fa48("155085"), (nodeId, message) => stryMutAct_9fa48("155086") ? `` : (stryCov_9fa48("155086"), `Failed to connect to node ${nodeId}: ${message}`))
}));

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
    if (stryMutAct_9fa48("155087")) {
      {}
    } else {
      stryCov_9fa48("155087");
      const config = ConfigurationManager.getInstance();
      this.ttlMs = stryMutAct_9fa48("155088") ? (options.ttlMs ?? config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_TTL_MS)) && TRANSPORT_DEFAULT.CONNECTION_POOL_TTL_MS : (stryCov_9fa48("155088"), (stryMutAct_9fa48("155089") ? options.ttlMs && config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_TTL_MS) : (stryCov_9fa48("155089"), options.ttlMs ?? config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_TTL_MS))) ?? TRANSPORT_DEFAULT.CONNECTION_POOL_TTL_MS);
      this.cleanupIntervalMs = stryMutAct_9fa48("155090") ? (options.cleanupIntervalMs ?? config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS)) && TRANSPORT_DEFAULT.CONNECTION_POOL_CLEANUP_INTERVAL_MS : (stryCov_9fa48("155090"), (stryMutAct_9fa48("155091") ? options.cleanupIntervalMs && config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS) : (stryCov_9fa48("155091"), options.cleanupIntervalMs ?? config.get(CONFIG_KEY.TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS))) ?? TRANSPORT_DEFAULT.CONNECTION_POOL_CLEANUP_INTERVAL_MS);
      this.connections = new Map();
      this.logger = LoggingService.getInstance().forSubsystem(POOL_SUBSYSTEM);
      this.cleanupIntervalId = null;
      this.isShuttingDown = stryMutAct_9fa48("155092") ? true : (stryCov_9fa48("155092"), false);
    }
  }

  /**
   * Start the cleanup interval for idle connections.
   */
  startCleanupInterval() {
    if (stryMutAct_9fa48("155093")) {
      {}
    } else {
      stryCov_9fa48("155093");
      if (stryMutAct_9fa48("155095") ? false : stryMutAct_9fa48("155094") ? true : (stryCov_9fa48("155094", "155095"), this.cleanupIntervalId)) {
        if (stryMutAct_9fa48("155096")) {
          {}
        } else {
          stryCov_9fa48("155096");
          return;
        }
      }
      this.cleanupIntervalId = setInterval(() => {
        if (stryMutAct_9fa48("155097")) {
          {}
        } else {
          stryCov_9fa48("155097");
          this.closeIdleConnections();
        }
      }, this.cleanupIntervalMs);
      this.cleanupIntervalId.unref();
      this.logger.debug(POOL_LOG_MSG.CLEANUP_INTERVAL_STARTED, stryMutAct_9fa48("155098") ? {} : (stryCov_9fa48("155098"), {
        intervalMs: this.cleanupIntervalMs
      }));
    }
  }

  /**
   * Stop the cleanup interval.
   */
  stopCleanupInterval() {
    if (stryMutAct_9fa48("155099")) {
      {}
    } else {
      stryCov_9fa48("155099");
      if (stryMutAct_9fa48("155101") ? false : stryMutAct_9fa48("155100") ? true : (stryCov_9fa48("155100", "155101"), this.cleanupIntervalId)) {
        if (stryMutAct_9fa48("155102")) {
          {}
        } else {
          stryCov_9fa48("155102");
          clearInterval(this.cleanupIntervalId);
          this.cleanupIntervalId = null;
          this.logger.debug(POOL_LOG_MSG.CLEANUP_INTERVAL_STOPPED);
        }
      }
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
    if (stryMutAct_9fa48("155103")) {
      {}
    } else {
      stryCov_9fa48("155103");
      if (stryMutAct_9fa48("155106") ? false : stryMutAct_9fa48("155105") ? true : stryMutAct_9fa48("155104") ? nodeId : (stryCov_9fa48("155104", "155105", "155106"), !nodeId)) {
        if (stryMutAct_9fa48("155107")) {
          {}
        } else {
          stryCov_9fa48("155107");
          throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("155110") ? false : stryMutAct_9fa48("155109") ? true : stryMutAct_9fa48("155108") ? endpoint : (stryCov_9fa48("155108", "155109", "155110"), !endpoint)) {
        if (stryMutAct_9fa48("155111")) {
          {}
        } else {
          stryCov_9fa48("155111");
          throw new Error(POOL_ERROR_MSG.ENDPOINT_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("155114") ? false : stryMutAct_9fa48("155113") ? true : stryMutAct_9fa48("155112") ? provider : (stryCov_9fa48("155112", "155113", "155114"), !provider)) {
        if (stryMutAct_9fa48("155115")) {
          {}
        } else {
          stryCov_9fa48("155115");
          throw new Error(POOL_ERROR_MSG.PROVIDER_REQUIRED);
        }
      }
      this.logger.debug(POOL_LOG_MSG.GETTING_CONNECTION, stryMutAct_9fa48("155116") ? {} : (stryCov_9fa48("155116"), {
        nodeId
      }));

      // Check for existing connection
      const existing = this.connections.get(nodeId);
      if (stryMutAct_9fa48("155119") ? existing || existing.state === CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("155118") ? false : stryMutAct_9fa48("155117") ? true : (stryCov_9fa48("155117", "155118", "155119"), existing && (stryMutAct_9fa48("155121") ? existing.state !== CONNECTION_STATE.CONNECTED : stryMutAct_9fa48("155120") ? true : (stryCov_9fa48("155120", "155121"), existing.state === CONNECTION_STATE.CONNECTED)))) {
        if (stryMutAct_9fa48("155122")) {
          {}
        } else {
          stryCov_9fa48("155122");
          // Reset TTL on reuse
          this.resetTtl(existing);
          this.logger.debug(POOL_LOG_MSG.CONNECTION_REUSED, stryMutAct_9fa48("155123") ? {} : (stryCov_9fa48("155123"), {
            nodeId,
            connectionId: existing.connectionId
          }));
          return existing;
        }
      }

      // Establish new connection
      const now = Date.now();
      const connectionId = uuidv4();
      const connectionEntry = stryMutAct_9fa48("155124") ? {} : (stryCov_9fa48("155124"), {
        connectionId,
        nodeId,
        endpointId: endpoint[COLUMN.ENDPOINT_ID],
        transportType: endpoint[COLUMN.TRANSPORT_TYPE],
        state: CONNECTION_STATE.CONNECTING,
        createdAt: now,
        lastActivity: now,
        ttlExpiresAt: stryMutAct_9fa48("155125") ? now - this.ttlMs : (stryCov_9fa48("155125"), now + this.ttlMs),
        providerConnection: null
      });
      this.connections.set(nodeId, connectionEntry);
      const providerConnection = await provider.connect(endpoint);
      connectionEntry.providerConnection = providerConnection;
      connectionEntry.state = CONNECTION_STATE.CONNECTED;
      connectionEntry.lastActivity = Date.now();
      this.resetTtl(connectionEntry);
      this.logger.info(POOL_LOG_MSG.CONNECTION_CREATED, stryMutAct_9fa48("155126") ? {} : (stryCov_9fa48("155126"), {
        nodeId,
        connectionId,
        endpointId: endpoint[COLUMN.ENDPOINT_ID],
        transportType: endpoint[COLUMN.TRANSPORT_TYPE]
      }));
      return connectionEntry;
    }
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
    if (stryMutAct_9fa48("155127")) {
      {}
    } else {
      stryCov_9fa48("155127");
      if (stryMutAct_9fa48("155130") ? false : stryMutAct_9fa48("155129") ? true : stryMutAct_9fa48("155128") ? nodeId : (stryCov_9fa48("155128", "155129", "155130"), !nodeId)) {
        if (stryMutAct_9fa48("155131")) {
          {}
        } else {
          stryCov_9fa48("155131");
          throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      const connection = this.connections.get(nodeId);
      if (stryMutAct_9fa48("155134") ? false : stryMutAct_9fa48("155133") ? true : stryMutAct_9fa48("155132") ? connection : (stryCov_9fa48("155132", "155133", "155134"), !connection)) {
        if (stryMutAct_9fa48("155135")) {
          {}
        } else {
          stryCov_9fa48("155135");
          this.logger.debug(POOL_LOG_MSG.CONNECTION_NOT_FOUND, stryMutAct_9fa48("155136") ? {} : (stryCov_9fa48("155136"), {
            nodeId
          }));
          return;
        }
      }
      this.resetTtl(connection);
      this.logger.debug(POOL_LOG_MSG.CONNECTION_RELEASED, stryMutAct_9fa48("155137") ? {} : (stryCov_9fa48("155137"), {
        nodeId,
        connectionId: connection.connectionId,
        ttlExpiresAt: connection.ttlExpiresAt
      }));
    }
  }

  /**
   * Close a specific connection.
   *
   * @param {string} nodeId - Node ID
   * @param {Object} [provider] - TransportProvider to use for disconnection
   * @return {Promise<boolean>} True if connection was closed, false if not found
   */
  async closeConnection(nodeId, provider) {
    if (stryMutAct_9fa48("155138")) {
      {}
    } else {
      stryCov_9fa48("155138");
      if (stryMutAct_9fa48("155141") ? false : stryMutAct_9fa48("155140") ? true : stryMutAct_9fa48("155139") ? nodeId : (stryCov_9fa48("155139", "155140", "155141"), !nodeId)) {
        if (stryMutAct_9fa48("155142")) {
          {}
        } else {
          stryCov_9fa48("155142");
          throw new Error(POOL_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      const connection = this.connections.get(nodeId);
      if (stryMutAct_9fa48("155145") ? false : stryMutAct_9fa48("155144") ? true : stryMutAct_9fa48("155143") ? connection : (stryCov_9fa48("155143", "155144", "155145"), !connection)) {
        if (stryMutAct_9fa48("155146")) {
          {}
        } else {
          stryCov_9fa48("155146");
          this.logger.debug(POOL_LOG_MSG.CONNECTION_NOT_FOUND, stryMutAct_9fa48("155147") ? {} : (stryCov_9fa48("155147"), {
            nodeId
          }));
          return stryMutAct_9fa48("155148") ? true : (stryCov_9fa48("155148"), false);
        }
      }

      // Disconnect via provider if available
      if (stryMutAct_9fa48("155151") ? provider || connection.providerConnection : stryMutAct_9fa48("155150") ? false : stryMutAct_9fa48("155149") ? true : (stryCov_9fa48("155149", "155150", "155151"), provider && connection.providerConnection)) {
        if (stryMutAct_9fa48("155152")) {
          {}
        } else {
          stryCov_9fa48("155152");
          await provider.disconnect(connection.providerConnection);
        }
      }
      connection.state = CONNECTION_STATE.CLOSED;
      this.connections.delete(nodeId);
      this.logger.info(POOL_LOG_MSG.CONNECTION_CLOSED, stryMutAct_9fa48("155153") ? {} : (stryCov_9fa48("155153"), {
        nodeId,
        connectionId: connection.connectionId
      }));
      return stryMutAct_9fa48("155154") ? false : (stryCov_9fa48("155154"), true);
    }
  }

  /**
   * Close all idle connections that exceeded TTL.
   *
   * @return {Promise<number>} Number of connections closed
   */
  async closeIdleConnections() {
    if (stryMutAct_9fa48("155155")) {
      {}
    } else {
      stryCov_9fa48("155155");
      if (stryMutAct_9fa48("155157") ? false : stryMutAct_9fa48("155156") ? true : (stryCov_9fa48("155156", "155157"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("155158")) {
          {}
        } else {
          stryCov_9fa48("155158");
          return 0;
        }
      }
      this.logger.debug(POOL_LOG_MSG.CLOSING_IDLE_CONNECTIONS);
      const now = Date.now();
      const expiredNodeIds = stryMutAct_9fa48("155159") ? ["Stryker was here"] : (stryCov_9fa48("155159"), []);
      for (const [nodeId, connection] of this.connections) {
        if (stryMutAct_9fa48("155160")) {
          {}
        } else {
          stryCov_9fa48("155160");
          if (stryMutAct_9fa48("155164") ? connection.ttlExpiresAt > now : stryMutAct_9fa48("155163") ? connection.ttlExpiresAt < now : stryMutAct_9fa48("155162") ? false : stryMutAct_9fa48("155161") ? true : (stryCov_9fa48("155161", "155162", "155163", "155164"), connection.ttlExpiresAt <= now)) {
            if (stryMutAct_9fa48("155165")) {
              {}
            } else {
              stryCov_9fa48("155165");
              expiredNodeIds.push(nodeId);
            }
          }
        }
      }
      let closedCount = 0;
      for (const nodeId of expiredNodeIds) {
        if (stryMutAct_9fa48("155166")) {
          {}
        } else {
          stryCov_9fa48("155166");
          const connection = this.connections.get(nodeId);
          if (stryMutAct_9fa48("155168") ? false : stryMutAct_9fa48("155167") ? true : (stryCov_9fa48("155167", "155168"), connection)) {
            if (stryMutAct_9fa48("155169")) {
              {}
            } else {
              stryCov_9fa48("155169");
              connection.state = CONNECTION_STATE.CLOSED;
              this.connections.delete(nodeId);
              stryMutAct_9fa48("155170") ? closedCount-- : (stryCov_9fa48("155170"), closedCount++);
              this.logger.info(POOL_LOG_MSG.IDLE_CONNECTION_CLOSED, stryMutAct_9fa48("155171") ? {} : (stryCov_9fa48("155171"), {
                nodeId,
                connectionId: connection.connectionId,
                idleMs: stryMutAct_9fa48("155172") ? now + connection.lastActivity : (stryCov_9fa48("155172"), now - connection.lastActivity)
              }));
            }
          }
        }
      }
      this.logger.debug(POOL_LOG_MSG.CLEANUP_COMPLETE, stryMutAct_9fa48("155173") ? {} : (stryCov_9fa48("155173"), {
        closedCount,
        remainingConnections: this.connections.size
      }));
      return closedCount;
    }
  }

  /**
   * Shutdown all connections.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("155174")) {
      {}
    } else {
      stryCov_9fa48("155174");
      this.logger.info(POOL_LOG_MSG.SHUTDOWN_STARTED, stryMutAct_9fa48("155175") ? {} : (stryCov_9fa48("155175"), {
        connectionCount: this.connections.size
      }));
      this.isShuttingDown = stryMutAct_9fa48("155176") ? false : (stryCov_9fa48("155176"), true);
      this.stopCleanupInterval();

      // Close all connections
      for (const [nodeId, connection] of this.connections) {
        if (stryMutAct_9fa48("155177")) {
          {}
        } else {
          stryCov_9fa48("155177");
          connection.state = CONNECTION_STATE.CLOSED;
          this.logger.debug(POOL_LOG_MSG.CONNECTION_CLOSED, stryMutAct_9fa48("155178") ? {} : (stryCov_9fa48("155178"), {
            nodeId,
            connectionId: connection.connectionId
          }));
        }
      }
      this.connections.clear();
      this.logger.info(POOL_LOG_MSG.SHUTDOWN_COMPLETE);
    }
  }

  /**
   * Reset the TTL for a connection.
   *
   * @param {Object} connection - Connection entry to reset TTL for
   * @private
   */
  resetTtl(connection) {
    if (stryMutAct_9fa48("155179")) {
      {}
    } else {
      stryCov_9fa48("155179");
      const now = Date.now();
      connection.lastActivity = now;
      connection.ttlExpiresAt = stryMutAct_9fa48("155180") ? now - this.ttlMs : (stryCov_9fa48("155180"), now + this.ttlMs);
    }
  }

  /**
   * Get the number of active connections.
   *
   * @return {number} Number of connections in the pool
   */
  getConnectionCount() {
    if (stryMutAct_9fa48("155181")) {
      {}
    } else {
      stryCov_9fa48("155181");
      return this.connections.size;
    }
  }

  /**
   * Check if a connection exists for a node.
   *
   * @param {string} nodeId - Node ID to check
   * @return {boolean} True if connection exists
   */
  hasConnection(nodeId) {
    if (stryMutAct_9fa48("155182")) {
      {}
    } else {
      stryCov_9fa48("155182");
      return this.connections.has(nodeId);
    }
  }

  /**
   * Get connection info for a node (without the provider connection).
   *
   * @param {string} nodeId - Node ID
   * @return {Object|null} Connection info or null if not found
   */
  getConnectionInfo(nodeId) {
    if (stryMutAct_9fa48("155183")) {
      {}
    } else {
      stryCov_9fa48("155183");
      const connection = this.connections.get(nodeId);
      if (stryMutAct_9fa48("155186") ? false : stryMutAct_9fa48("155185") ? true : stryMutAct_9fa48("155184") ? connection : (stryCov_9fa48("155184", "155185", "155186"), !connection)) {
        if (stryMutAct_9fa48("155187")) {
          {}
        } else {
          stryCov_9fa48("155187");
          return null;
        }
      }

      // Return a copy without the provider connection
      return stryMutAct_9fa48("155188") ? {} : (stryCov_9fa48("155188"), {
        connectionId: connection.connectionId,
        nodeId: connection.nodeId,
        endpointId: connection.endpointId,
        transportType: connection.transportType,
        state: connection.state,
        createdAt: connection.createdAt,
        lastActivity: connection.lastActivity,
        ttlExpiresAt: connection.ttlExpiresAt
      });
    }
  }

  /**
   * Get the configured TTL in milliseconds.
   *
   * @return {number} TTL in milliseconds
   */
  getTtlMs() {
    if (stryMutAct_9fa48("155189")) {
      {}
    } else {
      stryCov_9fa48("155189");
      return this.ttlMs;
    }
  }
}
export { ConnectionPool, POOL_SUBSYSTEM, POOL_LOG_MSG, POOL_ERROR_MSG };