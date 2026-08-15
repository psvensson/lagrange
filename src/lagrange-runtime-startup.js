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
} from './constants/entrypoint.js';
import {VERSION} from './public-api.js';
import {assertCritical} from './utils/assert.js';
import {
  attachSqlRuntimeToStartupOwner,
} from './bootstrap/shared/startup-sql-runtime-handoff.js';
import {
  createReadinessStateWithDiagnostics,
  createRuntimeShutdown,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
  resolveStartupJoinDecision,
  reportStartupRuntimeHandoff,
  startAdminRuntimeComposition,
  startDynamicConfigWiring,
  startLogsTablePersistence,
  startRejoinHintsPersistence,
  resolveSystemCacheHandles as resolveMetadataHandles,
  shutdownDynamicConfigWiring,
} from './entrypoint-runtime-helpers.js';
import {shutdownAdminRuntimeComposition} from
  './entrypoint-runtime-admin-composition.js';
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
import {
  acquireStartupOwner,
  createStartupAcquisitionLedger,
} from
  './entrypoint-startup-acquisition-ledger.js';
import {
  claimProcessRuntime,
  ownsProcessRuntimeClaim,
} from './lagrange-runtime-process-claim.js';
import {
  createJoinMembershipLifecycleController,
  resolveFailedJoinReattempt,
  resolveJoinedClusterId,
  resolveJoinStartupValues,
  throwIfStartupAborted,
} from './entrypoint-runtime-join-startup-policy.js';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
} from './query/application-database-constants.js';
import {createApplicationDatabaseError} from
  './query/application-database-error.js';
const METADATA_KEY = 'systemTableCache';
const METADATA_MUTATION_TARGET_KEY = 'cacheMutationTarget';
const METADATA_GETTER_KEY = 'getSystemTableCache';
const METADATA_REQUIRED_ERROR_KEY = 'SYSTEM_TABLE_CACHE_REQUIRED';
async function awaitStartupAcquisition(promise, signal) {
  const result = await promise;
  throwIfStartupAborted(signal);
  return result;
}
async function startJoinNode(options) {
  throwIfStartupAborted(options.signal);
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const {seedNodeAddress, seedNodeAddresses, startupMode} =
    resolveJoinStartupValues(options);
  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const env = options.env;
  const joinReattemptPolicy = resolveJoinReattemptPolicy(env);
  const {
    restApiPort: _restApiPort,
    wsPort,
    nodeHttpAddress: joiningNodeAddress,
    advertisedNodeWsAddress,
  } = resolveRuntimeAddresses(config);

  const persistedClusterId = await awaitStartupAcquisition(
    readPersistedLocalClusterId(dataDirectoryManager.getDataDir()),
    options.signal,
  );
  const bootIncarnation = await awaitStartupAcquisition(
    mintBootIncarnation(dataDirectoryManager.getDataDir()),
    options.signal,
  );
  await awaitStartupAcquisition(persistJoinSeedRejoinHints({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    peerAddresses: seedNodeAddresses,
    clusterId: persistedClusterId,
    bootIncarnation,
    logger: mainLogger,
  }), options.signal);
  const clusterIncarnationFence = await awaitStartupAcquisition(
    resolveLocalClusterIncarnationFence({
      dataDir: dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: joiningNodeAddress,
    }),
    options.signal,
  );

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
  const membershipLifecycleController = createJoinMembershipLifecycleController({
    nodeId,
    startupMode,
    membershipOwnerOutcome: options.membershipOwnerOutcome,
    getBootstrapAPI: () => bootstrapAPI,
  });
  throwIfStartupAborted(options.signal);
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
  options.cleanupLedger.defer(() => nodeJoiningService.cleanup());
  bootstrapAPI = new BootstrapAPI({
    seedNodeId: nodeId,
    seedNodeAddress: joiningNodeAddress,
    seedNodeWsAddress: advertisedNodeWsAddress,
    wsPort: wsPort,
    messageGroupServices: nodeJoiningService.messageGroupServices,
    partitionServices: nodeJoiningService.partitionServices,
    replicaHandler: nodeJoiningService.replicaHandler,
    [METADATA_KEY]: null,
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
  options.cleanupLedger.defer(() => bootstrapAPI.shutdown());

  await awaitStartupAcquisition(bootstrapAPI.initialize(), options.signal);

  const joinResult = await awaitStartupAcquisition(
    nodeJoiningService.join(),
    options.signal,
  );

  if (!joinResult.success) {
    const retry = await awaitStartupAcquisition(resolveFailedJoinReattempt({
      bootstrapAPI,
      joinAttempt: options._joinAttempt,
      joinResult,
      logger: mainLogger,
      nodeId,
      nodeJoiningService,
      reattemptPolicy: joinReattemptPolicy,
      signal: options.signal,
    }), options.signal);
    return startJoinNode({
      ...options,
      _joinAttempt: retry.joinAttempt,
      _previousLifecycleStateMachine: retry.previousLifecycleStateMachine,
    });
  }

  let joinLogsPersistence = null;

  mainLogger.info(ENTRYPOINT_LOG_MSG.JOINED_CLUSTER, {
    messageGroupCount: joinResult.messageGroupServices.size,
    duration: joinResult.duration,
  });

  const joinedClusterId = resolveJoinedClusterId(
    nodeJoiningService,
    persistedClusterId,
  );
  await awaitStartupAcquisition(persistJoinSeedRejoinHints({
    dataDir: dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: joiningNodeAddress,
    peerAddresses: seedNodeAddresses,
    clusterId: joinedClusterId,
    bootIncarnation,
    logger: mainLogger,
  }), options.signal);

  const metadataHandles = resolveMetadataHandles(
    joinResult.messageGroupServices,
  );
  let metadata = metadataHandles[METADATA_KEY];
  const mutationTarget = metadataHandles[METADATA_MUTATION_TARGET_KEY];
  metadata = assertCritical(
    metadata,
    ENTRYPOINT_ERROR_MSG[METADATA_REQUIRED_ERROR_KEY],
  );
  hydrateBootstrapApiRuntime({
    bootstrapAPI,
    [METADATA_KEY]: metadata,
    messageGroupServices: joinResult.messageGroupServices,
    partitionServices: joinResult.partitionServices,
    replicaHandler: joinResult.replicaHandler,
    epochManager: nodeJoiningService.epochManager,
    messageRouter: joinResult.messageRouter,
    startupRecoveryCoordinator:
      nodeJoiningService.rebalanceCoordinator?.startupRecoveryCoordinator ||
      null,
  });

  const joinSqlRuntime = await acquireStartupOwner({
    acquire: () => createSqlRuntimeComposition({
      nodeId,
      [METADATA_KEY]: metadata,
      messageRouter: joinResult.messageRouter,
      owner: nodeJoiningService.runtimeDependencyOwner,
      partitionServices: joinResult.partitionServices,
      logger: mainLogger,
    }),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (runtime) => options.cleanupLedger.defer(async () => {
      await runtime.applicationDatabaseRuntime.close();
      runtime.detachMigrationRecovery();
      await runtime.sqlQueryEngine.shutdown();
    }),
  });
  const sqlQueryEngine = joinSqlRuntime.sqlQueryEngine;
  const detachJoinMigrationRecovery =
    joinSqlRuntime.detachMigrationRecovery;
  attachSqlRuntimeToStartupOwner({
    owner: nodeJoiningService,
    sqlQueryEngine,
    [METADATA_KEY]: metadata,
    [METADATA_MUTATION_TARGET_KEY]: mutationTarget || metadata,
    messageRouter: joinResult.messageRouter,
    partitionServicesProvider: () => joinResult.partitionServices,
  });

  const joinDynamicConfigWiring = await acquireStartupOwner({
    acquire: () => startDynamicConfigWiring({
      nodeId,
      [METADATA_KEY]: metadata,
      sqlQueryEngine,
      messageGroupServices: joinResult.messageGroupServices,
      partitionServices: joinResult.partitionServices,
      runtimeOwner: nodeJoiningService.runtimeDependencyOwner,
    }, mainLogger),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (wiring) => options.cleanupLedger.defer(() =>
      shutdownDynamicConfigWiring(wiring, mainLogger)),
  });

  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
  joinAdminRuntime = await acquireStartupOwner({
    acquire: () => startAdminRuntimeComposition({
      nodeId,
      [METADATA_KEY]: metadata,
      [METADATA_MUTATION_TARGET_KEY]: mutationTarget || metadata,
      sqlQueryEngine,
      owner: nodeJoiningService.runtimeDependencyOwner,
      messageRouter: joinResult.messageRouter,
      partitionServices: joinResult.partitionServices,
    }),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (runtime) => options.cleanupLedger.defer(() =>
      shutdownAdminRuntimeComposition(runtime)),
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
    [METADATA_GETTER_KEY]: () => metadata,
    logger: mainLogger,
  });
  options.cleanupLedger.defer(() => rejoinHintsPersistence.stop());

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
  options.cleanupLedger.defer(() => joinLogsPersistence.cancel?.());

  const applicationDatabaseRuntime =
    joinSqlRuntime.applicationDatabaseRuntime;
  const shutdownRuntime = createRuntimeShutdown({
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
    closeApplicationDatabases: () => applicationDatabaseRuntime.close(),
    failureMessage: 'Failed to shutdown joining node cleanly',
  });
  return Object.freeze({
    bootstrapAPI,
    logger: mainLogger,
    nodeId,
    openApplicationDatabase:
      applicationDatabaseRuntime.openApplicationDatabase,
    shutdownRuntime,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.JOIN,
    startupOwner: nodeJoiningService,
  });
}

async function startSeedNode(options) {
  throwIfStartupAborted(options.signal);
  const {config, mainLogger, dataDirectoryManager, rolloutControls} = options;
  const env = options.env;
  const nodeId = config.get(CONFIG_KEY.NODE_ID);
  const {
    wsPort,
    nodeHttpAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
  } = resolveRuntimeAddresses(config);

  mainLogger.info(ENTRYPOINT_LOG_MSG.STARTING_SEED);
  const bootIncarnation = await awaitStartupAcquisition(
    mintBootIncarnation(dataDirectoryManager.getDataDir()),
    options.signal,
  );
  const clusterIncarnationFence = await awaitStartupAcquisition(
    resolveLocalClusterIncarnationFence({
      dataDir: dataDirectoryManager.getDataDir(),
      nodeId,
      nodeAddress: seedNodeHttpAddress,
    }),
    options.signal,
  );

  const readinessState = createReadinessStateWithDiagnostics(
    mainLogger,
    nodeId,
  );
  let seedAdminRuntime = null;
  throwIfStartupAborted(options.signal);
  const bootstrapService = new BootstrapService({
    nodeId,
    nodeAddress: seedNodeHttpAddress,
    advertisedNodeWsAddress,
    dataDirectoryManager,
    wsPort: wsPort,
    rolloutControls,
    clusterIncarnationFence,
    readinessState,
    bootIncarnation,
  });
  options.cleanupLedger.defer(() => bootstrapService.shutdown());

  const bootstrapAPI = new BootstrapAPI({
    seedNodeId: nodeId,
    seedNodeAddress: seedNodeHttpAddress,
    seedNodeWsAddress: advertisedNodeWsAddress,
    wsPort: wsPort,
    messageGroupServices: bootstrapService.messageGroupServices,
    partitionServices: bootstrapService.partitionServices,
    replicaHandler: bootstrapService.replicaHandler,
    [METADATA_KEY]: bootstrapService[METADATA_KEY],
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

  options.cleanupLedger.defer(() => bootstrapAPI.shutdown());
  await awaitStartupAcquisition(bootstrapAPI.initialize(), options.signal);

  const bootstrapResult = await awaitStartupAcquisition(
    bootstrapService.bootstrap(),
    options.signal,
  );

  if (!bootstrapResult.success) {
    mainLogger.error(ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED, {
      error: bootstrapResult.error,
    });
    throw new Error(bootstrapResult.error || ENTRYPOINT_LOG_MSG.BOOTSTRAP_FAILED);
  }

  let seedLogsPersistence = null;

  mainLogger.info(ENTRYPOINT_LOG_MSG.BOOTSTRAP_COMPLETED, {
    servicesCreated: bootstrapResult.servicesCreated,
    partitionsCreated: bootstrapResult.partitionsCreated,
    messageGroupsCreated: bootstrapResult.messageGroupsCreated,
  });

  const metadata = NodeService.getInstance()[METADATA_GETTER_KEY]();
  hydrateBootstrapApiRuntime({
    bootstrapAPI,
    [METADATA_KEY]: metadata,
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
    await awaitStartupAcquisition(
      bootstrapService.startWebSocketServer(),
      options.signal,
    );
    mainLogger.info(ENTRYPOINT_LOG_MSG.WS_STARTED);
  } catch (wsError) {
    throwIfStartupAborted(options.signal);
    mainLogger.warn(ENTRYPOINT_LOG_MSG.WS_START_FAILED, {
      error: wsError.message,
    });
  }

  const seedSqlRuntime = await acquireStartupOwner({
    acquire: () => createSqlRuntimeComposition({
      nodeId,
      [METADATA_KEY]: metadata,
      messageRouter: bootstrapResult.messageRouter,
      owner: bootstrapService.runtimeDependencyOwner,
      partitionServices: bootstrapResult.partitionServices,
      logger: mainLogger,
    }),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (runtime) => options.cleanupLedger.defer(async () => {
      await runtime.applicationDatabaseRuntime.close();
      runtime.detachMigrationRecovery();
      await runtime.sqlQueryEngine.shutdown();
    }),
  });
  const sqlQueryEngine = seedSqlRuntime.sqlQueryEngine;
  const detachSeedMigrationRecovery =
    seedSqlRuntime.detachMigrationRecovery;
  attachSqlRuntimeToStartupOwner({
    owner: bootstrapService,
    sqlQueryEngine,
    [METADATA_KEY]: metadata,
    [METADATA_MUTATION_TARGET_KEY]: metadata,
    messageRouter: bootstrapResult.messageRouter,
    partitionServicesProvider: () => bootstrapResult.partitionServices,
  });

  const seedDynamicConfigWiring = await acquireStartupOwner({
    acquire: () => startDynamicConfigWiring({
      nodeId,
      [METADATA_KEY]: metadata,
      sqlQueryEngine,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      runtimeOwner: bootstrapService.runtimeDependencyOwner,
    }, mainLogger),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (wiring) => options.cleanupLedger.defer(() =>
      shutdownDynamicConfigWiring(wiring, mainLogger)),
  });

  bootstrapAPI.setSqlQueryEngine(sqlQueryEngine);
  seedAdminRuntime = await acquireStartupOwner({
    acquire: () => startAdminRuntimeComposition({
      nodeId,
      [METADATA_KEY]: metadata,
      [METADATA_MUTATION_TARGET_KEY]: metadata,
      sqlQueryEngine,
      owner: bootstrapService.runtimeDependencyOwner,
      messageRouter: bootstrapResult.messageRouter,
      partitionServices: bootstrapResult.partitionServices,
    }),
    assertActive: () => throwIfStartupAborted(options.signal),
    register: (runtime) => options.cleanupLedger.defer(() =>
      shutdownAdminRuntimeComposition(runtime)),
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
    [METADATA_GETTER_KEY]: () => metadata,
    logger: mainLogger,
  });
  options.cleanupLedger.defer(() => rejoinHintsPersistence.stop());

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
  options.cleanupLedger.defer(() => seedLogsPersistence.cancel?.());

  const applicationDatabaseRuntime =
    seedSqlRuntime.applicationDatabaseRuntime;
  const shutdownRuntime = createRuntimeShutdown({
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
    closeApplicationDatabases: () => applicationDatabaseRuntime.close(),
    failureMessage: 'Failed to shutdown seed node cleanly',
  });
  return Object.freeze({
    bootstrapAPI,
    logger: mainLogger,
    nodeId,
    openApplicationDatabase:
      applicationDatabaseRuntime.openApplicationDatabase,
    shutdownRuntime,
    startupBranch: ENTRYPOINT_RUNTIME_VALUE.SEED,
    startupOwner: bootstrapService,
  });
}

async function resolveConfigurationOverrides(cliArgs, environment) {
  const overrides = {};
  if (cliArgs.dataDir) {
    overrides.storage = {dataDir: cliArgs.dataDir};
  }
  if (!environment.NODE_ID) {
    const identityDataDir = cliArgs.dataDir ||
      environment.DATA_DIR ||
      DEFAULT_CONFIG.storage.dataDir;
    const persistedNodeId = await readPersistedLocalNodeId(identityDataDir);
    if (persistedNodeId) overrides.node = {id: persistedNodeId};
  }
  return overrides;
}

function initializeRuntimeLogging(config, environment) {
  const debugLogsEnabled = environment.LAGRANGE_DEBUG_LOGS === 'true';
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
  return Object.freeze({
    configLogger: loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.CONFIG),
    mainLogger: loggingService.forSubsystem(ENTRYPOINT_SUBSYSTEM.MAIN),
  });
}

async function logBootProvenance(options) {
  const provenance = await resolveBootSourceProvenance();
  options.logger.info(ENTRYPOINT_LOG_MSG.STARTING, {
    nodeId: options.config.get(CONFIG_KEY.NODE_ID),
    version: VERSION,
    dataDir: options.dataDirectoryManager.getDataDir(),
    hlcTimestamp: options.hlcClock.now().toString(),
    bootedSrcFingerprint: provenance.bootedSrcFingerprint,
    expectedSrcFingerprint: provenance.expectedSrcFingerprint,
    srcFingerprintMatches: provenance.srcFingerprintMatches,
  });
  if (provenance.srcFingerprintMatches === false) {
    options.logger.warn(ENTRYPOINT_LOG_MSG.STALE_SOURCE_DETECTED, {
      nodeId: options.config.get(CONFIG_KEY.NODE_ID),
      bootedSrcFingerprint: provenance.bootedSrcFingerprint,
      expectedSrcFingerprint: provenance.expectedSrcFingerprint,
    });
  }
}

async function runStartupWithCleanup(cleanupLedger, startup) {
  try {
    const runtime = await startup();
    cleanupLedger.release();
    return runtime;
  } catch (error) {
    await cleanupLedger.unwind().catch(() => undefined);
    throw error;
  }
}

async function acquireLagrangeRuntime(options, cleanupLedger) {
  const environment = options.environment;
  const cliArgs = options.cliArgs;
  throwIfStartupAborted(options.signal);

  const overrides = await awaitStartupAcquisition(
    resolveConfigurationOverrides(cliArgs, environment),
    options.signal,
  );

  throwIfStartupAborted(options.signal);
  const config = ConfigurationManager.getInstance();
  config.initialize(options.configuration, {
    environment,
    finalOverrides: overrides,
  });

  const {configLogger, mainLogger} = initializeRuntimeLogging(
    config,
    environment,
  );
  const selectedRaftProvider = getProcessRaftProvider(environment);
  mainLogger.info(RAFT_PROVIDER_LOG_MSG.SELECTED, {
    provider: selectedRaftProvider,
  });
  ensureLiferaftProviderForRuntime(environment);

  configLogger.debug(ENTRYPOINT_RUNTIME_VALUE.CONFIGURATION_LOADED, {
    categories: config.getCategories(),
  });

  const dataDirectoryManager = DataDirectoryManager.getInstance();
  dataDirectoryManager.initialize();

  const hlcClock = new HLCClockService(config.get(CONFIG_KEY.NODE_ID), {
    maxDrift: config.get(CONFIG_KEY.HLC_MAX_DRIFT_MS),
    maxLogicalCounter: config.get(CONFIG_KEY.HLC_MAX_LOGICAL_COUNTER),
  });

  await awaitStartupAcquisition(
    logBootProvenance({config, dataDirectoryManager, hlcClock,
      logger: mainLogger}),
    options.signal,
  );

  if (cliArgs.dryRun) {
    mainLogger.info(ENTRYPOINT_LOG_MSG.DRY_RUN_COMPLETED, {
      nodeId: config.get(CONFIG_KEY.NODE_ID),
      dataDir: dataDirectoryManager.getDataDir(),
      provider: selectedRaftProvider,
    });
    return Object.freeze({dryRun: true});
  }

  const startupJoinDecision = await awaitStartupAcquisition(resolveStartupJoinDecision({
    cliArgs,
    env: environment,
    config,
    dataDirectoryManager,
    logger: mainLogger,
  }), options.signal);
  const rolloutControls = resolveRolloutControlsFromEnvironment(environment);

  if (startupJoinDecision.seedNodeAddress) {
    return startJoinNode({
      cleanupLedger,
      config,
      mainLogger,
      dataDirectoryManager,
      rolloutControls,
      seedNodeAddress: startupJoinDecision.seedNodeAddress,
      seedNodeAddresses: startupJoinDecision.seedNodeAddresses,
      startupMode: startupJoinDecision.startupMode,
      membershipOwnerOutcome: startupJoinDecision.membershipOwnerOutcome,
      env: environment,
      signal: options.signal,
    });
  }

  return startSeedNode({
    cleanupLedger,
    config,
    mainLogger,
    dataDirectoryManager,
    rolloutControls,
    env: environment,
    signal: options.signal,
  });
}
async function startLagrangeRuntime(options) {
  const claimAccepted = options.processClaim ?
    ownsProcessRuntimeClaim(options.processClaim) :
    claimProcessRuntime();
  if (!claimAccepted) {
    throw createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.RUNTIME_ACTIVE,
      APPLICATION_DATABASE_ERROR_MSG.RUNTIME_ACTIVE,
    );
  }
  const cleanupLedger = createStartupAcquisitionLedger();
  return runStartupWithCleanup(
    cleanupLedger,
    () => acquireLagrangeRuntime(options, cleanupLedger),
  );
}

export {startLagrangeRuntime};
