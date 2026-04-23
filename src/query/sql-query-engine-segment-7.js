import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSegment6} from './sql-query-engine-segment-6.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';

const {
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  PRESSURE_WORK_CLASS,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE,
  TABLES,
  WRITE_TRACKING_EXCLUDED_TABLES,
  buildLocalControlPlaneMutationReadinessFailure,
  buildSystemTableMutationRoutingGapFailure,
  createEmptyTransactionRecoveryReplaySummary,
  getLocalControlPlaneMutationReadinessBlocker,
  getSystemTableMutationRoutingGapBlocker,
  resolveRetryableControlPlaneMutationDeferState,
} = SQL_QUERY_ENGINE_SHARED;

const TRANSACTION_CONTROL_MUTATION_WORKLOAD_TABLES = new Set([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
]);

class SQLQueryEngineSegment7 extends SQLQueryEngineSegment6 {
  buildRetryableControlPlaneLifecycleMutationFailure(
    tableName,
    error,
    queryOptions = {},
  ) {
    if (!this.isRetryableControlPlaneMutationFailure(error)) {
      return null;
    }
    const workClass =
      queryOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE;
    if (
      resolveRetryableControlPlaneMutationDeferState(queryOptions) ===
      RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.BYPASS_CRITICAL
    ) {
      return null;
    }
    const dependencyTables =
      this.resolveTransactionControlDependencyTables(error);
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
      dependencyTables,
      queryExecutor: this.queryExecutor,
      routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
        tableName,
        queryOptions?.routingReadinessDimension,
      ),
    });
    if (routingGapBlocker) {
      return buildSystemTableMutationRoutingGapFailure({
        blocker: routingGapBlocker,
        error,
        tableName,
        workClass,
      });
    }
    if (!this.controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return buildLocalControlPlaneMutationReadinessFailure({
      blocker,
      error,
      tableName,
      workClass,
    });
  }

  /**
   * Return one canonical deferred result when a timed-out SQL request is still
   * better explained by a shared control-plane mutation boundary.
   * @param {Object} sqlRequest
   * @param {*} error
   * @return {Object|null}
   * @private
   */
  buildTimedOutSqlRequestFailure(sqlRequest, error) {
    if (
      !this.isRetryableControlPlaneMutationFailure(error) ||
      typeof sqlRequest?.statement !== 'string' ||
      sqlRequest.statement.length === 0
    ) {
      return null;
    }

    let ast = null;
    try {
      ast = this.parse(sqlRequest.statement);
    } catch (_error) {
      return null;
    }
    if (!ast || typeof ast !== 'object') {
      return null;
    }

    const queryOptions = {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
        ast?.table || null,
        sqlRequest?.routingReadinessDimension,
      ),
    };
    if (
      (ast.type === QUERY_AST_TYPE.UPDATE ||
        ast.type === QUERY_AST_TYPE.INSERT ||
        ast.type === QUERY_AST_TYPE.DELETE) &&
      this.isSystemTable(ast.table)
    ) {
      return this.buildRetryableSystemTableMutationFailure(
        ast.table,
        error,
        queryOptions,
      );
    }
    if (
      ast.type === QUERY_AST_TYPE.CREATE_TABLE ||
      ast.type === QUERY_AST_TYPE.ALTER_TABLE
    ) {
      return this.buildRetryableControlPlaneLifecycleMutationFailure(
        typeof ast.tableName === 'string' ? ast.tableName : null,
        error,
        queryOptions,
      );
    }
    return null;
  }

  /**
   * Return one canonical deferred result when a retryable system-table write
   * fails while local control-plane authority establishment is still pending.
   * @param {string} tableName
   * @param {*} error
   * @param {Object} [queryOptions={}]
   * @return {Object|null}
   * @private
   */
  buildRetryableSystemTableMutationFailure(
    tableName,
    error,
    queryOptions = {},
  ) {
    if (
      !this.isSystemTable(tableName) ||
      !this.isRetryableControlPlaneMutationFailure(error)
    ) {
      return null;
    }
    const workClass =
      queryOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE;
    if (
      resolveRetryableControlPlaneMutationDeferState(queryOptions) ===
      RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.BYPASS_CRITICAL
    ) {
      return null;
    }
    const dependencyTables =
      this.resolveTransactionControlDependencyTables(error);
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
      dependencyTables,
      queryExecutor: this.queryExecutor,
      routingReadinessDimension:
        queryOptions?.routingReadinessDimension ||
        this.defaultRoutingReadinessDimension,
    });
    if (routingGapBlocker) {
      return buildSystemTableMutationRoutingGapFailure({
        blocker: routingGapBlocker,
        error,
        tableName,
        workClass,
      });
    }
    if (!this.controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return buildLocalControlPlaneMutationReadinessFailure({
      blocker,
      error,
      tableName,
      workClass,
    });
  }

  resolveTransactionControlDependencyTables(errorLike = null) {
    const dependencyTables = new Set();
    const addDependencyTable = (tableName) => {
      if (
        typeof tableName !== 'string' ||
        tableName.length === 0 ||
        !BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES.has(tableName)
      ) {
        return;
      }
      dependencyTables.add(tableName);
    };

    addDependencyTable(errorLike?.failedTable);
    addDependencyTable(errorLike?.firstFailedParticipant?.failedTable);
    for (const participantFailure of Array.isArray(errorLike?.participantFailures) ?
      errorLike.participantFailures :
      []) {
      addDependencyTable(participantFailure?.failedTable);
    }

    return dependencyTables.size > 0 ? [...dependencyTables] : null;
  }

  /**
   * Persist and return one canonical deferred system-table mutation failure
   * when a retryable lower-path failure is better explained by an owned
   * control-plane admission boundary.
   * @param {Object} context
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveRetryableSystemTableMutationFailure(context = {}) {
    const canonicalFailure = this.buildRetryableSystemTableMutationFailure(
      context?.tableName,
      context?.failureLike || context?.error || null,
      context?.queryOptions || {},
    );
    if (!canonicalFailure) {
      return null;
    }
    await this.recordWriteExecutionFailure({
      txState: context?.txState,
      sessionId: context?.sessionId,
      writePlan: context?.writePlan,
      statementType: context?.statementType,
      tableName: context?.tableName,
      error: context?.error || null,
      failureResult: canonicalFailure,
    });
    return canonicalFailure;
  }

  /**
   * Persist one write-execution failure into the existing transaction or
   * non-transactional tracking surface.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async recordWriteExecutionFailure(context = {}) {
    const failureResult = context?.failureResult || null;
    const trackedFailure = {
      success: false,
      error:
        failureResult?.error ||
        context?.error?.message ||
        QUERY_ERROR_MSG.QUERY_EXECUTION_FAILED,
      retryCount: 0,
    };
    this.applyTrackedWriteFailureMetadata(trackedFailure, failureResult);
    if (context?.txState) {
      await this.transactionCoordinator.markWriteOperationResult(
        context.sessionId,
        context.writePlan.operationId,
        trackedFailure,
      );
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(context?.tableName)) {
      this.fireNonTransactionalWriteResult(
        context.writePlan,
        context.statementType,
        trackedFailure,
      );
    }
  }

  applyTrackedWriteFailureMetadata(trackedFailure, failureResult = null) {
    if (!failureResult || typeof failureResult !== 'object') {
      return;
    }
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      'errorCode',
      failureResult.errorCode,
    );
    if (failureResult.deferRetry === true) {
      trackedFailure.deferRetry = true;
    }
    if (
      Number.isFinite(failureResult.retryAfterMs) &&
      failureResult.retryAfterMs > 0
    ) {
      trackedFailure.retryAfterMs = Math.floor(failureResult.retryAfterMs);
    }
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      'outcome',
      failureResult.outcome,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      'contractState',
      failureResult.contractState,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      'nextAction',
      failureResult.nextAction,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      'reasonCode',
      failureResult.reasonCode,
    );
    if (Array.isArray(failureResult.reasonCodes)) {
      trackedFailure.reasonCodes = [...failureResult.reasonCodes];
    }
    if (Array.isArray(failureResult.failedDimensions)) {
      trackedFailure.failedDimensions = [...failureResult.failedDimensions];
    }
    if (
      failureResult.runtimeAuthority &&
      typeof failureResult.runtimeAuthority === 'object'
    ) {
      trackedFailure.runtimeAuthority = failureResult.runtimeAuthority;
    }
    if (failureResult.details && typeof failureResult.details === 'object') {
      trackedFailure.details = {...failureResult.details};
    }
  }

  copyTrackedWriteFailureStringField(
    trackedFailure,
    fieldName,
    fieldValue,
  ) {
    if (typeof fieldValue === 'string' && fieldValue.length > 0) {
      trackedFailure[fieldName] = fieldValue;
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
      const writeExecutionOptions = {
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      };
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

    // Execute update on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      if (txState) {
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
      const writeExecutionOptions = {
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      };
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
      const writeExecutionOptions = {
        sessionId,
        deliveryPriority,
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken: queryOptions.cancellationToken || null,
        routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
          tableName,
          queryOptions.routingReadinessDimension,
        ),
      };
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
   * Recover distributed transaction state from system cache snapshots.
   * @private
   */
  recoverDistributedTransactionStateFromCache() {
    if (this.transactionStateRecovered || !this.systemCache) {
      return;
    }
    if (
      typeof this.transactionCoordinator.recoverFromSystemTables !== 'function'
    ) {
      this.transactionStateRecovered = true;
      return;
    }

    const transactions = this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS);
    if (transactions.length === 0) {
      return;
    }

    const participants = this.loadSystemTableRows(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
    );
    const writeOperations = this.loadSystemTableRows(
      TABLES.SQL_WRITE_OPERATIONS,
    );

    this.transactionCoordinator.recoverFromSystemTables({
      transactions,
      participants,
      writeOperations,
    });
    this.transactionStateRecovered = true;
  }

  /**
   * Replay recovered in-flight distributed transactions, if supported.
   * @return {Promise<Object>} Replay summary.
   * @private
   */
  resumeRecoveredDistributedTransactions() {
    if (
      typeof this.transactionCoordinator.resumeRecoveredTransactions !==
      'function'
    ) {
      const summary = createEmptyTransactionRecoveryReplaySummary();
      this.lastTransactionRecoveryReplayResult = summary;
      return Promise.resolve(summary);
    }
    if (this.transactionRecoveryReplayPromise) {
      return this.transactionRecoveryReplayPromise;
    }

    this.transactionRecoveryReplayPromise = this.transactionCoordinator
      .resumeRecoveredTransactions()
      .then((summary) => {
        const normalizedSummary =
          summary || createEmptyTransactionRecoveryReplaySummary();
        this.lastTransactionRecoveryReplayResult = normalizedSummary;
        return normalizedSummary;
      })
      .catch((error) => {
        this.logger.warn(QUERY_LOG_MSG.DISTRIBUTED_TX_RECOVERY_REPLAY_FAILED, {
          error: error.message,
        });
        const summary = {
          totalRecovered: 0,
          resumed: 0,
          failed: 1,
          results: [],
          error: error.message,
        };
        this.lastTransactionRecoveryReplayResult = summary;
        return summary;
      })
      .finally(() => {
        this.transactionRecoveryReplayPromise = null;
      });

    return this.transactionRecoveryReplayPromise;
  }

  /**
   * Await currently running transaction recovery replay, if any.
   * @return {Promise<Object>} Replay summary.
   */
  async waitForDistributedTransactionRecoveryReplay() {
    if (!this.transactionRecoveryReplayPromise) {
      return this.lastTransactionRecoveryReplayResult;
    }
    return this.transactionRecoveryReplayPromise;
  }

  /**
   * Load rows for one table from system cache.
   * @param {string} tableName - System table name.
   * @return {Object[]} Cached rows.
   * @private
   */
  loadSystemTableRows(tableName) {
    if (!this.systemCache) {
      return [];
    }
    if (typeof this.systemCache.getAll === 'function') {
      return this.systemCache.getAll(tableName) || [];
    }
    if (typeof this.systemCache.filter === 'function') {
      return this.systemCache.filter(tableName, () => true) || [];
    }
    return [];
  }

  /**
   * Load distributed transaction recovery rows from system cache snapshots.
   * @return {{transactions: Object[], participants: Object[], writeOperations: Object[]}}
   *   Recovery payload.
   * @private
   */
  loadDistributedTransactionRecoveryState() {
    return {
      transactions: this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS),
      participants: this.loadSystemTableRows(
        TABLES.SQL_TRANSACTION_PARTICIPANTS,
      ),
      writeOperations: this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS),
    };
  }

  /**
   * Check whether distributed transaction metadata can be persisted through the
   * canonical control-plane mutation ingress.
   * @return {boolean}
   * @private
   */
  canPersistDistributedTransactionState() {
    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway?.supportsMutationSubmission === 'function') {
      return gateway.supportsMutationSubmission();
    }
    return Boolean(this.cdcIntegrationService);
  }

  /**
   * Build canonical mutation options for distributed transaction metadata.
   * Transaction state writes are durable-control-plane metadata and must not
   * fail on read-model cache lag under pressure.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @param {string|null} [options.coalescingKey]
   * @param {string} [options.workClass]
   * @return {Object}
   * @private
   */
  buildDistributedTransactionMutationOptions(tableName, options = {}) {
    const requestedWorkClass =
      options?.workClass || PRESSURE_WORK_CLASS.CRITICAL;
    const workloadClass =
      typeof options?.workloadClass === 'string' &&
      options.workloadClass.length > 0 ?
        options.workloadClass :
      TRANSACTION_CONTROL_MUTATION_WORKLOAD_TABLES.has(tableName) ?
        CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION :
        null;
    const workloadProfile = workloadClass ?
      buildControlPlaneWorkloadProfile(workloadClass, {
        workClass: requestedWorkClass,
        allowPressureDefer: options?.allowPressureDefer,
      }) :
      null;
    const workClass = workloadProfile?.workClass || requestedWorkClass;
    const mutationOptions = {
      workClass,
      deliveryPriority:
        workClass === PRESSURE_WORK_CLASS.CRITICAL ?
          'critical' :
          this.resolveRoutedDeliveryPriority(tableName),
      skipCacheWait: true,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    };
    if (workloadProfile) {
      mutationOptions.workloadClass = workloadProfile.workloadClass;
      mutationOptions.allowPressureDefer =
        workloadProfile.allowPressureDefer;
    } else if (typeof options?.allowPressureDefer === 'boolean') {
      mutationOptions.allowPressureDefer = options.allowPressureDefer;
    }
    const coalescingKey =
      typeof options?.coalescingKey === 'string' ? options.coalescingKey : '';
    if (coalescingKey.length > 0) {
      mutationOptions.coalescingKey = coalescingKey;
    }
    return mutationOptions;
  }

  /**
   * Persist one distributed transaction row.
   * @param {Object} record - Transaction persistence payload.
   * @return {Promise<void>}
   * @private
   */
}

export {SQLQueryEngineSegment7};
