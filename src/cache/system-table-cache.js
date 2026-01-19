/**
 * System Table Cache - In-memory cache for system tables.
 * Maintains cached copies of system tables (nodes, partitions, tables,
 * services, message_groups, indices) synchronized via CDC events.
 * Requirements: 4.4, 4.5, 4.8
 */

import {LoggingService} from '../logging/logging-service.js';

/**
 * System table names that are cached.
 */
const SYSTEM_TABLES = [
  'nodes',
  'partitions',
  'tables',
  'services',
  'message_groups',
  'indices',
  'contexts',
  'code',
];

/**
 * Primary key field names for each system table.
 */
const PRIMARY_KEY_FIELDS = {
  nodes: 'node_id',
  partitions: 'partition_id',
  tables: 'table_id',
  services: 'service_id',
  message_groups: 'group_id',
  indices: 'index_id',
  logs: 'log_id',
  config: 'config_key',
  live_queries: 'query_id',
  contexts: 'context_id',
  code: 'function_id',
};

/**
 * CDC operation types.
 */
const CDC_OPERATIONS = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * SystemTableCache provides in-memory caching for system tables.
 * Only CDC event handlers should have write access to this cache.
 */
class SystemTableCache {
  /**
   * Create a new SystemTableCache instance.
   */
  constructor() {
    this.tables = new Map();
    this.listeners = new Set();
    this.logger = LoggingService.getInstance().forSubsystem('cache');

    // Initialize empty maps for each system table
    for (const tableName of SYSTEM_TABLES) {
      this.tables.set(tableName, new Map());
    }
  }

  /**
   * Subscribe to cache change notifications.
   * Listeners receive (tableName, operation, record) on each change.
   * @param {Function} listener - Called with (tableName, operation, record)
   */
  onCacheChange(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    this.listeners.add(listener);
  }

  /**
   * Unsubscribe from cache change notifications.
   * @param {Function} listener - The listener to remove
   * @return {boolean} True if the listener was removed
   */
  offCacheChange(listener) {
    return this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a cache change.
   * Uses setImmediate to make notifications non-blocking.
   * @param {string} tableName - Name of the system table
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE)
   * @param {Object} record - The record data
   * @private
   */
  notifyListeners(tableName, operation, record) {
    if (this.listeners.size === 0) {
      return;
    }

    // Use setImmediate to make notifications non-blocking
    setImmediate(() => {
      for (const listener of this.listeners) {
        try {
          listener(tableName, operation, record);
        } catch (error) {
          // Don't let listener errors break the cache
          this.logger.warn('Cache listener error', {error: error.message});
        }
      }
    });
  }

  /**
   * Get all data from the cache for a cache dump.
   * @return {Object} All cache data by table name { tableName: [...rows] }
   */
  getAllData() {
    const data = {};
    for (const [tableName, table] of this.tables) {
      data[tableName] = Array.from(table.values()).map((r) => this.deepClone(r));
    }
    return data;
  }

  /**
   * Get a single record by key from a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {Object|undefined} The record or undefined if not found.
   */
  get(tableName, key) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    const record = table.get(key);
    return record ? this.deepClone(record) : undefined;
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Object|undefined} The first matching record or undefined.
   */
  find(tableName, predicate) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);

    for (const record of table.values()) {
      if (predicate(record)) {
        return this.deepClone(record);
      }
    }

    return undefined;
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - Name of the system table.
   * @param {Function} predicate - Function that returns true for matching records.
   * @return {Array<Object>} Array of matching records.
   */
  filter(tableName, predicate) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    const results = [];

    for (const record of table.values()) {
      if (predicate(record)) {
        results.push(this.deepClone(record));
      }
    }

    return results;
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - Name of the system table.
   * @return {Array<Object>} Array of all records in the table.
   */
  getAll(tableName) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return Array.from(table.values()).map((record) => this.deepClone(record));
  }

  /**
   * Check if a record exists in a table.
   * @param {string} tableName - Name of the system table.
   * @param {string} key - Primary key of the record.
   * @return {boolean} True if the record exists.
   */
  has(tableName, key) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return table.has(key);
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - Name of the system table.
   * @return {number} Number of records in the table.
   */
  count(tableName) {
    this.validateTableName(tableName);
    const table = this.tables.get(tableName);
    return table.size;
  }

  /**
   * Apply a CDC change to the cache.
   * This method should ONLY be called by CDC event handlers.
   * @param {string} tableName - Name of the system table.
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Record data (must include primary key field).
   * @throws {Error} If operation is invalid or data is missing required fields.
   */
  applySystemTableChange(tableName, operation, data) {
    this.validateTableName(tableName);
    this.validateOperation(operation);

    // Get the primary key field for this table
    const pkField = PRIMARY_KEY_FIELDS[tableName] || 'id';
    const key = data[pkField] || data.id;

    if (!data || typeof key === 'undefined') {
      throw new Error(
        `CDC data must include primary key field "${pkField}" or "id"`,
      );
    }

    const table = this.tables.get(tableName);
    let recordForNotification = null;

    switch (operation) {
    case CDC_OPERATIONS.INSERT:
      if (table.has(key)) {
        this.logger.warn('INSERT on existing key, treating as UPDATE', {
          tableName,
          key,
        });
      }
      table.set(key, this.deepClone(data));
      recordForNotification = data;
      break;

    case CDC_OPERATIONS.UPDATE:
      if (!table.has(key)) {
        this.logger.warn('UPDATE on non-existing key, treating as INSERT', {
          tableName,
          key,
        });
        table.set(key, this.deepClone(data));
      } else {
        const existing = table.get(key);
        table.set(key, {...existing, ...this.deepClone(data)});
      }
      recordForNotification = table.get(key);
      break;

    case CDC_OPERATIONS.DELETE:
      if (!table.has(key)) {
        this.logger.warn('DELETE on non-existing key, ignoring', {
          tableName,
          key,
        });
      } else {
        recordForNotification = table.get(key);
        table.delete(key);
      }
      break;
    }

    this.logger.debug('Applied CDC event to cache', {
      tableName,
      operation,
      key,
    });

    // Notify listeners after applying the change
    if (recordForNotification) {
      this.notifyListeners(tableName, operation, this.deepClone(recordForNotification));
    }
  }

  /**
   * Clear all data from the cache.
   * Used primarily for testing.
   */
  clear() {
    for (const tableName of SYSTEM_TABLES) {
      this.tables.get(tableName).clear();
    }
    this.logger.debug('Cache cleared');
  }

  /**
   * Get the list of supported system table names.
   * @return {Array<string>} Array of system table names.
   */
  getTableNames() {
    return [...SYSTEM_TABLES];
  }

  /**
   * Validate that a table name is a valid system table.
   * @param {string} tableName - Name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (!SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        `Invalid system table name: ${tableName}. ` +
        `Valid tables are: ${SYSTEM_TABLES.join(', ')}`,
      );
    }
  }

  /**
   * Validate that an operation is a valid CDC operation.
   * @param {string} operation - Operation to validate.
   * @throws {Error} If operation is invalid.
   * @private
   */
  validateOperation(operation) {
    if (!Object.values(CDC_OPERATIONS).includes(operation)) {
      throw new Error(
        `Invalid CDC operation: ${operation}. ` +
        `Valid operations are: ${Object.values(CDC_OPERATIONS).join(', ')}`,
      );
    }
  }

  /**
   * Deep clone an object to prevent external mutation.
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
}

export {SystemTableCache, SYSTEM_TABLES, CDC_OPERATIONS, PRIMARY_KEY_FIELDS};
