import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineTransactionRecoveryMethods} from './sql-query-engine-transaction-recovery-methods.js';
import {
  SERVICE_PARTITION_ACCESS_KIND,
  TRANSACTION_MODE,
} from '../constants/index.js';


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

class SQLQueryEngineWriteExecution extends SQLQueryEngineTransactionRecoveryMethods {
  resolveWriteTransactionOwnership(sessionId, writePlan) {
    if (this.transactionCoordinator.getTransaction(sessionId)) {
      return WRITE_TRANSACTION_OWNERSHIP.EXPLICIT;
    }
    return writePlan.partitionStatements.size <= 1 ?
      WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT :
      WRITE_TRANSACTION_OWNERSHIP.STATEMENT_AUTOCOMMIT;
  }

  async openWriteTransaction(sessionId, writePlan) {
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
      {transactionMode: TRANSACTION_MODE.AUTOCOMMIT},
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
    return this.transactionCoordinator.executeWriteStatement(
      transaction.sessionId,
      buildOperation(),
      () => executeWrite(transaction.sessionId),
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
      {sessionId},
    );
    this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);

    const writePartitions = Array.from(writePlan.partitionStatements.keys());
    const writeTransaction = await this.openWriteTransaction(
      sessionId,
      writePlan,
    );
    const txState = writeTransaction.transactionState;
    let result;
    const executionStartTimeMs = Date.now();
    try {
      this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, {
        tableName,
        rowCount: ast.values.length,
        partitionCount: writePlan.partitionStatements.size,
        sessionId,
      });

      const deliveryPriority = this.resolveRoutedDeliveryPriority(
        tableName,
        queryOptions.deliveryPriority,
      );
      const writeExecutionOptions = this.applyWriteExecutionDeliverySource({
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        timeoutBudget: queryOptions.timeoutBudget || null,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
        // Write-path epoch fencing: the epoch this write was planned
        // against; the partition boundary rejects a stale epoch.
        expectedPartitionVersion:
          this.resolveActivePartitionVersion(tableInfo),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.executeWriteTransaction(
        writeTransaction,
        () => ({
          statementType: QUERY_AST_TYPE.INSERT,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash: this.createWriteOperationPayloadHash(
            writePlan,
            QUERY_AST_TYPE.INSERT,
          ),
        }),
        (executionSessionId) => this.distributedWriteCoordinator.executePlan(
          writePlan,
          params,
          {...writeExecutionOptions, sessionId: executionSessionId},
        ),
      );
    } catch (error) {
      await this.rollbackOwnedWriteTransaction(writeTransaction);
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.INSERT,
          tableName,
          queryOptions,
          error,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
      await this.recordWriteExecutionFailure({
        txState,
        sessionId,
        writePlan,
        statementType: QUERY_AST_TYPE.INSERT,
        tableName,
        error,
      });
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;
    result = await this.finishWriteTransaction(writeTransaction, result);
    if (result?.success === false) {
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.INSERT,
          tableName,
          queryOptions,
          failureLike: result,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
    }

    if (
      writeTransaction.ownership ===
        WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT &&
      !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)
    ) {
      this.fireNonTransactionalWriteResult(
        writePlan,
        QUERY_AST_TYPE.INSERT,
        result,
      );
      this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
    }

    if (result?.success === true) {
      this.recordServicePartitionAccess(
        queryOptions,
        writePartitions,
        SERVICE_PARTITION_ACCESS_KIND.WRITE,
      );
    }

    return {
      ...result,
      operation: QUERY_OPERATION.INSERT,
      tableName,
      dualWriteMode: dualWriteMigration !== null,
      distributedPlan,
      distributedWritePlan: writePlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        retryCount: result.retryCount || 0,
      },
    };
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
    const tableName = ast.table;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planUpdate(
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
      },
    );
    this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
    const writePartitions = Array.from(writePlan.partitionStatements.keys());

    const writeTransaction = await this.openWriteTransaction(
      sessionId,
      writePlan,
    );
    const txState = writeTransaction.transactionState;

    // Execute update on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      this.logger.debug(QUERY_LOG_MSG.ROUTING_UPDATE, {
        tableName,
        partitionCount: partitionIds.length,
        sessionId,
      });

      const deliveryPriority = this.resolveRoutedDeliveryPriority(
        tableName,
        queryOptions.deliveryPriority,
      );
      const writeExecutionOptions = this.applyWriteExecutionDeliverySource({
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        timeoutBudget: queryOptions.timeoutBudget || null,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
        // Write-path epoch fencing: the epoch this write was planned
        // against; the partition boundary rejects a stale epoch.
        expectedPartitionVersion:
          this.resolveActivePartitionVersion(tableInfo),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.executeWriteTransaction(
        writeTransaction,
        () => ({
          statementType: QUERY_AST_TYPE.UPDATE,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash: this.createWriteOperationPayloadHash(
            writePlan,
            QUERY_AST_TYPE.UPDATE,
          ),
        }),
        (executionSessionId) => this.distributedWriteCoordinator.executePlan(
          writePlan,
          params,
          {...writeExecutionOptions, sessionId: executionSessionId},
        ),
      );
    } catch (error) {
      await this.rollbackOwnedWriteTransaction(writeTransaction);
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.UPDATE,
          tableName,
          queryOptions,
          error,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
      await this.recordWriteExecutionFailure({
        txState,
        sessionId,
        writePlan,
        statementType: QUERY_AST_TYPE.UPDATE,
        tableName,
        error,
      });
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;
    result = await this.finishWriteTransaction(writeTransaction, result);
    if (result?.success === false) {
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.UPDATE,
          tableName,
          queryOptions,
          failureLike: result,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
    }

    if (
      writeTransaction.ownership ===
        WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT &&
      !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)
    ) {
      this.fireNonTransactionalWriteResult(
        writePlan,
        QUERY_AST_TYPE.UPDATE,
        result,
      );
      this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
    }

    if (result?.success === true) {
      this.recordServicePartitionAccess(
        queryOptions,
        writePartitions,
        SERVICE_PARTITION_ACCESS_KIND.WRITE,
      );
    }

    return {
      ...result,
      tableName,
      dualWriteMode: dualWriteMigration !== null,
      distributedPlan,
      distributedWritePlan: writePlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        retryCount: result.retryCount || 0,
      },
    };
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
    const tableName = ast.table;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planDelete(
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
      },
    );
    this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
    const writePartitions = Array.from(writePlan.partitionStatements.keys());

    const writeTransaction = await this.openWriteTransaction(
      sessionId,
      writePlan,
    );
    const txState = writeTransaction.transactionState;

    // Execute delete on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      this.logger.debug(QUERY_LOG_MSG.ROUTING_DELETE, {
        tableName,
        partitionCount: partitionIds.length,
        sessionId,
      });

      const deliveryPriority = this.resolveRoutedDeliveryPriority(
        tableName,
        queryOptions.deliveryPriority,
      );
      const writeExecutionOptions = this.applyWriteExecutionDeliverySource({
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        timeoutBudget: queryOptions.timeoutBudget || null,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
        // Write-path epoch fencing: the epoch this write was planned
        // against; the partition boundary rejects a stale epoch.
        expectedPartitionVersion:
          this.resolveActivePartitionVersion(tableInfo),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.executeWriteTransaction(
        writeTransaction,
        () => ({
          statementType: QUERY_AST_TYPE.DELETE,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash: this.createWriteOperationPayloadHash(
            writePlan,
            QUERY_AST_TYPE.DELETE,
          ),
        }),
        (executionSessionId) => this.distributedWriteCoordinator.executePlan(
          writePlan,
          params,
          {...writeExecutionOptions, sessionId: executionSessionId},
        ),
      );
    } catch (error) {
      await this.rollbackOwnedWriteTransaction(writeTransaction);
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.DELETE,
          tableName,
          queryOptions,
          error,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
      await this.recordWriteExecutionFailure({
        txState,
        sessionId,
        writePlan,
        statementType: QUERY_AST_TYPE.DELETE,
        tableName,
        error,
      });
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;
    result = await this.finishWriteTransaction(writeTransaction, result);
    if (result?.success === false) {
      const canonicalFailure =
        await this.resolveRetryableSystemTableMutationFailure({
          txState,
          sessionId,
          writePlan,
          statementType: QUERY_AST_TYPE.DELETE,
          tableName,
          queryOptions,
          failureLike: result,
        });
      if (canonicalFailure) {
        return canonicalFailure;
      }
    }

    if (
      writeTransaction.ownership ===
        WRITE_TRANSACTION_OWNERSHIP.DIRECT_AUTOCOMMIT &&
      !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)
    ) {
      this.fireNonTransactionalWriteResult(
        writePlan,
        QUERY_AST_TYPE.DELETE,
        result,
      );
      this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
    }

    if (result?.success === true) {
      this.recordServicePartitionAccess(
        queryOptions,
        writePartitions,
        SERVICE_PARTITION_ACCESS_KIND.WRITE,
      );
    }

    return {
      ...result,
      tableName,
      dualWriteMode: dualWriteMigration !== null,
      distributedPlan,
      distributedWritePlan: writePlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        retryCount: result.retryCount || 0,
      },
    };
  }
}

export {SQLQueryEngineWriteExecution};
