/**
 * Dynamic configuration startup wiring helpers.
 *
 * Creates one startup-owned hot-reload bridge for runtime config keys that
 * can be applied without restart.
 */

import {TABLES, TYPEOF} from '../constants/index.js';
import {ConfigurationManager} from './configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  CONFIG_KEY,
  CONFIG_SUBSYSTEM,
} from './config-constants.js';
import {DynamicConfigService} from './dynamic-config-service.js';
import {RaftAdaptiveTimingController} from
  './raft-adaptive-timing-controller.js';

const DYNAMIC_CONFIG_STARTUP_EVENT = Object.freeze({
  CDC_APPLIED: 'cdcApplied',
});

const DYNAMIC_CONFIG_STARTUP_LOG_MSG = Object.freeze({
  INITIAL_APPLY_FAILED: 'Failed to apply initial dynamic config setting',
  CDC_APPLY_FAILED: 'Failed to apply dynamic config CDC update',
  RAFT_TIMING_APPLY_FAILED: 'Failed to apply runtime raft timing config',
  ADAPTIVE_CONTROLLER_INIT_FAILED:
    'Failed to initialize raft adaptive timing controller',
  ADAPTIVE_CONTROLLER_SHUTDOWN_FAILED:
    'Failed to shutdown raft adaptive timing controller',
});
const DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS = 300;
const DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS = 300;

/**
 * Resolve startup read timeout for initial dynamic-config hydration.
 * @param {Object} options
 * @return {number}
 */
function resolveInitialReadTimeoutMs(options = {}) {
  const timeoutMs = Number(options.initialReadTimeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS;
}

/**
 * Resolve startup timeout for adaptive timing controller initialization.
 * @param {Object} options
 * @return {number}
 */
function resolveControllerInitTimeoutMs(options = {}) {
  const timeoutMs = Number(options.controllerInitTimeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS;
}

/**
 * Apply timeout to a promise.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} errorMessage
 * @return {Promise<*>}
 */
function withTimeout(promise, timeoutMs, errorMessage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(errorMessage));
    }, timeoutMs);
    if (typeof timer.unref === TYPEOF.FUNCTION) {
      timer.unref();
    }
    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Read one dynamic-config key with bounded startup latency.
 * @param {Object} dynamicConfigService
 * @param {string} key
 * @param {number} timeoutMs
 * @return {Promise<*>}
 */
async function readStartupConfigValue(dynamicConfigService, key, timeoutMs) {
  return withTimeout(
    dynamicConfigService.get(key),
    timeoutMs,
    'Timed out reading startup dynamic config key ' + key +
      ' after ' + timeoutMs + 'ms',
  );
}

/**
 * Normalize service collection to a flat array.
 * @param {Map<string, Object>|Array<Object>|Object|null} services
 * @return {Array<Object>}
 */
function normalizeServicesCollection(services) {
  if (!services) {
    return [];
  }

  if (Array.isArray(services)) {
    return services;
  }

  if (typeof services.values === TYPEOF.FUNCTION) {
    return Array.from(services.values());
  }

  return [services];
}

const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD = Object.freeze({
  HEARTBEAT_INTERVAL_MS: 'heartbeatIntervalMs',
  ELECTION_TIMEOUT_MIN_MS: 'electionTimeoutMinMs',
  ELECTION_TIMEOUT_MAX_MS: 'electionTimeoutMaxMs',
  TICK_INTERVAL_MS: 'tickIntervalMs',
});

const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD = Object.freeze({
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS,
  [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS,
});

const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS = Object.freeze(
  Object.keys(DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD),
);

/**
 * Read raft timing values from configuration manager.
 * @param {ConfigurationManager} configManager
 * @return {Object}
 */
function getRaftTimingConfig(configManager) {
  return {
    [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS]:
      configManager.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS),
    [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS]:
      configManager.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS),
    [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS]:
      configManager.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS),
    [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS]:
      configManager.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS),
  };
}

/**
 * Check whether raft timing config values are valid.
 * @param {Object} raftTimingConfig
 * @return {boolean}
 */
function isValidRaftTimingConfig(raftTimingConfig) {
  const heartbeatMs =
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS];
  const electionTimeoutMinMs =
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS];
  const electionTimeoutMaxMs =
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS];
  const tickIntervalMs =
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS];

  return Number.isFinite(heartbeatMs) &&
    Number.isFinite(electionTimeoutMinMs) &&
    Number.isFinite(electionTimeoutMaxMs) &&
    Number.isFinite(tickIntervalMs) &&
    tickIntervalMs > 0 &&
    electionTimeoutMinMs <= electionTimeoutMaxMs;
}

/**
 * Write raft timing values to configuration manager for future replicas.
 * @param {ConfigurationManager} configManager
 * @param {Object} raftTimingConfig
 */
function writeRaftTimingConfig(configManager, raftTimingConfig) {
  configManager.setByPath(
    CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS],
  );
  configManager.setByPath(
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS],
  );
  configManager.setByPath(
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS],
  );
  configManager.setByPath(
    CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
    raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS],
  );
}

/**
 * Create startup-owned dynamic config runtime wiring.
 * @param {Object} [options]
 * @param {string} [options.nodeId]
 * @param {Object} [options.systemTableCache]
 * @param {Object} [options.sqlQueryEngine]
 * @param {Map<string, Object>|Array<Object>|Object} [options.messageGroupServices]
 * @param {Map<string, Object>|Array<Object>|Object} [options.partitionServices]
 * @param {Object|null} [options.runtimeOwner]
 * @param {number} [options.initialReadTimeoutMs]
 * @return {Promise<{
 *   dynamicConfigService: DynamicConfigService,
  *   shutdown: Function
 * }>}
 */
async function createDynamicConfigStartupWiring(options = {}) {
  const loggingService = LoggingService.getInstance();
  const logger = loggingService.isInitialized() ?
    loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) :
    console;

  const dynamicConfigService = new DynamicConfigService({
    nodeId: options.nodeId || null,
    systemTableCache: options.systemTableCache || null,
    sqlQueryEngine: options.sqlQueryEngine || null,
  });
  await dynamicConfigService.initialize();
  const configManager = ConfigurationManager.getInstance();
  const raftServices = [
    ...normalizeServicesCollection(options.messageGroupServices),
    ...normalizeServicesCollection(options.partitionServices),
  ];
  const watcherUnsubscribers = [];
  const initialReadTimeoutMs = resolveInitialReadTimeoutMs(options);
  const controllerInitTimeoutMs = resolveControllerInitTimeoutMs(options);

  const raftTimingConfig = getRaftTimingConfig(configManager);

  // Runtime timing updates are best-effort per live service:
  // - `true` return value means applied immediately.
  // - `false`/missing method means deferred (restart/new replica path only).
  // ConfigManager is always updated so future replicas see canonical values.
  const applyRaftTimingConfig = (nextRaftTimingConfig) => {
    if (!isValidRaftTimingConfig(nextRaftTimingConfig)) {
      return {
        applied: false,
        runtimeAppliedCount: 0,
        deferredCount: raftServices.length,
      };
    }

    writeRaftTimingConfig(configManager, nextRaftTimingConfig);
    let runtimeAppliedCount = 0;
    let deferredCount = 0;
    for (const service of raftServices) {
      if (!service ||
        typeof service.applyRaftTimingConfig !== TYPEOF.FUNCTION) {
        deferredCount += 1;
        continue;
      }
      try {
        const runtimeApplied = service.applyRaftTimingConfig(
          {...nextRaftTimingConfig},
        );
        if (runtimeApplied) {
          runtimeAppliedCount += 1;
        } else {
          deferredCount += 1;
        }
      } catch (error) {
        deferredCount += 1;
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.RAFT_TIMING_APPLY_FAILED, {
          error: error.message,
        });
      }
    }

    return {
      applied: true,
      runtimeAppliedCount,
      deferredCount,
    };
  };

  const loggingDynamicAppliers = [
    {
      key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      apply: (value) => {
        if (typeof value !== TYPEOF.BOOLEAN) {
          return;
        }
        loggingService.setPersistMetricsLogs(value);
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
      apply: (value) => {
        if (!Number.isFinite(value) || value < 0) {
          return;
        }
        loggingService.setMetricsDefaultResolutionMs(value);
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
      apply: (value) => {
        if (!Number.isFinite(value) || value < 1000) {
          return;
        }
        loggingService.setMetricsDetailedWindowTtlMs(value);
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
      apply: (value) => {
        if (typeof value !== TYPEOF.BOOLEAN) {
          return;
        }
        loggingService.setMetricsDetailedWindowEnabled(value);
      },
    },
  ];

  for (const entry of loggingDynamicAppliers) {
    watcherUnsubscribers.push(dynamicConfigService.watch(
      entry.key,
      (newValue) => {
        entry.apply(newValue);
      },
    ));
  }

  for (const key of DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS) {
    watcherUnsubscribers.push(dynamicConfigService.watch(
      key,
      (newValue) => {
        if (!Number.isFinite(newValue)) {
          return;
        }
        const field = DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key];
        if (!field) {
          return;
        }
        raftTimingConfig[field] = newValue;
        applyRaftTimingConfig(raftTimingConfig);
      },
    ));
  }

  const initialReadTasks = [];
  for (const entry of loggingDynamicAppliers) {
    initialReadTasks.push((async () => {
      try {
        const value = await readStartupConfigValue(
          dynamicConfigService,
          entry.key,
          initialReadTimeoutMs,
        );
        entry.apply(value);
      } catch (error) {
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, {
          key: entry.key,
          error: error.message,
        });
      }
    })());
  }
  for (const key of DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS) {
    initialReadTasks.push((async () => {
      try {
        const value = await readStartupConfigValue(
          dynamicConfigService,
          key,
          initialReadTimeoutMs,
        );
        if (!Number.isFinite(value)) {
          return;
        }
        const field = DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key];
        if (!field) {
          return;
        }
        raftTimingConfig[field] = value;
      } catch (error) {
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, {
          key,
          error: error.message,
        });
      }
    })());
  }
  await Promise.all(initialReadTasks);
  applyRaftTimingConfig(raftTimingConfig);

  let adaptiveTimingController = null;
  try {
    adaptiveTimingController = new RaftAdaptiveTimingController({
      dynamicConfigService,
      nodeId: options.nodeId || null,
      owner: options.runtimeOwner || null,
    });
    await withTimeout(
      adaptiveTimingController.initialize(),
      controllerInitTimeoutMs,
      'Timed out initializing adaptive timing controller after ' +
        controllerInitTimeoutMs + 'ms',
    );
  } catch (error) {
    adaptiveTimingController = null;
    logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_INIT_FAILED, {
      error: error.message,
    });
  }

  const subscribedServices = [];
  const handleCdcApplied = (cdcEvent) => {
    if (!cdcEvent || cdcEvent.tableName !== TABLES.CONFIG) {
      return;
    }

    void dynamicConfigService.handleCDCEvent(cdcEvent).catch((error) => {
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.CDC_APPLY_FAILED, {
        error: error.message,
      });
    });
  };

  for (const messageGroupService of normalizeServicesCollection(
    options.messageGroupServices,
  )) {
    if (!messageGroupService ||
      typeof messageGroupService.on !== TYPEOF.FUNCTION ||
      typeof messageGroupService.removeListener !== TYPEOF.FUNCTION) {
      continue;
    }

    messageGroupService.on(
      DYNAMIC_CONFIG_STARTUP_EVENT.CDC_APPLIED,
      handleCdcApplied,
    );
    subscribedServices.push(messageGroupService);
  }

  return {
    dynamicConfigService,
    shutdown: () => {
      for (const messageGroupService of subscribedServices) {
        messageGroupService.removeListener(
          DYNAMIC_CONFIG_STARTUP_EVENT.CDC_APPLIED,
          handleCdcApplied,
        );
      }
      for (const unsubscribe of watcherUnsubscribers) {
        unsubscribe();
      }
      if (adaptiveTimingController) {
        try {
          adaptiveTimingController.shutdown();
        } catch (error) {
          logger.warn(
            DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_SHUTDOWN_FAILED,
            {error: error.message},
          );
        }
      }
    },
  };
}

export {
  createDynamicConfigStartupWiring,
};
