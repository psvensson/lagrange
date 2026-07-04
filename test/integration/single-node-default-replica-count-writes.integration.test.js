/**
 * Single-node cluster, PRODUCTION default replica count (no override).
 *
 * Guard for the stale-topology write-guard witness semantics
 * (write-routing-repair-under-control-plane-moves): `partitions.replica_count`
 * is a TARGET — CREATE TABLE writes it from the config default (minimum 3)
 * BEFORE placement clamps to the visible nodes, and nothing writes the
 * placed count back. On a one-node cluster every user-table partition
 * legitimately runs 1-of-3. A commit guard that treats the target as actual
 * membership rejects the lone replica's writes — and the query-envelope leg
 * of the same defect acked those rejections as success, silently dropping
 * every INSERT. The sibling test pins defaultReplicaCount=1 and can never
 * see this; this test runs the production shape: insert must land AND
 * select back.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  cleanupTestEnvironment,
  gracefulShutdown,
  getUniquePort,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TABLE_NAME = 'single_node_events';
const CREATE_TABLE_SQL = `
  CREATE TABLE single_node_events (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`;
const INSERT_SQL = 'INSERT INTO single_node_events (id, payload) VALUES (?, ?)';
const SELECT_SQL = 'SELECT id, payload FROM single_node_events WHERE id = ?';
const CREATE_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 50;
const TEST_TIMEOUT_MS = 45000;

test('single node with production default replica_count serves user-table writes',
  {timeout: TEST_TIMEOUT_MS},
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
    // Deliberately NO partition.defaultReplicaCount override: the schema
    // minimum is 3, so the partitions row targets more replicas than this
    // one-node cluster can place.
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

    let bootstrapResult = null;
    let seedApi = null;
    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        cdcIntegrationService: bootstrapService.cdcIntegrationService,
        nodeId: seedNodeId,
        rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
      });
      seedApi = new BootstrapAPI({
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

      const createResult = await sqlQueryEngine.executeQuery(CREATE_TABLE_SQL);
      t.equal(createResult.success, true, 'create table should succeed');

      const hasRoutableService = await waitFor(() => {
        const partitions = systemTableCache.filter(
          TABLES.PARTITIONS,
          (partition) => partition.table_name === TABLE_NAME,
        );
        const partition = partitions[0] || null;
        if (!partition) {
          return false;
        }
        return systemTableCache.filter(
          TABLES.SERVICES,
          (service) =>
            service.partition_id === partition.partition_id &&
            service.service_type === SERVICE_TYPE.PARTITION &&
            service.status === SERVICE_STATUS.ACTIVE &&
            typeof service.address === 'string' &&
            service.address.length > 0,
        ).length > 0;
      }, CREATE_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(hasRoutableService, true, 'table partition should become routable');

      const partitionRow = systemTableCache.filter(
        TABLES.PARTITIONS,
        (partition) => partition.table_name === TABLE_NAME,
      )[0];
      t.ok(
        Number(partitionRow?.replica_count) > 1,
        'precondition: the partitions row must target >1 replicas ' +
          `(got ${partitionRow?.replica_count}) or this test cannot ` +
          'witness the target-vs-actual conflation',
      );

      const insertResult = await sqlQueryEngine.executeQuery(
        INSERT_SQL,
        ['evt-prod-1', 'payload-prod-1'],
      );
      t.equal(
        insertResult.success,
        true,
        'insert must succeed on the lone placed replica',
      );

      const selectResult = await sqlQueryEngine.executeQuery(
        SELECT_SQL,
        ['evt-prod-1'],
      );
      t.equal(selectResult.success, true, 'select should succeed');
      const selectRows = Array.isArray(selectResult.rows) ? selectResult.rows : [];
      t.equal(
        selectRows.length,
        1,
        'the inserted row must be durably present — an acked write that ' +
          'does not select back is silent data loss',
      );
      if (selectRows.length === 1) {
        t.equal(selectRows[0].payload, 'payload-prod-1',
          'selected row payload should match');
      }
    } finally {
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });
