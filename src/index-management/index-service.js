/**
 * Index Service - Manages database indices for query optimization.
 * Supports creating indices on table columns and storing metadata in indices system table.
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {STRING, TABLES} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  INDEX_CONFIG_KEY,
  INDEX_DEFAULTS,
  INDEX_ERROR_MSG,
  INDEX_LOG_MSG,
  INDEX_SUBSYSTEM,
  INDEX_TYPE,
} from './index-constants.js';

/**
 * Index types supported by the system.
 */
const IndexType = INDEX_TYPE;

/**
 * IndexService manages database indices for query optimization.
 * Indices are stored in the indices system table and maintained
 * automatically when data changes occur.
 */
class IndexService {
  /**
   * Create a new IndexService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   */
  constructor(options = {}) {
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultIndexType = config.get(INDEX_CONFIG_KEY.DEFAULT_TYPE) ||
      INDEX_DEFAULTS.DEFAULT_TYPE;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(INDEX_SUBSYSTEM.INDEX_SERVICE) : console;

    // Track indices by table for quick lookup
    this.indexCache = new Map(); // tableId -> Map(indexName -> indexMetadata)

    this.initialized = false;
  }

  /**
   * Initialize the index service.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZING);

    // Load existing indices from system table cache
    await this.loadIndicesFromCache();

    this.initialized = true;
    this.logger.info(INDEX_LOG_MSG.SERVICE_INITIALIZED, {
      indexCount: this.getTotalIndexCount(),
    });
  }

  /**
   * Load indices from system table cache.
   * @return {Promise<void>}
   * @private
   */
  async loadIndicesFromCache() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      INDEX_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      const indices = systemTableCache.getAll(TABLES.INDICES) || [];

      for (const index of indices) {
        const tableId = index.table_id;
        if (!this.indexCache.has(tableId)) {
          this.indexCache.set(tableId, new Map());
        }

        const indexMetadata = {
          indexId: index.index_id,
          tableId: index.table_id,
          indexName: index.index_name,
          columnNames: JSON.parse(index.column_names || STRING.EMPTY_JSON_ARRAY),
          indexType: index.index_type || INDEX_TYPE.BTREE,
          createdAt: index.created_at,
        };

        this.indexCache.get(tableId).set(index.index_name, indexMetadata);
      }

      this.logger.debug(INDEX_LOG_MSG.INDICES_LOADED, {
        indexCount: this.getTotalIndexCount(),
      });
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.INDICES_LOAD_FAILED, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new index on a table.
   * Requirements: 12.1, 12.2
   * @param {Object} options - Index creation options.
   * @param {string} options.tableId - Table ID to create index on.
   * @param {string} options.tableName - Table name.
   * @param {string} options.indexName - Name for the index.
   * @param {Array<string>} options.columnNames - Column names to index.
   * @param {string} options.indexType - Index type (btree, hash).
   * @return {Promise<Object>} Created index metadata.
   */
  async createIndex(options) {
    const {
      tableId,
      tableName,
      indexName,
      columnNames,
      indexType = this.defaultIndexType,
    } = options;

    if (!tableId) {
      throw new Error(INDEX_ERROR_MSG.TABLE_ID_REQUIRED);
    }
    if (!indexName) {
      throw new Error(INDEX_ERROR_MSG.INDEX_NAME_REQUIRED);
    }
    if (!columnNames || columnNames.length === 0) {
      throw new Error(INDEX_ERROR_MSG.COLUMN_NAMES_REQUIRED);
    }

    this.logger.info(INDEX_LOG_MSG.CREATING_INDEX, {
      tableId,
      tableName,
      indexName,
      columnNames,
      indexType,
    });

    // Check if index already exists
    if (this.indexExists(tableId, indexName)) {
      throw new Error(
        `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_PREFIX}${indexName}` +
        `${INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_MIDDLE}${tableId}` +
        INDEX_ERROR_MSG.INDEX_ALREADY_EXISTS_SUFFIX,
      );
    }

    // Generate index ID
    const indexId = `idx-${uuidv4()}`;
    const createdAt = Date.now();

    // Create index metadata
    const indexMetadata = {
      indexId,
      tableId,
      indexName,
      columnNames,
      indexType,
      createdAt,
    };

    // Store in indices system table via CDC
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.insertSystemTableRow(TABLES.INDICES, {
        index_id: indexId,
        table_id: tableId,
        index_name: indexName,
        column_names: JSON.stringify(columnNames),
        index_type: indexType,
        created_at: createdAt,
      });
    }

    // Create actual SQLite index on all partitions for this table
    await this.createSQLiteIndex(tableId, tableName, indexName, columnNames);

    // Update local cache
    if (!this.indexCache.has(tableId)) {
      this.indexCache.set(tableId, new Map());
    }
    this.indexCache.get(tableId).set(indexName, indexMetadata);

    this.logger.info(INDEX_LOG_MSG.INDEX_CREATED, {
      indexId,
      tableId,
      indexName,
    });

    return indexMetadata;
  }

  /**
   * Create SQLite index on all partitions for a table.
   * Requirements: 12.5
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {string} indexName - Index name.
   * @param {Array<string>} columnNames - Column names.
   * @return {Promise<void>}
   * @private
   */
  async createSQLiteIndex(tableId, tableName, indexName, columnNames) {
    // Get all partitions for this table
    const partitions = this.getPartitionsForTable(tableId);

    if (partitions.length === 0) {
      this.logger.warn(INDEX_LOG_MSG.NO_PARTITIONS_FOR_TABLE, {tableId, tableName});
      return;
    }

    const columns = columnNames.join(', ');
    const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`;

    this.logger.debug(INDEX_LOG_MSG.CREATING_SQLITE_INDEX, {
      tableId,
      indexName,
      partitionCount: partitions.length,
    });

    // Create index on each partition
    const results = await Promise.allSettled(
      partitions.map(async (partition) => {
        try {
          await partition.executeQuery(sql, []);
          return {partitionId: partition.partitionId, success: true};
        } catch (error) {
          this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
            partitionId: partition.partitionId,
            indexName,
            error: error.message,
          });
          throw error;
        }
      }),
    );

    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }

    const successCount = results.filter((r) =>
      r.status === 'fulfilled' && r.value.success,
    ).length;

    this.logger.debug(INDEX_LOG_MSG.SQLITE_INDEX_COMPLETED, {
      indexName,
      successCount,
      totalPartitions: partitions.length,
    });
  }

  /**
   * Get all partitions for a table.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Array of partition services.
   * @private
   */
  getPartitionsForTable(tableId) {
    const partitions = [];

    // Get partition IDs from system table cache
    const systemTableCache = assertCritical(
      this.systemTableCache,
      INDEX_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitionRecords = systemTableCache.filter(
      TABLES.PARTITIONS,
      (p) => p.table_id === tableId,
    ) || [];

    for (const record of partitionRecords) {
      const partition = this.getPartition(record.partition_id);
      if (partition) {
        partitions.push(partition);
      }
    }

    return partitions;
  }

  /**
   * Get a partition by ID from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition info or null.
   * @private
   */
  getPartition(partitionId) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      INDEX_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    return systemTableCache.get(TABLES.PARTITIONS, partitionId);
  }

  /**
   * Drop an index from a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name to drop.
   * @return {Promise<boolean>} True if dropped successfully.
   */
  async dropIndex(tableId, indexName) {
    this.logger.info(INDEX_LOG_MSG.DROPPING_INDEX, {tableId, indexName});

    // Get index metadata
    const indexMetadata = this.getIndex(tableId, indexName);
    if (!indexMetadata) {
      throw new Error(
        `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_PREFIX}${indexName}` +
        `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_MIDDLE}${tableId}` +
        INDEX_ERROR_MSG.INDEX_NOT_FOUND_SUFFIX,
      );
    }

    // Drop from indices system table via CDC
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.deleteSystemTableRow(TABLES.INDICES, {
        index_id: indexMetadata.indexId,
      });
    }

    // Drop SQLite index from all partitions
    await this.dropSQLiteIndex(tableId, indexName);

    // Remove from local cache
    if (this.indexCache.has(tableId)) {
      this.indexCache.get(tableId).delete(indexName);
    }

    this.logger.info(INDEX_LOG_MSG.INDEX_DROPPED, {
      indexId: indexMetadata.indexId,
      tableId,
      indexName,
    });

    return true;
  }

  /**
   * Drop SQLite index from all partitions for a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<void>}
   * @private
   */
  async dropSQLiteIndex(tableId, indexName) {
    const partitions = this.getPartitionsForTable(tableId);
    const sql = `DROP INDEX IF EXISTS ${indexName}`;

    const results = await Promise.allSettled(
      partitions.map(async (partition) => {
        try {
          await partition.executeQuery(sql, []);
        } catch (error) {
          this.logger.error(INDEX_LOG_MSG.INDEX_DROP_FAILED, {
            partitionId: partition.partitionId,
            indexName,
            error: error.message,
          });
          throw error;
        }
      }),
    );

    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) {
      throw rejected.reason;
    }
  }

  /**
   * Check if an index exists.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {boolean} True if index exists.
   */
  indexExists(tableId, indexName) {
    if (!this.indexCache.has(tableId)) {
      return false;
    }
    return this.indexCache.get(tableId).has(indexName);
  }

  /**
   * Get index metadata.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Object|null} Index metadata or null.
   */
  getIndex(tableId, indexName) {
    if (!this.indexCache.has(tableId)) {
      return null;
    }
    return this.indexCache.get(tableId).get(indexName) || null;
  }

  /**
   * Get all indices for a table.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Array of index metadata.
   */
  getIndicesForTable(tableId) {
    if (!this.indexCache.has(tableId)) {
      return [];
    }
    return Array.from(this.indexCache.get(tableId).values());
  }

  /**
   * Get all indices in the system.
   * @return {Array<Object>} Array of all index metadata.
   */
  getAllIndices() {
    const indices = [];
    for (const tableIndices of this.indexCache.values()) {
      indices.push(...tableIndices.values());
    }
    return indices;
  }

  /**
   * Get total index count.
   * @return {number} Total number of indices.
   */
  getTotalIndexCount() {
    let count = 0;
    for (const tableIndices of this.indexCache.values()) {
      count += tableIndices.size;
    }
    return count;
  }

  /**
   * Handle CDC event for index cache updates.
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   */
  async handleCDCEvent(cdcEvent) {
    // Handle indices table CDC events
    if (cdcEvent.tableName === TABLES.INDICES) {
      await this.handleIndicesCDCEvent(cdcEvent);
      return;
    }

    // Handle partitions table CDC events for automatic index maintenance
    if (cdcEvent.tableName === TABLES.PARTITIONS) {
      await this.handlePartitionsCDCEvent(cdcEvent);
      return;
    }
  }

  /**
   * Handle CDC events for the indices table.
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   * @private
   */
  async handleIndicesCDCEvent(cdcEvent) {
    const {operation, data} = cdcEvent;

    switch (operation) {
    case 'INSERT': {
      const tableId = data.table_id;
      if (!this.indexCache.has(tableId)) {
        this.indexCache.set(tableId, new Map());
      }

      const indexMetadata = {
        indexId: data.index_id,
        tableId: data.table_id,
        indexName: data.index_name,
        columnNames: JSON.parse(data.column_names || STRING.EMPTY_JSON_ARRAY),
        indexType: data.index_type || IndexType.BTREE,
        createdAt: data.created_at,
      };

      this.indexCache.get(tableId).set(data.index_name, indexMetadata);
      this.logger.debug(INDEX_LOG_MSG.INDEX_ADDED_FROM_CDC, {
        indexId: data.index_id,
        indexName: data.index_name,
      });
      break;
    }

    case 'DELETE': {
      const tableId = data.table_id;
      if (this.indexCache.has(tableId)) {
        this.indexCache.get(tableId).delete(data.index_name);
        this.logger.debug(INDEX_LOG_MSG.INDEX_REMOVED_FROM_CDC, {
          indexId: data.index_id,
          indexName: data.index_name,
        });
      }
      break;
    }

    default:
      // UPDATE not typically used for indices
      break;
    }
  }

  /**
   * Handle CDC events for the partitions table.
   * When a new partition is created, ensure all indices for that table
   * are created on the new partition.
   * Requirements: 12.3, 12.5
   * @param {Object} cdcEvent - CDC event.
   * @return {Promise<void>}
   * @private
   */
  async handlePartitionsCDCEvent(cdcEvent) {
    const {operation, data} = cdcEvent;

    // Only handle INSERT events (new partitions)
    if (operation !== 'INSERT') {
      return;
    }

    const tableId = data.table_id;
    const partitionId = data.partition_id;

    // Get all indices for this table
    const indices = this.getIndicesForTable(tableId);

    if (indices.length === 0) {
      return;
    }

    this.logger.info(INDEX_LOG_MSG.CREATING_INDICES_FOR_PARTITION, {
      tableId,
      partitionId,
      indexCount: indices.length,
    });

    // Create each index on the new partition
    for (const index of indices) {
      await this.createIndexOnPartition(partitionId, index);
    }
  }

  /**
   * Create an index on a specific partition.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {Object} indexMetadata - Index metadata.
   * @return {Promise<boolean>} True if successful.
   * @private
   */
  async createIndexOnPartition(partitionId, indexMetadata) {
    const partition = this.getPartition(partitionId);

    if (!partition) {
      this.logger.warn(INDEX_LOG_MSG.PARTITION_NOT_FOUND, {
        partitionId,
        indexName: indexMetadata.indexName,
      });
      return false;
    }

    const tableName = partition.tableName;
    const columns = indexMetadata.columnNames.join(', ');
    const sql = `CREATE INDEX IF NOT EXISTS ${indexMetadata.indexName} ` +
                `ON ${tableName}(${columns})`;

    try {
      await partition.executeQuery(sql, []);
      this.logger.debug(INDEX_LOG_MSG.INDEX_CREATED_ON_PARTITION, {
        partitionId,
        indexName: indexMetadata.indexName,
      });
      return true;
    } catch (error) {
      this.logger.error(INDEX_LOG_MSG.PARTITION_INDEX_FAILED, {
        partitionId,
        indexName: indexMetadata.indexName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Ensure all indices exist on a partition.
   * Called when a partition is registered or becomes available.
   * Requirements: 12.3, 12.5
   * @param {string} partitionId - Partition ID.
   * @param {string} tableId - Table ID.
   * @return {Promise<number>} Number of indices created.
   */
  async ensureIndicesOnPartition(partitionId, tableId) {
    const indices = this.getIndicesForTable(tableId);

    if (indices.length === 0) {
      return 0;
    }

    this.logger.debug(INDEX_LOG_MSG.ENSURING_INDICES, {
      partitionId,
      tableId,
      indexCount: indices.length,
    });

    let createdCount = 0;
    for (const index of indices) {
      const success = await this.createIndexOnPartition(partitionId, index);
      if (success) {
        createdCount++;
      }
    }

    return createdCount;
  }

  /**
   * Rebuild an index on all partitions for a table.
   * Useful for maintenance or after schema changes.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name.
   * @return {Promise<Object>} Rebuild result.
   */
  async rebuildIndex(tableId, indexName) {
    const indexMetadata = this.getIndex(tableId, indexName);

    if (!indexMetadata) {
      throw new Error(
        `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_PREFIX}${indexName}` +
        `${INDEX_ERROR_MSG.INDEX_NOT_FOUND_MIDDLE}${tableId}` +
        INDEX_ERROR_MSG.INDEX_NOT_FOUND_SUFFIX,
      );
    }

    this.logger.info(INDEX_LOG_MSG.REBUILDING_INDEX, {tableId, indexName});

    const partitions = this.getPartitionsForTable(tableId);
    let successCount = 0;
    const failCount = 0;

    for (const partition of partitions) {
      const tableName = partition.tableName;
      const columns = indexMetadata.columnNames.join(', ');

      try {
        // Drop and recreate the index
        await partition.executeQuery(`DROP INDEX IF EXISTS ${indexName}`, []);
        await partition.executeQuery(
          `CREATE INDEX ${indexName} ON ${tableName}(${columns})`,
          [],
        );
        successCount++;
      } catch (error) {
        this.logger.error(INDEX_LOG_MSG.INDEX_REBUILD_FAILED, {
          partitionId: partition.partitionId,
          indexName,
          error: error.message,
        });
        throw error;
      }
    }

    return {
      indexName,
      tableId,
      totalPartitions: partitions.length,
      successCount,
      failCount,
    };
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }

  /**
   * Shutdown the index service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info(INDEX_LOG_MSG.SHUTTING_DOWN);
    this.indexCache.clear();
    this.initialized = false;
  }
}

export {IndexService, IndexType};
