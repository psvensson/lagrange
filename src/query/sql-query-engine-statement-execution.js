import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineLifecycleAndCallbackDispatch} from './sql-query-engine-lifecycle-and-callback-dispatch.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_WRITE_ACTIVITY = 'write_activity';
const LOCAL_NUM_100 = 100;
const LOCAL_STR_1KD8O = 'query_admission_deferred';
const LOCAL_STR_DDIFL = 'query_admission_rejected';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_G1DFB = 'Maximum call stack size exceeded';
const LOCAL_STR_QUERY_PLANE_WRITE = 'query-plane:write';
const LOCAL_STR_QUERY_PLANE_READ = 'query-plane:read';
const LOCAL_STR_UNKNOWN = 'unknown';

const {
  ADAPTER_ERROR_MSG,
  BudgetEnforcer,
  CancellationToken,
  DEFAULT_CODE_VERSION,
  DEFAULT_SNAPSHOT_MODE,
  EXECUTION_MODE,
  EXPLAIN_DISTRIBUTED_PREFIX_REGEX,
  ExecutionContext,
  LineageTracker,
  METRICS_LOG_TAG,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  SQLParser,
  WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS,
  buildPressureAdmissionFailure,
  executePlan,
  executeStage,
  parseCallbackModuleArtifact,
  reorderParams,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineStatementExecution extends SQLQueryEngineLifecycleAndCallbackDispatch {
  async ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor) {
    const callbackModuleRef = sqlRequest.callbackModuleRef;
    const moduleMirror = wasmExecutor.moduleMirror || null;
    if (!moduleMirror || typeof moduleMirror.getModule !== LOCAL_STR_FUNCTION) {
      throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED);
    }

    const existing = moduleMirror.getModule(callbackModuleRef);
    if (existing) {
      return;
    }

    const sessionId = sqlRequest.sessionId || QUERY_SESSION.DEFAULT;
    const codeRow = await this.lookupCallbackCodeRow(
      callbackModuleRef,
      sessionId,
    );
    if (!codeRow) {
      throw new Error(
        `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_MODULE_NOT_FOUND}: ` +
          callbackModuleRef,
      );
    }
    const codeBlob = codeRow.code_blob;
    if (typeof codeBlob !== LOCAL_STR_STRING || !codeBlob.trim()) {
      throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_SOURCE_INVALID);
    }

    const parsedArtifact = parseCallbackModuleArtifact(codeBlob);
    if (!parsedArtifact.source || typeof parsedArtifact.source !== LOCAL_STR_STRING) {
      throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_SOURCE_INVALID);
    }

    const compiledExports = this.compileCallbackModuleSource(
      parsedArtifact.source,
      ADAPTER_ERROR_MSG.WASM_CALLBACK_COMPILE_FAILED,
    );

    const manifestRow = await this.resolveLatestModuleManifestRow(
      callbackModuleRef,
      sessionId,
    );
    const runExport =
      manifestRow?.run_export ||
      parsedArtifact.runExport ||
      sqlRequest.callbackExport;
    const manifest = this.buildWasmCallbackManifest(
      manifestRow,
      runExport,
      callbackModuleRef,
    );
    const rawHandler = compiledExports ?
      compiledExports[manifest.runExport] :
      null;
    if (typeof rawHandler !== LOCAL_STR_FUNCTION) {
      throw new Error(
        `${ADAPTER_ERROR_MSG.WASM_CALLBACK_EXPORT_NOT_FOUND}: ` +
          manifest.runExport,
      );
    }

    const moduleEntry = {
      version: String(codeRow.version ?? DEFAULT_CODE_VERSION),
      wasmBytes: Buffer.from(parsedArtifact.wasmBytes),
      manifest,
      exports: compiledExports,
    };

    if (typeof moduleMirror.setModule === LOCAL_STR_FUNCTION) {
      await moduleMirror.setModule(callbackModuleRef, moduleEntry);
      return;
    }
    if (
      moduleMirror.localCache &&
      typeof moduleMirror.localCache.set === LOCAL_STR_FUNCTION
    ) {
      moduleMirror.localCache.set(callbackModuleRef, {
        ...moduleEntry,
        updatedAt: Date.now(),
      });
      return;
    }

    throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED);
  }

  /**
   * Build or reuse an execution context for stage/plan dispatch.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {ExecutionContext} Execution context instance.
   * @private
   */
  createRequestExecutionContext(sqlRequest) {
    if (sqlRequest.executionContext) {
      return sqlRequest.executionContext;
    }

    const sessionId = sqlRequest.sessionId || QUERY_SESSION.DEFAULT;
    const budgetEnforcer =
      sqlRequest.budgetEnforcer || new BudgetEnforcer(sqlRequest.budgets || {});
    const cancellationToken =
      sqlRequest.cancellationToken || new CancellationToken();
    const lineageTracker =
      sqlRequest.lineageTracker ||
      new LineageTracker(`${sessionId}-${Date.now()}`);

    return new ExecutionContext({
      session: sessionId,
      snapshot: sqlRequest.snapshot || {mode: DEFAULT_SNAPSHOT_MODE},
      budgetEnforcer,
      cancellationToken,
      lineageTracker,
      queryExecutor: async (query, params) =>
        this.executeQuery(query, params, {sessionId}),
      resultStream: sqlRequest.resultStream,
      exchangeManager: sqlRequest.exchangeManager,
      dedupeRegistry: sqlRequest.dedupeRegistry,
      planDiagnostics: sqlRequest.planDiagnostics || null,
    });
  }

  /**
   * Execute a stage-mode SqlRequest via the shared stage executor.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {Promise<Object>} Stage execution result.
   * @private
   */
  async executeStageRequest(sqlRequest) {
    if (typeof sqlRequest.handler !== LOCAL_STR_FUNCTION) {
      throw new Error(ADAPTER_ERROR_MSG.STAGE_HANDLER_REQUIRED);
    }

    const executionContext = this.createRequestExecutionContext(sqlRequest);
    const cancellationToken =
      sqlRequest.cancellationToken || executionContext.getCancellationToken();
    const stageOptions = sqlRequest.options || null;
    const stageResults = await executeStage({
      query: sqlRequest.statement,
      params: sqlRequest.parameters,
      handler: sqlRequest.handler,
      opts: stageOptions,
      queryExecutor: async (query, params) =>
        this.executeQuery(query, params, {
          sessionId: sqlRequest.sessionId,
        }),
      cancellationToken,
      executionContext,
    });

    return {
      success: true,
      executionMode: EXECUTION_MODE.STAGE,
      results: stageResults,
    };
  }

  /**
   * Execute a plan-mode SqlRequest via the shared plan executor.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {Promise<Object>} Plan execution result.
   * @private
   */
  async executePlanRequest(sqlRequest) {
    const plan = sqlRequest.plan || sqlRequest.hints?.plan || null;
    if (!plan || typeof plan !== LOCAL_STR_OBJECT) {
      throw new Error(ADAPTER_ERROR_MSG.PLAN_OBJECT_REQUIRED);
    }

    const executionContext = this.createRequestExecutionContext(sqlRequest);
    const cancellationToken =
      sqlRequest.cancellationToken || executionContext.getCancellationToken();
    const planOptions = sqlRequest.options || null;
    const planResult = await executePlan({
      plan,
      params: sqlRequest.parameters,
      handler: sqlRequest.handler,
      opts: planOptions,
      queryExecutor: async (query, params) =>
        this.executeQuery(query, params, {
          sessionId: sqlRequest.sessionId,
        }),
      cancellationToken,
      executionContext,
    });

    return {
      success: true,
      executionMode: EXECUTION_MODE.PLAN,
      result: planResult,
    };
  }

  /**
   * Track write activity for managed split diagnostics and request local
   * evaluation only for partitions this node actually owns.
   *
   * Leader-local partition services are the authoritative trigger source for
   * write-driven split evaluation. The SQL coordinator only keeps lightweight
   * diagnostics here and may opportunistically request evaluation when it also
   * owns one of the target partitions.
   *
   * @param {string} tableName - Target table name.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} writeResult - Distributed write execution result.
   * @private
   */
  requestManagedSplitEvaluationForWrite(tableName, writePlan, writeResult) {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.requestEvaluation !== LOCAL_STR_FUNCTION ||
      !tableName ||
      this.isSystemTable(tableName) ||
      writeResult?.success !== true
    ) {
      return;
    }

    const nowMs = Date.now();
    const lastEvaluationState =
      this.lastWriteSplitEvaluationByTable.get(tableName) || null;
    const lastRequestedAtMs =
      typeof lastEvaluationState === 'number' ?
        lastEvaluationState :
        Number(lastEvaluationState?.requestedAtMs || 0);
    if (
      nowMs - lastRequestedAtMs <
      WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS
    ) {
      return;
    }

    const partitionIds =
      writePlan?.partitionStatements instanceof Map ?
        Array.from(writePlan.partitionStatements.keys()) :
        [];
    const localLeaderPartitionIds =
      this.resolveLocalManagedSplitEvaluationPartitionIds(partitionIds);
    this.lastWriteSplitEvaluationByTable.set(tableName, {
      requestedAtMs: nowMs,
      partitionIds,
      localLeaderPartitionIds,
    });

    if (localLeaderPartitionIds.length === LOCAL_NUM_ZERO) {
      return;
    }

    manager.requestEvaluation({
      reasonCode: LOCAL_STR_WRITE_ACTIVITY,
      tableName,
      partitionIds: localLeaderPartitionIds,
    });
  }

  /**
   * Resolve the subset of requested partitions this node may evaluate for
   * managed split ownership.
   * @param {string[]} partitionIds
   * @return {string[]}
   * @private
   */
  resolveLocalManagedSplitEvaluationPartitionIds(partitionIds = []) {
    const requestedPartitionIdSet = new Set(
      partitionIds
        .map((partitionId) => String(partitionId || ''))
        .filter(Boolean),
    );
    if (requestedPartitionIdSet.size === LOCAL_NUM_ZERO) {
      return [];
    }

    const localPartitionIds = [];
    for (const partition of this.listManagedSplitPartitions()) {
      const partitionId =
        partition?.partition_id ?? partition?.partitionId ?? null;
      if (!partitionId || !requestedPartitionIdSet.has(partitionId)) {
        continue;
      }
      localPartitionIds.push(partitionId);
    }
    return localPartitionIds;
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
    const cancellationToken = options?.cancellationToken || null;
    cancellationToken?.throwIfCancelled?.();
    this.recoverDistributedTransactionStateFromCache();
    if (EXPLAIN_DISTRIBUTED_PREFIX_REGEX.test(sql)) {
      return this.executeExplainDistributed(sql, params, {
        sessionId,
        dialect: options.dialect,
      });
    }

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, {
      sql: sql.substring(LOCAL_NUM_ZERO, LOCAL_NUM_100),
      paramCount: params.length,
      sessionId,
    });

    const queryStartMs = Date.now();

    // Parse the SQL (check cache first)
    let ast;
    try {
      const dialect = options.dialect;
      ast = this.parseCache.get(sql, dialect);
      if (!ast) {
        const parser = new SQLParser(sql, {dialect});
        ast = parser.parse();
        this.parseCache.set(sql, dialect, ast);
        ast = this.parseCache.cloneAst(ast);
      }
      // If PG mode produced param mapping, reorder params
      if (ast._paramMapping && ast._paramMapping.length > LOCAL_NUM_ZERO) {
        params = reorderParams(params, ast._paramMapping);
      }
    } catch (parseError) {
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(LOCAL_NUM_ZERO, LOCAL_NUM_100),
        error: parseError.message,
      });
      return {
        success: false,
        error: parseError.message,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    const parseEndMs = Date.now();
    cancellationToken?.throwIfCancelled?.();

    try {
      const ingressPressureDecision = this.evaluateQueryIngressPressure(
        ast,
        options,
      );
      if (
        ingressPressureDecision &&
        (ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
          ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)
      ) {
        this.logger.warn(
          ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
            QUERY_LOG_MSG.QUERY_ADMISSION_DEFERRED :
            QUERY_LOG_MSG.QUERY_ADMISSION_REJECTED,
          {
            statementType: ast.type,
            pressureAction: ingressPressureDecision.action,
            pressureReason: ingressPressureDecision.reason,
            retryAfterMs: ingressPressureDecision.retryAfterMs,
            workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
          },
        );
        return buildPressureAdmissionFailure(ingressPressureDecision, {
          error:
            ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
              LOCAL_STR_1KD8O :
              LOCAL_STR_DDIFL,
          errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
        });
      }

      // Route based on statement type
      let result;
      switch (ast.type) {
      case QUERY_AST_TYPE.SELECT:
        result = await this.executeSelect(
          ast,
          params,
          sessionId,
          options,
          sql,
        );
        break;

      case QUERY_AST_TYPE.INSERT:
        result = await this.executeInsert(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.UPDATE:
        result = await this.executeUpdate(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.DELETE:
        result = await this.executeDelete(ast, params, sessionId, options);
        break;

      case QUERY_AST_TYPE.CREATE_TABLE:
        result = await this.executeCreateTable(ast, sessionId, options);
        break;

      case QUERY_AST_TYPE.ALTER_TABLE:
        result = await this.executeAlterTable(ast, sessionId);
        break;

      case QUERY_AST_TYPE.BEGIN_TRANSACTION:
        return this.handleBeginTransaction(sessionId);

      case QUERY_AST_TYPE.COMMIT:
        return this.handleCommit(sessionId);

      case QUERY_AST_TYPE.ROLLBACK:
        return this.handleRollback(sessionId);

      default:
        throw new Error(
          `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`,
        );
      }

      const queryEndMs = Date.now();
      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, {
          sessionId,
          statementType: ast.type,
          parseDurationMs: parseEndMs - queryStartMs,
          executionDurationMs: queryEndMs - parseEndMs,
          totalDurationMs: queryEndMs - queryStartMs,
          partitionCount: result?.partitions?.length ?? LOCAL_NUM_ZERO,
          rowCount: result?.count ?? result?.changes ?? LOCAL_NUM_ZERO,
          success: result?.success ?? false,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      // Strip partition details from results (Requirement 20.10)
      return this.tableCreationService.stripPartitionDetails(result);
    } catch (error) {
      const queryEndMs = Date.now();
      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, {
          sessionId,
          statementType: ast.type,
          parseDurationMs: parseEndMs - queryStartMs,
          executionDurationMs: queryEndMs - parseEndMs,
          totalDurationMs: queryEndMs - queryStartMs,
          partitionCount: LOCAL_NUM_ZERO,
          rowCount: LOCAL_NUM_ZERO,
          success: false,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      const failureResult = this.buildCaughtQueryExecutionFailure(error);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(LOCAL_NUM_ZERO, LOCAL_NUM_100),
        error: failureResult.error,
        errorCode: failureResult.errorCode || null,
        retryAfterMs: Number.isFinite(failureResult.retryAfterMs) ?
          failureResult.retryAfterMs :
          null,
        deferRetry: failureResult.deferRetry === true,
        stack: String(failureResult.error || LOCAL_STR_EMPTY).includes(
          LOCAL_STR_G1DFB,
        ) ?
          error?.stack || null :
          null,
      });
      return failureResult;
    }
  }

  evaluateQueryIngressPressure(ast, options = {}) {
    const astType = ast?.type || null;
    const writeStatement =
      astType === QUERY_AST_TYPE.INSERT ||
      astType === QUERY_AST_TYPE.UPDATE ||
      astType === QUERY_AST_TYPE.DELETE ||
      astType === QUERY_AST_TYPE.CREATE_TABLE ||
      astType === QUERY_AST_TYPE.ALTER_TABLE;
    return this.getPressureGovernor().evaluate({
      workClass:
        options?.workClass ||
        (writeStatement ?
          PRESSURE_WORK_CLASS.INTERACTIVE :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys: [
        writeStatement ? LOCAL_STR_QUERY_PLANE_WRITE : LOCAL_STR_QUERY_PLANE_READ,
        `query-plane:statement:${String(astType || LOCAL_STR_UNKNOWN).toLowerCase()}`,
      ],
      allowDegrade: false,
      allowDefer: options?.allowPressureDefer !== false,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  getPressureGovernor() {
    this.pressureGovernor =
      this.pressureGovernor ||
      PressureGovernor.getShared({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger,
      });
    this.pressureGovernor.configure({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      logger: this.logger,
    });
    return this.pressureGovernor;
  }

  /**
   * Execute EXPLAIN DISTRIBUTED and return canonical planner output.
   * @param {string} sql - EXPLAIN DISTRIBUTED statement.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Explain options.
   * @param {string} options.sessionId - Session ID.
   * @param {string} options.dialect - SQL dialect.
   * @return {Promise<Object>} Explain result.
   * @private
   */
  async executeExplainDistributed(sql, params = [], options = {}) {
    const statement = sql.replace(EXPLAIN_DISTRIBUTED_PREFIX_REGEX, '');
    if (!statement.trim()) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.EXPLAIN_DISTRIBUTED_REQUIRES_STATEMENT,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    let ast;
    let normalizedParams = params;
    try {
      const parser = new SQLParser(statement, {dialect: options.dialect});
      ast = parser.parse();
      if (ast._paramMapping && ast._paramMapping.length > LOCAL_NUM_ZERO) {
        normalizedParams = reorderParams(params, ast._paramMapping);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    const distributedPlan = this.distributedQueryPlanner.planStatement(
      ast,
      normalizedParams,
      {
        sessionId: options.sessionId || QUERY_SESSION.DEFAULT,
        explain: true,
      },
    );
    if (!distributedPlan) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    return {
      success: true,
      operation: QUERY_OPERATION.EXPLAIN_DISTRIBUTED,
      rows: [
        {
          plan_id: distributedPlan.planId,
          statement_type: distributedPlan.statementType,
          execution_policy: distributedPlan.executionPolicy,
          table_plans: Array.from(distributedPlan.tablePlans.values()),
          join_plan: distributedPlan.joinPlan,
          merge_plan: distributedPlan.mergePlan,
          diagnostics: distributedPlan.diagnostics,
        },
      ],
      distributedPlan,
      distributedDiagnostics: distributedPlan.diagnostics,
    };
  }

  /**
   * Execute a CREATE TABLE statement.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @param {string} _sessionId - Session ID (unused for DDL).
   * @return {Promise<Object>} Creation result.
   * @private
   */
  async executeCreateTable(ast, _sessionId, options = {}) {
    return this.tableCreationService.createTable(ast, {
      timeoutBudget: options?.timeoutBudget,
    });
  }

  /**
   * Execute an ALTER TABLE statement through the migration pipeline.
   * @param {Object} ast - Parsed ALTER TABLE AST.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Migration initiation result.
   * @private
   */
  async executeAlterTable(ast, sessionId) {
    if (
      !this.migrationPipeline ||
      typeof this.migrationPipeline.handleAlterTable !== LOCAL_STR_FUNCTION
    ) {
      throw new Error(QUERY_ERROR_MSG.MIGRATION_PIPELINE_UNAVAILABLE);
    }
    return this.migrationPipeline.handleAlterTable(ast, sessionId);
  }

  /**
   * Provision initial routable replica for a newly-created table partition.
   * @param {Object} context - Table partition context.
   * @param {string} context.tableId - Table ID.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} [context.minimumRoutableReplicaCount] - Minimum ready
   *   replica cohort required before provisioning can continue.
   * @param {string[]} [context.targetNodeIds] - Explicit provisioning target
   *   nodes for split child bootstrapping.
   * @param {Object} [context.admissionConvergence] - Optional previously
   *   probed admission result to reuse for explicit target cohorts.
   * @param {string} [context.routingReadinessDimension] - Optional routing
   *   readiness dimension used while waiting for bootstrap quorum visibility.
   * @return {Promise<void>}
   * @private
   */
}

export {SQLQueryEngineStatementExecution};
