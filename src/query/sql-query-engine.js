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
import {
  ReplicaOperationField,
} from '../rebalancer/replica-operation-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  ENTITY_TYPE,
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
import {AddressManager} from '../address/address-manager.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {AuthoritativeControlPlaneView} from
  '../control-plane/authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
} from '../control-plane/control-plane-mutation-readiness.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  RETRYABLE_PARTITION_TRANSITION_STATES,
} from '../partition/partition-constants.js';
import {ManagedSplitWorkflow} from '../partition/managed-split-workflow.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from '../partition/partition-service-constants.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {MIGRATION_STATUS} from '../migration/migration-constants.js';
import {MigrationCoordinator} from '../migration/migration-coordinator.js';
import {MigrationPipeline} from '../migration/migration-pipeline.js';

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
const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = 'NORMAL';
const DUAL_WRITE_ACTIVE_STATUSES = new Set([
  MIGRATION_STATUS.DUAL_WRITE,
]);
const TABLE_PARTITION_TARGET_NODE_WAIT = 'table_partition_target_node_wait';
const TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS = 10000;
const PROVISIONING_REJECTION_DETAIL_LIMIT = 3;
const PROVISIONING_REJECTION_SUMMARY_NONE = 'none';
const PROVISIONING_REJECTION_REASON_UNKNOWN = 'admission_blocked';
const WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS = 5000;

function createEmptyTransactionRecoveryReplaySummary() {
  return {
    totalRecovered: 0,
    resumed: 0,
    failed: 0,
    results: [],
  };
}

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
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.rebalanceCoordinator?.controlPlaneReadinessService ||
      null;
    this.defaultRoutingReadinessDimension =
      options.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.routingMetadataOverlay = options.routingMetadataOverlay || null;
    this.bootstrapRoutingOverlayEntries = new Map();
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
        operationName: 'sql_control_plane',
        now: this.nowFn,
      });
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
    this.tablePartitionTargetNodeConvergenceTimeoutMs =
      Number.isFinite(options.tablePartitionTargetNodeConvergenceTimeoutMs) &&
      options.tablePartitionTargetNodeConvergenceTimeoutMs > 0 ?
        Math.floor(options.tablePartitionTargetNodeConvergenceTimeoutMs) :
        QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS;

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
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      defaultRoutingReadinessDimension:
        this.defaultRoutingReadinessDimension,
      nodeId: this.nodeId,
    });
    this.queryExecutor.setRoutingMetadataOverlay(
      this.composeRoutingMetadataOverlay(
        this.routingMetadataOverlay,
        this.bootstrapRoutingOverlay,
      ),
    );
    this.distributedWriteCoordinator = options.distributedWriteCoordinator ||
      new DistributedWriteCoordinator({
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: (tableName) => this.getTablePartitions(tableName),
        getTableInfo: (tableName) => this.getTableInfo(tableName),
      });
    this.transactionCoordinator = options.transactionCoordinator ||
      new DistributedTransactionCoordinator({
        beginParticipant: async (sessionId, partitionId, transactionEpoch) =>
          this.deliverTransactionOperation(
            sessionId,
            partitionId,
            QUERY_OPERATION.BEGIN,
            {transactionEpoch},
          ),
        prepareParticipant: async (sessionId, partitionId) =>
          this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.PREPARE),
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
        epochSource: options.transactionEpochSource,
        loadRecoveryStateForSweep: async () =>
          this.loadDistributedTransactionRecoveryState(),
      });
    this.managedSplitWorkflow = options.managedSplitWorkflow || null;

    const tablePartitionProvisioner = typeof options.tablePartitionProvisioner ===
      'function' ?
      options.tablePartitionProvisioner :
      (this.rebalanceCoordinator ?
        (context) => this.provisionInitialTablePartition(context) :
        null);
    this.partitionSplitMergeManager = options.partitionSplitMergeManager || null;
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
    this.migrationAutoWireEnabled = options.migrationAutoWire !== false;
    this.migrationCoordinator = options.migrationCoordinator || null;
    if (this.migrationAutoWireEnabled &&
      !this.migrationCoordinator &&
      this.systemCache) {
      this.migrationCoordinator = new MigrationCoordinator({
        sqlCore: this,
        systemTableCache: this.systemCache,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        now: this.nowFn,
      });
    }
    this.migrationPipeline = options.migrationPipeline || null;
    if (this.migrationAutoWireEnabled &&
      !this.migrationPipeline &&
      this.migrationCoordinator) {
      this.migrationPipeline = new MigrationPipeline({
        migrationCoordinator: this.migrationCoordinator,
        logger: this.logger,
      });
    }
    this.managedSplitWorkflow = this.managedSplitWorkflow ||
      new ManagedSplitWorkflow({
        nodeId: this.nodeId,
        getCDCIntegrationService: () => this.cdcIntegrationService,
        getPartitionInfo: (partitionId) => this.getPartitionInfo(partitionId),
        getTableInfo: (tableNameOrId) => this.getTableInfo(tableNameOrId),
        listTableInfos: () => this.systemCache?.getAll(TABLES.TABLES) || [],
        parsePartitionTransition: (tableInfo) =>
          this.parsePartitionTransition(tableInfo),
        isLocalManagedSplitLeader: (partitionInfo) =>
          this.isLocalManagedSplitLeader(partitionInfo),
        resolveActivePartitionVersion: (tableInfo) =>
          this.resolveActivePartitionVersion(tableInfo),
        buildManagedSplitPlan: (...args) => this.buildManagedSplitPlan(...args),
        resolveProvisionTargetNodeIds: (replicaCount) =>
          this.resolveProvisionTargetNodeIds(replicaCount),
        getRoutablePartitionServiceNodeIds: (partitionId) =>
          this.getRoutablePartitionServiceNodeIds(partitionId),
        captureTopologySnapshot: (context) =>
          this.captureManagedSplitTopologySnapshot(context),
        calculateQuorumReplicaCount: (replicaCount) =>
          this.calculateQuorumReplicaCount(replicaCount),
        storageAdmissionService:
          this.rebalanceCoordinator?.storageAdmissionService || null,
        messageRouter: this.messageRouter,
        createExecutionTimeoutBudget: () =>
          this.createControlPlaneTimeoutBudget(
            this.tablePartitionProvisioningTimeoutMs,
          ),
        estimateSplitAdmissionBytes: (partitionInfo, tableInfo) =>
          this.estimateSplitAdmissionBytes(partitionInfo, tableInfo),
        waitForTablePartitionMetadata: (
          tableId,
          partitionId,
          timeoutBudget,
        ) =>
          this.waitForTablePartitionMetadata(
            tableId,
            partitionId,
            timeoutBudget,
          ),
        probeInitialTablePartitionProvisioning: (context) =>
          this.probeInitialTablePartitionProvisioning(context),
        provisionInitialTablePartition: (context) =>
          this.provisionInitialTablePartition(context),
        startSplitReplicationOnSourcePartition: (
          partitionId,
          tableId,
          tableName,
          transitionMetadata,
        ) => this.startSplitReplicationOnSourcePartition(
          partitionId,
          tableId,
          tableName,
          transitionMetadata,
        ),
        logger: this.logger,
        transactionCoordinator: this.transactionCoordinator,
      });

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

    // Wire query executor factory into lifecycle owner so service
    // replicas can query tables through the standard SQL path.
    this._wireQueryExecutorFactory(this.serviceRuntimeLifecycle);

    // Backward-compatible alias for callers/tests expecting transaction state map.
    this.activeTransactions = this.transactionCoordinator.transactionsBySession;
    this.transactionStateRecovered = false;
    this.transactionRecoveryReplayPromise = null;
    this.lastTransactionRecoveryReplayResult =
      createEmptyTransactionRecoveryReplaySummary();
    this.recoverDistributedTransactionStateFromCache();
    void this.resumeRecoveredDistributedTransactions();
    if (typeof this.transactionCoordinator.startRecoverySweep === 'function') {
      this.transactionCoordinator.startRecoverySweep();
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
    if (this.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway.setSystemTableCache(cache);
    }
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
    this.transactionStateRecovered = false;
    this.recoverDistributedTransactionStateFromCache();
    void this.resumeRecoveredDistributedTransactions();
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    this.messageRouter = router;
    this.queryExecutor.setMessageRouter(router);
    if (this.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway.setMessageRouter(router);
    }
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
      readinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
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
    if (this.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway.setCdcIntegrationService(service);
    }
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      if (!this.controlPlaneSystemTableGateway.cdcIntegrationService &&
          this.cdcIntegrationService) {
        this.controlPlaneSystemTableGateway
          .setCdcIntegrationService(this.cdcIntegrationService);
      }
      if (!this.controlPlaneSystemTableGateway.messageRouter &&
          this.messageRouter) {
        this.controlPlaneSystemTableGateway.setMessageRouter(this.messageRouter);
      }
      if (!this.controlPlaneSystemTableGateway.systemTableCache &&
          this.systemCache) {
        this.controlPlaneSystemTableGateway.setSystemTableCache(this.systemCache);
      }
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = new ControlPlaneSystemTableGateway({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      systemTableCache: this.systemCache,
    });
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
    if (!this.migrationPipeline &&
        this.migrationAutoWireEnabled &&
        this.migrationCoordinator) {
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
    if (this.transactionCoordinator &&
        typeof this.transactionCoordinator.stopRecoverySweep === 'function') {
      this.transactionCoordinator.stopRecoverySweep();
    }
    if (this.tableCreationService &&
        typeof this.tableCreationService.shutdown === 'function') {
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
    if (!lifecycle ||
        typeof lifecycle.setQueryExecutorFactory !== 'function') {
      return;
    }
    lifecycle.setQueryExecutorFactory(
      (serviceId) => async (sql, params) =>
        this.executeQuery(sql, params, {sessionId: serviceId}),
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
   * Request one managed split evaluation after successful non-system writes.
   * Uses manager-level debouncing and adds a per-table throttle to avoid
   * scheduling evaluations for every statement under sustained write load.
   * @param {string} tableName - Target table name.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} writeResult - Distributed write execution result.
   * @private
   */
  requestManagedSplitEvaluationForWrite(tableName, writePlan, writeResult) {
    const manager = this.partitionSplitMergeManager;
    if (!manager ||
        typeof manager.requestEvaluation !== 'function' ||
        !tableName ||
        this.isSystemTable(tableName) ||
        writeResult?.success !== true) {
      return;
    }

    const nowMs = Date.now();
    const lastRequestedAtMs =
      this.lastWriteSplitEvaluationByTable.get(tableName) || 0;
    if ((nowMs - lastRequestedAtMs) <
      WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS) {
      return;
    }
    this.lastWriteSplitEvaluationByTable.set(tableName, nowMs);

    const partitionIds = writePlan?.partitionStatements instanceof Map ?
      Array.from(writePlan.partitionStatements.keys()) :
      [];
    manager.requestEvaluation({
      reasonCode: 'write_activity',
      tableName,
      partitionIds,
    });
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
    const cancellationToken =
      options?.cancellationToken || null;
    cancellationToken?.throwIfCancelled?.();
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
    cancellationToken?.throwIfCancelled?.();

    try {
      const ingressPressureDecision = this.evaluateQueryIngressPressure(ast, options);
      if (ingressPressureDecision &&
          (ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
            ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)) {
        this.logger.warn(
          ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
            QUERY_LOG_MSG.QUERY_ADMISSION_DEFERRED :
            QUERY_LOG_MSG.QUERY_ADMISSION_REJECTED,
          {
            statementType: ast.type,
            pressureAction: ingressPressureDecision.action,
            pressureReason: ingressPressureDecision.reason,
            retryAfterMs: ingressPressureDecision.retryAfterMs,
            workClass:
              options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
          },
        );
        return buildPressureAdmissionFailure(ingressPressureDecision, {
          error:
            ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ?
              'query_admission_deferred' :
              'query_admission_rejected',
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
        result = await this.executeInsert(
          ast,
          params,
          sessionId,
          options,
        );
        break;

      case QUERY_AST_TYPE.UPDATE:
        result = await this.executeUpdate(
          ast,
          params,
          sessionId,
          options,
        );
        break;

      case QUERY_AST_TYPE.DELETE:
        result = await this.executeDelete(
          ast,
          params,
          sessionId,
          options,
        );
        break;

      case QUERY_AST_TYPE.CREATE_TABLE:
        result = await this.executeCreateTable(ast, sessionId);
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
        writeStatement ? 'query-plane:write' : 'query-plane:read',
        `query-plane:statement:${String(astType || 'unknown').toLowerCase()}`,
      ],
      allowDegrade: false,
      allowDefer: options?.allowPressureDefer !== false,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  getPressureGovernor() {
    this.pressureGovernor = this.pressureGovernor || PressureGovernor.getShared({
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
   * Execute an ALTER TABLE statement through the migration pipeline.
   * @param {Object} ast - Parsed ALTER TABLE AST.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Migration initiation result.
   * @private
   */
  async executeAlterTable(ast, sessionId) {
    if (!this.migrationPipeline ||
        typeof this.migrationPipeline.handleAlterTable !== 'function') {
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
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      context?.targetNodeIds,
    );

    if (!partitionId) {
      throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED);
    }

    if (!this.rebalanceCoordinator ||
        typeof this.rebalanceCoordinator.createOperation !== 'function' ||
        typeof this.rebalanceCoordinator.executeOperation !== 'function') {
      throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED);
    }

    let targetReplicaCount = explicitTargetNodeIds.length > 0 ?
      Math.max(1, Math.min(requestedReplicaCount, explicitTargetNodeIds.length)) :
      Math.max(1, requestedReplicaCount);
    const hasExplicitMinimumRoutableReplicaCount =
      Number.isInteger(context?.minimumRoutableReplicaCount) &&
      context.minimumRoutableReplicaCount > 0;
    let minimumRoutableReplicaCount =
      this.resolveMinimumProvisioningReplicaCount(
        context?.minimumRoutableReplicaCount,
        targetReplicaCount,
      );
    let enforceEveryProvisioningOperation =
      minimumRoutableReplicaCount >= targetReplicaCount;
    const bootstrapTableMetadata =
      context?.tableMetadata && typeof context.tableMetadata === 'object' ?
        context.tableMetadata :
        null;
    const bootstrapPartitionMetadata =
      context?.partitionMetadata && typeof context.partitionMetadata === 'object' ?
        context.partitionMetadata :
        null;
    const timeoutBudget = context?.timeoutBudget || this.createControlPlaneTimeoutBudget(
      this.tablePartitionProvisioningTimeoutMs,
    );
    let provisionTargetDiagnostics = explicitTargetNodeIds.length === 0 ?
      this.resolveProvisionTargetNodeIdsWithDiagnostics(
        targetReplicaCount,
      ).diagnostics :
      null;
    let provisionTargetNodeIds =
      this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        targetReplicaCount,
        provisionTargetDiagnostics,
      );
    let admissionConvergence = null;

    const routableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId);
    if (routableNodeIds.length >= minimumRoutableReplicaCount) {
      return;
    }

    if (explicitTargetNodeIds.length === 0 &&
        enforceEveryProvisioningOperation &&
        (provisionTargetNodeIds.length < targetReplicaCount ||
          this.supportsProvisioningAdmissionPrecheck())) {
      const convergenceResult = await this.waitForProvisionTargetNodeIds({
        partitionId,
        requiredReplicaCount: targetReplicaCount,
        timeoutBudget,
        failOnTimeout: false,
        maxWaitMs: this.tablePartitionTargetNodeConvergenceTimeoutMs,
        explicitTargetNodeIds,
        allowAdaptiveAdmissionConvergenceWait:
          this.tablePartitionTargetNodeConvergenceTimeoutMs ===
          QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS,
      });
      admissionConvergence =
        convergenceResult.admissionProbe || null;
      provisionTargetDiagnostics =
        convergenceResult.diagnostics || provisionTargetDiagnostics;
      provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        targetReplicaCount,
        provisionTargetDiagnostics,
      );
      const maximumProvisionableReplicaCount = Number.isInteger(
        admissionConvergence?.maximumProvisionableReplicaCount,
      ) ?
        admissionConvergence.maximumProvisionableReplicaCount :
        provisionTargetNodeIds.length;
      const implicitFallbackMinimumReplicaCount =
        this.resolveImplicitProvisioningFallbackReplicaCount(
          targetReplicaCount,
          provisionTargetDiagnostics?.activeNodeRowCount,
        );

      if (convergenceResult.timedOut &&
          maximumProvisionableReplicaCount > 0 &&
          maximumProvisionableReplicaCount < targetReplicaCount &&
          maximumProvisionableReplicaCount >=
            implicitFallbackMinimumReplicaCount) {
        targetReplicaCount = Math.max(
          1,
          maximumProvisionableReplicaCount,
        );
        if (!hasExplicitMinimumRoutableReplicaCount) {
          minimumRoutableReplicaCount = Math.min(
            minimumRoutableReplicaCount,
            targetReplicaCount,
          );
        }
        enforceEveryProvisioningOperation =
          minimumRoutableReplicaCount >= targetReplicaCount;
        this.logger.warn(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
          {
            partitionId,
            requiredReplicaCount: convergenceResult.requiredReplicaCount,
            resolvedReplicaCount: targetReplicaCount,
            minimumRoutableReplicaCount,
            convergenceTimedOut: true,
            waitedMs: convergenceResult.waitedMs,
            diagnostics: convergenceResult.diagnostics,
            admissionConvergence,
          },
        );
      }
    }

    const routableNodeIdSet = new Set(routableNodeIds);
    const operationPlanningStartedAtMs = this.nowFn();
    const plannedOperations = [];
    const createdPlanningOperations = [];
    const rejectedTargetNodePlans = [];
    const requiredNewReplicaCount = Math.max(
      0,
      targetReplicaCount - routableNodeIdSet.size,
    );

    const candidateTargetNodeIds = [];
    const seenCandidateTargetNodeIds = new Set();
    for (const targetNodeId of provisionTargetNodeIds) {
      if (routableNodeIdSet.has(targetNodeId) ||
          seenCandidateTargetNodeIds.has(targetNodeId)) {
        continue;
      }
      seenCandidateTargetNodeIds.add(targetNodeId);
      candidateTargetNodeIds.push(targetNodeId);
    }

    const supportsAdmissionPrecheck =
      typeof this.rebalanceCoordinator.checkProvisioningAdmission ===
      'function';
    const admittedTargetNodeIds = [];
    const precheckedTargetNodeIds = new Set();
    if (supportsAdmissionPrecheck &&
        admissionConvergence &&
        Array.isArray(admissionConvergence.candidateTargetNodeIds) &&
        Array.isArray(admissionConvergence.admittedTargetNodeIds) &&
        Array.isArray(admissionConvergence.rejectedTargetNodePlans)) {
      for (const targetNodeId of admissionConvergence.candidateTargetNodeIds) {
        precheckedTargetNodeIds.add(String(targetNodeId || ''));
      }
      admittedTargetNodeIds.push(
        ...admissionConvergence.admittedTargetNodeIds.filter((targetNodeId) =>
          typeof targetNodeId === 'string' && targetNodeId.length > 0,
        ),
      );
      rejectedTargetNodePlans.push(
        ...admissionConvergence.rejectedTargetNodePlans,
      );
    }
    for (const targetNodeId of candidateTargetNodeIds) {
      if (precheckedTargetNodeIds.has(targetNodeId)) {
        continue;
      }
      if (!supportsAdmissionPrecheck) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      let admissionDecision = null;
      try {
        admissionDecision =
          await this.rebalanceCoordinator.checkProvisioningAdmission({
            type: OperationType.ADD,
            partitionId,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId,
            nodeId: targetNodeId,
          });
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        admissionDecision = {
          allowed: false,
          admissionResult: error.admissionResult || null,
          error,
        };
      }

      if (admissionDecision?.allowed === true) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      const rejectionError = admissionDecision?.error &&
        typeof admissionDecision.error === 'object' ?
        admissionDecision.error :
        (() => {
          const fallbackError = new Error(
            `Provisioning admission denied on ${targetNodeId}`,
          );
          fallbackError.admissionResult =
            admissionDecision?.admissionResult || null;
          return fallbackError;
        })();
      const rejection = this.createProvisioningTargetRejection(
        targetNodeId,
        rejectionError,
      );
      rejectedTargetNodePlans.push(rejection);
      this.logProvisioningTargetRejection(
        partitionId,
        targetNodeId,
        rejection,
      );
    }

    const maximumPrecheckedProvisionableReplicaCount =
      routableNodeIdSet.size + admittedTargetNodeIds.length;
    if (supportsAdmissionPrecheck &&
        maximumPrecheckedProvisionableReplicaCount <
          minimumRoutableReplicaCount) {
      this.throwProvisioningInsufficientTargets({
        partitionId,
        targetReplicaCount,
        minimumRoutableReplicaCount,
        candidateTargetNodeIds: provisionTargetNodeIds,
        existingRoutableNodeIds: [...routableNodeIdSet],
        plannedTargetNodeIds: admittedTargetNodeIds,
        rejectedTargetNodePlans,
        maximumProvisionableReplicaCount:
          maximumPrecheckedProvisionableReplicaCount,
      });
    }

    for (const targetNodeId of admittedTargetNodeIds) {
      if (plannedOperations.length >= requiredNewReplicaCount) {
        break;
      }

      try {
        const operation = await this.rebalanceCoordinator.createOperation({
          type: OperationType.ADD,
          partitionId,
          entityType: SERVICE_TYPE.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          controlPlaneMutationWorkClass:
            CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
          // Initial partition provisioning executes these operations inline
          // below, so skip the redundant coordinator-created dispatch trigger.
          emitOperationCreated: false,
        });
        plannedOperations.push(operation);

        const operationCreatedAt = Number(operation?.createdAt);
        if (!Number.isFinite(operationCreatedAt) ||
            operationCreatedAt >= operationPlanningStartedAtMs - 1000) {
          createdPlanningOperations.push(operation);
        }
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        const rejection = this.createProvisioningTargetRejection(
          targetNodeId,
          error,
        );
        rejectedTargetNodePlans.push(rejection);
        this.logProvisioningTargetRejection(
          partitionId,
          targetNodeId,
          rejection,
        );
      }
    }

    const maximumProvisionableReplicaCount =
      routableNodeIdSet.size + plannedOperations.length;
    const implicitFallbackMinimumReplicaCount =
      this.resolveImplicitProvisioningFallbackReplicaCount(
        targetReplicaCount,
        provisionTargetDiagnostics?.activeNodeRowCount,
      );
    if (maximumProvisionableReplicaCount < minimumRoutableReplicaCount) {
      if (!hasExplicitMinimumRoutableReplicaCount &&
          maximumProvisionableReplicaCount > 0 &&
          maximumProvisionableReplicaCount >=
            implicitFallbackMinimumReplicaCount) {
        const previousTargetReplicaCount = targetReplicaCount;
        const previousMinimumRoutableReplicaCount =
          minimumRoutableReplicaCount;
        targetReplicaCount = Math.max(
          1,
          maximumProvisionableReplicaCount,
        );
        minimumRoutableReplicaCount = targetReplicaCount;
        enforceEveryProvisioningOperation =
          minimumRoutableReplicaCount >= targetReplicaCount;
        this.logger.warn(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
          {
            partitionId,
            requiredReplicaCount: previousTargetReplicaCount,
            resolvedReplicaCount: targetReplicaCount,
            minimumRoutableReplicaCount,
            previousMinimumRoutableReplicaCount,
            planningShortfall: true,
            existingRoutableNodeIds: [...routableNodeIdSet],
            plannedTargetNodeIds: plannedOperations.map((operation) =>
              operation?.targetNodeId || operation?.nodeId || null,
            ).filter((nodeId) =>
              typeof nodeId === 'string' && nodeId.length > 0,
            ),
            rejectedTargetNodePlans,
          },
        );
      } else {
      await this.abortProvisioningPlanningOperations(
        partitionId,
        createdPlanningOperations,
        QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH,
      );
      this.throwProvisioningInsufficientTargets({
        partitionId,
        targetReplicaCount,
        minimumRoutableReplicaCount,
        candidateTargetNodeIds: provisionTargetNodeIds,
        existingRoutableNodeIds: [...routableNodeIdSet],
        plannedTargetNodeIds: plannedOperations.map((operation) =>
          operation?.targetNodeId || operation?.nodeId || null,
        ).filter((nodeId) =>
          typeof nodeId === 'string' && nodeId.length > 0,
        ),
        rejectedTargetNodePlans,
        maximumProvisionableReplicaCount,
      });
      }
    }

    const bootstrapTopology = this.buildInitialPartitionBootstrapTopology(
      partitionId,
      plannedOperations,
    );
    const bootstrapLeaderNodeId =
      this.resolveInitialPartitionBootstrapLeaderNodeId(
        partitionId,
        plannedOperations,
      );
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      partitionId,
      targetReplicaCount,
      minimumRoutableReplicaCount,
      enforceEveryProvisioningOperation,
      candidateTargetNodeCount: provisionTargetNodeIds.length,
      rejectedTargetNodeCount: rejectedTargetNodePlans.length,
      plannedOperationCount: plannedOperations.length,
      phase: 'dispatch_operations',
      remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
        now: this.nowFn,
      }),
    });

    const metadataWaitReplicaIds = [];
    for (const operation of plannedOperations) {
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      if (bootstrapTableMetadata) {
        operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
          bootstrapTableMetadata;
      }
      if (bootstrapPartitionMetadata) {
        operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
          bootstrapPartitionMetadata;
      }
      const executionResult =
        typeof this.rebalanceCoordinator.dispatchOperation === 'function' ?
          await this.rebalanceCoordinator.dispatchOperation(operation) :
          await this.rebalanceCoordinator.executeOperation(operation);

      if (executionResult && executionResult.success === false &&
          executionResult.skipped !== true) {
        if (enforceEveryProvisioningOperation) {
          throw new Error(
            executionResult.error ||
            QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED,
          );
        }
        continue;
      }

      const replicaId = operation?.replicaId || operation?.replica_id || null;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        metadataWaitReplicaIds.push(replicaId);
      }
    }

    const uniqueMetadataWaitReplicaIds = [...new Set(metadataWaitReplicaIds)];
    if (uniqueMetadataWaitReplicaIds.length > 0) {
      if (enforceEveryProvisioningOperation) {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: 'wait_replica_metadata',
          replicaIds: uniqueMetadataWaitReplicaIds,
          remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
            now: this.nowFn,
          }),
        });
        await Promise.all(
          uniqueMetadataWaitReplicaIds.map((replicaId) =>
            this.waitForPartitionServiceMetadata(
              replicaId,
              timeoutBudget,
            ),
          ),
        );
      } else {
        this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
          partitionId,
          phase: 'wait_minimum_replica_metadata',
          replicaIds: uniqueMetadataWaitReplicaIds,
          minimumRoutableReplicaCount,
          remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, {
            now: this.nowFn,
          }),
        });
        await this.waitForMinimumRoutableReplicaMetadata(
          partitionId,
          uniqueMetadataWaitReplicaIds,
          minimumRoutableReplicaCount,
          timeoutBudget,
        );
      }
    }

    await this.waitForRoutablePartitionServiceCount(
      partitionId,
      minimumRoutableReplicaCount,
      timeoutBudget,
    );
    await this.waitForPartitionLeaderService(
      partitionId,
      timeoutBudget,
      {
        partitionMetadata: bootstrapPartitionMetadata,
        bootstrapLeaderNodeId,
      },
    );
  }

  /**
   * Return true when one create-operation error was denied by admission.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isProvisioningAdmissionDeniedError(error) {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const admissionResult = error.admissionResult;
    if (!admissionResult || typeof admissionResult !== 'object') {
      return false;
    }
    if (admissionResult.allowed === true) {
      return false;
    }
    return true;
  }

  /**
   * Normalize one list of admission reason entries to reason-code strings.
   * @param {Array<*>} reasonEntries
   * @return {string[]}
   * @private
   */
  normalizeProvisioningReasonCodes(reasonEntries) {
    if (!Array.isArray(reasonEntries)) {
      return [];
    }
    const reasonCodes = [];
    const seenReasonCodes = new Set();
    for (const reasonEntry of reasonEntries) {
      const normalizedReason = String(
        reasonEntry?.code ||
          reasonEntry?.reason ||
          reasonEntry ||
          '',
      );
      if (!normalizedReason || seenReasonCodes.has(normalizedReason)) {
        continue;
      }
      seenReasonCodes.add(normalizedReason);
      reasonCodes.push(normalizedReason);
      if (reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }
    return reasonCodes;
  }

  /**
   * Build one structured provisioning rejection payload.
   * @param {string} targetNodeId
   * @param {Error} error
   * @return {Object}
   * @private
   */
  createProvisioningTargetRejection(targetNodeId, error) {
    const admissionResult = error?.admissionResult || null;
    const ineligibleNode = admissionResult?.ineligibleNodes?.[0] || null;
    const blockingReasons = this.normalizeProvisioningReasonCodes(
      admissionResult?.blockingReasons,
    );
    const reasonCodes = this.normalizeProvisioningReasonCodes(
      ineligibleNode?.reasonCodes,
    );
    return {
      targetNodeId,
      decisionType: admissionResult?.decisionType || null,
      blockingReasons,
      reasonCodes,
      nodeSummary: ineligibleNode?.nodeSummary || null,
      readinessSnapshot: admissionResult?.readinessSnapshots?.[targetNodeId] ||
        null,
      message: error?.message || null,
    };
  }

  /**
   * Emit one structured target-rejection warning entry.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} rejection
   * @return {void}
   * @private
   */
  logProvisioningTargetRejection(partitionId, targetNodeId, rejection) {
    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_REJECTED, {
      partitionId,
      targetNodeId,
      decisionType: rejection?.decisionType || null,
      blockingReasons: Array.isArray(rejection?.blockingReasons) ?
        rejection.blockingReasons :
        [],
      reasonCodes: Array.isArray(rejection?.reasonCodes) ?
        rejection.reasonCodes :
        [],
      nodeSummary: rejection?.nodeSummary || null,
      readinessSnapshot: rejection?.readinessSnapshot || null,
      message: rejection?.message || null,
    });
  }

  /**
   * Summarize rejected target nodes for compact error messages.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {string}
   * @private
   */
  summarizeProvisioningTargetRejections(rejectedTargetNodePlans) {
    if (!Array.isArray(rejectedTargetNodePlans) ||
        rejectedTargetNodePlans.length === 0) {
      return PROVISIONING_REJECTION_SUMMARY_NONE;
    }

    const summaryEntries = [];
    for (const rejection of rejectedTargetNodePlans) {
      const targetNodeId = String(rejection?.targetNodeId || '');
      if (!targetNodeId) {
        continue;
      }
      const reasonCodes = [];
      for (const reasonCode of [
        ...(Array.isArray(rejection?.blockingReasons) ?
          rejection.blockingReasons :
          []),
        ...(Array.isArray(rejection?.reasonCodes) ?
          rejection.reasonCodes :
          []),
      ]) {
        const normalizedReasonCode = String(reasonCode || '');
        if (!normalizedReasonCode ||
            reasonCodes.includes(normalizedReasonCode)) {
          continue;
        }
        reasonCodes.push(normalizedReasonCode);
        if (reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
          break;
        }
      }
      const reasonSummary = reasonCodes.length > 0 ?
        reasonCodes.join(',') :
        PROVISIONING_REJECTION_REASON_UNKNOWN;
      summaryEntries.push(`${targetNodeId}:${reasonSummary}`);
      if (summaryEntries.length >= PROVISIONING_REJECTION_DETAIL_LIMIT) {
        break;
      }
    }

    return summaryEntries.length > 0 ?
      summaryEntries.join('; ') :
      PROVISIONING_REJECTION_SUMMARY_NONE;
  }

  /**
   * Throw one canonical insufficient-targets provisioning error.
   * @param {Object} details
   * @return {never}
   * @private
   */
  throwProvisioningInsufficientTargets(details) {
    const rejectionSummary =
      this.summarizeProvisioningTargetRejections(
        details?.rejectedTargetNodePlans,
      );
    this.logger.error(
      QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS,
      {
        partitionId: details?.partitionId || null,
        targetReplicaCount: details?.targetReplicaCount || null,
        minimumRoutableReplicaCount:
          details?.minimumRoutableReplicaCount || null,
        candidateTargetNodeIds: Array.isArray(details?.candidateTargetNodeIds) ?
          details.candidateTargetNodeIds :
          [],
        existingRoutableNodeIds: Array.isArray(details?.existingRoutableNodeIds) ?
          details.existingRoutableNodeIds :
          [],
        plannedTargetNodeIds: Array.isArray(details?.plannedTargetNodeIds) ?
          details.plannedTargetNodeIds :
          [],
        rejectedTargets: Array.isArray(details?.rejectedTargetNodePlans) ?
          details.rejectedTargetNodePlans :
          [],
        rejectionSummary,
      },
    );
    throw new Error(
      QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX +
        String(details?.partitionId || '') +
        `: required=${details?.minimumRoutableReplicaCount || 0}, ` +
        `provisionable=${details?.maximumProvisionableReplicaCount || 0}, ` +
        `target=${details?.targetReplicaCount || 0}, ` +
        `rejected=${rejectionSummary}`,
    );
  }

  /**
   * Mark provisional planning operations as failed before dispatch.
   * @param {string} partitionId
   * @param {Object[]} operations
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async abortProvisioningPlanningOperations(partitionId, operations, reason) {
    if (!Array.isArray(operations) || operations.length === 0) {
      return;
    }
    if (!this.rebalanceCoordinator ||
        typeof this.rebalanceCoordinator.failOperation !== 'function') {
      return;
    }

    this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_PENDING, {
      partitionId,
      operationCount: operations.length,
      reason,
    });

    for (const operation of operations) {
      if (!operation || typeof operation !== 'object') {
        continue;
      }
      try {
        await this.rebalanceCoordinator.failOperation(
          operation,
          reason,
          {logLevel: 'warn'},
        );
      } catch (error) {
        this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_FAILED, {
          partitionId,
          operationId: operation?.operationId || null,
          error: error?.message || String(error),
        });
      }
    }
  }

  /**
   * Return true when the coordinator can probe provisioning admission
   * without creating replica_operations rows.
   * @return {boolean}
   * @private
   */
  supportsProvisioningAdmissionPrecheck() {
    return !!this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.checkProvisioningAdmission ===
        'function';
  }

  /**
   * Probe provisioning admission for one candidate target cohort.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {string[]} options.targetNodeIds
   * @return {Promise<Object>}
   * @private
   */
  async probeProvisioningTargetAdmission(options = {}) {
    const partitionId = String(options.partitionId || '');
    const targetNodeIds = this.normalizeTargetNodeIds(
      options.targetNodeIds,
    );
    const existingRoutableNodeIds =
      this.getRoutablePartitionServiceNodeIds(partitionId);
    const routableNodeIdSet = new Set(existingRoutableNodeIds);
    const candidateTargetNodeIds = [];

    for (const targetNodeId of targetNodeIds) {
      if (!routableNodeIdSet.has(targetNodeId)) {
        candidateTargetNodeIds.push(targetNodeId);
      }
    }

    if (!this.supportsProvisioningAdmissionPrecheck()) {
      return {
        existingRoutableNodeIds,
        candidateTargetNodeIds,
        admittedTargetNodeIds: [...candidateTargetNodeIds],
        rejectedTargetNodePlans: [],
        maximumProvisionableReplicaCount:
          existingRoutableNodeIds.length +
          candidateTargetNodeIds.length,
      };
    }

    const admittedTargetNodeIds = [];
    const rejectedTargetNodePlans = [];
    for (const targetNodeId of candidateTargetNodeIds) {
      let admissionDecision = null;
      try {
        admissionDecision =
          await this.rebalanceCoordinator.checkProvisioningAdmission({
            type: OperationType.ADD,
            partitionId,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: partitionId,
            nodeId: targetNodeId,
          });
      } catch (error) {
        if (!this.isProvisioningAdmissionDeniedError(error)) {
          throw error;
        }
        admissionDecision = {
          allowed: false,
          admissionResult: error.admissionResult || null,
          error,
        };
      }

      if (admissionDecision?.allowed === true) {
        admittedTargetNodeIds.push(targetNodeId);
        continue;
      }

      const rejectionError = admissionDecision?.error &&
        typeof admissionDecision.error === 'object' ?
        admissionDecision.error :
        (() => {
          const fallbackError = new Error(
            `Provisioning admission denied on ${targetNodeId}`,
          );
          fallbackError.admissionResult =
            admissionDecision?.admissionResult || null;
          return fallbackError;
        })();
      rejectedTargetNodePlans.push(
        this.createProvisioningTargetRejection(
          targetNodeId,
          rejectionError,
        ),
      );
    }

    return {
      existingRoutableNodeIds,
      candidateTargetNodeIds,
      admittedTargetNodeIds,
      rejectedTargetNodePlans,
      maximumProvisionableReplicaCount:
        existingRoutableNodeIds.length +
        admittedTargetNodeIds.length,
    };
  }

  /**
   * Probe one child partition bootstrap cohort before split metadata is
   * inserted so managed split can defer instead of creating metadata-only
   * child partitions.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async probeInitialTablePartitionProvisioning(options = {}) {
    return this.probeProvisioningTargetAdmission(options);
  }

  /**
   * Return active, non-transitioning partitions eligible for split evaluation.
   * @return {Array<Object>} Partition metadata rows.
   */
  listManagedSplitPartitions() {
    if (!this.systemCache || typeof this.systemCache.getAll !== 'function') {
      return [];
    }

    const tables = this.systemCache.getAll(TABLES.TABLES) || [];
    const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
    const activeVersionByTableId = new Map();
    const blockedTableIds = new Set();
    const deferredTableIds = new Set();

    for (const table of tables) {
      const tableId = table.table_id || table.tableId;
      if (!tableId) {
        continue;
      }
      const transition = this.parsePartitionTransition(table);
      if (transition &&
          !RETRYABLE_PARTITION_TRANSITION_STATES.has(
            String(transition.state || ''),
          )) {
        blockedTableIds.add(tableId);
        continue;
      }
      if (transition && !this.isManagedSplitRetryDue(transition)) {
        deferredTableIds.add(tableId);
      }
      activeVersionByTableId.set(
        tableId,
        this.resolveActivePartitionVersion(table),
      );
    }

    return partitions.filter((partition) => {
      const tableId = partition.table_id || partition.tableId;
      if (!tableId ||
          blockedTableIds.has(tableId) ||
          deferredTableIds.has(tableId)) {
        return false;
      }
      if (!this.isLocalManagedSplitLeader(partition)) {
        return false;
      }
      return this.isPartitionVisibleForRouting(
        partition,
        activeVersionByTableId.get(tableId) || DEFAULT_PARTITION_VERSION,
      );
    });
  }

  /**
   * Resolve whether a retryable split transition is eligible to run now.
   * Missing retry metadata remains backward-compatible and is treated as due.
   * @param {Object|null} transition
   * @return {boolean}
   * @private
   */
  isManagedSplitRetryDue(transition) {
    const retryMetadata = transition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ];
    const nextAttemptAt = retryMetadata?.nextAttemptAt || null;
    if (!nextAttemptAt) {
      return true;
    }
    const nextAttemptAtMs = Date.parse(nextAttemptAt);
    if (!Number.isFinite(nextAttemptAtMs)) {
      return true;
    }
    return nextAttemptAtMs <= this.nowFn();
  }

  /**
   * Execute one managed split for a source partition.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional workflow execution hints.
   * @return {Promise<Object>} Split orchestration result.
   */
  async executeManagedSplit(partitionId, executionOptions = {}) {
    if (!this.managedSplitWorkflow ||
        typeof this.managedSplitWorkflow.execute !== 'function') {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }
    return this.managedSplitWorkflow.execute(partitionId, executionOptions);
  }

  /**
   * Build one managed split plan using the shared split manager median logic.
   * @param {Object} partitionInfo - Source partition row.
   * @param {string} tableName - Logical table name.
   * @param {string} tableId - Table ID.
   * @param {string} primaryKeyColumn - Partition key column.
   * @return {Promise<Object>} Split plan.
   * @private
   */
  async buildManagedSplitPlan(
    partitionInfo,
    tableName,
    tableId,
    primaryKeyColumn,
  ) {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.splitPartition !== 'function') {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }

    return manager.splitPartition({
      partitionId: partitionInfo.partition_id || partitionInfo.partitionId,
      tableName,
      tableId,
      primaryKeyColumn,
      partitionService: {
        executeQuery: async (sql, params = []) => {
          const result = await this.queryExecutor.executeOnPartition(
            partitionInfo.partition_id || partitionInfo.partitionId,
            sql,
            params,
            true,
            true,
            false,
          );
          return {
            rows: result.rows || [],
          };
        },
        getKeyRange: () => ({
          start:
            partitionInfo.partition_key_start ?? partitionInfo.partitionKeyStart,
          end:
            partitionInfo.partition_key_end ?? partitionInfo.partitionKeyEnd,
        }),
      },
    });
  }

  /**
   * Ask the source partition leader to start snapshot backfill + CDC mirroring.
   * @param {string} partitionId - Source partition ID.
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {Object} transitionMetadata - Split transition metadata.
   * @return {Promise<void>}
   * @private
   */
  async startSplitReplicationOnSourcePartition(
    partitionId,
    tableId,
    tableName,
    transitionMetadata,
  ) {
    const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
    if (!serviceInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }

    const response = await this.messageRouter.deliver(serviceInfo.address, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
      partitionId,
      tableId,
      tableName,
      transitionMetadata,
    });

    if (!response?.acknowledged || response?.success === false) {
      throw new Error(
        response?.error || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
      );
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
  async waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget = null) {
    const hasTableAndPartitionMetadata = () => {
      const hasPartitionRecord = this.queryExecutor &&
        typeof this.queryExecutor.hasPartitionRecord === 'function' ?
        this.queryExecutor.hasPartitionRecord(partitionId) :
        false;
      const hasTableRecord = tableId ? this.hasTableMetadata(tableId) : true;
      return hasPartitionRecord && hasTableRecord;
    };
    if (hasTableAndPartitionMetadata()) {
      return;
    }

    const usesCacheRepairWaits = this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' &&
      this.systemCache &&
      typeof this.systemCache.onCacheChange === 'function';
    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: usesCacheRepairWaits ?
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS :
        this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation: 'table_partition_metadata_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId,
    });
    const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, {
      now: this.nowFn,
    });

    if (usesCacheRepairWaits) {
      const waits = [
        this.cdcIntegrationService.waitForCacheUpdate(
          TABLES.PARTITIONS,
          partitionId,
          true,
          {
            fallbackPhase: 'steady_state',
            timeoutMs: waitBudgetMs,
          },
        ),
      ];
      if (tableId) {
        waits.push(
          this.cdcIntegrationService.waitForCacheUpdate(
            TABLES.TABLES,
            tableId,
            true,
            {
              fallbackPhase: 'steady_state',
              timeoutMs: waitBudgetMs,
            },
          ),
        );
      }
      await Promise.all(waits);
      return;
    }

    await this.waitForCondition(
      hasTableAndPartitionMetadata,
      waitBudgetMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation: 'table_partition_metadata_wait',
      },
    );
  }

  /**
   * Wait for at least one routable service row for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionService(partitionId, timeoutBudget = null) {
    await this.waitForRoutablePartitionServiceCount(
      partitionId,
      1,
      timeoutBudget,
    );
  }

  /**
   * Wait for one partition service row to become visible in local cache.
   * Uses CDC authoritative repair when available.
   * @param {string} replicaId - Partition service replica ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionServiceMetadata(replicaId, timeoutBudget = null) {
    const conditionFn = () => this.hasServiceMetadata(replicaId);
    if (conditionFn()) {
      return;
    }

    const usesCacheRepairWaits = this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' &&
      this.systemCache &&
      typeof this.systemCache.onCacheChange === 'function';
    const nestedOperation = 'partition_service_metadata_wait';
    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: usesCacheRepairWaits ?
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS :
        this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation,
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX +
        replicaId,
    });
    const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, {
      now: this.nowFn,
    });

    if (usesCacheRepairWaits) {
      await this.cdcIntegrationService.waitForCacheUpdate(
        TABLES.SERVICES,
        replicaId,
        true,
        {
          fallbackPhase: 'steady_state',
          timeoutMs: waitBudgetMs,
        },
      );
      if (this.hasServiceMetadata(replicaId)) {
        return;
      }
    }

    await this.waitForCondition(
      conditionFn,
      waitBudgetMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX + replicaId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation,
      },
    );
  }

  /**
   * Best-effort metadata hydration for split quorum waits.
   * @param {string} partitionId - Partition ID.
   * @param {string[]} replicaIds - Candidate replica IDs.
   * @param {number} minimumRoutableReplicaCount - Required routable cohort.
   * @param {Object|null} timeoutBudget - Shared timeout budget.
   * @return {Promise<void>}
   * @private
   */
  async waitForMinimumRoutableReplicaMetadata(
    partitionId,
    replicaIds,
    minimumRoutableReplicaCount,
    timeoutBudget = null,
  ) {
    const uniqueReplicaIds = [...new Set(
      (Array.isArray(replicaIds) ? replicaIds : [])
        .filter((replicaId) =>
          typeof replicaId === 'string' && replicaId.length > 0,
        ),
    )];
    if (uniqueReplicaIds.length === 0) {
      return;
    }

    for (const replicaId of uniqueReplicaIds) {
      if (this.getRoutablePartitionServiceNodeIds(partitionId).length >=
        minimumRoutableReplicaCount) {
        return;
      }
      try {
        await this.waitForPartitionServiceMetadata(
          replicaId,
          timeoutBudget,
        );
      } catch (_error) {
        // Best-effort hydration: aggregate routable-count wait is authoritative.
      }
    }
  }

  /**
   * Wait for minimum routable partition service replica count.
   * @param {string} partitionId - Partition ID.
   * @param {number} minimumCount - Minimum routable replicas.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionServiceCount(
    partitionId,
    minimumCount,
    timeoutBudget = null,
  ) {
    const requiredCount = Number.isInteger(minimumCount) &&
      minimumCount > 0 ?
      minimumCount :
      1;
    const hasRequiredRoutableCount = () =>
      this.getRoutablePartitionServiceNodeIds(partitionId).length >=
        requiredCount;
    const checkRoutableCountWithRepair = async () => {
      if (hasRequiredRoutableCount()) {
        return true;
      }
      return await this.maybeAwaitPartitionRoutingRepair(partitionId) &&
        hasRequiredRoutableCount();
    };
    if (await checkRoutableCountWithRepair()) {
      return;
    }

    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
      nestedOperation: 'partition_routing_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId,
    });
    await this.waitForCondition(
      checkRoutableCountWithRepair,
      getRemainingBudgetMs(effectiveBudget, {now: this.nowFn}),
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: 'partition_routing_wait',
      },
    );
  }

  /**
   * Await one canonical routing-owner repair when stale readiness evidence
   * filters all active partition services locally.
   * @param {string} partitionId
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitPartitionRoutingRepair(partitionId) {
    if (!partitionId ||
        !this.queryExecutor ||
        typeof this.queryExecutor.getPartitionRoutingSnapshot !== 'function' ||
        typeof this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair !==
          'function') {
      return false;
    }

    let routingSnapshot = null;
    try {
      routingSnapshot = this.queryExecutor.getPartitionRoutingSnapshot(
        partitionId,
      );
    } catch (_error) {
      return false;
    }

    try {
      return await this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair(
        routingSnapshot,
      );
    } catch (_error) {
      return false;
    }
  }

  /**
   * Wait for one active leader service row to become visible for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaderService(
    partitionId,
    timeoutBudget = null,
    options = {},
  ) {
    const hasLeaderRoute = () => {
      this.maybeInstallBootstrapLeaderOverlay(partitionId, options);
      if (!this.queryExecutor ||
          typeof this.queryExecutor.findPartitionLeaderAddress !== 'function') {
        return false;
      }
      const address = this.queryExecutor.findPartitionLeaderAddress(partitionId);
      return typeof address === 'string' && address.length > 0;
    };
    if (hasLeaderRoute()) {
      return;
    }

    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
      nestedOperation: 'partition_leader_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId,
    });
    await this.waitForCondition(
      hasLeaderRoute,
      getRemainingBudgetMs(effectiveBudget, {now: this.nowFn}),
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: 'partition_leader_wait',
      },
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
   * Check whether one partition service row is available in local cache.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row exists in cache.
   * @private
   */
  hasServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.has === 'function') {
      if (this.systemCache.has(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.get === 'function') {
      if (this.systemCache.get(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === 'function') {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) =>
          row.service_id === replicaId ||
          row.replica_id === replicaId,
      );
      if (Array.isArray(matches) && matches.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check whether one partition service row is available and routable.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row is routable in local cache.
   * @private
   */
  hasRoutableServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) {
      return false;
    }

    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') {
        return false;
      }
      if (this.queryExecutor &&
          typeof this.queryExecutor.isRoutablePartitionService ===
            'function') {
        return this.queryExecutor.isRoutablePartitionService(service);
      }
      return false;
    };
    const matchesReplicaId = (row) => row?.service_id === replicaId ||
      row?.replica_id === replicaId;

    if (typeof this.systemCache.get === 'function') {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (isRoutableService(row)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === 'function') {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => matchesReplicaId(row) && isRoutableService(row),
      );
      return Array.isArray(matches) && matches.length > 0;
    }

    if (typeof this.systemCache.getAll === 'function') {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      if (!Array.isArray(rows)) {
        return false;
      }
      return rows.some((row) => matchesReplicaId(row) && isRoutableService(row));
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
   * Compose an optional caller-supplied routing overlay with the local
   * bootstrap overlay used to bridge cache publication gaps after partition
   * creation.
   * @param {Object|null} primaryOverlay
   * @param {Object|null} secondaryOverlay
   * @return {Object|null}
   * @private
   */
  composeRoutingMetadataOverlay(primaryOverlay, secondaryOverlay) {
    if (!primaryOverlay && !secondaryOverlay) {
      return null;
    }
    if (!primaryOverlay) {
      return secondaryOverlay;
    }
    if (!secondaryOverlay) {
      return primaryOverlay;
    }

    const mergeServices = (partitionId) => {
      const mergedServices = [];
      const seenServiceKeys = new Set();
      for (const overlay of [primaryOverlay, secondaryOverlay]) {
        if (!overlay ||
            typeof overlay.getServicesForPartition !== 'function') {
          continue;
        }
        const services = overlay.getServicesForPartition(partitionId);
        if (!Array.isArray(services)) {
          continue;
        }
        for (const service of services) {
          const serviceKey =
            service?.service_id ||
            service?.replica_id ||
            service?.address ||
            null;
          if (typeof serviceKey !== 'string' || serviceKey.length === 0 ||
              seenServiceKeys.has(serviceKey)) {
            continue;
          }
          seenServiceKeys.add(serviceKey);
          mergedServices.push(service);
        }
      }
      return mergedServices;
    };

    return {
      getPartitionById: (partitionId) => {
        const primaryPartition =
          typeof primaryOverlay.getPartitionById === 'function' ?
            primaryOverlay.getPartitionById(partitionId) :
            null;
        if (primaryPartition) {
          return primaryPartition;
        }
        return typeof secondaryOverlay.getPartitionById === 'function' ?
          secondaryOverlay.getPartitionById(partitionId) :
          null;
      },
      getServicesForPartition: (partitionId) => mergeServices(partitionId),
    };
  }

  /**
   * Get current partition service rows from the local cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    if (!partitionId || !this.systemCache) {
      return [];
    }
    if (typeof this.systemCache.filter === 'function') {
      const rows = this.systemCache.filter(
        TABLES.SERVICES,
        (service) =>
          service?.partition_id === partitionId &&
          service?.service_type === SERVICE_TYPE.PARTITION,
      );
      return Array.isArray(rows) ? rows : [];
    }
    if (typeof this.systemCache.getAll === 'function') {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.filter((service) =>
        service?.partition_id === partitionId &&
        service?.service_type === SERVICE_TYPE.PARTITION,
      );
    }
    return [];
  }

  /**
   * Resolve the canonical partition row from cache only, without routing
   * overlay fallbacks.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getCachedPartitionRecord(partitionId) {
    if (!partitionId || !this.systemCache) {
      return null;
    }
    if (typeof this.systemCache.get === 'function') {
      const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (record) {
        return record;
      }
    }
    if (typeof this.systemCache.filter === 'function') {
      const records = this.systemCache.filter(
        TABLES.PARTITIONS,
        (partition) =>
          partition?.partition_id === partitionId ||
          partition?.partitionId === partitionId,
      );
      if (Array.isArray(records) && records.length > 0) {
        return records[0];
      }
    }
    if (typeof this.systemCache.getAll === 'function') {
      const records = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return records.find((partition) =>
        partition?.partition_id === partitionId ||
        partition?.partitionId === partitionId,
      ) || null;
    }
    return null;
  }

  /**
   * Resolve cache-backed routable partition services without overlay help.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedRoutablePartitionServiceRows(partitionId) {
    const serviceRows = this.getPartitionServiceRows(partitionId);
    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') {
        return false;
      }
      if (this.queryExecutor &&
          typeof this.queryExecutor.isRoutablePartitionService ===
            'function') {
        return this.queryExecutor.isRoutablePartitionService(service);
      }
      return false;
    };
    return serviceRows.filter((service) => isRoutableService(service));
  }

  /**
   * Install one short-lived overlay owner row when fresh partition services are
   * already visible but the canonical partition row is still missing or lacks a
   * leader_node_id.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  maybeInstallBootstrapLeaderOverlay(partitionId, options = {}) {
    if (!partitionId) {
      return false;
    }

    const cachedPartition = this.getCachedPartitionRecord(partitionId);
    const cachedLeaderNodeId =
      cachedPartition?.leader_node_id ||
      cachedPartition?.leaderNodeId ||
      null;
    if (typeof cachedLeaderNodeId === 'string' &&
        cachedLeaderNodeId.length > 0) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return false;
    }

    const candidateServiceRows = Array.isArray(options?.serviceRows) ?
      options.serviceRows :
      null;
    const routableServices = Array.isArray(candidateServiceRows) ?
      candidateServiceRows.filter((service) => {
        if (!service || typeof service !== 'object') {
          return false;
        }
        if (this.queryExecutor &&
            typeof this.queryExecutor.isRoutablePartitionService ===
              'function') {
          return this.queryExecutor.isRoutablePartitionService(service);
        }
        return false;
      }) :
      this.getCachedRoutablePartitionServiceRows(partitionId);
    if (routableServices.length === 0) {
      return false;
    }

    const leaderServices = routableServices.filter((service) =>
      String(service?.raft_role || '').toLowerCase() === 'leader',
    );
    const hintedLeaderNodeId = String(
      options?.bootstrapLeaderNodeId ||
      options?.partitionMetadata?.leader_node_id ||
      options?.partitionMetadata?.leaderNodeId ||
      '',
    );
    const chosenLeaderService = leaderServices.length === 1 ?
      leaderServices[0] :
      (routableServices.length === 1 ?
        routableServices[0] :
        (hintedLeaderNodeId.length > 0 ?
          (routableServices.find((service) => {
            const nodeId = service?.node_id || service?.nodeId || null;
            return nodeId === hintedLeaderNodeId;
          }) || null) :
          null));
    const leaderNodeId =
      chosenLeaderService?.node_id || chosenLeaderService?.nodeId || null;
    if (typeof leaderNodeId !== 'string' || leaderNodeId.length === 0) {
      return false;
    }

    const basePartition =
      cachedPartition ||
      (options?.partitionMetadata && typeof options.partitionMetadata ===
        'object' ?
        options.partitionMetadata :
        {partition_id: partitionId});
    const nowMs = this.nowFn();
    const overlayPartition = {
      ...basePartition,
      partition_id:
        basePartition?.partition_id ||
        basePartition?.partitionId ||
        partitionId,
      leader_node_id: leaderNodeId,
      created_at: Number.isFinite(
        basePartition?.created_at ?? basePartition?.createdAt,
      ) ?
        (basePartition?.created_at ?? basePartition?.createdAt) :
        nowMs,
      updated_at: Number.isFinite(
        basePartition?.updated_at ?? basePartition?.updatedAt,
      ) ?
        (basePartition?.updated_at ?? basePartition?.updatedAt) :
        nowMs,
    };

    this.bootstrapRoutingOverlayEntries.set(partitionId, {
      partition: overlayPartition,
      services: routableServices.map((service) => ({...service})),
      expiresAtMs: nowMs + this.tablePartitionProvisioningTimeoutMs,
    });
    return true;
  }

  /**
   * Seed short-lived bootstrap routing overlays from system-table snapshots.
   * This bridges restart-time cache gaps until canonical partition metadata
   * converges locally.
   * @param {Object|null} systemTableSnapshots
   * @return {number}
   */
  seedBootstrapRoutingOverlayFromSnapshots(systemTableSnapshots) {
    if (!systemTableSnapshots ||
        typeof systemTableSnapshots !== 'object') {
      return 0;
    }

    const partitionRows = Array.isArray(systemTableSnapshots[TABLES.PARTITIONS]) ?
      systemTableSnapshots[TABLES.PARTITIONS] :
      [];
    const serviceRows = Array.isArray(systemTableSnapshots[TABLES.SERVICES]) ?
      systemTableSnapshots[TABLES.SERVICES] :
      [];
    let seededCount = 0;

    for (const partitionRow of partitionRows) {
      const partitionId = String(
        partitionRow?.partition_id ||
        partitionRow?.partitionId ||
        '',
      );
      const tableRef = String(
        partitionRow?.table_name ||
        partitionRow?.tableName ||
        partitionRow?.table_id ||
        partitionRow?.tableId ||
        '',
      );
      if (partitionId.length === 0 ||
          tableRef.length === 0 ||
          !this.isSystemTable(tableRef)) {
        continue;
      }

      const partitionServiceRows = serviceRows.filter((serviceRow) => {
        if (!serviceRow || typeof serviceRow !== 'object') {
          return false;
        }
        return serviceRow.partition_id === partitionId &&
          serviceRow.service_type === SERVICE_TYPE.PARTITION;
      });
      if (this.maybeInstallBootstrapLeaderOverlay(partitionId, {
        partitionMetadata: partitionRow,
        serviceRows: partitionServiceRows,
      })) {
        seededCount += 1;
      }
    }

    return seededCount;
  }

  /**
   * Install a recovery routing overlay entry for a system table
   * partition. This bypasses the strict routability checks in
   * maybeInstallBootstrapLeaderOverlay because during cache
   * recovery after seed restart the cache is empty and no
   * services pass readiness evaluation. The overlay makes the
   * partition discoverable and provides candidate service
   * addresses so the query executor can attempt delivery.
   * @param {string} partitionId
   * @param {string} tableName
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  installRecoveryRoutingOverlayEntry(
    partitionId,
    tableName,
    serviceRows,
  ) {
    if (!partitionId || !tableName) {
      return false;
    }
    if (!Array.isArray(serviceRows) ||
        serviceRows.length === 0) {
      return false;
    }
    const cachedPartition =
      this.getCachedPartitionRecord(partitionId);
    const cachedLeaderNodeId =
      cachedPartition?.leader_node_id ||
      cachedPartition?.leaderNodeId ||
      null;
    if (typeof cachedLeaderNodeId === 'string' &&
        cachedLeaderNodeId.length > 0) {
      return false;
    }
    const nowMs = this.nowFn();
    const overlayPartition = {
      partition_id: partitionId,
      table_name: tableName,
      leader_node_id: serviceRows[0]?.node_id || null,
      created_at: nowMs,
      updated_at: nowMs,
    };
    this.bootstrapRoutingOverlayEntries.set(partitionId, {
      partition: overlayPartition,
      services: serviceRows.map((s) => ({...s})),
      expiresAtMs: nowMs +
        this.tablePartitionProvisioningTimeoutMs,
    });
    return true;
  }

  /**
   * Resolve one bootstrap overlay entry when still valid.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayEntry(partitionId) {
    const entry = this.bootstrapRoutingOverlayEntries.get(partitionId) || null;
    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= this.nowFn()) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return null;
    }

    const cachedPartition = this.getCachedPartitionRecord(partitionId);
    const cachedLeaderNodeId =
      cachedPartition?.leader_node_id ||
      cachedPartition?.leaderNodeId ||
      null;
    if (typeof cachedLeaderNodeId === 'string' &&
        cachedLeaderNodeId.length > 0) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return null;
    }

    return entry;
  }

  /**
   * Overlay partition owner row accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayPartition(partitionId) {
    return this.getBootstrapRoutingOverlayEntry(partitionId)?.partition || null;
  }

  /**
   * Overlay partition services accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayServices(partitionId) {
    const entry = this.getBootstrapRoutingOverlayEntry(partitionId);
    return Array.isArray(entry?.services) ? entry.services : [];
  }

  /**
   * Resolve fresh bootstrap overlay partitions for one table reference.
   * @param {string|null} tableRef
   * @param {number|null} activePartitionVersion
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayPartitionsForTable(
    tableRef,
    activePartitionVersion,
  ) {
    if (typeof tableRef !== 'string' || tableRef.length === 0) {
      return [];
    }

    const partitions = [];
    for (const partitionId of this.bootstrapRoutingOverlayEntries.keys()) {
      const entry = this.getBootstrapRoutingOverlayEntry(partitionId);
      const partition = entry?.partition || null;
      if (!this.partitionMatchesTableRef(partition, tableRef) ||
          !this.isPartitionVisibleForRouting(
            partition,
            activePartitionVersion,
          )) {
        continue;
      }
      partitions.push(partition);
    }
    return partitions;
  }

  /**
   * Resolve the minimum routable replica cohort required before provisioning
   * can continue.
   * @param {number|undefined|null} requestedMinimumReplicaCount
   * @param {number} targetReplicaCount
   * @return {number}
   * @private
   */
  resolveMinimumProvisioningReplicaCount(
    requestedMinimumReplicaCount,
    targetReplicaCount,
  ) {
    if (!Number.isInteger(requestedMinimumReplicaCount) ||
        requestedMinimumReplicaCount <= 0) {
      return targetReplicaCount;
    }

    return Math.max(
      1,
      Math.min(requestedMinimumReplicaCount, targetReplicaCount),
    );
  }

  /**
   * Preserve one quorum-sized floor for implicit RF3+ provisioning fallback.
   * Smaller cohorts still degrade to one replica so single-node bootstrap and
   * legacy RF2 owner paths remain backward-compatible.
   * @param {number} requestedReplicaCount
   * @param {number|undefined|null} visibleActiveNodeCount
   * @return {number}
   * @private
   */
  resolveImplicitProvisioningFallbackReplicaCount(
    requestedReplicaCount,
    visibleActiveNodeCount,
  ) {
    const normalizedReplicaCount = Number.isInteger(requestedReplicaCount) &&
      requestedReplicaCount > 0 ?
      requestedReplicaCount :
      1;
    const normalizedVisibleActiveNodeCount =
      Number.isInteger(visibleActiveNodeCount) &&
      visibleActiveNodeCount > 0 ?
        visibleActiveNodeCount :
        0;
    if (normalizedReplicaCount < 3 ||
        normalizedVisibleActiveNodeCount <= 1) {
      return 1;
    }
    return this.calculateQuorumReplicaCount(normalizedReplicaCount);
  }

  /**
   * Wait for the active-node cache to expose enough provisioning targets.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {number} options.requiredReplicaCount
   * @param {Object} options.timeoutBudget
   * @param {string[]} [options.explicitTargetNodeIds]
   * @param {number} [options.maxWaitMs]
   * @param {boolean} [options.failOnTimeout]
   * @return {Promise<Object>}
   * @private
   */
  async waitForProvisionTargetNodeIds(options = {}) {
    const requiredReplicaCount = Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
      options.requiredReplicaCount :
      1;
    const partitionId = String(options.partitionId || '');
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      options.explicitTargetNodeIds,
    );
    let resolution =
      this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
    let resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      requiredReplicaCount,
      resolution.diagnostics,
    );
    let lastDiagnostics = resolution.diagnostics;
    let lastAdmissionProbe = null;
    let timedOut = false;
    const failOnTimeout = options.failOnTimeout !== false;
    const allowAdaptiveAdmissionConvergenceWait =
      options.allowAdaptiveAdmissionConvergenceWait === true;
    const maxWaitMs = Number.isFinite(options.maxWaitMs) &&
      options.maxWaitMs > 0 ?
      Math.floor(options.maxWaitMs) :
      this.tablePartitionProvisioningTimeoutMs;
    const effectiveMaxWaitMs = allowAdaptiveAdmissionConvergenceWait &&
      explicitTargetNodeIds.length === 0 &&
      Number.isInteger(lastDiagnostics?.activeNodeRowCount) &&
      lastDiagnostics.activeNodeRowCount >= requiredReplicaCount ?
      Math.min(
        this.tablePartitionProvisioningTimeoutMs,
        Math.max(
          maxWaitMs,
          TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
        ),
      ) :
      maxWaitMs;
    const waitTimeoutMs = Math.max(
      this.tablePartitionProvisioningPollIntervalMs,
      Math.min(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs),
    );
    const refreshResolution = async () => {
      resolution =
        this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
      lastDiagnostics = resolution.diagnostics;
      resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        requiredReplicaCount,
        lastDiagnostics,
      );
      if (!partitionId || !this.supportsProvisioningAdmissionPrecheck()) {
        lastAdmissionProbe = null;
        return resolvedNodeIds.length >= requiredReplicaCount;
      }
      lastAdmissionProbe =
        await this.probeProvisioningTargetAdmission({
          partitionId,
          targetNodeIds: resolvedNodeIds,
        });
      return lastAdmissionProbe.maximumProvisionableReplicaCount >=
        requiredReplicaCount;
    };
    if (await refreshResolution()) {
      return {
        nodeIds: resolvedNodeIds,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
        timedOut,
        requiredReplicaCount,
        waitedMs: 0,
      };
    }

    const waitStartedAt = this.nowFn();
    try {
      await this.waitForCondition(
        refreshResolution,
        waitTimeoutMs,
        this.tablePartitionProvisioningPollIntervalMs,
        QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX +
          partitionId,
        {
          timeoutBudget: options.timeoutBudget || null,
          classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
          nestedOperation: TABLE_PARTITION_TARGET_NODE_WAIT,
        },
      );
    } catch (error) {
      timedOut = true;
      const timeoutLogPayload = {
        partitionId,
        requiredReplicaCount,
        maxWaitMs: waitTimeoutMs,
        requestedMaxWaitMs: maxWaitMs,
        allowAdaptiveAdmissionConvergenceWait,
        waitedMs: this.nowFn() - waitStartedAt,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
      };
      if (failOnTimeout) {
        this.logger.error(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
          timeoutLogPayload,
        );
        throw error;
      }
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
        timeoutLogPayload,
      );
    }

    if (lastDiagnostics?.usedDegradedFallback && !timedOut) {
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
        {
          partitionId,
          requiredReplicaCount,
          diagnostics: lastDiagnostics,
        },
      );
    }

    return {
      nodeIds: resolvedNodeIds,
      diagnostics: lastDiagnostics,
      admissionProbe: lastAdmissionProbe,
      timedOut,
      requiredReplicaCount,
      waitedMs: this.nowFn() - waitStartedAt,
    };
  }

  /**
   * Build the explicit bootstrap cohort for initial table partition creation.
   * @param {string} partitionId - Partition ID.
   * @param {Array<Object>} plannedOperations - Planned ADD operations.
   * @return {Object} Replica IDs and peer addresses for the initial cohort.
   * @private
   */
  buildInitialPartitionBootstrapTopology(partitionId, plannedOperations) {
    const addressManager = AddressManager.getInstance();
    const replicaIds = [];
    const peerAddresses = [];
    const seenReplicaIds = new Set();
    const currentServices = this.getPartitionServiceRows(partitionId);

    for (const service of currentServices) {
      const serviceReplicaId = service?.service_id || service?.replica_id || null;
      const nodeId = service?.node_id || service?.nodeId || null;
      if (typeof serviceReplicaId !== 'string' || serviceReplicaId.length === 0) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      if (typeof service?.address === 'string' && service.address.length > 0) {
        peerAddresses.push(service.address);
        continue;
      }
      if (typeof nodeId === 'string' && nodeId.length > 0) {
        peerAddresses.push(
          addressManager.format(
            nodeId,
            ENTITY_TYPE.PARTITION,
            serviceReplicaId,
          ),
        );
      }
    }

    for (const operation of plannedOperations) {
      const replicaId = operation?.replicaId || null;
      const nodeId = operation?.targetNodeId || operation?.nodeId || null;
      if (typeof replicaId !== 'string' || replicaId.length === 0) {
        continue;
      }
      if (!seenReplicaIds.has(replicaId)) {
        seenReplicaIds.add(replicaId);
        replicaIds.push(replicaId);
      }
      if (typeof nodeId === 'string' && nodeId.length > 0) {
        peerAddresses.push(
          addressManager.format(
            nodeId,
            ENTITY_TYPE.PARTITION,
            replicaId,
          ),
        );
      }
    }

    return {
      replicaIds,
      peerAddresses: [...new Set(peerAddresses)],
    };
  }

  /**
   * Resolve the provisional bootstrap leader node for a freshly-created
   * partition before canonical leader metadata converges.
   * Prefer explicit leader service metadata, then the `-r1` replica, then the
   * first known bootstrap cohort member.
   * @param {string} partitionId
   * @param {Array<Object>} plannedOperations
   * @return {string|null}
   * @private
   */
  resolveInitialPartitionBootstrapLeaderNodeId(
    partitionId,
    plannedOperations = [],
  ) {
    const currentServices = this.getPartitionServiceRows(partitionId);
    const currentLeaderService = currentServices.find((service) =>
      String(service?.raft_role || '').toLowerCase() === 'leader',
    );
    const currentLeaderNodeId =
      currentLeaderService?.node_id ||
      currentLeaderService?.nodeId ||
      null;
    if (typeof currentLeaderNodeId === 'string' &&
        currentLeaderNodeId.length > 0) {
      return currentLeaderNodeId;
    }

    const currentR1Service = currentServices.find((service) => {
      const replicaId = String(
        service?.service_id ||
        service?.replica_id ||
        '',
      );
      return /-r1$/.test(replicaId);
    });
    const currentR1NodeId =
      currentR1Service?.node_id ||
      currentR1Service?.nodeId ||
      null;
    if (typeof currentR1NodeId === 'string' &&
        currentR1NodeId.length > 0) {
      return currentR1NodeId;
    }

    const plannedR1Operation = plannedOperations.find((operation) => {
      const replicaId = String(operation?.replicaId || '');
      return /-r1$/.test(replicaId);
    }) || null;
    const plannedR1NodeId =
      plannedR1Operation?.targetNodeId ||
      plannedR1Operation?.nodeId ||
      null;
    if (typeof plannedR1NodeId === 'string' &&
        plannedR1NodeId.length > 0) {
      return plannedR1NodeId;
    }

    const firstCurrentNodeId = currentServices.find((service) => {
      const nodeId = service?.node_id || service?.nodeId || null;
      return typeof nodeId === 'string' && nodeId.length > 0;
    })?.node_id ||
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    if (typeof firstCurrentNodeId === 'string' &&
        firstCurrentNodeId.length > 0) {
      return firstCurrentNodeId;
    }

    const firstPlannedNodeId =
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId ||
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    return typeof firstPlannedNodeId === 'string' &&
      firstPlannedNodeId.length > 0 ?
      firstPlannedNodeId :
      null;
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeIdsWithDiagnostics(
      requestedReplicaCount,
    ).nodeIds;
  }

  /**
   * Resolve active node IDs plus eligibility diagnostics.
   * @param {number} requestedReplicaCount
   * @return {{nodeIds: string[], diagnostics: Object}}
   * @private
   */
  resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount = Number.isInteger(requestedReplicaCount) &&
      requestedReplicaCount > 0 ?
      requestedReplicaCount :
      1;

    const diagnostics =
      this.resolveProvisionTargetNodeDiagnostics(desiredReplicaCount);
    let selectedNodeIds = diagnostics.selectedNodeIds;
    if (selectedNodeIds.length === 0) {
      selectedNodeIds = [this.nodeId];
    } else if (!selectedNodeIds.includes(this.nodeId)) {
      selectedNodeIds = [this.nodeId, ...selectedNodeIds];
    }

    const orderedNodeIds = this.orderProvisionTargetNodeIds(selectedNodeIds);
    const cappedNodeIds = orderedNodeIds.slice(
      0,
      Math.max(1, Math.min(desiredReplicaCount, orderedNodeIds.length)),
    );

    return {
      nodeIds: cappedNodeIds,
      diagnostics: {
        ...diagnostics,
        selectedNodeIds: orderedNodeIds,
        resolvedNodeIds: cappedNodeIds,
      },
    };
  }

  /**
   * Order node IDs lexicographically while keeping the local node first.
   * @param {Array<string>} nodeIds
   * @return {Array<string>}
   * @private
   */
  orderProvisionTargetNodeIds(nodeIds) {
    const uniqueNodeIds = [...new Set(nodeIds)];
    uniqueNodeIds.sort((left, right) => left.localeCompare(right));
    if (uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
      uniqueNodeIds.unshift(this.nodeId);
    }
    return uniqueNodeIds;
  }

  /**
   * Resolve provision-target diagnostics from local cache state.
   * @param {number} requestedReplicaCount
   * @return {Object}
   * @private
   */
  resolveProvisionTargetNodeDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount = Number.isInteger(requestedReplicaCount) &&
      requestedReplicaCount > 0 ?
      requestedReplicaCount :
      1;
    if (!this.systemCache) {
      return {
        requestedReplicaCount: desiredReplicaCount,
        activeNodeRowCount: 0,
        activeServiceRowCount: 0,
        strictNodeIds: [],
        degradedFallbackNodeIds: [],
        selectedNodeIds: [],
        usedDegradedFallback: false,
      };
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

    const activeNodeSeenById = new Set();
    const activeNodeReadinessById = new Map();
    const activeNodeConnectionById = new Map();
    for (const row of activeNodeRows) {
      const nodeId = row?.node_id || row?.nodeId || row?.id || null;
      if (typeof nodeId !== 'string' || nodeId.length === 0) {
        continue;
      }
      activeNodeSeenById.add(nodeId);
      const leaseExpiry = Number(
        row?.ready_lease_expires_at ?? row?.readyLeaseExpiresAt,
      );
      const hasReadyLease = Number.isFinite(leaseExpiry);
      const connectionState = String(
        row?.connection_state || row?.connectionState || '',
      ).toLowerCase();
      const hasConnectionState = connectionState.length > 0;
      const isConnectionReady = connectionState === CONNECTION_STATE_CONNECTED ||
        connectionState === CONNECTION_STATE_READY;
      const connectionEligible = !hasConnectionState || isConnectionReady;
      const isNodeReady = hasReadyLease ?
        isNodeRecordReady(row, {requireActiveStatus: true}) :
        true;
      activeNodeReadinessById.set(nodeId, isNodeReady);
      activeNodeConnectionById.set(nodeId, connectionEligible);
    }

    const strictNodeIds = this.orderProvisionTargetNodeIds(
      [...activeNodeReadinessById.entries()]
        .filter(([nodeId, ready]) =>
          ready === true && activeNodeConnectionById.get(nodeId) === true)
        .map(([nodeId]) => nodeId),
    );

    const strictServiceNodeIds = [];
    const degradedServiceNodeIds = [];
    const seenServiceNodeIds = new Set();
    for (const row of serviceRows) {
      const nodeId = row?.node_id || row?.nodeId || null;
      if (typeof nodeId !== 'string' || nodeId.length === 0 ||
          seenServiceNodeIds.has(nodeId)) {
        continue;
      }
      seenServiceNodeIds.add(nodeId);
      if (!activeNodeSeenById.has(nodeId)) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeReadinessById.get(nodeId) === true) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeConnectionById.get(nodeId) === true) {
        degradedServiceNodeIds.push(nodeId);
      }
    }

    const mergedStrictNodeIds = this.orderProvisionTargetNodeIds(
      [...strictNodeIds, ...strictServiceNodeIds],
    );
    const strictNodeIdSet = new Set(mergedStrictNodeIds);
    const degradedFallbackNodeIds = this.orderProvisionTargetNodeIds(
      degradedServiceNodeIds.filter((nodeId) => !strictNodeIdSet.has(nodeId)),
    );
    let selectedNodeIds = mergedStrictNodeIds;
    let usedDegradedFallback = false;
    if (selectedNodeIds.length < desiredReplicaCount &&
        degradedFallbackNodeIds.length > 0) {
      selectedNodeIds = this.orderProvisionTargetNodeIds(
        [...selectedNodeIds, ...degradedFallbackNodeIds],
      );
      usedDegradedFallback = true;
    }

    return {
      requestedReplicaCount: desiredReplicaCount,
      activeNodeRowCount: activeNodeRows.length,
      activeServiceRowCount: serviceRows.length,
      strictNodeIds: mergedStrictNodeIds,
      degradedFallbackNodeIds,
      selectedNodeIds,
      usedDegradedFallback,
    };
  }

  /**
   * Resolve target nodes for one provisioning context.
   * Explicit targets override readiness-discovered nodes.
   * @param {string[]|undefined|null} explicitTargetNodeIds
   * @param {number} requestedReplicaCount
   * @param {Object|null} [provisionTargetDiagnostics]
   * @return {Array<string>}
   * @private
   */
  resolveProvisionTargetNodeIdsForContext(
    explicitTargetNodeIds,
    requestedReplicaCount,
    provisionTargetDiagnostics = null,
  ) {
    const explicitTargets = this.normalizeTargetNodeIds(explicitTargetNodeIds);
    if (explicitTargets.length === 0) {
      const diagnostics =
        provisionTargetDiagnostics &&
        typeof provisionTargetDiagnostics === 'object' ?
          provisionTargetDiagnostics :
          this.resolveProvisionTargetNodeIdsWithDiagnostics(
            requestedReplicaCount,
          ).diagnostics;
      const selectedNodeIds = Array.isArray(diagnostics?.selectedNodeIds) ?
        diagnostics.selectedNodeIds :
        [];
      if (selectedNodeIds.length > 0) {
        return selectedNodeIds;
      }
      return this.resolveProvisionTargetNodeIds(requestedReplicaCount);
    }

    return explicitTargets;
  }

  /**
   * Normalize one node-id list to unique non-empty string IDs.
   * @param {Array<string>|undefined|null} targetNodeIds
   * @return {Array<string>}
   * @private
   */
  normalizeTargetNodeIds(targetNodeIds) {
    if (!Array.isArray(targetNodeIds)) {
      return [];
    }

    const normalizedNodeIds = [];
    const seenNodeIds = new Set();
    for (const nodeId of targetNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (normalizedNodeId.length === 0 ||
          seenNodeIds.has(normalizedNodeId)) {
        continue;
      }
      seenNodeIds.add(normalizedNodeId);
      normalizedNodeIds.push(normalizedNodeId);
    }

    return normalizedNodeIds;
  }

  /**
   * Capture the canonical topology snapshot for one managed split attempt.
   * The workflow reuses this persisted context for admission and child
   * provisioning instead of re-resolving targets mid-attempt.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  captureManagedSplitTopologySnapshot(options = {}) {
    const requiredReplicaCount = Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const provisionTargetDiagnostics = this.resolveProvisionTargetNodeDiagnostics(
      requiredReplicaCount,
    );
    return {
      ...(options.baseSnapshot || {}),
      capturedAt: new Date(this.nowFn()).toISOString(),
      sourceLeaderNodeId:
        options.partitionInfo?.leader_node_id ||
        options.partitionInfo?.leaderNodeId ||
        null,
      activePartitionVersion:
        options.tableInfo?.active_partition_version ||
        options.tableInfo?.activePartitionVersion ||
        null,
      targetPartitionVersion: options.targetVersion,
      requiredReplicaCount,
      sourceRoutableNodeIds: this.normalizeTargetNodeIds(
        options.sourceRoutableNodeIds,
      ),
      discoveredTargetNodeIds: this.normalizeTargetNodeIds(
        options.discoveredTargetNodeIds,
      ),
      candidateTargetNodeIds: this.normalizeTargetNodeIds(
        options.candidateTargetNodeIds,
      ),
      provisionTargetDiagnostics,
    };
  }

  /**
   * Estimate bytes for split admission using the canonical storage
   * accounting model when it is available.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  estimateSplitAdmissionBytes(partitionInfo) {
    const sizeBytes = Number(
      partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
    );
    const normalizedSizeBytes = Number.isFinite(sizeBytes) && sizeBytes > 0 ?
      sizeBytes :
      0;
    const accountingService =
      this.rebalanceCoordinator?.storageAccountingService || null;

    if (accountingService &&
        typeof accountingService.estimateReplicaBytes === 'function') {
      const splitAmplificationFactor =
        ConfigurationManager.getInstance().get(
          STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
        ) || STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR;
      return accountingService.estimateReplicaBytes({
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes: normalizedSizeBytes,
        amplificationFactor: splitAmplificationFactor,
      });
    }

    return Math.max(1, Math.ceil(normalizedSizeBytes));
  }

  /**
   * Calculate the minimum majority-sized cohort required for a routable Raft
   * partition during split bootstrap.
   * @param {number} replicaCount
   * @return {number}
   * @private
   */
  calculateQuorumReplicaCount(replicaCount) {
    const normalizedReplicaCount = Number.isInteger(replicaCount) &&
      replicaCount > 0 ?
      replicaCount :
      1;
    return Math.floor(normalizedReplicaCount / 2) + 1;
  }

  /**
   * Get active node IDs from local system cache.
   * Prefers strict readiness and uses degraded service-backed fallback only
   * when strict candidates are insufficient for the requested cohort size.
   * @param {number} requestedReplicaCount
   * @return {Array<string>}
   * @private
   */
  getActiveNodeIdsFromCache(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeDiagnostics(
      requestedReplicaCount,
    ).selectedNodeIds;
  }

  /**
   * Create one control-plane timeout budget.
   * @param {number} configuredBudgetMs
   * @return {Object}
   * @private
   */
  createControlPlaneTimeoutBudget(configuredBudgetMs) {
    return this.controlPlaneTimeoutPolicy.createTopLevelBudget({
      configuredBudgetMs,
    });
  }

  /**
   * Allocate one nested timeout budget from the remaining deadline.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  allocateControlPlaneTimeoutBudget(options = {}) {
    return this.controlPlaneTimeoutPolicy.allocateOrThrow({
      timeoutBudget: options.timeoutBudget || null,
      requestedBudgetMs: options.requestedBudgetMs,
      minimumBudgetMs: options.minimumBudgetMs ||
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: options.classification,
      nestedOperation: options.nestedOperation,
      timeoutError: options.timeoutError,
    });
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
  async waitForCondition(
    predicate,
    timeoutMs,
    intervalMs,
    timeoutError,
    timeoutOptions = {},
  ) {
    if (await predicate()) {
      return;
    }

    const effectiveBudget = timeoutOptions?.timeoutBudget ?
      this.allocateControlPlaneTimeoutBudget({
        timeoutBudget: timeoutOptions.timeoutBudget,
        requestedBudgetMs: timeoutMs,
        minimumBudgetMs: timeoutOptions.minimumBudgetMs ||
          TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        classification: timeoutOptions.classification ||
          TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
        nestedOperation: timeoutOptions.nestedOperation ||
          'wait_for_condition',
        timeoutError,
      }) :
      this.createControlPlaneTimeoutBudget(timeoutMs);

    while (true) {
      if (await predicate()) {
        return;
      }
      const remainingMs = getRemainingBudgetMs(effectiveBudget, {
        now: this.nowFn,
      });
      if (remainingMs <= 0) {
        break;
      }
      await this.sleep(Math.min(intervalMs, remainingMs));
    }

    if (await predicate()) {
      return;
    }
    throw createTimeoutBudgetError({
      message: timeoutError,
      budget: effectiveBudget,
      classification: timeoutOptions.classification ||
        TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED,
      nestedOperation: timeoutOptions.nestedOperation || 'wait_for_condition',
      now: this.nowFn,
    });
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
  async executeSelect(
    ast,
    params,
    sessionId,
    queryOptions = {},
    rawSql = null,
  ) {
    // FROM-less SELECT (e.g., SELECT 1, SELECT 1+1) — route to any
    // available partition and let SQLite evaluate the expression.
    if (!ast.from) {
      return this.executeFromlessSelect(ast, params, sessionId);
    }

    const tableName = ast.from.name;
    const tableInfo = this.getTableInfo(tableName);
    const dualWriteMode = this.isDualWriteModeActiveForTable(tableInfo);
    const authoritativeLocalResult =
      await this.tryExecuteAuthoritativeSystemTableSelect(
        tableName,
        ast,
        rawSql,
        params,
        queryOptions,
      );
    if (authoritativeLocalResult) {
      return authoritativeLocalResult;
    }

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
    const deliveryPriority = this.resolveRoutedDeliveryPriority(
      tableName,
      queryOptions.deliveryPriority,
    );
    const result = await this.queryExecutor.executeSelect(
      ast,
      partitionIds,
      params,
      {
        preferLeader,
        deliveryPriority,
        distributedPlan,
        routingReadinessDimension:
          queryOptions.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken:
          queryOptions.cancellationToken || null,
      },
    );
    const executionDurationMs = Date.now() - executionStartTimeMs;

    return {
      ...result,
      tableName,
      dualWriteMode,
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
   * Prefer node-local authoritative reads for single-table system-table
   * selects when a local partition replica is available. This avoids routing
   * hot control-plane reads back through the cluster under pressure.
   * @param {string} tableName
   * @param {Object} ast
   * @param {string|null} rawSql
   * @param {Array<*>} params
   * @param {Object} queryOptions
   * @return {Promise<Object|null>}
   * @private
   */
  async tryExecuteAuthoritativeSystemTableSelect(
    tableName,
    ast,
    rawSql,
    params,
    queryOptions = {},
  ) {
    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (!rawSql ||
        !this.isSystemTable(tableName) ||
        !authoritativeControlPlaneView ||
        (Array.isArray(ast?.joins) && ast.joins.length > 0)) {
      return null;
    }

    const localResult = await authoritativeControlPlaneView.readRows(
      tableName,
      rawSql,
      params,
      {
        allowSqlFallback: false,
        queryTimeoutMs: queryOptions?.timeoutMs,
      },
    );
    if (!localResult?.success) {
      return null;
    }

    const partitions = this.getTablePartitions(tableName)
      .map((partition) => partition?.partition_id)
      .filter((partitionId) => typeof partitionId === 'string');

    return {
      ...localResult,
      partitions,
      tableName,
      distributedPlan: null,
      distributedDiagnostics: null,
      distributedMetrics: {
        planningDurationMs: 0,
        executionDurationMs: 0,
        fanout: partitions.length,
        mergeDurationMs: 0,
      },
    };
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.nowFn,
    });
    return this.authoritativeControlPlaneView;
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
      false,
      false,
      {
        routingReadinessDimension:
          this.defaultRoutingReadinessDimension,
      },
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
          dualWriteMigration.migration_id || dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
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
    if (txState) {
      const payloadHash = this.createWriteOperationPayloadHash(
        writePlan,
        QUERY_AST_TYPE.UPDATE,
      );
      const enlistResult = await this.transactionCoordinator.enlistParticipants(
        sessionId,
        writePartitions,
      );
      if (!enlistResult.success) {
        return enlistResult;
      }
      await this.transactionCoordinator.recordWriteOperation(sessionId, {
        statementType: QUERY_AST_TYPE.UPDATE,
        operationId: writePlan.operationId,
        partitionIds: writePartitions,
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
          dualWriteMigration.migration_id || dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
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
    if (txState) {
      const payloadHash = this.createWriteOperationPayloadHash(
        writePlan,
        QUERY_AST_TYPE.DELETE,
      );
      const enlistResult = await this.transactionCoordinator.enlistParticipants(
        sessionId,
        writePartitions,
      );
      if (!enlistResult.success) {
        return enlistResult;
      }
      await this.transactionCoordinator.recordWriteOperation(sessionId, {
        statementType: QUERY_AST_TYPE.DELETE,
        operationId: writePlan.operationId,
        partitionIds: writePartitions,
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
          dualWriteMigration.migration_id || dualWriteMigration.migrationId ||
          null;
      }
      result = await this.distributedWriteCoordinator.executePlan(
        writePlan,
        params,
        writeExecutionOptions,
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
   * Replay recovered in-flight distributed transactions, if supported.
   * @return {Promise<Object>} Replay summary.
   * @private
   */
  resumeRecoveredDistributedTransactions() {
    if (typeof this.transactionCoordinator.resumeRecoveredTransactions !==
      'function') {
      const summary = createEmptyTransactionRecoveryReplaySummary();
      this.lastTransactionRecoveryReplayResult = summary;
      return Promise.resolve(summary);
    }
    if (this.transactionRecoveryReplayPromise) {
      return this.transactionRecoveryReplayPromise;
    }

    this.transactionRecoveryReplayPromise =
      this.transactionCoordinator.resumeRecoveredTransactions()
        .then((summary) => {
          const normalizedSummary = summary ||
            createEmptyTransactionRecoveryReplaySummary();
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
      participants: this.loadSystemTableRows(TABLES.SQL_TRANSACTION_PARTICIPANTS),
      writeOperations: this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS),
    };
  }

  /**
   * Persist one distributed transaction row.
   * @param {Object} record - Transaction persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionRow(record) {
    if (!this.cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      return;
    }
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTIONS,
      row: {
        transaction_id: record.transactionId,
        session_id: record.sessionId,
        status: record.status,
        transaction_epoch: record.transactionEpoch,
        timeout_deadline: record.timeoutDeadline,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    });
  }

  /**
   * Persist one distributed transaction participant row.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (!this.cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      return;
    }
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
      row: {
        participant_id: record.participantId,
        transaction_id: record.transactionId,
        partition_id: record.partitionId,
        status: record.status,
        last_error: record.lastError,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    });
  }

  /**
   * Persist one distributed write operation row.
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (!this.cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
      return;
    }
    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_WRITE_OPERATIONS,
      row: {
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
    }, {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    });
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
   * @param {Object} [options] - Delivery options.
   * @param {number} [options.transactionEpoch] - Snapshot epoch.
   * @return {Promise<void>}
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation, options = {}) {
    const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
    if (!serviceInfo) {
      throw new Error(`${QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND_PREFIX}${partitionId}`);
    }
    const payload = {
      type: QUERY_OPERATION.TRANSACTION,
      operation,
      sessionId,
    };
    if (Number.isFinite(options.transactionEpoch)) {
      payload.transactionEpoch = Math.floor(options.transactionEpoch);
    }
    const response = await this.messageRouter.deliver(serviceInfo.address, {
      ...payload,
    });
    if (!response.acknowledged || !response.success) {
      if (operation === QUERY_OPERATION.BEGIN) {
        throw new Error(response.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
      if (operation === QUERY_OPERATION.PREPARE) {
        throw new Error(response.error || QUERY_ERROR_MSG.PREPARE_FAILED);
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

    const tableInfo = this.getTableInfo(tableName);
    const tableId = tableInfo?.table_id || tableInfo?.tableId || null;
    const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);

    // Get partitions from system cache - the single source of truth
    if (typeof this.systemCache.filter === 'function') {
      const directMatches =
        this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
          this.partitionMatchesTableRef(partition, tableName),
        ) || [];
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(
        tableName,
        activePartitionVersion,
      );
      if (overlayDirectMatches.length > 0 || !tableId || tableId === tableName) {
        return overlayDirectMatches;
      }

      const tableIdMatches = this.systemCache.filter(TABLES.PARTITIONS, (partition) =>
        this.partitionMatchesTableRef(partition, tableId),
      ) || [];
      const visibleTableIdMatches = tableIdMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    if (typeof this.systemCache.getAll === 'function') {
      const all = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      const directMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableName),
      );
      const visibleDirectMatches = directMatches.filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (directMatches.length > 0) {
        return visibleDirectMatches;
      }
      const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(
        tableName,
        activePartitionVersion,
      );
      if (overlayDirectMatches.length > 0 || !tableId || tableId === tableName) {
        return overlayDirectMatches;
      }

      const visibleTableIdMatches = all.filter((partition) =>
        this.partitionMatchesTableRef(partition, tableId),
      ).filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );
      if (visibleTableIdMatches.length > 0) {
        return visibleTableIdMatches;
      }
      return this.getBootstrapRoutingOverlayPartitionsForTable(
        tableId,
        activePartitionVersion,
      );
    }

    throw new Error(`${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`);
  }

  /**
   * Determine whether one partition row belongs to a table reference.
   * @param {Object|null} partition
   * @param {string|null} tableRef
   * @return {boolean}
   * @private
   */
  partitionMatchesTableRef(partition, tableRef) {
    if (!partition || typeof partition !== 'object' ||
        typeof tableRef !== 'string' || tableRef.length === 0) {
      return false;
    }
    return partition.table_name === tableRef ||
      partition.tableName === tableRef ||
      partition.table_id === tableRef ||
      partition.tableId === tableRef;
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
   * Read schema-migration rows for one table from system cache.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object[]} Matching migration rows.
   * @private
   */
  getTableMigrationsFromCache(tableInfo) {
    if (!tableInfo || !this.systemCache) {
      return [];
    }

    const tableId = tableInfo.table_id || tableInfo.tableId || null;
    const tableName = tableInfo.table_name || tableInfo.tableName || null;
    const matchesTable = (row) => {
      const rowTableId = row?.table_id || row?.tableId || null;
      const rowTableName = row?.table_name || row?.tableName || null;
      return (tableId && rowTableId === tableId) ||
        (tableName && rowTableName === tableName);
    };

    if (typeof this.systemCache.filter === 'function') {
      return this.systemCache.filter(
        TABLES.SCHEMA_MIGRATIONS,
        matchesTable,
      ) || [];
    }

    if (typeof this.systemCache.getAll === 'function') {
      const rows = this.systemCache.getAll(TABLES.SCHEMA_MIGRATIONS) || [];
      return rows.filter(matchesTable);
    }

    return [];
  }

  /**
   * Resolve one active dual-write migration row for a table.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Active migration row.
   * @private
   */
  getActiveDualWriteMigration(tableInfo) {
    const rows = this.getTableMigrationsFromCache(tableInfo);
    for (const row of rows) {
      const status = String(
        row?.status ||
        row?.current_stage ||
        '',
      ).trim();
      if (DUAL_WRITE_ACTIVE_STATUSES.has(status)) {
        return row;
      }
    }
    return null;
  }

  /**
   * Resolve whether a table is currently in dual-write mode.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {boolean} True when dual-write migration is active.
   * @private
   */
  isDualWriteModeActiveForTable(tableInfo) {
    return this.getActiveDualWriteMigration(tableInfo) !== null;
  }

  /**
   * Resolve one partition metadata row by partition ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition metadata row.
   * @private
   */
  getPartitionInfo(partitionId) {
    if (!partitionId || !this.systemCache) {
      return null;
    }

    try {
      if (typeof this.systemCache.get === 'function') {
        const direct = this.systemCache.get(TABLES.PARTITIONS, partitionId);
        if (direct) {
          return direct;
        }
      }
      if (typeof this.systemCache.find === 'function') {
        const found = this.systemCache.find(TABLES.PARTITIONS, (partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        );
        if (found) {
          return found;
        }
      }
      if (typeof this.systemCache.getAll === 'function') {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return partitions.find((partition) =>
          partition.partition_id === partitionId ||
          partition.partitionId === partitionId,
        ) || null;
      }
    } catch (_cacheErr) {
      // Cache not available
    }

    return null;
  }

  /**
   * Determine whether the local node is the persisted leader for one partition.
   * @param {Object|null} partitionInfo - Partition metadata row.
   * @return {boolean} True when the local node owns split orchestration.
   * @private
   */
  isLocalManagedSplitLeader(partitionInfo) {
    if (!partitionInfo || !this.nodeId) {
      return false;
    }
    const leaderNodeId =
      partitionInfo.leader_node_id ?? partitionInfo.leaderNodeId ?? null;
    return Boolean(leaderNodeId) && leaderNodeId === this.nodeId;
  }

  /**
   * Parse partition transition metadata from a table row.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Parsed transition metadata.
   * @private
   */
  parsePartitionTransition(tableInfo) {
    if (!tableInfo) {
      return null;
    }

    const state = tableInfo.partition_transition_state ??
      tableInfo.partitionTransitionState ??
      null;
    const rawMetadata = tableInfo.partition_transition_metadata ??
      tableInfo.partitionTransitionMetadata ??
      null;
    if (!state || !rawMetadata) {
      return null;
    }

    try {
      const metadata = typeof rawMetadata === 'string' ?
        JSON.parse(rawMetadata) :
        rawMetadata;
      return metadata && typeof metadata === 'object' ?
        {
          state,
          metadata,
        } :
        null;
    } catch (_parseErr) {
      return null;
    }
  }

  /**
   * Add post-cutover mirror participants so writes keep the source
   * partition current while caches converge to the new partition set.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} ast - Statement AST.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object} The mutated write plan.
   * @private
   */
  addTransitionMirrorParticipants(writePlan, ast, tableInfo) {
    const transition = this.parsePartitionTransition(tableInfo);
    if (!transition ||
        transition.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      return writePlan;
    }

    const metadata = transition.metadata || {};
    const activeVersion = this.resolveActivePartitionVersion(tableInfo);
    const targetVersion = Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    );
    const sourcePartitionId =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
    if (!sourcePartitionId ||
        !Number.isInteger(targetVersion) ||
        targetVersion !== activeVersion) {
      return writePlan;
    }

    this.distributedWriteCoordinator.addMirrorParticipant(
      writePlan,
      sourcePartitionId,
      ast,
      {splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.TARGET},
    );
    return writePlan;
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {number} Active partition-set version.
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    const value = tableInfo?.active_partition_version ??
      tableInfo?.activePartitionVersion;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < DEFAULT_PARTITION_VERSION) {
      return DEFAULT_PARTITION_VERSION;
    }
    return parsed;
  }

  /**
   * Determine whether a partition row should participate in normal routing.
   * Hidden or non-normal child partitions remain invisible until cutover.
   * @param {Object} partition - Partition metadata row.
   * @param {number} activePartitionVersion - Active partition-set version.
   * @return {boolean} True when the partition is routable for table traffic.
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    const partitionVersion = Number(
      partition?.partition_version ?? partition?.partitionVersion,
    );
    const normalizedVersion = Number.isInteger(partitionVersion) &&
      partitionVersion >= DEFAULT_PARTITION_VERSION ?
      partitionVersion :
      DEFAULT_PARTITION_VERSION;
    if (normalizedVersion !== activePartitionVersion) {
      return false;
    }

    const state = String(
      partition?.state ?? ACTIVE_PARTITION_STATE,
    ).toUpperCase();
    return state === ACTIVE_PARTITION_STATE;
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
   * Resolve router delivery priority for one routed table operation.
   * System-table traffic defaults to the critical lane unless a caller
   * explicitly chooses a different priority.
   * @param {string|null} tableName
   * @param {string|undefined|null} deliveryPriority
   * @return {string|undefined}
   * @private
   */
  resolveRoutedDeliveryPriority(tableName, deliveryPriority) {
    if (typeof deliveryPriority === 'string' &&
        deliveryPriority.length > 0) {
      return deliveryPriority;
    }
    return this.isSystemTable(tableName) ? 'critical' : undefined;
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
