/**
 * Dynamic configuration startup wiring helpers.
 *
 * Creates one startup-owned hot-reload bridge for runtime config keys that
 * can be applied without restart.
 */

import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {ConfigurationManager} from './configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  CONFIG_KEY,
  CONFIG_SUBSYSTEM,
  CONFIG_TABLE_COLUMN,
} from './config-constants.js';
import {DynamicConfigService} from './dynamic-config-service.js';
import {
  trackRaftTimingApplySweep,
} from '../diagnostics/raft-churn-sync-sections.js';
import {RaftAdaptiveTimingController} from
  './raft-adaptive-timing-controller.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

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
  STARTUP_READ_SUPERSEDED_BY_CDC:
    'Startup dynamic config read dropped: a CDC apply for its key won',
  STARTUP_VALUE_REFUSED: 'Startup dynamic config value refused, not applied',
  ADAPTIVE_CONTROLLER_ADOPTED_LATE:
    'Raft adaptive timing controller initialized after its startup bound and adopted',
});

// What became of each piece of startup work the wiring owns
// (dynamic-config-startup-owned-initialization). A spent bound is a reported
// late state, never an abandonment: the work stays owned and its result is
// applied through the one apply path when it arrives.
const DYNAMIC_CONFIG_STARTUP_OUTCOME = Object.freeze({
  PENDING: 'pending',
  APPLIED: 'applied',
  APPLIED_LATE: 'applied_late',
  REFUSED: 'refused',
  HEALED_BY_CDC: 'healed_by_cdc',
  DROPPED_STALE: 'dropped_stale',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ADOPTED_LATE: 'adopted_late',
  UNAVAILABLE: 'unavailable',
});
// What one apply of a startup value did. A raft timing key read before the
// startup sweep has no answer yet: the sweep decides for all of them.
const STARTUP_APPLY_RESULT = Object.freeze({
  APPLIED: 'applied',
  REFUSED: 'refused',
  HELD_FOR_SWEEP: 'held_for_sweep',
});
const DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS = 300; // ends-on: the dynamicConfigService.get(key) read resolves
const DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS = 300; // ends-on: the adaptiveTimingController.initialize() call resolves
const STARTUP_INITIAL_READ_WAIT = Object.freeze({
  wait: 'DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS',
  awaited: 'startup dynamic-config key read (still owned; applied when it arrives)',
});
const STARTUP_CONTROLLER_INIT_WAIT = Object.freeze({
  wait: 'DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS',
  awaited: 'adaptive timing controller initialize (still owned; adopted when it completes)',
});

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
 * Wait for owned startup work up to a bound, without abandoning it. Resolves
 * when the work settles or when the bound is spent, whichever is first; a
 * spent bound calls onSpent once and leaves the work running, still owned by
 * the caller, whose own handlers receive its result. The timer is unref'd
 * and held in `timers` so the owner's shutdown clears it.
 * @param {Promise<*>} work
 * @param {number} boundMs
 * @param {Function} onSpent
 * @param {Set<*>} timers
 * @return {Promise<void>}
 */
function waitWithinBound(work, boundMs, onSpent, timers) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      onSpent();
      resolve();
    }, boundMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    timers.add(timer);
    const settle = () => {
      clearTimeout(timer);
      timers.delete(timer);
      resolve();
    };
    work.then(settle, settle);
  });
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

  if (typeof services.values === 'function') {
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
    // Sync-section attribution (instrumentation-only): tag the per-service
    // raft-timing sweep for the gap watchdog. See raft-churn-sync-sections.js.
    return trackRaftTimingApplySweep(() => {
      let runtimeAppliedCount = 0;
      let deferredCount = 0;
      for (const service of raftServices) {
        if (!service ||
          typeof service.applyRaftTimingConfig !== 'function') {
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
    });
  };

  const loggingDynamicAppliers = [
    {
      key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      apply: (value) => {
        if (typeof value !== 'boolean') {
          return false;
        }
        loggingService.setPersistMetricsLogs(value);
        return true;
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
      apply: (value) => {
        if (!Number.isFinite(value) || value < 0) {
          return false;
        }
        loggingService.setMetricsDefaultResolutionMs(value);
        return true;
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
      apply: (value) => {
        if (!Number.isFinite(value) || value < 1000) {
          return false;
        }
        loggingService.setMetricsDetailedWindowTtlMs(value);
        return true;
      },
    },
    {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
      apply: (value) => {
        if (typeof value !== 'boolean') {
          return false;
        }
        loggingService.setMetricsDetailedWindowEnabled(value);
        return true;
      },
    },
  ];

  // One apply path for every startup key, on time or late: a logging key
  // applies at once; a raft timing key joins the startup sweep while it has
  // not run, and applies its own sweep after it.
  const loggingApplierByKey = new Map(
    loggingDynamicAppliers.map((entry) => [entry.key, entry.apply]));
  const readOutcomes = new Map();
  // raftTimingConfig is the working set: only values a sweep accepted. A raft
  // value waiting on a sweep, or refused by one, is held here beside it, so it
  // can never block a later sweep, and a value only valid together with
  // another key still applies when that key arrives.
  const heldRaftValues = new Map();
  let startupSweepDone = false;
  // A failed read is not retried and a refused value is not re-read: the key
  // stays named so until a CDC apply for it resolves it.
  const healFromCdc = (key) => {
    const outcome = readOutcomes.get(key);
    if (outcome === DYNAMIC_CONFIG_STARTUP_OUTCOME.FAILED ||
      outcome === DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED) {
      readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.HEALED_BY_CDC);
    }
  };
  const settleHeldAsApplied = () => {
    for (const [key, held] of heldRaftValues) {
      if (held.fromCdc) {
        healFromCdc(key);
      } else {
        readOutcomes.set(key, held.late ?
          DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED_LATE :
          DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED);
      }
    }
    heldRaftValues.clear();
  };
  const refuseHeldReads = () => {
    for (const [key, held] of heldRaftValues) {
      if (!held.fromCdc &&
        readOutcomes.get(key) !== DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED) {
        readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED);
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.STARTUP_VALUE_REFUSED, {key});
      }
    }
  };
  // The one raft timing sweep, for a read and for a CDC apply (`change`).
  const sweepRaftTiming = (change = null) => {
    const withChange = {...raftTimingConfig};
    if (change) {
      heldRaftValues.delete(change.key);
      withChange[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[change.key]] = change.value;
    }
    const withHeld = {...withChange};
    for (const [key, held] of heldRaftValues) {
      withHeld[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key]] = held.value;
    }
    if (applyRaftTimingConfig(withHeld).applied) {
      Object.assign(raftTimingConfig, withHeld);
      settleHeldAsApplied();
      if (change) {
        healFromCdc(change.key);
      }
      return;
    }
    if (startupSweepDone) {
      refuseHeldReads();
    }
    if (!change) {
      return;
    }
    if (applyRaftTimingConfig(withChange).applied) {
      Object.assign(raftTimingConfig, withChange);
      healFromCdc(change.key);
      return;
    }
    heldRaftValues.set(change.key, {value: change.value, fromCdc: true});
    logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.STARTUP_VALUE_REFUSED, {key: change.key});
  };
  const applyStartupValue = (key, value, late) => {
    const applyLogging = loggingApplierByKey.get(key);
    if (applyLogging) {
      return applyLogging(value) ?
        STARTUP_APPLY_RESULT.APPLIED :
        STARTUP_APPLY_RESULT.REFUSED;
    }
    if (!DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key] || !Number.isFinite(value)) {
      return STARTUP_APPLY_RESULT.REFUSED;
    }
    heldRaftValues.set(key, {value, late});
    return STARTUP_APPLY_RESULT.HELD_FOR_SWEEP;
  };
  const dropHeldValue = (key) => {
    const held = heldRaftValues.get(key);
    if (held && !held.fromCdc) {
      readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.DROPPED_STALE);
    }
    heldRaftValues.delete(key);
  };
  // A CDC value for a key, through the watcher or the heal below.
  const adoptCdcValue = (key, value) => {
    const applyLogging = loggingApplierByKey.get(key);
    if (applyLogging) {
      if (applyLogging(value)) {
        healFromCdc(key);
      }
      return;
    }
    if (Number.isFinite(value)) {
      sweepRaftTiming({key, value});
    }
  };

  for (const key of [
    ...loggingDynamicAppliers.map((entry) => entry.key),
    ...DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS,
  ]) {
    watcherUnsubscribers.push(dynamicConfigService.watch(
      key,
      (newValue) => adoptCdcValue(key, newValue),
    ));
  }

  let closed = false;
  // Subscribed before any startup read starts, so a CDC apply during a read
  // is always seen. The service counts the applies per key; a read whose key
  // was CDC-applied since it started is stale and dropped, and the CDC value
  // wins (dynamicConfigService.cdcApplySequence, the one ordering authority).
  const subscribedServices = [];
  const handleCdcApplied = (cdcEvent) => {
    if (!cdcEvent || cdcEvent.tableName !== TABLES.CONFIG) {
      return;
    }

    // CDC wins over a held value too: a deleted row's value never applies.
    const key = cdcEvent.data?.[CONFIG_TABLE_COLUMN.KEY];
    const deleted = cdcEvent.operation === CDC_OPERATION.DELETE;
    if (deleted) {
      dropHeldValue(key);
    }
    // A CDC value equal to the cached one fires no watcher, so a key still
    // failed or refused here adopts it directly.
    void dynamicConfigService.handleCDCEvent(cdcEvent).then(async () => {
      const outcome = readOutcomes.get(key);
      if (deleted ||
        (outcome !== DYNAMIC_CONFIG_STARTUP_OUTCOME.FAILED &&
          outcome !== DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED)) {
        return;
      }
      const value = await dynamicConfigService.get(key);
      if (!closed) {
        adoptCdcValue(key, value);
      }
    }).catch((error) => {
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.CDC_APPLY_FAILED, {
        error: error.message,
      });
    });
  };

  for (const messageGroupService of normalizeServicesCollection(
    options.messageGroupServices,
  )) {
    if (!messageGroupService ||
      typeof messageGroupService.on !== 'function' ||
      typeof messageGroupService.removeListener !== 'function') {
      continue;
    }

    messageGroupService.on(
      DYNAMIC_CONFIG_STARTUP_EVENT.CDC_APPLIED,
      handleCdcApplied,
    );
    subscribedServices.push(messageGroupService);
  }

  // Everything the wiring starts it owns until shutdown: the bound timers,
  // each startup read and the controller's initialize.
  const timers = new Set();
  const settleStartupRead = (key, value, cdcSeqAtStart, state) => {
    if (closed) {
      readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.CANCELLED);
      return;
    }
    if (dynamicConfigService.cdcApplySequence(key) !== cdcSeqAtStart) {
      readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.DROPPED_STALE);
      logger.info?.(DYNAMIC_CONFIG_STARTUP_LOG_MSG.STARTUP_READ_SUPERSEDED_BY_CDC, {key});
      return;
    }
    const result = applyStartupValue(key, value, state.late);
    if (result === STARTUP_APPLY_RESULT.HELD_FOR_SWEEP) {
      if (startupSweepDone) {
        sweepRaftTiming();
      }
      return;
    }
    if (result === STARTUP_APPLY_RESULT.REFUSED) {
      readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED);
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.STARTUP_VALUE_REFUSED, {key});
      return;
    }
    readOutcomes.set(key, state.late ?
      DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED_LATE :
      DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED);
  };
  const ownStartupRead = (key) => {
    const startedAtMs = Date.now();
    const cdcSeqAtStart = dynamicConfigService.cdcApplySequence(key);
    const state = {late: false};
    readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.PENDING);
    const read = Promise.resolve()
      .then(() => dynamicConfigService.get(key))
      .then((value) => settleStartupRead(key, value, cdcSeqAtStart, state))
      .catch((error) => {
        readOutcomes.set(key, DYNAMIC_CONFIG_STARTUP_OUTCOME.FAILED);
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, {
          key,
          error: error?.message,
          retried: false,
        });
      });
    return waitWithinBound(read, initialReadTimeoutMs, () => {
      state.late = true;
      reportWaitBoundSpent(logger, {
        ...STARTUP_INITIAL_READ_WAIT,
        boundMs: initialReadTimeoutMs,
        startedAtMs,
        lastObserved: {readSettled: false},
        scope: {nodeId: options.nodeId || null, key},
      });
    }, timers);
  };

  await Promise.all([
    ...loggingDynamicAppliers.map((entry) => ownStartupRead(entry.key)),
    ...DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS.map((key) => ownStartupRead(key)),
  ]);
  startupSweepDone = true;
  sweepRaftTiming();

  // The controller is held from construction until shutdown: one reference,
  // never dropped. A spent bound adopts it when its initialize completes
  // (the controller starts its own loop then, if enabled, as on time); a
  // shutdown stops it, and an initialize still in flight starts nothing
  // after that (RaftAdaptiveTimingController#initialize checks `stopped`).
  let adaptiveTimingController = null;
  let controllerOutcome = DYNAMIC_CONFIG_STARTUP_OUTCOME.UNAVAILABLE;
  try {
    adaptiveTimingController = new RaftAdaptiveTimingController({
      dynamicConfigService,
      nodeId: options.nodeId || null,
      owner: options.runtimeOwner || null,
    });
  } catch (error) {
    logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_INIT_FAILED, {
      error: error.message,
    });
  }
  if (adaptiveTimingController) {
    const controller = adaptiveTimingController;
    const startedAtMs = Date.now();
    let late = false;
    controllerOutcome = DYNAMIC_CONFIG_STARTUP_OUTCOME.PENDING;
    const initialization = Promise.resolve().then(() => controller.initialize());
    initialization.then(() => {
      if (closed) {
        controllerOutcome = DYNAMIC_CONFIG_STARTUP_OUTCOME.CANCELLED;
        return;
      }
      controllerOutcome = late ?
        DYNAMIC_CONFIG_STARTUP_OUTCOME.ADOPTED_LATE :
        DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED;
      if (late) {
        logger.info?.(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_ADOPTED_LATE, {
          nodeId: options.nodeId || null,
        });
      }
    }, (error) => {
      controllerOutcome = DYNAMIC_CONFIG_STARTUP_OUTCOME.FAILED;
      logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_INIT_FAILED, {
        error: error?.message,
      });
      try {
        controller.shutdown();
      } catch (shutdownError) {
        logger.warn(
          DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_SHUTDOWN_FAILED,
          {error: shutdownError?.message},
        );
      }
    });
    await waitWithinBound(initialization, controllerInitTimeoutMs, () => {
      late = true;
      reportWaitBoundSpent(logger, {
        ...STARTUP_CONTROLLER_INIT_WAIT,
        boundMs: controllerInitTimeoutMs,
        startedAtMs,
        lastObserved: {initializeSettled: false},
        scope: {nodeId: options.nodeId || null},
      });
    }, timers);
  }

  return {
    dynamicConfigService,
    /**
     * What became of the startup work (DYNAMIC_CONFIG_STARTUP_OUTCOME).
     * @return {{reads: Object<string, string>, controller: string}}
     */
    startupOutcome: () => ({
      reads: Object.fromEntries(readOutcomes),
      controller: controllerOutcome,
    }),
    shutdown: () => {
      closed = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
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
  DYNAMIC_CONFIG_STARTUP_OUTCOME,
  createDynamicConfigStartupWiring,
};
