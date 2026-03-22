/**
 * Distributed Database System - Main Entry Point
 */

import {ConfigurationManager} from './config/configuration-manager.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {createDynamicConfigStartupWiring} from
  './config/dynamic-config-startup-wiring.js';
import {LoggingService} from './logging/logging-service.js';
import {LogsTableService} from './logging/logs-table-service.js';
import {
  startLogsTablePersistenceOnReadiness,
} from './logging/logs-persistence-startup.js';
import {HLCClockService} from './hlc/hlc-clock-service.js';
import {DataDirectoryManager} from './storage/data-directory-manager.js';
import {BootstrapService} from './bootstrap/bootstrap-service.js';
import {BootstrapAPI} from './bootstrap/bootstrap-api.js';
import {BootstrapReadinessState} from './bootstrap/bootstrap-readiness-state.js';
import {READINESS_EVENT} from './bootstrap/bootstrap-readiness-state-constants.js';
import {LIFECYCLE_REASON} from './bootstrap/lifecycle-controller-constants.js';
import {AdminWebSocketAPI} from './admin/admin-websocket-api.js';
import {ADMIN_DEFAULT} from './admin/admin-constants.js';
import {NodeJoiningService} from './bootstrap/node-joining-service.js';
import {NodeService} from './node/node-service.js';
import {ResourceDiagnosticsSampler} from
  './diagnostics/resource-diagnostics-sampler.js';
import {createLiveQueryStartupWiring} from
  './live-query/live-query-startup-wiring.js';
import {assertCritical} from './utils/assert.js';
import {ModuleMirror} from './wasm-service/module-mirror.js';
import {WasmExecutor} from './wasm-service/wasm-executor.js';
import {
  ensureLiferaftProviderForRuntime,
  getProcessRaftProvider,
} from './raft/raft-provider-control.js';
import {RAFT_PROVIDER_LOG_MSG} from './raft/raft-provider-control-constants.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
  ENTRYPOINT_FLAG,
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_SUBSYSTEM,
  ENTRYPOINT_TEXT,
  ENTRYPOINT_VERSION,
} from './constants/entrypoint.js';
import {
  resolveControlPlaneRolloutControls,
} from './runtime/control-plane-rollout-controls.js';
import {createManagedSplitMetricsProvider} from
  './partition/managed-split-metrics-provider.js';
import {TRANSPORT_CONFIG_KEY} from './constants/transport.js';
import {resolveAdvertisedWebSocketAddress} from
  './transport/node-address-resolution.js';
import {
  createSystemMetadataOwners,
} from './control-plane/owners/index.js';
import {
  createControlPlaneRuntimeBundle,
} from './control-plane/control-plane-runtime-bundle.js';
import {SPLIT_MERGE_EVENT} from
  './partition/partition-constants.js';
import {STABILIZATION_RESET_TRIGGER} from
  './rebalancer/rebalancer-constants.js';
import {wireMigrationWorkflowOwners} from
  './migration/migration-composition.js';
import {wireMigrationRecoveryOnLeaderElection} from
  './migration/migration-recovery-trigger.js';

// Re-export modules for external use
export * from './query/index.js';
export * from './partition/index.js';
export * from './config/configuration-manager.js';
export * from './logging/logging-service.js';
export * from './hlc/index.js';
export * from './cache/index.js';
export * from './address/index.js';
export * from './bootstrap/index.js';
export * from './cdc/index.js';
export * from './message-group/index.js';
export * from './node/index.js';
export * from './rebalancer/index.js';
export * from './service/index.js';
export * from './threading/index.js';
export * from './transport/index.js';
export * from './storage/index.js';

/**
 * System version.
 */
export const VERSION = ENTRYPOINT_VERSION;
const CONTROL_PLANE_WRITE_FAILURE_THRESHOLD = 3;

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  const args = process.argv.slice(2);
  if (args.includes(ENTRYPOINT_FLAG.VERSION_LONG) || args.includes(ENTRYPOINT_FLAG.VERSION_SHORT)) {
    console.log(ENTRYPOINT_TEXT.versionLine(VERSION));
    return true;
  }
  if (args.includes(ENTRYPOINT_FLAG.HELP_LONG) || args.includes(ENTRYPOINT_FLAG.HELP_SHORT)) {
    console.log(ENTRYPOINT_TEXT.headerLine(VERSION));
    console.log('');
    console.log(ENTRYPOINT_TEXT.USAGE_LINE);
    console.log('');
    console.log('Options:');
    for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
      console.log(line);
    }
    return true;
  }
  return false;
}

/**
 * Parse command-line arguments.
 * @return {Object} Parsed arguments
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === ENTRYPOINT_FLAG.DATA_DIR && i + 1 < args.length) {
      result.dataDir = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.SEED && i + 1 < args.length) {
      result.seedNodeAddress = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.CONFIG && i + 1 < args.length) {
      result.configPath = args[i + 1];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.DRY_RUN) {
      result.dryRun = true;
    }
  }

  return result;
}

/**
 * Parse a positive millisecond value from environment input.
 * @param {string|number|undefined} value
 * @return {number|null}
 */
function parsePositiveTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
}

/**
 * Resolve rollout controls from environment overrides.
 * @param {Object} env
 * @return {Object}
 */
function resolveRolloutControlsFromEnvironment(env) {
  return resolveControlPlaneRolloutControls({
    lifecycleProbes:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED],
    workClassScheduler:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED],
    durableJoinSessions:
      env[ENTRYPOINT_ENV.CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED],
  });
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
 * The map is keyed by replicaId; this iterates values and matches by the
 * partitionId property. Read-only lookup — no new cache or index.
 * @param {Map} partitionServices - Map keyed by replicaId.
 * @param {string} partitionId - The partition ID to find.
 * @return {Object|null} The matching partition service, or null.
 */
function resolvePartitionServiceByPartitionId(
  partitionServices, partitionId,
) {
  if (!partitionServices || !partitionId ||
      typeof partitionServices.values !== 'function') {
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
 * @param {Object} owner - BootstrapService or NodeJoiningService instance.
 * @return {Function} Provider returning lifecycle/reconciler/resource diagnostics.
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

    if (!lifecycleDiagnostics && !reconcilerDiagnostics &&
      !resourceDiagnostics && !cdcSubscriptionStatus) {
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
 * Build control-plane write health provider for readiness degradation.
 * @param {Object|null} owner
 * @param {Object} [options]
 * @param {number} [options.failureThreshold]
 * @return {Function}
 */
function createControlPlaneWriteHealthProvider(owner, options = {}) {
  const failureThreshold = Number.isFinite(options.failureThreshold) &&
    options.failureThreshold > 0 ?
    Math.floor(options.failureThreshold) :
    CONTROL_PLANE_WRITE_FAILURE_THRESHOLD;
  return () => {
    const consecutiveFailures = Number(
      owner?.heartbeatService?.heartbeatConsecutiveFailures || 0,
    );
    return {
      healthy: consecutiveFailures < failureThreshold,
      reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
      details: {
        source: 'heartbeat_service',
        consecutiveFailures,
        failureThreshold,
      },
    };
  };
}

/**
 * Create admin API and startup-owned live query wiring.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} [options.cacheMutationTarget]
 * @param {Object|null} options.sqlQueryEngine
 * @param {Function|null} options.serviceDiagnosticsProvider
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
    heartbeatService: options.heartbeatService || null,
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
 * Connect structured logging persistence to the replicated logs table.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @param {Object} rolloutControls - Startup rollout control map.
 * @return {Promise<LogsTableService|null>} Logs table service when connected.
 */
async function connectLogsTablePersistence(
  cdcIntegrationService,
  logger,
  rolloutControls,
) {
  if (!cdcIntegrationService) {
    logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECT_SKIPPED);
    return null;
  }

  try {
    const controlPlaneRuntimeBundle = createControlPlaneRuntimeBundle({
      cdcIntegrationService,
      messageRouter: cdcIntegrationService?.messageRouter || null,
    });
    const controlPlaneSystemTableGateway =
      controlPlaneRuntimeBundle.controlPlaneSystemTableGateway;
    const systemMetadataOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway,
    });
    const logsTableService = LogsTableService.getInstance({
      rolloutControls,
    });
    logsTableService.initialize({
      cdcIntegrationService,
      logsOwner: systemMetadataOwners.logsOwner,
      messageRouter: cdcIntegrationService?.messageRouter || null,
      controlPlaneSystemTableGateway,
    });
    const flushedCount = await logsTableService.connectToLoggingService();
    logger.info(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECTED, {
      bufferedEntriesFlushed: flushedCount,
    });
    return logsTableService;
  } catch (error) {
    logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECT_FAILED, {
      error: error.message,
    });
    return null;
  }
}

/**
 * Start logs table persistence only after readiness remains stable.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @param {Object} rolloutControls - Startup rollout control map.
 * @param {Object|null} readinessState - Readiness owner for traffic stability.
 * @return {{getService: Function, promise: Promise<LogsTableService|null>, cancel: Function}}
 */
function startLogsTablePersistence(
  cdcIntegrationService,
  logger,
  rolloutControls,
  readinessState,
) {
  return startLogsTablePersistenceOnReadiness({
    readinessState,
    logger,
    start: () => connectLogsTablePersistence(
      cdcIntegrationService,
      logger,
      rolloutControls,
    ),
  });
}

/**
 * Shutdown logs table persistence with best-effort semantics.
 * @param {LogsTableService|null} logsTableService - Logs table service instance.
 * @param {Object} logger - Entrypoint logger.
 * @return {Promise<void>}
 */
async function shutdownLogsTablePersistence(logsTableService, logger) {
  if (!logsTableService) {
    return;
  }

  try {
    await logsTableService.shutdown();
  } catch (error) {
    logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_SHUTDOWN_FAILED, {
      error: error.message,
    });
  }
}

/**
 * Publish one best-effort terminal node row before tearing down the
 * control-plane path during process shutdown.
 * @param {Object|null} heartbeatService
 * @param {Object} logger
 * @param {string} nodeId
 * @return {Promise<void>}
 */
async function publishNodeShutdownStatus(heartbeatService, logger, nodeId) {
  if (typeof heartbeatService?.reportNodeShutdown !== 'function') {
    return;
  }

  try {
    await heartbeatService.reportNodeShutdown();
  } catch (error) {
    logger.warn('Failed to publish node shutdown status', {
      nodeId,
      error: error.message,
    });
  }
}

/**
 * Start runtime dynamic configuration wiring.
 * @param {Object} options
 * @param {Object} logger
 * @return {Promise<Object|null>}
 */
async function startDynamicConfigWiring(options, logger) {
  try {
    return await createDynamicConfigStartupWiring(options);
  } catch (error) {
    logger.warn(ENTRYPOINT_LOG_MSG.DYNAMIC_CONFIG_WIRING_FAILED, {
      error: error.message,
    });
    return null;
  }
}

/**
 * Stop runtime dynamic configuration wiring.
 * @param {Object|null} dynamicConfigWiring
 * @param {Object} logger
 */
function shutdownDynamicConfigWiring(dynamicConfigWiring, logger) {
  if (!dynamicConfigWiring) {
    return;
  }

  try {
    dynamicConfigWiring.shutdown();
  } catch (error) {
    logger.warn(ENTRYPOINT_LOG_MSG.DYNAMIC_CONFIG_WIRING_SHUTDOWN_FAILED, {
      error: error.message,
    });
  }
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
 * Hydrate runtime-owned service references into an already-initialized
 * BootstrapAPI instance.
 * @param {Object} options
 * @param {BootstrapAPI} options.bootstrapAPI
 * @param {Object} options.systemTableCache
 * @param {Map} options.messageGroupServices
 * @param {Map} options.partitionServices
 * @param {Object|null} options.replicaHandler
 * @param {Object|null} options.epochManager
 * @param {Object|null} options.messageRouter
 */
function hydrateBootstrapApiRuntime(options) {
  options.bootstrapAPI.systemTableCache = options.systemTableCache;
  options.bootstrapAPI.messageGroupServices = options.messageGroupServices;
  options.bootstrapAPI.partitionServices = options.partitionServices;
  options.bootstrapAPI.replicaHandler = options.replicaHandler;
  options.bootstrapAPI.epochManager = options.epochManager;
  options.bootstrapAPI.messageRouter = options.messageRouter;
}

/**
 * Resolve read/write system cache handles from one message-group map.
 * @param {Map} messageGroupServices
 * @return {{systemTableCache: Object|null, cacheMutationTarget: Object|null}}
 */
function resolveSystemCacheHandles(messageGroupServices) {
  let systemTableCache = null;
  let cacheMutationTarget = null;
  if (!messageGroupServices ||
      typeof messageGroupServices.values !== 'function') {
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
 * @param {Object} options.partitionSplitMergeManager
 * @param {Map} options.partitionServices
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
 * Create SQL query engine + split manager composition for one runtime branch.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} options.messageRouter
 * @param {Object} options.owner
 * @param {Map} options.partitionServices
 * @param {Object} options.logger
 * @return {Promise<{sqlQueryEngine: Object|null, detachMigrationRecovery: Function}>}
 */
async function createSqlRuntimeComposition(options) {
  if (!options.messageRouter) {
    return {
      sqlQueryEngine: null,
      detachMigrationRecovery: () => {},
    };
  }

  const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
  const wasmExecutor = createSqlCallbackWasmExecutor();
  const sqlQueryEngine = new SQLQueryEngine({
    systemCache: options.systemTableCache,
    messageRouter: options.messageRouter,
    cdcIntegrationService: options.owner.cdcIntegrationService,
    nodeId: options.nodeId,
    rebalanceCoordinator: options.owner.rebalanceCoordinator,
    controlPlaneReadinessService:
      options.owner.rebalanceCoordinator
        ?.controlPlaneReadinessService || null,
    runtimeDriverRegistry: options.owner.runtimeDriverRegistry,
    serviceRuntimeLifecycle: options.owner.serviceRuntimeLifecycle,
    wasmExecutor,
    migrationAutoWire: false,
  });

  wireMigrationWorkflowOwners({
    sqlCore: sqlQueryEngine,
    systemTableCache: options.systemTableCache,
    transactionCoordinator: sqlQueryEngine.transactionCoordinator,
    logger: options.logger,
    now: () => Date.now(),
  });

  const {PartitionSplitMergeManager} =
    await import('./partition/partition-split-merge-manager.js');
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
 * Start admin + live query startup composition.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {Object} options.systemTableCache
 * @param {Object|null} options.cacheMutationTarget
 * @param {Object|null} options.sqlQueryEngine
 * @param {Object} options.owner
 * @param {Object|null} options.messageRouter
 * @param {Map} options.partitionServices
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
    heartbeatService: options.owner.heartbeatService,
    partitionServicesProvider: () => options.partitionServices,
  });
  const adminAPI = adminStartup.adminAPI;
  const liveQueryWiring = adminStartup.liveQueryWiring;
  const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
  await adminAPI.initialize(adminPort);
  return {
    adminAPI,
    liveQueryWiring,
    adminPort,
  };
}

/**
 * Resolve logs table service from one startup persistence handle.
 * @param {Object|null} logsPersistence
 * @return {Promise<LogsTableService|null>}
 */
async function resolveLogsTableServiceFromPersistence(logsPersistence) {
  if (!logsPersistence) {
    return null;
  }
  const syncService = logsPersistence.getService?.();
  if (syncService) {
    return syncService;
  }
  return logsPersistence.promise || null;
}

/**
 * Build one shared shutdown signal handler for seed/join branches.
 * @param {Object} options
 * @param {Object} options.logger
 * @param {string} options.nodeId
 * @param {Object} options.bootstrapAPI
 * @param {Object|null} options.heartbeatService
 * @param {Object|null} options.logsPersistence
 * @param {Object|null} options.dynamicConfigWiring
 * @param {Function} options.detachMigrationRecovery
 * @param {Function} options.ownerCleanup
 * @param {Object} options.adminAPI
 * @param {Object} options.liveQueryWiring
 * @param {string} options.failureMessage
 * @return {(signal: string) => Promise<void>}
 */
function createShutdownSignalHandler(options) {
  let shutdownSignalCount = 0;
  return async (signal) => {
    shutdownSignalCount++;
    if (shutdownSignalCount > 1) {
      options.logger.warn('Shutdown already in progress, forcing process exit', {
        signal,
      });
      process.exit(1);
      return;
    }

    options.logger.info(ENTRYPOINT_LOG_MSG.SHUTDOWN, {signal});
    try {
      const drainDeadlineMs =
        Date.now() + ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS;
      const drainingSnapshot = options.bootstrapAPI.markDraining({
        drainDeadlineMs,
      });
      options.logger.info(ENTRYPOINT_LOG_MSG.READINESS_DRAINING, {
        nodeId: options.nodeId,
        phase: drainingSnapshot?.phase || null,
        reasons: drainingSnapshot?.reasons || [],
        drainDeadlineMs,
      });
      await publishNodeShutdownStatus(
        options.heartbeatService,
        options.logger,
        options.nodeId,
      );
      options.logsPersistence?.cancel?.();
      const logsTableService = await resolveLogsTableServiceFromPersistence(
        options.logsPersistence,
      );
      await shutdownLogsTablePersistence(logsTableService, options.logger);
      shutdownDynamicConfigWiring(options.dynamicConfigWiring, options.logger);
      if (typeof options.detachMigrationRecovery === 'function') {
        options.detachMigrationRecovery();
      }
      await options.ownerCleanup();
      await options.bootstrapAPI.shutdown();
      await options.adminAPI.shutdown();
      options.liveQueryWiring.shutdown();
      process.exit(0);
    } catch (error) {
      options.logger.error(options.failureMessage, {
        signal,
        error: error.message,
      });
      process.exit(1);
    }
  };
}

/**
 * Register shared shutdown signal listeners for process lifecycle.
 * @param {Function} shutdownHandler
 */
function registerShutdownSignalHandlers(shutdownHandler) {
  process.on('SIGINT', () => {
    void shutdownHandler('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdownHandler('SIGTERM');
  });
}

/**
 * Compose and start one joining-node runtime path.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.mainLogger
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.rolloutControls
 * @param {string} options.seedNodeAddress
 * @param {Object} options.env
 * @return {Promise<void>}
 */
async function startJoinNode(options) {
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const seedNodeAddress = String(options.seedNodeAddress || '');
  const env = options.env || process.env;

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINING_CLUSTER, {
    seedNodeAddress,
  });

  const seedUrl = seedNodeAddress.startsWith('http') ?
    seedNodeAddress :
    `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${seedNodeAddress}`;

  const restApiPort =
    config.get(CONFIG_KEY.NODE_REST_API_PORT) || ENTRYPOINT_DEFAULT.REST_API_PORT;
  const wsPort =
    config.get(CONFIG_KEY.NODE_WS_PORT) ||
    (restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
  const joiningNodeAddress =
    config.get(CONFIG_KEY.NODE_ADDRESS) ||
    `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`;
  const advertisedNodeWsAddress =
    resolveAdvertisedWebSocketAddress({
      advertisedAddress: config.get(
        CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
      ),
      nodeAddress: joiningNodeAddress,
      wsPort,
      wsHost: config.get(TRANSPORT_CONFIG_KEY.WS_HOST),
    });
  const joiningConfig = {};
  const joinHttpTimeoutMs = parsePositiveTimeoutMs(
    env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
  );
  if (joinHttpTimeoutMs !== null) {
    joiningConfig.httpTimeoutMs = joinHttpTimeoutMs;
  }
  const joinLeadershipWaitTimeoutMs = parsePositiveTimeoutMs(
    env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
  );
  if (joinLeadershipWaitTimeoutMs !== null) {
    joiningConfig.leadershipWaitTimeoutMs = joinLeadershipWaitTimeoutMs;
  }
  joiningConfig.autoResumeRetryableFailures = true;

  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const joinReadinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  const nodeJoiningService = new NodeJoiningService({
    nodeId,
    nodeAddress: joiningNodeAddress,
    advertisedNodeWsAddress,
    seedNodeAddress: seedUrl,
    wsPort: wsPort,
    dataDir: dataDirectoryManager.getDataDir(),
    rolloutControls,
    readinessState: joinReadinessState,
    config: Object.keys(joiningConfig).length > 0 ?
      joiningConfig :
      undefined,
  });
  const bootstrapAPI = new BootstrapAPI({
    seedNodeId: nodeId,
    seedNodeAddress: joiningNodeAddress,
    seedNodeWsAddress: advertisedNodeWsAddress,
    wsPort: wsPort,
    messageGroupServices: nodeJoiningService.messageGroupServices,
    partitionServices: nodeJoiningService.partitionServices,
    replicaHandler: nodeJoiningService.replicaHandler,
    systemTableCache: null,
    bootstrapService: null,
    epochManager: nodeJoiningService.epochManager,
    messageRouter: nodeJoiningService.messageRouter,
    readinessState: joinReadinessState,
    controlPlaneWriteHealthProvider:
      createControlPlaneWriteHealthProvider(nodeJoiningService),
    rolloutControls,
  });

  await bootstrapAPI.initialize();

  const joinResult = await nodeJoiningService.join();

  if (!joinResult.success) {
    mainLogger.error(ENTRYPOINT_LOG_MSG.FAILED_JOIN, {
      error: joinResult.error,
      phase: joinResult.phase,
    });
    await bootstrapAPI.shutdown();
    process.exit(1);
  }

  let joinLogsPersistence = null;

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINED_CLUSTER, {
    messageGroupCount: joinResult.messageGroupServices.size,
    duration: joinResult.duration,
  });

  const joinCacheHandles = resolveSystemCacheHandles(
    joinResult.messageGroupServices,
  );
  let systemTableCache = joinCacheHandles.systemTableCache;
  let cacheMutationTarget = joinCacheHandles.cacheMutationTarget;
  systemTableCache = assertCritical(
    systemTableCache,
    ENTRYPOINT_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
  );
  hydrateBootstrapApiRuntime({
    bootstrapAPI,
    systemTableCache,
    messageGroupServices: joinResult.messageGroupServices,
    partitionServices: joinResult.partitionServices,
    replicaHandler: joinResult.replicaHandler,
    epochManager: nodeJoiningService.epochManager,
    messageRouter: joinResult.messageRouter,
  });

  const joinSqlRuntime = await createSqlRuntimeComposition({
    nodeId,
    systemTableCache,
    messageRouter: joinResult.messageRouter,
    owner: nodeJoiningService,
    partitionServices: joinResult.partitionServices,
    logger: mainLogger,
  });
  const sqlQueryEngine = joinSqlRuntime.sqlQueryEngine;
  const detachJoinMigrationRecovery =
    joinSqlRuntime.detachMigrationRecovery;
  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);

  const joinDynamicConfigWiring = await startDynamicConfigWiring({
    nodeId,
    systemTableCache,
    sqlQueryEngine,
    messageGroupServices: joinResult.messageGroupServices,
    partitionServices: joinResult.partitionServices,
    runtimeOwner: nodeJoiningService,
  }, mainLogger);

  const joinAdminRuntime = await startAdminRuntimeComposition({
    nodeId,
    systemTableCache,
    cacheMutationTarget: cacheMutationTarget || systemTableCache,
    sqlQueryEngine,
    owner: nodeJoiningService,
    messageRouter: joinResult.messageRouter,
    partitionServices: joinResult.partitionServices,
  });
  const adminAPI = joinAdminRuntime.adminAPI;
  const liveQueryWiring = joinAdminRuntime.liveQueryWiring;
  const adminPort = joinAdminRuntime.adminPort;

  mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
    nodeId,
    adminWebSocketPort: adminPort,
    dataDir: dataDirectoryManager.getDataDir(),
  });

  joinLogsPersistence = startLogsTablePersistence(
    nodeJoiningService.cdcIntegrationService,
    mainLogger,
    rolloutControls,
    joinReadinessState,
  );

  const handleShutdownSignal = createShutdownSignalHandler({
    logger: mainLogger,
    nodeId,
    bootstrapAPI,
    heartbeatService: nodeJoiningService.heartbeatService,
    logsPersistence: joinLogsPersistence,
    dynamicConfigWiring: joinDynamicConfigWiring,
    detachMigrationRecovery: detachJoinMigrationRecovery,
    ownerCleanup: () => nodeJoiningService.cleanup(),
    adminAPI,
    liveQueryWiring,
    failureMessage: 'Failed to shutdown joining node cleanly',
  });
  registerShutdownSignalHandlers(handleShutdownSignal);
}

/**
 * Compose and start one seed-node runtime path.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.mainLogger
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.rolloutControls
 * @return {Promise<void>}
 */
async function startSeedNode(options) {
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const nodeId = config.get(CONFIG_KEY.NODE_ID);

  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);

  const restApiPort =
    config.get(CONFIG_KEY.NODE_REST_API_PORT) || ENTRYPOINT_DEFAULT.REST_API_PORT;
  const wsPort =
    config.get(CONFIG_KEY.NODE_WS_PORT) ||
    (restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
  const seedNodeHttpAddress =
    config.get(CONFIG_KEY.NODE_ADDRESS) ||
    `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`;
  const advertisedNodeWsAddress =
    resolveAdvertisedWebSocketAddress({
      advertisedAddress: config.get(
        CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
      ),
      nodeAddress: seedNodeHttpAddress,
      wsPort,
      wsHost: config.get(TRANSPORT_CONFIG_KEY.WS_HOST),
    });

  const readinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  const bootstrapService = new BootstrapService({
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
    dataDirectoryManager,
    wsPort: wsPort,
    rolloutControls,
    readinessState,
  });

  const bootstrapAPI = new BootstrapAPI({
    seedNodeId: nodeId,
    seedNodeAddress: seedNodeHttpAddress,
    seedNodeWsAddress: advertisedNodeWsAddress,
    wsPort: wsPort,
    messageGroupServices: bootstrapService.messageGroupServices,
    partitionServices: bootstrapService.partitionServices,
    replicaHandler: bootstrapService.replicaHandler,
    systemTableCache: bootstrapService.systemTableCache,
    bootstrapService: bootstrapService,
    epochManager: bootstrapService.epochManager,
    messageRouter: bootstrapService.messageRouter,
    readinessState,
    controlPlaneWriteHealthProvider:
      createControlPlaneWriteHealthProvider(bootstrapService),
    rolloutControls,
  });

  await bootstrapAPI.initialize();

  const bootstrapResult = await bootstrapService.bootstrap();

  if (!bootstrapResult.success) {
    mainLogger.error(ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED, {
      error: bootstrapResult.error,
    });
    process.exit(1);
  }

  let seedLogsPersistence = null;

  mainLogger.info(ENTRYPOINT_LOG_MSG.BOOTSTRAP_COMPLETED, {
    servicesCreated: bootstrapResult.servicesCreated,
    partitionsCreated: bootstrapResult.partitionsCreated,
    messageGroupsCreated: bootstrapResult.messageGroupsCreated,
  });

  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  hydrateBootstrapApiRuntime({
    bootstrapAPI,
    systemTableCache,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    replicaHandler: bootstrapResult.replicaHandler,
    epochManager: bootstrapResult.epochManager,
    messageRouter: bootstrapResult.messageRouter,
  });

  try {
    await bootstrapService.startWebSocketServer();
    mainLogger.info(ENTRYPOINT_LOG_MSG.WS_STARTED);
  } catch (wsError) {
    mainLogger.warn(ENTRYPOINT_LOG_MSG.WS_START_FAILED, {
      error: wsError.message,
    });
  }

  const seedSqlRuntime = await createSqlRuntimeComposition({
    nodeId,
    systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    owner: bootstrapService,
    partitionServices: bootstrapResult.partitionServices,
    logger: mainLogger,
  });
  const sqlQueryEngine = seedSqlRuntime.sqlQueryEngine;
  const detachSeedMigrationRecovery =
    seedSqlRuntime.detachMigrationRecovery;

  const seedDynamicConfigWiring = await startDynamicConfigWiring({
    nodeId,
    systemTableCache,
    sqlQueryEngine,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    runtimeOwner: bootstrapService,
  }, mainLogger);

  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);

  const seedAdminRuntime = await startAdminRuntimeComposition({
    nodeId,
    systemTableCache,
    cacheMutationTarget: systemTableCache,
    sqlQueryEngine,
    owner: bootstrapService,
    messageRouter: bootstrapResult.messageRouter,
    partitionServices: bootstrapResult.partitionServices,
  });
  const adminAPI = seedAdminRuntime.adminAPI;
  const liveQueryWiring = seedAdminRuntime.liveQueryWiring;
  const adminPort = seedAdminRuntime.adminPort;

  mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
    nodeId,
    restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
    adminWebSocketPort: adminPort,
    dataDir: dataDirectoryManager.getDataDir(),
  });

  seedLogsPersistence = startLogsTablePersistence(
    bootstrapService.cdcIntegrationService,
    mainLogger,
    rolloutControls,
    readinessState,
  );

  const handleShutdownSignal = createShutdownSignalHandler({
    logger: mainLogger,
    nodeId,
    bootstrapAPI,
    heartbeatService: bootstrapService.heartbeatService,
    logsPersistence: seedLogsPersistence,
    dynamicConfigWiring: seedDynamicConfigWiring,
    detachMigrationRecovery: detachSeedMigrationRecovery,
    ownerCleanup: () => bootstrapService.shutdown(),
    adminAPI,
    liveQueryWiring,
    failureMessage: 'Failed to shutdown seed node cleanly',
  });
  registerShutdownSignalHandlers(handleShutdownSignal);
}

/**
 * Main application entry point.
 */
async function main() {
  // Handle version/help flags early
  if (checkVersionFlag()) {
    // Return early and let Node exit naturally. This keeps the entrypoint
    // testable without needing to intercept `process.exit()`.
    return;
  }

  // Parse command-line arguments
  const cliArgs = parseCommandLineArgs();

  // Build configuration overrides
  // CLI args take precedence over environment variables
  const overrides = {};
  if (cliArgs.dataDir) {
    overrides.storage = {dataDir: cliArgs.dataDir};
  }

  // Initialize configuration
  const config = ConfigurationManager.getInstance();
  config.initialize(overrides);

  // Initialize logging
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    level: config.get(CONFIG_KEY.LOGGING_LEVEL),
    prettyPrint: config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT),
  });

  // Create subsystem-specific loggers
  const mainLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.MAIN);
  const configLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.CONFIG);

  const selectedRaftProvider = getProcessRaftProvider(process.env);
  mainLogger.info(RAFT_PROVIDER_LOG_MSG.SELECTED, {
    provider: selectedRaftProvider,
  });
  ensureLiferaftProviderForRuntime(process.env);

  configLogger.debug('Configuration loaded', {
    categories: config.getCategories(),
  });

  // Initialize data directory manager
  const dataDirectoryManager = DataDirectoryManager.getInstance();
  dataDirectoryManager.initialize();

  // Initialize HLC clock (it will create its own subsystem logger)
  const hlcClock = new HLCClockService(config.get(CONFIG_KEY.NODE_ID), {
    maxDrift: config.get(CONFIG_KEY.HLC_MAX_DRIFT_MS),
    maxLogicalCounter: config.get(CONFIG_KEY.HLC_MAX_LOGICAL_COUNTER),
  });

  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING, {
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    version: VERSION,
    dataDir: dataDirectoryManager.getDataDir(),
    hlcTimestamp: hlcClock.now().toString(),
  });

  if (cliArgs.dryRun) {
    mainLogger.info(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      dataDir: dataDirectoryManager.getDataDir(),
      provider: selectedRaftProvider,
    });
    return;
  }

  // Check if we're joining an existing cluster or starting as seed node
  const seedNodeAddress = cliArgs.seedNodeAddress ||
    process.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS];
  const rolloutControls = resolveRolloutControlsFromEnvironment(process.env);

  if (seedNodeAddress) {
    await startJoinNode({
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls,
      seedNodeAddress,
      env: process.env,
    });
    return;
  }

  await startSeedNode({
    config,
    mainLogger,
    dataDirectoryManager,
    rolloutControls,
  });
}

main().catch((err) => {
  console.error(`${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`, err);
  process.exit(1);
});
