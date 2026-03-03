/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Coordinates parsing, partition resolution, and execution.
 *
 * System Cache-Based Routing:
 * - All queries route through system cache (single source of truth)
 * - System cache provides partition metadata and leader addresses
 * - No bootstrap directories or fallback mechanisms
 * - All communication through message router using service addresses
 *
 * Query Routing Flow:
 * 1. Parse SQL to determine target table
 * 2. Get partitions from system cache
 * 3. Resolve which partitions to query based on WHERE clause
 * 4. Find partition leader addresses from system cache
 * 5. Route queries through message router to leaders
 * 6. Aggregate and return results
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3, 15.4, 20.1, 20.2, 20.3,
 *               20.6, 20.7, 20.10, 21.1, 21.2, 21.3
 */

import {createHash} from 'node:crypto';
import {SQLParser} from './sql-parser.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {PartitionResolver} from './partition-resolver.js';
import {QueryExecutor} from './query-executor.js';
import {TableCreationService} from './table-creation-service.js';
import {DistributedQueryPlanner} from './distributed/distributed-query-planner.js';
import {DistributedWriteCoordinator} from './distributed/distributed-write-coordinator.js';
import {
  DistributedTransactionCoordinator,
  WRITE_OPERATION_STATUS,
} from './distributed/distributed-transaction-coordinator.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  TABLES,
  METRICS_LOG_TAG,
  SERVICE_TYPE,
  STATE,
} from '../constants/index.js';
import {
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  SQL_PARSE_CACHE,
  WRITE_TRACKING_EXCLUDED_TABLES,
} from './query-constants.js';
import {isSqlRequest} from './sql-request.js';
import {PartitionCallbackDispatcher} from
  './callback/partition-callback-dispatcher.js';
import {CallbackExecutionHost} from
  './callback/callback-execution-host.js';
import {createCallbackDriverRegistry} from
  './callback/callback-runtime-driver-registry.js';
import {executeStage} from './call-stage.js';
import {executePlan} from './call-plan.js';
import {ExecutionContext} from './execution-context.js';
import {BudgetEnforcer} from './budget-enforcer.js';
import {CancellationToken} from './cancellation-token.js';
import {LineageTracker} from './lineage-tracker.js';
import {DEFAULT_SNAPSHOT_MODE} from './runtime-constants.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  CALLBACK_RUNTIME_KIND,
} from './sql-adapter-constants.js';
import {parseCallbackModuleArtifact} from './callback/callback-module-artifact.js';
import {reorderParams} from './pg/pg-translate.js';
import {SqlParseCache} from './sql-parse-cache.js';

const CODE_LOOKUP_BY_FUNCTION_ID_SQL =
  `SELECT * FROM ${TABLES.CODE} WHERE function_id = ?`;
const CODE_LOOKUP_BY_FUNCTION_NAME_SQL =
  `SELECT * FROM ${TABLES.CODE} WHERE function_name = ?`;
const MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL =
  `SELECT * FROM ${TABLES.MODULE_MANIFESTS} ` +
  'WHERE artifact_pointer = ? ORDER BY created_at DESC LIMIT 1';
const NATIVE_CALLBACK_EXPORTS_ARG = 'exports';
const NATIVE_CALLBACK_MODULE_ARG = 'module';
const NATIVE_CALLBACK_RETURN_LINE = 'return module.exports;';
const DEFAULT_CODE_VERSION = '1';
const ZERO_SHA256_DIGEST = 'sha256:' + '0'.repeat(64);
const EXPLAIN_DISTRIBUTED_PREFIX_REGEX = /^\s*EXPLAIN\s+DISTRIBUTED\s+/i;
const STATUS_ACTIVE = 'active';
const CONNECTION_STATE_CONNECTED = String(STATE.CONNECTED).toLowerCase();
const CONNECTION_STATE_READY = String(STATE.READY).toLowerCase();
const MIN_ROUTABLE_REPLICA_COUNT = 1;
const BEST_EFFORT_PROVISION_DISPATCH_TIMEOUT_MS = 250;
const BEST_EFFORT_PROVISION_TIMEOUT_REASON = 'best_effort_dispatch_timeout';

/**
 * SQLQueryEngine is the main entry point for SQL query processing.
 * It coordinates parsing, partition resolution, and parallel execution.
 *
 * System Cache-Based Routing:
 * - Routes ALL queries through message router (no local vs remote distinction)
 * - System cache is the single source of truth for partition locations
 * - No bootstrap directories or fallback mechanisms
 * - All partition leader addresses come from system cache
 */
class SQLQueryEngine {
  /**
   * Create a new SQL query engine.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for lookups.
   * @param {Object} options.messageRouter - Message router for query routing.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - Node ID.
   * @param {Object} options.rebalanceCoordinator - Rebalance coordinator.
   * @param {Function} options.tablePartitionProvisioner - Initial partition
   *   provisioning callback for CREATE TABLE.
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.tablePartitionProvisioningTimeoutMs =
      Number.isFinite(options.tablePartitionProvisioningTimeoutMs) &&
      options.tablePartitionProvisioningTimeoutMs > 0 ?
        Math.floor(options.tablePartitionProvisioningTimeoutMs) :
        QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS;
    this.tablePartitionProvisioningPollIntervalMs =
      Number.isFinite(options.tablePartitionProvisioningPollIntervalMs) &&
      options.tablePartitionProvisioningPollIntervalMs > 0 ?
        Math.floor(options.tablePartitionProvisioningPollIntervalMs) :
        QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS;

    this.partitionResolver = new PartitionResolver({
      systemCache: this.systemCache,
    });
    this.distributedQueryPlanner = options.distributedQueryPlanner ||
      new DistributedQueryPlanner({
        partitionResolver: this.partitionResolver,
        getTablePartitions: (tableName) => this.getTablePartitions(tableName),
        getTableInfo: (tableName) => this.getTableInfo(tableName),
      });

    this.queryExecutor = new QueryExecutor({
      messageRouter: this.messageRouter,
      systemCache: this.systemCache,
      nodeId: this.nodeId,
    });
    this.distributedWriteCoordinator = options.distributedWriteCoordinator ||
      new DistributedWriteCoordinator({
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: (tableName) => this.getTablePartitions(tableName),
        getTableInfo: (tableName) => this.getTableInfo(tableName),
      });
    this.transactionCoordinator = options.transactionCoordinator ||
      new DistributedTransactionCoordinator({
        beginParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.BEGIN),
        prepareParticipant: async () => {},
        commitParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.COMMIT),
        rollbackParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.ROLLBACK),
        persistTransaction: async (record) =>
          this.persistDistributedTransactionRow(record),
        persistParticipant: async (record) =>
          this.persistDistributedTransactionParticipantRow(record),
        persistWriteOperation: async (record) =>
          this.persistDistributedWriteOperationRow(record),
      });

    const tablePartitionProvisioner = typeof options.tablePartitionProvisioner ===
      'function' ?
      options.tablePartitionProvisioner :
      (this.rebalanceCoordinator ?
        (context) => this.provisionInitialTablePartition(context) :
        null);
    this.tableCreationService = new TableCreationService({
      systemCache: this.systemCache,
      cdcIntegrationService: this.cdcIntegrationService,
      partitionSplitMergeManager: options.partitionSplitMergeManager || null,
      partitionProvisioner: tablePartitionProvisioner,
    });

    this.partitionCallbackDispatcher = new PartitionCallbackDispatcher({
      sqlParser: {parse: (sql) => this.parse(sql)},
      partitionResolver: this.partitionResolver,
      queryExecutor: this.queryExecutor,
      getTablePartitions: (name) => this.getTablePartitions(name),
      isSystemTable: (name) => this.isSystemTable(name),
    });

    this.parseCache = new SqlParseCache(
      SQL_PARSE_CACHE.DEFAULT_MAX_SIZE,
    );

    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;

    // Unified runtime ownership components (startup-wired).
    this.runtimeDriverRegistry = options.runtimeDriverRegistry || null;
    this.serviceRuntimeLifecycle = options.serviceRuntimeLifecycle || null;
    this.debugSessionResolver = options.debugSessionResolver || null;
    this.traceCollector = options.traceCollector || null;
    this.wasmExecutor = options.wasmExecutor || null;

    // Backward-compatible alias for callers/tests expecting transaction state map.
    this.activeTransactions = this.transactionCoordinator.transactionsBySession;
    this.transactionStateRecovered = false;
    this.recoverDistributedTransactionStateFromCache();
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
    this.transactionStateRecovered = false;
    this.recoverDistributedTransactionStateFromCache();
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
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
    this.tableCreationService.setCDCIntegrationService(service);
  }

  /**
   * Set rebalance coordinator used for table partition provisioning.
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator || null;
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
    this.tableCreationService.setPartitionSplitMergeManager(manager);
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
      throw new Error(
        ADAPTER_ERROR_MSG.PARTITION_CALLBACK_MISSING_FIELDS,
      );
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
        throw new Error(
          ADAPTER_ERROR_MSG.WASM_CALLBACK_EXECUTOR_REQUIRED,
        );
      }
      await this.ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor);
    }

    // 3. Create callback runtime selector as a strict
    // adapter over unified runtime selection ownership.
    const unifiedRuntimeRegistry =
          sqlRequest.runtimeDriverRegistry ||
          this.runtimeDriverRegistry ||
          null;
    if (!sqlRequest.callbackRuntimeDriverRegistry &&
            !unifiedRuntimeRegistry) {
      throw new Error(
        ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED,
      );
    }
    const callbackRuntimeRegistry =
          sqlRequest.callbackRuntimeDriverRegistry ||
          createCallbackDriverRegistry({
            runtimeDriverRegistry: unifiedRuntimeRegistry,
            wasmExecutor,
            ociFeatureGateEnabled: Boolean(
              sqlRequest.ociFeatureGateEnabled,
            ),
          });
    if (typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry !== 'function' ||
            !callbackRuntimeRegistry.hasRuntimeDriverRegistry()) {
      throw new Error(
        ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED,
      );
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
      traceCollector:
        sqlRequest.traceCollector || this.traceCollector || null,
      nodeId: sqlRequest.nodeId || this.nodeId || null,
      serviceDefinitionId:
        sqlRequest.serviceDefinitionId || callbackModuleRef || null,
      replicaId: sqlRequest.replicaId || null,
    });

    const hostResult = await host.execute(
      dispatchResult.batches, descriptor,
      {
        handler,
        serviceDefinitionId:
          sqlRequest.serviceDefinitionId || callbackModuleRef || null,
        nodeId: sqlRequest.nodeId || this.nodeId || null,
        replicaId: sqlRequest.replicaId || null,
      },
    );

    this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_COMPLETE, {
      success: hostResult.state === 'completed',
      batchCount: dispatchResult.batches.length,
      processedPartitions: hostResult.processedPartitions,
      callbackModuleRef,
      callbackExport,
    });

    return {
      success: hostResult.state === 'completed' ||
            hostResult.state === 'failed',
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
    if (typeof sqlRequest.handler === 'function') {
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
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error(ADAPTER_ERROR_MSG.NATIVE_CALLBACK_SOURCE_INVALID);
    }
    const compiledExports = this.compileCallbackModuleSource(
      source,
      ADAPTER_ERROR_MSG.NATIVE_CALLBACK_COMPILE_FAILED,
    );
    const rawHandler = compiledExports ?
      compiledExports[callbackExport] :
      null;
    if (typeof rawHandler !== 'function') {
      throw new Error(
        `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_EXPORT_NOT_FOUND}: ` +
        callbackExport,
      );
    }

    return (batch, descriptor, callbackCtx) => rawHandler(
      callbackCtx || executionContext,
      batch,
      descriptor,
    );
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
      const compileError = new Error(
        `${compileErrorPrefix}: ${error.message}`,
      );
      compileError.cause = error;
      throw compileError;
    }

    return evaluated &&
      typeof evaluated === 'object' ?
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
      return rawValue.filter((entry) => typeof entry === 'string');
    }
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ?
        parsed.filter((entry) => typeof entry === 'string') :
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
    const declaredExports = this.parseJsonArrayField(
      manifestRow?.exports,
      [runExport],
    );
    const exportsWithRun = declaredExports.includes(runExport) ?
      declaredExports :
      [...declaredExports, runExport];

    return {
      namespace: manifestRow?.namespace || 'examples',
      name: manifestRow?.name || callbackModuleRef,
      version: String(manifestRow?.version || '1.0.0'),
      digest: manifestRow?.digest || ZERO_SHA256_DIGEST,
      runExport,
      exports: exportsWithRun,
      dependencies: this.parseJsonArrayField(
        manifestRow?.dependencies,
        [],
      ),
      capabilities: this.parseJsonArrayField(
        manifestRow?.capabilities,
        [],
      ),
      sourceReference: manifestRow?.source_reference || null,
      artifactPointer:
        manifestRow?.artifact_pointer || callbackModuleRef,
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
  async ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor) {
    const callbackModuleRef = sqlRequest.callbackModuleRef;
    const moduleMirror = wasmExecutor.moduleMirror || null;
    if (!moduleMirror || typeof moduleMirror.getModule !== 'function') {
      throw new Error(
        ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED,
      );
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
    if (typeof codeBlob !== 'string' || !codeBlob.trim()) {
      throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_SOURCE_INVALID);
    }

    const parsedArtifact = parseCallbackModuleArtifact(codeBlob);
    if (!parsedArtifact.source || typeof parsedArtifact.source !== 'string') {
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
    const runExport = manifestRow?.run_export ||
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
    if (typeof rawHandler !== 'function') {
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

    if (typeof moduleMirror.setModule === 'function') {
      await moduleMirror.setModule(callbackModuleRef, moduleEntry);
      return;
    }
    if (moduleMirror.localCache &&
      typeof moduleMirror.localCache.set === 'function') {
      moduleMirror.localCache.set(callbackModuleRef, {
        ...moduleEntry,
        updatedAt: Date.now(),
      });
      return;
    }

    throw new Error(
      ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED,
    );
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
    const budgetEnforcer = sqlRequest.budgetEnforcer ||
      new BudgetEnforcer(sqlRequest.budgets || {});
    const cancellationToken = sqlRequest.cancellationToken ||
      new CancellationToken();
    const lineageTracker = sqlRequest.lineageTracker ||
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
    if (typeof sqlRequest.handler !== 'function') {
      throw new Error(ADAPTER_ERROR_MSG.STAGE_HANDLER_REQUIRED);
    }

    const executionContext = this.createRequestExecutionContext(sqlRequest);
    const cancellationToken = sqlRequest.cancellationToken ||
      executionContext.getCancellationToken();
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
    const plan = sqlRequest.plan ||
      sqlRequest.hints?.plan ||
      null;
    if (!plan || typeof plan !== 'object') {
      throw new Error(ADAPTER_ERROR_MSG.PLAN_OBJECT_REQUIRED);
    }

    const executionContext = this.createRequestExecutionContext(sqlRequest);
    const cancellationToken = sqlRequest.cancellationToken ||
      executionContext.getCancellationToken();
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
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {string} options.sessionId - Session ID for transaction tracking.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = [], options = {}) {
    const sessionId = options.sessionId || QUERY_SESSION.DEFAULT;
    this.recoverDistributedTransactionStateFromCache();
    if (EXPLAIN_DISTRIBUTED_PREFIX_REGEX.test(sql)) {
      return this.executeExplainDistributed(sql, params, {
        sessionId,
        dialect: options.dialect,
      });
    }

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, {
      sql: sql.substring(0, 100),
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
      if (ast._paramMapping && ast._paramMapping.length > 0) {
        params = reorderParams(params, ast._paramMapping);
      }
    } catch (parseError) {
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, 100),
        error: parseError.message,
      });
      return {
        success: false,
        error: parseError.message,
        errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR,
      };
    }

    const parseEndMs = Date.now();

    try {
      // Route based on statement type
      let result;
      switch (ast.type) {
      case QUERY_AST_TYPE.SELECT:
        result = await this.executeSelect(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.INSERT:
        result = await this.executeInsert(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.UPDATE:
        result = await this.executeUpdate(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.DELETE:
        result = await this.executeDelete(ast, params, sessionId);
        break;

      case QUERY_AST_TYPE.CREATE_TABLE:
        result = await this.executeCreateTable(ast, sessionId);
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
          partitionCount: result?.partitions?.length ?? 0,
          rowCount: result?.count ?? result?.changes ?? 0,
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
          partitionCount: 0,
          rowCount: 0,
          success: false,
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }

      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        sql: sql.substring(0, 100),
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        errorCode: this.getErrorCode(error),
      };
    }
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
      if (ast._paramMapping && ast._paramMapping.length > 0) {
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
      rows: [{
        plan_id: distributedPlan.planId,
        statement_type: distributedPlan.statementType,
        execution_policy: distributedPlan.executionPolicy,
        table_plans: Array.from(distributedPlan.tablePlans.values()),
        join_plan: distributedPlan.joinPlan,
        merge_plan: distributedPlan.mergePlan,
        diagnostics: distributedPlan.diagnostics,
      }],
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
  async executeCreateTable(ast, _sessionId) {
    return this.tableCreationService.createTable(ast);
  }

  /**
   * Provision initial routable replica for a newly-created table partition.
   * @param {Object} context - Table partition context.
   * @param {string} context.tableId - Table ID.
   * @param {string} context.partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async provisionInitialTablePartition(context) {
    const partitionId = context?.partitionId;
    const requestedReplicaCount =
      Number.isInteger(context?.replicaCount) &&
      context.replicaCount > 0 ?
        context.replicaCount :
        1;

    if (!partitionId) {
      throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED);
    }

    if (!this.rebalanceCoordinator ||
        typeof this.rebalanceCoordinator.createOperation !== 'function' ||
        typeof this.rebalanceCoordinator.executeOperation !== 'function') {
      throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED);
    }

    const provisionTargetNodeIds =
      this.resolveProvisionTargetNodeIds(requestedReplicaCount);
    const targetReplicaCount = Math.max(
      1,
      Math.min(
        requestedReplicaCount,
        provisionTargetNodeIds.length > 0 ?
          provisionTargetNodeIds.length :
          1,
      ),
    );

    let routableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId);
    if (routableNodeIds.length >= targetReplicaCount) {
      return;
    }

    for (const targetNodeId of provisionTargetNodeIds) {
      if (routableNodeIds.includes(targetNodeId)) {
        continue;
      }

      const operation = await this.rebalanceCoordinator.createOperation({
        type: OperationType.ADD,
        partitionId,
        entityType: SERVICE_TYPE.PARTITION,
        entityId: partitionId,
        nodeId: targetNodeId,
      });
      const requiresMinimumRouting =
        routableNodeIds.length < MIN_ROUTABLE_REPLICA_COUNT;
      const executionPromise = this.rebalanceCoordinator.executeOperation(
        operation,
      );
      const executionResult = requiresMinimumRouting ?
        await executionPromise :
        await Promise.race([
          executionPromise,
          this.sleep(BEST_EFFORT_PROVISION_DISPATCH_TIMEOUT_MS).then(() => ({
            success: false,
            skipped: true,
            reason: BEST_EFFORT_PROVISION_TIMEOUT_REASON,
          })),
        ]);

      if (executionResult?.reason === BEST_EFFORT_PROVISION_TIMEOUT_REASON) {
        this.logger.warn('Best-effort replica provision dispatch timed out', {
          partitionId,
          targetNodeId,
          timeoutMs: BEST_EFFORT_PROVISION_DISPATCH_TIMEOUT_MS,
          targetReplicaCount,
        });
        continue;
      }

      if (executionResult && executionResult.success === false &&
          executionResult.skipped !== true) {
        if (requiresMinimumRouting) {
          throw new Error(
            executionResult.error ||
            QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED,
          );
        }
        this.logger.warn('Best-effort replica provision dispatch failed', {
          partitionId,
          targetNodeId,
          targetReplicaCount,
          error:
            executionResult.error ||
            QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED,
        });
        continue;
      }

      routableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId);
    }
  }

  /**
   * Wait for table + partition metadata to appear in local cache before
   * dispatching replica creation.
   * @param {string|null} tableId - Table ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForTablePartitionMetadata(tableId, partitionId) {
    await this.waitForCondition(
      () => {
        const hasPartitionRecord = this.queryExecutor.hasPartitionRecord(partitionId);
        const hasTableRecord = tableId ? this.hasTableMetadata(tableId) : true;
        return hasPartitionRecord && hasTableRecord;
      },
      this.tablePartitionProvisioningTimeoutMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId,
    );
  }

  /**
   * Wait for at least one routable service row for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionService(partitionId) {
    await this.waitForRoutablePartitionServiceCount(partitionId, 1);
  }

  /**
   * Wait for minimum routable partition service replica count.
   * @param {string} partitionId - Partition ID.
   * @param {number} minimumCount - Minimum routable replicas.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionServiceCount(partitionId, minimumCount) {
    const requiredCount = Number.isInteger(minimumCount) &&
      minimumCount > 0 ?
      minimumCount :
      1;
    await this.waitForCondition(
      () => this.getRoutablePartitionServiceNodeIds(partitionId).length >=
        requiredCount,
      this.tablePartitionProvisioningTimeoutMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId,
    );
  }

  /**
   * Check whether table metadata is available in local cache.
   * @param {string} tableId - Table ID.
   * @return {boolean} True when table exists in cache.
   * @private
   */
  hasTableMetadata(tableId) {
    if (!tableId || !this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.has === 'function') {
      return this.systemCache.has(TABLES.TABLES, tableId);
    }

    if (typeof this.systemCache.get === 'function') {
      return Boolean(this.systemCache.get(TABLES.TABLES, tableId));
    }

    if (typeof this.systemCache.filter === 'function') {
      const matches = this.systemCache.filter(
        TABLES.TABLES,
        (row) => row.table_id === tableId,
      );
      return Array.isArray(matches) && matches.length > 0;
    }

    return false;
  }

  /**
   * Check whether a partition currently has a routable service row.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable.
   * @private
   */
  hasRoutablePartitionService(partitionId) {
    return this.getRoutablePartitionServiceNodeIds(partitionId).length > 0;
  }

  /**
   * Get unique node IDs with routable partition services.
   * @param {string} partitionId - Partition ID.
   * @return {Array<string>} Unique node IDs.
   * @private
   */
  getRoutablePartitionServiceNodeIds(partitionId) {
    if (!this.queryExecutor ||
        typeof this.queryExecutor.getRoutablePartitionServices !== 'function') {
      return [];
    }
    const services = this.queryExecutor.getRoutablePartitionServices(partitionId);
    const nodeIds = new Set();
    for (const service of services) {
      const nodeId = service?.node_id || service?.nodeId || null;
      if (typeof nodeId === 'string' && nodeId.length > 0) {
        nodeIds.add(nodeId);
      }
    }
    return [...nodeIds];
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    const desiredReplicaCount = Number.isInteger(requestedReplicaCount) &&
      requestedReplicaCount > 0 ?
      requestedReplicaCount :
      1;

    const activeNodeIds = this.getActiveNodeIdsFromCache();
    if (activeNodeIds.length === 0) {
      return [this.nodeId];
    }

    const uniqueNodeIds = [...new Set(activeNodeIds)];
    if (!uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.unshift(this.nodeId);
    }
    uniqueNodeIds.sort((left, right) => left.localeCompare(right));
    if (uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
      uniqueNodeIds.unshift(this.nodeId);
    }

    return uniqueNodeIds.slice(
      0,
      Math.max(1, Math.min(desiredReplicaCount, uniqueNodeIds.length)),
    );
  }

  /**
   * Get active node IDs from local system cache.
   * @return {Array<string>}
   * @private
   */
  getActiveNodeIdsFromCache() {
    if (!this.systemCache) {
      return [];
    }
    const activeNodeRows = [];
    const serviceRows = [];
    if (typeof this.systemCache.filter === 'function') {
      const filteredRows = this.systemCache.filter(TABLES.NODES, (nodeRow) => {
        const status = String(nodeRow?.status || nodeRow?.state || '')
          .toLowerCase();
        return status === STATUS_ACTIVE;
      });
      if (Array.isArray(filteredRows)) {
        activeNodeRows.push(...filteredRows);
      }
      const filteredServiceRows = this.systemCache.filter(
        TABLES.SERVICES,
        (serviceRow) => {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          return status === STATUS_ACTIVE &&
            typeof nodeId === 'string' &&
            nodeId.length > 0;
        },
      );
      if (Array.isArray(filteredServiceRows)) {
        serviceRows.push(...filteredServiceRows);
      }
    } else if (typeof this.systemCache.getAll === 'function') {
      const allRows = this.systemCache.getAll(TABLES.NODES);
      if (Array.isArray(allRows)) {
        for (const nodeRow of allRows) {
          const status = String(nodeRow?.status || nodeRow?.state || '')
            .toLowerCase();
          if (status === STATUS_ACTIVE) {
            activeNodeRows.push(nodeRow);
          }
        }
      }
      const allServiceRows = this.systemCache.getAll(TABLES.SERVICES);
      if (Array.isArray(allServiceRows)) {
        for (const serviceRow of allServiceRows) {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          if (status === STATUS_ACTIVE &&
              typeof nodeId === 'string' &&
              nodeId.length > 0) {
            serviceRows.push(serviceRow);
          }
        }
      }
    }

    const activeNodeEligibilityById = new Map();
    for (const row of activeNodeRows) {
      const nodeId = row?.node_id || row?.nodeId || row?.id || null;
      if (typeof nodeId !== 'string' || nodeId.length === 0) {
        continue;
      }
      const connectionState = String(
        row?.connection_state || row?.connectionState || '',
      ).toLowerCase();
      const hasConnectionState = connectionState.length > 0;
      const isConnectionReady = connectionState === CONNECTION_STATE_CONNECTED ||
        connectionState === CONNECTION_STATE_READY;
      activeNodeEligibilityById.set(
        nodeId,
        !hasConnectionState || isConnectionReady,
      );
    }

    const eligibleNodeIds = [...activeNodeEligibilityById.entries()]
      .filter(([_nodeId, eligible]) => eligible === true)
      .map(([nodeId]) => nodeId)
      .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0);
    const serviceNodeIds = serviceRows
      .map((row) => row?.node_id || row?.nodeId || null)
      .filter((nodeId) => {
        if (typeof nodeId !== 'string' || nodeId.length === 0) {
          return false;
        }
        if (!activeNodeEligibilityById.has(nodeId)) {
          return true;
        }
        // Active service ownership is a stronger signal than a transiently
        // stale disconnected node row during table-create provisioning.
        return true;
      })
      .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0);
    return [...new Set([...eligibleNodeIds, ...serviceNodeIds])];
  }

  /**
   * Wait for a condition with bounded timeout.
   * @param {Function} predicate - Condition callback.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @param {number} intervalMs - Poll interval in milliseconds.
   * @param {string} timeoutError - Timeout error message.
   * @return {Promise<void>}
   * @private
   */
  async waitForCondition(predicate, timeoutMs, intervalMs, timeoutError) {
    const deadlineMs = Date.now() + timeoutMs;

    while (Date.now() < deadlineMs) {
      if (await predicate()) {
        return;
      }
      await this.sleep(intervalMs);
    }

    throw new Error(timeoutError);
  }

  /**
   * Delay helper for provisioning polling loops.
   * @param {number} ms - Delay in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(ast, params, sessionId) {
    // FROM-less SELECT (e.g., SELECT 1, SELECT 1+1) — route to any
    // available partition and let SQLite evaluate the expression.
    if (!ast.from) {
      return this.executeFromlessSelect(ast, params, sessionId);
    }

    const tableName = ast.from.name;
    const planningStartTimeMs = Date.now();
    const distributedPlan = this.distributedQueryPlanner.planSelect(
      ast,
      params,
      {sessionId},
    );
    const planningDurationMs = Date.now() - planningStartTimeMs;
    const rootAlias = ast.from.alias || tableName;
    const rootPlan = distributedPlan.tablePlans.get(rootAlias) ||
      distributedPlan.tablePlans.get(tableName) ||
      null;

    if (!rootPlan || rootPlan.partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    const partitionIds = rootPlan.partitions;

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, {
      tableName,
      totalPartitions: partitionIds.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    const preferLeader = this.isSystemTable(tableName);
    for (const join of ast.joins || []) {
      const joinTableName = join.table?.name;
      if (!joinTableName) {
        continue;
      }
      const joinAlias = join.table.alias || joinTableName;
      const joinPlan = distributedPlan.tablePlans.get(joinAlias) ||
        distributedPlan.tablePlans.get(joinTableName) ||
        null;
      if (!joinPlan || joinPlan.partitions.length === 0) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${joinTableName}`,
          errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
        };
      }
    }

    // Execute on resolved partitions
    const executionStartTimeMs = Date.now();
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {
        preferLeader,
        distributedPlan,
      },
    );
    const executionDurationMs = Date.now() - executionStartTimeMs;

    return {
      ...result,
      tableName,
      distributedPlan,
      distributedDiagnostics: distributedPlan.diagnostics,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        fanout: result.distributedMetrics?.fanout || null,
        mergeDurationMs: result.distributedMetrics?.mergeDurationMs || 0,
      },
    };
  }

  /**
   * Execute a SELECT without a FROM clause (e.g., SELECT 1, SELECT 1+1).
   * Routes to any available partition and lets SQLite evaluate the
   * expression directly.
   * @param {Object} ast - Parsed SELECT AST with null from.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeFromlessSelect(ast, params, _sessionId) {
    const allPartitions =
      this.systemCache?.getAll?.(TABLES.PARTITIONS) || [];
    if (allPartitions.length === 0) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_PARTITIONS_FOR_TABLE,
        errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
      };
    }

    const targetPartitionId = allPartitions[0].partition_id;
    const cols = ast.columns.map((col) =>
      this.queryExecutor.buildColumnSQL(col),
    );
    const sql = `SELECT ${cols.join(', ')}`;

    const results = await this.queryExecutor.executeOnPartitions(
      [targetPartitionId],
      sql,
      params,
      null,
      true,
    );

    const first = results[0];
    if (!first || !first.success) {
      return {
        success: false,
        error: first?.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    }

    return {
      success: true,
      rows: first.rows || [],
      count: first.rows?.length || 0,
      partitions: [targetPartitionId],
      tableName: null,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: null,
        mergeDurationMs: 0,
      },
    };
  }

  /**
   * Execute an INSERT statement.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Insert result.
   * @private
   */
  async executeInsert(ast, params, sessionId) {
    const tableName = ast.table;
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);
    const writePartitions = Array.from(writePlan.partitionStatements.keys());
    if (txState) {
      const payloadHash = this.createWriteOperationPayloadHash(
        writePlan,
        QUERY_AST_TYPE.INSERT,
      );
      const enlistResult = await this.transactionCoordinator.enlistParticipants(
        sessionId,
        writePartitions,
      );
      if (!enlistResult.success) {
        return enlistResult;
      }
      await this.transactionCoordinator.recordWriteOperation(sessionId, {
        statementType: QUERY_AST_TYPE.INSERT,
        operationId: writePlan.operationId,
        partitionIds: writePartitions,
        idempotencyKey: writePlan.idempotencyKey,
        payloadHash,
      });
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
      this.fireNonTransactionalWriteStart(
        writePlan,
        QUERY_AST_TYPE.INSERT,
      );
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, {
      tableName,
      rowCount: ast.values.length,
      partitionCount: writePlan.partitionStatements.size,
      sessionId,
    });

    let result;
    const executionStartTimeMs = Date.now();
    try {
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
      );
    } catch (error) {
      if (txState) {
        await this.transactionCoordinator.markWriteOperationResult(
          sessionId,
          writePlan.operationId,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
        this.fireNonTransactionalWriteResult(
          writePlan,
          QUERY_AST_TYPE.INSERT,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      }
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;

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
    }

    return {
      ...result,
      operation: QUERY_OPERATION.INSERT,
      tableName,
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
   * @return {Promise<Object>} Update result.
   * @private
   */
  async executeUpdate(ast, params, sessionId) {
    const tableName = ast.table;
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);
    if (txState) {
      const payloadHash = this.createWriteOperationPayloadHash(
        writePlan,
        QUERY_AST_TYPE.UPDATE,
      );
      const enlistResult = await this.transactionCoordinator.enlistParticipants(
        sessionId,
        partitionIds,
      );
      if (!enlistResult.success) {
        return enlistResult;
      }
      await this.transactionCoordinator.recordWriteOperation(sessionId, {
        statementType: QUERY_AST_TYPE.UPDATE,
        operationId: writePlan.operationId,
        partitionIds,
        idempotencyKey: writePlan.idempotencyKey,
        payloadHash,
      });
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
      this.fireNonTransactionalWriteStart(
        writePlan,
        QUERY_AST_TYPE.UPDATE,
      );
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_UPDATE, {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute update on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
      );
    } catch (error) {
      if (txState) {
        await this.transactionCoordinator.markWriteOperationResult(
          sessionId,
          writePlan.operationId,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
        this.fireNonTransactionalWriteResult(
          writePlan,
          QUERY_AST_TYPE.UPDATE,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      }
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;

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
    }

    return {
      ...result,
      tableName,
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
   * @return {Promise<Object>} Delete result.
   * @private
   */
  async executeDelete(ast, params, sessionId) {
    const tableName = ast.table;
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

    const txState = this.transactionCoordinator.getTransaction(sessionId);
    if (txState) {
      const payloadHash = this.createWriteOperationPayloadHash(
        writePlan,
        QUERY_AST_TYPE.DELETE,
      );
      const enlistResult = await this.transactionCoordinator.enlistParticipants(
        sessionId,
        partitionIds,
      );
      if (!enlistResult.success) {
        return enlistResult;
      }
      await this.transactionCoordinator.recordWriteOperation(sessionId, {
        statementType: QUERY_AST_TYPE.DELETE,
        operationId: writePlan.operationId,
        partitionIds,
        idempotencyKey: writePlan.idempotencyKey,
        payloadHash,
      });
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
      this.fireNonTransactionalWriteStart(
        writePlan,
        QUERY_AST_TYPE.DELETE,
      );
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_DELETE, {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute delete on resolved partitions
    let result;
    const executionStartTimeMs = Date.now();
    try {
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
      );
    } catch (error) {
      if (txState) {
        await this.transactionCoordinator.markWriteOperationResult(
          sessionId,
          writePlan.operationId,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(tableName)) {
        this.fireNonTransactionalWriteResult(
          writePlan,
          QUERY_AST_TYPE.DELETE,
          {
            success: false,
            error: error.message,
            retryCount: 0,
          },
        );
      }
      throw error;
    }
    const executionDurationMs = Date.now() - executionStartTimeMs;

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
    }

    return {
      ...result,
      tableName,
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
    if (typeof this.transactionCoordinator.recoverFromSystemTables !==
      'function') {
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
    const writeOperations = this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS);

    this.transactionCoordinator.recoverFromSystemTables({
      transactions,
      participants,
      writeOperations,
    });
    this.transactionStateRecovered = true;
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
   * Persist one distributed transaction row.
   * @param {Object} record - Transaction persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionRow(record) {
    if (!this.cdcIntegrationService ||
      typeof this.cdcIntegrationService.upsertSystemTableRow !== 'function') {
      return;
    }
    await this.cdcIntegrationService.upsertSystemTableRow(
      TABLES.SQL_TRANSACTIONS,
      {
        transaction_id: record.transactionId,
        session_id: record.sessionId,
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  /**
   * Persist one distributed transaction participant row.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (!this.cdcIntegrationService ||
      typeof this.cdcIntegrationService.upsertSystemTableRow !== 'function') {
      return;
    }
    await this.cdcIntegrationService.upsertSystemTableRow(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
      {
        participant_id: record.participantId,
        transaction_id: record.transactionId,
        partition_id: record.partitionId,
        status: record.status,
        last_error: record.lastError,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  /**
   * Persist one distributed write operation row.
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (!this.cdcIntegrationService ||
      typeof this.cdcIntegrationService.upsertSystemTableRow !== 'function') {
      return;
    }
    await this.cdcIntegrationService.upsertSystemTableRow(
      TABLES.SQL_WRITE_OPERATIONS,
      {
        operation_id: record.operationId,
        transaction_id: record.transactionId || null,
        statement_type: record.statementType,
        status: record.status,
        idempotency_key: record.idempotencyKey,
        payload_hash: record.payloadHash,
        retry_count: record.retryCount || 0,
        last_error: record.lastError || null,
        partition_ids: JSON.stringify(record.partitionIds || []),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  /**
   * Persist a distributed write operation not associated with a transaction.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {Promise<void>}
   * @private
   */
  /**
   * Fire-and-forget: persist a non-transactional write operation row.
   * Non-transactional write tracking is observability-only and is not
   * required for correctness (recovery only reads sql_write_operations
   * when active sql_transactions exist). Blocking the write critical
   * path on this persistence triples write latency because each
   * upsert routes through full SQL + Raft + CDC cache wait.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @private
   */
  fireNonTransactionalWriteStart(writePlan, statementType) {
    const now = Date.now();
    this.persistDistributedWriteOperationRow({
      operationId: writePlan.operationId,
      transactionId: null,
      statementType,
      status: WRITE_OPERATION_STATUS.PENDING,
      idempotencyKey: writePlan.idempotencyKey,
      payloadHash: this.createWriteOperationPayloadHash(
        writePlan,
        statementType,
      ),
      partitionIds: Array.from(writePlan.partitionStatements.keys()),
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }).catch((error) => {
      this.logger.warn(QUERY_LOG_MSG.WRITE_OP_PERSIST_FAILED, {
        operationId: writePlan.operationId,
        statementType,
        status: WRITE_OPERATION_STATUS.PENDING,
        error: error.message,
      });
    });
  }

  /**
   * Fire-and-forget: persist the final state for a non-transactional
   * distributed write. See fireNonTransactionalWriteStart for rationale.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @param {Object} result - Write result.
   * @private
   */
  fireNonTransactionalWriteResult(writePlan, statementType, result) {
    const now = Date.now();
    this.persistDistributedWriteOperationRow({
      operationId: writePlan.operationId,
      transactionId: null,
      statementType,
      status: result.success === true ?
        WRITE_OPERATION_STATUS.SUCCEEDED :
        WRITE_OPERATION_STATUS.FAILED,
      idempotencyKey: writePlan.idempotencyKey,
      payloadHash: this.createWriteOperationPayloadHash(
        writePlan,
        statementType,
      ),
      partitionIds: Array.from(writePlan.partitionStatements.keys()),
      retryCount: this.resolveWriteResultRetryCount(result),
      lastError: result.success === true ? null : result.error,
      createdAt: now,
      updatedAt: now,
    }).catch((error) => {
      this.logger.warn(QUERY_LOG_MSG.WRITE_OP_PERSIST_FAILED, {
        operationId: writePlan.operationId,
        statementType,
        status: result.success === true ?
          WRITE_OPERATION_STATUS.SUCCEEDED :
          WRITE_OPERATION_STATUS.FAILED,
        error: error.message,
      });
    });
  }

  /**
   * Build deterministic payload hash for distributed write persistence.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {string} Payload hash.
   * @private
   */
  createWriteOperationPayloadHash(writePlan, statementType) {
    const payload = JSON.stringify({
      operationId: writePlan.operationId,
      statementType,
      partitionIds: Array.from(writePlan.partitionStatements.keys()).sort(),
    });
    return createHash('sha1')
      .update(payload)
      .digest('hex');
  }

  /**
   * Resolve total retry count from a write result payload.
   * @param {Object} result - Distributed write result.
   * @return {number} Retry count.
   * @private
   */
  resolveWriteResultRetryCount(result) {
    if (Number.isInteger(result?.retryCount)) {
      return result.retryCount;
    }
    if (!Array.isArray(result?.participantResults)) {
      return 0;
    }
    return result.participantResults.reduce((sum, entry) => {
      const attempts = Number.isInteger(entry.attempts) ? entry.attempts : 1;
      return sum + Math.max(attempts - 1, 0);
    }, 0);
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});
    return this.transactionCoordinator.begin(sessionId);
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.COMMIT, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.commit(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.COMMIT_FAILED,
        error: QUERY_ERROR_MSG.COMMIT_FAILED,
      };
    }
    return result;
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.rollback(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.ROLLBACK_FAILED,
        error: QUERY_ERROR_MSG.ROLLBACK_FAILED,
      };
    }
    return result;
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    return this.transactionCoordinator.hasActiveTransaction(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    return txState?.participants?.[0] || null;
  }

  /**
   * Bind a transaction to a partition (on first write).
   * Transactions are routed through message router like all other operations.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId) {
    const result = await this.transactionCoordinator.enlistParticipants(
      sessionId,
      [partitionId],
    );
    if (!result.success) {
      throw new Error(result.error || QUERY_ERROR_MSG.BEGIN_FAILED);
    }
  }

  /**
   * Deliver one transaction control operation to a partition service.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} operation - Transaction operation.
   * @return {Promise<void>}
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation) {
    const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
    if (!serviceInfo) {
      throw new Error(`${QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND_PREFIX}${partitionId}`);
    }
    const response = await this.messageRouter.deliver(serviceInfo.address, {
      type: QUERY_OPERATION.TRANSACTION,
      operation,
      sessionId,
    });
    if (!response.acknowledged || !response.success) {
      if (operation === QUERY_OPERATION.BEGIN) {
        throw new Error(response.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
      if (operation === QUERY_OPERATION.COMMIT) {
        throw new Error(response.error || QUERY_ERROR_MSG.COMMIT_FAILED);
      }
      throw new Error(response.error || QUERY_ERROR_MSG.ROLLBACK_FAILED);
    }
  }

  /**
   * Get partitions for a table.
   *
   * System Cache Lookup:
   * - Uses ONLY the system cache (single source of truth)
   * - No fallbacks or bootstrap directories
   * - System cache populated from bootstrap snapshots
   * - CDC events keep cache synchronized
   * - Throws error if cache not available
   *
   * Requirements: 3.1, 5.1
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @throws {Error} If system cache is not available.
   * @private
   */
  getTablePartitions(tableName) {
    if (!this.systemCache) {
      throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}`);
    }

    const matchesTableRef = (partition, tableRef) =>
      partition.table_name === tableRef ||
      partition.tableName === tableRef ||
      partition.table_id === tableRef ||
      partition.tableId === tableRef;

    const tableInfo = this.getTableInfo(tableName);
    const tableId = tableInfo?.table_id || tableInfo?.tableId || null;

    // Get partitions from system cache - the single source of truth
    if (typeof this.systemCache.filter === 'function') {
      const directMatches =
        this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          matchesTableRef(partition, tableName),
        ) || [];
      if (directMatches.length > 0 || !tableId || tableId === tableName) {
        return directMatches;
      }

      return this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
        matchesTableRef(partition, tableId),
      ) || [];
    }

    if (typeof this.systemCache.getAll === 'function') {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const directMatches = all.filter((partition) =>
        matchesTableRef(partition, tableName),
      );
      if (directMatches.length > 0 || !tableId || tableId === tableName) {
        return directMatches;
      }

      return all.filter((partition) =>
        matchesTableRef(partition, tableId),
      );
    }

    throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`);
  }

  /**
   * Get table information.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (!this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
        if (byPrimaryKey) {
          return byPrimaryKey;
        }
      }
      if (typeof this.systemCache.find === 'function') {
        const found = this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === 'function') {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return tables.find((table) =>
          table.table_name === tableName ||
          table.tableName === tableName ||
          table.table_id === tableName ||
          table.tableId === tableName,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Check if a table is a system table.
   * @param {string} tableName - Table name.
   * @return {boolean} True if system table.
   * @private
   */
  isSystemTable(tableName) {
    return Object.values(SYSTEM_TABLE_NAME).includes(tableName);
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes('parse') || message.includes('syntax')) {
      return QUERY_ERROR_CODE.SYNTAX_ERROR;
    }
    if (message.includes('table not found')) {
      return QUERY_ERROR_CODE.TABLE_NOT_FOUND;
    }
    if (message.includes('timeout')) {
      return QUERY_ERROR_CODE.TIMEOUT;
    }

    return QUERY_ERROR_CODE.INTERNAL_ERROR;
  }

  /**
   * Parse a SQL statement without executing.
   * @param {string} sql - SQL string.
   * @return {Object} Parsed AST.
   */
  parse(sql) {
    const parser = new SQLParser(sql);
    return parser.parse();
  }

  /**
   * Resolve partitions for a query without executing.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause AST.
   * @return {Array} Partition IDs.
   */
  resolvePartitions(tableName, whereClause) {
    const partitions = this.getTablePartitions(tableName);
    return this.partitionResolver.resolvePartitions(
      tableName,
      whereClause,
      partitions,
    );
  }
}

export {SQLQueryEngine};
