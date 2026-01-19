/**
 * Remote Cache - Maintains a local copy of system tables synchronized via CDC
 *
 * The Remote Cache stores system table data locally and keeps it synchronized
 * with the server through CDC (Change Data Capture) events. This enables fast
 * navigation without repeated API calls.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

/**
 * Primary key mappings for each system table
 */
const PRIMARY_KEYS = {
  nodes: 'node_id',
  services: 'service_id',
  partitions: 'partition_id',
  tables: 'table_id',
  message_groups: 'group_id',
  indices: 'index_id',
  logs: 'log_id',
  config: 'config_key',
  contexts: 'context_id',
};

/**
 * RemoteCache class maintains a local copy of system tables synchronized via CDC
 */
export class RemoteCache {
  /**
   * Creates a new RemoteCache instance
   */
  constructor() {
    this.tables = {
      nodes: new Map(),
      services: new Map(),
      partitions: new Map(),
      tables: new Map(),
      message_groups: new Map(),
      indices: new Map(),
      logs: new Map(),
      config: new Map(),
      contexts: new Map(),
    };
    this.lastUpdate = null;
    this.cdcLag = 0;
    // Track tables affected by CDC events for selective invalidation
    this.affectedTableIds = new Set();
  }

  /**
   * Gets the primary key for a record in a given table
   * @param {string} tableName - Name of the table
   * @param {Object} record - The record to get the key from
   * @return {string} The primary key value
   */
  getPrimaryKey(tableName, record) {
    const keyField = PRIMARY_KEYS[tableName];
    if (!keyField) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    return record[keyField];
  }

  /**
   * Initialize cache from a full dump (initial sync)
   * Requirements: 13.1
   * @param {Object} dump - Object mapping table names to arrays of records
   */
  loadFromDump(dump) {
    for (const [tableName, records] of Object.entries(dump)) {
      if (!this.tables[tableName]) {
        continue; // Skip unknown tables
      }
      this.tables[tableName].clear();
      if (Array.isArray(records)) {
        for (const record of records) {
          const key = this.getPrimaryKey(tableName, record);
          this.tables[tableName].set(key, record);
        }
      }
    }
    this.lastUpdate = Date.now();
  }

  /**
   * Apply a CDC event to update the cache
   * Requirements: 13.4, 12.10
   * @param {Object} event - CDC event with table, operation, data, key, timestamp
   * @return {Object} Change info with table, key, operation, affectedTableId
   */
  applyCDCEvent(event) {
    const {table, operation, data, key} = event;

    if (!this.tables[table]) {
      return {table, key, operation, applied: false};
    }

    // Track affected table for selective invalidation (Requirements: 12.10, 13.8)
    let affectedTableId = null;

    switch (operation) {
    case 'INSERT':
    case 'UPDATE':
      this.tables[table].set(key, data);
      // If this is a partition change, track the owning table
      if (table === 'partitions' && data && data.table_id) {
        affectedTableId = data.table_id;
        this.affectedTableIds.add(affectedTableId);
      }
      break;
    case 'DELETE':
      // For partition deletes, get the table_id before deletion
      if (table === 'partitions') {
        const existingPartition = this.tables[table].get(key);
        if (existingPartition && existingPartition.table_id) {
          affectedTableId = existingPartition.table_id;
          this.affectedTableIds.add(affectedTableId);
        }
      }
      this.tables[table].delete(key);
      break;
    default:
      return {table, key, operation, applied: false};
    }

    this.lastUpdate = Date.now();
    if (event.timestamp) {
      this.cdcLag = Date.now() - event.timestamp;
    }

    return {table, key, operation, applied: true, affectedTableId};
  }

  /**
   * Get and clear the set of table IDs affected by CDC events
   * Requirements: 12.10, 13.8
   * @return {Set} Set of affected table IDs
   */
  getAndClearAffectedTables() {
    const affected = new Set(this.affectedTableIds);
    this.affectedTableIds.clear();
    return affected;
  }

  /**
   * Check if a specific table has been affected by CDC events
   * Requirements: 12.10, 13.8
   * @param {string} tableId - The table ID to check
   * @return {boolean} True if the table was affected
   */
  isTableAffected(tableId) {
    return this.affectedTableIds.has(tableId);
  }

  /**
   * Clear the affected tables tracking
   */
  clearAffectedTables() {
    this.affectedTableIds.clear();
  }

  /**
   * Get all nodes
   * Requirements: 13.2
   * @return {Array} Array of node records
   */
  getNodes() {
    return Array.from(this.tables.nodes.values());
  }

  /**
   * Get a specific node by ID
   * @param {string} nodeId - The node ID
   * @return {Object|undefined} The node record or undefined
   */
  getNode(nodeId) {
    return this.tables.nodes.get(nodeId);
  }

  /**
   * Get services with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with nodeId and/or type
   * @return {Array} Array of service records
   */
  getServices(filter = {}) {
    let services = Array.from(this.tables.services.values());
    if (filter.nodeId) {
      services = services.filter((s) => s.node_id === filter.nodeId);
    }
    if (filter.type) {
      services = services.filter((s) => s.service_type === filter.type);
    }
    return services;
  }

  /**
   * Get a specific service by ID
   * @param {string} serviceId - The service ID
   * @return {Object|undefined} The service record or undefined
   */
  getService(serviceId) {
    return this.tables.services.get(serviceId);
  }

  /**
   * Get all tables (raw, without computed metadata)
   * Requirements: 13.2
   * @return {Array} Array of table records
   */
  getTables() {
    return Array.from(this.tables.tables.values());
  }

  /**
   * Get a specific table by ID
   * @param {string} tableId - The table ID
   * @return {Object|undefined} The table record or undefined
   */
  getTable(tableId) {
    return this.tables.tables.get(tableId);
  }

  /**
   * Get partitions with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with tableId
   * @return {Array} Array of partition records
   */
  getPartitions(filter = {}) {
    let partitions = Array.from(this.tables.partitions.values());
    if (filter.tableId) {
      partitions = partitions.filter((p) => p.table_id === filter.tableId);
    }
    return partitions;
  }

  /**
   * Get a specific partition by ID
   * @param {string} partitionId - The partition ID
   * @return {Object|undefined} The partition record or undefined
   */
  getPartition(partitionId) {
    return this.tables.partitions.get(partitionId);
  }

  /**
   * Get all message groups
   * Requirements: 13.2
   * @return {Array} Array of message group records
   */
  getMessageGroups() {
    return Array.from(this.tables.message_groups.values());
  }

  /**
   * Get a specific message group by ID
   * @param {string} groupId - The message group ID
   * @return {Object|undefined} The message group record or undefined
   */
  getMessageGroup(groupId) {
    return this.tables.message_groups.get(groupId);
  }

  /**
   * Get all indices
   * Requirements: 13.2
   * @return {Array} Array of index records
   */
  getIndices() {
    return Array.from(this.tables.indices.values());
  }

  /**
   * Get logs with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with level, nodeId, serviceId, startTime, endTime
   * @return {Array} Array of log records
   */
  getLogs(filter = {}) {
    let logs = Array.from(this.tables.logs.values());
    if (filter.level) {
      logs = logs.filter((l) => l.level === filter.level);
    }
    if (filter.nodeId) {
      logs = logs.filter((l) => l.node_id === filter.nodeId);
    }
    if (filter.serviceId) {
      logs = logs.filter((l) => l.service_id === filter.serviceId);
    }
    if (filter.startTime) {
      logs = logs.filter((l) => l.timestamp >= filter.startTime);
    }
    if (filter.endTime) {
      logs = logs.filter((l) => l.timestamp <= filter.endTime);
    }
    if (filter.messagePattern) {
      const pattern = new RegExp(filter.messagePattern, 'i');
      logs = logs.filter((l) => pattern.test(l.message || ''));
    }
    return logs;
  }

  /**
   * Get all config entries
   * Requirements: 13.2
   * @return {Array} Array of config records
   */
  getConfig() {
    return Array.from(this.tables.config.values());
  }

  /**
   * Get a specific config entry by key
   * @param {string} key - The config key
   * @return {Object|undefined} The config record or undefined
   */
  getConfigEntry(key) {
    return this.tables.config.get(key);
  }

  /**
   * Get contexts with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with type and/or namePattern
   * @return {Array} Array of context records
   */
  getContexts(filter = {}) {
    let contexts = Array.from(this.tables.contexts.values());
    if (filter.type) {
      contexts = contexts.filter((c) => c.context_type === filter.type);
    }
    if (filter.namePattern) {
      const pattern = new RegExp(filter.namePattern, 'i');
      contexts = contexts.filter((c) => pattern.test(c.name || ''));
    }
    return contexts;
  }

  /**
   * Get a specific context by ID
   * @param {string} contextId - The context ID
   * @return {Object|undefined} The context record or undefined
   */
  getContext(contextId) {
    return this.tables.contexts.get(contextId);
  }

  /**
   * Serialize the cache to JSON for persistence
   * Requirements: 13.7
   * @return {string} JSON string representation of the cache
   */
  serialize() {
    const data = {};
    for (const [name, map] of Object.entries(this.tables)) {
      data[name] = Array.from(map.values());
    }
    return JSON.stringify({data, lastUpdate: this.lastUpdate});
  }

  /**
   * Deserialize and load cache from JSON
   * Requirements: 13.7
   * @param {string} json - JSON string to deserialize
   */
  deserialize(json) {
    const {data, lastUpdate} = JSON.parse(json);
    this.loadFromDump(data);
    this.lastUpdate = lastUpdate;
  }

  /**
   * Clear all cached data
   */
  clear() {
    for (const map of Object.values(this.tables)) {
      map.clear();
    }
    this.lastUpdate = null;
    this.cdcLag = 0;
    this.affectedTableIds.clear();
  }

  /**
   * Get cache statistics
   * @return {Object} Statistics about the cache
   */
  getStats() {
    const stats = {
      lastUpdate: this.lastUpdate,
      cdcLag: this.cdcLag,
      tableCounts: {},
    };
    for (const [name, map] of Object.entries(this.tables)) {
      stats.tableCounts[name] = map.size;
    }
    return stats;
  }

  /**
   * Check if the cache has been initialized
   * @return {boolean} True if cache has data
   */
  isInitialized() {
    return this.lastUpdate !== null;
  }

  /**
   * Check if the cache is stale (CDC lag exceeds threshold)
   * Requirements: 13.5
   * @param {number} threshold - Staleness threshold in milliseconds
   * @return {boolean} True if cache is stale
   */
  isStale(threshold = 5000) {
    return this.cdcLag > threshold;
  }
}
