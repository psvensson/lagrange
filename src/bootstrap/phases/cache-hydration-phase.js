/**
 * Cache Hydration Phase - Fifth phase of bootstrap process.
 *
 * Populates system cache from partition data and creates SQLQueryEngine.
 * After this phase, cache becomes the single source of truth.
 *
 * Requirements: 2.5, 1.7, 6.5
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {SQLQueryEngine} from '../../query/sql-query-engine.js';
import {assertCritical} from '../../utils/assert.js';
import {NUM, CDC_OPERATION} from '../../constants/index.js';
import {
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_ERROR,
} from '../bootstrap-constants.js';
import {
  SystemTableName,
  INITIAL_PARTITION_IDS,
} from '../system-table-schemas-constants.js';

/**
 * Phase constants for cache hydration.
 */
const CACHE_HYDRATION_PHASE = {
  NAME: 'cache_hydration',
  EVENT_START: 'cache_hydration:start',
  EVENT_COMPLETE: 'cache_hydration:complete',
  EVENT_FAILED: 'cache_hydration:failed',
};

/**
 * System tables to hydrate.
 */
const SYSTEM_TABLES_TO_HYDRATE = [
  SystemTableName.NODES,
  SystemTableName.PARTITIONS,
  SystemTableName.SERVICES,
  SystemTableName.TABLES,
  SystemTableName.MESSAGE_GROUPS,
  SystemTableName.REPLICA_OPERATIONS,
  SystemTableName.INDICES,
  SystemTableName.CONFIG,
  SystemTableName.LOGS,
  SystemTableName.LIVE_QUERIES,
  SystemTableName.CONTEXTS,
  SystemTableName.CODE,
];

/**
 * Expected tables that must be populated.
 */
const EXPECTED_TABLES = [
  SystemTableName.PARTITIONS,
  SystemTableName.SERVICES,
  SystemTableName.TABLES,
  SystemTableName.MESSAGE_GROUPS,
];

/**
 * CacheHydrationPhase handles the fifth phase of bootstrap.
 * Populates system cache and creates SQLQueryEngine.
 */
class CacheHydrationPhase extends EventEmitter {
  /**
   * Create cache hydration phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {Map} options.partitionServices - Partition services map (REQUIRED).
   * @param {Object} options.messageRouter - Message router (REQUIRED).
   * @param {Function} options.getSystemTableCache - Function to get system cache (REQUIRED).
   * @param {Function} options.getLeaderMessageGroupService - Function to get leader (REQUIRED).
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for CacheHydrationPhase',
    );
    this.partitionServices = assertCritical(
      options.partitionServices,
      'partitionServices is required for CacheHydrationPhase',
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      'messageRouter is required for CacheHydrationPhase',
    );
    this.getSystemTableCache = assertCritical(
      options.getSystemTableCache,
      'getSystemTableCache is required for CacheHydrationPhase',
    );
    this.getLeaderMessageGroupService = assertCritical(
      options.getLeaderMessageGroupService,
      'getLeaderMessageGroupService is required for CacheHydrationPhase',
    );

    // Services created during this phase
    this.sqlQueryEngine = null;
    this.systemTableCache = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) : console;
  }

  /**
   * Execute the cache hydration phase.
   * @return {Promise<Object>} Phase result with created services.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CACHE_HYDRATION_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      this.logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_STARTING, {
        nodeId: this.nodeId,
        partitionCount: this.partitionServices.size,
      });

      this.systemTableCache = this.getSystemTableCache();
      const leaderMessageGroup = this.getLeaderMessageGroupService();

      if (!leaderMessageGroup) {
        throw new Error(BOOTSTRAP_ERROR.CDC_HYDRATION_MISSING);
      }

      // Read all system table data directly from local partition services
      this.logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_READING, {
        nodeId: this.nodeId,
      });

      const result = await this.hydrateFromLocalPartitions(
        this.systemTableCache,
        leaderMessageGroup,
      );

      // Verify cache contains complete cluster state
      this.verifyCacheHydration(this.systemTableCache, result);

      // Create SQL query engine with populated cache
      // Requirements: 1.7, 6.5 - SQLQueryEngine created AFTER cache hydration
      this.sqlQueryEngine = new SQLQueryEngine({
        systemCache: this.systemTableCache,
        messageRouter: this.messageRouter,
        nodeId: this.nodeId,
      });

      this.logger.info(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_COMPLETE, {
        success: result.success,
        tablesHydrated: Object.keys(result.tables).length,
        totalRows: this.countTotalRows(result),
        errors: result.errors.length,
        nodeId: this.nodeId,
      });

      const duration = Date.now() - startTime;

      const phaseResult = {
        phaseName: CACHE_HYDRATION_PHASE.NAME,
        duration,
        services: {
          systemTableCache: this.systemTableCache,
          sqlQueryEngine: this.sqlQueryEngine,
        },
        metadata: {
          tablesHydrated: Object.keys(result.tables).length,
          totalRows: this.countTotalRows(result),
          errors: result.errors.length,
        },
      };

      this.emit(CACHE_HYDRATION_PHASE.EVENT_COMPLETE, phaseResult);

      return phaseResult;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit(CACHE_HYDRATION_PHASE.EVENT_FAILED, {
        phaseName: CACHE_HYDRATION_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Hydrate cache by reading directly from local partition services.
   * @param {Object} systemTableCache - System table cache.
   * @param {Object} leaderMessageGroup - Leader message group for CDC events.
   * @return {Promise<Object>} Hydration result.
   * @private
   */
  async hydrateFromLocalPartitions(systemTableCache, leaderMessageGroup) {
    const result = {
      success: true,
      tables: {},
      errors: [],
    };

    for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
      try {
        const partitionId = INITIAL_PARTITION_IDS[tableName];
        if (!partitionId) {
          result.tables[tableName] = {
            success: false,
            error: `No partition ID for table: ${tableName}`,
          };
          result.errors.push({tableName, error: 'No partition ID'});
          continue;
        }

        // Find leader replica for this partition
        let leaderPartition = null;
        for (const partition of this.partitionServices.values()) {
          if (partition.partitionId === partitionId && partition.isLeader) {
            leaderPartition = partition;
            break;
          }
        }

        if (!leaderPartition) {
          result.tables[tableName] = {
            success: false,
            error: `No leader partition found for: ${tableName}`,
          };
          result.errors.push({tableName, error: 'No leader partition'});
          continue;
        }

        // Read all rows directly from the partition
        const sql = `SELECT * FROM ${tableName}`;
        const queryResult = await leaderPartition.executeQuery(sql);

        if (!queryResult.success) {
          result.tables[tableName] = {
            success: false,
            error: queryResult.error || 'Query failed',
          };
          result.errors.push({tableName, error: queryResult.error});
          continue;
        }

        const rows = queryResult.rows || [];

        // Apply each row to the cache via CDC event applier
        for (const row of rows) {
          await leaderMessageGroup.applyCDCEvent(tableName, CDC_OPERATION.INSERT, row, {
            skipReplication: true,
            skipSubscriptionCheck: true,
          });
        }

        result.tables[tableName] = {
          success: true,
          rowCount: rows.length,
        };

        this.logger.debug(BOOTSTRAP_LOG_MSG.TABLE_HYDRATED, {
          tableName,
          rowCount: rows.length,
        });
      } catch (error) {
        result.tables[tableName] = {
          success: false,
          error: error.message,
        };
        result.errors.push({tableName, error: error.message});

        this.logger.error(BOOTSTRAP_LOG_MSG.TABLE_HYDRATION_FAILED, {
          tableName,
          error: error.message,
        });
      }
    }

    if (result.errors.length > NUM.ZERO) {
      result.success = false;
    }

    return result;
  }

  /**
   * Verify cache hydration completed successfully.
   * @param {Object} systemTableCache - System table cache.
   * @param {Object} result - Hydration result.
   * @private
   */
  verifyCacheHydration(systemTableCache, result) {
    const missingTables = [];
    const emptyTables = [];

    for (const tableName of EXPECTED_TABLES) {
      if (!result.tables[tableName]) {
        missingTables.push(tableName);
        continue;
      }

      if (!result.tables[tableName].success) {
        missingTables.push(tableName);
        continue;
      }

      const rows = systemTableCache.getAll(tableName);
      if (!rows || rows.length === NUM.ZERO) {
        emptyTables.push(tableName);
      }
    }

    if (missingTables.length > NUM.ZERO || emptyTables.length > NUM.ZERO) {
      this.logger.error(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_INCOMPLETE, {
        missingTables,
        emptyTables,
        nodeId: this.nodeId,
      });
      const details = [
        `missing tables: ${missingTables.join(', ') || 'none'}`,
        `empty tables: ${emptyTables.join(', ') || 'none'}`,
      ];
      const error = new Error(
        `Cache hydration incomplete for required tables (${details.join('; ')})`,
      );
      error.missingTables = missingTables;
      error.emptyTables = emptyTables;
      throw error;
    } else {
      this.logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_VERIFIED, {
        tablesVerified: EXPECTED_TABLES.length,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Count total rows hydrated across all tables.
   * @param {Object} result - Hydration result.
   * @return {number} Total row count.
   * @private
   */
  countTotalRows(result) {
    let total = NUM.ZERO;
    for (const tableResult of Object.values(result.tables)) {
      if (tableResult.success && tableResult.rowCount) {
        total += tableResult.rowCount;
      }
    }
    return total;
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    this.sqlQueryEngine = null;
    this.systemTableCache = null;
  }
}

export {CacheHydrationPhase, CACHE_HYDRATION_PHASE};
