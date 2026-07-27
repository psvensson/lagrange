import {AddressManager} from '../../src/address/address-manager.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapReadinessState} from
  '../../src/bootstrap/bootstrap-readiness-state.js';
import {BootstrapService} from
  '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../src/bootstrap/shared/startup-sql-runtime-handoff.js';
import {
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
} from '../../src/entrypoint-runtime-helpers.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';
import {
  buildPgwireCredentialVerifier,
} from '../../src/runtime/pgwire-credential-verifier.js';
import {DataDirectoryManager} from
  '../../src/storage/data-directory-manager.js';
import {ServiceThreadManager} from
  '../../src/threading/service-thread-manager.js';

const EXAMPLE_NODE = Object.freeze({
  DATABASE: 'request_binding_example',
  NODE_ID: 'request-binding-example-node',
  PASSWORD: 'request-binding-example-password',
  USER: 'request-binding-example-user',
  WS_PORT: 18_282,
});
const EXAMPLE_RUNTIME = Object.freeze({
  HOST: '127.0.0.1',
  LEADERSHIP_WAIT_INITIAL_DELAY_MS: 10,
  LEADERSHIP_WAIT_MAX_DELAY_MS: 100,
  LEADERSHIP_WAIT_TIMEOUT_MS: 5_000,
  LOG_LEVEL: 'error',
  RAFT_ELECTION_TIMEOUT_MAX_MS: 200,
  RAFT_ELECTION_TIMEOUT_MIN_MS: 100,
  RAFT_HEARTBEAT_INTERVAL_MS: 50,
  RAFT_LEADERSHIP_WAIT_BACKOFF_MS: 100,
  RAFT_LEADERSHIP_WAIT_TIMEOUT_MS: 5_000,
  REBALANCER_CRITICAL_CHECK_DELAY_MS: 100,
  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: 1_000,
  REBALANCER_PERIODIC_CHECK_JITTER_MS: 100,
  REBALANCER_STABILIZATION_PERIOD_MS: 1_000,
  REPLICA_STAGGER_DELAY_MS: 10,
  REST_API_PORT: 18_280,
  SQL_SESSION: 'request-binding-example-session',
  UNKNOWN_ERROR: 'unknown error',
});
const METADATA_OPTION = 'systemTableCache';
const MUTATION_TARGET_OPTION = 'cacheMutationTarget';

const SILENT_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

const LIFECYCLE_ACTIONS = Object.freeze([
  PGWIRE_AUTH_ACTION.ACCESS_CONFIGURE,
  PGWIRE_AUTH_ACTION.BINDING_CREATE,
  PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
  PGWIRE_AUTH_ACTION.SERVICE_INSTALL,
  PGWIRE_AUTH_ACTION.SERVICE_READ,
]);

function resetSingletons() {
  AddressManager.resetInstance();
  ConfigurationManager.resetInstance();
  DataDirectoryManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
}

function initializeEnvironment(dataDir) {
  resetSingletons();
  const configuration = ConfigurationManager.getInstance();
  configuration.initialize({
    logging: {level: EXAMPLE_RUNTIME.LOG_LEVEL},
    node: {
      id: EXAMPLE_NODE.NODE_ID,
      restApiPort: EXAMPLE_RUNTIME.REST_API_PORT,
      wsPort: EXAMPLE_NODE.WS_PORT,
    },
    raft: {
      electionTimeoutMaxMs: EXAMPLE_RUNTIME.RAFT_ELECTION_TIMEOUT_MAX_MS,
      electionTimeoutMinMs: EXAMPLE_RUNTIME.RAFT_ELECTION_TIMEOUT_MIN_MS,
      heartbeatIntervalMs: EXAMPLE_RUNTIME.RAFT_HEARTBEAT_INTERVAL_MS,
      leadershipWaitBackoffMs:
        EXAMPLE_RUNTIME.RAFT_LEADERSHIP_WAIT_BACKOFF_MS,
      leadershipWaitTimeoutMs:
        EXAMPLE_RUNTIME.RAFT_LEADERSHIP_WAIT_TIMEOUT_MS,
    },
    rebalancer: {
      criticalCheckDelayMs:
        EXAMPLE_RUNTIME.REBALANCER_CRITICAL_CHECK_DELAY_MS,
      periodicCheckIntervalMs:
        EXAMPLE_RUNTIME.REBALANCER_PERIODIC_CHECK_INTERVAL_MS,
      periodicCheckJitterMs:
        EXAMPLE_RUNTIME.REBALANCER_PERIODIC_CHECK_JITTER_MS,
      stabilizationPeriodMs:
        EXAMPLE_RUNTIME.REBALANCER_STABILIZATION_PERIOD_MS,
    },
    storage: {dataDir},
    transport: {wsHost: EXAMPLE_RUNTIME.HOST},
  });
  LoggingService.getInstance().initialize({
    level: EXAMPLE_RUNTIME.LOG_LEVEL,
  });
  const dataDirectoryManager = DataDirectoryManager.getInstance();
  dataDirectoryManager.initialize();
  return dataDirectoryManager;
}

function buildCredentialEnvironment() {
  return Object.freeze({
    PGWIRE_AUTH_DATABASE: EXAMPLE_NODE.DATABASE,
    PGWIRE_AUTH_PASSWORD: EXAMPLE_NODE.PASSWORD,
    PGWIRE_AUTH_USER: EXAMPLE_NODE.USER,
  });
}

async function createAuthenticatedAdapter(sqlQueryEngine, credentialEnv) {
  const authHandler = new PgWireAuthHandler({
    authenticator: buildPgwireCredentialVerifier(credentialEnv),
    logger: SILENT_LOGGER,
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    policy: {allowedActions: new Set(LIFECYCLE_ACTIONS)},
  });
  const adapter = new PostgresWireAdapter({
    authHandler,
    logger: SILENT_LOGGER,
    sqlCore: sqlQueryEngine,
  });
  await adapter.authenticate(EXAMPLE_RUNTIME.SQL_SESSION, {
    password: EXAMPLE_NODE.PASSWORD,
    tenantId: EXAMPLE_NODE.DATABASE,
    user: EXAMPLE_NODE.USER,
  });
  return adapter;
}

async function runShutdownOperations(operations, message) {
  const failures = [];
  for (let index = 0; index < operations.length; index += 1) {
    try {
      await operations[index]();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, message);
  }
}

async function shutdownSingletons() {
  await runShutdownOperations([
    () => NodeService.getInstance().shutdown(),
    () => ServiceThreadManager.getInstance().shutdown(),
    () => LoggingService.getInstance().shutdown(),
    () => resetSingletons(),
  ], 'request binding example singleton shutdown failed');
}

async function shutdownExampleNodeResources({
  bootstrapApi,
  bootstrapService,
  shutdownSingletonsOperation = shutdownSingletons,
  sqlAdapter,
  sqlRuntime,
}) {
  await runShutdownOperations([
    () => sqlAdapter?.closeSession(EXAMPLE_RUNTIME.SQL_SESSION),
    () => sqlRuntime?.detachMigrationRecovery(),
    () => bootstrapApi.shutdown(),
    () => sqlRuntime?.sqlQueryEngine?.shutdown(),
    () => bootstrapService.shutdown(),
    () => shutdownSingletonsOperation(),
  ], 'request binding example node shutdown failed');
}

function hydrateExampleMetadata(
  bootstrapApi,
  bootstrapService,
  bootstrapResult,
) {
  const systemTableCache =
    NodeService.getInstance().getSystemTableCache();
  hydrateBootstrapApiRuntime({
    bootstrapAPI: bootstrapApi,
    epochManager: bootstrapResult.epochManager,
    messageGroupServices: bootstrapResult.messageGroupServices,
    messageRouter: bootstrapResult.messageRouter,
    partitionServices: bootstrapResult.partitionServices,
    replicaHandler: bootstrapResult.replicaHandler,
    systemTableCache,
  });
  return systemTableCache;
}

async function createExampleQueryRuntime(
  bootstrapApi,
  bootstrapService,
  bootstrapResult,
  metadata,
) {
  const sqlRuntime = await createSqlRuntimeComposition({
    logger: SILENT_LOGGER,
    messageRouter: bootstrapResult.messageRouter,
    nodeId: EXAMPLE_NODE.NODE_ID,
    owner: bootstrapService.runtimeDependencyOwner,
    partitionServices: bootstrapResult.partitionServices,
    [METADATA_OPTION]: metadata,
  });
  attachSqlRuntimeToStartupOwner({
    [MUTATION_TARGET_OPTION]: metadata,
    messageRouter: bootstrapResult.messageRouter,
    owner: bootstrapService,
    partitionServicesProvider: () => bootstrapResult.partitionServices,
    sqlQueryEngine: sqlRuntime.sqlQueryEngine,
    [METADATA_OPTION]: metadata,
  });
  bootstrapApi.setSqlQueryEngine(sqlRuntime.sqlQueryEngine);
  return sqlRuntime;
}

async function bootExampleNode(dataDir, options = {}) {
  const dataDirectoryManager = initializeEnvironment(dataDir);
  const credentialEnv = buildCredentialEnvironment();
  const readinessState = new BootstrapReadinessState();
  readinessState.setMaxListeners(0);
  const nodeAddress = `${EXAMPLE_RUNTIME.HOST}:0`;
  const advertisedNodeWsAddress =
    `ws://${EXAMPLE_RUNTIME.HOST}:${EXAMPLE_NODE.WS_PORT}`;
  const bootstrapService = new BootstrapService({
    advertisedNodeWsAddress,
    config: {
      leadershipWaitInitialDelayMs:
        EXAMPLE_RUNTIME.LEADERSHIP_WAIT_INITIAL_DELAY_MS,
      leadershipWaitMaxDelayMs:
        EXAMPLE_RUNTIME.LEADERSHIP_WAIT_MAX_DELAY_MS,
      leadershipWaitTimeoutMs:
        EXAMPLE_RUNTIME.LEADERSHIP_WAIT_TIMEOUT_MS,
      replicaStaggerDelayMs: EXAMPLE_RUNTIME.REPLICA_STAGGER_DELAY_MS,
    },
    dataDirectoryManager,
    nodeAddress,
    nodeId: EXAMPLE_NODE.NODE_ID,
    readinessState,
    wsPort: EXAMPLE_NODE.WS_PORT,
  });
  const bootstrapApi = new BootstrapAPI({
    bootstrapService,
    bootstrapStartupAdapter: bootstrapService.bootstrapApiOwner,
    epochManager: bootstrapService.epochManager,
    messageGroupServices: bootstrapService.messageGroupServices,
    messageRouter: bootstrapService.messageRouter,
    partitionServices: bootstrapService.partitionServices,
    replicaHandler: bootstrapService.replicaHandler,
    readinessState,
    requestCellEnv: credentialEnv,
    requestCellDeadlineMs: options.requestCellDeadlineMs,
    runtimeOwner: bootstrapService.runtimeDependencyOwner,
    seedNodeAddress: nodeAddress,
    seedNodeId: EXAMPLE_NODE.NODE_ID,
    seedNodeWsAddress: advertisedNodeWsAddress,
    [METADATA_OPTION]: bootstrapService[METADATA_OPTION],
    wsPort: EXAMPLE_NODE.WS_PORT,
  });
  let sqlRuntime = null;
  let sqlAdapter = null;
  try {
    await bootstrapApi.initialize(0);
    const bootstrapResult = await bootstrapService.bootstrap();
    if (bootstrapResult.success !== true) {
      throw new Error(
        'seed bootstrap failed: ' +
          `${bootstrapResult.error || EXAMPLE_RUNTIME.UNKNOWN_ERROR}`,
      );
    }
    const metadata = hydrateExampleMetadata(
      bootstrapApi,
      bootstrapService,
      bootstrapResult,
    );
    await bootstrapService.startWebSocketServer();
    sqlRuntime = await createExampleQueryRuntime(
      bootstrapApi,
      bootstrapService,
      bootstrapResult,
      metadata,
    );
    sqlAdapter = await createAuthenticatedAdapter(
      sqlRuntime.sqlQueryEngine,
      credentialEnv,
    );
    const address = bootstrapApi.fastify.server.address();
    return {
      baseUrl: `http://${EXAMPLE_RUNTIME.HOST}:${address.port}`,
      bootstrapApi,
      bootstrapService,
      sqlAdapter,
      async shutdown() {
        await shutdownExampleNodeResources({
          bootstrapApi,
          bootstrapService,
          sqlAdapter,
          sqlRuntime,
        });
      },
    };
  } catch (error) {
    try {
      await shutdownExampleNodeResources({
        bootstrapApi,
        bootstrapService,
        sqlAdapter,
        sqlRuntime,
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'request binding example node boot and cleanup failed',
      );
    }
    throw error;
  }
}

export {
  EXAMPLE_NODE,
  bootExampleNode,
  shutdownExampleNodeResources,
};
