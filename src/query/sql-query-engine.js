/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Coordinates parsing, partition resolution, and execution.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3, 15.4, 20.1, 20.2, 20.3, 20.6, 20.7,
 *               20.10, 21.1, 21.2, 21.3
 */

import {SQLParser} from './sql-parser.js';
import {PartitionResolver} from './partition-resolver.js';
import {QueryExecutor} from './query-executor.js';
import {TableCreationService} from './table-creation-service.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * SQLQueryEngine is the main entry point for SQL query processing.
 * It coordinates parsing, partition resolution, and parallel execution.
 */
class SQLQueryEngine {
  /**
   * Create a new SQL query engine.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.partitionRegistry - Registry of partition services.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.partitionRegistry = options.partitionRegistry || new Map();
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || 'sql-engine';

    this.partitionResolver = new PartitionResolver({
      systemCache: this.systemCache,
    });

    this.queryExecutor = new QueryExecutor({
      partitionRegistry: this.partitionRegistry,
      nodeId: this.nodeId,
    });

    this.tableCreationService = new TableCreationService({
      systemCache: this.systemCache,
      cdcIntegrationService: this.cdcIntegrationService,
      partitionRegistry: this.partitionRegistry,
    });

    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get('query.timeoutMs') || 30000;

    // Transaction state per client/session
    this.activeTransactions = new Map(); // sessionId -> {partitionId, partition}
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
        return loggingService.forSubsystem('sql-query-engine');
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
    this.partitionResolver.setSystemCache(cache);
    this.tableCreationService.setSystemCache(cache);
  }

  /**
   * Set the partition registry.
   * @param {Map|Object} registry - Partition registry.
   */
  setPartitionRegistry(registry) {
    this.partitionRegistry = registry;
    this.queryExecutor.setPartitionRegistry(registry);
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
    this.tableCreationService.setCDCIntegrationService(service);
  }

  /**
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {string} options.sessionId - Session ID for transaction tracking.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = [], options = {}) {
    const sessionId = options.sessionId || 'default';

    this.logger.debug('Executing SQL query', {
      sql: sql.substring(0, 100),
      paramCount: params.length,
      sessionId,
    });

    try {
      // Parse the SQL
      const parser = new SQLParser(sql);
      const ast = parser.parse();

      // Route based on statement type
      let result;
      switch (ast.type) {
      case 'SELECT':
        result = await this.executeSelect(ast, params, sessionId);
        break;

      case 'INSERT':
        result = await this.executeInsert(ast, params, sessionId);
        break;

      case 'UPDATE':
        result = await this.executeUpdate(ast, params, sessionId);
        break;

      case 'DELETE':
        result = await this.executeDelete(ast, params, sessionId);
        break;

      case 'CREATE_TABLE':
        result = await this.executeCreateTable(ast, sessionId);
        break;

      case 'BEGIN_TRANSACTION':
        return this.handleBeginTransaction(sessionId);

      case 'COMMIT':
        return this.handleCommit(sessionId);

      case 'ROLLBACK':
        return this.handleRollback(sessionId);

      default:
        throw new Error(`Unsupported statement type: ${ast.type}`);
      }

      // Strip partition details from results (Requirement 20.10)
      return this.tableCreationService.stripPartitionDetails(result);
    } catch (error) {
      this.logger.error('Query execution failed', {
        sql: sql.substring(0, 100),
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        errorCode: this.getErrorCode(error),
      };
    }
  }

  /**
   * Execute a CREATE TABLE statement.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @param {string} _sessionId - Session ID (unused for DDL).
   * @return {Promise<Object>} Creation result.
   * @private
   */
  async executeCreateTable(ast, _sessionId) {
    return this.tableCreationService.createTable(ast);
  }

  /**
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(ast, params, sessionId) {
    const tableName = ast.from.name;

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `Table not found: ${tableName}`,
        errorCode: 'TABLE_NOT_FOUND',
      };
    }

    // Resolve which partitions to query
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    this.logger.debug('Resolved partitions for SELECT', {
      tableName,
      totalPartitions: partitions.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    // Execute on resolved partitions
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
    );

    return {
      ...result,
      tableName,
    };
  }

  /**
   * Execute an INSERT statement.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Insert result.
   * @private
   */
  async executeInsert(ast, params, sessionId) {
    const tableName = ast.table;

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `Table not found: ${tableName}`,
        errorCode: 'TABLE_NOT_FOUND',
      };
    }

    // Get table info to find primary key
    const tableInfo = this.getTableInfo(tableName);
    const primaryKey = tableInfo?.primaryKey || 'id';
    const primaryKeyIndex = this.findPrimaryKeyIndex(ast, primaryKey);

    // Route each row to appropriate partition
    const rowsByPartition = new Map();

    for (const row of ast.values) {
      const keyValue = this.extractKeyValue(row, primaryKeyIndex);
      const partitionId = this.partitionResolver.resolvePartitionForKey(
        tableName,
        keyValue,
        partitions,
      );

      if (!partitionId) {
        return {
          success: false,
          error: `No partition found for key: ${keyValue}`,
          errorCode: 'PARTITION_NOT_FOUND',
        };
      }

      if (!rowsByPartition.has(partitionId)) {
        rowsByPartition.set(partitionId, []);
      }
      rowsByPartition.get(partitionId).push(row);
    }

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && rowsByPartition.size > 1) {
      return {
        success: false,
        error: 'Cross-partition transactions are not supported. ' +
               'INSERT affects multiple partitions.',
        errorCode: 'CROSS_PARTITION_TRANSACTION',
      };
    }

    if (txState && txState.partitionId) {
      // Check if all rows go to the same partition as the transaction
      for (const partitionId of rowsByPartition.keys()) {
        if (partitionId !== txState.partitionId) {
          return {
            success: false,
            error: 'Cross-partition transactions are not supported. ' +
                   `Transaction bound to partition ${txState.partitionId}, ` +
                   `but INSERT targets partition ${partitionId}`,
            errorCode: 'CROSS_PARTITION_TRANSACTION',
          };
        }
      }
    }

    this.logger.debug('Routing INSERT to partitions', {
      tableName,
      rowCount: ast.values.length,
      partitionCount: rowsByPartition.size,
      sessionId,
    });

    // Execute inserts on each partition
    let totalAffected = 0;
    const affectedPartitions = [];

    for (const [partitionId, rows] of rowsByPartition) {
      // Bind transaction to partition if in transaction
      if (txState && !txState.partitionId) {
        const partition = this.getPartition(partitionId);
        if (partition) {
          await this.bindTransactionToPartition(sessionId, partitionId, partition);
        }
      }

      const partitionAst = {
        ...ast,
        values: rows,
      };

      const result = await this.queryExecutor.executeInsert(
        partitionAst,
        partitionId,
        params,
      );

      totalAffected += result.affectedRows || 0;
      affectedPartitions.push(partitionId);
    }

    return {
      success: true,
      operation: 'INSERT',
      affectedRows: totalAffected,
      partitions: affectedPartitions,
      tableName,
    };
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Update result.
   * @private
   */
  async executeUpdate(ast, params, sessionId) {
    const tableName = ast.table;

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `Table not found: ${tableName}`,
        errorCode: 'TABLE_NOT_FOUND',
      };
    }

    // Resolve which partitions to update
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && partitionIds.length > 1) {
      return {
        success: false,
        error: 'Cross-partition transactions are not supported. ' +
               'UPDATE affects multiple partitions.',
        errorCode: 'CROSS_PARTITION_TRANSACTION',
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: 'Cross-partition transactions are not supported. ' +
                 `Transaction bound to partition ${txState.partitionId}, ` +
                 'but UPDATE targets different partition(s)',
          errorCode: 'CROSS_PARTITION_TRANSACTION',
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      const partition = this.getPartition(partitionIds[0]);
      if (partition) {
        await this.bindTransactionToPartition(sessionId, partitionIds[0], partition);
      }
    }

    this.logger.debug('Routing UPDATE to partitions', {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute update on resolved partitions
    const result = await this.queryExecutor.executeUpdate(
      ast,
      partitionIds,
      params,
    );

    return {
      ...result,
      tableName,
    };
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Delete result.
   * @private
   */
  async executeDelete(ast, params, sessionId) {
    const tableName = ast.table;

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `Table not found: ${tableName}`,
        errorCode: 'TABLE_NOT_FOUND',
      };
    }

    // Resolve which partitions to delete from
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && partitionIds.length > 1) {
      return {
        success: false,
        error: 'Cross-partition transactions are not supported. ' +
               'DELETE affects multiple partitions.',
        errorCode: 'CROSS_PARTITION_TRANSACTION',
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: 'Cross-partition transactions are not supported. ' +
                 `Transaction bound to partition ${txState.partitionId}, ` +
                 'but DELETE targets different partition(s)',
          errorCode: 'CROSS_PARTITION_TRANSACTION',
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      const partition = this.getPartition(partitionIds[0]);
      if (partition) {
        await this.bindTransactionToPartition(sessionId, partitionIds[0], partition);
      }
    }

    this.logger.debug('Routing DELETE to partitions', {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute delete on resolved partitions
    const result = await this.queryExecutor.executeDelete(
      ast,
      partitionIds,
      params,
    );

    return {
      ...result,
      tableName,
    };
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = 'default') {
    // Check if session already has an active transaction
    if (this.activeTransactions.has(sessionId)) {
      return {
        success: false,
        error: 'Transaction already active for this session',
        errorCode: 'TRANSACTION_ACTIVE',
      };
    }

    this.logger.debug('BEGIN TRANSACTION', {sessionId});

    // Transaction will be bound to a partition on first write
    this.activeTransactions.set(sessionId, {
      partitionId: null,
      partition: null,
      started: Date.now(),
    });

    return {
      success: true,
      operation: 'BEGIN_TRANSACTION',
      sessionId,
    };
  }

  /**
   * Handle COMMIT.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = 'default') {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: 'No active transaction to commit',
        errorCode: 'NO_TRANSACTION',
      };
    }

    this.logger.debug('COMMIT', {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: 'COMMIT'};

      // If transaction was bound to a partition, commit it
      if (txState.partition && txState.partition.isInTransaction()) {
        result = await txState.partition.commitTransaction();
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);

      return {
        success: false,
        error: error.message,
        errorCode: 'COMMIT_FAILED',
      };
    }
  }

  /**
   * Handle ROLLBACK.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = 'default') {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: 'No active transaction to rollback',
        errorCode: 'NO_TRANSACTION',
      };
    }

    this.logger.debug('ROLLBACK', {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: 'ROLLBACK'};

      // If transaction was bound to a partition, rollback it
      if (txState.partition && txState.partition.isInTransaction()) {
        result = await txState.partition.rollbackTransaction();
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);

      return {
        success: false,
        error: error.message,
        errorCode: 'ROLLBACK_FAILED',
      };
    }
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = 'default') {
    return this.activeTransactions.has(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = 'default') {
    const txState = this.activeTransactions.get(sessionId);
    return txState?.partitionId || null;
  }

  /**
   * Bind a transaction to a partition (on first write).
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @param {Object} partition - Partition service.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId, partition) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      throw new Error('No active transaction');
    }

    if (txState.partitionId && txState.partitionId !== partitionId) {
      throw new Error(
        'Cross-partition transactions are not supported. ' +
        `Transaction bound to partition ${txState.partitionId}, ` +
        `but operation targets partition ${partitionId}`,
      );
    }

    if (!txState.partitionId) {
      // First write - bind to this partition and begin transaction
      txState.partitionId = partitionId;
      txState.partition = partition;

      // Begin transaction on the partition
      await partition.beginTransaction();
    }
  }

  /**
   * Get a partition service by ID.
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
   * Get partitions for a table.
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @private
   */
  getTablePartitions(tableName) {
    // Try to get from system cache
    if (this.systemCache) {
      try {
        let cachePartitions = [];
        if (typeof this.systemCache.filter === 'function') {
          cachePartitions = this.systemCache.filter('partitions', (p) =>
            p.table_name === tableName ||
            p.tableName === tableName ||
            p.table_id === tableName ||
            p.tableId === tableName,
          ) || [];
        } else if (typeof this.systemCache.getAll === 'function') {
          const all = this.systemCache.getAll('partitions') || [];
          cachePartitions = all.filter((p) =>
            p.table_name === tableName ||
            p.tableName === tableName ||
            p.table_id === tableName ||
            p.tableId === tableName,
          );
        }
        // Only return cache results if we found partitions
        if (cachePartitions.length > 0) {
          return cachePartitions;
        }
      } catch {
        // Cache not available, fall through to registry
      }
    }

    // Fallback: check partition registry directly
    const partitions = [];
    const registry = this.partitionRegistry instanceof Map ?
      this.partitionRegistry : new Map(Object.entries(this.partitionRegistry));

    for (const [partitionId, partition] of registry) {
      if (partition.tableName === tableName ||
          partition.tableId === tableName) {
        partitions.push({
          partition_id: partitionId,
          table_name: partition.tableName,
          partition_key_start: partition.keyRange?.start,
          partition_key_end: partition.keyRange?.end,
        });
      }
    }

    return partitions;
  }

  /**
   * Get table information.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        return this.systemCache.get('tables', tableName);
      }
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find('tables', (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
      }
    } catch {
      // Cache not available
    }

    return null;
  }

  /**
   * Find primary key column index in INSERT columns.
   * @param {Object} ast - INSERT AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {number} Column index or 0.
   * @private
   */
  findPrimaryKeyIndex(ast, primaryKey) {
    if (!ast.columns) {
      return 0; // Assume first column is primary key
    }

    const index = ast.columns.findIndex((col) =>
      col.toLowerCase() === primaryKey.toLowerCase(),
    );

    return index >= 0 ? index : 0;
  }

  /**
   * Extract key value from INSERT row.
   * @param {Array} row - Row values.
   * @param {number} keyIndex - Primary key index.
   * @return {*} Key value.
   * @private
   */
  extractKeyValue(row, keyIndex) {
    if (keyIndex >= row.length) {
      return null;
    }

    const valueExpr = row[keyIndex];
    if (valueExpr.type === 'literal') {
      return valueExpr.value;
    }

    return null;
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes('parse') || message.includes('syntax')) {
      return 'SYNTAX_ERROR';
    }
    if (message.includes('table not found')) {
      return 'TABLE_NOT_FOUND';
    }
    if (message.includes('timeout')) {
      return 'TIMEOUT';
    }

    return 'INTERNAL_ERROR';
  }

  /**
   * Parse a SQL statement without executing.
   * @param {string} sql - SQL string.
   * @return {Object} Parsed AST.
   */
  parse(sql) {
    const parser = new SQLParser(sql);
    return parser.parse();
  }

  /**
   * Resolve partitions for a query without executing.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause AST.
   * @return {Array} Partition IDs.
   */
  resolvePartitions(tableName, whereClause) {
    const partitions = this.getTablePartitions(tableName);
    return this.partitionResolver.resolvePartitions(
      tableName,
      whereClause,
      partitions,
    );
  }
}

export {SQLQueryEngine};
