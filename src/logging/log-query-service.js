/**
 * Log Query Service - SQL interface for querying logs.
 * Provides convenient methods for filtering, aggregation, and time-range queries.
 * Requirements: 27.6, 27.7
 */

import {EventEmitter} from 'events';
// LoggingService imported for type reference only
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {
  LOG_LEVEL_ORDER,
  LOG_QUERY_DEFAULT,
  LOG_QUERY_ERROR_CODE,
  LOG_QUERY_ERROR_MSG,
  LOG_QUERY_LOG_MSG,
} from './logging-constants.js';

const DEFAULT_CONFIG = Object.freeze({
  defaultLimit: LOG_QUERY_DEFAULT.DEFAULT_LIMIT,
  maxLimit: LOG_QUERY_DEFAULT.MAX_LIMIT,
  defaultTimeRangeMs: LOG_QUERY_DEFAULT.DEFAULT_TIME_RANGE_MS,
});

/**
 * LogQueryService provides SQL interface for querying logs.
 * Supports filtering, aggregation, and time-range queries.
 * Designed for Grafana integration via SQL.
 */
class LogQueryService extends EventEmitter {
  static instance = null;

  /**
   * Create a new LogQueryService.
   * @param {Object} options - Configuration options.
   * @private
   */
  constructor(options = {}) {
    super();

    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.systemCache = options.systemCache || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultLimit = options.defaultLimit ||
      config.get(CONFIG_KEY.LOGGING_QUERY_DEFAULT_LIMIT) || LOG_QUERY_DEFAULT.DEFAULT_LIMIT;
    this.maxLimit = options.maxLimit ||
      config.get(CONFIG_KEY.LOGGING_QUERY_MAX_LIMIT) || LOG_QUERY_DEFAULT.MAX_LIMIT;
    this.defaultTimeRangeMs = options.defaultTimeRangeMs ||
      config.get(CONFIG_KEY.LOGGING_DEFAULT_TIME_RANGE_MS) ||
      LOG_QUERY_DEFAULT.DEFAULT_TIME_RANGE_MS;

    // Logging (use console to avoid recursion)
    this.logger = console;

    this.initialized = false;
  }

  /**
   * Get the singleton instance.
   * @return {LogQueryService} The log query service instance.
   */
  static getInstance() {
    if (!LogQueryService.instance) {
      LogQueryService.instance = new LogQueryService();
    }
    return LogQueryService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    LogQueryService.instance = null;
  }

  /**
   * Initialize the log query service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.systemCache - System table cache.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }

    if (options.systemCache) {
      this.systemCache = options.systemCache;
    }

    this.initialized = true;
    this.logger.log(LOG_QUERY_LOG_MSG.INITIALIZED);
  }

  /**
   * Query logs with flexible filtering options.
   * @param {Object} options - Query options.
   * @param {string} options.level - Minimum log level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL).
   * @param {string} options.nodeId - Filter by node ID.
   * @param {string} options.serviceId - Filter by service ID.
   * @param {string} options.serviceType - Filter by service type.
   * @param {string} options.traceId - Filter by trace ID.
   * @param {string} options.subsystem - Filter by subsystem (in metadata).
   * @param {string} options.messagePattern - Filter by message pattern (LIKE).
   * @param {number} options.startTime - Start timestamp (inclusive).
   * @param {number} options.endTime - End timestamp (exclusive).
   * @param {number} options.limit - Maximum number of results.
   * @param {number} options.offset - Offset for pagination.
   * @param {string} options.orderBy - Order by column (default: timestamp).
   * @param {string} options.orderDir - Order direction (ASC or DESC, default: DESC).
   * @return {Promise<Object>} Query result.
   */
  async queryLogs(options = {}) {
    const sql = this.buildQuerySQL(options);
    return this.executeSQL(sql);
  }

  /**
   * Get logs within a time range.
   * @param {number} startTime - Start timestamp (inclusive).
   * @param {number} endTime - End timestamp (exclusive).
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByTimeRange(startTime, endTime, options = {}) {
    return this.queryLogs({
      ...options,
      startTime,
      endTime,
    });
  }

  /**
   * Get recent logs (last N minutes).
   * @param {number} minutes - Number of minutes to look back.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getRecentLogs(minutes = 60, options = {}) {
    const endTime = Date.now();
    const startTime = endTime - (minutes * 60 * 1000);
    return this.getLogsByTimeRange(startTime, endTime, options);
  }

  /**
   * Get error logs.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getErrorLogs(options = {}) {
    return this.queryLogs({
      ...options,
      level: 'ERROR',
    });
  }

  /**
   * Get logs for a specific node.
   * @param {string} nodeId - Node ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByNode(nodeId, options = {}) {
    return this.queryLogs({
      ...options,
      nodeId,
    });
  }

  /**
   * Get logs for a specific service.
   * @param {string} serviceId - Service ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByService(serviceId, options = {}) {
    return this.queryLogs({
      ...options,
      serviceId,
    });
  }

  /**
   * Get logs for a specific trace.
   * @param {string} traceId - Trace ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByTrace(traceId, options = {}) {
    return this.queryLogs({
      ...options,
      traceId,
      orderDir: 'ASC', // Chronological order for traces
    });
  }

  /**
   * Count logs by level within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByLevel(startTime, endTime) {
    const sql = `
      SELECT level, COUNT(*) as count
      FROM ${SystemTableName.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY level
      ORDER BY count DESC
    `.trim();

    return this.executeSQL(sql);
  }

  /**
   * Count logs by node within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByNode(startTime, endTime) {
    const sql = `
      SELECT node_id, COUNT(*) as count
      FROM ${SystemTableName.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY node_id
      ORDER BY count DESC
    `.trim();

    return this.executeSQL(sql);
  }

  /**
   * Count logs by service type within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByServiceType(startTime, endTime) {
    const sql = `
      SELECT service_type, COUNT(*) as count
      FROM ${SystemTableName.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY service_type
      ORDER BY count DESC
    `.trim();

    return this.executeSQL(sql);
  }

  /**
   * Get log count over time (for time series charts).
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @param {number} bucketSizeMs - Bucket size in milliseconds.
   * @param {string} level - Optional level filter.
   * @return {Promise<Object>} Time series result.
   */
  async getLogCountTimeSeries(startTime, endTime, bucketSizeMs = 60000, level = null) {
    let whereClause = `timestamp >= ${startTime} AND timestamp < ${endTime}`;
    if (level) {
      whereClause += ` AND level = '${this.escapeString(level)}'`;
    }

    const sql = `
      SELECT 
        (timestamp / ${bucketSizeMs}) * ${bucketSizeMs} as time_bucket,
        COUNT(*) as count
      FROM ${SystemTableName.LOGS}
      WHERE ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `.trim();

    return this.executeSQL(sql);
  }

  /**
   * Get error rate over time.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @param {number} bucketSizeMs - Bucket size in milliseconds.
   * @return {Promise<Object>} Time series result with error counts.
   */
  async getErrorRateTimeSeries(startTime, endTime, bucketSizeMs = 60000) {
    return this.getLogCountTimeSeries(startTime, endTime, bucketSizeMs, 'ERROR');
  }

  /**
   * Search logs by message content.
   * @param {string} searchTerm - Search term.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async searchLogs(searchTerm, options = {}) {
    return this.queryLogs({
      ...options,
      messagePattern: `%${searchTerm}%`,
    });
  }

  /**
   * Build SQL query from options.
   * @param {Object} options - Query options.
   * @return {string} SQL query string.
   * @private
   */
  buildQuerySQL(options) {
    const conditions = [];
    const {
      level,
      nodeId,
      serviceId,
      serviceType,
      traceId,
      messagePattern,
      startTime,
      endTime,
      limit = this.defaultLimit,
      offset = 0,
      orderBy = 'timestamp',
      orderDir = 'DESC',
    } = options;

    // Level filter (includes specified level and above)
    if (level && LOG_LEVEL_ORDER[level.toUpperCase()] !== undefined) {
      const minLevel = LOG_LEVEL_ORDER[level.toUpperCase()];
      const validLevels = Object.entries(LOG_LEVEL_ORDER)
        .filter(([_, order]) => order >= minLevel)
        .map(([name]) => `'${name}'`)
        .join(', ');
      conditions.push(`level IN (${validLevels})`);
    }

    // Node filter
    if (nodeId) {
      conditions.push(`node_id = '${this.escapeString(nodeId)}'`);
    }

    // Service filter
    if (serviceId) {
      conditions.push(`service_id = '${this.escapeString(serviceId)}'`);
    }

    // Service type filter
    if (serviceType) {
      conditions.push(`service_type = '${this.escapeString(serviceType)}'`);
    }

    // Trace filter
    if (traceId) {
      conditions.push(`trace_id = '${this.escapeString(traceId)}'`);
    }

    // Message pattern filter
    if (messagePattern) {
      conditions.push(`message LIKE '${this.escapeString(messagePattern)}'`);
    }

    // Time range filter
    if (startTime !== undefined) {
      conditions.push(`timestamp >= ${startTime}`);
    }
    if (endTime !== undefined) {
      conditions.push(`timestamp < ${endTime}`);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ?
      `WHERE ${conditions.join(' AND ')}` : '';

    // Validate order
    const validColumns = [
      'log_id', 'timestamp', 'level', 'node_id',
      'service_id', 'service_type', 'message', 'created_at',
    ];
    if (!validColumns.includes(orderBy)) {
      throw new Error(LOG_QUERY_ERROR_MSG.INVALID_ORDER_BY(orderBy));
    }
    const normalizedDir = orderDir.toUpperCase();
    if (normalizedDir !== 'ASC' && normalizedDir !== 'DESC') {
      throw new Error(LOG_QUERY_ERROR_MSG.INVALID_ORDER_DIR(orderDir));
    }
    const safeOrderBy = orderBy;
    const safeOrderDir = normalizedDir;

    // Limit
    const safeLimit = Math.min(Math.max(1, limit), this.maxLimit);

    // Build SQL
    const sql = `
      SELECT log_id, timestamp, level, node_id, service_id, service_type, 
             message, trace_id, metadata, created_at
      FROM ${SystemTableName.LOGS}
      ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ${safeLimit}
      ${offset > 0 ? `OFFSET ${offset}` : ''}
    `.trim();

    return sql;
  }

  /**
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQL(sql) {
    if (!this.sqlQueryEngine) {
      return {
        success: false,
        error: LOG_QUERY_ERROR_MSG.ENGINE_NOT_AVAILABLE,
        errorCode: LOG_QUERY_ERROR_CODE.ENGINE_NOT_AVAILABLE,
      };
    }

    try {
      const result = await this.sqlQueryEngine.executeQuery(sql);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: LOG_QUERY_ERROR_CODE.QUERY_FAILED,
      };
    }
  }

  /**
   * Escape a string for SQL.
   * @param {string} str - String to escape.
   * @return {string} Escaped string.
   * @private
   */
  escapeString(str) {
    if (typeof str !== 'string') {
      return String(str);
    }
    return str.replace(/'/g, '\'\'');
  }

  /**
   * Get raw SQL for a query (for Grafana integration).
   * @param {Object} options - Query options.
   * @return {string} SQL query string.
   */
  getQuerySQL(options) {
    return this.buildQuerySQL(options);
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    this.initialized = false;
    this.removeAllListeners();
    this.logger.log(LOG_QUERY_LOG_MSG.SHUTDOWN);
  }
}

export {
  LogQueryService,
  DEFAULT_CONFIG,
  LOG_LEVEL_ORDER,
};
