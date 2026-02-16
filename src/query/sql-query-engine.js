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

import {SQLParser} from './sql-parser.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {PartitionResolver} from './partition-resolver.js';
import {QueryExecutor} from './query-executor.js';
import {TableCreationService} from './table-creation-service.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_DEFAULT_VALUE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {isSqlRequest} from './sql-request.js';
import {PartitionCallbackDispatcher} from
  './partition-callback-dispatcher.js';
import {CallbackExecutionHost} from
  './callback-execution-host.js';
import {createCallbackDriverRegistry} from
  './callback-runtime-driver-registry.js';
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
import {parseCallbackModuleArtifact} from './callback-module-artifact.js';
import {reorderParams} from './pg-translate.js';

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
   */
  constructor(options = {}) {
    this.systemCache = options.systemCache || null;
    this.messageRouter = options.messageRouter || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;

    this.partitionResolver = new PartitionResolver({
      systemCache: this.systemCache,
    });

    this.queryExecutor = new QueryExecutor({
      messageRouter: this.messageRouter,
      systemCache: this.systemCache,
      nodeId: this.nodeId,
    });

    this.tableCreationService = new TableCreationService({
      systemCache: this.systemCache,
      cdcIntegrationService: this.cdcIntegrationService,
    });

    this.partitionCallbackDispatcher = new PartitionCallbackDispatcher({
      sqlParser: {parse: (sql) => this.parse(sql)},
      partitionResolver: this.partitionResolver,
      queryExecutor: this.queryExecutor,
      getTablePartitions: (name) => this.getTablePartitions(name),
      isSystemTable: (name) => this.isSystemTable(name),
    });

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

    // Transaction state per client/session
    this.activeTransactions = new Map(); // sessionId -> {partitionId, partition}
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
    } catch {
      // Logging not available
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

      return result;
    } catch (error) {
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
    } catch {
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
    } catch {
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

    this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, {
      sql: sql.substring(0, 100),
      paramCount: params.length,
      sessionId,
    });

    // Parse the SQL
    let ast;
    try {
      const parser = new SQLParser(sql, {dialect: options.dialect});
      ast = parser.parse();
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
        throw new Error(`${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`);
      }

      // Strip partition details from results (Requirement 20.10)
      return this.tableCreationService.stripPartitionDetails(result);
    } catch (error) {
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
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(ast, params, sessionId) {
    const tableName = ast.from.name;

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Resolve which partitions to query
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, {
      tableName,
      totalPartitions: partitions.length,
      targetPartitions: partitionIds.length,
      sessionId,
    });

    const preferLeader = this.isSystemTable(tableName);

    // Execute on resolved partitions
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {preferLeader},
    );

    return {
      ...result,
      tableName,
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

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Get table info to find primary key
    const tableInfo = this.getTableInfo(tableName);
    const primaryKey = tableInfo?.primaryKey || QUERY_DEFAULT_VALUE.PRIMARY_KEY;
    const primaryKeyIndex = this.findPrimaryKeyIndex(ast, primaryKey);

    // Route each row to appropriate partition
    const rowsByPartition = new Map();

    for (const row of ast.values) {
      const keyValue = this.extractKeyValue(row, primaryKeyIndex);
      const partitionId = this.partitionResolver.resolvePartitionForKey(
        tableName,
        keyValue,
        partitions,
      );

      if (!partitionId) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.PARTITION_FOR_KEY_PREFIX}${keyValue}`,
          errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
        };
      }

      if (!rowsByPartition.has(partitionId)) {
        rowsByPartition.set(partitionId, []);
      }
      rowsByPartition.get(partitionId).push(row);
    }

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && rowsByPartition.size > 1) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.CROSS_PARTITION_INSERT,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId) {
      // Check if all rows go to the same partition as the transaction
      for (const partitionId of rowsByPartition.keys()) {
        if (partitionId !== txState.partitionId) {
          return {
            success: false,
            error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
              `${QUERY_ERROR_MSG.TX_BOUND_INSERT_SUFFIX}${partitionId}`,
            errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
          };
        }
      }
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, {
      tableName,
      rowCount: ast.values.length,
      partitionCount: rowsByPartition.size,
      sessionId,
    });

    // Execute inserts on each partition
    let totalAffected = 0;
    const affectedPartitions = [];

    for (const [partitionId, rows] of rowsByPartition) {
      // Bind transaction to partition if in transaction
      if (txState && !txState.partitionId) {
        await this.bindTransactionToPartition(sessionId, partitionId);
      }

      const partitionAst = {
        ...ast,
        values: rows,
      };

      const result = await this.queryExecutor.executeInsert(
        partitionAst,
        partitionId,
        params,
      );

      totalAffected += result.affectedRows || 0;
      affectedPartitions.push(partitionId);
    }

    return {
      success: true,
      operation: QUERY_OPERATION.INSERT,
      affectedRows: totalAffected,
      partitions: affectedPartitions,
      tableName,
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

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Resolve which partitions to update
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && partitionIds.length > 1) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.CROSS_PARTITION_UPDATE,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
            QUERY_ERROR_MSG.TX_BOUND_UPDATE_SUFFIX,
          errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      await this.bindTransactionToPartition(sessionId, partitionIds[0]);
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_UPDATE, {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute update on resolved partitions
    const result = await this.queryExecutor.executeUpdate(
      ast,
      partitionIds,
      params,
    );

    return {
      ...result,
      tableName,
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

    // Get partitions for the table
    const partitions = this.getTablePartitions(tableName);

    if (partitions.length === 0) {
      return {
        success: false,
        error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
        errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      };
    }

    // Resolve which partitions to delete from
    const partitionIds = this.partitionResolver.resolvePartitions(
      tableName,
      ast.where,
      partitions,
    );

    // Check for cross-partition transaction violation
    const txState = this.activeTransactions.get(sessionId);
    if (txState && partitionIds.length > 1) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.CROSS_PARTITION_DELETE,
        errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
      };
    }

    if (txState && txState.partitionId && partitionIds.length > 0) {
      if (!partitionIds.includes(txState.partitionId)) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
            QUERY_ERROR_MSG.TX_BOUND_DELETE_SUFFIX,
          errorCode: QUERY_ERROR_CODE.CROSS_PARTITION_TRANSACTION,
        };
      }
    }

    // Bind transaction to partition if in transaction
    if (txState && !txState.partitionId && partitionIds.length === 1) {
      await this.bindTransactionToPartition(sessionId, partitionIds[0]);
    }

    this.logger.debug(QUERY_LOG_MSG.ROUTING_DELETE, {
      tableName,
      partitionCount: partitionIds.length,
      sessionId,
    });

    // Execute delete on resolved partitions
    const result = await this.queryExecutor.executeDelete(
      ast,
      partitionIds,
      params,
    );

    return {
      ...result,
      tableName,
    };
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    // Check if session already has an active transaction
    if (this.activeTransactions.has(sessionId)) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_ACTIVE,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});

    // Transaction will be bound to a partition on first write
    this.activeTransactions.set(sessionId, {
      partitionId: null,
      partition: null,
      started: Date.now(),
    });

    return {
      success: true,
      operation: QUERY_OPERATION.BEGIN_TRANSACTION,
      sessionId,
    };
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.COMMIT, {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: QUERY_OPERATION.COMMIT};

      // If transaction was bound to a partition, commit it via message router
      if (txState.partitionId) {
        const serviceInfo = this.queryExecutor.findPartitionService(txState.partitionId);
        if (serviceInfo) {
          const response = await this.messageRouter.deliver(serviceInfo.address, {
            type: QUERY_OPERATION.TRANSACTION,
            operation: QUERY_OPERATION.COMMIT,
            sessionId,
          });

          if (!response.acknowledged || !response.success) {
            throw new Error(response.error || QUERY_ERROR_MSG.COMMIT_FAILED);
          }
          result = {success: true, operation: QUERY_OPERATION.COMMIT};
        }
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        operation: QUERY_OPERATION.COMMIT,
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {sessionId, partitionId: txState.partitionId});

    try {
      let result = {success: true, operation: QUERY_OPERATION.ROLLBACK};

      // If transaction was bound to a partition, rollback it via message router
      if (txState.partitionId) {
        const serviceInfo = this.queryExecutor.findPartitionService(txState.partitionId);
        if (serviceInfo) {
          const response = await this.messageRouter.deliver(serviceInfo.address, {
            type: QUERY_OPERATION.TRANSACTION,
            operation: QUERY_OPERATION.ROLLBACK,
            sessionId,
          });

          if (!response.acknowledged || !response.success) {
            throw new Error(response.error || QUERY_ERROR_MSG.ROLLBACK_FAILED);
          }
          result = {success: true, operation: QUERY_OPERATION.ROLLBACK};
        }
      }

      // Clean up transaction state
      this.activeTransactions.delete(sessionId);

      return result;
    } catch (error) {
      // Clean up on error
      this.activeTransactions.delete(sessionId);
      this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, {
        operation: QUERY_OPERATION.ROLLBACK,
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    return this.activeTransactions.has(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.activeTransactions.get(sessionId);
    return txState?.partitionId || null;
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
    const txState = this.activeTransactions.get(sessionId);

    if (!txState) {
      throw new Error(QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }

    if (txState.partitionId && txState.partitionId !== partitionId) {
      throw new Error(
        `${QUERY_ERROR_MSG.TX_BOUND_PREFIX}${txState.partitionId}` +
        `${QUERY_ERROR_MSG.TX_BOUND_OPERATION_SUFFIX}${partitionId}`,
      );
    }

    if (!txState.partitionId) {
      // First write - bind to this partition
      txState.partitionId = partitionId;

      // Begin transaction via message router
      // The partition service will handle the BEGIN TRANSACTION message
      const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
      if (!serviceInfo) {
        throw new Error(`${QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND_PREFIX}${partitionId}`);
      }

      const response = await this.messageRouter.deliver(serviceInfo.address, {
        type: QUERY_OPERATION.TRANSACTION,
        operation: QUERY_OPERATION.BEGIN,
        sessionId,
      });

      if (!response.acknowledged || !response.success) {
        throw new Error(response.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
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

    // Get partitions from system cache - the single source of truth
    if (typeof this.systemCache.filter === 'function') {
      const partitions = this.systemCache.filter(TABLES.PARTITIONS, (p) =>
        p.table_name === tableName ||
        p.tableName === tableName ||
        p.table_id === tableName ||
        p.tableId === tableName,
      ) || [];
      return partitions;
    }

    if (typeof this.systemCache.getAll === 'function') {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const partitions = all.filter((p) =>
        p.table_name === tableName ||
        p.tableName === tableName ||
        p.table_id === tableName ||
        p.tableId === tableName,
      );
      return partitions;
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
        return this.systemCache.get(TABLES.TABLES, tableName);
      }
      if (typeof this.systemCache.find === 'function') {
        return this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === tableName || t.tableName === tableName,
        );
      }
    } catch {
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
    return Object.values(SystemTableName).includes(tableName);
  }

  /**
   * Find primary key column index in INSERT columns.
   * @param {Object} ast - INSERT AST.
   * @param {string} primaryKey - Primary key column name.
   * @return {number} Column index or 0.
   * @private
   */
  findPrimaryKeyIndex(ast, primaryKey) {
    if (!ast.columns) {
      return 0; // Assume first column is primary key
    }

    const index = ast.columns.findIndex((col) =>
      col.toLowerCase() === primaryKey.toLowerCase(),
    );

    return index >= 0 ? index : 0;
  }

  /**
   * Extract key value from INSERT row.
   * @param {Array} row - Row values.
   * @param {number} keyIndex - Primary key index.
   * @return {*} Key value.
   * @private
   */
  extractKeyValue(row, keyIndex) {
    if (keyIndex >= row.length) {
      return null;
    }

    const valueExpr = row[keyIndex];
    if (valueExpr.type === QUERY_AST_NODE.LITERAL) {
      return valueExpr.value;
    }

    return null;
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
