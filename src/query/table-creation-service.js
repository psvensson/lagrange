/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STATE, TABLES} from '../constants/index.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationService {
  /**
   * Create a new TableCreationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.partitionSplitMergeManager = options.partitionSplitMergeManager || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE;

    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.TABLE_CREATION_SERVICE);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    this.systemCache = cache;
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    this.partitionSplitMergeManager = manager || null;
  }

  /**
   * Create a table from a parsed CREATE TABLE AST.
   * Automatically uses PRIMARY KEY as partition key.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Promise<Object>} Creation result.
   */
  async createTable(ast) {
    const {tableName, columns, primaryKey, ifNotExists} = ast;

    this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
      tableName,
      columnCount: columns.length,
      primaryKey,
      ifNotExists,
    });

    // Validate PRIMARY KEY requirement (Requirement 20.2)
    if (!primaryKey || primaryKey.length === 0) {
      const error = new Error(
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. ` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL,
      );
      error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
      throw error;
    }

    // Check if table already exists
    if (this.tableExists(tableName)) {
      if (ifNotExists) {
        this.logger.debug(QUERY_LOG_MSG.TABLE_EXISTS_SKIP, {tableName});
        return {
          success: true,
          operation: QUERY_OPERATION.CREATE_TABLE,
          tableName,
          skipped: true,
          message: `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
            QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
        };
      }
      const error = new Error(
        `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
      );
      error.code = QUERY_ERROR_CODE.TABLE_EXISTS;
      throw error;
    }

    // Derive partition key from PRIMARY KEY (Requirement 20.1)
    const partitionKey = this.derivePartitionKey(primaryKey);

    // Generate table ID
    const tableId = `tbl-${uuidv4()}`;

    // Build schema definition
    const schemaDefinition = this.buildSchemaDefinition(columns);

    // Create table metadata
    const tableMetadata = {
      table_id: tableId,
      table_name: tableName,
      schema_definition: JSON.stringify(schemaDefinition),
      partition_key: partitionKey,
      table_policies: JSON.stringify({}),
      partition_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Create initial partition with full key range [NULL, NULL) (Requirement 20.3)
    const partitionId = `${tableId}-p1`;
    const partitionMetadata = {
      partition_id: partitionId,
      table_id: tableId,
      partition_key_start: null, // NULL means unbounded lower
      partition_key_end: null, // NULL means unbounded upper
      replica_count: this.defaultReplicaCount,
      size_bytes: 0,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Write to system tables via CDC
    if (this.cdcIntegrationService) {
      await this.cdcIntegrationService.insertSystemTableRow(TABLES.TABLES, tableMetadata);
      await this.cdcIntegrationService.insertSystemTableRow(
        TABLES.PARTITIONS,
        partitionMetadata,
      );
    }

    await this.evaluateSplitMergeLifecycle();

    this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, {
      tableId,
      tableName,
      partitionKey,
      partitionId,
    });

    return {
      success: true,
      operation: QUERY_OPERATION.CREATE_TABLE,
      tableId,
      tableName,
      partitionKey,
      partitionId,
      columns: columns.length,
    };
  }

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle changes.
   * @return {Promise<void>}
   * @private
   */
  async evaluateSplitMergeLifecycle() {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.evaluateAllPartitions !== 'function') {
      return;
    }

    try {
      await manager.evaluateAllPartitions();
    } catch (error) {
      this.logger.warn(QUERY_LOG_MSG.TABLE_SPLIT_MERGE_EVAL_FAILED, {
        splitMergeEvaluationError: error.message,
      });
    }
  }

  /**
   * Derive partition key from PRIMARY KEY columns.
   * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
   * @param {Array<string>} primaryKey - PRIMARY KEY column names.
   * @return {string} Partition key (comma-separated for composite keys).
   * @private
   */
  derivePartitionKey(primaryKey) {
    if (!primaryKey || primaryKey.length === 0) {
      throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
    }

    // For composite PRIMARY KEY, use all columns as partition key
    return primaryKey.join(',');
  }

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>} columns - Column definitions from AST.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columns) {
    return {
      columns: columns.map((col) => ({
        name: col.name,
        type: this.normalizeDataType(col.dataType),
        primaryKey: col.primaryKey || false,
        notNull: col.notNull || false,
        unique: col.unique || false,
        defaultValue: col.defaultValue?.value,
      })),
    };
  }

  /**
   * Normalize data type to SQLite-compatible type.
   * @param {Object} dataType - Data type AST.
   * @return {string} Normalized type name.
   * @private
   */
  normalizeDataType(dataType) {
    const typeName = dataType.name.toUpperCase();

    // Map common SQL types to SQLite types
    const typeMap = {
      'INT': 'INTEGER',
      'BIGINT': 'INTEGER',
      'SMALLINT': 'INTEGER',
      'TINYINT': 'INTEGER',
      'VARCHAR': 'TEXT',
      'CHAR': 'TEXT',
      'NVARCHAR': 'TEXT',
      'NCHAR': 'TEXT',
      'CLOB': 'TEXT',
      'FLOAT': 'REAL',
      'DOUBLE': 'REAL',
      'DECIMAL': 'REAL',
      'NUMERIC': 'REAL',
      'BOOLEAN': 'INTEGER',
      'BOOL': 'INTEGER',
      'DATETIME': 'TEXT',
      'TIMESTAMP': 'TEXT',
      'DATE': 'TEXT',
      'TIME': 'TEXT',
    };

    return typeMap[typeName] || typeName;
  }

  /**
   * Check if a table exists.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   * @private
   */
  tableExists(tableName) {
    if (!this.systemCache) {
      return false;
    }

    try {
      if (typeof this.systemCache.find === 'function') {
        const table = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        return !!table;
      }
    } catch {
      // Cache not available
    }

    return false;
  }

  /**
   * Validate that a table has a PRIMARY KEY.
   * Requirement 20.2: Require PRIMARY KEY for user tables.
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Object} Validation result.
   */
  validatePrimaryKey(ast) {
    const {tableName, columns, primaryKey} = ast;

    // Check for table-level PRIMARY KEY constraint
    if (primaryKey && primaryKey.length > 0) {
      return {
        valid: true,
        primaryKey,
        source: 'table_constraint',
      };
    }

    // Check for column-level PRIMARY KEY
    const pkColumns = columns.filter((col) => col.primaryKey);
    if (pkColumns.length > 0) {
      return {
        valid: true,
        primaryKey: pkColumns.map((col) => col.name),
        source: 'column_constraint',
      };
    }

    return {
      valid: false,
      error: `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX,
      code: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
    };
  }

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
      if (typeof this.systemCache.find === 'function') {
        const table = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        return table?.partition_key || table?.partitionKey || null;
      }
    } catch {
      // Cache not available
    }

    return null;
  }

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
      if (typeof this.systemCache.find === 'function') {
        const table = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
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
  }

  /**
   * Strip partition details from query results.
   * Requirement 20.10: Never expose partition details in query results.
   * Note: We keep high-level partition metadata (like which partitions were queried)
   * but strip internal partition details from individual rows.
   * @param {Object} result - Query result.
   * @return {Object} Result with internal partition details stripped.
   */
  stripPartitionDetails(result) {
    if (!result) {
      return result;
    }

    // Create a copy to avoid mutating the original
    const stripped = {...result};

    // Remove internal partition-related fields from top-level result
    // Keep 'partitions' array as it's useful metadata about which partitions were queried
    delete stripped.sourcePartition;
    delete stripped.partition_key_start;
    delete stripped.partition_key_end;

    // Strip internal partition details from rows if present
    if (Array.isArray(stripped.rows)) {
      stripped.rows = stripped.rows.map((row) => {
        const cleanRow = {...row};
        // Remove internal partition tracking fields
        delete cleanRow._partition_id;
        delete cleanRow._partitionId;
        delete cleanRow._sourcePartition;
        return cleanRow;
      });
    }

    return stripped;
  }

  /**
   * Check if a field name is a partition-related field.
   * @param {string} fieldName - Field name to check.
   * @return {boolean} True if partition-related.
   */
  isPartitionField(fieldName) {
    const partitionFields = new Set([
      'partition_id',
      'partitionId',
      '_partition_id',
      '_partitionId',
      'partition_key_start',
      'partition_key_end',
      'partitionKeyStart',
      'partitionKeyEnd',
      'sourcePartition',
    ]);

    return partitionFields.has(fieldName);
  }
}

export {TableCreationService};
