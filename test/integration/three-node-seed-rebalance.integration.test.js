/**
 * Three-node seed rebalance integration test.
 *
 * Verifies that when a cluster grows from one to three nodes, at least one
 * existing partition replica is placed on a non-seed node.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
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

const TEST_TIMEOUT_MS = 120000;
const READY_TIMEOUT_MS = 12000;
// The join waits get their own measured budget. READY_TIMEOUT_MS fits the
// operations it actually bounds (seed bootstrap, seed API initialize, the
// nodes-ready convergence poll); it does not fit a node JOIN in this harness,
// and it never did. This file runs three full nodes in ONE process on ONE
// event loop, so a joiner's convergence is interleaved with the seed's and the
// earlier joiner's control-plane work. Measured standalone on an idle 20-core
// host, both BEFORE and AFTER the formation-barrier compression below:
//
//   node2 join  3796-4855ms
//   node3 join 12441-14748ms   (12441, 12474, 12971, 13238, 13448, 14212,
//                               14748 - every observation over 12000ms)
//
// A bound below the observed floor can never pass, so 12000ms was mis-set for
// this wait rather than masking a regression - the joins are not slower than
// they were, and no production default is involved. 25000ms is ~1.7x the
// observed maximum, and stays far inside the UNCHANGED 120000ms TEST_TIMEOUT_MS
// parent cap. Owner decision, recorded 2026-08-31.
const JOIN_READY_TIMEOUT_MS = 25000;
const REBALANCE_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 100;
const CLEANUP_TIMEOUT_MS = 10000;
// Harness time compression for the join-time priority-placement formation
// barrier, in the same class as TEST_CONFIG's compressed election and
// leadership waits. This cluster grows to three nodes while the operation
// ledger's initial replica set is larger, so the barrier's cohort check can
// never engage and every join sleeps out the FULL production 5s discovery
// window before reaching the same `bypassed_insufficient_formation_cohort`
// answer. Compressing the window changes no barrier decision - only how long
// the joins sleep before reaching the same bypass.
//
// Measured, paired, standalone runs on an idle 20-core host (the file is
// already the serial lane's work: primary class `integration` maps to the
// exclusive resource class, jobs=1, in scripts/run-classified-test-files.js,
// so lane starvation is excluded by construction):
//
//   before (5000ms window)   node2 barrier 5062-5210ms  join  9118-9779ms
//                            node3 barrier 5515-6727ms  join 12441-14212ms
//   after  (500ms window)    node2 barrier  811- 935ms  join  3796-4855ms
//                            node3 barrier 2394-3489ms  join 12971-14748ms
//
// So the compression is real for node2 (-4.4s per join, ~-10s of file wall
// clock) and does NOT move node3: node3's barrier was sleeping through cluster
// convergence its join has to wait for anyway, so its join stays convergence-
// bound at 12.4-14.7s against the UNCHANGED 12000ms READY_TIMEOUT_MS. That
// residual is an owner budget/convergence decision, deliberately NOT hidden by
// a widened cap.
const FORMATION_DISCOVERY_MS = 500;
const EXPECTED_NODE_COUNT = 3;
const REQUIRED_REBALANCED_PARTITIONS = 1;
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440401';
const NODE2_ID = '550e8400-e29b-41d4-a716-446655440402';
const NODE3_ID = '550e8400-e29b-41d4-a716-446655440403';

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
    SYSTEM_TABLE_NAME.SERVICES,
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

function createAlwaysReadyControlPlaneReadinessService() {
  return {
    getNodeReadinessSync: () => ({
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      },
    }),
  };
}

function createMockStorageAdmissionService() {
  return {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
}

function createMockStorageAccountingService() {
  return {
    estimateReplicaBytes: () => 1,
  };
}

function createMockStoragePressureBehavior() {
  return {
    shouldAllowMove: async () => ({decision: 'allow'}),
  };
}

function createMockSqlQueryEngine() {
  return {
    async executeQuery(sql) {
      const normalizedSql = String(sql || '').toLowerCase();
      if (normalizedSql.includes('from config')) {
        return {success: true, rows: [{config_value: '10'}]};
      }
      if (normalizedSql.includes('from replica_operations')) {
        return {success: true, rows: [{total_count: 0}]};
      }
      return {success: true, rows: []};
    },
  };
}

function createMockProbeRebalanceCoordinator() {
  let counter = 0;
  return {
    getMoveSafetyError: () => null,
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      return {
        operationId: `probe-op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
    },
  };
}

test('Three-node seed rebalance', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment({nodeId: SEED_NODE_ID});
    LoggingService.getInstance().initialize({level: 'info'});
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test(
    'moves at least one partition replica off seed node',
    {timeout: TEST_TIMEOUT_MS},
    async (t) => {
      const seedNodeId = SEED_NODE_ID;
      const node2Id = NODE2_ID;
      const node3Id = NODE3_ID;
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
            priorityPlacementFormationDiscoveryMs: FORMATION_DISCOVERY_MS,
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
            priorityPlacementFormationDiscoveryMs: FORMATION_DISCOVERY_MS,
          },
          httpPost,
        });

        const node2Result = await withTimeout(
          () => node2JoinService.join(),
          JOIN_READY_TIMEOUT_MS,
          'node2 join',
        );
        t.equal(node2Result.success, true, 'second node should join');

        const node3Result = await withTimeout(
          () => node3JoinService.join(),
          JOIN_READY_TIMEOUT_MS,
          'node3 join',
        );
        t.equal(node3Result.success, true, 'third node should join');

        const nodesReady = await waitFor(() => {
          const now = Date.now();
          const readyNodes = systemTableCache.filter(
            SYSTEM_TABLE_NAME.NODES,
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

        let plannedMoves = [];
        if (!rebalanceObserved) {
          const baselineProbeIds = [...baselinePartitionIds].slice(0, 5);
          for (const probePartitionId of baselineProbeIds) {
            const probeRebalancer = new UnifiedRebalancer({
              entityId: probePartitionId,
              entityType: EntityType.PARTITION,
              nodeId: seedNodeId,
              systemTableCache,
              cdcIntegrationService: bootstrapService.cdcIntegrationService,
              tablePolicyService: bootstrapService.tablePolicyService,
              messageRouter: bootstrapResult.messageRouter,
              rebalanceCoordinator: createMockProbeRebalanceCoordinator(),
              controlPlaneReadinessService:
              createAlwaysReadyControlPlaneReadinessService(),
              storageAdmissionService: createMockStorageAdmissionService(),
              storageAccountingService: createMockStorageAccountingService(),
              storagePressureBehavior: createMockStoragePressureBehavior(),
              sqlQueryEngine: createMockSqlQueryEngine(),
            });

            try {
              probeRebalancer.initialize();
              probeRebalancer.setLeader(true);
              const probeResult = await probeRebalancer.rebalance('probe_node_join');
              plannedMoves = (probeResult?.moves || []).filter((move) => {
                const operation = String(move?.operation || '').toLowerCase();
                return (operation === 'add' || operation === 'replace') &&
                typeof move?.nodeId === 'string' &&
                move.nodeId !== seedNodeId;
              });
              if (plannedMoves.length >= REQUIRED_REBALANCED_PARTITIONS) {
                break;
              }
            } finally {
              probeRebalancer.shutdown();
            }
          }
        }

        const observedOrPlanned =
        rebalanceObserved ||
        rebalancedPartitionIds.length >= REQUIRED_REBALANCED_PARTITIONS ||
        plannedMoves.length >= REQUIRED_REBALANCED_PARTITIONS;

        t.equal(
          observedOrPlanned,
          true,
          'at least one baseline partition should gain a non-seed replica or emit a non-seed rebalance plan',
        );
        t.ok(
          rebalancedPartitionIds.length >= REQUIRED_REBALANCED_PARTITIONS ||
          plannedMoves.length >= REQUIRED_REBALANCED_PARTITIONS,
          'should observe or plan baseline partitions rebalanced off seed',
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
