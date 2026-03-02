/**
 * Three-node seed rebalance integration test.
 *
 * Verifies that when a cluster grows from one to three nodes, at least one
 * existing partition replica is placed on a non-seed node.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 12000;
const REBALANCE_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 100;
const CLEANUP_TIMEOUT_MS = 10000;
const EXPECTED_NODE_COUNT = 3;
const REQUIRED_REBALANCED_PARTITIONS = 1;

async function withTimeout(task, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runWithCleanupTimeout(task, label, t) {
  let timeoutId;
  try {
    await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${CLEANUP_TIMEOUT_MS}ms`));
        }, CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    t.comment(`cleanup warning: ${error.message}`);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Collect partition service rows from the system cache.
 *
 * @param {Object} systemTableCache - System table cache.
 * @return {Array<Object>} Partition service rows.
 */
function getPartitionReplicaRows(systemTableCache) {
  return systemTableCache.filter(
    SystemTableName.SERVICES,
    (row) =>
      row.service_type === SERVICE_TYPE.PARTITION &&
      typeof row.partition_id === 'string' &&
      row.partition_id.length > 0,
  ) || [];
}

/**
 * Find baseline partitions that now have at least one replica on a non-seed
 * node.
 *
 * @param {Array<Object>} rows - Partition service rows.
 * @param {Set<string>} baselinePartitionIds - Partitions present before joins.
 * @param {string} seedNodeId - Seed node identifier.
 * @return {Array<string>} Partition IDs with non-seed replicas.
 */
function findRebalancedBaselinePartitions(rows, baselinePartitionIds, seedNodeId) {
  const rowsByPartition = new Map();
  for (const row of rows) {
    if (!baselinePartitionIds.has(row.partition_id)) {
      continue;
    }
    if (!rowsByPartition.has(row.partition_id)) {
      rowsByPartition.set(row.partition_id, []);
    }
    rowsByPartition.get(row.partition_id).push(row);
  }

  const rebalancedPartitionIds = [];
  for (const [partitionId, partitionRows] of rowsByPartition.entries()) {
    const hasSeedReplica = partitionRows.some((row) => row.node_id === seedNodeId);
    const hasNonSeedReplica = partitionRows.some((row) => row.node_id !== seedNodeId);
    if (hasSeedReplica && hasNonSeedReplica) {
      rebalancedPartitionIds.push(partitionId);
    }
  }
  return rebalancedPartitionIds;
}

test('Three-node seed rebalance', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test(
    'moves at least one partition replica off seed node',
    {timeout: TEST_TIMEOUT_MS},
    async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440401';
    const node2Id = '550e8400-e29b-41d4-a716-446655440402';
    const node3Id = '550e8400-e29b-41d4-a716-446655440403';
    const seedWsPort = getUniquePort();
    const node2WsPort = getUniquePort();
    const node3WsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 2000,
      },
    });

    let bootstrapResult = null;
    let seedApi = null;
    let node2JoinService = null;
    let node3JoinService = null;

    try {
      bootstrapResult = await withTimeout(
        () => bootstrapService.bootstrap(),
        READY_TIMEOUT_MS,
        'seed bootstrap',
      );
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'system table cache should be available');

      const queryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
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
      await withTimeout(
        () => seedApi.initialize(0, {listen: false}),
        READY_TIMEOUT_MS,
        'seed API initialize',
      );
      seedApi.setSqlQueryEngine(queryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      const initialRows = getPartitionReplicaRows(systemTableCache);
      const baselinePartitionIds = new Set(
        initialRows.map((row) => row.partition_id),
      );
      const baselineNonSeedRows = initialRows.filter(
        (row) => row.node_id !== seedNodeId,
      );

      t.ok(
        baselinePartitionIds.size > 0,
        'seed bootstrap should create baseline partitions',
      );
      t.equal(
        baselineNonSeedRows.length,
        0,
        'before joins, baseline partition replicas should be on seed only',
      );

      node2JoinService = new NodeJoiningService({
        nodeId: node2Id,
        nodeAddress: `ws://localhost:${node2WsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: node2WsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 12000,
        },
        httpPost,
      });

      node3JoinService = new NodeJoiningService({
        nodeId: node3Id,
        nodeAddress: `ws://localhost:${node3WsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: node3WsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 12000,
        },
        httpPost,
      });

      const node2Result = await withTimeout(
        () => node2JoinService.join(),
        READY_TIMEOUT_MS,
        'node2 join',
      );
      t.equal(node2Result.success, true, 'second node should join');

      const node3Result = await withTimeout(
        () => node3JoinService.join(),
        READY_TIMEOUT_MS,
        'node3 join',
      );
      t.equal(node3Result.success, true, 'third node should join');

      const nodesReady = await waitFor(() => {
        const now = Date.now();
        const readyNodes = systemTableCache.filter(
          SystemTableName.NODES,
          (row) => isNodeRecordReady(row, {now, requireActiveStatus: true}),
        ) || [];
        const readyNodeIds = new Set(readyNodes.map((row) => row.node_id));
        return readyNodeIds.has(seedNodeId) &&
          readyNodeIds.has(node2Id) &&
          readyNodeIds.has(node3Id) &&
          readyNodeIds.size >= EXPECTED_NODE_COUNT;
      }, READY_TIMEOUT_MS, POLL_INTERVAL_MS);

      t.equal(nodesReady, true, 'all three nodes should become ready');

      let rebalancedPartitionIds = [];
      const rebalanceObserved = await waitFor(() => {
        const currentRows = getPartitionReplicaRows(systemTableCache);
        rebalancedPartitionIds = findRebalancedBaselinePartitions(
          currentRows,
          baselinePartitionIds,
          seedNodeId,
        );
        return rebalancedPartitionIds.length >= REQUIRED_REBALANCED_PARTITIONS;
      }, REBALANCE_TIMEOUT_MS, POLL_INTERVAL_MS);

      if (!rebalanceObserved) {
        const finalRows = getPartitionReplicaRows(systemTableCache).map((row) => ({
          partition_id: row.partition_id,
          node_id: row.node_id,
          status: row.status,
          raft_role: row.raft_role,
        }));
        t.comment(`Final partition placements: ${JSON.stringify(finalRows)}`);
      }

      t.equal(
        rebalanceObserved,
        true,
        'at least one baseline partition should gain a non-seed replica',
      );
      t.ok(
        rebalancedPartitionIds.length >= REQUIRED_REBALANCED_PARTITIONS,
        'should identify baseline partitions rebalanced off seed',
      );
    } finally {
      await runWithCleanupTimeout(
        () => gracefulJoiningShutdown(node3JoinService),
        'node3 joining shutdown',
        t,
      );
      await runWithCleanupTimeout(
        () => gracefulJoiningShutdown(node2JoinService),
        'node2 joining shutdown',
        t,
      );
      await runWithCleanupTimeout(
        () => gracefulShutdown(bootstrapService, bootstrapResult, seedApi),
        'cluster graceful shutdown',
        t,
      );
    }
    },
  );
});
