/**
 * Cache Hydration Service - Populates SystemTableCache on startup.
 * Queries system table partitions and populates the cache with existing data.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, METRICS_LOG_TAG} from '../constants/index.js';
import {
  CACHE_HYDRATION_ERROR_MSG,
  CACHE_HYDRATION_LOG_MSG,
  CACHE_HYDRATION_TABLES,
  CACHE_SUBSYSTEM,
} from './cache-constants.js';

/**
 * System tables to hydrate on startup.
 * These are the core system tables that the Admin CLI needs.
 */
const SYSTEM_TABLES_TO_HYDRATE = CACHE_HYDRATION_TABLES;

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
  constructor(queryEngine, systemTableCache, options = {}) {
    this.queryEngine = queryEngine;
    this.systemTableCache = systemTableCache;
    this.logger = options.logger || this.initLogger();
    // Bootstrap hydration exception: apply rows directly before CDC catches up.
    // Tests/bootstrap can inject a custom applier for specialized behavior.
    // See architecture.md: Sanctioned direct applySystemTableChange call sites.
    this.cdcEventApplier = options.cdcEventApplier || (async (tableName, op, row) => {
      this.systemTableCache.applySystemTableChange(tableName, op, row);
    });
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
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Get the list of system tables to hydrate.
   * @return {Array<string>} Array of system table names
   */
  getSystemTables() {
    return [...SYSTEM_TABLES_TO_HYDRATE];
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
    const totalStartMs = Date.now();
    let totalRows = 0;

    const results = {
      success: true,
      tables: {},
      errors: [],
    };

    for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
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
        tableCount: SYSTEM_TABLES_TO_HYDRATE.length,
        totalDurationMs: Date.now() - totalStartMs,
        totalRows,
      });
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
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
    const startMs = Date.now();
    const sql = `SELECT * FROM ${tableName}`;
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
    const durationMs = Date.now() - startMs;
    try {
      this.logger.info(METRICS_LOG_TAG.HYDRATION_TABLE, {
        tableName,
        rowCount,
        durationMs,
        rowsPerSecond: durationMs > 0 ?
          Math.round(rowCount / (durationMs / 1000)) : 0,
      });
    } catch (_metricsErr) {
      // Metrics logging must not propagate to callers
    }

    return rowCount;
  }
}

export {CacheHydrationService, SYSTEM_TABLES_TO_HYDRATE};
