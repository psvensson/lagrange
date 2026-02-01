/**
 * Admin WebSocket API - WebSocket endpoint for admin CLI connections.
 * Provides real-time system state updates and query execution.
 * Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8, 32.9, 32.10,
 *               32.11, 32.12, 32.13, 32.14, 32.15, 32.16, 32.17, 32.18, 32.19,
 *               32.20, 32.21, 32.22, 32.23, 32.24, 32.25, 32.26, 32.27, 32.28,
 *               32.29, 32.30, 32.31, 32.32, 32.33, 32.34, 32.35, 32.36, 32.37,
 *               32.38, 32.39
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {ERRNO, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CLIENT,
  ADMIN_CONFIG_KEY,
  ADMIN_DEFAULT,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_QUERY_RESULT,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
} from './admin-constants.js';

const MessageType = ADMIN_MESSAGE_TYPE;
const ErrorCode = ADMIN_ERROR_CODE;

/**
 * AdminWebSocketAPI provides WebSocket endpoint for admin CLI connections.
 */
class AdminWebSocketAPI {
  /**
   * Create a new AdminWebSocketAPI.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || ADMIN_DEFAULT.NODE_ID;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = config.get(ADMIN_CONFIG_KEY.WEBSOCKET_PORT) || ADMIN_DEFAULT.WEBSOCKET_PORT;
    this.queryTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) || ADMIN_DEFAULT.QUERY_TIMEOUT_MS;
    this.cacheDumpTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS) || ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS;

    // Logging
    this.logger = this.initLogger();

    // Fastify instance
    this.fastify = null;
    this.initialized = false;
    this.listening = false;

    // Connected clients
    this.clients = new Set();

    // Subscribe to cache notifications for CDC forwarding (Requirement 2.2)
    this.subscribeToCacheNotifications();
  }

  /**
   * Subscribe to cache change notifications.
   * Broadcasts CDC events to all connected clients when cache changes.
   * @private
   */
  subscribeToCacheNotifications() {
    if (this.systemTableCache &&
        typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION) {
      this.systemTableCache.onCacheChange(
        (tableName, operation, record) => {
          this.broadcastCDCEvent(tableName, operation, record);
        },
      );
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(ADMIN_SUBSYSTEM.WEBSOCKET_API);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize and start the WebSocket server.
   * @param {number} port - Port to listen on (optional).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (this.initialized) {
      return;
    }

    const listenPort = port !== undefined ? port : this.port;
    const shouldListen = options.listen !== false;

    this.fastify = Fastify({
      logger: false,
    });

    // Register WebSocket plugin
    await this.fastify.register(websocket);

    // Register routes
    this.registerRoutes();

    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: ADMIN_DEFAULT.HOST});
        this.listening = true;
      } catch (err) {
        // Some environments disallow opening listening sockets (eg, unit-test sandboxes).
        // In that case, continue in "ready-only" mode so tests can use fastify.inject()
        // and/or direct handler invocation without binding ports.
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.ready();
          this.listening = false;
        } else {
          throw err;
        }
      }
    } else {
      await this.fastify.ready();
      this.listening = false;
    }

    this.initialized = true;

    this.logger.info(ADMIN_LOG_MSG.STARTED, {
      port: this.listening ? listenPort : null,
      listen: this.listening,
      nodeId: this.nodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Health check endpoint
    this.fastify.get(ADMIN_ROUTE.HEALTH, async (_request, _reply) => {
      return {
        status: ADMIN_STATUS.HEALTHY,
        nodeId: this.nodeId,
        connectedClients: this.clients.size,
      };
    });

    // WebSocket endpoint for admin stream
    // Note: @fastify/websocket passes socket directly in newer versions
    this.fastify.register(async (fastify) => {
      fastify.get(ADMIN_ROUTE.STREAM, {websocket: true}, (socket, _req) => {
        this.handleConnection(socket);
      });
    });
  }

  /**
   * Handle new WebSocket connection.
   * @param {Object} socket - WebSocket connection.
   * @private
   */
  handleConnection(socket) {
    const clientId = `${ADMIN_CLIENT.PREFIX}${Date.now()}-` +
      `${Math.random()
        .toString(ADMIN_CLIENT.RANDOM_BASE)
        .substr(ADMIN_CLIENT.RANDOM_START, ADMIN_CLIENT.RANDOM_LENGTH)}`;

    this.logger.info(ADMIN_LOG_MSG.CLIENT_CONNECTED, {
      clientId,
      totalClients: this.clients.size + NUM.ONE,
    });

    // Add to connected clients
    const clientInfo = {
      id: clientId,
      socket,
      connectedAt: Date.now(),
    };
    this.clients.add(clientInfo);

    // Send cache dump on connection
    this.sendCacheDump(clientInfo);

    // Handle incoming messages
    socket.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(clientInfo, data);
    });

    // Handle disconnection
    socket.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleDisconnection(clientInfo);
    });

    // Handle errors
    socket.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ADMIN_LOG_MSG.SOCKET_ERROR, {
        clientId,
        error: error.message,
      });
    });
  }

  /**
   * Handle client disconnection.
   * @param {Object} clientInfo - Client information.
   * @private
   */
  handleDisconnection(clientInfo) {
    this.clients.delete(clientInfo);

    this.logger.info(ADMIN_LOG_MSG.CLIENT_DISCONNECTED, {
      clientId: clientInfo.id,
      totalClients: this.clients.size,
    });
  }

  /**
   * Send cache dump to a client.
   * @param {Object} clientInfo - Client information.
   * @private
   */
  sendCacheDump(clientInfo) {
    const cacheDump = this.buildCacheDump();

    // Check if cache is empty (all tables have 0 rows) - Requirement 3.3
    const isEmpty = Object.values(cacheDump).every((arr) => arr.length === NUM.ZERO);
    if (isEmpty) {
      throw new Error('System table cache is empty');
    }

    const message = {
      type: MessageType.CACHE_DUMP,
      timestamp: Date.now(),
      nodeId: this.nodeId,
      data: cacheDump,
    };

    this.sendToClient(clientInfo, message);

    this.logger.debug(ADMIN_LOG_MSG.CACHE_DUMP_SENT, {
      clientId: clientInfo.id,
      tableCount: Object.keys(cacheDump).length,
    });
  }

  /**
   * Build cache dump from system table cache.
   * @return {Object} Cache dump with all system tables.
   * @private
   */
  buildCacheDump() {
    const tables = [
      TABLES.NODES,
      TABLES.SERVICES,
      TABLES.PARTITIONS,
      TABLES.TABLES,
      TABLES.MESSAGE_GROUPS,
      TABLES.INDICES,
      TABLES.LOGS,
      TABLES.CONFIG,
      TABLES.CONTEXTS,
      TABLES.LIVE_QUERIES,
    ];
    const dump = {};

    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error('System table cache not initialized');
    }

    for (const tableName of tables) {
      try {
        dump[tableName] = this.systemTableCache.getAll(tableName);
      } catch {
        dump[tableName] = ADMIN_CACHE_DUMP.EMPTY;
      }
    }

    return dump;
  }

  /**
   * Handle incoming message from client.
   * @param {Object} clientInfo - Client information.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(clientInfo, data) {
    let message;

    try {
      const messageStr = data.toString();
      message = JSON.parse(messageStr);
    } catch (_error) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.INVALID_JSON, ADMIN_ERROR_HINT.INVALID_JSON);
      return;
    }

    if (!message || typeof message.type !== TYPEOF.STRING) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_TYPE, ADMIN_ERROR_HINT.MISSING_TYPE);
      return;
    }

    this.logger.debug(ADMIN_LOG_MSG.RECEIVED_MESSAGE, {
      clientId: clientInfo.id,
      type: message.type,
    });

    switch (message.type) {
    case MessageType.QUERY:
      this.handleQueryMessage(clientInfo, message);
      break;

    case MessageType.REFRESH:
      this.handleRefreshMessage(clientInfo, message);
      break;

    default:
      // Ignore unknown message types (Requirement 32.38)
      this.logger.debug(ADMIN_LOG_MSG.UNKNOWN_MESSAGE, {
        clientId: clientInfo.id,
        type: message.type,
      });
      break;
    }
  }

  /**
   * Handle query message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Query message.
   * @private
   */
  async handleQueryMessage(clientInfo, message) {
    const {queryId, sql, params} = message;

    if (!queryId) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID, ADMIN_ERROR_HINT.MISSING_QUERY_ID);
      return;
    }

    if (!sql || typeof sql !== TYPEOF.STRING) {
      this.sendError(clientInfo, queryId, ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_SQL, ADMIN_ERROR_HINT.MISSING_SQL);
      return;
    }

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql: sql.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH),
    });

    try {
      const result = await this.executeQueryWithTimeout(
        sql,
        params || [],
        queryId,
      );

      this.sendQueryResult(clientInfo, queryId, result);
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(clientInfo, queryId, errorCode, error.message);
    }
  }

  /**
   * Execute query with timeout.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {string} queryId - Query ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryWithTimeout(sql, params, queryId) {
    if (!this.sqlQueryEngine) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ADMIN_ERROR_MESSAGE.queryTimeout(this.queryTimeoutMs)));
        }, this.queryTimeoutMs);
      });

      const queryPromise = this.sqlQueryEngine.executeQuery(sql, params, {
        sessionId: queryId,
      });

      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Send query result to client.
   * @param {Object} clientInfo - Client information.
   * @param {string} queryId - Query ID.
   * @param {Object} result - Query result.
   * @private
   */
  sendQueryResult(clientInfo, queryId, result) {
    const message = {
      type: MessageType.QUERY_RESULT,
      queryId,
      timestamp: Date.now(),
    };

    if (result.success === false) {
      message.error = result.error;
      message.errorCode = result.errorCode || ErrorCode.INTERNAL_ERROR;
      if (result.hint) {
        message.hint = result.hint;
      }
    } else if (result.rows !== undefined || result.results !== undefined) {
      // SELECT query result - handle both 'rows' and 'results' field names
      message.results = result.rows || result.results || ADMIN_CACHE_DUMP.EMPTY;
      message.count = result.count !== undefined ?
        result.count : message.results.length;
      message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
      message.tableName = result.tableName || null;
    } else {
      // Write operation result (INSERT, UPDATE, DELETE)
      message.operation = result.operation;
      message.affectedRows = result.affectedRows || ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
      message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
      message.tableName = result.tableName || null;
    }

    this.sendToClient(clientInfo, message);

    this.logger.debug(ADMIN_LOG_MSG.QUERY_RESULT_SENT, {
      clientId: clientInfo.id,
      queryId,
      success: result.success !== false,
    });
  }

  /**
   * Handle refresh message (request new cache dump).
   * @param {Object} clientInfo - Client information.
   * @param {Object} _message - Refresh message.
   * @private
   */
  handleRefreshMessage(clientInfo, _message) {
    this.logger.debug(ADMIN_LOG_MSG.REFRESH_REQUESTED, {
      clientId: clientInfo.id,
    });

    this.sendCacheDump(clientInfo);
  }

  /**
   * Send error to client.
   * @param {Object} clientInfo - Client information.
   * @param {string|null} queryId - Query ID (if applicable).
   * @param {string} errorCode - Error code.
   * @param {string} errorMessage - Error message.
   * @param {string} hint - Optional hint for resolution.
   * @private
   */
  sendError(clientInfo, queryId, errorCode, errorMessage, hint) {
    const message = {
      type: queryId ? MessageType.QUERY_RESULT : MessageType.ERROR,
      timestamp: Date.now(),
      error: errorMessage,
      errorCode,
    };

    if (queryId) {
      message.queryId = queryId;
    }

    if (hint) {
      message.hint = hint;
    }

    this.sendToClient(clientInfo, message);
  }

  /**
   * Send message to a specific client.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Message to send.
   * @private
   */
  sendToClient(clientInfo, message) {
    try {
      const json = JSON.stringify(message);
      clientInfo.socket.send(json);
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.SEND_FAILED, {
        clientId: clientInfo.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Broadcast CDC event to all connected clients.
   * @param {string} tableName - Table name.
   * @param {string} operation - CDC operation (insert, update, delete).
   * @param {Object} record - Record data.
   */
  broadcastCDCEvent(tableName, operation, record) {
    const message = {
      type: MessageType.CDC_EVENT,
      timestamp: Date.now(),
      table: tableName,
      operation: operation.toLowerCase(),
      record,
    };

    for (const clientInfo of this.clients) {
      this.sendToClient(clientInfo, message);
    }
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes(ADMIN_ERROR_MATCH.PARSE) ||
        message.includes(ADMIN_ERROR_MATCH.SYNTAX)) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) ||
        message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE)) {
      return ErrorCode.TABLE_NOT_FOUND;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TIMEOUT)) {
      return ErrorCode.TIMEOUT;
    }

    return ErrorCode.INTERNAL_ERROR;
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    // Subscribe to cache notifications when cache is set (Requirement 2.2)
    this.subscribeToCacheNotifications();
  }

  /**
   * Set the SQL query engine.
   * @param {Object} engine - SQL query engine.
   */
  setSQLQueryEngine(engine) {
    this.sqlQueryEngine = engine;
  }

  /**
   * Get the number of connected clients.
   * @return {number} Number of connected clients.
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Returns whether the API is bound to a TCP port.
   * @return {boolean}
   */
  isListening() {
    return this.listening;
  }

  /**
   * Shutdown the WebSocket server.
   * @return {Promise<void>}
   */
  async shutdown() {
    // Close all client connections
    for (const clientInfo of this.clients) {
      try {
        clientInfo.socket.close();
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();

    if (this.fastify) {
      const server = this.fastify.server;
      // Close all active connections immediately
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      // Ensure underlying HTTP server is fully closed
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== ERRNO.NOT_RUNNING) {
              this.logger.warn(ADMIN_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      // Unref the server to allow process exit
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {AdminWebSocketAPI, MessageType, ErrorCode};
