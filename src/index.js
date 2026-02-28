/**
 * Distributed Database System - Main Entry Point
 */

import {ConfigurationManager} from './config/configuration-manager.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {createDynamicConfigStartupWiring} from
  './config/dynamic-config-startup-wiring.js';
import {LoggingService} from './logging/logging-service.js';
import {LogsTableService} from './logging/logs-table-service.js';
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

    if (!lifecycleDiagnostics && !reconcilerDiagnostics && !resourceDiagnostics) {
      return null;
    }

    return {
      lifecycle: lifecycleDiagnostics,
      reconciler: reconcilerDiagnostics,
      resources: resourceDiagnostics,
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
    sqlQueryEngine: options.sqlQueryEngine || null,
    messageRouter: options.messageRouter || null,
    serviceDiagnosticsProvider: options.serviceDiagnosticsProvider || null,
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
    const logsTableService = LogsTableService.getInstance({
      rolloutControls,
    });
    logsTableService.initialize({cdcIntegrationService});
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
 * Start logs table persistence hookup in the background.
 * Avoids blocking node readiness on buffered log flush duration.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @param {Object} rolloutControls - Startup rollout control map.
 * @return {{getService: Function, promise: Promise<LogsTableService|null>}}
 */
function startLogsTablePersistence(
  cdcIntegrationService,
  logger,
  rolloutControls,
) {
  let connectedService = null;

  const promise = connectLogsTablePersistence(
    cdcIntegrationService,
    logger,
    rolloutControls,
  ).then((service) => {
    connectedService = service;
    return service;
  }).catch((error) => {
    logger.warn('Background logs table persistence setup failed', {
      error: error.message,
    });
    return null;
  });

  return {
    getService: () => connectedService,
    promise,
  };
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

  // Check if we're joining an existing cluster or starting as seed node
  const seedNodeAddress = cliArgs.seedNodeAddress ||
    process.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS];
  const rolloutControls = resolveRolloutControlsFromEnvironment(process.env);

  if (seedNodeAddress) {
    // Join existing cluster
    mainLogger.info(ENTRYPOINT_LOG_MSG.JOINING_CLUSTER, {
      seedNodeAddress,
    });

    // Ensure seed node address has protocol
    const seedUrl = seedNodeAddress.startsWith('http') ?
      seedNodeAddress :
      `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${seedNodeAddress}`;

    // Determine WebSocket port for this joining node
    const restApiPort =
      config.get(CONFIG_KEY.NODE_REST_API_PORT) || ENTRYPOINT_DEFAULT.REST_API_PORT;
    const wsPort =
      config.get(CONFIG_KEY.NODE_WS_PORT) ||
      (restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
    const joiningConfig = {};
    const joinHttpTimeoutMs = parsePositiveTimeoutMs(
      process.env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
    );
    if (joinHttpTimeoutMs !== null) {
      joiningConfig.httpTimeoutMs = joinHttpTimeoutMs;
    }
    const joinLeadershipWaitTimeoutMs = parsePositiveTimeoutMs(
      process.env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
    );
    if (joinLeadershipWaitTimeoutMs !== null) {
      joiningConfig.leadershipWaitTimeoutMs = joinLeadershipWaitTimeoutMs;
    }

    const nodeJoiningService = new NodeJoiningService({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      nodeAddress: config.get(CONFIG_KEY.NODE_ADDRESS) ||
        `${ENTRYPOINT_DEFAULT.LOCALHOST}:${config.get(CONFIG_KEY.NODE_REST_API_PORT)}`,
      seedNodeAddress: seedUrl,
      wsPort: wsPort,
      dataDir: dataDirectoryManager.getDataDir(),
      rolloutControls,
      config: Object.keys(joiningConfig).length > 0 ?
        joiningConfig :
        undefined,
    });
    const joinReadinessState = new BootstrapReadinessState();
    joinReadinessState.on(READINESS_EVENT.TRANSITION, (transition) => {
      mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_TRANSITION, {
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        previousState: transition.previousState,
        previousReady: transition.previousReady,
        state: transition.state,
        ready: transition.ready,
        reasons: transition.reasons,
        timestamp: transition.timestamp,
      });
    });
    joinReadinessState.on(READINESS_EVENT.BLOCKED_DURATION, (event) => {
      mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_BLOCKED_DURATION, {
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        reason: event.reason,
        durationMs: event.durationMs,
        totalDurationMs: event.totalDurationMs,
        timestamp: event.timestamp,
      });
    });
    const bootstrapAPI = new BootstrapAPI({
      seedNodeId: config.get(CONFIG_KEY.NODE_ID),
      seedNodeAddress: config.get(CONFIG_KEY.NODE_ADDRESS),
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

    // Get system table cache from first message group service
    let systemTableCache = null;
    for (const mgService of joinResult.messageGroupServices.values()) {
      if (mgService.getReadOnlyCache) {
        systemTableCache = mgService.getReadOnlyCache();
      } else if (mgService.systemTableCache) {
        systemTableCache = mgService.systemTableCache;
      }
      break;
    }
    systemTableCache = assertCritical(
      systemTableCache,
      ENTRYPOINT_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    bootstrapAPI.systemTableCache = systemTableCache;
    bootstrapAPI.messageGroupServices = joinResult.messageGroupServices;
    bootstrapAPI.partitionServices = joinResult.partitionServices;
    bootstrapAPI.replicaHandler = joinResult.replicaHandler;
    bootstrapAPI.epochManager = nodeJoiningService.epochManager;
    bootstrapAPI.messageRouter = joinResult.messageRouter;

    // Create SQL query engine for transparent query routing
    let sqlQueryEngine = null;
    if (joinResult.messageRouter) {
      const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
      const wasmExecutor = createSqlCallbackWasmExecutor();
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: joinResult.messageRouter,
        cdcIntegrationService: nodeJoiningService.cdcIntegrationService,
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        rebalanceCoordinator: nodeJoiningService.rebalanceCoordinator,
        runtimeDriverRegistry: nodeJoiningService.runtimeDriverRegistry,
        serviceRuntimeLifecycle: nodeJoiningService.serviceRuntimeLifecycle,
        wasmExecutor,
      });
    }
    bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);

    const joinDynamicConfigWiring = await startDynamicConfigWiring({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      messageGroupServices: joinResult.messageGroupServices,
      partitionServices: joinResult.partitionServices,
      runtimeOwner: nodeJoiningService,
    }, mainLogger);

    // Start Admin WebSocket API for this node
    const joinAdminStartup = createAdminAPIWithLiveQuery({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      messageRouter: joinResult.messageRouter,
      serviceDiagnosticsProvider:
        createServiceDiagnosticsProvider(nodeJoiningService),
    });
    const adminAPI = joinAdminStartup.adminAPI;
    const liveQueryWiring = joinAdminStartup.liveQueryWiring;

    const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
    await adminAPI.initialize(adminPort);

    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

    joinLogsPersistence = startLogsTablePersistence(
      nodeJoiningService.cdcIntegrationService,
      mainLogger,
      rolloutControls,
    );

    // Keep the process running
    let shutdownSignalCount = 0;
    const handleShutdownSignal = async (signal) => {
      shutdownSignalCount++;
      if (shutdownSignalCount > 1) {
        mainLogger.warn('Shutdown already in progress, forcing process exit', {
          signal,
        });
        process.exit(1);
        return;
      }

      mainLogger.info(ENTRYPOINT_LOG_MSG.SHUTDOWN, {signal});
      try {
        const drainDeadlineMs =
          Date.now() + ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS;
        const drainingSnapshot = bootstrapAPI.markDraining({
          drainDeadlineMs,
        });
        mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_DRAINING, {
          nodeId: config.get(CONFIG_KEY.NODE_ID),
          phase: drainingSnapshot?.phase || null,
          reasons: drainingSnapshot?.reasons || [],
          drainDeadlineMs,
        });
        const joinLogsTableService = joinLogsPersistence ?
          (joinLogsPersistence.getService() || await joinLogsPersistence.promise) :
          null;
        await shutdownLogsTablePersistence(joinLogsTableService, mainLogger);
        shutdownDynamicConfigWiring(joinDynamicConfigWiring, mainLogger);
        await nodeJoiningService.cleanup();
        await bootstrapAPI.shutdown();
        await adminAPI.shutdown();
        liveQueryWiring.shutdown();
        process.exit(0);
      } catch (error) {
        mainLogger.error('Failed to shutdown joining node cleanly', {
          signal,
          error: error.message,
        });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => {
      void handleShutdownSignal('SIGINT');
    });

    process.on('SIGTERM', () => {
      void handleShutdownSignal('SIGTERM');
    });
  } else {
    // Start as seed node - bootstrap the system
    mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);

    // Determine WebSocket port for cross-node communication
    // Use REST API port + 1000 as default (e.g., 8080 -> 9080)
    const restApiPort =
      config.get(CONFIG_KEY.NODE_REST_API_PORT) || ENTRYPOINT_DEFAULT.REST_API_PORT;
    const wsPort =
      config.get(CONFIG_KEY.NODE_WS_PORT) ||
      (restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);

    const bootstrapService = new BootstrapService({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      nodeAddress:
        config.get(CONFIG_KEY.NODE_ADDRESS) || `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`,
      dataDirectoryManager,
      wsPort: wsPort,
      rolloutControls,
    });
    const readinessState = new BootstrapReadinessState();
    readinessState.on(READINESS_EVENT.TRANSITION, (transition) => {
      mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_TRANSITION, {
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        previousState: transition.previousState,
        previousReady: transition.previousReady,
        state: transition.state,
        ready: transition.ready,
        reasons: transition.reasons,
        timestamp: transition.timestamp,
      });
    });
    readinessState.on(READINESS_EVENT.BLOCKED_DURATION, (event) => {
      mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_BLOCKED_DURATION, {
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        reason: event.reason,
        durationMs: event.durationMs,
        totalDurationMs: event.totalDurationMs,
        timestamp: event.timestamp,
      });
    });

    // Start Bootstrap API early so /health reports liveness during
    // bootstrap phases. Readiness is still exposed via `ready: false`.
    const bootstrapAPI = new BootstrapAPI({
      seedNodeId: config.get(CONFIG_KEY.NODE_ID),
      seedNodeAddress: config.get(CONFIG_KEY.NODE_ADDRESS),
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

    // Wire runtime dependencies into already-running bootstrap API.
    // Get system table cache from NodeService singleton.
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    bootstrapAPI.systemTableCache = systemTableCache;
    bootstrapAPI.messageGroupServices = bootstrapResult.messageGroupServices;
    bootstrapAPI.partitionServices = bootstrapResult.partitionServices;
    bootstrapAPI.replicaHandler = bootstrapResult.replicaHandler;
    bootstrapAPI.epochManager = bootstrapResult.epochManager;
    bootstrapAPI.messageRouter = bootstrapResult.messageRouter;

    // Start WebSocket server for cross-node communication
    // This allows joining nodes to connect and receive lifecycle messages
    try {
      await bootstrapService.startWebSocketServer();
      mainLogger.info(ENTRYPOINT_LOG_MSG.WS_STARTED);
    } catch (wsError) {
      mainLogger.warn(ENTRYPOINT_LOG_MSG.WS_START_FAILED, {
        error: wsError.message,
      });
    }

    // Build partition registry keyed by partitionId (not replicaId)
    // Create SQL query engine for transparent query routing
    const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
    const wasmExecutor = createSqlCallbackWasmExecutor();
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      cdcIntegrationService: bootstrapService.cdcIntegrationService,
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
      runtimeDriverRegistry: bootstrapService.runtimeDriverRegistry,
      serviceRuntimeLifecycle: bootstrapService.serviceRuntimeLifecycle,
      wasmExecutor,
    });

    const seedDynamicConfigWiring = await startDynamicConfigWiring({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      runtimeOwner: bootstrapService,
    }, mainLogger);

    // Set SQL query engine on bootstrap API for distributed node registration
    bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);

    // Start Admin WebSocket API
    const seedAdminStartup = createAdminAPIWithLiveQuery({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      messageRouter: bootstrapResult.messageRouter,
      serviceDiagnosticsProvider:
        createServiceDiagnosticsProvider(bootstrapService),
    });
    const adminAPI = seedAdminStartup.adminAPI;
    const liveQueryWiring = seedAdminStartup.liveQueryWiring;

    const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
    await adminAPI.initialize(adminPort);

    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

    seedLogsPersistence = startLogsTablePersistence(
      bootstrapService.cdcIntegrationService,
      mainLogger,
      rolloutControls,
    );

    // Keep the process running
    let shutdownSignalCount = 0;
    const handleShutdownSignal = async (signal) => {
      shutdownSignalCount++;
      if (shutdownSignalCount > 1) {
        mainLogger.warn('Shutdown already in progress, forcing process exit', {
          signal,
        });
        process.exit(1);
        return;
      }

      mainLogger.info(ENTRYPOINT_LOG_MSG.SHUTDOWN, {signal});
      try {
        const drainDeadlineMs =
          Date.now() + ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS;
        const drainingSnapshot = bootstrapAPI.markDraining({
          drainDeadlineMs,
        });
        mainLogger.info(ENTRYPOINT_LOG_MSG.READINESS_DRAINING, {
          nodeId: config.get(CONFIG_KEY.NODE_ID),
          phase: drainingSnapshot?.phase || null,
          reasons: drainingSnapshot?.reasons || [],
          drainDeadlineMs,
        });
        const seedLogsTableService = seedLogsPersistence ?
          (seedLogsPersistence.getService() || await seedLogsPersistence.promise) :
          null;
        await shutdownLogsTablePersistence(seedLogsTableService, mainLogger);
        shutdownDynamicConfigWiring(seedDynamicConfigWiring, mainLogger);
        await bootstrapService.shutdown();
        await bootstrapAPI.shutdown();
        await adminAPI.shutdown();
        liveQueryWiring.shutdown();
        process.exit(0);
      } catch (error) {
        mainLogger.error('Failed to shutdown seed node cleanly', {
          signal,
          error: error.message,
        });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => {
      void handleShutdownSignal('SIGINT');
    });

    process.on('SIGTERM', () => {
      void handleShutdownSignal('SIGTERM');
    });
  }
}

main().catch((err) => {
  console.error(`${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`, err);
  process.exit(1);
});
