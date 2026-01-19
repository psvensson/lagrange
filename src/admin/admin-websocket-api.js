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

/**
 * Message types for the WebSocket protocol.
 */
const MessageType = {
  // Outgoing
  CACHE_DUMP: 'cache_dump',
  CDC_EVENT: 'cdc_event',
  QUERY_RESULT: 'query_result',
  ERROR: 'error',
  // Incoming
  QUERY: 'query',
  REFRESH: 'refresh',
};

/**
 * Error codes for query failures.
 */
const ErrorCode = {
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  MALFORMED_JSON: 'MALFORMED_JSON',
};

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
    this.nodeId = options.nodeId || 'admin-api';

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = config.get('admin.websocketPort') || 8081;
    this.queryTimeoutMs = config.get('admin.queryTimeoutMs') || 30000;
    this.cacheDumpTimeoutMs = config.get('admin.cacheDumpTimeoutMs') || 5000;

    // Logging
    this.logger = this.initLogger();

    // Fastify instance
    this.fastify = null;
    this.initialized = false;

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
        typeof this.systemTableCache.onCacheChange === 'function') {
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
        return loggingService.forSubsystem('admin-websocket-api');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize and start the WebSocket server.
   * @param {number} port - Port to listen on (optional).
   * @return {Promise<void>}
   */
  async initialize(port) {
    if (this.initialized) {
      return;
    }

    const listenPort = port !== undefined ? port : this.port;

    this.fastify = Fastify({
      logger: false,
    });

    // Register WebSocket plugin
    await this.fastify.register(websocket);

    // Register routes
    this.registerRoutes();

    // Start server
    await this.fastify.listen({port: listenPort, host: '0.0.0.0'});

    this.initialized = true;

    this.logger.info('Admin WebSocket API started', {
      port: listenPort,
      nodeId: this.nodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Health check endpoint
    this.fastify.get('/health', async (_request, _reply) => {
      return {
        status: 'healthy',
        nodeId: this.nodeId,
        connectedClients: this.clients.size,
      };
    });

    // WebSocket endpoint for admin stream
    // Note: @fastify/websocket passes socket directly in newer versions
    this.fastify.register(async (fastify) => {
      fastify.get('/api/admin/stream', {websocket: true}, (socket, _req) => {
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
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.info('Admin client connected', {
      clientId,
      totalClients: this.clients.size + 1,
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
    socket.on('message', (data) => {
      this.handleMessage(clientInfo, data);
    });

    // Handle disconnection
    socket.on('close', () => {
      this.handleDisconnection(clientInfo);
    });

    // Handle errors
    socket.on('error', (error) => {
      this.logger.error('WebSocket error', {
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

    this.logger.info('Admin client disconnected', {
      clientId: clientInfo.id,
      totalClients: this.clients.size,
    });
  }

  /**
   * Send cache dump to a client.
   * If cache is empty, queries partitions directly as fallback.
   * @param {Object} clientInfo - Client information.
   * @private
   */
  async sendCacheDump(clientInfo) {
    try {
      let cacheDump = this.buildCacheDump();

      // Check if cache is empty (all tables have 0 rows) - Requirement 3.3
      const isEmpty = Object.values(cacheDump).every((arr) => arr.length === 0);
      if (isEmpty && this.sqlQueryEngine) {
        this.logger.debug('Cache is empty, querying partitions directly', {
          clientId: clientInfo.id,
        });
        cacheDump = await this.queryPartitionsForDump();
      }

      const message = {
        type: MessageType.CACHE_DUMP,
        timestamp: Date.now(),
        nodeId: this.nodeId,
        data: cacheDump,
      };

      this.sendToClient(clientInfo, message);

      this.logger.debug('Cache dump sent', {
        clientId: clientInfo.id,
        tableCount: Object.keys(cacheDump).length,
      });
    } catch (error) {
      this.logger.error('Failed to send cache dump', {
        clientId: clientInfo.id,
        error: error.message,
      });
    }
  }

  /**
   * Build cache dump from system table cache.
   * @return {Object} Cache dump with all six system tables.
   * @private
   */
  buildCacheDump() {
    const tables = ['nodes', 'services', 'partitions', 'tables',
      'message_groups', 'indices'];
    const dump = {};

    for (const tableName of tables) {
      try {
        if (this.systemTableCache &&
            typeof this.systemTableCache.getAll === 'function') {
          dump[tableName] = this.systemTableCache.getAll(tableName);
        } else {
          dump[tableName] = [];
        }
      } catch {
        dump[tableName] = [];
      }
    }

    return dump;
  }

  /**
   * Query system table partitions directly for cache dump.
   * Used as fallback when cache is empty (Requirement 3.3).
   * @return {Promise<Object>} Cache dump data from partitions.
   * @private
   */
  async queryPartitionsForDump() {
    const systemTables = ['nodes', 'services', 'partitions', 'tables',
      'message_groups', 'indices'];
    const data = {};

    for (const tableName of systemTables) {
      try {
        const result = await this.sqlQueryEngine.executeQuery(
          `SELECT * FROM ${tableName}`,
        );
        // Query engine returns 'rows', not 'results'
        data[tableName] = result.rows || result.results || [];
      } catch (error) {
        this.logger.warn('Failed to query system table for dump', {
          tableName,
          error: error.message,
        });
        data[tableName] = [];
      }
    }

    return data;
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
        'Invalid JSON message', 'Ensure message is valid JSON');
      return;
    }

    if (!message || typeof message.type !== 'string') {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        'Message must have a "type" field', 'Include type field in message');
      return;
    }

    this.logger.debug('Received message', {
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
      this.logger.debug('Ignoring unknown message type', {
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
        'Query message must include queryId', 'Include queryId field');
      return;
    }

    if (!sql || typeof sql !== 'string') {
      this.sendError(clientInfo, queryId, ErrorCode.SYNTAX_ERROR,
        'Query message must include sql string', 'Include sql field');
      return;
    }

    this.logger.debug('Executing query', {
      clientId: clientInfo.id,
      queryId,
      sql: sql.substring(0, 100),
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
      throw new Error('SQL query engine not available');
    }

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Query timeout after ${this.queryTimeoutMs}ms`));
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
      message.results = result.rows || result.results || [];
      message.count = result.count !== undefined ?
        result.count : message.results.length;
      message.partitions = result.partitions || [];
      message.tableName = result.tableName || null;
    } else {
      // Write operation result (INSERT, UPDATE, DELETE)
      message.operation = result.operation;
      message.affectedRows = result.affectedRows || 0;
      message.partitions = result.partitions || [];
      message.tableName = result.tableName || null;
    }

    this.sendToClient(clientInfo, message);

    this.logger.debug('Query result sent', {
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
    this.logger.debug('Refresh requested', {
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
      this.logger.error('Failed to send message to client', {
        clientId: clientInfo.id,
        error: error.message,
      });
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

    this.logger.debug('CDC event broadcast', {
      tableName,
      operation,
      clientCount: this.clients.size,
    });
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes('parse') || message.includes('syntax')) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (message.includes('table not found') ||
        message.includes('table_not_found')) {
      return ErrorCode.TABLE_NOT_FOUND;
    }
    if (message.includes('timeout')) {
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
      await this.fastify.close();
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info('Admin WebSocket API shutdown', {
      nodeId: this.nodeId,
    });
  }
}

export {AdminWebSocketAPI, MessageType, ErrorCode};
