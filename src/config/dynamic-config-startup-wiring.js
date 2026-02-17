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
});

const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD = Object.freeze({
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]:
    DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS,
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

  return Number.isFinite(heartbeatMs) &&
    Number.isFinite(electionTimeoutMinMs) &&
    Number.isFinite(electionTimeoutMaxMs) &&
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

  const raftTimingConfig = getRaftTimingConfig(configManager);

  const applyRaftTimingConfig = (nextRaftTimingConfig) => {
    if (!isValidRaftTimingConfig(nextRaftTimingConfig)) {
      return;
    }

    writeRaftTimingConfig(configManager, nextRaftTimingConfig);
    for (const service of raftServices) {
      if (!service ||
        typeof service.applyRaftTimingConfig !== TYPEOF.FUNCTION) {
        continue;
      }
      try {
        service.applyRaftTimingConfig({...nextRaftTimingConfig});
      } catch (error) {
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.RAFT_TIMING_APPLY_FAILED, {
          error: error.message,
        });
      }
    }
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

  for (const entry of loggingDynamicAppliers) {
    try {
      const value = await dynamicConfigService.get(entry.key);
      entry.apply(value);
    } catch (error) {
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, {
        key: entry.key,
        error: error.message,
      });
    }
  }

  for (const key of DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS) {
    try {
      const value = await dynamicConfigService.get(key);
      if (!Number.isFinite(value)) {
        continue;
      }
      const field = DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key];
      if (!field) {
        continue;
      }
      raftTimingConfig[field] = value;
    } catch (error) {
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, {
        key,
        error: error.message,
      });
    }
  }
  applyRaftTimingConfig(raftTimingConfig);

  let adaptiveTimingController = null;
  try {
    adaptiveTimingController = new RaftAdaptiveTimingController({
      dynamicConfigService,
      nodeId: options.nodeId || null,
      owner: options.runtimeOwner || null,
    });
    await adaptiveTimingController.initialize();
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
