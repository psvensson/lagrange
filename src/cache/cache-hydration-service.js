/**
 * Cache Hydration Service - Populates SystemTableCache on startup.
 * Queries system table partitions and populates the cache with existing data.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, METRICS_LOG_TAG} from '../constants/index.js';
import {
  CACHE_HYDRATION_ERROR_MSG,
  CACHE_HYDRATION_DEFAULT_OPTIONS,
  CACHE_HYDRATION_LOG_MSG,
  CACHE_HYDRATION_METRICS,
  CACHE_HYDRATION_NOW,
  CACHE_HYDRATION_SQL,
  CACHE_HYDRATION_TABLES,
  CACHE_SUBSYSTEM,
} from './cache-constants.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * CacheHydrationService populates the SystemTableCache with existing data
 * from system table partitions on startup.
 */
class CacheHydrationService {
  /**
   * Create a new CacheHydrationService.
   * @param {Object} queryEngine - SQL query engine for querying partitions
   * @param {Object} systemTableCache - SystemTableCache to populate
   * @param {Object} [options] - Optional configuration.
   * @param {Object} [options.logger] - Optional logger instance.
   * @param {Function} [options.cdcEventApplier] - CDC event applier.
   */
  constructor(
    queryEngine,
    systemTableCache,
    options = CACHE_HYDRATION_DEFAULT_OPTIONS,
  ) {
    this.queryEngine = queryEngine;
    this.systemTableCache = systemTableCache;
    this.logger = options.logger || this.initLogger();
    this.now = typeof options.now === 'function' ?
      options.now :
      CACHE_HYDRATION_NOW;
    this.cdcEventApplier = options.cdcEventApplier ?? null;
    if (typeof this.cdcEventApplier !== 'function') {
      throw new Error(CACHE_HYDRATION_ERROR_MSG.MISSING_CDC_EVENT_APPLIER);
    }
  }

  /**
   * Initialize logger if not provided.
   * @return {Object} Logger instance
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(CACHE_SUBSYSTEM.HYDRATION);
      }
    } catch (error) {
      this.reportNonFatalLoggingFailure(
        CACHE_HYDRATION_LOG_MSG.LOGGER_INIT_UNAVAILABLE,
        error,
      );
    }
    return console;
  }

  /**
   * Best-effort reporting for non-fatal logger/metrics path failures.
   *
   * @param {string} message - Context message.
   * @param {Error} error - Underlying error.
   * @private
   */
  reportNonFatalLoggingFailure(message, error) {
    if (typeof console?.debug !== LOCAL_STR_FUNCTION) {
      return;
    }
    console.debug(message, {error: error?.message || null});
  }

  /**
   * Get the list of system tables to hydrate.
   * @return {Array<string>} Array of system table names
   */
  getSystemTables() {
    return [...CACHE_HYDRATION_TABLES];
  }

  /**
   * Hydrate the cache with existing data from all system table partitions.
   * Called after bootstrap completes and Raft leadership is established.
   * Does NOT generate CDC events - directly populates the cache.
   *
   * Requirements: 1.1, 1.2, 1.5, 1.7
   *
   * @return {Promise<Object>} Hydration result with counts per table
   */
  async hydrateCache() {
    this.logger.info(CACHE_HYDRATION_LOG_MSG.STARTING);
    const totalStartMs = this.now();
    let totalRows = 0;

    const results = {
      success: true,
      tables: {},
      errors: [],
    };

    for (const tableName of CACHE_HYDRATION_TABLES) {
      try {
        const rowCount = await this.hydrateTable(tableName);
        totalRows += rowCount;
        results.tables[tableName] = {
          success: true,
          rowCount,
        };

        this.logger.info(CACHE_HYDRATION_LOG_MSG.TABLE_HYDRATED, {
          tableName,
          rowCount,
        });
      } catch (error) {
        this.logger.error(CACHE_HYDRATION_LOG_MSG.TABLE_FAILED, {
          tableName,
          error: error.message,
        });
        results.tables[tableName] = {
          success: false,
          error: error.message,
        };
        results.errors.push({
          tableName,
          error: error.message,
        });
      }
    }

    // Mark overall success as false if any table failed
    if (results.errors.length > 0) {
      results.success = false;
    }

    this.logger.info(CACHE_HYDRATION_LOG_MSG.COMPLETE, {
      tablesHydrated: Object.keys(results.tables).length,
      errors: results.errors.length,
    });

    try {
      this.logger.info(METRICS_LOG_TAG.HYDRATION_COMPLETE, {
        tableCount: CACHE_HYDRATION_TABLES.length,
        totalDurationMs: this.now() - totalStartMs,
        totalRows,
      });
    } catch (error) {
      this.reportNonFatalLoggingFailure(
        CACHE_HYDRATION_LOG_MSG.METRICS_LOG_UNAVAILABLE,
        error,
      );
    }

    return results;
  }

  /**
   * Hydrate a single system table.
   * @param {string} tableName - Name of the system table to hydrate
   * @return {Promise<number>} Number of rows hydrated
   * @private
   */
  async hydrateTable(tableName) {
    const startMs = this.now();
    const sql = CACHE_HYDRATION_SQL.selectAll(tableName);
    const result = await this.queryEngine.executeQuery(sql);

    if (!result.success) {
      throw new Error(
        result.error || CACHE_HYDRATION_ERROR_MSG.queryFailed(tableName),
      );
    }

    const rows = result.rows || [];

    for (const row of rows) {
      await this.cdcEventApplier(tableName, CDC_OPERATION.INSERT, row);
    }

    const rowCount = rows.length;
    const durationMs = this.now() - startMs;
    try {
      this.logger.info(METRICS_LOG_TAG.HYDRATION_TABLE, {
        tableName,
        rowCount,
        durationMs,
        rowsPerSecond: durationMs > 0 ?
          Math.round(
            rowCount / (durationMs / CACHE_HYDRATION_METRICS.MS_PER_SECOND),
          ) :
          CACHE_HYDRATION_METRICS.ZERO_ROWS_PER_SECOND,
      });
    } catch (error) {
      this.reportNonFatalLoggingFailure(
        CACHE_HYDRATION_LOG_MSG.METRICS_LOG_UNAVAILABLE,
        error,
      );
    }

    return rowCount;
  }
}

export {
  CacheHydrationService,
  CACHE_HYDRATION_TABLES as SYSTEM_TABLES_TO_HYDRATE,
};
