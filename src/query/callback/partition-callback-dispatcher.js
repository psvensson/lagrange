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
import {QUERY_AST_TYPE, QUERY_ERROR_CODE} from '../query-constants.js';
import {buildParticipantFailureEntry} from '../query-execution-budget.js';
import {STAGE_STATE} from './callback-stage-constants.js';


const SUBSYSTEM = 'partition-callback-dispatcher';

/**
 * Build the synthesized host-result shape for a partition_callback whose
 * every partition read failed before any callback batch existed. Keeps
 * artifacts recording "N partitions, N failed" instead of totalPartitions 0
 * (ARCH-0139: missing rows surface as typed owner outcomes).
 *
 * @param {Array<object>} failedPartitionReads - Typed participant failure
 *   entries from the dispatcher.
 * @return {object} Host-result shaped aggregate with failed read counts.
 */
function buildPartitionReadFailureHostResult(failedPartitionReads) {
  return {
    partitionResults: [],
    state: STAGE_STATE.FAILED,
    totalPartitions: failedPartitionReads.length,
    processedPartitions: 0,
    failedPartitions: failedPartitionReads.length,
    failedPartitionReads,
    totalRows: 0,
    totalBytes: 0,
    totalDurationMs: 0,
  };
}

/**
 * Merge partition-read failures into a callback host result so the
 * aggregate counts cover every resolved partition, not only the
 * partitions whose reads produced a batch. An empty-because-failed
 * result stays distinguishable from succeeded-with-zero-rows: read
 * failures raise totalPartitions/failedPartitions and carry the typed
 * failedPartitionReads entries.
 *
 * @param {object} hostResult - Aggregate result from CallbackExecutionHost.
 * @param {Array<object>} failedPartitionReads - Typed participant failure
 *   entries from the dispatcher (empty when every read succeeded).
 * @return {object} Host result with read failures folded into the counts.
 */
function mergePartitionReadFailuresIntoHostResult(
  hostResult,
  failedPartitionReads,
) {
  if (!Array.isArray(failedPartitionReads) ||
      failedPartitionReads.length === 0) {
    return hostResult;
  }
  return {
    ...hostResult,
    state: hostResult.state === STAGE_STATE.COMPLETED ?
      STAGE_STATE.FAILED :
      hostResult.state,
    totalPartitions:
      hostResult.totalPartitions + failedPartitionReads.length,
    failedPartitions:
      hostResult.failedPartitions + failedPartitionReads.length,
    failedPartitionReads,
  };
}

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
   * @param {Function} deps.resolveRoutedDeliveryPriority -
   *   fn(tableName) => routed delivery priority for the table (system
   *   tables ride the same critical/background lanes as executeSelect).
   */
  constructor(deps) {
    this.sqlParser = deps.sqlParser;
    this.partitionResolver = deps.partitionResolver;
    this.queryExecutor = deps.queryExecutor;
    this.getTablePartitions = deps.getTablePartitions;
    this.isSystemTable = deps.isSystemTable;
    this.resolveRoutedDeliveryPriority = deps.resolveRoutedDeliveryPriority;
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
   * @returns {Promise<object>} Typed dispatch outcome:
   *   { success, batches: [{partitionId, rows}, ...],
   *     failedPartitions: [typed participant failure entries],
   *     callbackModuleRef, callbackExport }.
   *   When every resolved partition read fails the outcome is
   *   non-success (error/errorCode/retry semantics populated) —
   *   a total read failure never surfaces as a clean empty result.
   *   A partial read failure keeps the successful batches and
   *   carries the failed partitions as typed entries.
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

    if (partitions.length === 0) {
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

    // 4. Build SQL from AST and execute per-partition via QueryExecutor.
    // Callback reads carry table attribution and ride the same routed
    // delivery lane as executeSelect (system tables -> critical lane).
    const preferLeader = this.isSystemTable(tableName);
    const sql = this.queryExecutor.buildSelectSQL(ast);
    const executionOptions = {tableName};
    const deliveryPriority = this.resolveRoutedDeliveryPriority(tableName);
    if (deliveryPriority) {
      executionOptions.deliveryPriority = deliveryPriority;
    }

    const perPartitionResults = await Promise.all(
      partitionIds.map((partitionId) =>
        this.queryExecutor.executeOnPartition(
          partitionId,
          sql,
          parameters,
          true, // forRead
          preferLeader,
          false, // preferSameLatencyGroup
          executionOptions,
        ),
      ),
    );

    // 5. Partition the per-partition results: successful reads become
    // batches, failed reads become typed participant failure entries.
    // A failed read is never silently dropped (ARCH-0139).
    const {batches, failedPartitions} = this.partitionReadResults({
      perPartitionResults,
      tableName,
      partitionIds,
      callbackModuleRef,
    });

    if (batches.length === 0 && failedPartitions.length > 0) {
      return this.buildAllReadsFailedOutcome({
        failedPartitions,
        callbackModuleRef,
        callbackExport,
      });
    }

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_BATCHED, {
      totalBatches: batches.length,
      totalRows: batches.reduce((sum, b) => sum + b.rows.length, 0),
      failedPartitionCount: failedPartitions.length,
      callbackModuleRef,
      callbackExport,
    });

    return {
      success: true,
      batches,
      failedPartitions,
      callbackModuleRef,
      callbackExport,
    };
  }

  /**
   * Partition per-partition read results into successful batches and
   * typed participant failure entries, logging any failed reads.
   *
   * @param {object} context
   * @param {Array<object>} context.perPartitionResults
   * @param {string} context.tableName
   * @param {Array<string>} context.partitionIds
   * @param {string} context.callbackModuleRef
   * @return {{batches: Array<object>, failedPartitions: Array<object>}}
   * @private
   */
  partitionReadResults({
    perPartitionResults,
    tableName,
    partitionIds,
    callbackModuleRef,
  }) {
    const batches = [];
    const failedPartitions = [];
    for (const result of perPartitionResults) {
      if (result.success) {
        batches.push({
          partitionId: result.partitionId,
          rows: result.rows,
        });
      } else {
        failedPartitions.push(buildParticipantFailureEntry(result));
      }
    }

    if (failedPartitions.length > 0) {
      this.logger.warn(ADAPTER_LOG_MSG.PARTITION_CALLBACK_READS_FAILED, {
        tableName,
        targetPartitions: partitionIds.length,
        failedPartitionCount: failedPartitions.length,
        failedPartitionIds: failedPartitions.map((e) => e.partitionId),
        firstError: failedPartitions[0].error,
        callbackModuleRef,
      });
    }

    return {batches, failedPartitions};
  }

  /**
   * Build the typed non-success outcome for a dispatch whose every
   * resolved partition read failed. Retry semantics are taken from the
   * first typed failure entry so admin consumers keep
   * deferRetry/retryAfterMs classification.
   *
   * @param {object} context
   * @param {Array<object>} context.failedPartitions - Typed entries.
   * @param {string} context.callbackModuleRef
   * @param {string} context.callbackExport
   * @return {object} Non-success dispatch outcome.
   * @private
   */
  buildAllReadsFailedOutcome({
    failedPartitions,
    callbackModuleRef,
    callbackExport,
  }) {
    const firstFailure = failedPartitions[0];
    const outcome = {
      success: false,
      error: ADAPTER_ERROR_MSG.PARTITION_CALLBACK_ALL_READS_FAILED,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      batches: [],
      failedPartitions,
      callbackModuleRef,
      callbackExport,
    };
    if (firstFailure.deferRetry === true || firstFailure.backpressured) {
      outcome.deferRetry = true;
    }
    if (Number.isFinite(firstFailure.retryAfterMs)) {
      outcome.retryAfterMs = firstFailure.retryAfterMs;
    }
    return outcome;
  }
}

export {
  PartitionCallbackDispatcher,
  buildPartitionReadFailureHostResult,
  mergePartitionReadFailuresIntoHostResult,
};
