import {AdminWebSocketAPI} from './admin/admin-websocket-api.js';
import {ADMIN_DEFAULT} from './admin/admin-constants.js';
import {BootstrapReadinessState} from './bootstrap/bootstrap-readiness-state.js';
import {READINESS_EVENT} from
  './bootstrap/bootstrap-readiness-state-constants.js';
import {ResourceDiagnosticsSampler} from
  './diagnostics/resource-diagnostics-sampler.js';
import {createLiveQueryStartupWiring} from
  './live-query/live-query-startup-wiring.js';
import {wireMigrationWorkflowOwners} from './migration/migration-composition.js';
import {wireMigrationRecoveryOnLeaderElection} from
  './migration/migration-recovery-trigger.js';
import {createManagedSplitMetricsProvider} from
  './partition/managed-split-metrics-provider.js';
import {SPLIT_MERGE_EVENT} from './partition/partition-constants.js';
import {STABILIZATION_RESET_TRIGGER} from
  './rebalancer/rebalancer-constants.js';
import {assertCritical} from './utils/assert.js';
import {ModuleMirror} from './wasm-service/module-mirror.js';
import {WasmExecutor} from './wasm-service/wasm-executor.js';
import {
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_LOG_MSG,
} from './constants/entrypoint.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_1KAZK = 'startupRecoveryCoordinator';
const LOCAL_STR_11E2L = './query/sql-query-engine.js';
const LOCAL_STR_1SSS4 = './partition/partition-split-merge-manager.js';

// Default-off lever. When LAGRANGE_EARLY_ADMIN_SQL_ENGINE=true, a still-joining
// (or still-bootstrapping) node builds a cache-backed SQL engine for the EARLY
// admin runtime (the `onLocalAdminRuntimeReady` surface that currently comes up
// with `sqlQueryEngine: null`), so admin SQL reads answer from the node's
// hydrated cache instead of failing `QUERY_ENGINE_UNAVAILABLE` for the whole
// readiness budget. The early engine is provisional: the authoritative engine
// built after join/bootstrap replaces it on the admin runtime
// (attachSqlEngineToAdminRuntime), after which the early one is shut down.
const EARLY_ADMIN_SQL_ENGINE_FLAG = 'LAGRANGE_EARLY_ADMIN_SQL_ENGINE';

/**
 * Resolve the live control-plane readiness service from a startup owner.
 * @param {Object|null} owner
 * @return {Object|null}
 */
function resolveOwnerControlPlaneReadinessService(owner) {
  return owner?.controlPlaneReadinessService ||
    owner?.rebalanceCoordinator?.controlPlaneReadinessService ||
    null;
}

/**
 * Create runtime-owned wasm executor for SQL callback execution.
 * @return {WasmExecutor}
 */
function createSqlCallbackWasmExecutor() {
  return new WasmExecutor({
    moduleMirror: new ModuleMirror(),
  });
}

/**
 * Find a partition service by partition ID from the partitionServices map.
 * @param {Map} partitionServices
 * @param {string} partitionId
 * @return {Object|null}
 */
function resolvePartitionServiceByPartitionId(partitionServices, partitionId) {
  if (
    !partitionServices ||
    !partitionId ||
    typeof partitionServices.values !== LOCAL_STR_FUNCTION
  ) {
    return null;
  }
  for (const service of partitionServices.values()) {
    if (service && service.partitionId === partitionId) {
      return service;
    }
  }
  return null;
}

/**
 * Create a diagnostics provider for unified lifecycle owners.
 * @param {Object} owner
 * @return {Function}
 */
function createServiceDiagnosticsProvider(owner) {
  const resourceDiagnosticsSampler = new ResourceDiagnosticsSampler({
    nodeId: owner?.nodeId || null,
    owner,
  });

  return () => {
    const lifecycleManager = owner?.serviceLifecycleManager || null;
    const reconciler = owner?.serviceReconciler || null;

    const lifecycleDiagnostics = lifecycleManager?.getDiagnosticsReport ?
      lifecycleManager.getDiagnosticsReport() :
      null;
    const reconcilerDiagnostics = reconciler?.getDiagnosticsReport ?
      reconciler.getDiagnosticsReport() :
      null;
    const resourceDiagnostics = resourceDiagnosticsSampler.getReport();

    const cdcSubscriptionStatus =
      typeof owner?.getCdcSubscriptionStatus === 'function' ?
        owner.getCdcSubscriptionStatus() :
        null;

    if (
      !lifecycleDiagnostics &&
      !reconcilerDiagnostics &&
      !resourceDiagnostics &&
      !cdcSubscriptionStatus
    ) {
      return null;
    }

    return {
      lifecycle: lifecycleDiagnostics,
      reconciler: reconcilerDiagnostics,
      resources: resourceDiagnostics,
      cdcSubscriptionStatus,
    };
  };
}

/**
 * Create admin API and startup-owned live query wiring.
 * @param {Object} options
 * @return {{adminAPI: AdminWebSocketAPI, liveQueryWiring: Object}}
 */
function createAdminAPIWithLiveQuery(options) {
  const liveQueryWiring = createLiveQueryStartupWiring({
    nodeId: options.nodeId,
    systemTableCache: options.systemTableCache,
    sqlQueryEngine: options.sqlQueryEngine || null,
  });
  const liveQueryManager = assertCritical(
    liveQueryWiring.liveQueryManager,
    ENTRYPOINT_ERROR_MSG.LIVE_QUERY_MANAGER_REQUIRED,
  );

  const adminAPI = new AdminWebSocketAPI({
    nodeId: options.nodeId,
    systemTableCache: options.systemTableCache,
    cacheMutationTarget: options.cacheMutationTarget || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
    cdcIntegrationService: options.cdcIntegrationService || null,
    messageRouter: options.messageRouter || null,
    serviceDiagnosticsProvider: options.serviceDiagnosticsProvider || null,
    controlPlaneReadinessService:
      options.controlPlaneReadinessService || null,
    heartbeatService: options.heartbeatService || null,
    startupRecoveryCoordinator: options.startupRecoveryCoordinator || null,
    bootstrapReadinessState: options.bootstrapReadinessState || null,
    partitionServicesProvider:
      typeof options.partitionServicesProvider === 'function' ?
        options.partitionServicesProvider :
        null,
    liveQueryManager,
  });

  return {
    adminAPI,
    liveQueryWiring,
  };
}

/**
 * Wire readiness transition diagnostics for one startup branch.
 * @param {Object} readinessState
 * @param {Object} logger
 * @param {string} nodeId
 */
function wireReadinessStateDiagnostics(readinessState, logger, nodeId) {
  readinessState.on(READINESS_EVENT.TRANSITION, (transition) => {
    logger.info(ENTRYPOINT_LOG_MSG.READINESS_TRANSITION, {
      nodeId,
      previousState: transition.previousState,
      previousReady: transition.previousReady,
      state: transition.state,
      ready: transition.ready,
      reasons: transition.reasons,
      timestamp: transition.timestamp,
    });
  });
  readinessState.on(READINESS_EVENT.BLOCKED_DURATION, (event) => {
    logger.info(ENTRYPOINT_LOG_MSG.READINESS_BLOCKED_DURATION, {
      nodeId,
      reason: event.reason,
      durationMs: event.durationMs,
      totalDurationMs: event.totalDurationMs,
      timestamp: event.timestamp,
    });
  });
}

/**
 * Create a readiness owner with shared entrypoint diagnostics wiring.
 * @param {Object} logger
 * @param {string} nodeId
 * @return {BootstrapReadinessState}
 */
function createReadinessStateWithDiagnostics(logger, nodeId) {
  const readinessState = new BootstrapReadinessState();
  wireReadinessStateDiagnostics(readinessState, logger, nodeId);
  return readinessState;
}

/**
 * Emit one runtime handoff snapshot after bootstrap or join startup.
 * @param {Object} options
 */
function reportStartupRuntimeHandoff(options) {
  if (!options?.logger || typeof options.logger.info !== LOCAL_STR_FUNCTION) {
    return;
  }
  options.logger.info(ENTRYPOINT_LOG_MSG.STARTUP_RUNTIME_HANDOFF, {
    nodeId: options.nodeId,
    startupBranch: options.startupBranch,
    startupPhase:
      options.startupOwner?.phase ||
      options.bootstrapAPI?.bootstrapService?.phase ||
      null,
    bootstrapApiHasSqlQueryEngine:
      Boolean(options.bootstrapAPI?.sqlQueryEngine),
    bootstrapApiHasMessageRouter:
      Boolean(options.bootstrapAPI?.messageRouter),
    bootstrapApiHasStartupRecoveryCoordinator:
      Boolean(options.bootstrapAPI?.startupRecoveryCoordinator),
    adminRuntimeStarted: Boolean(options.adminRuntime?.adminAPI),
    adminPort: options.adminRuntime?.adminPort ?? null,
  });
}

/**
 * Hydrate runtime-owned service references into an initialized BootstrapAPI.
 * @param {Object} options
 */
function hydrateBootstrapApiRuntime(options) {
  options.bootstrapAPI.systemTableCache = options.systemTableCache;
  options.bootstrapAPI.messageGroupServices = options.messageGroupServices;
  options.bootstrapAPI.partitionServices = options.partitionServices;
  options.bootstrapAPI.replicaHandler = options.replicaHandler;
  options.bootstrapAPI.epochManager = options.epochManager;
  options.bootstrapAPI.messageRouter = options.messageRouter;
  if (Object.hasOwn(options, LOCAL_STR_1KAZK)) {
    options.bootstrapAPI.startupRecoveryCoordinator =
      options.startupRecoveryCoordinator || null;
  }
}

/**
 * Resolve read/write system cache handles from one message-group map.
 * @param {Map} messageGroupServices
 * @return {{systemTableCache: Object|null, cacheMutationTarget: Object|null}}
 */
function resolveSystemCacheHandles(messageGroupServices) {
  let systemTableCache = null;
  let cacheMutationTarget = null;
  if (
    !messageGroupServices ||
    typeof messageGroupServices.values !== LOCAL_STR_FUNCTION
  ) {
    return {systemTableCache, cacheMutationTarget};
  }

  for (const messageGroupService of messageGroupServices.values()) {
    if (messageGroupService.getReadOnlyCache) {
      systemTableCache = messageGroupService.getReadOnlyCache();
    } else if (messageGroupService.systemTableCache) {
      systemTableCache = messageGroupService.systemTableCache;
    }
    if (messageGroupService.getWritableCache) {
      cacheMutationTarget = messageGroupService.getWritableCache();
    } else if (messageGroupService.systemTableCache) {
      cacheMutationTarget = messageGroupService.systemTableCache;
    }
    break;
  }

  return {systemTableCache, cacheMutationTarget};
}

/**
 * Attach split-completion stabilization reset wiring for child partitions.
 * @param {Object} options
 */
function wireSplitCompletionStabilizationReset(options) {
  options.partitionSplitMergeManager.on(
    SPLIT_MERGE_EVENT.SPLIT_COMPLETED,
    (result) => {
      const childPartitionIds = [
        result?.leftPartition?.partitionId,
        result?.rightPartition?.partitionId,
      ].filter(Boolean);
      for (const childPartitionId of childPartitionIds) {
        const partitionService =
          resolvePartitionServiceByPartitionId(
            options.partitionServices,
            childPartitionId,
          );
        if (!partitionService?.rebalancer) {
          continue;
        }
        partitionService.rebalancer.recordStateChange(
          STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
        );
      }
    },
  );
}

/**
 * Create SQL query engine plus split manager composition.
 * @param {Object} options
 * @return {Promise<{sqlQueryEngine: Object|null, detachMigrationRecovery: Function}>}
 */
async function createSqlRuntimeComposition(options) {
  if (!options.messageRouter) {
    return {
      sqlQueryEngine: null,
      detachMigrationRecovery: () => {},
    };
  }

  const {SQLQueryEngine} = await import(LOCAL_STR_11E2L);
  const wasmExecutor = createSqlCallbackWasmExecutor();
  const sqlQueryEngine = new SQLQueryEngine({
    systemCache: options.systemTableCache,
    messageRouter: options.messageRouter,
    cdcIntegrationService: options.owner.cdcIntegrationService,
    nodeId: options.nodeId,
    rebalanceCoordinator: options.owner.rebalanceCoordinator,
    controlPlaneReadinessService:
      resolveOwnerControlPlaneReadinessService(options.owner),
    partitionServicesProvider: () => options.partitionServices,
    runtimeDriverRegistry: options.owner.runtimeDriverRegistry,
    serviceRuntimeLifecycle: options.owner.serviceRuntimeLifecycle,
    wasmExecutor,
    migrationAutoWire: false,
    autoStartDistributedTransactionRecovery: false,
  });

  wireMigrationWorkflowOwners({
    sqlCore: sqlQueryEngine,
    systemTableCache: options.systemTableCache,
    transactionCoordinator: sqlQueryEngine.transactionCoordinator,
    logger: options.logger,
    now: () => Date.now(),
  });

  const {PartitionSplitMergeManager} =
    await import(LOCAL_STR_1SSS4);
  const partitionSplitMergeManager = new PartitionSplitMergeManager({
    nodeId: options.nodeId,
    messageRouter: options.messageRouter,
    tablePolicyService: options.owner.tablePolicyService,
    listPartitions: () => sqlQueryEngine.listManagedSplitPartitions(),
    getPartitionMetrics: createManagedSplitMetricsProvider({
      partitionServices: options.partitionServices,
    }),
    executeSplitCandidate: (partitionId) =>
      sqlQueryEngine.executeManagedSplit(partitionId),
    storageAdmissionService:
      options.owner.rebalanceCoordinator?.storageAdmissionService ||
      null,
    storageAccountingService:
      options.owner.rebalanceCoordinator?.storageAccountingService ||
      null,
  });
  sqlQueryEngine.setPartitionSplitMergeManager(partitionSplitMergeManager);
  wireSplitCompletionStabilizationReset({
    partitionSplitMergeManager,
    partitionServices: options.partitionServices,
  });

  const detachMigrationRecovery = wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine,
    partitionServices: options.partitionServices,
    logger: options.logger,
  });

  return {
    sqlQueryEngine,
    detachMigrationRecovery,
  };
}

/**
 * Whether the early-admin SQL engine lever is enabled.
 * @return {boolean}
 */
function isEarlyAdminSqlEngineEnabled() {
  return process.env[EARLY_ADMIN_SQL_ENGINE_FLAG] === 'true';
}

/**
 * Build a provisional SQL engine for the EARLY admin runtime from the join/
 * bootstrap surface handed to `onLocalAdminRuntimeReady`. Returns null (no
 * engine) when the lever is off or the runtime cannot yet support an engine,
 * preserving the existing `sqlQueryEngine: null` behaviour exactly.
 *
 * The engine's inputs (messageRouter / systemTableCache / partitionServices /
 * owner sub-services) are the node's stable single instances, already wired by
 * `initializeJoinInfrastructure()` before this surface fires, so the engine
 * reads the same cache the rest of the runtime later observes. It is built with
 * the same inert flags as the authoritative path (no migration auto-wire, no
 * auto-started distributed-transaction recovery). Its only background work is
 * the per-engine migration-recovery trigger (`wireMigrationRecoveryOnLeaderElection`,
 * a leader-election handler + empty-on-a-fresh-joiner recovery pass) and its own
 * query/transaction sub-services — all per-engine and all released by
 * `shutdownEarlyAdminSqlRuntime` (detach + `engine.shutdown()`), so none of it
 * outlives the early engine or touches the authoritative engine's shared state.
 *
 * @param {Object|null} runtime - The onLocalAdminRuntimeReady surface.
 * @return {Promise<{sqlQueryEngine: Object|null,
 *   detachMigrationRecovery: Function}|null>}
 */
async function startEarlyAdminSqlRuntime(runtime) {
  if (!isEarlyAdminSqlEngineEnabled()) {
    return null;
  }
  if (!runtime || !runtime.messageRouter || !runtime.owner) {
    return null;
  }
  return createSqlRuntimeComposition({
    nodeId: runtime.nodeId,
    systemTableCache: runtime.systemTableCache,
    messageRouter: runtime.messageRouter,
    owner: runtime.owner,
    partitionServices: runtime.partitionServices,
    logger: runtime.owner?.logger || null,
  });
}

/**
 * Dispose a provisional early-admin SQL runtime once the authoritative engine
 * has replaced it on the admin runtime. Only the early engine's own per-engine
 * sub-services are torn down (`shutdown()` touches queryExecutor /
 * transactionCoordinator / tableCreationService only) — the shared cache,
 * router, and owner services are left intact for the authoritative engine.
 *
 * @param {{sqlQueryEngine: Object|null,
 *   detachMigrationRecovery: Function}|null} earlyRuntime
 * @return {Promise<void>}
 */
async function shutdownEarlyAdminSqlRuntime(earlyRuntime) {
  if (!earlyRuntime) {
    return;
  }
  if (typeof earlyRuntime.detachMigrationRecovery === LOCAL_STR_FUNCTION) {
    try {
      earlyRuntime.detachMigrationRecovery();
    } catch {
      // best-effort detach; a missing/late owner must not block startup
    }
  }
  const engine = earlyRuntime.sqlQueryEngine;
  if (engine && typeof engine.shutdown === LOCAL_STR_FUNCTION) {
    try {
      await engine.shutdown();
    } catch {
      // best-effort shutdown; the authoritative engine already owns admin
    }
  }
}

/**
 * Start admin plus live query startup composition.
 * @param {Object} options
 * @return {Promise<{adminAPI: Object, liveQueryWiring: Object, adminPort: number}>}
 */
async function startAdminRuntimeComposition(options) {
  const adminStartup = createAdminAPIWithLiveQuery({
    nodeId: options.nodeId,
    systemTableCache: options.systemTableCache,
    cacheMutationTarget:
      options.cacheMutationTarget || options.systemTableCache,
    sqlQueryEngine: options.sqlQueryEngine || null,
    cdcIntegrationService: options.owner.cdcIntegrationService,
    messageRouter: options.messageRouter,
    serviceDiagnosticsProvider:
      createServiceDiagnosticsProvider(options.owner),
    controlPlaneReadinessService:
      resolveOwnerControlPlaneReadinessService(options.owner),
    heartbeatService: options.owner.heartbeatService,
    startupRecoveryCoordinator:
      options.owner.rebalanceCoordinator?.startupRecoveryCoordinator || null,
    bootstrapReadinessState:
      options.owner.bootstrapReadinessState || null,
    partitionServicesProvider: () => options.partitionServices,
  });
  const adminAPI = adminStartup.adminAPI;
  const liveQueryWiring = adminStartup.liveQueryWiring;
  const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
  await adminAPI.initialize(adminPort);
  const logger = options.owner?.logger;
  if (logger && typeof logger.info === LOCAL_STR_FUNCTION) {
    logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_STARTED, {
      nodeId: options.nodeId,
      adminPort,
      hasSqlQueryEngine: Boolean(options.sqlQueryEngine),
      hasMessageRouter: Boolean(options.messageRouter),
      partitionServiceCount: Number.isFinite(options.partitionServices?.size) ?
        options.partitionServices.size :
        null,
    });
  }
  return {
    nodeId: options.nodeId,
    adminAPI,
    liveQueryWiring,
    adminPort,
  };
}

/**
 * Attach the SQL engine to an already-started admin runtime.
 * @param {Object|null} adminRuntime
 * @param {Object|null} sqlQueryEngine
 */
function attachSqlEngineToAdminRuntime(adminRuntime, sqlQueryEngine) {
  if (!adminRuntime || !sqlQueryEngine) {
    return;
  }
  const logger = adminRuntime.adminAPI?.logger;
  if (typeof adminRuntime.adminAPI?.setSQLQueryEngine === LOCAL_STR_FUNCTION) {
    adminRuntime.adminAPI.setSQLQueryEngine(sqlQueryEngine);
    if (logger && typeof logger.info === LOCAL_STR_FUNCTION) {
      logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_SQL_ENGINE_ATTACHED, {
        nodeId: adminRuntime.nodeId || null,
      });
    }
    return;
  }
  if (
    adminRuntime.liveQueryWiring?.liveQueryManager &&
    typeof adminRuntime.liveQueryWiring.liveQueryManager.initialize ===
      LOCAL_STR_FUNCTION
  ) {
    adminRuntime.liveQueryWiring.liveQueryManager.initialize({
      sqlQueryEngine,
    });
    if (logger && typeof logger.info === LOCAL_STR_FUNCTION) {
      logger.info(ENTRYPOINT_LOG_MSG.ADMIN_RUNTIME_SQL_ENGINE_ATTACHED, {
        nodeId: adminRuntime.nodeId || null,
      });
    }
  }
}

/**
 * Shut down admin plus live query startup composition.
 * @param {Object|null} adminRuntime
 * @return {Promise<void>}
 */
async function shutdownAdminRuntimeComposition(adminRuntime) {
  if (!adminRuntime) {
    return;
  }
  if (typeof adminRuntime.adminAPI?.shutdown === LOCAL_STR_FUNCTION) {
    await adminRuntime.adminAPI.shutdown();
  }
  if (typeof adminRuntime.liveQueryWiring?.shutdown === LOCAL_STR_FUNCTION) {
    adminRuntime.liveQueryWiring.shutdown();
  }
}

export {
  attachSqlEngineToAdminRuntime,
  createAdminAPIWithLiveQuery,
  createReadinessStateWithDiagnostics,
  createServiceDiagnosticsProvider,
  createSqlCallbackWasmExecutor,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  isEarlyAdminSqlEngineEnabled,
  resolvePartitionServiceByPartitionId,
  resolveSystemCacheHandles,
  reportStartupRuntimeHandoff,
  shutdownAdminRuntimeComposition,
  shutdownEarlyAdminSqlRuntime,
  startAdminRuntimeComposition,
  startEarlyAdminSqlRuntime,
};
