/**
 * Table Creation Service - Table and partition metadata lookup.
 * Owns cache-first reads of table and partition rows with authoritative
 * control-plane fallback, plus partition-key and schema accessors.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {NUM, TABLES} from '../constants/index.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_SQL,
} from './table-creation-service-completion.js';


const METADATA_LOOKUP_METHODS = Object.freeze({
  /**
   * Check if a table exists.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   * @private
   */
  tableExists(tableName) {
    return this.getTableRecord(tableName) !== null;
  },

  /**
   * Resolve one table metadata row, preferring cache and falling back to an
   * authoritative control-plane read when cache visibility lags.
   * @param {string} tableName
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingTableRecord(tableName) {
    const cachedTable = this.getTableRecord(tableName);
    if (cachedTable) {
      return cachedTable;
    }
    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (
      !controlPlaneGateway ||
      typeof controlPlaneGateway.readRows !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return null;
    }
    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.TABLES,
        TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME,
        [tableName],
        {
          readProfile: 'table_lifecycle',
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > NUM.ZERO ?
        result.rows[NUM.ZERO] :
        null;
    } catch {
      return null;
    }
  },

  /**
   * Resolve one partition metadata row, preferring cache and falling back to
   * an authoritative control-plane read when cache visibility lags.
   * @param {string} partitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingPartitionRecord(partitionId) {
    const cachedPartition = this.getPartitionRecord(partitionId);
    if (cachedPartition) {
      return cachedPartition;
    }
    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (
      !controlPlaneGateway ||
      typeof controlPlaneGateway.readRows !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return null;
    }
    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.PARTITIONS,
        TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID,
        [partitionId],
        {
          readProfile: 'table_lifecycle',
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > NUM.ZERO ?
        result.rows[NUM.ZERO] :
        null;
    } catch {
      return null;
    }
  },

  /**
   * Resolve one table metadata row from cache.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  getTableRecord(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        return (
          this.systemCache.find(
            TABLES.TABLES,
            (table) =>
              table?.table_name === tableName ||
              table?.tableName === tableName,
          ) || null
        );
      }
      if (
        typeof this.systemCache.getAll ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return (
          tables.find(
            (table) =>
              table?.table_name === tableName ||
              table?.tableName === tableName,
          ) || null
        );
      }
    } catch {
      return null;
    }
    return null;
  },

  /**
   * Resolve one partition metadata row from cache.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (!this.systemCache || !partitionId) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        return (
          this.systemCache.find(
            TABLES.PARTITIONS,
            (partition) =>
              partition?.partition_id === partitionId ||
              partition?.partitionId === partitionId,
          ) || null
        );
      }
      if (
        typeof this.systemCache.getAll ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return (
          partitions.find(
            (partition) =>
              partition?.partition_id === partitionId ||
              partition?.partitionId === partitionId,
          ) || null
        );
      }
    } catch {
      return null;
    }
    return null;
  },

  /**
   * Get partition key for a table.
   * @param {string} tableName - Table name.
   * @return {string|null} Partition key or null.
   */
  getPartitionKey(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        return table?.partition_key || table?.partitionKey || null;
      }
    } catch {
      // Cache not available
    }
    return null;
  },

  /**
   * Get table schema.
   * @param {string} tableName - Table name.
   * @return {Object|null} Schema definition or null.
   */
  getTableSchema(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        if (table?.schema_definition) {
          return JSON.parse(table.schema_definition);
        }
        if (table?.schemaDefinition) {
          return JSON.parse(table.schemaDefinition);
        }
      }
    } catch {
      // Cache not available or parse error
    }
    return null;
  },
});

function defineTableCreationMetadataLookup(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    METADATA_LOOKUP_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationMetadataLookup};
