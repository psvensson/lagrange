/**
 * Distributed Database System - Main Entry Point
 */

import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ENV_VAR,
} from './diagnostics/source-fingerprint.js';
import {EventLoopGapWatchdog} from './diagnostics/event-loop-gap-watchdog.js';
import {ConfigurationManager} from './config/configuration-manager.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {LoggingService} from './logging/logging-service.js';
import {HLCClockService} from './hlc/hlc-clock-service.js';
import {DataDirectoryManager} from './storage/data-directory-manager.js';
import {BootstrapService} from './bootstrap/bootstrap-service.js';
import {BootstrapAPI} from './bootstrap/bootstrap-api.js';
import {createControlPlaneWriteHealthProvider} from
  './bootstrap/control-plane-write-health-owner.js';
import {
  resolveAutoRejoinStartupDecision,
  persistBootstrapRejoinHints,
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
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
  ENTRYPOINT_ERROR_MSG,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_SUBSYSTEM,
  ENTRYPOINT_TEXT,
  ENTRYPOINT_VERSION,
} from './constants/entrypoint.js';
import {assertCritical} from './utils/assert.js';
import {
  MembershipLifecycleController,
} from './control-plane/membership-lifecycle-controller.js';
import {
  attachSqlRuntimeToStartupOwner,
} from './bootstrap/shared/startup-sql-runtime-handoff.js';
import {
  attachSqlEngineToAdminRuntime,
  checkVersionFlag,
  createReadinessStateWithDiagnostics,
  createShutdownSignalHandler,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  parseCommandLineArgs,
  parsePositiveTimeoutMs,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
  resolveStartupJoinDecision,
  reportStartupRuntimeHandoff,
  scheduleStartupLivenessPulse,
  shutdownAdminRuntimeComposition,
  shutdownEarlyAdminSqlRuntime,
  startAdminRuntimeComposition,
  startDynamicConfigWiring,
  startEarlyAdminSqlRuntime,
  startLogsTablePersistence,
  startRejoinHintsPersistence,
  resolveSystemCacheHandles,
} from './entrypoint-runtime-helpers.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_JOINER = 'joiner';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_MX5FT = 'Failed to persist bootstrap rejoin hints';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_JOIN = 'join';
const LOCAL_STR_SEED = 'seed';
const LOCAL_STR_PY3S1 = 'Configuration loaded';
const LOCAL_STR_REATTEMPT_JOIN =
  'Re-attempting cluster join after retryable failure';
const LOCAL_STR_DEBUG = 'debug';
const LOCAL_STR_INFO = 'info';
// A retryable join failure (e.g. transient transport/participant unavailability
// during a rolling restart) should re-compose a fresh join rather than exiting
// the node permanently. Bounded so a genuinely non-joinable node still fails
// fast. Override via env; set to <=1 to restore exit-on-first-failure.
const JOIN_REATTEMPT_MAX_ATTEMPTS =
  Number.isFinite(Number(process.env.LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS)) &&
  Number(process.env.LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS) >= LOCAL_NUM_ONE ?
    Math.floor(Number(process.env.LAGRANGE_JOIN_REATTEMPT_MAX_ATTEMPTS)) :
    4;
const JOIN_REATTEMPT_BASE_DELAY_MS = 2000;
const JOIN_REATTEMPT_MAX_DELAY_MS = 30000;
const JOIN_REATTEMPT_BACKOFF_CAP_EXP = 10;

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

async function resolveLocalClusterIncarnationFence(options = {}) {
  const startupDecision = await resolveAutoRejoinStartupDecision({
    dataDir: options.dataDir,
    nodeId: options.nodeId,
    nodeAddress: options.nodeAddress,
  });
  return startupDecision?.clusterIncarnationFence &&
    typeof startupDecision.clusterIncarnationFence === LOCAL_STR_OBJECT ?
    startupDecision.clusterIncarnationFence :
    null;
}

/**
 * Compose and start one joining-node runtime path.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.mainLogger
 * @param {Object} options.dataDirectoryManager
 * @param {Object} options.rolloutControls
 * @param {string} options.seedNodeAddress
 * @param {string} options.startupMode
 * @param {Object} options.membershipOwnerOutcome
 * @param {Object} options.env
 * @return {Promise<void>}
 */
async function startJoinNode(options) {
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const seedNodeAddress = String(options.seedNodeAddress || '');
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

  try {
    await persistBootstrapRejoinHints({
      dataDir: dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: joiningNodeAddress,
      nodeRole: LOCAL_STR_JOINER,
      peerAddresses: [seedNodeAddress],
      clusterNodeCount: LOCAL_NUM_TWO,
    });
  } catch (error) {
    mainLogger.warn(LOCAL_STR_MX5FT, {
      nodeId,
      dataDir: dataDirectoryManager.getDataDir(),
      error: error.message,
    });
  }
  const clusterIncarnationFence = await resolveLocalClusterIncarnationFence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
  });

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINING_CLUSTER, {
    seedNodeAddress,
    startupMode,
  });

  const seedUrl = seedNodeAddress.startsWith('http') ?
    seedNodeAddress :
    `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${seedNodeAddress}`;
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

  const joinReadinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  let joinAdminRuntime = null;
  let joinEarlySqlRuntime = null;
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
    wsPort: wsPort,
    dataDir: dataDirectoryManager.getDataDir(),
    rolloutControls,
    readinessState: joinReadinessState,
    startupMode,
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    clusterIncarnationFence,
    membershipLifecycleController,
    onLocalAdminRuntimeReady: async (runtime) => {
      if (joinAdminRuntime) {
        return;
      }
      joinEarlySqlRuntime = await startEarlyAdminSqlRuntime(runtime);
      joinAdminRuntime = await startAdminRuntimeComposition({
        nodeId: runtime.nodeId,
        systemTableCache: runtime.systemTableCache,
        cacheMutationTarget:
          runtime.cacheMutationTarget || runtime.systemTableCache,
        sqlQueryEngine: joinEarlySqlRuntime?.sqlQueryEngine || null,
        owner: runtime.owner,
        messageRouter: runtime.messageRouter,
        partitionServices: runtime.partitionServices,
      });
    },
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
    await bootstrapAPI.shutdown();
    await shutdownAdminRuntimeComposition(joinAdminRuntime);
    joinAdminRuntime = null;
    // The admin runtime referenced the provisional early engine; dispose it
    // only after admin surfaces are torn down so nothing queries a dead engine.
    await shutdownEarlyAdminSqlRuntime(joinEarlySqlRuntime);
    joinEarlySqlRuntime = null;
    // A retryable join failure re-attempts up to the bounded re-attempt count;
    // a non-retryable failure (or exhausted attempts) exits.
    const reattemptAllowed =
      joinResult.retryable === true &&
      joinAttempt + LOCAL_NUM_ONE < JOIN_REATTEMPT_MAX_ATTEMPTS;
    if (reattemptAllowed) {
      // Exponential, capped backoff so a persistently-failing join SLOWS DOWN
      // (does not hammer a saturated seed) but never gives up.
      const cappedExp = Math.min(joinAttempt, JOIN_REATTEMPT_BACKOFF_CAP_EXP);
      const backoffMs = Math.min(
        JOIN_REATTEMPT_MAX_DELAY_MS,
        JOIN_REATTEMPT_BASE_DELAY_MS * Math.pow(2, cappedExp),
      );
      const delayMs = Math.max(
        Number.isFinite(joinResult.retryAfterMs) ?
          joinResult.retryAfterMs :
          0,
        backoffMs,
      );
      mainLogger.warn(LOCAL_STR_REATTEMPT_JOIN, {
        nodeId,
        attempt: joinAttempt + LOCAL_NUM_ONE,
        maxAttempts: JOIN_REATTEMPT_MAX_ATTEMPTS,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return startJoinNode({
        ...options,
        _joinAttempt: joinAttempt + LOCAL_NUM_ONE,
      });
    }
    process.exit(LOCAL_NUM_ONE);
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
  if (!joinAdminRuntime) {
    joinAdminRuntime = await startAdminRuntimeComposition({
      nodeId,
      systemTableCache,
      cacheMutationTarget: cacheMutationTarget || systemTableCache,
      sqlQueryEngine,
      owner: nodeJoiningService.runtimeDependencyOwner,
      messageRouter: joinResult.messageRouter,
      partitionServices: joinResult.partitionServices,
    });
  } else {
    attachSqlEngineToAdminRuntime(joinAdminRuntime, sqlQueryEngine);
    // The authoritative engine now owns admin; dispose the provisional early
    // engine (if the lever seeded one) so it stops owning per-engine services.
    await shutdownEarlyAdminSqlRuntime(joinEarlySqlRuntime);
    joinEarlySqlRuntime = null;
  }

  const adminAPI = joinAdminRuntime.adminAPI;
  const liveQueryWiring = joinAdminRuntime.liveQueryWiring;
  const adminPort = joinAdminRuntime.adminPort;
  reportStartupRuntimeHandoff({
    logger: mainLogger,
    nodeId,
    startupBranch: LOCAL_STR_JOIN,
    bootstrapAPI,
    startupOwner: nodeJoiningService,
    adminRuntime: joinAdminRuntime,
  });
  const rejoinHintsPersistence = startRejoinHintsPersistence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    nodeRole: 'joiner',
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
    startupBranch: LOCAL_STR_JOIN,
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
  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const {
    wsPort,
    nodeHttpAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
  } = resolveRuntimeAddresses(config);

  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);
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
  let seedEarlySqlRuntime = null;
  const bootstrapService = new BootstrapService({
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
    dataDirectoryManager,
    wsPort: wsPort,
    rolloutControls,
    clusterIncarnationFence,
    readinessState,
    onLocalAdminRuntimeReady: async (runtime) => {
      if (seedAdminRuntime) {
        return;
      }
      seedEarlySqlRuntime = await startEarlyAdminSqlRuntime(runtime);
      seedAdminRuntime = await startAdminRuntimeComposition({
        nodeId: runtime.nodeId,
        systemTableCache: runtime.systemTableCache,
        cacheMutationTarget:
          runtime.cacheMutationTarget || runtime.systemTableCache,
        sqlQueryEngine: seedEarlySqlRuntime?.sqlQueryEngine || null,
        owner: runtime.owner,
        messageRouter: runtime.messageRouter,
        partitionServices: runtime.partitionServices,
      });
    },
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
    rolloutControls,
  });

  await bootstrapAPI.initialize();

  const bootstrapResult = await bootstrapService.bootstrap();

  if (!bootstrapResult.success) {
    mainLogger.error(ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED, {
      error: bootstrapResult.error,
    });
    process.exit(LOCAL_NUM_ONE);
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
  if (!seedAdminRuntime) {
    seedAdminRuntime = await startAdminRuntimeComposition({
      nodeId,
      systemTableCache,
      cacheMutationTarget: systemTableCache,
      sqlQueryEngine,
      owner: bootstrapService.runtimeDependencyOwner,
      messageRouter: bootstrapResult.messageRouter,
      partitionServices: bootstrapResult.partitionServices,
    });
  } else {
    attachSqlEngineToAdminRuntime(seedAdminRuntime, sqlQueryEngine);
    // The authoritative engine now owns admin; dispose the provisional early
    // engine (if the lever seeded one) so it stops owning per-engine services.
    await shutdownEarlyAdminSqlRuntime(seedEarlySqlRuntime);
    seedEarlySqlRuntime = null;
  }
  const adminAPI = seedAdminRuntime.adminAPI;
  const liveQueryWiring = seedAdminRuntime.liveQueryWiring;
  const adminPort = seedAdminRuntime.adminPort;
  reportStartupRuntimeHandoff({
    logger: mainLogger,
    nodeId,
    startupBranch: LOCAL_STR_SEED,
    bootstrapAPI,
    startupOwner: bootstrapService,
    adminRuntime: seedAdminRuntime,
  });
  const rejoinHintsPersistence = startRejoinHintsPersistence({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    nodeRole: 'seed',
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
    startupBranch: LOCAL_STR_SEED,
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

// Self-verify the source the node actually booted from. The harness injects the
// working-tree fingerprint via SOURCE_FINGERPRINT_ENV_VAR; here we independently
// recompute the fingerprint of the directory this entrypoint module was loaded
// from (e.g. /app/src under the fast-local bind mount). A mismatch is proof the
// running process imported stale code — the trap this guards against. Best
// effort: a fingerprint error must never block or fail startup.
async function resolveBootSourceProvenance() {
  const expectedSrcFingerprint =
    process.env[SOURCE_FINGERPRINT_ENV_VAR] || null;
  let bootedSrcFingerprint = null;
  try {
    const sourceDir = dirname(fileURLToPath(import.meta.url));
    bootedSrcFingerprint = await computeSourceFingerprint(sourceDir);
  } catch {
    bootedSrcFingerprint = null;
  }
  const srcFingerprintMatches =
    expectedSrcFingerprint && bootedSrcFingerprint ?
      expectedSrcFingerprint === bootedSrcFingerprint :
      null;
  return {expectedSrcFingerprint, bootedSrcFingerprint, srcFingerprintMatches};
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
    level: debugLogsEnabled ? LOCAL_STR_DEBUG : configuredLogLevel,
    persistLevel: debugLogsEnabled ?
      (configuredLogLevel || LOCAL_STR_INFO) :
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

  configLogger.debug(LOCAL_STR_PY3S1, {
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
  process.exit(LOCAL_NUM_ONE);
});
