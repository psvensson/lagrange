/**
 * Partition Callback Dispatcher
 *
 * Resolves target partitions from a callback select query and constructs
 * per-partition batches. Reuses the existing PartitionResolver and
 * QueryExecutor — no duplicate partition resolution logic.
 *
 * Ownership: partition batch preparation for partition_callback mode.
 * Callback invocation is handled downstream by Callback_Execution_Host
 * (wired in task 13.3).
 *
 * Requirements: 5.2, 14.2
 */

import {LoggingService} from '../../logging/logging-service.js';
import {
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
} from '../sql-adapter-constants.js';
import {QUERY_AST_TYPE} from '../query-constants.js';

const LOCAL_NUM_ZERO = 0;

const SUBSYSTEM = 'partition-callback-dispatcher';

/**
 * Dispatches a partition_callback SqlRequest by resolving target
 * partitions from the select statement and executing per-partition
 * queries to produce batched results.
 */
class PartitionCallbackDispatcher {
  /**
   * @param {object} deps
   * @param {object} deps.sqlParser - SQL parser (has .parse(sql))
   * @param {object} deps.partitionResolver - PartitionResolver instance
   * @param {object} deps.queryExecutor - QueryExecutor instance
   * @param {Function} deps.getTablePartitions - fn(tableName) => []
   * @param {Function} deps.isSystemTable - fn(tableName) => boolean
   */
  constructor(deps) {
    this.sqlParser = deps.sqlParser;
    this.partitionResolver = deps.partitionResolver;
    this.queryExecutor = deps.queryExecutor;
    this.getTablePartitions = deps.getTablePartitions;
    this.isSystemTable = deps.isSystemTable;
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger with fallback to console.
   * @return {object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(SUBSYSTEM);
      }
    } catch (logErr) {
      console.warn(ADAPTER_LOG_MSG.LOGGING_INIT_FAILED, logErr);
    }
    return console;
  }

  /**
   * Resolve partitions and build per-partition row batches for a
   * partition_callback SqlRequest.
   *
   * @param {object} sqlRequest - Canonical SqlRequest with
   *   executionMode = partition_callback
   * @returns {Promise<object>} Result with per-partition batches:
   *   { success, batches: [{partitionId, rows}, ...],
   *     callbackModuleRef, callbackExport, executionMode }
   */
  async dispatch(sqlRequest) {
    const {
      statement,
      parameters,
      callbackModuleRef,
      callbackExport,
    } = sqlRequest;

    // 1. Parse the select statement into an AST
    const ast = this.sqlParser.parse(statement);
    const astType = String(ast?.type || '').toUpperCase();
    if (astType !== QUERY_AST_TYPE.SELECT) {
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_SELECT_ONLY,
      );
    }

    if (!ast || !ast.from || !ast.from.name) {
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_TABLE,
      );
    }

    const tableName = ast.from.name;

    // 2. Get all partitions for the table (reuses engine helper)
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === LOCAL_NUM_ZERO) {
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_PARTITIONS,
      );
    }

    // 3. Resolve which partitions the WHERE clause targets
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_RESOLVED, {
      tableName,
      totalPartitions: partitions.length,
      targetPartitions: partitionIds.length,
      callbackModuleRef,
    });

    // 4. Build SQL from AST and execute per-partition via QueryExecutor
    const preferLeader = this.isSystemTable(tableName);
    const sql = this.queryExecutor.buildSelectSQL(ast);

    const perPartitionResults = await Promise.all(
      partitionIds.map((partitionId) =>
        this.queryExecutor.executeOnPartition(
          partitionId,
          sql,
          parameters,
          true, // forRead
          preferLeader,
        ),
      ),
    );

    // 5. Construct per-partition batches (only successful partitions)
    const batches = [];
    for (const result of perPartitionResults) {
      if (result.success) {
        batches.push({
          partitionId: result.partitionId,
          rows: result.rows,
        });
      }
    }

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_BATCHED, {
      totalBatches: batches.length,
      totalRows: batches.reduce((sum, b) => sum + b.rows.length, LOCAL_NUM_ZERO),
      callbackModuleRef,
      callbackExport,
    });

    return {
      success: true,
      batches,
      callbackModuleRef,
      callbackExport,
    };
  }
}

export {PartitionCallbackDispatcher};
