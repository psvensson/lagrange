import { SQL_QUERY_ENGINE_SHARED } from "./sql-query-engine-shared.js";

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

class SQLQueryEngineSegment1 {
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache,
        getMessageRouter: () => this.messageRouter,
        getControlPlaneReadinessService: () =>
          this.controlPlaneReadinessService,
      }).controlPlaneSystemTableGateway;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.rebalanceCoordinator?.controlPlaneReadinessService ||
      null;
    this.defaultRoutingReadinessDimension =
      options.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.routingMetadataOverlay = options.routingMetadataOverlay || null;
    this.authoritativeRoutingOverlayEntries = new Map();
    this.bootstrapRoutingOverlayEntries = new Map();
    this.authoritativeRoutingOverlay = {
      getPartitionById: (partitionId) =>
        this.getAuthoritativeRoutingOverlayPartition(partitionId),
      getServicesForPartition: (partitionId) =>
        this.getAuthoritativeRoutingOverlayServices(partitionId),
      refreshPartitionRouting: async (partitionId, overlayOptions = {}) =>
        this.refreshAuthoritativeRoutingOverlay(partitionId, overlayOptions),
    };
    this.lastWriteSplitEvaluationByTable = new Map();
    this.bootstrapRoutingOverlay = {
      getPartitionById: (partitionId) =>
        this.getBootstrapRoutingOverlayPartition(partitionId),
      getServicesForPartition: (partitionId) =>
        this.getBootstrapRoutingOverlayServices(partitionId),
    };
    this.nowFn = options.nowFn || (() => Date.now());
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlaneTimeoutPolicy =
      options.controlPlaneTimeoutPolicy ||
      new TimeoutPolicy({
        operationName: "sql_control_plane",
        now: this.nowFn,
      });
    this.tablePartitionProvisioningTimeoutMs =
      Number.isFinite(options.tablePartitionProvisioningTimeoutMs) &&
      options.tablePartitionProvisioningTimeoutMs > 0
        ? Math.floor(options.tablePartitionProvisioningTimeoutMs)
        : QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS;
    this.tablePartitionProvisioningPollIntervalMs =
      Number.isFinite(options.tablePartitionProvisioningPollIntervalMs) &&
      options.tablePartitionProvisioningPollIntervalMs > 0
        ? Math.floor(options.tablePartitionProvisioningPollIntervalMs)
        : QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS;
    this.tablePartitionTargetNodeConvergenceTimeoutMs =
      Number.isFinite(options.tablePartitionTargetNodeConvergenceTimeoutMs) &&
      options.tablePartitionTargetNodeConvergenceTimeoutMs > 0
        ? Math.floor(options.tablePartitionTargetNodeConvergenceTimeoutMs)
        : QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS;

    this.partitionResolver = new PartitionResolver({
      systemCache: this.systemCache,
    });
    this.distributedQueryPlanner =
      options.distributedQueryPlanner ||
      new DistributedQueryPlanner({
        partitionResolver: this.partitionResolver,
        getTablePartitions: (tableName) => this.getTablePartitions(tableName),
        getTableInfo: (tableName) => this.getTableInfo(tableName),
      });

    this.queryExecutor = new QueryExecutor({
      messageRouter: this.messageRouter,
      systemCache: this.systemCache,
      bootstrapTopologySnapshotOwner:
        options.bootstrapTopologySnapshotOwner || null,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      defaultRoutingReadinessDimension: this.defaultRoutingReadinessDimension,
      nodeId: this.nodeId,
      unrefRetryDelayTimers: options.unrefRetryDelayTimers === true,
    });
    this.queryExecutor.setRoutingMetadataOverlay(
      this.composeRoutingMetadataOverlay(
        this.routingMetadataOverlay,
        this.composeRoutingMetadataOverlay(
          this.authoritativeRoutingOverlay,
          this.bootstrapRoutingOverlay,
        ),
      ),
    );
    this.distributedWriteCoordinator =
      options.distributedWriteCoordinator ||
      new DistributedWriteCoordinator({
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: (tableName) => this.getTablePartitions(tableName),
        getTableInfo: (tableName) => this.getTableInfo(tableName),
      });
    this.transactionCoordinator =
      options.transactionCoordinator ||
      new DistributedTransactionCoordinator({
        beginParticipant: async (sessionId, partitionId, transactionEpoch) =>
          this.deliverTransactionOperation(
            sessionId,
            partitionId,
            QUERY_OPERATION.BEGIN,
            { transactionEpoch },
          ),
        prepareParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(
            sessionId,
            partitionId,
            QUERY_OPERATION.PREPARE,
          ),
        commitParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(
            sessionId,
            partitionId,
            QUERY_OPERATION.COMMIT,
          ),
        rollbackParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(
            sessionId,
            partitionId,
            QUERY_OPERATION.ROLLBACK,
          ),
        persistTransaction: async (record) =>
          this.persistDistributedTransactionRow(record),
        persistParticipant: async (record) =>
          this.persistDistributedTransactionParticipantRow(record),
        persistWriteOperation: async (record) =>
          this.persistDistributedWriteOperationRow({
            ...record,
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
          }),
        epochSource: options.transactionEpochSource,
        loadRecoveryStateForSweep: async () =>
          this.loadDistributedTransactionRecoveryState(),
      });
    this.managedSplitWorkflow = options.managedSplitWorkflow || null;

    const tablePartitionProvisioner =
      typeof options.tablePartitionProvisioner === "function"
        ? options.tablePartitionProvisioner
        : this.rebalanceCoordinator
          ? (context) => this.provisionInitialTablePartition(context)
          : null;
    this.partitionSplitMergeManager =
      options.partitionSplitMergeManager || null;
    this.tableCreationService = new TableCreationService({
      systemCache: this.systemCache,
      cdcIntegrationService: this.cdcIntegrationService,
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      partitionSplitMergeManager: this.partitionSplitMergeManager,
      calculateQuorumReplicaCount: (replicaCount) =>
        this.calculateQuorumReplicaCount(replicaCount),
      partitionProvisioner: tablePartitionProvisioner,
    });

    this.partitionCallbackDispatcher = new PartitionCallbackDispatcher({
      sqlParser: { parse: (sql) => this.parse(sql) },
      partitionResolver: this.partitionResolver,
      queryExecutor: this.queryExecutor,
      getTablePartitions: (name) => this.getTablePartitions(name),
      isSystemTable: (name) => this.isSystemTable(name),
    });

    this.parseCache = new SqlParseCache(SQL_PARSE_CACHE.DEFAULT_MAX_SIZE);

    this.logger = this.initLogger();
    this.migrationAutoWireEnabled = options.migrationAutoWire !== false;
    this.migrationCoordinator = options.migrationCoordinator || null;
    if (
      this.migrationAutoWireEnabled &&
      !this.migrationCoordinator &&
      this.systemCache
    ) {
      this.migrationCoordinator = new MigrationCoordinator({
        sqlCore: this,
        systemTableCache: this.systemCache,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        now: this.nowFn,
      });
    }
    this.migrationPipeline = options.migrationPipeline || null;
    if (
      this.migrationAutoWireEnabled &&
      !this.migrationPipeline &&
      this.migrationCoordinator
    ) {
      this.migrationPipeline = new MigrationPipeline({
        migrationCoordinator: this.migrationCoordinator,
        logger: this.logger,
      });
    }
    this.managedSplitWorkflow =
      this.managedSplitWorkflow ||
      new ManagedSplitWorkflow({
        nodeId: this.nodeId,
        topologyAdapter: new ManagedSplitTopologyAdapter({
          sqlQueryEngine: this,
        }),
      });

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs =
      config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;

    // Unified runtime ownership components (startup-wired).
    this.runtimeDriverRegistry = options.runtimeDriverRegistry || null;
    this.serviceRuntimeLifecycle = options.serviceRuntimeLifecycle || null;
    this.debugSessionResolver = options.debugSessionResolver || null;
    this.traceCollector = options.traceCollector || null;
    this.wasmExecutor = options.wasmExecutor || null;

    // Wire query executor factory into lifecycle owner so service
    // replicas can query tables through the standard SQL path.
    this._wireQueryExecutorFactory(this.serviceRuntimeLifecycle);

    // Backward-compatible alias for callers/tests expecting transaction state map.
    this.activeTransactions = this.transactionCoordinator.transactionsBySession;
    this.transactionStateRecovered = false;
    this.transactionRecoveryReplayPromise = null;
    this.lastTransactionRecoveryReplayResult =
      createEmptyTransactionRecoveryReplaySummary();
    this.distributedTransactionRecoveryActivated =
      options.autoStartDistributedTransactionRecovery !== false;
    if (this.distributedTransactionRecoveryActivated) {
      void this.activateDistributedTransactionRecovery();
    }
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
    if (typeof this.transactionCoordinator.startRecoverySweep === "function") {
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
    if (
      this.transactionCoordinator &&
      typeof this.transactionCoordinator.stopRecoverySweep === "function"
    ) {
      this.transactionCoordinator.stopRecoverySweep();
    }
    if (
      this.tableCreationService &&
      typeof this.tableCreationService.shutdown === "function"
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
    if (!lifecycle || typeof lifecycle.setQueryExecutorFactory !== "function") {
      return;
    }
    lifecycle.setQueryExecutorFactory(
      (serviceId) => async (sql, params) =>
        this.executeQuery(sql, params, { sessionId: serviceId }),
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

    const { executionMode, statement, parameters, sessionId } = sqlRequest;

    this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_START, {
      executionMode,
      statement: statement.substring(0, 100),
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
      statement: statement.substring(0, 100),
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
      typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry !== "function" ||
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
      success: hostResult.state === "completed",
      batchCount: dispatchResult.batches.length,
      processedPartitions: hostResult.processedPartitions,
      callbackModuleRef,
      callbackExport,
    });

    return {
      success:
        hostResult.state === "completed" || hostResult.state === "failed",
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
    if (typeof sqlRequest.handler === "function") {
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
    if (typeof source !== "string" || !source.trim()) {
      throw new Error(ADAPTER_ERROR_MSG.NATIVE_CALLBACK_SOURCE_INVALID);
    }
    const compiledExports = this.compileCallbackModuleSource(
      source,
      ADAPTER_ERROR_MSG.NATIVE_CALLBACK_COMPILE_FAILED,
    );
    const rawHandler = compiledExports ? compiledExports[callbackExport] : null;
    if (typeof rawHandler !== "function") {
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
      { sessionId },
    );
    if (byFunctionId.rows?.[0]) {
      return byFunctionId.rows[0];
    }

    const byFunctionName = await this.executeQuery(
      CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
      [callbackModuleRef],
      { sessionId },
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
    const module = { exports: {} };
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

    return evaluated && typeof evaluated === "object"
      ? evaluated
      : module.exports;
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
      { sessionId },
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
      return rawValue.filter((entry) => typeof entry === "string");
    }
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed)
        ? parsed.filter((entry) => typeof entry === "string")
        : fallback;
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
    const exportsWithRun = declaredExports.includes(runExport)
      ? declaredExports
      : [...declaredExports, runExport];

    return {
      namespace: manifestRow?.namespace || "examples",
      name: manifestRow?.name || callbackModuleRef,
      version: String(manifestRow?.version || "1.0.0"),
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

export { SQLQueryEngineSegment1 };
