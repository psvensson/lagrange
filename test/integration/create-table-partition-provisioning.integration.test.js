import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  cleanupTestEnvironment,
  gracefulShutdown,
  getUniquePort,
  createVirginSeedBootstrapService,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TABLE_NAME = 'benchmark_events';
const CREATE_TABLE_SQL = `
  CREATE TABLE benchmark_events (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`;
const INSERT_SQL = 'INSERT INTO benchmark_events (id, payload) VALUES (?, ?)';
const SELECT_SQL = 'SELECT id, payload FROM benchmark_events WHERE id = ?';
const CREATE_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 50;
const TEST_TIMEOUT_MS = 120000;

function getTableRoutingState(systemTableCache, tableName = TABLE_NAME) {
  const partitions = systemTableCache.filter(
    TABLES.PARTITIONS,
    (partition) => partition.table_name === tableName,
  );
  const partition = partitions[0] || null;
  if (!partition) {
    return {
      partition: null,
      services: [],
      hasRoutableService: false,
    };
  }

  const services = systemTableCache.filter(
    TABLES.SERVICES,
    (service) =>
      service.partition_id === partition.partition_id &&
      service.service_type === SERVICE_TYPE.PARTITION &&
      service.status === SERVICE_STATUS.ACTIVE &&
      typeof service.address === 'string' &&
      service.address.length > 0,
  );

  return {
    partition,
    services,
    hasRoutableService: services.length > 0,
  };
}

async function composeSeedWithTableProvisioningEngine({
  seedNodeId,
  seedWsPort,
  config,
}) {
  config.setByPath('partition.defaultReplicaCount', 1);
  const bootstrapService = await createVirginSeedBootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: {
      leadershipWaitTimeoutMs: 3000,
      leadershipWaitInitialDelayMs: 10,
      leadershipWaitMaxDelayMs: 100,
      replicaStaggerDelayMs: 20,
    },
  });
  const bootstrapResult = await bootstrapService.bootstrap();
  assert.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  const sqlQueryEngine = new SQLQueryEngine({
    systemCache: systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    cdcIntegrationService: bootstrapService.cdcIntegrationService,
    nodeId: seedNodeId,
    rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
  });
  const seedApi = new BootstrapAPI({
    seedNodeId,
    seedNodeAddress: `ws://localhost:${seedWsPort}`,
    seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    epochManager: bootstrapResult.epochManager,
    bootstrapService,
  });
  await seedApi.initialize(0, {listen: false});
  seedApi.setSqlQueryEngine(sqlQueryEngine);
  return {bootstrapService, bootstrapResult, seedApi, sqlQueryEngine, systemTableCache};
}

test('Create table provisions routable partition replica', {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655449901';
    const seedWsPort = getUniquePort();
    const config = ConfigurationManager.getInstance();
    let bootstrapService = null;
    let bootstrapResult = null;
    let seedApi = null;
    let sqlQueryEngine = null;
    let systemTableCache = null;
    try {
      ({
        bootstrapService, bootstrapResult, seedApi, sqlQueryEngine,
        systemTableCache,
      } = await composeSeedWithTableProvisioningEngine({
        seedNodeId, seedWsPort, config,
      }));

      const createResult = await sqlQueryEngine.executeQuery(CREATE_TABLE_SQL);
      t.equal(createResult.success, true, 'create table should succeed');

      const hasRoutableService = await waitFor(() => {
        const routing = getTableRoutingState(systemTableCache);
        return routing.hasRoutableService;
      }, CREATE_TIMEOUT_MS, POLL_INTERVAL_MS);

      const routingState = getTableRoutingState(systemTableCache);
      t.equal(
        hasRoutableService,
        true,
        `table partition should become routable; state=${JSON.stringify(routingState)}`,
      );

      const insertResult = await sqlQueryEngine.executeQuery(
        INSERT_SQL,
        ['evt-1', 'payload-1'],
      );
      t.equal(insertResult.success, true, 'insert should succeed after table create');

      const selectResult = await sqlQueryEngine.executeQuery(SELECT_SQL, ['evt-1']);
      t.equal(selectResult.success, true, 'select should succeed');
      const selectRows = Array.isArray(selectResult.rows) ? selectResult.rows : [];
      t.equal(selectRows.length, 1, 'select should return inserted row');
      if (selectRows.length === 1) {
        t.equal(selectRows[0].id, 'evt-1', 'selected row should match inserted ID');
        t.equal(selectRows[0].payload, 'payload-1', 'selected row payload should match');
      }
    } finally {
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });

const SECOND_TABLE_NAME = 'events_after_round_trip';
const SECOND_CREATE_TABLE_SQL = `
  CREATE TABLE ${SECOND_TABLE_NAME} (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`;

// The Lagrange-Images #316 shape: a first table provisions and serves a
// public write, and a SECOND table creation still provisions afterwards —
// while the node's own bookkeeping churn (leader claims, publications, CDC
// echoes) streams through the planning source. Admission must see the sole
// node's CURRENT planning identity and serve-eligible trust, never refuse
// with `readiness_planning_identity_unavailable` or an empty
// candidateTargetNodeIds.
test('Second table creation admits the sole node under bookkeeping churn', {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655449902';
    const seedWsPort = getUniquePort();
    const config = ConfigurationManager.getInstance();
    let bootstrapService = null;
    let bootstrapResult = null;
    let seedApi = null;
    let sqlQueryEngine = null;
    let systemTableCache = null;
    try {
      ({
        bootstrapService, bootstrapResult, seedApi, sqlQueryEngine,
        systemTableCache,
      } = await composeSeedWithTableProvisioningEngine({
        seedNodeId, seedWsPort, config,
      }));

      // The preliminary public round trip that precedes Images schema work.
      const firstCreate = await sqlQueryEngine.executeQuery(CREATE_TABLE_SQL);
      t.equal(firstCreate.success, true, 'first table create should succeed');
      const insertResult = await sqlQueryEngine.executeQuery(
        INSERT_SQL,
        ['evt-1', 'payload-1'],
      );
      t.equal(insertResult.success, true, 'public write should succeed');

      // The provisioning step that #316 blocked: the next table creation
      // after the cohort is already serving public writes.
      const secondCreate = await sqlQueryEngine.executeQuery(
        SECOND_CREATE_TABLE_SQL,
      );
      t.equal(
        secondCreate.success, true,
        'second table create should succeed on a current single-node ' +
          `cohort; error=${JSON.stringify(
            secondCreate?.error || secondCreate?.message || null)}`,
      );
      const hasRoutableService = await waitFor(() => {
        const routing = getTableRoutingState(systemTableCache, SECOND_TABLE_NAME);
        return routing.hasRoutableService;
      }, CREATE_TIMEOUT_MS, POLL_INTERVAL_MS);
      const routingState = getTableRoutingState(
        systemTableCache, SECOND_TABLE_NAME);
      t.equal(
        hasRoutableService,
        true,
        'second table partition should become routable; state=' +
          `${JSON.stringify(routingState)}`,
      );
      const secondInsert = await sqlQueryEngine.executeQuery(
        INSERT_SQL,
        ['evt-2', 'payload-2'],
      );
      t.equal(secondInsert.success, true, 'write into second table should succeed');
    } finally {
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });
