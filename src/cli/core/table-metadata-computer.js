const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

/**
 * Table Metadata Computer - Computes display metadata from cached partition data
 *
 * Computes partition_count and replica_factor for tables based on partition data
 * in the Remote Cache. Implements caching to avoid redundant calculations.
 * Uses selective invalidation to only recompute metadata for tables affected
 * by CDC events.
 *
 * Requirements: 4.6, 4.7, 12.10, 13.8, 13.9
 */

/**
 * TableMetadataComputer computes display metadata (partition_count, replica_factor)
 * from cached partition data.
 */
export class TableMetadataComputer {
  /**
   * Creates a new TableMetadataComputer
   * @param {Object} cache - The RemoteCache instance to read partition data from
   */
  constructor(cache) {
    this.cache = cache;
    this.metadataCache = new Map();
    this.lastCacheUpdate = null;
  }

  /**
   * Compute enriched metadata for a table
   * Requirements: 4.6, 4.7, 12.10, 13.8, 13.9
   * @param {Object} table - The table record to enrich
   * @return {Object} Table with computed partition_count and replica_factor
   */
  computeMetadata(table) {
    if (!table || !table.table_id) {
      return table;
    }

    // Always check for and process affected tables (Requirements: 12.10, 13.8)
    // This handles CDC events that may have occurred since last computation
    this.invalidateAffectedTables();

    // Check metadata cache first
    const cacheKey = table.table_id;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    // Compute metadata
    const enriched = {
      ...table,
      partition_count: this.computePartitionCount(table.table_id),
      replica_factor: this.computeReplicaFactor(table.table_id),
      total_size: this.computeTotalSize(table.table_id),
    };

    // Cache the result
    this.metadataCache.set(cacheKey, enriched);
    this.lastCacheUpdate = Date.now();
    return enriched;
  }

  /**
   * Invalidate metadata cache only for tables affected by CDC events
   * Requirements: 12.10, 13.8
   */
  invalidateAffectedTables() {
    const affectedTables = this.cache.getAndClearAffectedTables();
    for (const tableId of affectedTables) {
      this.metadataCache.delete(tableId);
    }
  }

  /**
   * Compute partition count for a table
   * Requirements: 4.6, 4.9
   * @param {string} tableId - The table ID
   * @return {number} Number of partitions for the table
   */
  computePartitionCount(tableId) {
    try {
      const partitions = this.cache.getPartitions({tableId});
      return partitions.length;
    } catch (_err) {
      // Graceful degradation - return 0 on error
      return LOCAL_NUM_ZERO;
    }
  }

  /**
   * Compute replica factor as the most common replica_count value
   * Requirements: 4.7
   * @param {string} tableId - The table ID
   * @return {number|null} Most common replica count, or null if no partitions
   */
  computeReplicaFactor(tableId) {
    try {
      const partitions = this.cache.getPartitions({tableId});
      if (partitions.length === LOCAL_NUM_ZERO) {
        return null;
      }

      // Count occurrences of each replica_count
      const counts = {};
      for (const partition of partitions) {
        const count = partition.replica_count;
        if (count !== undefined && count !== null) {
          counts[count] = (counts[count] || LOCAL_NUM_ZERO) + LOCAL_NUM_ONE;
        }
      }

      // Handle case where no partitions have replica_count
      if (Object.keys(counts).length === LOCAL_NUM_ZERO) {
        return null;
      }

      // Return most common value
      let maxCount = LOCAL_NUM_ZERO;
      let mostCommon = null;
      for (const [value, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = parseInt(value, 10);
        }
      }

      return mostCommon;
    } catch (_err) {
      // Graceful degradation - return null on error
      return null;
    }
  }

  /**
   * Compute total size of all partitions for a table
   * @param {string} tableId - The table ID
   * @return {number|null} Total size in bytes, or null if unavailable
   */
  computeTotalSize(tableId) {
    try {
      const partitions = this.cache.getPartitions({tableId});
      if (partitions.length === LOCAL_NUM_ZERO) {
        return LOCAL_NUM_ZERO;
      }

      let totalSize = LOCAL_NUM_ZERO;
      let hasValidSize = false;

      for (const partition of partitions) {
        if (partition.size_bytes !== undefined && partition.size_bytes !== null) {
          totalSize += partition.size_bytes;
          hasValidSize = true;
        }
      }

      return hasValidSize ? totalSize : null;
    } catch (_err) {
      // Graceful degradation - return null on error
      return null;
    }
  }

  /**
   * Invalidate the metadata cache
   * Should be called when partition data changes
   */
  invalidateCache() {
    this.metadataCache.clear();
  }

  /**
   * Invalidate metadata for a specific table
   * @param {string} tableId - The table ID to invalidate
   */
  invalidateTable(tableId) {
    this.metadataCache.delete(tableId);
  }

  /**
   * Get all tables with computed metadata
   * @return {Array} Array of tables with enriched metadata
   */
  getTablesWithMetadata() {
    const tables = this.cache.getTables();
    return tables.map((table) => this.computeMetadata(table));
  }

  /**
   * Get a specific table with computed metadata
   * @param {string} tableId - The table ID
   * @return {Object|undefined} Table with enriched metadata, or undefined
   */
  getTableWithMetadata(tableId) {
    const table = this.cache.getTable(tableId);
    return table ? this.computeMetadata(table) : undefined;
  }

  /**
   * Get cache statistics
   * @return {Object} Statistics about the metadata cache
   */
  getStats() {
    return {
      cachedTables: this.metadataCache.size,
      lastCacheUpdate: this.lastCacheUpdate,
    };
  }
}
