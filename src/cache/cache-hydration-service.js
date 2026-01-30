/**
 * Cache Hydration Service - Populates SystemTableCache on startup.
 * Queries system table partitions and populates the cache with existing data.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
 */

import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION} from '../constants/index.js';
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
    // Hydration is explicitly non-CDC: apply rows straight into the cache by default.
    // Tests and bootstrap can inject a custom applier if they need extra behavior.
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

    const results = {
      success: true,
      tables: {},
      errors: [],
    };

    for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
      try {
        const rowCount = await this.hydrateTable(tableName);
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

    return results;
  }

  /**
   * Hydrate a single system table.
   * @param {string} tableName - Name of the system table to hydrate
   * @return {Promise<number>} Number of rows hydrated
   * @private
   */
  async hydrateTable(tableName) {
    const sql = `SELECT * FROM ${tableName}`;
    const result = await this.queryEngine.executeQuery(sql);

    if (!result.success) {
      throw new Error(result.error || CACHE_HYDRATION_ERROR_MSG.QUERY_FAILED(tableName));
    }

    const rows = result.rows || [];

    for (const row of rows) {
      await this.cdcEventApplier(tableName, CDC_OPERATION.INSERT, row);
    }

    return rows.length;
  }
}

export {CacheHydrationService, SYSTEM_TABLES_TO_HYDRATE};
