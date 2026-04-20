import { SQL_QUERY_ENGINE_SHARED } from "./sql-query-engine-shared.js";
import { SQLQueryEngineSegment6 } from "./sql-query-engine-segment-6.js";

const {
  ACTIVE_PARTITION_STATE,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  AddressManager,
  AuthoritativeControlPlaneView,
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS,
  BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_REASON,
  BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE,
  BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE,
  BudgetEnforcer,
  CALLBACK_RUNTIME_KIND,
  CODE_LOOKUP_BY_FUNCTION_ID_SQL,
  CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
  COLUMN,
  CONNECTION_STATE_CONNECTED,
  CONNECTION_STATE_READY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CallbackExecutionHost,
  CancellationToken,
  ConfigurationManager,
  DEFAULT_CODE_VERSION,
  DEFAULT_PARTITION_VERSION,
  DEFAULT_SNAPSHOT_MODE,
  DUAL_WRITE_ACTIVE_STATUSES,
  DistributedQueryPlanner,
  DistributedTransactionCoordinator,
  DistributedWriteCoordinator,
  ENTITY_TYPE,
  EXECUTION_MODE,
  EXPLAIN_DISTRIBUTED_PREFIX_REGEX,
  ExecutionContext,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LineageTracker,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_STATUS,
  MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL,
  ManagedSplitTopologyAdapter,
  ManagedSplitWorkflow,
  MigrationCoordinator,
  MigrationPipeline,
  NATIVE_CALLBACK_EXPORTS_ARG,
  NATIVE_CALLBACK_MODULE_ARG,
  NATIVE_CALLBACK_RETURN_LINE,
  NUM,
  OPERATION_METADATA_KEY,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  OperationType,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROVISIONING_REJECTION_DETAIL_LIMIT,
  PROVISIONING_REJECTION_REASON_UNKNOWN,
  PROVISIONING_REJECTION_SUMMARY_NONE,
  PartitionCallbackDispatcher,
  PartitionResolver,
  PressureGovernor,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  QueryExecutor,
  RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE,
  RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS,
  ReplicaOperationField,
  SERVICE_TYPE,
  SQLParser,
  SQL_PARSE_CACHE,
  STATE,
  STATUS_ACTIVE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  SYSTEM_TABLE_NAME,
  SqlParseCache,
  TABLES,
  TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
  TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON,
  TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TableCreationService,
  TimeoutPolicy,
  WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS,
  WRITE_OPERATION_STATUS,
  WRITE_TRACKING_EXCLUDED_TABLES,
  ZERO_SHA256_DIGEST,
  buildBootstrapRoutingOverlayEntry,
  buildBootstrapRoutingOverlayEntryState,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
  buildSystemTableMutationRoutingGapFailure,
  createCallbackDriverRegistry,
  createControlPlaneRuntimeBundle,
  createEmptyTransactionRecoveryReplaySummary,
  createHash,
  createTimeoutBudgetError,
  executePlan,
  executeStage,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemTableMutationRoutingGapBlocker,
  hasActiveAddressedPartitionService,
  isNodeRecordReady,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isRetryableManagedSplitTransition,
  isSqlRequest,
  normalizeControlPlaneMutationWorkClass,
  parseCallbackModuleArtifact,
  reorderParams,
  resolveBootstrapLeaderSelection,
  resolveRetryableControlPlaneMutationDeferState,
} = SQL_QUERY_ENGINE_SHARED;

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
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
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
      typeof sqlRequest?.statement !== "string" ||
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
    if (!ast || typeof ast !== "object") {
      return null;
    }

    const queryOptions = {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      routingReadinessDimension:
        sqlRequest?.routingReadinessDimension ||
        this.defaultRoutingReadinessDimension,
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
        typeof ast.tableName === "string" ? ast.tableName : null,
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
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
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
    const trackedFailure = {
      success: false,
      error:
        context?.failureResult?.error ||
        context?.error?.message ||
        QUERY_ERROR_MSG.QUERY_EXECUTION_FAILED,
      retryCount: 0,
    };
    if (
      typeof context?.failureResult?.errorCode === "string" &&
      context.failureResult.errorCode.length > 0
    ) {
      trackedFailure.errorCode = context.failureResult.errorCode;
    }
    if (context?.failureResult?.deferRetry === true) {
      trackedFailure.deferRetry = true;
    }
    if (
      Number.isFinite(context?.failureResult?.retryAfterMs) &&
      context.failureResult.retryAfterMs > 0
    ) {
      trackedFailure.retryAfterMs = Math.floor(
        context.failureResult.retryAfterMs,
      );
    }
    if (
      typeof context?.failureResult?.outcome === "string" &&
      context.failureResult.outcome.length > 0
    ) {
      trackedFailure.outcome = context.failureResult.outcome;
    }
    if (
      typeof context?.failureResult?.contractState === "string" &&
      context.failureResult.contractState.length > 0
    ) {
      trackedFailure.contractState = context.failureResult.contractState;
    }
    if (
      typeof context?.failureResult?.nextAction === "string" &&
      context.failureResult.nextAction.length > 0
    ) {
      trackedFailure.nextAction = context.failureResult.nextAction;
    }
    if (
      typeof context?.failureResult?.reasonCode === "string" &&
      context.failureResult.reasonCode.length > 0
    ) {
      trackedFailure.reasonCode = context.failureResult.reasonCode;
    }
    if (Array.isArray(context?.failureResult?.reasonCodes)) {
      trackedFailure.reasonCodes = [...context.failureResult.reasonCodes];
    }
    if (Array.isArray(context?.failureResult?.failedDimensions)) {
      trackedFailure.failedDimensions = [
        ...context.failureResult.failedDimensions,
      ];
    }
    if (
      context?.failureResult?.runtimeAuthority &&
      typeof context.failureResult.runtimeAuthority === "object"
    ) {
      trackedFailure.runtimeAuthority = context.failureResult.runtimeAuthority;
    }
    if (
      context?.failureResult?.details &&
      typeof context.failureResult.details === "object"
    ) {
      trackedFailure.details = { ...context.failureResult.details };
    }
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
      { sessionId },
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
      { sessionId },
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
        routingReadinessDimension:
          queryOptions.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
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
      { sessionId },
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
        routingReadinessDimension:
          queryOptions.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
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
      { sessionId },
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
        routingReadinessDimension:
          queryOptions.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
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
      typeof this.transactionCoordinator.recoverFromSystemTables !== "function"
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
      "function"
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
    if (typeof this.systemCache.getAll === "function") {
      return this.systemCache.getAll(tableName) || [];
    }
    if (typeof this.systemCache.filter === "function") {
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
    if (typeof gateway?.supportsMutationSubmission === "function") {
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
    const workClass = options?.workClass || PRESSURE_WORK_CLASS.CRITICAL;
    const mutationOptions = {
      workClass,
      deliveryPriority:
        workClass === PRESSURE_WORK_CLASS.CRITICAL
          ? "critical"
          : this.resolveRoutedDeliveryPriority(tableName),
      skipCacheWait: true,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    };
    const coalescingKey =
      typeof options?.coalescingKey === "string" ? options.coalescingKey : "";
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

export { SQLQueryEngineSegment7 };
