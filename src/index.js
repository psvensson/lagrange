/**
 * Distributed Database System - Main Entry Point
 */

import './boot/load-env.js';
import {EventLoopGapWatchdog} from './diagnostics/event-loop-gap-watchdog.js';
import {ConfigurationManager} from './config/configuration-manager.js';
import {CONFIG_KEY, DEFAULT_CONFIG} from './config/config-constants.js';
import {LoggingService} from './logging/logging-service.js';
import {HLCClockService} from './hlc/hlc-clock-service.js';
import {DataDirectoryManager} from './storage/data-directory-manager.js';
import {BootstrapService} from './bootstrap/bootstrap-service.js';
import {BootstrapAPI} from './bootstrap/bootstrap-api.js';
import {createControlPlaneWriteHealthProvider} from
  './bootstrap/control-plane-write-health-owner.js';
import {
  mintBootIncarnation,
  readPersistedLocalClusterId,
  readPersistedLocalNodeId,
} from './bootstrap/rejoin-hints.js';
import {
  STARTUP_JOIN_MODE,
} from './bootstrap/rejoin-hints-constants.js';
import {NodeJoiningService} from './bootstrap/node-joining-service.js';
import {NodeService} from './node/node-service.js';
import {
  ensureLiferaftProviderForRuntime,
  getProcessRaftProvider,
} from './raft/raft-provider-control.js';
import {RAFT_PROVIDER_LOG_MSG} from './raft/raft-provider-control-constants.js';
import {
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_RUNTIME_VALUE,
  ENTRYPOINT_SUBSYSTEM,
  ENTRYPOINT_TEXT,
} from './constants/entrypoint.js';
import {VERSION} from './public-api.js';
import {assertCritical} from './utils/assert.js';
import {
  MembershipLifecycleController,
} from './control-plane/membership-lifecycle-controller.js';
import {
  attachSqlRuntimeToStartupOwner,
} from './bootstrap/shared/startup-sql-runtime-handoff.js';
import {
  checkVersionFlag,
  createReadinessStateWithDiagnostics,
  createShutdownSignalHandler,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  parseCommandLineArgs,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
  resolveStartupJoinDecision,
  reportStartupRuntimeHandoff,
  scheduleStartupLivenessPulse,
  startAdminRuntimeComposition,
  startDynamicConfigWiring,
  startLogsTablePersistence,
  startRejoinHintsPersistence,
  resolveSystemCacheHandles,
} from './entrypoint-runtime-helpers.js';
import {
  persistJoinSeedRejoinHints,
  resolveSeedContactUrls,
} from './entrypoint-runtime-join-decision.js';
import {
  resolveBootSourceProvenance,
  resolveJoinReattemptPolicy,
  resolveLocalClusterIncarnationFence,
} from './entrypoint-runtime-provenance.js';
import {resolveNodeJoiningConfig} from './entrypoint-runtime-join-config.js';

const JOIN_REATTEMPT_POLICY = resolveJoinReattemptPolicy(process.env);

export * from './public-api.js';

async function startJoinNode(options) {
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const seedNodeAddress = String(options.seedNodeAddress || '');
  const seedNodeAddresses = Array.isArray(options.seedNodeAddresses) &&
    options.seedNodeAddresses.length > 0 ?
    options.seedNodeAddresses :
    [seedNodeAddress];
  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const startupMode = typeof options.startupMode === 'string' &&
    options.startupMode.length > 0 ?
    options.startupMode :
    STARTUP_JOIN_MODE.FRESH_JOIN;
  const env = options.env || process.env;
  const {
    restApiPort: _restApiPort,
    wsPort,
    nodeHttpAddress: joiningNodeAddress,
    advertisedNodeWsAddress,
  } = resolveRuntimeAddresses(config);

  const persistedClusterId = await readPersistedLocalClusterId(
    dataDirectoryManager.getDataDir(),
  );
  // Mint this boot's incarnation before any hints write: the counter is
  // node-local and monotonic, so a zombie from an earlier boot provably
  // carries a smaller incarnation than the current data-dir owner.
  const bootIncarnation = await mintBootIncarnation(
    dataDirectoryManager.getDataDir(),
  );
  await persistJoinSeedRejoinHints({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    peerAddresses: seedNodeAddresses,
    clusterId: persistedClusterId,
    bootIncarnation,
    logger: mainLogger,
  });
  const clusterIncarnationFence = await resolveLocalClusterIncarnationFence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
  });

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINING_CLUSTER, {
    seedNodeAddress,
    seedNodeAddresses,
    startupMode,
  });

  const seedUrls = resolveSeedContactUrls(seedNodeAddresses);
  const seedUrl = seedUrls[0];
  const joiningConfig = resolveNodeJoiningConfig(env);

  const joinReadinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  let joinAdminRuntime = null;
  let bootstrapAPI = null;
  const membershipLifecycleController = new MembershipLifecycleController({
    nodeId,
    startupMode,
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    delegates: {
      onDrainIntent: ({intent}) => {
        if (bootstrapAPI?.markDraining) {
          return bootstrapAPI.markDraining({
            drainDeadlineMs: intent.drainDeadlineMs,
            reasonCode: intent.reasonCode,
          });
        }
        return {
          phase: null,
          reasons: intent.reasonCode ? [intent.reasonCode] : [],
          draining: true,
          drainDeadlineMs: intent.drainDeadlineMs,
        };
      },
    },
  });
  const nodeJoiningService = new NodeJoiningService({
    nodeId,
    nodeAddress: joiningNodeAddress,
    advertisedNodeWsAddress,
    seedNodeAddress: seedUrl,
    seedNodeAddresses: seedUrls,
    wsPort: wsPort,
    dataDir: dataDirectoryManager.getDataDir(),
    rolloutControls,
    readinessState: joinReadinessState,
    startupMode,
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    expectedClusterId: persistedClusterId,
    bootIncarnation,
    clusterIncarnationFence,
    membershipLifecycleController,
    previousLifecycleStateMachine:
      options._previousLifecycleStateMachine || null,
    config: Object.keys(joiningConfig).length > 0 ?
      joiningConfig :
      undefined,
  });
  bootstrapAPI = new BootstrapAPI({
    seedNodeId: nodeId,
    seedNodeAddress: joiningNodeAddress,
    seedNodeWsAddress: advertisedNodeWsAddress,
    wsPort: wsPort,
    messageGroupServices: nodeJoiningService.messageGroupServices,
    partitionServices: nodeJoiningService.partitionServices,
    replicaHandler: nodeJoiningService.replicaHandler,
    systemTableCache: null,
    bootstrapStartupAdapter: nodeJoiningService,
    bootstrapService: null,
    epochManager: nodeJoiningService.epochManager,
    messageRouter: nodeJoiningService.messageRouter,
    readinessState: joinReadinessState,
    controlPlaneWriteHealthProvider:
      createControlPlaneWriteHealthProvider(nodeJoiningService),
    runtimeOwner: nodeJoiningService.runtimeDependencyOwner,
    requestCellEnv: env,
    rolloutControls,
  });

  await bootstrapAPI.initialize();

  const joinResult = await nodeJoiningService.join();

  if (!joinResult.success) {
    const joinAttempt = Number.isInteger(options._joinAttempt) ?
      options._joinAttempt :
      0;
    mainLogger.error(ENTRYPOINT_LOG_MSG.FAILED_JOIN, {
      error: joinResult.error,
      phase: joinResult.phase,
      retryable: joinResult.retryable === true,
      attempt: joinAttempt,
    });
    // The failed join never started the admin runtime or a provisional SQL
    // engine; cleanup owns only the bootstrap surface.
    await bootstrapAPI.shutdown();
    // A retryable join failure re-attempts up to the bounded re-attempt count;
    // a non-retryable failure (or exhausted attempts) exits.
    const reattemptAllowed =
      joinResult.retryable === true &&
      joinAttempt + 1 < JOIN_REATTEMPT_POLICY.maxAttempts;
    if (reattemptAllowed) {
      // Exponential, capped backoff so a persistently-failing join SLOWS DOWN
      // (does not hammer a saturated seed) but never gives up.
      const cappedExp = Math.min(
        joinAttempt,
        JOIN_REATTEMPT_POLICY.backoffCapExponent,
      );
      const backoffMs = Math.min(
        JOIN_REATTEMPT_POLICY.maxDelayMs,
        JOIN_REATTEMPT_POLICY.baseDelayMs * Math.pow(2, cappedExp),
      );
      const delayMs = Math.max(
        Number.isFinite(joinResult.retryAfterMs) ?
          joinResult.retryAfterMs :
          0,
        backoffMs,
      );
      mainLogger.warn(ENTRYPOINT_RUNTIME_VALUE.REATTEMPT_JOIN, {
        nodeId,
        attempt: joinAttempt + 1,
        maxAttempts: JOIN_REATTEMPT_POLICY.maxAttempts,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return startJoinNode({
        ...options,
        _joinAttempt: joinAttempt + 1,
        _previousLifecycleStateMachine:
          nodeJoiningService.getLifecycleStateMachine(),
      });
    }
    process.exit(1);
  }

  let joinLogsPersistence = null;

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINED_CLUSTER, {
    messageGroupCount: joinResult.messageGroupServices.size,
    duration: joinResult.duration,
  });

  // Stamp the node-local hints with the durable cluster identity the seed
  // stamped this joiner with (pre-identity joiners learn it here; identity-
  // carrying joiners re-write the same value). From this boot onward the
  // hints file gates every restart decision and bootstrap request.
  const joinedClusterId =
    typeof nodeJoiningService.bootstrapResponse?.clusterId === 'string' &&
    nodeJoiningService.bootstrapResponse.clusterId.length > 0 ?
      nodeJoiningService.bootstrapResponse.clusterId :
      persistedClusterId;
  await persistJoinSeedRejoinHints({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    peerAddresses: seedNodeAddresses,
    clusterId: joinedClusterId,
    bootIncarnation,
    logger: mainLogger,
  });

  const joinCacheHandles = resolveSystemCacheHandles(
    joinResult.messageGroupServices,
  );
  let systemTableCache = joinCacheHandles.systemTableCache;
  const cacheMutationTarget = joinCacheHandles.cacheMutationTarget;
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
    startupRecoveryCoordinator:
      nodeJoiningService.rebalanceCoordinator?.startupRecoveryCoordinator ||
      null,
  });

  const joinSqlRuntime = await createSqlRuntimeComposition({
    nodeId,
    systemTableCache,
    messageRouter: joinResult.messageRouter,
    owner: nodeJoiningService.runtimeDependencyOwner,
    partitionServices: joinResult.partitionServices,
    logger: mainLogger,
  });
  const sqlQueryEngine = joinSqlRuntime.sqlQueryEngine;
  const detachJoinMigrationRecovery =
    joinSqlRuntime.detachMigrationRecovery;
  attachSqlRuntimeToStartupOwner({
    owner: nodeJoiningService,
    sqlQueryEngine,
    systemTableCache,
    cacheMutationTarget: cacheMutationTarget || systemTableCache,
    messageRouter: joinResult.messageRouter,
    partitionServicesProvider: () => joinResult.partitionServices,
  });

  const joinDynamicConfigWiring = await startDynamicConfigWiring({
    nodeId,
    systemTableCache,
    sqlQueryEngine,
    messageGroupServices: joinResult.messageGroupServices,
    partitionServices: joinResult.partitionServices,
    runtimeOwner: nodeJoiningService.runtimeDependencyOwner,
  }, mainLogger);

  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
  // Full admin starts only after infrastructure join has completed with the
  // authoritative SQL engine; there is no provisional pre-join admin surface.
  joinAdminRuntime = await startAdminRuntimeComposition({
    nodeId,
    systemTableCache,
    cacheMutationTarget: cacheMutationTarget || systemTableCache,
    sqlQueryEngine,
    owner: nodeJoiningService.runtimeDependencyOwner,
    messageRouter: joinResult.messageRouter,
    partitionServices: joinResult.partitionServices,
  });

  const adminAPI = joinAdminRuntime.adminAPI;
  const liveQueryWiring = joinAdminRuntime.liveQueryWiring;
  const adminPort = joinAdminRuntime.adminPort;
  reportStartupRuntimeHandoff({
    logger: mainLogger,
    nodeId,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.JOIN,
    bootstrapAPI,
    startupOwner: nodeJoiningService,
    adminRuntime: joinAdminRuntime,
  });
  const rejoinHintsPersistence = startRejoinHintsPersistence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    nodeRole: 'joiner',
    bootIncarnation,
    getSystemTableCache: () => systemTableCache,
    logger: mainLogger,
  });

  mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
    nodeId,
    adminWebSocketPort: adminPort,
    dataDir: dataDirectoryManager.getDataDir(),
  });
  scheduleStartupLivenessPulse({
    logger: mainLogger,
    nodeId,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.JOIN,
    bootstrapAPI,
    startupOwner: nodeJoiningService,
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
    membershipLifecycleController,
    heartbeatService: nodeJoiningService.heartbeatService,
    logsPersistence: joinLogsPersistence,
    rejoinHintsPersistence,
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
  const env = options.env || process.env;
  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const {
    wsPort,
    nodeHttpAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
  } = resolveRuntimeAddresses(config);

  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);
  const bootIncarnation = await mintBootIncarnation(
    dataDirectoryManager.getDataDir(),
  );
  const clusterIncarnationFence = await resolveLocalClusterIncarnationFence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: seedNodeHttpAddress,
  });

  const readinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  let seedAdminRuntime = null;
  const bootstrapService = new BootstrapService({
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
    dataDirectoryManager,
    wsPort: wsPort,
    rolloutControls,
    clusterIncarnationFence,
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
    bootstrapStartupAdapter: bootstrapService.bootstrapApiOwner,
    runtimeOwner: bootstrapService.runtimeDependencyOwner,
    requestCellEnv: env,
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
    startupRecoveryCoordinator:
      bootstrapService.rebalanceCoordinator?.startupRecoveryCoordinator ||
      null,
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
    owner: bootstrapService.runtimeDependencyOwner,
    partitionServices: bootstrapResult.partitionServices,
    logger: mainLogger,
  });
  const sqlQueryEngine = seedSqlRuntime.sqlQueryEngine;
  const detachSeedMigrationRecovery =
    seedSqlRuntime.detachMigrationRecovery;
  attachSqlRuntimeToStartupOwner({
    owner: bootstrapService,
    sqlQueryEngine,
    systemTableCache,
    cacheMutationTarget: systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    partitionServicesProvider: () => bootstrapResult.partitionServices,
  });

  const seedDynamicConfigWiring = await startDynamicConfigWiring({
    nodeId,
    systemTableCache,
    sqlQueryEngine,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    runtimeOwner: bootstrapService.runtimeDependencyOwner,
  }, mainLogger);

  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
  // Full admin starts only after bootstrap has completed with the
  // authoritative SQL engine; there is no provisional pre-join admin surface.
  seedAdminRuntime = await startAdminRuntimeComposition({
    nodeId,
    systemTableCache,
    cacheMutationTarget: systemTableCache,
    sqlQueryEngine,
    owner: bootstrapService.runtimeDependencyOwner,
    messageRouter: bootstrapResult.messageRouter,
    partitionServices: bootstrapResult.partitionServices,
  });
  const adminAPI = seedAdminRuntime.adminAPI;
  const liveQueryWiring = seedAdminRuntime.liveQueryWiring;
  const adminPort = seedAdminRuntime.adminPort;
  reportStartupRuntimeHandoff({
    logger: mainLogger,
    nodeId,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.SEED,
    bootstrapAPI,
    startupOwner: bootstrapService,
    adminRuntime: seedAdminRuntime,
  });
  const rejoinHintsPersistence = startRejoinHintsPersistence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    nodeRole: 'seed',
    bootIncarnation,
    getSystemTableCache: () => systemTableCache,
    logger: mainLogger,
  });

  mainLogger.info(ENTRYPOINT_LOG_MSG.NODE_READY, {
    nodeId,
    restApiPort: config.get(CONFIG_KEY.NODE_REST_API_PORT),
    adminWebSocketPort: adminPort,
    dataDir: dataDirectoryManager.getDataDir(),
  });
  scheduleStartupLivenessPulse({
    logger: mainLogger,
    nodeId,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.SEED,
    bootstrapAPI,
    startupOwner: bootstrapService,
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
    rejoinHintsPersistence,
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
  if (checkVersionFlag(VERSION)) {
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

  // Restore the durable node identity before configuration initialization
  // mints a fresh one: booting over an existing data directory with a new
  // generated id is refused as an identity mismatch, so a deployment without
  // an explicit NODE_ID (e.g. an orchestrator restarting a pod onto its
  // persistent volume) must reuse the id persisted with the rejoin hints.
  // An explicit NODE_ID env keeps full precedence.
  if (!process.env.NODE_ID) {
    const identityDataDir = cliArgs.dataDir ||
      process.env.DATA_DIR ||
      DEFAULT_CONFIG.storage.dataDir;
    const persistedNodeId = await readPersistedLocalNodeId(identityDataDir);
    if (persistedNodeId) {
      overrides.node = {id: persistedNodeId};
    }
  }

  // Initialize configuration
  const config = ConfigurationManager.getInstance();
  config.initialize(overrides);

  // Initialize logging. LAGRANGE_DEBUG_LOGS raises the CONSOLE level to debug so
  // investigation detail (incl. the per-tick convergence decision trace) reaches
  // stdout — captured in full by the harness — while persistence stays at the
  // configured level so the logs table (a distributed write path that can itself
  // stall) is never flooded with debug volume.
  const debugLogsEnabled = process.env.LAGRANGE_DEBUG_LOGS === 'true';
  const configuredLogLevel = config.get(CONFIG_KEY.LOGGING_LEVEL);
  const loggingService = LoggingService.getInstance();
  loggingService.initialize({
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    level: debugLogsEnabled ? ENTRYPOINT_RUNTIME_VALUE.DEBUG : configuredLogLevel,
    persistLevel: debugLogsEnabled ?
      (configuredLogLevel || ENTRYPOINT_RUNTIME_VALUE.INFO) :
      undefined,
    prettyPrint: config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT),
  });

  // Create subsystem-specific loggers
  const mainLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.MAIN);
  const configLogger = loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.CONFIG);
  registerProcessLifecycleDiagnostics(mainLogger, () => ({
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    pid: process.pid,
  }));

  // Loop-blockage attribution for the convergence closure work (CL-008 next
  // falsification step). Console-only output, silent while the loop is
  // healthy; LAGRANGE_LOOP_GAP_THRESHOLD_MS=0 disables.
  const eventLoopGapWatchdog = new EventLoopGapWatchdog();
  eventLoopGapWatchdog.start();

  const selectedRaftProvider = getProcessRaftProvider(process.env);
  mainLogger.info(RAFT_PROVIDER_LOG_MSG.SELECTED, {
    provider: selectedRaftProvider,
  });
  ensureLiferaftProviderForRuntime(process.env);

  configLogger.debug(ENTRYPOINT_RUNTIME_VALUE.CONFIGURATION_LOADED, {
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

  const bootProvenance = await resolveBootSourceProvenance();
  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING, {
    nodeId: config.get(CONFIG_KEY.NODE_ID),
    version: VERSION,
    dataDir: dataDirectoryManager.getDataDir(),
    hlcTimestamp: hlcClock.now().toString(),
    bootedSrcFingerprint: bootProvenance.bootedSrcFingerprint,
    expectedSrcFingerprint: bootProvenance.expectedSrcFingerprint,
    srcFingerprintMatches: bootProvenance.srcFingerprintMatches,
  });
  if (bootProvenance.srcFingerprintMatches === false) {
    mainLogger.warn(ENTRYPOINT_LOG_MSG.STALE_SOURCE_DETECTED, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      bootedSrcFingerprint: bootProvenance.bootedSrcFingerprint,
      expectedSrcFingerprint: bootProvenance.expectedSrcFingerprint,
    });
  }

  if (cliArgs.dryRun) {
    mainLogger.info(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      dataDir: dataDirectoryManager.getDataDir(),
      provider: selectedRaftProvider,
    });
    return;
  }

  // Check if we're joining an existing cluster or starting as seed node
  const startupJoinDecision = await resolveStartupJoinDecision({
    cliArgs,
    env: process.env,
    config,
    dataDirectoryManager,
    logger: mainLogger,
  });
  const rolloutControls = resolveRolloutControlsFromEnvironment(process.env);

  if (startupJoinDecision.seedNodeAddress) {
    await startJoinNode({
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls,
      seedNodeAddress: startupJoinDecision.seedNodeAddress,
      seedNodeAddresses: startupJoinDecision.seedNodeAddresses,
      startupMode: startupJoinDecision.startupMode,
      membershipOwnerOutcome: startupJoinDecision.membershipOwnerOutcome,
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
