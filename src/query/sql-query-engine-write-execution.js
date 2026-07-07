import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineTransactionRecoveryMethods} from './sql-query-engine-transaction-recovery-methods.js';
import {SERVICE_PARTITION_ACCESS_KIND} from '../constants/index.js';


const {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  WRITE_TRACKING_EXCLUDED_TABLES,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineWriteExecution extends SQLQueryEngineTransactionRecoveryMethods {
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);
    const writePartitions = Array.from(writePlan.partitionStatements.keys());
    let result;
    const executionStartTimeMs = Date.now();
    try {
      if (txState) {
        const payloadHash = this.createWriteOperationPayloadHash(
          writePlan,
          QUERY_AST_TYPE.INSERT,
        );
        const enlistResult =
          await this.transactionCoordinator.enlistParticipants(
            sessionId,
            writePartitions,
          );
        if (!enlistResult.success) {
          const canonicalFailure =
            await this.resolveRetryableSystemTableMutationFailure({
              txState,
              sessionId,
              writePlan,
              statementType: QUERY_AST_TYPE.INSERT,
              tableName,
              queryOptions,
              failureLike: enlistResult,
            });
          if (canonicalFailure) {
            return canonicalFailure;
          }
          return enlistResult;
        }
        await this.transactionCoordinator.recordWriteOperation(sessionId, {
          statementType: QUERY_AST_TYPE.INSERT,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash,
        });
      }

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
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
      );
    } catch (error) {
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

    if (txState) {
      await this.transactionCoordinator.markWriteOperationResult(
        sessionId,
        writePlan.operationId,
        result,
      );
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);

    // A single-partition ledger progress write does not need 2PC — the
    // participant BEGIN IMMEDIATE it would open is spurious and, on the
    // control-plane ledger, orphans on a leaderless sibling partition and
    // freezes the durable watermark. Skip enlistment when the rebalancer flags
    // the write AND it resolved to exactly one partition POST-mirror, so a
    // SPLIT_CUTOVER write (which adds a mirror participant above) still enlists
    // full 2PC. writePartitions is snapshotted after addTransitionMirrorParticipants.
    const bypassSingleParticipant =
      queryOptions?.bypassSingleParticipantSystemWrite === true &&
      writePartitions.length === 1;

    // Execute update on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      if (txState && !bypassSingleParticipant) {
        const payloadHash = this.createWriteOperationPayloadHash(
          writePlan,
          QUERY_AST_TYPE.UPDATE,
        );
        const enlistResult =
          await this.transactionCoordinator.enlistParticipants(
            sessionId,
            writePartitions,
          );
        if (!enlistResult.success) {
          const canonicalFailure =
            await this.resolveRetryableSystemTableMutationFailure({
              txState,
              sessionId,
              writePlan,
              statementType: QUERY_AST_TYPE.UPDATE,
              tableName,
              queryOptions,
              failureLike: enlistResult,
            });
          if (canonicalFailure) {
            return canonicalFailure;
          }
          return enlistResult;
        }
        await this.transactionCoordinator.recordWriteOperation(sessionId, {
          statementType: QUERY_AST_TYPE.UPDATE,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash,
        });
      }

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
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
      );
    } catch (error) {
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

    if (txState) {
      await this.transactionCoordinator.markWriteOperationResult(
        sessionId,
        writePlan.operationId,
        result,
      );
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);

    // Execute delete on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      if (txState) {
        const payloadHash = this.createWriteOperationPayloadHash(
          writePlan,
          QUERY_AST_TYPE.DELETE,
        );
        const enlistResult =
          await this.transactionCoordinator.enlistParticipants(
            sessionId,
            writePartitions,
          );
        if (!enlistResult.success) {
          const canonicalFailure =
            await this.resolveRetryableSystemTableMutationFailure({
              txState,
              sessionId,
              writePlan,
              statementType: QUERY_AST_TYPE.DELETE,
              tableName,
              queryOptions,
              failureLike: enlistResult,
            });
          if (canonicalFailure) {
            return canonicalFailure;
          }
          return enlistResult;
        }
        await this.transactionCoordinator.recordWriteOperation(sessionId, {
          statementType: QUERY_AST_TYPE.DELETE,
          operationId: writePlan.operationId,
          partitionIds: writePartitions,
          idempotencyKey: writePlan.idempotencyKey,
          payloadHash,
        });
      }

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
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      }, queryOptions);
      if (dualWriteMigration) {
        writeExecutionOptions.dualWriteMode = true;
        writeExecutionOptions.migrationId =
          dualWriteMigration.migration_id ||
          dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
      );
    } catch (error) {
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

    if (txState) {
      await this.transactionCoordinator.markWriteOperationResult(
        sessionId,
        writePlan.operationId,
        result,
      );
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
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
