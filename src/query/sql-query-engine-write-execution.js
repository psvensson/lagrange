import {
  STATEMENT_INGRESS_FIELD,
  resolveStatementIngress,
} from './sql-statement-ingress.js';
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineTransactionRecoveryMethods} from './sql-query-engine-transaction-recovery-methods.js';
import {
  STATEMENT_ADMISSION,
  admitExpectedTransaction,
} from './sql-query-engine-statement-admission.js';
import {
  SERVICE_PARTITION_ACCESS_KIND,
  TRANSACTION_MODE,
} from '../constants/index.js';
import {COMMIT_POINT_REACHED_FIELD} from
  './distributed/distributed-transaction-commit-point.js';


const {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  WRITE_TRACKING_EXCLUDED_TABLES,
} = SQL_QUERY_ENGINE_SHARED;

const WRITE_TRANSACTION_OWNERSHIP = Object.freeze({
  DIRECT_AUTOCOMMIT: 'DIRECT_AUTOCOMMIT',
  EXPLICIT: 'EXPLICIT',
  STATEMENT_AUTOCOMMIT: 'STATEMENT_AUTOCOMMIT',
});
const STATEMENT_AUTOCOMMIT_SESSION_PREFIX = 'statement-autocommit';
// The planner and routing log of each partition-routed write statement.
const PARTITION_ROUTED_WRITE = Object.freeze({
  [QUERY_AST_TYPE.UPDATE]: Object.freeze({
    plan: (planner, ...args) => planner.planUpdate(...args),
    routingLogMessage: QUERY_LOG_MSG.ROUTING_UPDATE,
  }),
  [QUERY_AST_TYPE.DELETE]: Object.freeze({
    plan: (planner, ...args) => planner.planDelete(...args),
    routingLogMessage: QUERY_LOG_MSG.ROUTING_DELETE,
  }),
});
// Whether a definitively conflicted statement-autocommit attempt is followed
// by another (TX1 seam V): ADMITTED after the coordinator's backoff, or the
// bound that stops it.
const STATEMENT_REATTEMPT = Object.freeze({
  ADMITTED: 'admitted',
  ATTEMPTS_SPENT: 'attempts_spent',
  DEADLINE_SPENT: 'deadline_spent',
});

// The idempotency key a caller delivers every attempt of one logical write
// under: the write plan derives each participant's entryId from it, so a
// caller's retry after an unknown outcome is the same entry (answered from
// its outcome row) - never a fresh one that applies the write twice. A
// caller that supplies none gets one minted for this statement alone.
function writeIdentityOf(queryOptions) {
  return typeof queryOptions?.idempotencyKey === 'string' &&
    queryOptions.idempotencyKey.length > 0 ?
    {idempotencyKey: queryOptions.idempotencyKey} : {};
}

// TX1 seam V (owner decisions 2026-10-10, design 3.6): a statement-autocommit
// attempt is definitively not committed by a participant conflict when a
// participant refused its PREPARE for conflict, the commit point was never
// reached, and the recorded ROLLBACK reached every participant (the attempt's
// abort disposition is complete). An unknown outcome, a COMMIT decision and an
// explicit transaction never qualify.
function isDefinitiveStatementConflict(transaction, result) {
  return transaction.ownership ===
      WRITE_TRANSACTION_OWNERSHIP.STATEMENT_AUTOCOMMIT &&
    !transaction.failure &&
    result?.success === false &&
    result.errorCode === QUERY_ERROR_CODE.TRANSACTION_CONFLICT &&
    result[COMMIT_POINT_REACHED_FIELD] === false &&
    Array.isArray(result.rollbackFailedParticipants) &&
    result.rollbackFailedParticipants.length === 0;
}

class SQLQueryEngineWriteExecution extends SQLQueryEngineTransactionRecoveryMethods {
  /**
   * Write-path epoch fencing: resolve the epoch a write is planned
   * against; the partition boundary rejects a stale epoch.
   * @param {Object} tableInfo - Table row.
   * @return {*} Active partition version.
   * @private
   */
  resolveWriteFencePartitionVersion(tableInfo) {
    return this.resolveActivePartitionVersion(tableInfo);
  }

  /**
   * Build the routed write-execution options for one planned write:
   * delivery priority, timeout/budget, cancellation, routing-readiness
   * dimension, and the epoch fence the partition boundary validates.
   * @param {string} tableName - Target table.
   * @param {Object} tableInfo - Table row.
   * @param {string} sessionId - Owning session.
   * @param {Object} queryOptions - Caller query options.
   * @return {Object} Write-execution options.
   * @private
   */
  buildRoutedWriteExecutionOptions(tableName, tableInfo, sessionId, queryOptions) {
    const deliveryPriority = this.resolveRoutedDeliveryPriority(
      tableName,
      queryOptions.deliveryPriority,
    );
    return this.applyWriteExecutionDeliverySource({
      sessionId,
      deliveryPriority,
      timeoutMs: queryOptions.timeoutMs,
      timeoutBudget: queryOptions.timeoutBudget || null,
      cancellationToken: queryOptions.cancellationToken || null,
      routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
        tableName,
        queryOptions.routingReadinessDimension,
      ),
      expectedPartitionVersion:
        this.resolveWriteFencePartitionVersion(tableInfo),
      // The statement's origin travels to every partition it is routed to.
      [STATEMENT_INGRESS_FIELD]: resolveStatementIngress(queryOptions),
    }, queryOptions);
  }

  resolveWriteTransactionOwnership(sessionId, writePlan) {
    if (this.transactionCoordinator.getTransaction(sessionId)) {
      return WRITE_TRANSACTION_OWNERSHIP.EXPLICIT;
    }
    return writePlan.partitionStatements.size <= 1 ?
      WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT :
      WRITE_TRANSACTION_OWNERSHIP.STATEMENT_AUTOCOMMIT;
  }

  /**
   * Open the transaction one write statement attempt runs in.
   * @param {string} sessionId - The client's session.
   * @param {Object} writePlan - The statement's write plan.
   * @param {Object} [queryOptions] - Caller query options.
   * @param {Object} [firstAttemptState] - A retried statement-autocommit
   *   attempt's first transaction, whose deadline it keeps.
   * @return {Promise<Object>} The opened write transaction.
   */
  async openWriteTransaction(sessionId, writePlan, queryOptions = {},
    firstAttemptState = null) {
    // Decided in the same turn as the ownership: a write the session sent
    // for a transaction the engine no longer holds is refused, never run as
    // autocommit.
    const admission = admitExpectedTransaction(
      this.transactionCoordinator,
      sessionId,
      queryOptions.expectedTransactionId,
    );
    return admission.state === STATEMENT_ADMISSION.REFUSED ?
      {
        ownership: WRITE_TRANSACTION_OWNERSHIP.EXPLICIT,
        sessionId,
        failure: admission.failure,
      } :
      this.openAdmittedWriteTransaction(sessionId, writePlan,
        firstAttemptState);
  }

  async openAdmittedWriteTransaction(sessionId, writePlan,
    firstAttemptState = null) {
    const transactionState =
      this.transactionCoordinator.getTransaction(sessionId);
    const ownership = this.resolveWriteTransactionOwnership(
      sessionId,
      writePlan,
    );
    switch (ownership) {
    case WRITE_TRANSACTION_OWNERSHIP.EXPLICIT:
      return {ownership, sessionId, transactionState};
    case WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT:
      return {ownership, sessionId};
    default:
      break;
    }
    const statementSessionId = [
      STATEMENT_AUTOCOMMIT_SESSION_PREFIX,
      writePlan.operationId,
    ].join(':');
    const beginResult = await this.transactionCoordinator.begin(
      statementSessionId,
      {transactionMode: TRANSACTION_MODE.AUTOCOMMIT,
        timeoutDeadline: firstAttemptState?.timeoutDeadline},
    );
    if (beginResult.success !== true) {
      return {ownership,
        sessionId: statementSessionId, failure: beginResult};
    }
    return {
      ownership,
      sessionId: statementSessionId,
      transactionState:
        this.transactionCoordinator.getTransaction(statementSessionId),
    };
  }

  async executeWriteTransaction(transaction, buildOperation, executeWrite) {
    if (transaction.failure) {
      return transaction.failure;
    }
    if (transaction.ownership === WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT) {
      return executeWrite(transaction.sessionId);
    }
    // A transactional statement reaches each participant carrying the
    // transaction's identity (TX1 seam A): the participant stages it in the
    // transaction's session and never runs it as a sessionless write.
    return this.transactionCoordinator.executeWriteStatement(
      transaction.sessionId,
      buildOperation(),
      (transactionIdentity) =>
        executeWrite(transaction.sessionId, transactionIdentity),
      transaction.transactionState?.transactionId,
    );
  }

  async finishWriteTransaction(transaction, result) {
    if (
      transaction.ownership !==
      WRITE_TRANSACTION_OWNERSHIP.STATEMENT_AUTOCOMMIT ||
      transaction.failure
    ) {
      return result;
    }
    if (result?.success !== true) {
      await this.transactionCoordinator.rollback(transaction.sessionId);
      return result;
    }
    const commitResult =
      await this.transactionCoordinator.commit(transaction.sessionId);
    return commitResult.success === true ?
      {...result, transaction: commitResult} :
      commitResult;
  }

  async rollbackOwnedWriteTransaction(transaction) {
    if (
      transaction.ownership ===
        WRITE_TRANSACTION_OWNERSHIP.STATEMENT_AUTOCOMMIT &&
      !transaction.failure &&
      this.transactionCoordinator.getTransaction(transaction.sessionId)
    ) {
      await this.transactionCoordinator.rollback(transaction.sessionId);
    }
  }
  /**
   * Execute an INSERT statement.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Insert result.
   * @private
   */
  async executeInsert(ast, params, sessionId, queryOptions = {}) {
    const tableName = ast.table;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planInsert(
      ast,
      params,
      {sessionId},
    );
    const planningDurationMs = Date.now() - planningStartTimeMs;
    const tablePlan = distributedPlan.tablePlans.get(tableName) || null;
    if (!tablePlan || tablePlan.partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }
    const writePlan = this.distributedWriteCoordinator.createWritePlan(
      ast,
      params,
      {sessionId, ...writeIdentityOf(queryOptions)},
    );
    this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);

    const owned = await this.runOwnedWriteStatement({
      sessionId,
      queryOptions,
      params,
      writePlan,
      tableName,
      tableInfo,
      dualWriteMigration,
      statementType: QUERY_AST_TYPE.INSERT,
      logRouting: () => this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, {
        tableName,
        rowCount: ast.values.length,
        partitionCount: writePlan.partitionStatements.size,
        sessionId,
      }),
    });
    if (owned.settled) {
      return owned.settled;
    }
    return this.completeOwnedWriteStatement(owned, {
      statementType: QUERY_AST_TYPE.INSERT,
      tableName,
      writePlan,
      queryOptions,
      dualWriteMigration,
      distributedPlan,
      planningDurationMs,
      resultFields: {operation: QUERY_OPERATION.INSERT},
    });
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Update result.
   * @private
   */
  async executeUpdate(ast, params, sessionId, queryOptions = {}) {
    return this.executePartitionRoutedWrite(ast, params, sessionId,
      queryOptions, QUERY_AST_TYPE.UPDATE);
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Delete result.
   * @private
   */
  async executeDelete(ast, params, sessionId, queryOptions = {}) {
    return this.executePartitionRoutedWrite(ast, params, sessionId,
      queryOptions, QUERY_AST_TYPE.DELETE);
  }

  /**
   * Execute an UPDATE or a DELETE: plan the partitions it reaches, run its
   * owned write statement and answer it.
   * @param {Object} ast - Parsed statement AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} queryOptions - Query execution options.
   * @param {string} statementType - QUERY_AST_TYPE.UPDATE or DELETE.
   * @return {Promise<Object>} The statement result.
   * @private
   */
  async executePartitionRoutedWrite(ast, params, sessionId, queryOptions,
    statementType) {
    const statement = PARTITION_ROUTED_WRITE[statementType];
    const tableName = ast.table;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
    const planningStartTimeMs = Date.now();
    const distributedPlan = statement.plan(
      this.distributedQueryPlanner,
      ast,
      params,
      {sessionId},
    );
    const planningDurationMs = Date.now() - planningStartTimeMs;

    const tablePlan = distributedPlan.tablePlans.get(tableName) || null;
    if (!tablePlan || tablePlan.partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    const partitionIds = tablePlan.partitions;
    const writePlan = this.distributedWriteCoordinator.createWritePlan(
      ast,
      params,
      {
        sessionId,
        partitionIds,
        ...writeIdentityOf(queryOptions),
      },
    );
    this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
    const owned = await this.runOwnedWriteStatement({
      sessionId,
      queryOptions,
      params,
      writePlan,
      tableName,
      tableInfo,
      dualWriteMigration,
      statementType,
      logRouting: () => this.logger.debug(statement.routingLogMessage, {
        tableName,
        partitionCount: partitionIds.length,
        sessionId,
      }),
    });
    if (owned.settled) {
      return owned.settled;
    }
    return this.completeOwnedWriteStatement(owned, {
      statementType,
      tableName,
      writePlan,
      queryOptions,
      dualWriteMigration,
      distributedPlan,
      planningDurationMs,
      resultFields: {},
    });
  }

  /**
   * The answer of an owned write statement: a DIRECT_AUTOCOMMIT write is
   * tracked and may ask for a managed-split evaluation, a successful write
   * records its service partition access, and the result carries the
   * distributed plan and metrics.
   * @param {Object} owned - What runOwnedWriteStatement settled:
   *   {writeTransaction, result, executionDurationMs}.
   * @param {Object} statement - {statementType, tableName, writePlan,
   *   queryOptions, dualWriteMigration, distributedPlan, planningDurationMs,
   *   resultFields}.
   * @return {Object} The statement result.
   * @private
   */
  completeOwnedWriteStatement(owned, statement) {
    const {writeTransaction, result, executionDurationMs} = owned;
    const {tableName, writePlan, distributedPlan} = statement;
    if (
      writeTransaction.ownership ===
        WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT &&
      !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)
    ) {
      this.fireNonTransactionalWriteResult(
        writePlan,
        statement.statementType,
        result,
      );
      this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
    }
    if (result?.success === true) {
      this.recordServicePartitionAccess(
        statement.queryOptions,
        Array.from(writePlan.partitionStatements.keys()),
        SERVICE_PARTITION_ACCESS_KIND.WRITE,
      );
    }
    return {
      ...result,
      ...statement.resultFields,
      tableName,
      dualWriteMode: statement.dualWriteMigration !== null,
      distributedPlan,
      distributedWritePlan: writePlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs: statement.planningDurationMs,
        executionDurationMs,
        retryCount: result.retryCount || 0,
      },
    };
  }

  /**
   * Open, execute and finish one write statement's owned transaction. The
   * statement-autocommit owner retries a whole attempt (TX1 seam V): a new
   * BEGIN (a new transactionId and base), the write again and the COMMIT
   * again, only after the attempt was definitively not committed by a
   * participant conflict, within the first attempt's transaction deadline
   * and the coordinator's participant retry bound and backoff. An explicit
   * transaction is never retried: its client receives the typed conflict.
   * @param {Object} statement - {sessionId, queryOptions, params, writePlan,
   *   tableName, tableInfo, dualWriteMigration, statementType, logRouting}.
   * @return {Promise<Object>} {settled}, a failure the caller returns as it
   *   is, or {writeTransaction, result, executionDurationMs}.
   * @private
   */
  async runOwnedWriteStatement(statement) {
    return this.runOwnedWriteStatementAttempt(statement, 1, null);
  }

  /**
   * One attempt of a write statement's owned transaction. A definitively
   * conflicted statement-autocommit attempt is followed by the next one
   * after the coordinator's participant backoff, within the coordinator's
   * participant retry bound and the first attempt's deadline; a conflict
   * past either bound is answered as it is, with the bound that stopped it
   * logged.
   * @param {Object} statement - See runOwnedWriteStatement.
   * @param {number} attempt - This attempt (1-based).
   * @param {Object|null} firstAttemptState - The first attempt's
   *   transaction, for every later attempt.
   * @return {Promise<Object>} See runOwnedWriteStatement.
   * @private
   */
  async runOwnedWriteStatementAttempt(statement, attempt, firstAttemptState) {
    const writeTransaction = await this.openWriteTransaction(
      statement.sessionId,
      statement.writePlan,
      statement.queryOptions,
      firstAttemptState,
    );
    const outcome =
      await this.runOwnedWriteAttempt(statement, writeTransaction);
    if (outcome.settled) {
      return outcome;
    }
    if (!isDefinitiveStatementConflict(writeTransaction, outcome.result)) {
      return this.settleOwnedWriteResult(statement, writeTransaction, outcome);
    }
    const firstState = firstAttemptState ?? writeTransaction.transactionState;
    const reattempt =
      await this.awaitStatementConflictReattempt(firstState, attempt);
    const conflictFields = {
      operationId: statement.writePlan.operationId,
      attempt,
      transactionId: outcome.result.transactionId,
    };
    if (reattempt !== STATEMENT_REATTEMPT.ADMITTED) {
      this.logger.warn(QUERY_LOG_MSG.STATEMENT_CONFLICT_RETRY_STOPPED,
        {...conflictFields, bound: reattempt});
      return this.settleOwnedWriteResult(statement, writeTransaction, outcome);
    }
    this.logger.info(QUERY_LOG_MSG.STATEMENT_CONFLICT_RETRY, conflictFields);
    return this.runOwnedWriteStatementAttempt(statement, attempt + 1,
      firstState);
  }

  /**
   * One attempt of a write statement's owned transaction, opened by the
   * caller: the write, then the transaction's finish.
   * @param {Object} statement - See runOwnedWriteStatement.
   * @param {Object} writeTransaction - The attempt's transaction.
   * @return {Promise<Object>} {settled} or {result, executionDurationMs}.
   * @private
   */
  async runOwnedWriteAttempt(statement, writeTransaction) {
    const {sessionId, queryOptions, params, writePlan, statementType} =
      statement;
    const failureContext = {
      txState: writeTransaction.transactionState,
      sessionId,
      writePlan,
      statementType,
      tableName: statement.tableName,
    };
    let result;
    const executionStartTimeMs = Date.now();
    try {
      statement.logRouting();
      const writeExecutionOptions = this.buildRoutedWriteExecutionOptions(
        statement.tableName,
        statement.tableInfo,
        sessionId,
        queryOptions,
      );
      if (statement.dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          statement.dualWriteMigration.migration_id ||
          statement.dualWriteMigration.migrationId ||
          null;
      }
      result = await this.executeWriteTransaction(
        writeTransaction,
        () => ({
          statementType,
          operationId: writePlan.operationId,
          partitionIds: Array.from(writePlan.partitionStatements.keys()),
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash: this.createWriteOperationPayloadHash(
            writePlan,
            statementType,
          ),
        }),
        (executionSessionId, transactionIdentity) =>
          this.distributedWriteCoordinator.executePlan(
            writePlan,
            params,
            {...writeExecutionOptions, sessionId: executionSessionId,
              transactionIdentity},
          ),
      );
    } catch (error) {
      await this.rollbackOwnedWriteTransaction(writeTransaction);
      const settled = await this.resolveRetryableSystemTableMutationFailure({
        ...failureContext,
        queryOptions,
        error,
      });
      if (settled) {
        return {settled};
      }
      await this.recordWriteExecutionFailure({...failureContext, error});
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;
    return {
      result: await this.finishWriteTransaction(writeTransaction, result),
      executionDurationMs,
    };
  }

  /**
   * Whether a definitively conflicted statement-autocommit attempt is
   * followed by another: within the coordinator's participant retry bound
   * and the first attempt's deadline, after the coordinator's participant
   * backoff.
   * @param {Object} firstAttemptState - The first attempt's transaction.
   * @param {number} attempt - The attempt that conflicted (1-based).
   * @return {Promise<string>} A STATEMENT_REATTEMPT state.
   * @private
   */
  async awaitStatementConflictReattempt(firstAttemptState, attempt) {
    const coordinator = this.transactionCoordinator;
    if (!Number.isSafeInteger(coordinator.participantRetryMaxRetries) ||
        attempt > coordinator.participantRetryMaxRetries) {
      return STATEMENT_REATTEMPT.ATTEMPTS_SPENT;
    }
    if (coordinator.isTransactionBudgetExceeded(firstAttemptState)) {
      return STATEMENT_REATTEMPT.DEADLINE_SPENT;
    }
    await coordinator.sleep(
      coordinator.calculateParticipantRetryDelay(attempt));
    return coordinator.isTransactionBudgetExceeded(firstAttemptState) ?
      STATEMENT_REATTEMPT.DEADLINE_SPENT :
      STATEMENT_REATTEMPT.ADMITTED;
  }

  /**
   * The statement's last attempt, settled: a failure the system-table
   * mutation owner answers canonically is returned as that answer.
   * @param {Object} statement - See runOwnedWriteStatement.
   * @param {Object} writeTransaction - The last attempt's transaction.
   * @param {Object} outcome - {result, executionDurationMs}.
   * @return {Promise<Object>} {settled} or {writeTransaction, result,
   *   executionDurationMs}.
   * @private
   */
  async settleOwnedWriteResult(statement, writeTransaction, outcome) {
    if (outcome.result?.success === false) {
      const settled = await this.resolveRetryableSystemTableMutationFailure({
        txState: writeTransaction.transactionState,
        sessionId: statement.sessionId,
        writePlan: statement.writePlan,
        statementType: statement.statementType,
        tableName: statement.tableName,
        queryOptions: statement.queryOptions,
        failureLike: outcome.result,
      });
      if (settled) {
        return {settled};
      }
    }
    return {...outcome, writeTransaction};
  }
}

export {SQLQueryEngineWriteExecution};
