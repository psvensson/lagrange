/**
 * Cache Hydration Service - Populates SystemTableCache on startup.
 * Queries system table partitions and populates the cache with existing data.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
 */

import {LoggingService} from '../logging/logging-service.js';

/**
 * System tables to hydrate on startup.
 * These are the core system tables that the Admin CLI needs.
 */
const SYSTEM_TABLES_TO_HYDRATE = [
  'nodes',
  'services',
  'tables',
  'partitions',
  'message_groups',
  'indices',
];

/**
 * CacheHydrationService populates the SystemTableCache with existing data
 * from system table partitions on startup.
 */
class CacheHydrationService {
  /**
   * Create a new CacheHydrationService.
   * @param {Object} queryEngine - SQL query engine for querying partitions
   * @param {Object} systemTableCache - SystemTableCache to populate
   * @param {Object} [logger] - Optional logger instance
   */
  constructor(queryEngine, systemTableCache, logger = null) {
    this.queryEngine = queryEngine;
    this.systemTableCache = systemTableCache;
    this.logger = logger || this.initLogger();
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
        return loggingService.forSubsystem('cache-hydration');
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
    this.logger.info('Starting cache hydration');

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

        this.logger.info('Hydrated system table cache', {
          tableName,
          rowCount,
        });
      } catch (error) {
        // Log error but continue with other tables (Requirement 1.5)
        results.tables[tableName] = {
          success: false,
          error: error.message,
        };
        results.errors.push({tableName, error: error.message});

        this.logger.error('Failed to hydrate system table', {
          tableName,
          error: error.message,
        });
      }
    }

    // Mark overall success as false if any table failed
    if (results.errors.length > 0) {
      results.success = false;
    }

    this.logger.info('Cache hydration complete', {
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
      throw new Error(result.error || `Failed to query ${tableName}`);
    }

    const rows = result.rows || [];

    for (const row of rows) {
      // Direct cache population - no CDC event (Requirement 1.6)
      this.systemTableCache.applySystemTableChange(
        tableName,
        'INSERT',
        row,
      );
    }

    return rows.length;
  }
}

export {CacheHydrationService, SYSTEM_TABLES_TO_HYDRATE};
