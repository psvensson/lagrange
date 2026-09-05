/**
 * Three-node partition rebalance integration test.
 * Verifies that partition replicas spread across all three nodes when
 * a cluster grows from one to three nodes.
 * Requirements: 8.1, 8.2, 8.3, 10.1, 10.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {UnifiedRebalancer, EntityType} from
  '../../src/rebalancer/unified-rebalancer.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
} from './helpers/cluster-test-helpers.js';

/**
 * Create a mock CDC service backed by the cache.
 * @param {Object} cache - SystemTableCache instance.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache) {
  return {
    async insertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, _where, data) {
      cache.applySystemTableChange(tableName, 'UPDATE', {..._where, ...data});
      return {success: true};
    },
  };
}

/**
 * Create a mock table policy service.
 * @return {Object} Mock policy service.
 */
function createMockTablePolicyService() {
  return {
    getDefaultPolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getTablePolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getPolicyForPartition: () => ({...DEFAULT_TABLE_POLICY}),
  };
}

/**
 * Create a mock message router that reports all nodes as connected.
 * @return {Object} Mock router.
 */
function createMockMessageRouter() {
  return {
    getConnectionState: () => 'connected',
    isOutboundQueueAvailable: () => true,
    pingNode: async () => true,
    deliver: async () => ({acknowledged: true, status: 'initiated'}),
  };
}

/**
 * Create a control-plane readiness service that marks all nodes repair-eligible.
 * @return {Object} Mock readiness service.
 */
function createAlwaysReadyControlPlaneReadinessService() {
  return {
    projectNodeLiveness: () => ({readyNow: true}),
    getNodeReadinessSync: () => ({
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      },
    }),
  };
}

/**
 * Create a storage accounting service with zero-byte estimates for tests.
 * @return {Object} Mock storage accounting service.
 */
function createMockStorageAccountingService() {
  return {
    estimateReplicaBytes: () => 0,
  };
}

/**
 * Create a permissive storage pressure behavior service.
 * @return {Object} Mock storage pressure behavior service.
 */
function createMockStoragePressureBehavior() {
  return {
    shouldAllowMove: async () => ({decision: 'allow'}),
  };
}

/**
 * Create a SQL query engine that returns permissive rebalance budget state.
 * @return {Object} Mock SQL query engine.
 */
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

/**
 * Create a mock rebalance coordinator that records operations.
 * @param {Array} operations - Array to collect created operations.
 * @return {Object} Mock coordinator.
 */
function createMockRebalanceCoordinator(operations) {
  let counter = 0;
  return {
    getMoveSafetyError: () => null,
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      const op = {
        operationId: `op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
      operations.push(op);
      return op;
    },
    getStats: () => ({operationsCreated: counter}),
  };
}

/**
 * Insert a ready node into the cache.
 * @param {Object} cache - SystemTableCache.
 * @param {string} nodeId - Node identifier.
 */
function insertReadyNode(cache, nodeId) {
  const now = Date.now();
  cache.applySystemTableChange('nodes', 'INSERT', {
    id: nodeId,
    node_id: nodeId,
    status: 'active',
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 10,
    connection_state: 'ready',
    ready_lease_expires_at: now + 30000,
    created_at: now,
  });
}

/**
 * Insert an active partition replica service into the cache.
 * @param {Object} cache - SystemTableCache.
 * @param {string} serviceId - Service identifier.
 * @param {string} nodeId - Hosting node.
 * @param {string} partitionId - Partition identifier.
 */
function insertActiveReplica(cache, serviceId, nodeId, partitionId) {
  const now = Date.now();
  cache.applySystemTableChange('services', 'INSERT', {
    id: serviceId,
    service_id: serviceId,
    service_type: 'partition',
    node_id: nodeId,
    partition_id: partitionId,
    status: 'active',
    created_at: now,
    updated_at: now,
  });
}

test('Three-node partition rebalance', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('replicas spread from one node to three nodes', async (t) => {
    const cache = new SystemTableCache();
    const operations = [];
    const partitionId = 'spread-test-p1';
    const seedNodeId = 'node-1';

    // Start with one node hosting all 3 replicas (post-bootstrap state).
    insertReadyNode(cache, seedNodeId);
    insertActiveReplica(cache, `${partitionId}-r1`, seedNodeId, partitionId);
    insertActiveReplica(cache, `${partitionId}-r2`, seedNodeId, partitionId);
    insertActiveReplica(cache, `${partitionId}-r3`, seedNodeId, partitionId);

    const rebalancer = new UnifiedRebalancer({
      entityId: partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCService(cache),
      tablePolicyService: createMockTablePolicyService(),
      nodeId: seedNodeId,
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: createMockRebalanceCoordinator(operations),
      controlPlaneReadinessService: createAlwaysReadyControlPlaneReadinessService(),
      storageAccountingService: createMockStorageAccountingService(),
      storagePressureBehavior: createMockStoragePressureBehavior(),
      sqlQueryEngine: createMockSqlQueryEngine(),
    });
    rebalancer.initialize();
    rebalancer.setLeader(true);

    try {
      // With only one node, no moves should be generated.
      const singleNodeResult = await rebalancer.rebalance('periodic');
      t.equal(singleNodeResult.success, true, 'single-node rebalance succeeds');
      t.equal(singleNodeResult.moves.length, 0,
        'no moves with single node');

      // Add second node.
      insertReadyNode(cache, 'node-2');

      const twoNodeResult = await rebalancer.rebalance('node_join');
      t.equal(twoNodeResult.success, true, 'two-node rebalance succeeds');
      // With 2 nodes and target 3 replicas, degraded topology produces
      // a REPLACE move to spread one replica to node-2.
      t.ok(twoNodeResult.moves.length >= 1,
        'should generate moves with two nodes');
      const twoNodeReplace = twoNodeResult.moves.filter(
        (m) => m.operation === 'replace',
      );
      t.ok(twoNodeReplace.length >= 1,
        'should use REPLACE to spread in degraded two-node topology');
      t.equal(twoNodeReplace[0].nodeId, 'node-2',
        'REPLACE target should be node-2');

      // Simulate the REPLACE completing: move one replica to node-2.
      cache.applySystemTableChange('services', 'UPDATE', {
        service_id: `${partitionId}-r2`,
        node_id: 'node-2',
        status: 'active',
      });

      // Add third node.
      insertReadyNode(cache, 'node-3');

      const threeNodeResult = await rebalancer.rebalance('node_join');
      t.equal(threeNodeResult.success, true,
        'three-node rebalance succeeds');
      t.ok(threeNodeResult.moves.length >= 1,
        'should generate moves with three nodes');

      // The rebalancer should target node-3 for the remaining replica.
      const threeNodeTargets = threeNodeResult.moves.filter(
        (m) => m.operation === 'replace' || m.operation === 'add',
      );
      t.ok(threeNodeTargets.length >= 1,
        'should schedule move to third node');
      const targetsNode3 = threeNodeTargets.some(
        (m) => m.nodeId === 'node-3',
      );
      t.ok(targetsNode3,
        'at least one move should target node-3');

      // Simulate the move completing: move last co-located replica to node-3.
      cache.applySystemTableChange('services', 'UPDATE', {
        service_id: `${partitionId}-r3`,
        node_id: 'node-3',
        status: 'active',
      });

      // Final rebalance should find no work — replicas are spread 1-1-1.
      const stableResult = await rebalancer.rebalance('periodic');
      t.equal(stableResult.success, true, 'stable rebalance succeeds');
      t.equal(stableResult.moves.length, 0,
        'no moves when replicas are evenly spread across 3 nodes');

      // Verify final placement: one replica per node.
      const services = cache.filter('services', (s) =>
        s.partition_id === partitionId && s.service_type === 'partition',
      );
      const nodeIds = new Set(services.map((s) => s.node_id));
      t.equal(nodeIds.size, 3,
        'replicas should be on 3 distinct nodes');
      t.ok(nodeIds.has('node-1'), 'node-1 should host a replica');
      t.ok(nodeIds.has('node-2'), 'node-2 should host a replica');
      t.ok(nodeIds.has('node-3'), 'node-3 should host a replica');
    } finally {
      rebalancer.cancelScheduledCheck();
    }
  });
});
