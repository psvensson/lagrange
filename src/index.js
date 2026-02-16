/**
 * Distributed Database System - Main Entry Point
 */

import {ConfigurationManager} from './config/configuration-manager.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {LoggingService} from './logging/logging-service.js';
import {LogsTableService} from './logging/logs-table-service.js';
import {HLCClockService} from './hlc/hlc-clock-service.js';
import {DataDirectoryManager} from './storage/data-directory-manager.js';
import {BootstrapService} from './bootstrap/bootstrap-service.js';
import {BootstrapAPI} from './bootstrap/bootstrap-api.js';
import {AdminWebSocketAPI} from './admin/admin-websocket-api.js';
import {ADMIN_DEFAULT} from './admin/admin-constants.js';
import {NodeJoiningService} from './bootstrap/node-joining-service.js';
import {NodeService} from './node/node-service.js';
import {assertCritical} from './utils/assert.js';
import {ModuleMirror} from './wasm-service/module-mirror.js';
import {WasmExecutor} from './wasm-service/wasm-executor.js';
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
 * @return {Function}
 */
function createServiceDiagnosticsProvider(owner) {
  return () => {
    const lifecycleManager = owner?.serviceLifecycleManager || null;
    const reconciler = owner?.serviceReconciler || null;

    const lifecycleDiagnostics = lifecycleManager?.getDiagnosticsReport ?
      lifecycleManager.getDiagnosticsReport() :
      null;
    const reconcilerDiagnostics = reconciler?.getDiagnosticsReport ?
      reconciler.getDiagnosticsReport() :
      null;

    if (!lifecycleDiagnostics && !reconcilerDiagnostics) {
      return null;
    }

    return {
      lifecycle: lifecycleDiagnostics,
      reconciler: reconcilerDiagnostics,
    };
  };
}

/**
 * Connect structured logging persistence to the replicated logs table.
 * @param {Object|null} cdcIntegrationService - CDC integration service.
 * @param {Object} logger - Entrypoint logger.
 * @return {Promise<LogsTableService|null>} Logs table service when connected.
 */
async function connectLogsTablePersistence(cdcIntegrationService, logger) {
  if (!cdcIntegrationService) {
    logger.warn(ENTRYPOINT_LOG_MSG.LOGS_TABLE_CONNECT_SKIPPED);
    return null;
  }

  try {
    const logsTableService = LogsTableService.getInstance();
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
 * @return {{getService: Function, promise: Promise<LogsTableService|null>}}
 */
function startLogsTablePersistence(cdcIntegrationService, logger) {
  let connectedService = null;

  const promise = connectLogsTablePersistence(
    cdcIntegrationService,
    logger,
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

    const nodeJoiningService = new NodeJoiningService({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      nodeAddress: config.get(CONFIG_KEY.NODE_ADDRESS) ||
        `${ENTRYPOINT_DEFAULT.LOCALHOST}:${config.get(CONFIG_KEY.NODE_REST_API_PORT)}`,
      seedNodeAddress: seedUrl,
      wsPort: wsPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

    const joinResult = await nodeJoiningService.join();

    if (!joinResult.success) {
      mainLogger.error(ENTRYPOINT_LOG_MSG.FAILED_JOIN, {
        error: joinResult.error,
        phase: joinResult.phase,
      });
      process.exit(1);
    }

    const joinLogsPersistence = startLogsTablePersistence(
      nodeJoiningService.cdcIntegrationService,
      mainLogger,
    );

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

    // Create SQL query engine for transparent query routing
    let sqlQueryEngine = null;
    if (joinResult.messageRouter) {
      const {SQLQueryEngine} = await import('./query/sql-query-engine.js');
      const wasmExecutor = createSqlCallbackWasmExecutor();
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: joinResult.messageRouter,
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        runtimeDriverRegistry: nodeJoiningService.runtimeDriverRegistry,
        serviceRuntimeLifecycle: nodeJoiningService.serviceRuntimeLifecycle,
        wasmExecutor,
      });
    }

    // Start Admin WebSocket API for this node
    const adminAPI = new AdminWebSocketAPI({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      serviceDiagnosticsProvider:
        createServiceDiagnosticsProvider(nodeJoiningService),
    });

    const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
    await adminAPI.initialize(adminPort);

    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

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
        const joinLogsTableService =
          joinLogsPersistence.getService() ||
          await joinLogsPersistence.promise;
        await shutdownLogsTablePersistence(joinLogsTableService, mainLogger);
        await nodeJoiningService.cleanup();
        await adminAPI.shutdown();
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
    });

    const bootstrapResult = await bootstrapService.bootstrap();

    if (!bootstrapResult.success) {
      mainLogger.error(ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED, {
        error: bootstrapResult.error,
      });
      process.exit(1);
    }

    const seedLogsPersistence = startLogsTablePersistence(
      bootstrapService.cdcIntegrationService,
      mainLogger,
    );

    mainLogger.info(ENTRYPOINT_LOG_MSG.BOOTSTRAP_COMPLETED, {
      servicesCreated: bootstrapResult.servicesCreated,
      partitionsCreated: bootstrapResult.partitionsCreated,
      messageGroupsCreated: bootstrapResult.messageGroupsCreated,
    });

    // Start Bootstrap API for node discovery
    // Get system table cache from NodeService singleton
    const systemTableCache = NodeService.getInstance().getSystemTableCache();

    const bootstrapAPI = new BootstrapAPI({
      seedNodeId: config.get(CONFIG_KEY.NODE_ID),
      seedNodeAddress: config.get(CONFIG_KEY.NODE_ADDRESS),
      wsPort: wsPort,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      replicaHandler: bootstrapResult.replicaHandler,
      systemTableCache: systemTableCache,
      bootstrapService: bootstrapService,
    });

    await bootstrapAPI.initialize();

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
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      runtimeDriverRegistry: bootstrapService.runtimeDriverRegistry,
      serviceRuntimeLifecycle: bootstrapService.serviceRuntimeLifecycle,
      wasmExecutor,
    });

    // Set SQL query engine on bootstrap API for distributed node registration
    bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);

    // Start Admin WebSocket API
    const adminAPI = new AdminWebSocketAPI({
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      systemTableCache,
      sqlQueryEngine,
      serviceDiagnosticsProvider:
        createServiceDiagnosticsProvider(bootstrapService),
    });

    const adminPort = ADMIN_DEFAULT.WEBSOCKET_PORT;
    await adminAPI.initialize(adminPort);

    mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
      adminWebSocketPort: adminPort,
      dataDir: dataDirectoryManager.getDataDir(),
    });

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
        const seedLogsTableService =
          seedLogsPersistence.getService() ||
          await seedLogsPersistence.promise;
        await shutdownLogsTablePersistence(seedLogsTableService, mainLogger);
        await bootstrapService.shutdown();
        await bootstrapAPI.shutdown();
        await adminAPI.shutdown();
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
