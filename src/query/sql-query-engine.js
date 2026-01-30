/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Coordinates parsing, partition resolution, and execution.
 *
 * System Cache-Based Routing:
 * - All queries route through system cache (single source of truth)
 * - System cache provides partition metadata and leader addresses
 * - No bootstrap directories or fallback mechanisms
 * - All communication through message router using service addresses
 *
 * Query Routing Flow:
 * 1. Parse SQL to determine target table
 * 2. Get partitions from system cache
 * 3. Resolve which partitions to query based on WHERE clause
 * 4. Find partition leader addresses from system cache
 * 5. Route queries through message router to leaders
 * 6. Aggregate and return results
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3, 15.4, 20.1, 20.2, 20.3,
 *               20.6, 20.7, 20.10, 21.1, 21.2, 21.3
 */

import {SQLParser} from './sql-parser.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {PartitionResolver} from './partition-resolver.js';
import {QueryExecutor} from './query-executor.js';
import {TableCreationService} from './table-creation-service.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LOG_MSG, TABLES} from '../constants/index.js';
import {
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_DEFAULT_VALUE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

/**
 * SQLQueryEngine is the main entry point for SQL query processing.
 * It coordinates parsing, partition resolution, and parallel execution.
 *
 * System Cache-Based Routing:
 * - Routes ALL queries through message router (no local vs remote distinction)
 * - System cache is the single source of truth for partition locations
 * - No bootstrap directories or fallback mechanisms
 * - All partition leader addresses come from system cache
 */
class SQLQueryEngine {
  /**
   * Create a new SQL query engine.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for lookups.
   * @param {Object} options.messageRouter - Message router for query routing.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;

    this.partitionResolver = new PartitionResolver({
      systemCache: this.systemCache,
    });

    this.queryExecutor = new QueryExecutor({
      messageRouter: this.messageRouter,
      systemCache: this.systemCache,
      nodeId: this.nodeId,
    });

    this.tableCreationService = new TableCreationService({
      systemCache: this.systemCache,
      cdcIntegrationService: this.cdcIntegrationService,
    });

    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;

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
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
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
    this.queryExecutor.setSystemCache(cache);
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    this.messageRouter = router;
    this.queryExecutor.setMessageRouter(router);
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
    const sessionId = options.sessionId || QUERY_SESSION.DEFAULT;

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, {
      sql: sql.substring(0, 100),
      paramCount: params.length,
      sessionId,
    });

    // Parse the SQL
    let ast;
    try {
      const parser = new SQLParser(sql);
      ast = parser.parse();
    } catch (parseError) {
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, 100),
        error: parseError.message,
      });
      return {
        success: false,
        error: parseError.message,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    try {
      // Route based on statement type
      let result;
      switch (ast.type) {
      case QUERY_AST_TYPE.SELECT:
        result = await this.executeSelect(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.INSERT:
        result = await this.executeInsert(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.UPDATE:
        result = await this.executeUpdate(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.DELETE:
        result = await this.executeDelete(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.CREATE_TABLE:
        result = await this.executeCreateTable(ast, sessionId);
        break;

      case QUERY_AST_TYPE.BEGIN_TRANSACTION:
        return this.handleBeginTransaction(sessionId);

      case QUERY_AST_TYPE.COMMIT:
        return this.handleCommit(sessionId);

      case QUERY_AST_TYPE.ROLLBACK:
        return this.handleRollback(sessionId);

      default:
        throw new Error(`${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`);
      }

      // Strip partition details from results (Requirement 20.10)
      return this.tableCreationService.stripPartitionDetails(result);
    } catch (error) {
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
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
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Resolve which partitions to query
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, {
      tableName,
      totalPartitions: partitions.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    const preferLeader = this.isSystemTable(tableName);

    // Execute on resolved partitions
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {preferLeader},
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
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Get table info to find primary key
    const tableInfo = this.getTableInfo(tableName);
    const primaryKey = tableInfo?.primaryKey || QUERY_DEFAULT_VALUE.PRIMARY_KEY;
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
          error: `${QUERY_ERROR_MSG.PARTITION_FOR_KEY_PREFIX}${keyValue}`,
          errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
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
        error: QUERY_ERROR_MSG.CROSS_PARTITION_INSERT,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId) {
      // Check if all rows go to the same partition as the transaction
      for (const partitionId of rowsByPartition.keys()) {
        if (partitionId !== txState.partitionId) {
          return {
            success: false,
            error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
              `${QUERY_ERROR_MSG.TX_BOUND_INSERT_SUFFIX}${partitionId}`,
            errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
          };
        }
      }
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, {
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
        await this.bindTransactionToPartition(sessionId, partitionId);
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
      operation: QUERY_OPERATION.INSERT,
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
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
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
        error: QUERY_ERROR_MSG.CROSS_PARTITION_UPDATE,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
            QUERY_ERROR_MSG.TX_BOUND_UPDATE_SUFFIX,
          errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      await this.bindTransactionToPartition(sessionId, partitionIds[0]);
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_UPDATE, {
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
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
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
        error: QUERY_ERROR_MSG.CROSS_PARTITION_DELETE,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
            QUERY_ERROR_MSG.TX_BOUND_DELETE_SUFFIX,
          errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      await this.bindTransactionToPartition(sessionId, partitionIds[0]);
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_DELETE, {
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
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    // Check if session already has an active transaction
    if (this.activeTransactions.has(sessionId)) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_ACTIVE,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});

    // Transaction will be bound to a partition on first write
    this.activeTransactions.set(sessionId, {
      partitionId: null,
      partition: null,
      started: Date.now(),
    });

    return {
      success: true,
      operation: QUERY_OPERATION.BEGIN_TRANSACTION,
      sessionId,
    };
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.COMMIT, {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: QUERY_OPERATION.COMMIT};

      // If transaction was bound to a partition, commit it via message router
      if (txState.partitionId) {
        const serviceInfo = this.queryExecutor.findPartitionService(txState.partitionId);
        if (serviceInfo) {
          const response = await this.messageRouter.deliver(serviceInfo.address, {
            type: QUERY_OPERATION.TRANSACTION,
            operation: QUERY_OPERATION.COMMIT,
            sessionId,
          });

          if (!response.acknowledged || !response.success) {
            throw new Error(response.error || QUERY_ERROR_MSG.COMMIT_FAILED);
          }
          result = {success: true, operation: QUERY_OPERATION.COMMIT};
        }
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        operation: QUERY_OPERATION.COMMIT,
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: QUERY_OPERATION.ROLLBACK};

      // If transaction was bound to a partition, rollback it via message router
      if (txState.partitionId) {
        const serviceInfo = this.queryExecutor.findPartitionService(txState.partitionId);
        if (serviceInfo) {
          const response = await this.messageRouter.deliver(serviceInfo.address, {
            type: QUERY_OPERATION.TRANSACTION,
            operation: QUERY_OPERATION.ROLLBACK,
            sessionId,
          });

          if (!response.acknowledged || !response.success) {
            throw new Error(response.error || QUERY_ERROR_MSG.ROLLBACK_FAILED);
          }
          result = {success: true, operation: QUERY_OPERATION.ROLLBACK};
        }
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        operation: QUERY_OPERATION.ROLLBACK,
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    return this.activeTransactions.has(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);
    return txState?.partitionId || null;
  }

  /**
   * Bind a transaction to a partition (on first write).
   * Transactions are routed through message router like all other operations.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      throw new Error(QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }

    if (txState.partitionId && txState.partitionId !== partitionId) {
      throw new Error(
        `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
        `${QUERY_ERROR_MSG.TX_BOUND_OPERATION_SUFFIX}${partitionId}`,
      );
    }

    if (!txState.partitionId) {
      // First write - bind to this partition
      txState.partitionId = partitionId;

      // Begin transaction via message router
      // The partition service will handle the BEGIN TRANSACTION message
      const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
      if (!serviceInfo) {
        throw new Error(`${QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND_PREFIX}${partitionId}`);
      }

      const response = await this.messageRouter.deliver(serviceInfo.address, {
        type: QUERY_OPERATION.TRANSACTION,
        operation: QUERY_OPERATION.BEGIN,
        sessionId,
      });

      if (!response.acknowledged || !response.success) {
        throw new Error(response.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
    }
  }

  /**
   * Get partitions for a table.
   *
   * System Cache Lookup:
   * - Uses ONLY the system cache (single source of truth)
   * - No fallbacks or bootstrap directories
   * - System cache populated from bootstrap snapshots
   * - CDC events keep cache synchronized
   * - Throws error if cache not available
   *
   * Requirements: 3.1, 5.1
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @throws {Error} If system cache is not available.
   * @private
   */
  getTablePartitions(tableName) {
    if (!this.systemCache) {
      throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}`);
    }

    // Get partitions from system cache - the single source of truth
    if (typeof this.systemCache.filter === 'function') {
      const partitions = this.systemCache.filter(TABLES.PARTITIONS, (p) =>
        p.table_name === tableName ||
        p.tableName === tableName ||
        p.table_id === tableName ||
        p.tableId === tableName,
      ) || [];
      return partitions;
    }

    if (typeof this.systemCache.getAll === 'function') {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const partitions = all.filter((p) =>
        p.table_name === tableName ||
        p.tableName === tableName ||
        p.table_id === tableName ||
        p.tableId === tableName,
      );
      return partitions;
    }

    throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`);
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
        return this.systemCache.get(TABLES.TABLES, tableName);
      }
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
      }
    } catch {
      // Cache not available
    }

    return null;
  }

  /**
   * Check if a table is a system table.
   * @param {string} tableName - Table name.
   * @return {boolean} True if system table.
   * @private
   */
  isSystemTable(tableName) {
    return Object.values(SystemTableName).includes(tableName);
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
    if (valueExpr.type === QUERY_AST_NODE.LITERAL) {
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
      return QUERY_ERROR_CODE.SYNTAX_ERROR;
    }
    if (message.includes('table not found')) {
      return QUERY_ERROR_CODE.TABLE_NOT_FOUND;
    }
    if (message.includes('timeout')) {
      return QUERY_ERROR_CODE.TIMEOUT;
    }

    return QUERY_ERROR_CODE.INTERNAL_ERROR;
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
