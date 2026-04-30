import {AdminWebSocketAPI} from './admin/admin-websocket-api.js';
import {ADMIN_DEFAULT} from './admin/admin-constants.js';
import {BootstrapReadinessState} from './bootstrap/bootstrap-readiness-state.js';
import {READINESS_EVENT} from
  './bootstrap/bootstrap-readiness-state-constants.js';
import {
  AUTO_REJOIN_DECISION_STATE,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
} from './bootstrap/rejoin-hints.js';
import {STARTUP_JOIN_MODE} from './bootstrap/rejoin-hints-constants.js';
import {LIFECYCLE_REASON} from './bootstrap/lifecycle-controller-constants.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {createDynamicConfigStartupWiring} from
  './config/dynamic-config-startup-wiring.js';
import {createControlPlaneRuntimeBundle} from './control-plane/control-plane-runtime-bundle.js';
import {createSystemMetadataOwners} from './control-plane/owners/index.js';
import {ResourceDiagnosticsSampler} from './diagnostics/resource-diagnostics-sampler.js';
import {createLiveQueryStartupWiring} from './live-query/live-query-startup-wiring.js';
import {
  startLogsTablePersistenceOnReadiness,
} from './logging/logs-persistence-startup.js';
import {LogsTableService} from './logging/logs-table-service.js';
import {wireMigrationWorkflowOwners} from './migration/migration-composition.js';
import {wireMigrationRecoveryOnLeaderElection} from
  './migration/migration-recovery-trigger.js';
import {createManagedSplitMetricsProvider} from
  './partition/managed-split-metrics-provider.js';
import {SPLIT_MERGE_EVENT} from './partition/partition-constants.js';
import {STABILIZATION_RESET_TRIGGER} from
  './rebalancer/rebalancer-constants.js';
import {resolveControlPlaneRolloutControls} from
  './runtime/control-plane-rollout-controls.js';
import {TRANSPORT_CONFIG_KEY} from './constants/transport.js';
import {resolveAdvertisedWebSocketAddress} from
  './transport/node-address-resolution.js';
import {assertCritical} from './utils/assert.js';
import {ModuleMirror} from './wasm-service/module-mirror.js';
import {WasmExecutor} from './wasm-service/wasm-executor.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_FLAG,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_TEXT,
} from './constants/entrypoint.js';
import {HTTP_STATUS, NUM, STRING, TYPEOF} from './constants/index.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_OPTIONS = 'Options:';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_VPBYI = 'Failed to publish node shutdown status';
const LOCAL_STR_1KAZK = 'startupRecoveryCoordinator';
const LOCAL_STR_11E2L = './query/sql-query-engine.js';
const LOCAL_STR_1SSS4 = './partition/partition-split-merge-manager.js';
const LOCAL_STR_14077 = 'Shutdown already in progress, forcing process exit';
const LOCAL_STR_SIGINT = 'SIGINT';
const LOCAL_STR_SIGTERM = 'SIGTERM';
const LOCAL_STR_BEFOREEXIT = 'beforeExit';
const LOCAL_STR_EXIT = 'exit';
const LOCAL_STR_DA12T = 'uncaughtExceptionMonitor';
const LOCAL_STR_UNHANDLEDREJECTION = 'unhandledRejection';

const STARTUP_JOIN_DECISION_SOURCE = Object.freeze({
  EXPLICIT: 'explicit',
});

const STARTUP_JOIN_DECISION_MODE = Object.freeze({
  FAIL: 'fail',
  JOIN: 'join',
});

const EXPLICIT_SEED_DECISION_STATE = Object.freeze({
  IDENTITY_MISMATCH: 'identity_mismatch',
  DURABLE_PROBED_PEER: 'durable_probed_peer',
  DURABLE_EXPLICIT_SEED: 'durable_explicit_seed',
  FRESH_EXPLICIT_SEED: 'fresh_explicit_seed',
});

const EXPLICIT_SEED_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.IDENTITY_MISMATCH,
    matches: (snapshot) => snapshot.identityMismatch === true,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.DURABLE_PROBED_PEER,
    matches: (snapshot) =>
      snapshot.hasDurablePeerAddress === true &&
      snapshot.autoRejoinState === AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.DURABLE_EXPLICIT_SEED,
    matches: (snapshot) =>
      snapshot.autoRejoinStartupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.FRESH_EXPLICIT_SEED,
    matches: () => true,
  }),
]);
const UNKNOWN_EXPLICIT_SEED_DECISION_STATE_ERROR_PREFIX =
  'Unknown explicit seed startup decision state: ';

/**
 * Check for version flag.
 * @param {string} version
 * @return {boolean} True if version was printed.
 */
function checkVersionFlag(version) {
  const args = process.argv.slice(2);
  if (
    args.includes(ENTRYPOINT_FLAG.VERSION_LONG) ||
    args.includes(ENTRYPOINT_FLAG.VERSION_SHORT)
  ) {
    console.log(ENTRYPOINT_TEXT.versionLine(version));
    return true;
  }
  if (
    args.includes(ENTRYPOINT_FLAG.HELP_LONG) ||
    args.includes(ENTRYPOINT_FLAG.HELP_SHORT)
  ) {
    console.log(ENTRYPOINT_TEXT.headerLine(version));
    console.log(LOCAL_STR_EMPTY);
    console.log(ENTRYPOINT_TEXT.USAGE_LINE);
    console.log(LOCAL_STR_EMPTY);
    console.log(LOCAL_STR_OPTIONS);
    for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
      console.log(line);
    }
    return true;
  }
  return false;
}

/**
 * Parse command-line arguments.
 * @return {Object} Parsed arguments.
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = LOCAL_NUM_ZERO; i < args.length; i++) {
    if (args[i] === ENTRYPOINT_FLAG.DATA_DIR && i + LOCAL_NUM_ONE < args.length) {
      result.dataDir = args[i + LOCAL_NUM_ONE];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.SEED && i + LOCAL_NUM_ONE < args.length) {
      result.seedNodeAddress = args[i + LOCAL_NUM_ONE];
      i++;
    } else if (args[i] === ENTRYPOINT_FLAG.CONFIG && i + LOCAL_NUM_ONE < args.length) {
      result.configPath = args[i + LOCAL_NUM_ONE];
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
  if (!Number.isFinite(parsed) || parsed < LOCAL_NUM_ONE) {
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
 * Resolve runtime-facing node addresses from config.
 * @param {Object} config
 * @return {Object}
 */
function resolveRuntimeAddresses(config) {
  const restApiPort =
    config.get(CONFIG_KEY.NODE_REST_API_PORT) ||
    ENTRYPOINT_DEFAULT.REST_API_PORT;
  const wsPort =
    config.get(CONFIG_KEY.NODE_WS_PORT) ||
    (restApiPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
  const nodeHttpAddress =
    config.get(CONFIG_KEY.NODE_ADDRESS) ||
    `${ENTRYPOINT_DEFAULT.LOCALHOST}:${restApiPort}`;
  const advertisedNodeWsAddress =
    resolveAdvertisedWebSocketAddress({
      advertisedAddress: config.get(
        CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
      ),
      nodeAddress: nodeHttpAddress,
      wsPort,
      wsHost: config.get(TRANSPORT_CONFIG_KEY.WS_HOST),
    });
  return {
    restApiPort,
    wsPort,
    nodeHttpAddress,
    advertisedNodeWsAddress,
  };
}

/**
 * Probe one persisted peer address for auto-rejoin.
 * @param {string} peerAddress
 * @return {Promise<boolean>}
 */
async function probeAutoRejoinPeerAddress(peerAddress) {
  const normalizedPeerAddress = String(peerAddress || '');
  if (normalizedPeerAddress.length === LOCAL_NUM_ZERO) {
    return false;
  }

  const baseUrl = normalizedPeerAddress.startsWith('http') ?
    normalizedPeerAddress :
    `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${normalizedPeerAddress}`;

  const bootstrapReadyProbe = await probeAutoRejoinPeerPath(
    baseUrl,
    ENTRYPOINT_DEFAULT.AUTO_REJOIN_BOOTSTRAP_READY_PATH,
  );
  if (bootstrapReadyProbe.ready === true) {
    return true;
  }
  if (bootstrapReadyProbe.legacyFallback !== true) {
    return false;
  }

  const healthProbe = await probeAutoRejoinPeerPath(
    baseUrl,
    ENTRYPOINT_DEFAULT.AUTO_REJOIN_HEALTH_PATH,
  );
  return healthProbe.ready === true;
}

/**
 * Probe one peer path used by auto-rejoin peer selection.
 * @param {string} baseUrl
 * @param {string} path
 * @return {Promise<Object>}
 */
async function probeAutoRejoinPeerPath(baseUrl, path) {
  try {
    const response = await fetch(
      `${baseUrl}${path}`,
      {
        method: ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_METHOD,
        signal: globalThis.AbortSignal.timeout(
          ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_TIMEOUT_MS,
        ),
      },
    );
    return {
      ready: response.ok,
      legacyFallback: response.status === HTTP_STATUS.NOT_FOUND,
    };
  } catch (_error) {
    return {
      ready: false,
      legacyFallback: false,
    };
  }
}

/**
 * Normalize explicit-seed startup evidence into one decision snapshot.
 * @param {Object} autoRejoinDecision
 * @return {Object}
 */
function buildExplicitSeedDecisionSnapshot(autoRejoinDecision) {
  const peerAddress =
    typeof autoRejoinDecision?.peerAddress === TYPEOF.STRING &&
    autoRejoinDecision.peerAddress.length > NUM.ZERO ?
      autoRejoinDecision.peerAddress :
      STRING.EMPTY;
  const hasDurablePeerAddress =
    autoRejoinDecision?.mode === STARTUP_JOIN_DECISION_MODE.JOIN &&
    autoRejoinDecision?.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN &&
    typeof peerAddress === TYPEOF.STRING &&
    peerAddress.length > NUM.ZERO;

  return {
    identityMismatch: autoRejoinDecision?.identityMismatch === true,
    autoRejoinState: autoRejoinDecision?.state || STRING.EMPTY,
    autoRejoinStartupMode:
      autoRejoinDecision?.startupMode || STRING.EMPTY,
    peerAddress,
    hasDurablePeerAddress,
    source: autoRejoinDecision?.source || STRING.EMPTY,
  };
}

/**
 * Resolve the explicit-seed decision state from a normalized snapshot.
 * @param {Object} snapshot
 * @return {string}
 */
function resolveExplicitSeedDecisionState(snapshot) {
  return EXPLICIT_SEED_DECISION_TABLE.find((candidate) =>
    candidate.matches(snapshot),
  ).state;
}

/**
 * Build the startup decision when an operator-provided seed is available.
 * @param {Object} options
 * @param {Object} options.autoRejoinDecision
 * @param {string} options.explicitSeedNodeAddress
 * @return {Object}
 */
function buildExplicitSeedStartupDecision(options) {
  const autoRejoinDecision = options.autoRejoinDecision;
  const explicitSeedNodeAddress = options.explicitSeedNodeAddress;
  const snapshot = buildExplicitSeedDecisionSnapshot(autoRejoinDecision);
  const state = resolveExplicitSeedDecisionState(snapshot);

  switch (state) {
  case EXPLICIT_SEED_DECISION_STATE.IDENTITY_MISMATCH:
    throw new Error(autoRejoinDecision.error);
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_PROBED_PEER:
    return {
      seedNodeAddress: snapshot.peerAddress,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: snapshot.source,
    };
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_EXPLICIT_SEED:
    return {
      seedNodeAddress: explicitSeedNodeAddress,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: STARTUP_JOIN_DECISION_SOURCE.EXPLICIT,
    };
  case EXPLICIT_SEED_DECISION_STATE.FRESH_EXPLICIT_SEED:
    return {
      seedNodeAddress: explicitSeedNodeAddress,
      startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
      source: STARTUP_JOIN_DECISION_SOURCE.EXPLICIT,
    };
  default:
    throw new Error(
      UNKNOWN_EXPLICIT_SEED_DECISION_STATE_ERROR_PREFIX + String(state),
    );
  }
}

/**
 * Resolve one startup join decision from explicit config or persisted hints.
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function resolveStartupJoinDecision(options) {
  const explicitSeedNodeAddress = options.cliArgs.seedNodeAddress ||
    options.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS];
  const nodeId = options.config.get(CONFIG_KEY.NODE_ID);
  const {nodeHttpAddress} = resolveRuntimeAddresses(options.config);
  const autoRejoinDecision = await resolveAutoRejoinStartupDecision({
    dataDir: options.dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: nodeHttpAddress,
    probePeerAddress:
      typeof options.probePeerAddress === TYPEOF.FUNCTION ?
        options.probePeerAddress :
        probeAutoRejoinPeerAddress,
  });
  options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION, {
    nodeId,
    nodeAddress: nodeHttpAddress,
    explicitSeedNodeAddress: explicitSeedNodeAddress || null,
    state: autoRejoinDecision.state,
    mode: autoRejoinDecision.mode,
    source: autoRejoinDecision.source,
    startupMode: autoRejoinDecision.startupMode,
    peerAddressState: autoRejoinDecision.peerAddressState,
    peerAddress: autoRejoinDecision.peerAddress || null,
    durableStateDetected: autoRejoinDecision.durableStateDetected === true,
    identityMismatch: autoRejoinDecision.identityMismatch === true,
  });
  if (explicitSeedNodeAddress) {
    return buildExplicitSeedStartupDecision({
      autoRejoinDecision,
      explicitSeedNodeAddress,
    });
  }
  if (autoRejoinDecision.mode === STARTUP_JOIN_DECISION_MODE.FAIL) {
    throw new Error(autoRejoinDecision.error);
  }
  if (autoRejoinDecision.mode !== STARTUP_JOIN_DECISION_MODE.JOIN) {
    return {
      seedNodeAddress: null,
      startupMode: STARTUP_JOIN_MODE.SEED,
      source: autoRejoinDecision.source,
    };
  }

  options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOINING_CLUSTER, {
    nodeId,
    peerAddress: autoRejoinDecision.peerAddress,
    source: autoRejoinDecision.source,
    startupMode: autoRejoinDecision.startupMode,
  });
  return {
    seedNodeAddress: autoRejoinDecision.peerAddress,
    startupMode: autoRejoinDecision.startupMode,
    source: autoRejoinDecision.source,
  };
}

/**
 * Start durable rejoin-hint persistence for the current runtime.
 * @param {Object} options
 * @return {RejoinHintsPersistenceService}
 */
function startRejoinHintsPersistence(options) {
  const persistence = new RejoinHintsPersistenceService({
    dataDir: options.dataDir,
    nodeId: options.nodeId,
    nodeAddress: options.nodeAddress,
    nodeRole: options.nodeRole,
    getSystemTableCache: options.getSystemTableCache,
    logger: options.logger,
  });
  persistence.start();
  return persistence;
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
      options.owner.rebalanceCoordinator
        ?.controlPlaneReadinessService || null,
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
  attachSqlEngineToAdminRuntime,
  checkVersionFlag,
  createAdminAPIWithLiveQuery,
  createReadinessStateWithDiagnostics,
  createServiceDiagnosticsProvider,
  createShutdownSignalHandler,
  createSqlCallbackWasmExecutor,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  parseCommandLineArgs,
  parsePositiveTimeoutMs,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  resolvePartitionServiceByPartitionId,
  resolveSystemCacheHandles,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
  resolveStartupJoinDecision,
  reportStartupRuntimeHandoff,
  scheduleStartupLivenessPulse,
  shutdownDynamicConfigWiring,
  startAdminRuntimeComposition,
  startDynamicConfigWiring,
  startRejoinHintsPersistence,
  startLogsTablePersistence,
};
