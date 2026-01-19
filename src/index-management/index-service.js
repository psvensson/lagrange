/**
 * Index Service - Manages database indices for query optimization.
 * Supports creating indices on table columns and storing metadata in indices system table.
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Index types supported by the system.
 */
const IndexType = {
  BTREE: 'btree',
  HASH: 'hash',
};

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
   * @param {Object} options.partitionRegistry - Registry of partition services.
   */
  constructor(options = {}) {
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.partitionRegistry = options.partitionRegistry || new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultIndexType = config.get('index.defaultType') || IndexType.BTREE;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('index-service') : console;

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

    this.logger.info('Initializing index service');

    // Load existing indices from system table cache
    await this.loadIndicesFromCache();

    this.initialized = true;
    this.logger.info('Index service initialized', {
      indexCount: this.getTotalIndexCount(),
    });
  }

  /**
   * Load indices from system table cache.
   * @return {Promise<void>}
   * @private
   */
  async loadIndicesFromCache() {
    if (!this.systemTableCache) {
      return;
    }

    try {
      const indices = this.systemTableCache.getAll('indices') || [];

      for (const index of indices) {
        const tableId = index.table_id;
        if (!this.indexCache.has(tableId)) {
          this.indexCache.set(tableId, new Map());
        }

        const indexMetadata = {
          indexId: index.index_id,
          tableId: index.table_id,
          indexName: index.index_name,
          columnNames: JSON.parse(index.column_names || '[]'),
          indexType: index.index_type || IndexType.BTREE,
          createdAt: index.created_at,
        };

        this.indexCache.get(tableId).set(index.index_name, indexMetadata);
      }

      this.logger.debug('Loaded indices from cache', {
        indexCount: this.getTotalIndexCount(),
      });
    } catch (error) {
      this.logger.error('Failed to load indices from cache', {
        error: error.message,
      });
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
      throw new Error('tableId is required');
    }
    if (!indexName) {
      throw new Error('indexName is required');
    }
    if (!columnNames || columnNames.length === 0) {
      throw new Error('columnNames is required and must not be empty');
    }

    this.logger.info('Creating index', {
      tableId,
      tableName,
      indexName,
      columnNames,
      indexType,
    });

    // Check if index already exists
    if (this.indexExists(tableId, indexName)) {
      throw new Error(`Index '${indexName}' already exists on table '${tableId}'`);
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
      await this.cdcIntegrationService.insertSystemTableRow('indices', {
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

    this.logger.info('Index created successfully', {
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
      this.logger.warn('No partitions found for table', {tableId, tableName});
      return;
    }

    const columns = columnNames.join(', ');
    const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columns})`;

    this.logger.debug('Creating SQLite index on partitions', {
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
          this.logger.error('Failed to create index on partition', {
            partitionId: partition.partitionId,
            indexName,
            error: error.message,
          });
          return {partitionId: partition.partitionId, success: false, error: error.message};
        }
      }),
    );

    const successCount = results.filter((r) =>
      r.status === 'fulfilled' && r.value.success,
    ).length;

    this.logger.debug('SQLite index creation completed', {
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
    if (this.systemTableCache) {
      const partitionRecords = this.systemTableCache.filter(
        'partitions',
        (p) => p.table_id === tableId,
      ) || [];

      for (const record of partitionRecords) {
        const partition = this.getPartition(record.partition_id);
        if (partition) {
          partitions.push(partition);
        }
      }
    }

    // Fallback: search partition registry directly
    if (partitions.length === 0 && this.partitionRegistry) {
      const registry = this.partitionRegistry instanceof Map ?
        this.partitionRegistry : new Map(Object.entries(this.partitionRegistry));

      for (const partition of registry.values()) {
        if (partition.tableId === tableId) {
          partitions.push(partition);
        }
      }
    }

    return partitions;
  }

  /**
   * Get a partition by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition service or null.
   * @private
   */
  getPartition(partitionId) {
    if (this.partitionRegistry instanceof Map) {
      return this.partitionRegistry.get(partitionId);
    }
    return this.partitionRegistry[partitionId] || null;
  }

  /**
   * Drop an index from a table.
   * @param {string} tableId - Table ID.
   * @param {string} indexName - Index name to drop.
   * @return {Promise<boolean>} True if dropped successfully.
   */
  async dropIndex(tableId, indexName) {
    this.logger.info('Dropping index', {tableId, indexName});

    // Get index metadata
    const indexMetadata = this.getIndex(tableId, indexName);
    if (!indexMetadata) {
      throw new Error(`Index '${indexName}' not found on table '${tableId}'`);
    }

    // Drop from indices system table via CDC
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.deleteSystemTableRow('indices', {
        index_id: indexMetadata.indexId,
      });
    }

    // Drop SQLite index from all partitions
    await this.dropSQLiteIndex(tableId, indexName);

    // Remove from local cache
    if (this.indexCache.has(tableId)) {
      this.indexCache.get(tableId).delete(indexName);
    }

    this.logger.info('Index dropped successfully', {
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

    await Promise.allSettled(
      partitions.map(async (partition) => {
        try {
          await partition.executeQuery(sql, []);
        } catch (error) {
          this.logger.error('Failed to drop index on partition', {
            partitionId: partition.partitionId,
            indexName,
            error: error.message,
          });
        }
      }),
    );
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
    if (cdcEvent.tableName === 'indices') {
      await this.handleIndicesCDCEvent(cdcEvent);
      return;
    }

    // Handle partitions table CDC events for automatic index maintenance
    if (cdcEvent.tableName === 'partitions') {
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
        columnNames: JSON.parse(data.column_names || '[]'),
        indexType: data.index_type || IndexType.BTREE,
        createdAt: data.created_at,
      };

      this.indexCache.get(tableId).set(data.index_name, indexMetadata);
      this.logger.debug('Index added to cache via CDC', {
        indexId: data.index_id,
        indexName: data.index_name,
      });
      break;
    }

    case 'DELETE': {
      const tableId = data.table_id;
      if (this.indexCache.has(tableId)) {
        this.indexCache.get(tableId).delete(data.index_name);
        this.logger.debug('Index removed from cache via CDC', {
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

    this.logger.info('Creating indices on new partition', {
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
      this.logger.warn('Partition not found for index creation', {
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
      this.logger.debug('Index created on partition', {
        partitionId,
        indexName: indexMetadata.indexName,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to create index on partition', {
        partitionId,
        indexName: indexMetadata.indexName,
        error: error.message,
      });
      return false;
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

    this.logger.debug('Ensuring indices on partition', {
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
      throw new Error(`Index '${indexName}' not found on table '${tableId}'`);
    }

    this.logger.info('Rebuilding index', {tableId, indexName});

    const partitions = this.getPartitionsForTable(tableId);
    let successCount = 0;
    let failCount = 0;

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
        this.logger.error('Failed to rebuild index on partition', {
          partitionId: partition.partitionId,
          indexName,
          error: error.message,
        });
        failCount++;
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
   * Set the partition registry.
   * @param {Map|Object} registry - Partition registry.
   */
  setPartitionRegistry(registry) {
    this.partitionRegistry = registry;
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
    this.logger.info('Shutting down index service');
    this.indexCache.clear();
    this.initialized = false;
  }
}

export {IndexService, IndexType};
