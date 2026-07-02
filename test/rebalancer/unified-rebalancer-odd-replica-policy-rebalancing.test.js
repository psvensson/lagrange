/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  ReplicaStatus,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
} from '../../src/constants/index.js';

import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMessageRouter,
  createMockPolicyService,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

// Initialize test environment
// Create a mock system table cache
// Create mock CDC integration service
// Create mock table policy service
// Create mock message router
// Create mock rebalance coordinator
// Create mock readiness service backed by the same cache
function createMockReadinessService(mockCache) {
  return {
    getNodeReadinessSync: (nodeId) => {
      const nodeRow = mockCache.get('nodes', nodeId);
      if (!nodeRow) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [],
        };
      }
      const now = Date.now();
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      const leaseValid =
        Number.isFinite(leaseExpiry) && leaseExpiry > now;
      const isActive = nodeRow.status === 'active';
      const healthy = isActive && leaseValid;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
            healthy,
        },
        reasons: [],
      };
    },
    getNodeReadiness: async (nodeId) => {
      return createMockReadinessService(mockCache)
        .getNodeReadinessSync(nodeId);
    },
  };
}


// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = 'connected',
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    nodeEndpoints,
    serviceEndpoints,
  );
  const mockCdcService = cdcIntegrationService || createMockCdcService();
  const mockPolicyService = createMockPolicyService(
    partitions, tables,
  );
  const mockMessageRouter = messageRouter ||
    createMockMessageRouter(connectionState);
  const mockCoordinator = rebalanceCoordinator || createMockCoordinator();
  const mockSqlQueryEngine = sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  const mockReadinessService = controlPlaneReadinessService ||
    createMockReadinessService(mockCache);

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService: mockReadinessService,
    bootstrapReadinessState,
    nowFn,
    priorityRecoveryActivityStaleGraceMs,
  });
}

test('UnifiedRebalancer - Odd Replica Count Helpers', async (t) => {
  initializeTestEnvironment();

  // Import the helper functions
  const {
    isOddReplicaCount,
    adjustToOddCount,
    getNextOddCount,
    getPreviousOddCount,
  } = await import('../../src/rebalancer/unified-rebalancer.js');

  await t.test('isOddReplicaCount returns true for odd numbers', async (t) => {
    t.equal(isOddReplicaCount(1), true);
    t.equal(isOddReplicaCount(3), true);
    t.equal(isOddReplicaCount(5), true);
    t.equal(isOddReplicaCount(7), true);
  });

  await t.test('isOddReplicaCount returns false for even numbers', async (t) => {
    t.equal(isOddReplicaCount(0), false);
    t.equal(isOddReplicaCount(2), false);
    t.equal(isOddReplicaCount(4), false);
    t.equal(isOddReplicaCount(6), false);
  });

  await t.test('adjustToOddCount adjusts up by default', async (t) => {
    t.equal(adjustToOddCount(2), 3);
    t.equal(adjustToOddCount(4), 5);
    t.equal(adjustToOddCount(6), 7);
    t.equal(adjustToOddCount(3), 3); // Already odd
  });

  await t.test('adjustToOddCount adjusts down when specified', async (t) => {
    t.equal(adjustToOddCount(2, 'down'), 1);
    t.equal(adjustToOddCount(4, 'down'), 3);
    t.equal(adjustToOddCount(6, 'down'), 5);
    t.equal(adjustToOddCount(3, 'down'), 3); // Already odd
  });

  await t.test('getNextOddCount returns next odd number', async (t) => {
    t.equal(getNextOddCount(3, 7), 5);
    t.equal(getNextOddCount(5, 7), 7);
    t.equal(getNextOddCount(7, 7), 7); // At max
  });

  await t.test('getPreviousOddCount returns previous odd number', async (t) => {
    t.equal(getPreviousOddCount(7, 3), 5);
    t.equal(getPreviousOddCount(5, 3), 3);
    t.equal(getPreviousOddCount(3, 3), 3); // At min
  });
});

test('UnifiedRebalancer - Policy-Driven Rebalancing', async (t) => {
  initializeTestEnvironment();

  await t.test('validates replica count to be odd', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {minReplicaCount: 3, maxReplicaCount: 7};

    t.equal(rebalancer.validateReplicaCount(3, policy), 3);
    t.equal(rebalancer.validateReplicaCount(4, policy), 5);
    t.equal(rebalancer.validateReplicaCount(5, policy), 5);
    t.equal(rebalancer.validateReplicaCount(6, policy), 7);
    t.equal(rebalancer.validateReplicaCount(7, policy), 7);
    t.equal(rebalancer.validateReplicaCount(8, policy), 7); // Capped at max
    t.equal(rebalancer.validateReplicaCount(2, policy), 3); // Raised to min
  });

  await t.test('calculates target replica count for growth', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    // Current: 3, Target: 5 -> should grow to 5
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const target = rebalancer.calculateTargetReplicaCount(replicas, policy);
    t.equal(target, 5);
  });

  await t.test('calculates target replica count for shrink', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    // Current: 5, Target: 3 -> should shrink to 3
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r5', node_id: 'node-5', status: ReplicaStatus.ACTIVE},
    ];

    const target = rebalancer.calculateTargetReplicaCount(replicas, policy);
    t.equal(target, 3);
  });

  await t.test('applyPolicy detects need for rebalancing', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const decision = rebalancer.applyPolicy(policy);

    t.equal(decision.needsRebalancing, true);
    t.equal(decision.reason, 'replica_count_below_target');
    t.equal(decision.currentCount, 1);
    t.equal(decision.targetCount, 3);
  });

  await t.test('applyPolicy detects replicas not spread', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-1', // Same node as s1
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
      placementConstraints: {spreadAcrossNodes: true},
    };

    const decision = rebalancer.applyPolicy(policy);

    t.equal(decision.needsRebalancing, true);
    t.equal(decision.reason, 'replicas_not_spread');
  });

  await t.test(
    'critical control-plane partitions treat spreadable replica concentration as urgent',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 's1',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 's2',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
          {
            service_id: 's3',
            partition_id: 'replica_operations-p1',
            node_id: 'node-2',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-2/partition/replica_operations-p1-r3',
          },
        ],
      });

      const policy = {
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };
      const availableNodes = rebalancer.getAvailableNodes();
      const replicas = rebalancer.getCurrentReplicas();

      t.equal(
        rebalancer.isCriticalState(replicas, policy, availableNodes),
        true,
      );
      t.match(
        rebalancer.getCriticalReason(replicas, policy, availableNodes),
        /control_plane_replicas_not_spread/i,
      );
    },
  );
});

