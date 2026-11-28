import {splitDescriptorCommitFields, splitDescriptorFailureFields} from '../split-descriptor-delivery-fields.js';
import {randomUUID} from 'node:crypto';
import {deriveParticipantEntryId} from '../../partition/partition-split-descriptor-command.js';
import {LoggingService} from '../../logging/logging-service.js';
import {
  affectedRowsField,
  sumAffectedRowCounts,
} from '../application-database-result.js';
import {
  isAppliedWithUnknownCount,
  pickTypedWriteAnswer,
} from '../../partition/partition-write-kernel.js';
import {
  buildParticipantFailureEntry,
  pickRoutingDenialFields,
} from '../query-execution-budget.js';
import {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} from '../query-constants.js';
import {
  enforceCoordinatorUniqueConstraints,
  extractCoordinatorKeyValue,
  resolveCoordinatorTableSchema,
  resolveSchemaColumnDefinition,
} from './distributed-write-constraint-helpers.js';
import {resolveDeclaredPrimaryKeyColumns} from '../../partition/partition-boundary-representation.js';
import {
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_SQL_STATE,
} from '../sql-locking-read-constants.js';

const LOCAL_STR_STRING = 'string';

const ERR_NO_PARTITION_FOR_KEY = 'No partition found for key: ';
const OPERATION_ID_PREFIX = 'dwrite-';
const PROMISE_STATUS_FULFILLED = 'fulfilled';
const PARTICIPANT_ROLE_PRIMARY = 'primary';
const PARTICIPANT_ROLE_MIRROR = 'mirror';

// One log line per failed fan-out: the operation identity plus the
// partition/service ids and error codes of every failed participant, so the
// server log names what the client envelope names.
function buildParticipantFailureLogContext(plan, participantFailures) {
  return {
    operation: plan.statementType,
    operationId: plan.operationId,
    idempotencyKey: plan.idempotencyKey,
    failedParticipantCount: participantFailures.length,
    failedPartitions: participantFailures.map((entry) => entry.partitionId),
    participantFailures: participantFailures.map((entry) => ({
      partitionId: entry.partitionId,
      participantNodeId: entry.participantNodeId,
      participantAddress: entry.participantAddress,
      errorCode: entry.errorCode,
      failureCode: entry.failureCode,
      committed: entry.committed,
      outcome: entry.outcome,
      disposition: entry.disposition,
      error: entry.error,
      failedTable: entry.failedTable,
    })),
  };
}

function buildRejectedParticipantResult(partitionId, participant, reason) {
  const message = reason?.message;
  return {
    partitionId,
    role: participant?.role,
    success: false,
    errorCode: reason?.errorCode ?? null,
    error: typeof message === 'string' && message.length > 0 ?
      message :
      QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
  };
}

/**
 * Canonical owner for distributed INSERT/UPDATE/DELETE execution.
 */
const NO_LOCKING_READ_FAILURE_OVERLAY = Object.freeze({});

function resolveLockingReadFailureOverlay(participantFailures) {
  const lockFailure = participantFailures.find((failure) =>
    failure?.errorCode === QUERY_ERROR_CODE.LOCK_NOT_AVAILABLE ||
    failure?.errorCode === LOCKING_READ_ERROR_CODE.RESERVATION_UNAVAILABLE ||
    failure?.sqlState === LOCKING_READ_SQL_STATE.LOCK_NOT_AVAILABLE);
  if (!lockFailure) {
    return NO_LOCKING_READ_FAILURE_OVERLAY;
  }
  const errorCode =
    lockFailure.errorCode === LOCKING_READ_ERROR_CODE.RESERVATION_UNAVAILABLE ?
      LOCKING_READ_ERROR_CODE.RESERVATION_UNAVAILABLE :
      QUERY_ERROR_CODE.LOCK_NOT_AVAILABLE;
  const errorMsg = typeof lockFailure.error === 'string' && lockFailure.error.length > 0 ?
    lockFailure.error :
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE;
  return {
    errorCode,
    error: errorMsg,
    ...(lockFailure.sqlState ? {sqlState: lockFailure.sqlState} : {}),
    ...(lockFailure.conflict === true ? {conflict: true} : {}),
    ...(typeof lockFailure.retryable === 'boolean' ?
      {retryable: lockFailure.retryable} : {}),
    ...(lockFailure.conflictingTransactionId ?
      {conflictingTransactionId: lockFailure.conflictingTransactionId} : {}),
    ...(lockFailure.rowKey ? {rowKey: lockFailure.rowKey} : {}),
    ...(lockFailure.code ? {code: lockFailure.code} : {}),
  };
}

class DistributedWriteCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Object} options.partitionResolver - Partition resolver.
   * @param {Object} options.queryExecutor - Query executor.
   * @param {Function} options.getTablePartitions - Table partitions resolver.
   * @param {Function} options.getTableInfo - Table metadata resolver.
   */
  constructor(options = {}) {
    this.partitionResolver = options.partitionResolver || null;
    this.queryExecutor = options.queryExecutor || null;
    this.getTablePartitions = options.getTablePartitions || (() => []);
    this.getTableInfo = options.getTableInfo || (() => null);
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} logger.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
      }
    } catch (logErr) {
      console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
    }
    return console;
  }

  /**
   * Build a distributed write plan for INSERT/UPDATE/DELETE.
   * @param {Object} ast - Statement AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Plan options.
   * @return {Object} DistributedWritePlan.
   */
  createWritePlan(ast, params = [], options = {}) {
    const operationId = options.operationId || this.createOperationId();
    const idempotencyKey = options.idempotencyKey || operationId;
    const partitionStatements = new Map();

    if (ast.type === QUERY_AST_TYPE.INSERT) {
      this.createInsertPartitionStatements(ast, params, partitionStatements);
    } else {
      const partitionIds = Array.isArray(options.partitionIds) ?
        options.partitionIds :
        [];
      for (const partitionId of partitionIds) {
        partitionStatements.set(partitionId, {
          ast: {...ast},
          role: PARTICIPANT_ROLE_PRIMARY,
          executionOptions: {},
        });
      }
    }

    return {
      operationId,
      statementType: ast.type,
      partitionStatements,
      returningSpec: ast.returning || null,
      idempotencyKey,
      ast,
    };
  }

  /**
   * Append one mirror-only participant to an existing write plan.
   * Mirror participants affect success/failure but are excluded from
   * user-facing affected-row and RETURNING aggregation.
   * @param {Object} plan - Existing write plan.
   * @param {string} partitionId - Mirror partition ID.
   * @param {Object} ast - Statement AST.
   * @param {Object} executionOptions - Delivery options.
   * @return {Object} The mutated write plan.
   */
  addMirrorParticipant(plan, partitionId, ast, executionOptions = {}) {
    if (!plan || !partitionId || !ast) {
      return plan;
    }
    plan.partitionStatements.set(partitionId, {
      ast: {...ast},
      role: PARTICIPANT_ROLE_MIRROR,
      executionOptions: {...executionOptions},
    });
    return plan;
  }

  /**
   * Execute an INSERT statement directly through coordinator planning.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Parameters.
   * @param {Object} executionOptions - Execution options.
   * @return {Promise<Object>} Aggregated write result.
   */
  async executeInsert(ast, params = [], executionOptions = {}) {
    await this.enforceCrossPartitionUniqueConstraints(ast, params);
    const plan = this.createWritePlan(ast, params, executionOptions);
    return this.executePlan(plan, params, executionOptions);
  }

  /**
   * Execute an UPDATE statement directly through coordinator planning.
   * @param {Object} ast - UPDATE AST.
   * @param {Array} params - Parameters.
   * @param {Object} executionOptions - Execution options.
   * @return {Promise<Object>} Aggregated write result.
   */
  async executeUpdate(ast, params = [], executionOptions = {}) {
    await this.enforceCrossPartitionUniqueConstraints(ast, params);
    const plan = this.createWritePlan(ast, params, executionOptions);
    return this.executePlan(plan, params, executionOptions);
  }

  async enforceCrossPartitionUniqueConstraints(ast, params = []) {
    return enforceCoordinatorUniqueConstraints(this, ast, params);
  }

  async executePlanParticipants(plan, orderedPartitions, params, executionOptions) {
    if (orderedPartitions.length === 1) {
      const partitionId = orderedPartitions[0];
      const participant = plan.partitionStatements.get(partitionId);
      const result = await this.executePartitionStatement(
        plan.statementType,
        participant.ast,
        partitionId,
        params,
        this.createParticipantExecutionOptions(
          plan,
          partitionId,
          executionOptions,
          participant.executionOptions,
        ),
      );
      return [{
        partitionId,
        role: participant.role,
        ...result,
      }];
    }
    const promises = orderedPartitions.map((partitionId) => {
      const participant = plan.partitionStatements.get(partitionId);
      return this.executePartitionStatement(
        plan.statementType,
        participant.ast,
        partitionId,
        params,
        this.createParticipantExecutionOptions(
          plan,
          partitionId,
          executionOptions,
          participant.executionOptions,
        ),
      ).then((result) => ({
        partitionId,
        role: participant.role,
        ...result,
      }));
    });
    const settled = await Promise.allSettled(promises);
    return settled.map((outcome, index) => {
      if (outcome.status === PROMISE_STATUS_FULFILLED) {
        return outcome.value;
      }
      const partitionId = orderedPartitions[index];
      return buildRejectedParticipantResult(
        partitionId,
        plan.partitionStatements.get(partitionId),
        outcome.reason,
      );
    });
  }

  /**
   * Execute a distributed write plan and merge participant results.
   * @param {Object} plan - Distributed write plan.
   * @param {Array} params - Bound parameters.
   * @param {Object} [executionOptions] - Global execution options.
   * @return {Promise<Object>} Aggregated write result.
   */
  async executePlan(plan, params = [], executionOptions = {}) {
    if (plan.ast) {
      await this.enforceCrossPartitionUniqueConstraints(plan.ast, params);
    }
    const orderedPartitions = Array.from(
      plan.partitionStatements.keys(),
    ).sort();
    const participantResults = await this.executePlanParticipants(
      plan,
      orderedPartitions,
      params,
      executionOptions,
    );

    const failedParticipants = participantResults.filter(
      (result) => !result.success,
    );
    const primaryPartitions = participantResults
      .filter((result) => result.role !== PARTICIPANT_ROLE_MIRROR)
      .map((result) => result.partitionId)
      .filter(Boolean);
    const mirrorPartitions = participantResults
      .filter((result) => result.role === PARTICIPANT_ROLE_MIRROR)
      .map((result) => result.partitionId)
      .filter(Boolean);
    const rows = [];
    const affectedRows = sumAffectedRowCounts(participantResults
      .filter((result) =>
        result.success && result.role !== PARTICIPANT_ROLE_MIRROR)
      .map((result) => result.affectedRows));
    const retryCount = participantResults.reduce((sum, result) => {
      const attempts = Number.isInteger(result.attempts) ?
        result.attempts : 1;
      return sum + Math.max(attempts - 1, 0);
    }, 0);
    const originHlc = participantResults[0]?.originHlc;
    const hasSharedOriginHlc =
      typeof originHlc === LOCAL_STR_STRING &&
      originHlc.length > 0 &&
      participantResults.every((result) => result.originHlc === originHlc);
    for (const result of participantResults) {
      if (!result.success) {
        continue;
      }
      if (result.role === PARTICIPANT_ROLE_MIRROR) {
        continue;
      }
      if (Array.isArray(result.rows) && result.rows.length > 0) {
        rows.push(...result.rows);
      }
    }

    if (failedParticipants.length > 0) {
      // The one participant failure entry (INSERT, UPDATE and DELETE alike).
      const participantFailures = failedParticipants.map((result) =>
        buildParticipantFailureEntry({
          ...result,
          error: result.error ||
            QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          failedTable: result.failedTable ?? result.tableName,
        }));
      const firstFailedParticipant =
          participantFailures.length > 0 ?
            participantFailures[0] :
            null;
      this.logger.warn(
        QUERY_LOG_MSG.DISTRIBUTED_WRITE_PARTICIPANT_FAILURES,
        buildParticipantFailureLogContext(plan, participantFailures),
      );
      const retryAfterMs = participantFailures.reduce(
        (maxRetryAfterMs, result) => {
          if (!Number.isFinite(result?.retryAfterMs) ||
                result.retryAfterMs <= 0) {
            return maxRetryAfterMs;
          }
          return Math.max(maxRetryAfterMs, result.retryAfterMs);
        },
        0,
      );
      const lockOverlay = resolveLockingReadFailureOverlay(participantFailures);
      return {
        success: false,
        operation: plan.statementType,
        ...affectedRowsField(affectedRows),
        rows,
        partitions: primaryPartitions,
        mirrorPartitions,
        failedPartitions: failedParticipants.map(
          (result) => result.partitionId,
        ),
        partitionErrors: participantFailures.map((failure) => ({...failure})),
        participantFailures,
        firstFailedParticipant,
        participantResults,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        ...lockOverlay,
        ...(Object.hasOwn(executionOptions, 'splitDescriptorIntent') && participantResults.length === 1 ?
          splitDescriptorFailureFields(failedParticipants[0]) : {}),
        idempotencyKey: plan.idempotencyKey,
        operationId: plan.operationId,
        retryCount,
        retryAfterMs: retryAfterMs > 0 ? retryAfterMs : null,
      };
    }

    // A primary participant acknowledged as a settled replay whose count is
    // not known leaves the statement's count unknown: the result carries the
    // named state, never a sum that counts it as zero rows.
    const unknownCount = participantResults.find((result) =>
      result.success && result.role !== PARTICIPANT_ROLE_MIRROR &&
      isAppliedWithUnknownCount(result));
    return {
      success: true,
      operation: plan.statementType,
      ...(participantResults.length === 1 ? splitDescriptorCommitFields(participantResults[0]) :
        {}),
      ...(unknownCount === undefined ? affectedRowsField(affectedRows) :
        {settledReplay: unknownCount.settledReplay}),
      rows,
      partitions: primaryPartitions,
      mirrorPartitions,
      participantResults,
      ...(hasSharedOriginHlc ? {originHlc} : {}),
      idempotencyKey: plan.idempotencyKey,
      operationId: plan.operationId,
      retryCount,
    };
  }

  /**
   * Delegate one partition write to the canonical query-delivery owner.
   * QueryExecutor owns routing recovery and its absolute request deadline;
   * this coordinator owns only participant planning and result aggregation.
   * @param {string} statementType - Statement type.
   * @param {Object} statementAst - Partition-scoped statement AST.
   * @param {string} partitionId - Target partition.
   * @param {Array} params - Bound parameters.
   * @return {Promise<Object>} Participant execution result.
   * @private
   */
  async executePartitionStatement(
    statementType,
    statementAst,
    partitionId,
    params,
    executionOptions = {},
  ) {
    try {
      let result;
      if (statementType === QUERY_AST_TYPE.INSERT) {
        result = await this.queryExecutor.executeInsert(
          statementAst,
          partitionId,
          params,
          executionOptions,
        );
      } else if (statementType === QUERY_AST_TYPE.UPDATE) {
        result = await this.queryExecutor.executeUpdate(
          statementAst,
          [partitionId],
          params,
          executionOptions,
        );
      } else {
        result = await this.queryExecutor.executeDelete(
          statementAst,
          [partitionId],
          params,
          executionOptions,
        );
      }
      return {...result, attempts: 1};
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode:
          typeof error?.code === LOCAL_STR_STRING && error.code.length > 0 ?
            error.code :
            (typeof error?.errorCode === LOCAL_STR_STRING &&
            error.errorCode.length > 0 ?
              error.errorCode :
              null),
        ...pickTypedWriteAnswer(error),
        ...pickRoutingDenialFields(error),
        retryAfterMs:
          Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ?
            Math.floor(error.retryAfterMs) :
            null,
        deferRetry: error?.deferRetry === true,
        participantNodeId:
          typeof error?.participantNodeId === LOCAL_STR_STRING ?
            error.participantNodeId :
            null,
        participantAddress:
          typeof error?.participantAddress === LOCAL_STR_STRING ?
            error.participantAddress :
            null,
        failedTable:
          typeof error?.failedTable === LOCAL_STR_STRING ?
            error.failedTable :
            (typeof error?.tableName === LOCAL_STR_STRING ?
              error.tableName :
              null),
        attempts: 1,
      };
    }
  }

  appendInsertRowToPartition(partitionStatements, partitionId, ast, row) {
    if (!partitionStatements.has(partitionId)) {
      partitionStatements.set(partitionId, {
        ast: {
          ...ast,
          values: [],
        },
        role: PARTICIPANT_ROLE_PRIMARY,
        executionOptions: {},
      });
    }
    partitionStatements.get(partitionId).ast.values.push(row);
  }

  routeRowToSinglePartitionOrThrow(partitions, partitionStatements, ast, row) {
    if (partitions.length !== 1) {
      throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED);
    }
    const partitionId = partitions[0].partition_id || partitions[0].partitionId;
    this.appendInsertRowToPartition(partitionStatements, partitionId, ast, row);
  }

  extractCompositeInsertKeyValues(row, keyIndices, params, keyColumnSchemas = null) {
    const keyValues = [];
    for (let i = 0; i < keyIndices.length; i += 1) {
      const idx = keyIndices[i];
      if (idx === -1 || row[idx] === undefined) return null;
      const colSchema = Array.isArray(keyColumnSchemas) ? keyColumnSchemas[i] : null;
      const val = this.extractKeyValue(row[idx], params, colSchema);
      if (val === undefined) return null;
      keyValues.push(val);
    }
    return keyValues;
  }

  routeCompositeInsertRows(ast, params, partitions, primaryKeyColumns,
    partitionStatements, schema = null) {
    const keyIndices = primaryKeyColumns.map((col) =>
      this.findPrimaryKeyIndex(ast, col));
    const keyColumnSchemas = primaryKeyColumns.map((col) =>
      resolveSchemaColumnDefinition(schema, col));
    for (const row of ast.values || []) {
      const keyValues = this.extractCompositeInsertKeyValues(
        row, keyIndices, params, keyColumnSchemas);
      if (!keyValues) {
        this.routeRowToSinglePartitionOrThrow(
          partitions, partitionStatements, ast, row);
        continue;
      }
      const partitionId = this.partitionResolver.resolvePartitionForKey(
        ast.table,
        keyValues,
        partitions,
      );
      if (!partitionId) {
        throw new Error(ERR_NO_PARTITION_FOR_KEY + JSON.stringify(keyValues));
      }
      this.appendInsertRowToPartition(
        partitionStatements, partitionId, ast, row);
    }
  }

  /**
   * Build INSERT partition statements grouped by partition key.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Map<string, Object>} partitionStatements - Output map.
   * @private
   */
  createInsertPartitionStatements(ast, params, partitionStatements) {
    const partitions = this.getTablePartitions(ast.table) || [];
    const tableInfo = this.getTableInfo(ast.table);
    const schema = resolveCoordinatorTableSchema(this, ast.table);
    const primaryKeyColumns = this.resolvePrimaryKeyColumns(tableInfo);

    if (primaryKeyColumns.length === 0) {
      for (const row of ast.values || []) {
        this.routeRowToSinglePartitionOrThrow(
          partitions, partitionStatements, ast, row);
      }
      return;
    }

    if (primaryKeyColumns.length === 1) {
      const primaryKey = primaryKeyColumns[0];
      const keyIndex = this.findPrimaryKeyIndex(ast, primaryKey);
      const keyColumnSchema = resolveSchemaColumnDefinition(schema, primaryKey);

      for (const row of ast.values || []) {
        const keyValue = this.extractKeyValue(
          row[keyIndex],
          params,
          keyColumnSchema,
        );
        const partitionId = this.partitionResolver.resolvePartitionForKey(
          ast.table,
          keyValue,
          partitions,
        );
        if (!partitionId) {
          throw new Error(ERR_NO_PARTITION_FOR_KEY + keyValue);
        }
        this.appendInsertRowToPartition(
          partitionStatements, partitionId, ast, row);
      }
      return;
    }

    this.routeCompositeInsertRows(
      ast, params, partitions, primaryKeyColumns, partitionStatements, schema);
  }

  /**
   * Resolve primary key columns from table metadata.
   * @param {Object|null} tableInfo - Table metadata.
   * @return {string[]} Key columns.
   * @private
   */
  resolvePrimaryKeyColumns(tableInfo) {
    return resolveDeclaredPrimaryKeyColumns(tableInfo);
  }

  /**
   * Find primary key column index in INSERT columns list.
   * @param {Object} ast - INSERT AST.
   * @param {string} primaryKey - Primary key column.
   * @return {number} Column index.
   * @private
   */
  findPrimaryKeyIndex(ast, primaryKey) {
    if (!Array.isArray(ast.columns) || ast.columns.length === 0) {
      return 0;
    }
    const index = ast.columns.findIndex(
      (columnName) => String(columnName).toLowerCase() ===
        String(primaryKey).toLowerCase(),
    );
    return index >= 0 ? index : 0;
  }

  /**
   * Extract key value from INSERT row expression via SQLite evaluation and
   * optional target column affinity probe.
   * @param {Object} expr - Value expression.
   * @param {Array} [params] - Bound parameters.
   * @param {Object|null} [columnSchema] - Target column schema definition.
   * @return {*} Key value.
   * @private
   */
  extractKeyValue(expr, params = [], columnSchema = null) {
    return extractCoordinatorKeyValue(this, expr, params, columnSchema);
  }

  /**
   * Mint one identifier for this client submission. Internal participant
   * attempts reuse the plan instead of deriving identity from write content.
   * @return {string} Operation identifier.
   * @private
   */
  createOperationId() {
    return `${OPERATION_ID_PREFIX}${randomUUID()}`;
  }

  /**
   * Preserve one stable entry identity across all internal attempts for a
   * partition participant.
   * @param {Object} plan - Distributed write plan.
   * @param {string} partitionId - Participant partition ID.
   * @param {Object} executionOptions - Global execution options.
   * @param {Object} participantOptions - Participant execution options.
   * @return {Object} Participant-scoped execution options.
   * @private
   */
  createParticipantExecutionOptions(
    plan,
    partitionId,
    executionOptions = {},
    participantOptions = {},
  ) {
    return {
      ...(executionOptions || {}),
      operationId: plan.operationId,
      idempotencyKey: plan.idempotencyKey,
      entryId: deriveParticipantEntryId(plan.idempotencyKey, partitionId),
      ...(participantOptions || {}),
    };
  }
}

export {DistributedWriteCoordinator, deriveParticipantEntryId};
