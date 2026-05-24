import {LIFECYCLE_REASON} from
  './bootstrap/lifecycle-controller-constants.js';
import {createDynamicConfigStartupWiring} from
  './config/dynamic-config-startup-wiring.js';
import {createControlPlaneRuntimeBundle} from
  './control-plane/control-plane-runtime-bundle.js';
import {createSystemMetadataOwners} from './control-plane/owners/index.js';
import {
  startLogsTablePersistenceOnReadiness,
} from './logging/logs-persistence-startup.js';
import {LogsTableService} from './logging/logs-table-service.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_LOG_MSG,
} from './constants/entrypoint.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_VPBYI = 'Failed to publish node shutdown status';
const LOCAL_STR_14077 = 'Shutdown already in progress, forcing process exit';
const LOCAL_STR_SIGINT = 'SIGINT';
const LOCAL_STR_SIGTERM = 'SIGTERM';
const LOCAL_STR_BEFOREEXIT = 'beforeExit';
const LOCAL_STR_EXIT = 'exit';
const LOCAL_STR_DA12T = 'uncaughtExceptionMonitor';
const LOCAL_STR_UNHANDLEDREJECTION = 'unhandledRejection';

/**
 * Connect structured logging persistence to the replicated logs table.
 * @param {Object|null} cdcIntegrationService
 * @param {Object} logger
 * @param {Object} rolloutControls
 * @return {Promise<LogsTableService|null>}
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
 * @param {Object|null} cdcIntegrationService
 * @param {Object} logger
 * @param {Object} rolloutControls
 * @param {Object|null} readinessState
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
 * @param {LogsTableService|null} logsTableService
 * @param {Object} logger
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
 * Publish one best-effort terminal node row before tearing down the control
 * plane path during process shutdown.
 * @param {Object|null} heartbeatService
 * @param {Object} logger
 * @param {string} nodeId
 * @return {Promise<void>}
 */
async function publishNodeShutdownStatus(heartbeatService, logger, nodeId) {
  if (typeof heartbeatService?.reportNodeShutdown !== LOCAL_STR_FUNCTION) {
    return;
  }

  try {
    await heartbeatService.reportNodeShutdown();
  } catch (error) {
    logger.warn(LOCAL_STR_VPBYI, {
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
 * Build one shared shutdown signal handler for seed and join branches.
 * @param {Object} options
 * @return {(signal: string) => Promise<void>}
 */
function createShutdownSignalHandler(options) {
  let shutdownSignalCount = LOCAL_NUM_ZERO;
  return async (signal) => {
    shutdownSignalCount++;
    if (shutdownSignalCount > LOCAL_NUM_ONE) {
      options.logger.warn(LOCAL_STR_14077, {
        signal,
      });
      process.exit(LOCAL_NUM_ONE);
      return;
    }

    options.logger.info(ENTRYPOINT_LOG_MSG.SHUTDOWN, {signal});
    try {
      const drainDeadlineMs =
        Date.now() + ENTRYPOINT_DEFAULT.READINESS_DRAIN_DEADLINE_MS;
      const drainingSnapshot =
        typeof options.membershipLifecycleController?.submitDrainIntent ===
          'function' ?
          await options.membershipLifecycleController.submitDrainIntent({
            drainDeadlineMs,
            reasonCode: LIFECYCLE_REASON.NODE_DRAINING,
            signal,
          }) :
          options.bootstrapAPI.markDraining({
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
      await options.rejoinHintsPersistence?.stop?.();
      shutdownDynamicConfigWiring(options.dynamicConfigWiring, options.logger);
      if (typeof options.detachMigrationRecovery === LOCAL_STR_FUNCTION) {
        options.detachMigrationRecovery();
      }
      await options.ownerCleanup();
      await options.bootstrapAPI.shutdown();
      await options.adminAPI.shutdown();
      options.liveQueryWiring.shutdown();
      process.exit(LOCAL_NUM_ZERO);
    } catch (error) {
      options.logger.error(options.failureMessage, {
        signal,
        error: error.message,
      });
      process.exit(LOCAL_NUM_ONE);
    }
  };
}

/**
 * Register shared shutdown signal listeners for process lifecycle.
 * @param {Function} shutdownHandler
 */
function registerShutdownSignalHandlers(shutdownHandler) {
  process.on(LOCAL_STR_SIGINT, () => {
    void shutdownHandler(LOCAL_STR_SIGINT);
  });
  process.on(LOCAL_STR_SIGTERM, () => {
    void shutdownHandler(LOCAL_STR_SIGTERM);
  });
}

/**
 * Register one-time process lifecycle diagnostics for early exit debugging.
 * @param {Object} logger
 * @param {Function} contextProvider
 */
function registerProcessLifecycleDiagnostics(logger, contextProvider) {
  const registrationKey = '__ddbProcessLifecycleDiagnosticsRegistered';
  if (globalThis[registrationKey]) {
    return;
  }
  globalThis[registrationKey] = true;
  const resolveContext = () => {
    if (typeof contextProvider !== 'function') {
      return {};
    }
    try {
      const context = contextProvider();
      return context && typeof context === 'object' ? context : {};
    } catch (_error) {
      return {};
    }
  };

  process.on(LOCAL_STR_BEFOREEXIT, (code) => {
    logger.info(ENTRYPOINT_LOG_MSG.PROCESS_BEFORE_EXIT, {
      code,
      ...resolveContext(),
    });
  });
  process.on(LOCAL_STR_EXIT, (code) => {
    logger.info(ENTRYPOINT_LOG_MSG.PROCESS_EXIT, {
      code,
      ...resolveContext(),
    });
  });
  process.on(LOCAL_STR_DA12T, (error, origin) => {
    logger.error(ENTRYPOINT_LOG_MSG.PROCESS_UNCAUGHT_EXCEPTION, {
      origin,
      error: error?.message || String(error),
      stack: error?.stack || null,
      ...resolveContext(),
    });
  });
  process.on(LOCAL_STR_UNHANDLEDREJECTION, (reason) => {
    logger.error(ENTRYPOINT_LOG_MSG.PROCESS_UNHANDLED_REJECTION, {
      error: reason?.message || String(reason),
      stack: reason?.stack || null,
      ...resolveContext(),
    });
  });
}

/**
 * Emit a short post-startup liveness pulse to detect early exit or server loss.
 * @param {Object} options
 */
function scheduleStartupLivenessPulse(options) {
  const logger = options?.logger;
  if (!logger || typeof logger.info !== LOCAL_STR_FUNCTION) {
    return;
  }
  let pulseCount = LOCAL_NUM_ZERO;
  const timer = setInterval(() => {
    pulseCount += 1;
    logger.info(ENTRYPOINT_LOG_MSG.STARTUP_LIVENESS_PULSE, {
      nodeId: options.nodeId,
      startupBranch: options.startupBranch,
      pulseCount,
      bootstrapApiInitialized:
        options.bootstrapAPI?.isInitialized?.() === true,
      bootstrapApiHasFastify: Boolean(options.bootstrapAPI?.fastify),
      bootstrapApiServerListening:
        options.bootstrapAPI?.fastify?.server?.listening === true,
      bootstrapApiHasSqlQueryEngine: Boolean(options.bootstrapAPI?.sqlQueryEngine),
      bootstrapApiHasMessageRouter: Boolean(options.bootstrapAPI?.messageRouter),
      startupPhase: options.startupOwner?.phase || null,
      pid: process.pid,
    });
    if (pulseCount >= 10) {
      clearInterval(timer);
    }
  }, 2000);
  if (typeof timer.unref === LOCAL_STR_FUNCTION) {
    timer.unref();
  }
}

export {
  createShutdownSignalHandler,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  scheduleStartupLivenessPulse,
  shutdownDynamicConfigWiring,
  startDynamicConfigWiring,
  startLogsTablePersistence,
};
