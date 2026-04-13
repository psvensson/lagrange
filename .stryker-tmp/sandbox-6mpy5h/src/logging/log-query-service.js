/**
 * Log Query Service - SQL interface for querying logs.
 * Provides convenient methods for filtering, aggregation, and time-range queries.
 * Requirements: 27.6, 27.7
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
import { EventEmitter } from 'events';
// LoggingService imported for type reference only
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { buildSystemMetadataOwnerNotReadyFailure, createSystemMetadataGatewayRequiredError } from '../control-plane/system-metadata-access-error.js';
import { LOG_LEVEL_ORDER, LOG_QUERY_DEFAULT, LOG_QUERY_ERROR_CODE, LOG_QUERY_ERROR_MSG, LOG_QUERY_LOG_MSG } from './logging-constants.js';
const DEFAULT_RECENT_MINUTES = 60;
const MINUTES_TO_MS = stryMutAct_9fa48("83019") ? 60 / 1000 : (stryCov_9fa48("83019"), 60 * 1000);
const DEFAULT_BUCKET_SIZE_MS = 60000;
const ERROR_LEVEL = stryMutAct_9fa48("83020") ? "" : (stryCov_9fa48("83020"), 'ERROR');
const ORDER_ASC = stryMutAct_9fa48("83021") ? "" : (stryCov_9fa48("83021"), 'ASC');
const ORDER_DESC = stryMutAct_9fa48("83022") ? "" : (stryCov_9fa48("83022"), 'DESC');
const DEFAULT_ORDER_COLUMN = stryMutAct_9fa48("83023") ? "" : (stryCov_9fa48("83023"), 'timestamp');
const VALID_ORDER_COLUMNS = Object.freeze(stryMutAct_9fa48("83024") ? [] : (stryCov_9fa48("83024"), [stryMutAct_9fa48("83025") ? "" : (stryCov_9fa48("83025"), 'log_id'), stryMutAct_9fa48("83026") ? "" : (stryCov_9fa48("83026"), 'timestamp'), stryMutAct_9fa48("83027") ? "" : (stryCov_9fa48("83027"), 'level'), stryMutAct_9fa48("83028") ? "" : (stryCov_9fa48("83028"), 'node_id'), stryMutAct_9fa48("83029") ? "" : (stryCov_9fa48("83029"), 'service_id'), stryMutAct_9fa48("83030") ? "" : (stryCov_9fa48("83030"), 'service_type'), stryMutAct_9fa48("83031") ? "" : (stryCov_9fa48("83031"), 'message'), stryMutAct_9fa48("83032") ? "" : (stryCov_9fa48("83032"), 'created_at')]));

// Repeated SQL fragments used across aggregate queries
const SQL_COUNT_ALIAS = stryMutAct_9fa48("83033") ? "" : (stryCov_9fa48("83033"), 'COUNT(*) as count');
const SQL_ORDER_BY_COUNT_DESC = stryMutAct_9fa48("83034") ? "" : (stryCov_9fa48("83034"), 'ORDER BY count DESC');
const SQL_SELECT_COLUMNS = (stryMutAct_9fa48("83035") ? [] : (stryCov_9fa48("83035"), [stryMutAct_9fa48("83036") ? "" : (stryCov_9fa48("83036"), 'log_id'), stryMutAct_9fa48("83037") ? "" : (stryCov_9fa48("83037"), 'timestamp'), stryMutAct_9fa48("83038") ? "" : (stryCov_9fa48("83038"), 'level'), stryMutAct_9fa48("83039") ? "" : (stryCov_9fa48("83039"), 'node_id'), stryMutAct_9fa48("83040") ? "" : (stryCov_9fa48("83040"), 'service_id'), stryMutAct_9fa48("83041") ? "" : (stryCov_9fa48("83041"), 'service_type'), stryMutAct_9fa48("83042") ? "" : (stryCov_9fa48("83042"), 'message'), stryMutAct_9fa48("83043") ? "" : (stryCov_9fa48("83043"), 'trace_id'), stryMutAct_9fa48("83044") ? "" : (stryCov_9fa48("83044"), 'metadata'), stryMutAct_9fa48("83045") ? "" : (stryCov_9fa48("83045"), 'created_at')])).join(stryMutAct_9fa48("83046") ? "" : (stryCov_9fa48("83046"), ', '));
const DEFAULT_CONFIG = Object.freeze(stryMutAct_9fa48("83047") ? {} : (stryCov_9fa48("83047"), {
  defaultLimit: LOG_QUERY_DEFAULT.DEFAULT_LIMIT,
  maxLimit: LOG_QUERY_DEFAULT.MAX_LIMIT,
  defaultTimeRangeMs: LOG_QUERY_DEFAULT.DEFAULT_TIME_RANGE_MS
}));

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
    this.sqlQueryEngine = stryMutAct_9fa48("83050") ? options.sqlQueryEngine && null : stryMutAct_9fa48("83049") ? false : stryMutAct_9fa48("83048") ? true : (stryCov_9fa48("83048", "83049", "83050"), options.sqlQueryEngine || null);
    this.systemCache = stryMutAct_9fa48("83053") ? options.systemCache && null : stryMutAct_9fa48("83052") ? false : stryMutAct_9fa48("83051") ? true : (stryCov_9fa48("83051", "83052", "83053"), options.systemCache || null);
    this.controlPlaneSystemTableGateway = stryMutAct_9fa48("83056") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("83055") ? false : stryMutAct_9fa48("83054") ? true : (stryCov_9fa48("83054", "83055", "83056"), options.controlPlaneSystemTableGateway || null);

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultLimit = stryMutAct_9fa48("83059") ? (options.defaultLimit || config.get(CONFIG_KEY.LOGGING_QUERY_DEFAULT_LIMIT)) && LOG_QUERY_DEFAULT.DEFAULT_LIMIT : stryMutAct_9fa48("83058") ? false : stryMutAct_9fa48("83057") ? true : (stryCov_9fa48("83057", "83058", "83059"), (stryMutAct_9fa48("83061") ? options.defaultLimit && config.get(CONFIG_KEY.LOGGING_QUERY_DEFAULT_LIMIT) : stryMutAct_9fa48("83060") ? false : (stryCov_9fa48("83060", "83061"), options.defaultLimit || config.get(CONFIG_KEY.LOGGING_QUERY_DEFAULT_LIMIT))) || LOG_QUERY_DEFAULT.DEFAULT_LIMIT);
    this.maxLimit = stryMutAct_9fa48("83064") ? (options.maxLimit || config.get(CONFIG_KEY.LOGGING_QUERY_MAX_LIMIT)) && LOG_QUERY_DEFAULT.MAX_LIMIT : stryMutAct_9fa48("83063") ? false : stryMutAct_9fa48("83062") ? true : (stryCov_9fa48("83062", "83063", "83064"), (stryMutAct_9fa48("83066") ? options.maxLimit && config.get(CONFIG_KEY.LOGGING_QUERY_MAX_LIMIT) : stryMutAct_9fa48("83065") ? false : (stryCov_9fa48("83065", "83066"), options.maxLimit || config.get(CONFIG_KEY.LOGGING_QUERY_MAX_LIMIT))) || LOG_QUERY_DEFAULT.MAX_LIMIT);
    this.defaultTimeRangeMs = stryMutAct_9fa48("83069") ? (options.defaultTimeRangeMs || config.get(CONFIG_KEY.LOGGING_DEFAULT_TIME_RANGE_MS)) && LOG_QUERY_DEFAULT.DEFAULT_TIME_RANGE_MS : stryMutAct_9fa48("83068") ? false : stryMutAct_9fa48("83067") ? true : (stryCov_9fa48("83067", "83068", "83069"), (stryMutAct_9fa48("83071") ? options.defaultTimeRangeMs && config.get(CONFIG_KEY.LOGGING_DEFAULT_TIME_RANGE_MS) : stryMutAct_9fa48("83070") ? false : (stryCov_9fa48("83070", "83071"), options.defaultTimeRangeMs || config.get(CONFIG_KEY.LOGGING_DEFAULT_TIME_RANGE_MS))) || LOG_QUERY_DEFAULT.DEFAULT_TIME_RANGE_MS);

    // Logging (use console to avoid recursion)
    this.logger = console;
    this.initialized = stryMutAct_9fa48("83072") ? true : (stryCov_9fa48("83072"), false);
  }

  /**
   * Get the singleton instance.
   * @return {LogQueryService} The log query service instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("83073")) {
      {}
    } else {
      stryCov_9fa48("83073");
      if (stryMutAct_9fa48("83076") ? false : stryMutAct_9fa48("83075") ? true : stryMutAct_9fa48("83074") ? LogQueryService.instance : (stryCov_9fa48("83074", "83075", "83076"), !LogQueryService.instance)) {
        if (stryMutAct_9fa48("83077")) {
          {}
        } else {
          stryCov_9fa48("83077");
          LogQueryService.instance = new LogQueryService();
        }
      }
      return LogQueryService.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("83078")) {
      {}
    } else {
      stryCov_9fa48("83078");
      LogQueryService.instance = null;
    }
  }

  /**
   * Initialize the log query service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.systemCache - System table cache.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("83079")) {
      {}
    } else {
      stryCov_9fa48("83079");
      if (stryMutAct_9fa48("83081") ? false : stryMutAct_9fa48("83080") ? true : (stryCov_9fa48("83080", "83081"), this.initialized)) {
        if (stryMutAct_9fa48("83082")) {
          {}
        } else {
          stryCov_9fa48("83082");
          return;
        }
      }
      if (stryMutAct_9fa48("83084") ? false : stryMutAct_9fa48("83083") ? true : (stryCov_9fa48("83083", "83084"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("83085")) {
          {}
        } else {
          stryCov_9fa48("83085");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("83087") ? false : stryMutAct_9fa48("83086") ? true : (stryCov_9fa48("83086", "83087"), options.systemCache)) {
        if (stryMutAct_9fa48("83088")) {
          {}
        } else {
          stryCov_9fa48("83088");
          this.systemCache = options.systemCache;
        }
      }
      if (stryMutAct_9fa48("83090") ? false : stryMutAct_9fa48("83089") ? true : (stryCov_9fa48("83089", "83090"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("83091")) {
          {}
        } else {
          stryCov_9fa48("83091");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      this.initialized = stryMutAct_9fa48("83092") ? false : (stryCov_9fa48("83092"), true);
      this.logger.log(LOG_QUERY_LOG_MSG.INITIALIZED);
    }
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
    if (stryMutAct_9fa48("83093")) {
      {}
    } else {
      stryCov_9fa48("83093");
      const sql = this.buildQuerySQL(options);
      return this.executeSQL(sql);
    }
  }

  /**
   * Get logs within a time range.
   * @param {number} startTime - Start timestamp (inclusive).
   * @param {number} endTime - End timestamp (exclusive).
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByTimeRange(startTime, endTime, options = {}) {
    if (stryMutAct_9fa48("83094")) {
      {}
    } else {
      stryCov_9fa48("83094");
      return this.queryLogs(stryMutAct_9fa48("83095") ? {} : (stryCov_9fa48("83095"), {
        ...options,
        startTime,
        endTime
      }));
    }
  }

  /**
   * Get recent logs (last N minutes).
   * @param {number} minutes - Number of minutes to look back.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getRecentLogs(minutes = DEFAULT_RECENT_MINUTES, options = {}) {
    if (stryMutAct_9fa48("83096")) {
      {}
    } else {
      stryCov_9fa48("83096");
      const endTime = Date.now();
      const startTime = stryMutAct_9fa48("83097") ? endTime + minutes * MINUTES_TO_MS : (stryCov_9fa48("83097"), endTime - (stryMutAct_9fa48("83098") ? minutes / MINUTES_TO_MS : (stryCov_9fa48("83098"), minutes * MINUTES_TO_MS)));
      return this.getLogsByTimeRange(startTime, endTime, options);
    }
  }

  /**
   * Get error logs.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getErrorLogs(options = {}) {
    if (stryMutAct_9fa48("83099")) {
      {}
    } else {
      stryCov_9fa48("83099");
      return this.queryLogs(stryMutAct_9fa48("83100") ? {} : (stryCov_9fa48("83100"), {
        ...options,
        level: ERROR_LEVEL
      }));
    }
  }

  /**
   * Get logs for a specific node.
   * @param {string} nodeId - Node ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByNode(nodeId, options = {}) {
    if (stryMutAct_9fa48("83101")) {
      {}
    } else {
      stryCov_9fa48("83101");
      return this.queryLogs(stryMutAct_9fa48("83102") ? {} : (stryCov_9fa48("83102"), {
        ...options,
        nodeId
      }));
    }
  }

  /**
   * Get logs for a specific service.
   * @param {string} serviceId - Service ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByService(serviceId, options = {}) {
    if (stryMutAct_9fa48("83103")) {
      {}
    } else {
      stryCov_9fa48("83103");
      return this.queryLogs(stryMutAct_9fa48("83104") ? {} : (stryCov_9fa48("83104"), {
        ...options,
        serviceId
      }));
    }
  }

  /**
   * Get logs for a specific trace.
   * @param {string} traceId - Trace ID.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async getLogsByTrace(traceId, options = {}) {
    if (stryMutAct_9fa48("83105")) {
      {}
    } else {
      stryCov_9fa48("83105");
      return this.queryLogs(stryMutAct_9fa48("83106") ? {} : (stryCov_9fa48("83106"), {
        ...options,
        traceId,
        orderDir: ORDER_ASC // Chronological order for traces
      }));
    }
  }

  /**
   * Count logs by level within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByLevel(startTime, endTime) {
    if (stryMutAct_9fa48("83107")) {
      {}
    } else {
      stryCov_9fa48("83107");
      const sql = stryMutAct_9fa48("83108") ? `
      SELECT level, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY level
      ${SQL_ORDER_BY_COUNT_DESC}
    ` : (stryCov_9fa48("83108"), (stryMutAct_9fa48("83109") ? `` : (stryCov_9fa48("83109"), `
      SELECT level, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY level
      ${SQL_ORDER_BY_COUNT_DESC}
    `)).trim());
      return this.executeSQL(sql);
    }
  }

  /**
   * Count logs by node within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByNode(startTime, endTime) {
    if (stryMutAct_9fa48("83110")) {
      {}
    } else {
      stryCov_9fa48("83110");
      const sql = stryMutAct_9fa48("83111") ? `
      SELECT node_id, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY node_id
      ${SQL_ORDER_BY_COUNT_DESC}
    ` : (stryCov_9fa48("83111"), (stryMutAct_9fa48("83112") ? `` : (stryCov_9fa48("83112"), `
      SELECT node_id, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY node_id
      ${SQL_ORDER_BY_COUNT_DESC}
    `)).trim());
      return this.executeSQL(sql);
    }
  }

  /**
   * Count logs by service type within a time range.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @return {Promise<Object>} Aggregation result.
   */
  async countByServiceType(startTime, endTime) {
    if (stryMutAct_9fa48("83113")) {
      {}
    } else {
      stryCov_9fa48("83113");
      const sql = stryMutAct_9fa48("83114") ? `
      SELECT service_type, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY service_type
      ${SQL_ORDER_BY_COUNT_DESC}
    ` : (stryCov_9fa48("83114"), (stryMutAct_9fa48("83115") ? `` : (stryCov_9fa48("83115"), `
      SELECT service_type, ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE timestamp >= ${startTime} AND timestamp < ${endTime}
      GROUP BY service_type
      ${SQL_ORDER_BY_COUNT_DESC}
    `)).trim());
      return this.executeSQL(sql);
    }
  }

  /**
   * Get log count over time (for time series charts).
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @param {number} bucketSizeMs - Bucket size in milliseconds.
   * @param {string} level - Optional level filter.
   * @return {Promise<Object>} Time series result.
   */
  async getLogCountTimeSeries(startTime, endTime, bucketSizeMs = DEFAULT_BUCKET_SIZE_MS, level = null) {
    if (stryMutAct_9fa48("83116")) {
      {}
    } else {
      stryCov_9fa48("83116");
      let whereClause = stryMutAct_9fa48("83117") ? `` : (stryCov_9fa48("83117"), `timestamp >= ${startTime} AND timestamp < ${endTime}`);
      if (stryMutAct_9fa48("83119") ? false : stryMutAct_9fa48("83118") ? true : (stryCov_9fa48("83118", "83119"), level)) {
        if (stryMutAct_9fa48("83120")) {
          {}
        } else {
          stryCov_9fa48("83120");
          whereClause += stryMutAct_9fa48("83121") ? `` : (stryCov_9fa48("83121"), ` AND level = '${this.escapeString(level)}'`);
        }
      }
      const sql = stryMutAct_9fa48("83122") ? `
      SELECT 
        (timestamp / ${bucketSizeMs}) * ${bucketSizeMs} as time_bucket,
        ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ${ORDER_ASC}
    ` : (stryCov_9fa48("83122"), (stryMutAct_9fa48("83123") ? `` : (stryCov_9fa48("83123"), `
      SELECT 
        (timestamp / ${bucketSizeMs}) * ${bucketSizeMs} as time_bucket,
        ${SQL_COUNT_ALIAS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      WHERE ${whereClause}
      GROUP BY time_bucket
      ORDER BY time_bucket ${ORDER_ASC}
    `)).trim());
      return this.executeSQL(sql);
    }
  }

  /**
   * Get error rate over time.
   * @param {number} startTime - Start timestamp.
   * @param {number} endTime - End timestamp.
   * @param {number} bucketSizeMs - Bucket size in milliseconds.
   * @return {Promise<Object>} Time series result with error counts.
   */
  async getErrorRateTimeSeries(startTime, endTime, bucketSizeMs = DEFAULT_BUCKET_SIZE_MS) {
    if (stryMutAct_9fa48("83124")) {
      {}
    } else {
      stryCov_9fa48("83124");
      return this.getLogCountTimeSeries(startTime, endTime, bucketSizeMs, ERROR_LEVEL);
    }
  }

  /**
   * Search logs by message content.
   * @param {string} searchTerm - Search term.
   * @param {Object} options - Additional filter options.
   * @return {Promise<Object>} Query result.
   */
  async searchLogs(searchTerm, options = {}) {
    if (stryMutAct_9fa48("83125")) {
      {}
    } else {
      stryCov_9fa48("83125");
      return this.queryLogs(stryMutAct_9fa48("83126") ? {} : (stryCov_9fa48("83126"), {
        ...options,
        messagePattern: stryMutAct_9fa48("83127") ? `` : (stryCov_9fa48("83127"), `%${searchTerm}%`)
      }));
    }
  }

  /**
   * Build SQL query from options.
   * @param {Object} options - Query options.
   * @return {string} SQL query string.
   * @private
   */
  buildQuerySQL(options) {
    if (stryMutAct_9fa48("83128")) {
      {}
    } else {
      stryCov_9fa48("83128");
      const conditions = stryMutAct_9fa48("83129") ? ["Stryker was here"] : (stryCov_9fa48("83129"), []);
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
        orderBy = DEFAULT_ORDER_COLUMN,
        orderDir = ORDER_DESC
      } = options;

      // Level filter (includes specified level and above)
      if (stryMutAct_9fa48("83132") ? level || LOG_LEVEL_ORDER[level.toUpperCase()] !== undefined : stryMutAct_9fa48("83131") ? false : stryMutAct_9fa48("83130") ? true : (stryCov_9fa48("83130", "83131", "83132"), level && (stryMutAct_9fa48("83134") ? LOG_LEVEL_ORDER[level.toUpperCase()] === undefined : stryMutAct_9fa48("83133") ? true : (stryCov_9fa48("83133", "83134"), LOG_LEVEL_ORDER[stryMutAct_9fa48("83135") ? level.toLowerCase() : (stryCov_9fa48("83135"), level.toUpperCase())] !== undefined)))) {
        if (stryMutAct_9fa48("83136")) {
          {}
        } else {
          stryCov_9fa48("83136");
          const minLevel = LOG_LEVEL_ORDER[stryMutAct_9fa48("83137") ? level.toLowerCase() : (stryCov_9fa48("83137"), level.toUpperCase())];
          const validLevels = stryMutAct_9fa48("83138") ? Object.entries(LOG_LEVEL_ORDER).map(([name]) => `'${name}'`).join(', ') : (stryCov_9fa48("83138"), Object.entries(LOG_LEVEL_ORDER).filter(stryMutAct_9fa48("83139") ? () => undefined : (stryCov_9fa48("83139"), ([_, order]) => stryMutAct_9fa48("83143") ? order < minLevel : stryMutAct_9fa48("83142") ? order > minLevel : stryMutAct_9fa48("83141") ? false : stryMutAct_9fa48("83140") ? true : (stryCov_9fa48("83140", "83141", "83142", "83143"), order >= minLevel))).map(stryMutAct_9fa48("83144") ? () => undefined : (stryCov_9fa48("83144"), ([name]) => stryMutAct_9fa48("83145") ? `` : (stryCov_9fa48("83145"), `'${name}'`))).join(stryMutAct_9fa48("83146") ? "" : (stryCov_9fa48("83146"), ', ')));
          conditions.push(stryMutAct_9fa48("83147") ? `` : (stryCov_9fa48("83147"), `level IN (${validLevels})`));
        }
      }

      // Node filter
      if (stryMutAct_9fa48("83149") ? false : stryMutAct_9fa48("83148") ? true : (stryCov_9fa48("83148", "83149"), nodeId)) {
        if (stryMutAct_9fa48("83150")) {
          {}
        } else {
          stryCov_9fa48("83150");
          conditions.push(stryMutAct_9fa48("83151") ? `` : (stryCov_9fa48("83151"), `node_id = '${this.escapeString(nodeId)}'`));
        }
      }

      // Service filter
      if (stryMutAct_9fa48("83153") ? false : stryMutAct_9fa48("83152") ? true : (stryCov_9fa48("83152", "83153"), serviceId)) {
        if (stryMutAct_9fa48("83154")) {
          {}
        } else {
          stryCov_9fa48("83154");
          conditions.push(stryMutAct_9fa48("83155") ? `` : (stryCov_9fa48("83155"), `service_id = '${this.escapeString(serviceId)}'`));
        }
      }

      // Service type filter
      if (stryMutAct_9fa48("83157") ? false : stryMutAct_9fa48("83156") ? true : (stryCov_9fa48("83156", "83157"), serviceType)) {
        if (stryMutAct_9fa48("83158")) {
          {}
        } else {
          stryCov_9fa48("83158");
          conditions.push(stryMutAct_9fa48("83159") ? `` : (stryCov_9fa48("83159"), `service_type = '${this.escapeString(serviceType)}'`));
        }
      }

      // Trace filter
      if (stryMutAct_9fa48("83161") ? false : stryMutAct_9fa48("83160") ? true : (stryCov_9fa48("83160", "83161"), traceId)) {
        if (stryMutAct_9fa48("83162")) {
          {}
        } else {
          stryCov_9fa48("83162");
          conditions.push(stryMutAct_9fa48("83163") ? `` : (stryCov_9fa48("83163"), `trace_id = '${this.escapeString(traceId)}'`));
        }
      }

      // Message pattern filter
      if (stryMutAct_9fa48("83165") ? false : stryMutAct_9fa48("83164") ? true : (stryCov_9fa48("83164", "83165"), messagePattern)) {
        if (stryMutAct_9fa48("83166")) {
          {}
        } else {
          stryCov_9fa48("83166");
          conditions.push(stryMutAct_9fa48("83167") ? `` : (stryCov_9fa48("83167"), `message LIKE '${this.escapeString(messagePattern)}'`));
        }
      }

      // Time range filter
      if (stryMutAct_9fa48("83170") ? startTime === undefined : stryMutAct_9fa48("83169") ? false : stryMutAct_9fa48("83168") ? true : (stryCov_9fa48("83168", "83169", "83170"), startTime !== undefined)) {
        if (stryMutAct_9fa48("83171")) {
          {}
        } else {
          stryCov_9fa48("83171");
          conditions.push(stryMutAct_9fa48("83172") ? `` : (stryCov_9fa48("83172"), `timestamp >= ${startTime}`));
        }
      }
      if (stryMutAct_9fa48("83175") ? endTime === undefined : stryMutAct_9fa48("83174") ? false : stryMutAct_9fa48("83173") ? true : (stryCov_9fa48("83173", "83174", "83175"), endTime !== undefined)) {
        if (stryMutAct_9fa48("83176")) {
          {}
        } else {
          stryCov_9fa48("83176");
          conditions.push(stryMutAct_9fa48("83177") ? `` : (stryCov_9fa48("83177"), `timestamp < ${endTime}`));
        }
      }

      // Build WHERE clause
      const whereClause = (stryMutAct_9fa48("83181") ? conditions.length <= 0 : stryMutAct_9fa48("83180") ? conditions.length >= 0 : stryMutAct_9fa48("83179") ? false : stryMutAct_9fa48("83178") ? true : (stryCov_9fa48("83178", "83179", "83180", "83181"), conditions.length > 0)) ? stryMutAct_9fa48("83182") ? `` : (stryCov_9fa48("83182"), `WHERE ${conditions.join(stryMutAct_9fa48("83183") ? "" : (stryCov_9fa48("83183"), ' AND '))}`) : stryMutAct_9fa48("83184") ? "Stryker was here!" : (stryCov_9fa48("83184"), '');

      // Validate order
      if (stryMutAct_9fa48("83187") ? false : stryMutAct_9fa48("83186") ? true : stryMutAct_9fa48("83185") ? VALID_ORDER_COLUMNS.includes(orderBy) : (stryCov_9fa48("83185", "83186", "83187"), !VALID_ORDER_COLUMNS.includes(orderBy))) {
        if (stryMutAct_9fa48("83188")) {
          {}
        } else {
          stryCov_9fa48("83188");
          throw new Error(LOG_QUERY_ERROR_MSG.invalidOrderBy(orderBy));
        }
      }
      const normalizedDir = stryMutAct_9fa48("83189") ? orderDir.toLowerCase() : (stryCov_9fa48("83189"), orderDir.toUpperCase());
      if (stryMutAct_9fa48("83192") ? normalizedDir !== ORDER_ASC || normalizedDir !== ORDER_DESC : stryMutAct_9fa48("83191") ? false : stryMutAct_9fa48("83190") ? true : (stryCov_9fa48("83190", "83191", "83192"), (stryMutAct_9fa48("83194") ? normalizedDir === ORDER_ASC : stryMutAct_9fa48("83193") ? true : (stryCov_9fa48("83193", "83194"), normalizedDir !== ORDER_ASC)) && (stryMutAct_9fa48("83196") ? normalizedDir === ORDER_DESC : stryMutAct_9fa48("83195") ? true : (stryCov_9fa48("83195", "83196"), normalizedDir !== ORDER_DESC)))) {
        if (stryMutAct_9fa48("83197")) {
          {}
        } else {
          stryCov_9fa48("83197");
          throw new Error(LOG_QUERY_ERROR_MSG.invalidOrderDir(orderDir));
        }
      }
      const safeOrderBy = orderBy;
      const safeOrderDir = normalizedDir;

      // Limit
      const safeLimit = stryMutAct_9fa48("83198") ? Math.max(Math.max(1, limit), this.maxLimit) : (stryCov_9fa48("83198"), Math.min(stryMutAct_9fa48("83199") ? Math.min(1, limit) : (stryCov_9fa48("83199"), Math.max(1, limit)), this.maxLimit));

      // Build SQL
      const sql = stryMutAct_9fa48("83200") ? `
      SELECT ${SQL_SELECT_COLUMNS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ${safeLimit}
      ${offset > 0 ? `OFFSET ${offset}` : ''}
    ` : (stryCov_9fa48("83200"), (stryMutAct_9fa48("83201") ? `` : (stryCov_9fa48("83201"), `
      SELECT ${SQL_SELECT_COLUMNS}
      FROM ${SYSTEM_TABLE_NAME.LOGS}
      ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ${safeLimit}
      ${(stryMutAct_9fa48("83205") ? offset <= 0 : stryMutAct_9fa48("83204") ? offset >= 0 : stryMutAct_9fa48("83203") ? false : stryMutAct_9fa48("83202") ? true : (stryCov_9fa48("83202", "83203", "83204", "83205"), offset > 0)) ? stryMutAct_9fa48("83206") ? `` : (stryCov_9fa48("83206"), `OFFSET ${offset}`) : stryMutAct_9fa48("83207") ? "Stryker was here!" : (stryCov_9fa48("83207"), '')}
    `)).trim());
      return sql;
    }
  }

  /**
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQL(sql) {
    if (stryMutAct_9fa48("83208")) {
      {}
    } else {
      stryCov_9fa48("83208");
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("83211") ? false : stryMutAct_9fa48("83210") ? true : stryMutAct_9fa48("83209") ? gateway : (stryCov_9fa48("83209", "83210", "83211"), !gateway)) {
        if (stryMutAct_9fa48("83212")) {
          {}
        } else {
          stryCov_9fa48("83212");
          return buildSystemMetadataOwnerNotReadyFailure(createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("83213") ? {} : (stryCov_9fa48("83213"), {
            serviceName: stryMutAct_9fa48("83214") ? "" : (stryCov_9fa48("83214"), 'LogQueryService'),
            tableName: SYSTEM_TABLE_NAME.LOGS,
            operation: stryMutAct_9fa48("83215") ? "" : (stryCov_9fa48("83215"), 'read'),
            message: LOG_QUERY_ERROR_MSG.ENGINE_NOT_AVAILABLE
          })));
        }
      }
      try {
        if (stryMutAct_9fa48("83216")) {
          {}
        } else {
          stryCov_9fa48("83216");
          const result = await gateway.executeQuery(sql, stryMutAct_9fa48("83217") ? ["Stryker was here"] : (stryCov_9fa48("83217"), []), stryMutAct_9fa48("83218") ? {} : (stryCov_9fa48("83218"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            allowPressureDefer: stryMutAct_9fa48("83219") ? false : (stryCov_9fa48("83219"), true)
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("83220")) {
          {}
        } else {
          stryCov_9fa48("83220");
          this.logger.warn(LOG_QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("83221") ? {} : (stryCov_9fa48("83221"), {
            error: error.message
          }));
          return stryMutAct_9fa48("83222") ? {} : (stryCov_9fa48("83222"), {
            success: stryMutAct_9fa48("83223") ? true : (stryCov_9fa48("83223"), false),
            error: error.message,
            errorCode: LOG_QUERY_ERROR_CODE.QUERY_FAILED
          });
        }
      }
    }
  }

  /**
   * Escape a string for SQL.
   * @param {string} str - String to escape.
   * @return {string} Escaped string.
   * @private
   */
  escapeString(str) {
    if (stryMutAct_9fa48("83224")) {
      {}
    } else {
      stryCov_9fa48("83224");
      if (stryMutAct_9fa48("83227") ? typeof str === 'string' : stryMutAct_9fa48("83226") ? false : stryMutAct_9fa48("83225") ? true : (stryCov_9fa48("83225", "83226", "83227"), typeof str !== (stryMutAct_9fa48("83228") ? "" : (stryCov_9fa48("83228"), 'string')))) {
        if (stryMutAct_9fa48("83229")) {
          {}
        } else {
          stryCov_9fa48("83229");
          return String(str);
        }
      }
      return str.replace(/'/g, stryMutAct_9fa48("83230") ? "" : (stryCov_9fa48("83230"), '\'\''));
    }
  }

  /**
   * Get raw SQL for a query (for Grafana integration).
   * @param {Object} options - Query options.
   * @return {string} SQL query string.
   */
  getQuerySQL(options) {
    if (stryMutAct_9fa48("83231")) {
      {}
    } else {
      stryCov_9fa48("83231");
      return this.buildQuerySQL(options);
    }
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("83232")) {
      {}
    } else {
      stryCov_9fa48("83232");
      return this.initialized;
    }
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    if (stryMutAct_9fa48("83233")) {
      {}
    } else {
      stryCov_9fa48("83233");
      this.initialized = stryMutAct_9fa48("83234") ? true : (stryCov_9fa48("83234"), false);
      this.removeAllListeners();
      this.logger.log(LOG_QUERY_LOG_MSG.SHUTDOWN);
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("83235")) {
      {}
    } else {
      stryCov_9fa48("83235");
      if (stryMutAct_9fa48("83237") ? false : stryMutAct_9fa48("83236") ? true : (stryCov_9fa48("83236", "83237"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("83238")) {
          {}
        } else {
          stryCov_9fa48("83238");
          return this.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("83241") ? !this.sqlQueryEngine || !this.systemCache : stryMutAct_9fa48("83240") ? false : stryMutAct_9fa48("83239") ? true : (stryCov_9fa48("83239", "83240", "83241"), (stryMutAct_9fa48("83242") ? this.sqlQueryEngine : (stryCov_9fa48("83242"), !this.sqlQueryEngine)) && (stryMutAct_9fa48("83243") ? this.systemCache : (stryCov_9fa48("83243"), !this.systemCache)))) {
        if (stryMutAct_9fa48("83244")) {
          {}
        } else {
          stryCov_9fa48("83244");
          return null;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("83245") ? {} : (stryCov_9fa48("83245"), {
        getSqlQueryEngine: stryMutAct_9fa48("83246") ? () => undefined : (stryCov_9fa48("83246"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("83247") ? () => undefined : (stryCov_9fa48("83247"), () => this.systemCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { LogQueryService, DEFAULT_CONFIG, LOG_LEVEL_ORDER };