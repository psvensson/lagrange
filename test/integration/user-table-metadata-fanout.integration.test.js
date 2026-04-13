/**
 * Integration test: later-created user-table metadata fanout.
 *
 * Verifies that a user table created after node joins has its control-plane
 * metadata propagated into every node-local system cache.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  TEST_CONFIG,
  waitFor,
  gracefulJoiningShutdown,
  gracefulShutdown,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 45000;
const TABLE_NAME = 'user_table_metadata_fanout';
const CREATE_TABLE_SQL = `
  CREATE TABLE user_table_metadata_fanout (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`;
const CACHE_WAIT_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 50;

function getTableMetadataState(systemTableCache, tableName) {
  const tableRows = (systemTableCache.getAll(TABLES.TABLES) || [])
    .filter((row) => row.table_name === tableName);
  const partitionRows = (systemTableCache.getAll(TABLES.PARTITIONS) || [])
    .filter((row) => row.table_name === tableName);
  const partitionIds = new Set(partitionRows.map((row) => row.partition_id));
  const partitionServices = (systemTableCache.getAll(TABLES.SERVICES) || [])
    .filter((row) =>
      partitionIds.has(row.partition_id) &&
      row.service_type === SERVICE_TYPE.PARTITION &&
      row.status === SERVICE_STATUS.ACTIVE,
    );
  const activePartitionIds = new Set(partitionServices.map((row) => row.partition_id));
  const leaderPartitionIds = new Set(partitionRows
    .filter((row) =>
      typeof row.leader_node_id === 'string' &&
      row.leader_node_id.length > 0,
    )
    .map((row) => row.partition_id));
  return {
    tableRowCount: tableRows.length,
    partitionRowCount: partitionRows.length,
    partitionIds: [...partitionIds].sort(),
    activePartitionServiceCount: partitionServices.length,
    activePartitionIds: [...activePartitionIds].sort(),
    leaderPartitionIds: [...leaderPartitionIds].sort(),
    ready:
      tableRows.length > 0 &&
      partitionRows.length > 0 &&
      activePartitionIds.size === partitionIds.size &&
      leaderPartitionIds.size === partitionIds.size,
  };
}

test('Later-created user-table metadata fans out to all node-local system caches',
  {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655449921';
    const joinNodeIds = [
      '550e8400-e29b-41d4-a716-446655449922',
      '550e8400-e29b-41d4-a716-446655449923',
    ];
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 3000,
      },
    });

    let bootstrapResult;
    let seedApi;
    let seedSqlEngine;
    const joiningServices = [];

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const seedSystemTableCache = NodeService.getInstance().getSystemTableCache();
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: seedSystemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});

      seedSqlEngine = new SQLQueryEngine({
        systemCache: seedSystemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        cdcIntegrationService: bootstrapService.cdcIntegrationService,
        nodeId: seedNodeId,
        rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
      });
      seedApi.setSqlQueryEngine(seedSqlEngine);

      const httpPost = createInProcHttpPost(seedApi);
      for (const nodeId of joinNodeIds) {
        const joiningWsPort = getUniquePort();
        const joiningService = new NodeJoiningService({
          nodeId,
          nodeAddress: `ws://localhost:${joiningWsPort}`,
          seedNodeAddress: 'http://localhost:0',
          seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
          wsPort: joiningWsPort,
          config: {
            httpTimeoutMs: 5000,
            leadershipWaitTimeoutMs: 10000,
            leadershipWaitInitialDelayMs: 10,
            leadershipWaitMaxDelayMs: 100,
            replicaStaggerDelayMs: 20,
          },
          httpPost,
        });
        const joinResult = await joiningService.join();
        t.equal(joinResult.success, true, `${nodeId} should join successfully`);
        joiningServices.push(joiningService);
      }

      const createResult = await seedSqlEngine.executeQuery(CREATE_TABLE_SQL);
      t.equal(createResult.success, true, 'create table should succeed on seed');

      const caches = [{
        nodeId: seedNodeId,
        systemTableCache: seedSystemTableCache,
      }, ...joiningServices.map((joiningService) => ({
        nodeId: joiningService.nodeId,
        systemTableCache: joiningService.cdcIntegrationService?.systemTableCache || null,
      }))];

      for (const cacheEntry of caches) {
        t.ok(
          cacheEntry.systemTableCache,
          `${cacheEntry.nodeId} should expose a system table cache`,
        );
        if (!cacheEntry.systemTableCache) {
          continue;
        }
        let metadataState = null;
        const ready = await waitFor(() => {
          metadataState = getTableMetadataState(
            cacheEntry.systemTableCache,
            TABLE_NAME,
          );
          return metadataState.ready;
        }, CACHE_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
        t.equal(
          ready,
          true,
          cacheEntry.nodeId + ' should observe table metadata fanout: ' +
            JSON.stringify(metadataState),
        );
      }
    } finally {
      for (const joiningService of joiningServices.reverse()) {
        await gracefulJoiningShutdown(joiningService);
      }
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });
