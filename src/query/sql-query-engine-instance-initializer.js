import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  ServicePartitionAccessMetrics,
} from './service-partition-access-metrics.js';
import {
  ServicePartitionAccessPublisher,
} from './service-partition-access-publisher.js';
import {ServicesOwner} from '../control-plane/owners/services-owner.js';
import {
  RuntimeReplicaStateProjectionOwner,
} from './runtime-replica-state-projection-owner.js';

const LOCAL_STR_SQL_CONTROL_PLANE = 'sql_control_plane';
const LOCAL_STR_FUNCTION = 'function';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  DistributedQueryPlanner,
  DistributedTransactionCoordinator,
  DistributedWriteCoordinator,
  ManagedSplitTopologyAdapter,
  ManagedSplitWorkflow,
  MigrationCoordinator,
  MigrationPipeline,
  PRESSURE_WORK_CLASS,
  PartitionCallbackDispatcher,
  PartitionResolver,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_OPERATION,
  QUERY_SUBSYSTEM,
  QueryExecutor,
  SQL_PARSE_CACHE,
  SqlParseCache,
  TableCreationService,
  TimeoutPolicy,
  createControlPlaneRuntimeBundle,
  createEmptyTransactionRecoveryReplaySummary,
} = SQL_QUERY_ENGINE_SHARED;

function createRuntimeReplicaStateProjectionOwner(engine, options) {
  if (options.runtimeReplicaStateProjectionOwner) {
    return options.runtimeReplicaStateProjectionOwner;
  }
  const servicesOwner =
    options.runtimeReplicaStateProjectionServicesOwner ||
    new ServicesOwner({
      controlPlaneSystemTableGateway:
        engine.controlPlaneSystemTableGateway,
      systemTableCache: engine.systemCache,
    });
  return new RuntimeReplicaStateProjectionOwner({
    hostNodeId: engine.nodeId,
    servicesOwner,
  });
}

function initializeSqlQueryEngineInstance(engine, options = {}) {
  engine.systemCache = options.systemCache || null;
  engine.messageRouter = options.messageRouter || null;
  engine.cdcIntegrationService = options.cdcIntegrationService || null;
  engine.runtimeAccessPolicyOwner = options.runtimeAccessPolicyOwner || null;
  engine.nodeId = options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE;
  engine.controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    createControlPlaneRuntimeBundle({
      nodeId: engine.nodeId,
      getSqlQueryEngine: () => engine,
      getCdcIntegrationService: () => engine.cdcIntegrationService,
      getSystemTableCache: () => engine.systemCache,
      getMessageRouter: () => engine.messageRouter,
      getControlPlaneReadinessService: () =>
        engine.controlPlaneReadinessService,
    }).controlPlaneSystemTableGateway;
  engine.rebalanceCoordinator = options.rebalanceCoordinator || null;
  engine.controlPlaneReadinessService =
    options.controlPlaneReadinessService ||
    engine.rebalanceCoordinator?.controlPlaneReadinessService ||
    null;
  engine.defaultRoutingReadinessDimension =
    options.defaultRoutingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  engine.routingMetadataOverlay = options.routingMetadataOverlay || null;
  engine.partitionServicesProvider =
    typeof options.partitionServicesProvider === LOCAL_STR_FUNCTION ?
      options.partitionServicesProvider :
      null;
  engine.authoritativeRoutingOverlayEntries = new Map();
  engine.bootstrapRoutingOverlayEntries = new Map();
  engine.localRuntimeRoutingOverlay = {
    getServicesForPartition: (partitionId) =>
      engine.getLocalRuntimeRoutingOverlayServices(partitionId),
  };
  engine.authoritativeRoutingOverlay = {
    getPartitionById: (partitionId) =>
      engine.getAuthoritativeRoutingOverlayPartition(partitionId),
    getServicesForPartition: (partitionId) =>
      engine.getAuthoritativeRoutingOverlayServices(partitionId),
    shouldMaskCacheServicesForPartition: (partitionId) =>
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId),
    refreshPartitionRouting: async (partitionId, overlayOptions = {}) =>
      engine.refreshAuthoritativeRoutingOverlay(partitionId, overlayOptions),
  };
  engine.lastWriteSplitEvaluationByTable = new Map();
  engine.bootstrapRoutingOverlay = {
    getPartitionById: (partitionId) =>
      engine.getBootstrapRoutingOverlayPartition(partitionId),
    getServicesForPartition: (partitionId) =>
      engine.getBootstrapRoutingOverlayServices(partitionId),
  };
  engine.nowFn = options.nowFn || (() => Date.now());
  engine.authoritativeControlPlaneView =
    options.authoritativeControlPlaneView || null;
  engine.controlPlaneTimeoutPolicy =
    options.controlPlaneTimeoutPolicy ||
    new TimeoutPolicy({
      operationName: LOCAL_STR_SQL_CONTROL_PLANE,
      now: engine.nowFn,
    });
  engine.tablePartitionProvisioningTimeoutMs =
    Number.isFinite(options.tablePartitionProvisioningTimeoutMs) &&
    options.tablePartitionProvisioningTimeoutMs > 0 ?
      Math.floor(options.tablePartitionProvisioningTimeoutMs) :
      QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS;
  engine.tablePartitionProvisioningPollIntervalMs =
    Number.isFinite(options.tablePartitionProvisioningPollIntervalMs) &&
    options.tablePartitionProvisioningPollIntervalMs > 0 ?
      Math.floor(options.tablePartitionProvisioningPollIntervalMs) :
      QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS;
  engine.tablePartitionTargetNodeConvergenceTimeoutMs =
    Number.isFinite(options.tablePartitionTargetNodeConvergenceTimeoutMs) &&
    options.tablePartitionTargetNodeConvergenceTimeoutMs > 0 ?
      Math.floor(options.tablePartitionTargetNodeConvergenceTimeoutMs) :
      QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS;

  engine.servicePartitionAccessMetrics = new ServicePartitionAccessMetrics();
  engine.servicePartitionAccessPublisher = new ServicePartitionAccessPublisher({
    nodeId: engine.nodeId,
    metrics: engine.servicePartitionAccessMetrics,
    getGateway: () => engine.controlPlaneSystemTableGateway,
    getLogger: () => engine.logger,
    now: engine.nowFn,
  });

  engine.partitionResolver = new PartitionResolver({
    systemCache: engine.systemCache,
  });
  engine.distributedQueryPlanner =
    options.distributedQueryPlanner ||
    new DistributedQueryPlanner({
      partitionResolver: engine.partitionResolver,
      getTablePartitions: (tableName) => engine.getTablePartitions(tableName),
      getTableInfo: (tableName) => engine.getTableInfo(tableName),
    });

  engine.queryExecutor = new QueryExecutor({
    messageRouter: engine.messageRouter,
    systemCache: engine.systemCache,
    bootstrapTopologySnapshotOwner:
      options.bootstrapTopologySnapshotOwner || null,
    controlPlaneReadinessService: engine.controlPlaneReadinessService,
    defaultRoutingReadinessDimension: engine.defaultRoutingReadinessDimension,
    nodeId: engine.nodeId,
    unrefRetryDelayTimers: options.unrefRetryDelayTimers === true,
  });
  engine.queryExecutor.setRoutingMetadataOverlay(
    engine.composeRoutingMetadataOverlay(
      engine.routingMetadataOverlay,
      engine.composeRoutingMetadataOverlay(
        engine.localRuntimeRoutingOverlay,
        engine.composeRoutingMetadataOverlay(
          engine.authoritativeRoutingOverlay,
          engine.bootstrapRoutingOverlay,
        ),
      ),
    ),
  );
  engine.distributedWriteCoordinator =
    options.distributedWriteCoordinator ||
    new DistributedWriteCoordinator({
      partitionResolver: engine.partitionResolver,
      queryExecutor: engine.queryExecutor,
      getTablePartitions: (tableName) => engine.getTablePartitions(tableName),
      getTableInfo: (tableName) => engine.getTableInfo(tableName),
    });
  engine.transactionCoordinator =
    options.transactionCoordinator ||
    new DistributedTransactionCoordinator({
      beginParticipant: async (sessionId, partitionId, transactionEpoch) =>
        engine.deliverTransactionOperation(
          sessionId,
          partitionId,
          QUERY_OPERATION.BEGIN,
          {transactionEpoch},
        ),
      prepareParticipant: async (sessionId, partitionId) =>
        engine.deliverTransactionOperation(
          sessionId,
          partitionId,
          QUERY_OPERATION.PREPARE,
        ),
      commitParticipant: async (sessionId, partitionId) =>
        engine.deliverTransactionOperation(
          sessionId,
          partitionId,
          QUERY_OPERATION.COMMIT,
        ),
      rollbackParticipant: async (sessionId, partitionId) =>
        engine.deliverTransactionOperation(
          sessionId,
          partitionId,
          QUERY_OPERATION.ROLLBACK,
        ),
      resolveParticipantCommitOutcome: async (
        sessionId,
        partitionId,
        transactionEpoch,
      ) => {
        const result = await engine.deliverTransactionOperation(
          sessionId,
          partitionId,
          QUERY_OPERATION.TRANSACTION_OUTCOME,
          {transactionEpoch},
        );
        return result.outcome;
      },
      persistTransaction: async (record) =>
        engine.persistDistributedTransactionRow(record),
      persistParticipant: async (record) =>
        engine.persistDistributedTransactionParticipantRow(record),
      persistWriteOperation: async (record) =>
        engine.persistDistributedWriteOperationRow({
          ...record,
          workClass: PRESSURE_WORK_CLASS.CRITICAL,
        }),
      epochSource: options.transactionEpochSource,
      loadRecoveryStateForSweep: async () =>
        engine.loadDistributedTransactionRecoveryState(),
    });
  engine.managedSplitWorkflow = options.managedSplitWorkflow || null;

  const tablePartitionProvisioner =
    typeof options.tablePartitionProvisioner === LOCAL_STR_FUNCTION ?
      options.tablePartitionProvisioner :
      engine.rebalanceCoordinator ?
        (context) => engine.provisionInitialTablePartition(context) :
        null;
  engine.partitionSplitMergeManager =
    options.partitionSplitMergeManager || null;
  engine.tableCreationService = new TableCreationService({
    systemCache: engine.systemCache,
    cdcIntegrationService: engine.cdcIntegrationService,
    controlPlaneSystemTableGateway: engine.controlPlaneSystemTableGateway,
    partitionSplitMergeManager: engine.partitionSplitMergeManager,
    calculateQuorumReplicaCount: (replicaCount) =>
      engine.calculateQuorumReplicaCount(replicaCount),
    partitionProvisioner: tablePartitionProvisioner,
  });

  engine.partitionCallbackDispatcher = new PartitionCallbackDispatcher({
    sqlParser: {parse: (sql) => engine.parse(sql)},
    partitionResolver: engine.partitionResolver,
    queryExecutor: engine.queryExecutor,
    getTablePartitions: (name) => engine.getTablePartitions(name),
    isSystemTable: (name) => engine.isSystemTable(name),
    resolveRoutedDeliveryPriority: (name) =>
      engine.resolveRoutedDeliveryPriority(name),
  });

  engine.parseCache = new SqlParseCache(SQL_PARSE_CACHE.DEFAULT_MAX_SIZE);

  engine.logger = engine.initLogger();
  engine.migrationAutoWireEnabled = options.migrationAutoWire !== false;
  engine.migrationCoordinator = options.migrationCoordinator || null;
  if (
    engine.migrationAutoWireEnabled &&
    !engine.migrationCoordinator &&
    engine.systemCache
  ) {
    engine.migrationCoordinator = new MigrationCoordinator({
      sqlCore: engine,
      systemTableCache: engine.systemCache,
      transactionCoordinator: engine.transactionCoordinator,
      logger: engine.logger,
      now: engine.nowFn,
    });
  }
  engine.migrationPipeline = options.migrationPipeline || null;
  if (
    engine.migrationAutoWireEnabled &&
    !engine.migrationPipeline &&
    engine.migrationCoordinator
  ) {
    engine.migrationPipeline = new MigrationPipeline({
      migrationCoordinator: engine.migrationCoordinator,
      logger: engine.logger,
    });
  }
  engine.managedSplitWorkflow =
    engine.managedSplitWorkflow ||
    new ManagedSplitWorkflow({
      nodeId: engine.nodeId,
      topologyAdapter: new ManagedSplitTopologyAdapter({
        sqlQueryEngine: engine,
      }),
    });

  const config = ConfigurationManager.getInstance();
  engine.queryTimeoutMs =
    config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
    QUERY_DEFAULTS.QUERY_TIMEOUT_MS;

  engine.runtimeDriverRegistry = options.runtimeDriverRegistry || null;
  engine.serviceRuntimeLifecycle = options.serviceRuntimeLifecycle || null;
  engine.runtimeReplicaStateProjectionOwner =
    createRuntimeReplicaStateProjectionOwner(engine, options);
  engine.debugSessionResolver = options.debugSessionResolver || null;
  engine.traceCollector = options.traceCollector || null;
  engine.wasmExecutor = options.wasmExecutor || null;

  engine._wireQueryExecutorFactory(engine.serviceRuntimeLifecycle);
  engine._wireStateProjectionWriter(engine.serviceRuntimeLifecycle);

  engine.activeTransactions = engine.transactionCoordinator.transactionsBySession;
  engine.transactionStateRecovered = false;
  engine.transactionRecoveryReplayPromise = null;
  engine.lastTransactionRecoveryReplayResult =
    createEmptyTransactionRecoveryReplaySummary();
  engine.distributedTransactionRecoveryActivated =
    options.autoStartDistributedTransactionRecovery !== false;
  if (engine.distributedTransactionRecoveryActivated) {
    void engine.activateDistributedTransactionRecovery();
  }
}

export {initializeSqlQueryEngineInstance};
