import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {initializeSqlQueryEngineInstance} from
  './sql-query-engine-instance-initializer.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_COMPLETED = 'completed';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_EXAMPLES = 'examples';
const LOCAL_STR_1_0_0 = '1.0.0';

const {
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  CALLBACK_RUNTIME_KIND,
  CODE_LOOKUP_BY_FUNCTION_ID_SQL,
  CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
  CONTROL_PLANE_READINESS_DIMENSION,
  CallbackExecutionHost,
  EXECUTION_MODE,
  LoggingService,
  METRICS_LOG_TAG,
  MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL,
  MigrationCoordinator,
  MigrationPipeline,
  NATIVE_CALLBACK_EXPORTS_ARG,
  NATIVE_CALLBACK_MODULE_ARG,
  NATIVE_CALLBACK_RETURN_LINE,
  QUERY_LOG_MSG,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  ZERO_SHA256_DIGEST,
  createCallbackDriverRegistry,
  isSqlRequest,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineLifecycleAndCallbackDispatch {
  constructor(options = {}) {
    initializeSqlQueryEngineInstance(this, options);
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
    } catch (logErr) {
      console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
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
    if (this.migrationCoordinator) {
      this.migrationCoordinator.systemTableCache = cache;
    } else if (cache && this.migrationAutoWireEnabled) {
      this.migrationCoordinator = new MigrationCoordinator({
        sqlCore: this,
        systemTableCache: cache,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        now: this.nowFn,
      });
      if (!this.migrationPipeline) {
        this.migrationPipeline = new MigrationPipeline({
          migrationCoordinator: this.migrationCoordinator,
          logger: this.logger,
        });
      }
    }
    if (this.distributedTransactionRecoveryActivated) {
      void this.activateDistributedTransactionRecovery({
        resetRecoveryState: true,
      });
    }
  }

  /**
   * Activate distributed transaction recovery replay and periodic sweeps.
   * Joining nodes use this to defer replay until the READY cutover completes.
   *
   * @param {Object} [options]
   * @param {boolean} [options.resetRecoveryState=true] - When true, reload the
   *   recovered coordinator view from the latest system-cache snapshot.
   * @return {Promise<Object>} Replay summary.
   */
  activateDistributedTransactionRecovery(options = {}) {
    this.distributedTransactionRecoveryActivated = true;
    const resetRecoveryState = options.resetRecoveryState !== false;
    if (resetRecoveryState) {
      this.transactionStateRecovered = false;
    }
    this.recoverDistributedTransactionStateFromCache();
    const replayPromise = this.resumeRecoveredDistributedTransactions();
    if (typeof this.transactionCoordinator.startRecoverySweep === LOCAL_STR_FUNCTION) {
      this.transactionCoordinator.startRecoverySweep();
    }
    return replayPromise;
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
   * Set canonical readiness owner used for serve-routing decisions.
   * @param {Object|null} readinessService
   */
  setControlPlaneReadinessService(readinessService) {
    this.controlPlaneReadinessService = readinessService || null;
    this.queryExecutor.setControlPlaneReadinessService(
      this.controlPlaneReadinessService,
    );
  }

  /**
   * Set the default readiness dimension used for routed partition work.
   * @param {string} readinessDimension
   */
  setDefaultRoutingReadinessDimension(readinessDimension) {
    this.defaultRoutingReadinessDimension =
      readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.queryExecutor.setDefaultRoutingReadinessDimension(
      this.defaultRoutingReadinessDimension,
    );
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
    this.tableCreationService.setCDCIntegrationService(service);
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Set rebalance coordinator used for table partition provisioning.
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator || null;
    if (this.rebalanceCoordinator?.controlPlaneReadinessService) {
      this.setControlPlaneReadinessService(
        this.rebalanceCoordinator.controlPlaneReadinessService,
      );
    }
  }

  /**
   * Set initial table partition provisioner callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setTablePartitionProvisioner(provisioner) {
    this.tableCreationService.setPartitionProvisioner(provisioner);
  }

  /**
   * Set partition split/merge manager integration owner.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    this.partitionSplitMergeManager = manager || null;
    this.tableCreationService.setPartitionSplitMergeManager(manager);
  }

  /**
   * Set schema migration pipeline.
   * @param {Object|null} pipeline - Migration pipeline adapter.
   */
  setMigrationPipeline(pipeline) {
    this.migrationPipeline = pipeline || null;
  }

  /**
   * Set schema migration coordinator owner.
   * @param {Object|null} coordinator - Migration coordinator owner.
   */
  setMigrationCoordinator(coordinator) {
    this.migrationCoordinator = coordinator || null;
    if (
      !this.migrationPipeline &&
      this.migrationAutoWireEnabled &&
      this.migrationCoordinator
    ) {
      this.migrationPipeline = new MigrationPipeline({
        migrationCoordinator: this.migrationCoordinator,
        logger: this.logger,
      });
    }
  }

  /**
   * Shutdown lifecycle-owned query services.
   * @return {Promise<void>}
   */
  async shutdown() {
    // Abort in-flight query retry loops so they stop re-arming backoff timers
    // (otherwise a query retrying a torn-down cluster keeps the loop alive).
    if (
      this.queryExecutor &&
      typeof this.queryExecutor.markShuttingDown === LOCAL_STR_FUNCTION
    ) {
      this.queryExecutor.markShuttingDown();
    }
    if (
      this.transactionCoordinator &&
      typeof this.transactionCoordinator.stopRecoverySweep === LOCAL_STR_FUNCTION
    ) {
      this.transactionCoordinator.stopRecoverySweep();
    }
    if (
      this.tableCreationService &&
      typeof this.tableCreationService.shutdown === LOCAL_STR_FUNCTION
    ) {
      await this.tableCreationService.shutdown();
    }
  }

  /**
   * Set runtime driver registry.
   * @param {Object} registry - Runtime driver registry.
   */
  setRuntimeDriverRegistry(registry) {
    this.runtimeDriverRegistry = registry;
  }

  /**
   * Set unified runtime lifecycle owner.
   * @param {Object} lifecycle - Service runtime lifecycle.
   */
  setServiceRuntimeLifecycle(lifecycle) {
    this.serviceRuntimeLifecycle = lifecycle;
    this._wireQueryExecutorFactory(lifecycle);
  }

  /**
   * Wire a service-scoped query executor factory into the
   * lifecycle owner so service replicas can query tables
   * through the standard SQL execution path.
   *
   * The factory produces closures that call executeQuery
   * with a session scoped to the service identity.
   *
   * @param {Object} lifecycle - Service runtime lifecycle.
   * @private
   */
  _wireQueryExecutorFactory(lifecycle) {
    if (!lifecycle || typeof lifecycle.setQueryExecutorFactory !== LOCAL_STR_FUNCTION) {
      return;
    }
    lifecycle.setQueryExecutorFactory(
      (serviceId) => async (sql, params) =>
        this.executeQuery(sql, params, {
          sessionId: serviceId,
          issuingServiceId: serviceId,
        }),
    );
  }

  /**
   * Set debug session resolver for callback trace gating.
   * @param {Object} resolver
   */
  setDebugSessionResolver(resolver) {
    this.debugSessionResolver = resolver;
  }

  /**
   * Set trace collector for callback trace streaming.
   * @param {Object} collector
   */
  setTraceCollector(collector) {
    this.traceCollector = collector;
  }

  /**
   * Set wasm executor used by wasm_component callbacks.
   * @param {Object} wasmExecutor - WasmExecutor instance.
   */
  setWasmExecutor(wasmExecutor) {
    this.wasmExecutor = wasmExecutor || null;
  }

  /**
   * Execute a canonical SqlRequest with execution-mode dispatch.
   *
   * This is the single owning dispatch entrypoint for
   * execution-mode behavior. All adapters (internal, protocol,
   * WASM) should converge here.
   *
   * Requirements: 1.1, 13.1
   * @param {Readonly<Object>} sqlRequest - Frozen SqlRequest object.
   * @return {Promise<Object>} Execution result.
   */
  async executeRequest(sqlRequest) {
    if (!isSqlRequest(sqlRequest)) {
      throw new Error(ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST);
    }

    const {executionMode, statement, parameters, sessionId} = sqlRequest;

    this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_START, {
      executionMode,
      statement: statement.substring(0, LOCAL_NUM_ONE_HUNDRED),
      sessionId,
    });

    const dispatchStartMs = Date.now();
    try {
      let result;

      switch (executionMode) {
      case EXECUTION_MODE.SQL_STATEMENT:
        result = await this.executeQuery(statement, parameters, {
          sessionId,
          dialect: sqlRequest.dialect,
          timeoutMs: sqlRequest.timeoutMs,
          timeoutBudget: sqlRequest.timeoutBudget,
          cancellationToken: sqlRequest.cancellationToken || null,
        });
        break;

      case EXECUTION_MODE.PARTITION_CALLBACK:
        result = await this.executePartitionCallback(sqlRequest);
        break;

      case EXECUTION_MODE.STAGE:
        result = await this.executeStageRequest(sqlRequest);
        break;

      case EXECUTION_MODE.PLAN:
        result = await this.executePlanRequest(sqlRequest);
        break;

      default:
        throw new Error(
          `${ADAPTER_ERROR_MSG.UNSUPPORTED_EXECUTION_MODE}${executionMode}`,
        );
      }

      this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_COMPLETE, {
        executionMode,
        success: result.success,
      });

      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, {
          executionMode,
          totalDurationMs: Date.now() - dispatchStartMs,
          success: result?.success ?? false,
          sessionId,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      return result;
    } catch (error) {
      try {
        this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, {
          executionMode,
          totalDurationMs: Date.now() - dispatchStartMs,
          success: false,
          sessionId,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }
      this.logger.error(ADAPTER_LOG_MSG.EXECUTE_REQUEST_FAILED, {
        executionMode,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a partition_callback request through a dedicated path.
   *
   * This is the single dispatch target for partition_callback mode.
   * It validates callback-specific fields, resolves target partitions
   * from the select query, and will delegate to
   * Callback_Execution_Host for per-partition batch invocation
   * (wired in subsequent tasks).
   *
   * Requirements: 13.1, 14.1
   * @param {Readonly<Object>} sqlRequest - Frozen SqlRequest object.
   * @return {Promise<Object>} Execution result.
   */
  async executePartitionCallback(sqlRequest) {
    const {
      statement,
      callbackModuleRef,
      callbackExport,
      runtimeKind,
      sessionId,
    } = sqlRequest;

    if (!callbackModuleRef || !callbackExport) {
      throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_MISSING_FIELDS);
    }
    if (!runtimeKind) {
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED,
      );
    }

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_DISPATCH, {
      statement: statement.substring(0, LOCAL_NUM_ONE_HUNDRED),
      callbackModuleRef,
      callbackExport,
      sessionId,
    });

    // 1. Resolve target partitions and construct per-partition
    // batches via the single planner path.
    const dispatchResult =
      await this.partitionCallbackDispatcher.dispatch(sqlRequest);

    // 2. Route batches through the single
    // Callback_Execution_Host contract. No parallel
    // callback executor path is allowed.
    const descriptor = {
      callbackModuleRef: dispatchResult.callbackModuleRef,
      callbackExport: dispatchResult.callbackExport,
      runtimeKind,
    };
    const executionContext = this.createRequestExecutionContext(sqlRequest);
    const handler = await this.resolvePartitionCallbackHandler(
      sqlRequest,
      executionContext,
    );
    const wasmExecutor = sqlRequest.wasmExecutor || this.wasmExecutor || null;

    if (runtimeKind === CALLBACK_RUNTIME_KIND.WASM_COMPONENT) {
      if (!wasmExecutor) {
        throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_EXECUTOR_REQUIRED);
      }
      await this.ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor);
    }

    // 3. Create callback runtime selector as a strict
    // adapter over unified runtime selection ownership.
    const unifiedRuntimeRegistry =
      sqlRequest.runtimeDriverRegistry || this.runtimeDriverRegistry || null;
    if (!sqlRequest.callbackRuntimeDriverRegistry && !unifiedRuntimeRegistry) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED);
    }
    const callbackRuntimeRegistry =
      sqlRequest.callbackRuntimeDriverRegistry ||
      createCallbackDriverRegistry({
        runtimeDriverRegistry: unifiedRuntimeRegistry,
        wasmExecutor,
        ociFeatureGateEnabled: Boolean(sqlRequest.ociFeatureGateEnabled),
      });
    if (
      typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry !== LOCAL_STR_FUNCTION ||
      !callbackRuntimeRegistry.hasRuntimeDriverRegistry()
    ) {
      throw new Error(ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED);
    }

    const host = new CallbackExecutionHost({
      budgetEnforcer: sqlRequest.budgetEnforcer || null,
      lineageTracker: sqlRequest.lineageTracker || null,
      dedupeRegistry: sqlRequest.dedupeRegistry || null,
      cancellationToken: sqlRequest.cancellationToken || null,
      stageIndex: sqlRequest.stageIndex || 0,
      runtimeDriverRegistry: callbackRuntimeRegistry,
      executionContext,
      planDiagnostics: executionContext.getPlanDiagnostics(),
      debugSessionResolver:
        sqlRequest.debugSessionResolver || this.debugSessionResolver || null,
      traceCollector: sqlRequest.traceCollector || this.traceCollector || null,
      nodeId: sqlRequest.nodeId || this.nodeId || null,
      serviceDefinitionId:
        sqlRequest.serviceDefinitionId || callbackModuleRef || null,
      replicaId: sqlRequest.replicaId || null,
    });

    const hostResult = await host.execute(dispatchResult.batches, descriptor, {
      handler,
      serviceDefinitionId:
        sqlRequest.serviceDefinitionId || callbackModuleRef || null,
      nodeId: sqlRequest.nodeId || this.nodeId || null,
      replicaId: sqlRequest.replicaId || null,
    });

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_COMPLETE, {
      success: hostResult.state === LOCAL_STR_COMPLETED,
      batchCount: dispatchResult.batches.length,
      processedPartitions: hostResult.processedPartitions,
      callbackModuleRef,
      callbackExport,
    });

    return {
      success:
        hostResult.state === LOCAL_STR_COMPLETED || hostResult.state === LOCAL_STR_FAILED,
      batches: dispatchResult.batches,
      callbackModuleRef,
      callbackExport,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      hostResult,
    };
  }

  /**
   * Resolve callback handler for partition_callback execution.
   *
   * For native_js runtime, handler can be passed directly on the
   * request or resolved from the `code` table by callbackModuleRef.
   *
   * @param {Readonly<Object>} sqlRequest
   * @param {ExecutionContext} executionContext
   * @return {Promise<Function|null>}
   * @private
   */
  async resolvePartitionCallbackHandler(sqlRequest, executionContext) {
    if (typeof sqlRequest.handler === LOCAL_STR_FUNCTION) {
      return sqlRequest.handler;
    }
    if (sqlRequest.runtimeKind !== CALLBACK_RUNTIME_KIND.NATIVE_JS) {
      return null;
    }
    try {
      return await this.loadNativeCallbackHandler(
        sqlRequest.callbackModuleRef,
        sqlRequest.callbackExport,
        sqlRequest.sessionId || QUERY_SESSION.DEFAULT,
        executionContext,
      );
    } catch (_parseErr) {
      return null;
    }
  }

  /**
   * Load and compile a native_js callback handler from code table.
   * @param {string} callbackModuleRef
   * @param {string} callbackExport
   * @param {string} sessionId
   * @param {ExecutionContext} executionContext
   * @return {Promise<Function>}
   * @private
   */
  async loadNativeCallbackHandler(
    callbackModuleRef,
    callbackExport,
    sessionId,
    executionContext,
  ) {
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

    const source = codeRow.code_blob;
    if (typeof source !== LOCAL_STR_STRING || !source.trim()) {
      throw new Error(ADAPTER_ERROR_MSG.NATIVE_CALLBACK_SOURCE_INVALID);
    }
    const compiledExports = this.compileCallbackModuleSource(
      source,
      ADAPTER_ERROR_MSG.NATIVE_CALLBACK_COMPILE_FAILED,
    );
    const rawHandler = compiledExports ? compiledExports[callbackExport] : null;
    if (typeof rawHandler !== LOCAL_STR_FUNCTION) {
      throw new Error(
        `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_EXPORT_NOT_FOUND}: ` +
          callbackExport,
      );
    }

    return (batch, descriptor, callbackCtx) =>
      rawHandler(callbackCtx || executionContext, batch, descriptor);
  }

  /**
   * Resolve callback source row from the code table.
   *
   * @param {string} callbackModuleRef
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   * @private
   */
  async lookupCallbackCodeRow(callbackModuleRef, sessionId) {
    const byFunctionId = await this.executeQuery(
      CODE_LOOKUP_BY_FUNCTION_ID_SQL,
      [callbackModuleRef],
      {sessionId},
    );
    if (byFunctionId.rows?.[0]) {
      return byFunctionId.rows[0];
    }

    const byFunctionName = await this.executeQuery(
      CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
      [callbackModuleRef],
      {sessionId},
    );
    return byFunctionName.rows?.[0] || null;
  }

  /**
   * Compile CommonJS callback source and return module exports object.
   *
   * @param {string} source
   * @param {string} compileErrorPrefix
   * @return {Object}
   * @private
   */
  compileCallbackModuleSource(source, compileErrorPrefix) {
    const module = {exports: {}};
    let evaluated = null;
    try {
      const moduleFactory = new Function(
        NATIVE_CALLBACK_EXPORTS_ARG,
        NATIVE_CALLBACK_MODULE_ARG,
        `${source}\n${NATIVE_CALLBACK_RETURN_LINE}`,
      );
      evaluated = moduleFactory(module.exports, module);
    } catch (error) {
      const compileError = new Error(`${compileErrorPrefix}: ${error.message}`);
      compileError.cause = error;
      throw compileError;
    }

    return evaluated && typeof evaluated === LOCAL_STR_OBJECT ?
      evaluated :
      module.exports;
  }

  /**
   * Resolve latest module manifest row by artifact pointer.
   *
   * @param {string} callbackModuleRef
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveLatestModuleManifestRow(callbackModuleRef, sessionId) {
    const manifestLookup = await this.executeQuery(
      MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL,
      [callbackModuleRef],
      {sessionId},
    );
    return manifestLookup.rows?.[0] || null;
  }

  /**
   * Parse a JSON-encoded array field with safe fallback.
   *
   * @param {*} rawValue
   * @param {string[]} fallback
   * @return {string[]}
   * @private
   */
  parseJsonArrayField(rawValue, fallback) {
    if (Array.isArray(rawValue)) {
      return rawValue.filter((entry) => typeof entry === LOCAL_STR_STRING);
    }
    if (typeof rawValue !== LOCAL_STR_STRING || !rawValue.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ?
        parsed.filter((entry) => typeof entry === LOCAL_STR_STRING) :
        fallback;
    } catch (_parseErr) {
      return fallback;
    }
  }

  /**
   * Build a validated manifest object for module mirror insertion.
   *
   * @param {Object|null} manifestRow
   * @param {string} runExport
   * @param {string} callbackModuleRef
   * @return {Object}
   * @private
   */
  buildWasmCallbackManifest(manifestRow, runExport, callbackModuleRef) {
    const declaredExports = this.parseJsonArrayField(manifestRow?.exports, [
      runExport,
    ]);
    const exportsWithRun = declaredExports.includes(runExport) ?
      declaredExports :
      [...declaredExports, runExport];

    return {
      namespace: manifestRow?.namespace || LOCAL_STR_EXAMPLES,
      name: manifestRow?.name || callbackModuleRef,
      version: String(manifestRow?.version || LOCAL_STR_1_0_0),
      digest: manifestRow?.digest || ZERO_SHA256_DIGEST,
      runExport,
      exports: exportsWithRun,
      dependencies: this.parseJsonArrayField(manifestRow?.dependencies, []),
      capabilities: this.parseJsonArrayField(manifestRow?.capabilities, []),
      sourceReference: manifestRow?.source_reference || null,
      artifactPointer: manifestRow?.artifact_pointer || callbackModuleRef,
    };
  }

  /**
   * Ensure a wasm_component callback module is loaded into module mirror.
   *
   * @param {Readonly<Object>} sqlRequest
   * @param {Object} wasmExecutor
   * @return {Promise<void>}
   * @private
   */
}

export {SQLQueryEngineLifecycleAndCallbackDispatch};
