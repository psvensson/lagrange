import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
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
const CREATE_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 50;
const TEST_TIMEOUT_MS = 45000;

function getTableRoutingState(systemTableCache) {
  const partitions = systemTableCache.filter(
    TABLES.PARTITIONS,
    (partition) => partition.table_name === TABLE_NAME,
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

test('Create table provisions routable partition replica', {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment({
        rebalancer: {
          periodicCheckIntervalMs: 600000,
          periodicCheckJitterMs: 100,
          stabilizationPeriodMs: 10000,
        },
      });
    });

    t.afterEach(async () => {
      await cleanupTestEnvironment();
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655449901';
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
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

    try {
      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        cdcIntegrationService: bootstrapService.cdcIntegrationService,
        nodeId: seedNodeId,
        rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
      });

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
      await bootstrapService.shutdown().catch(() => {});
    }
  });
