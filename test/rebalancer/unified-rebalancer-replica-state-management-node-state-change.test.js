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
  MoveType,
  ReplicaStatus,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REPLICA_OPERATION_SEMANTIC_PHASE,
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
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMembershipPublicationService,
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
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
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
          // Formation-liveness dependency partitions (nodes-p1) fail closed
          // unless this dimension is explicitly true: only a real
          // heartbeat-owned current lease makes a node recovery-eligible.
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: healthy,
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

test('UnifiedRebalancer - Replica State Management', async (t) => {
  initializeTestEnvironment();

  await t.test('excludes failed replicas from healthy count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.REMOVED},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.every((r) => r.status === ReplicaStatus.ACTIVE));
  });

  await t.test('uses voter-ready filtering for critical system partitions', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'nodes-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        // nodes-p1 is a formation-liveness dependency partition: admission is
        // fail-closed on ready leases, so ready nodes must hold a CURRENT lease
        // (an absent lease no longer counts as ready).
        {
          node_id: 'node-1',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() + 60000,
        },
        {
          node_id: 'node-2',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() + 60000,
        },
        {
          node_id: 'node-3',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() - 1,
        },
      ],
    });

    const replicas = [
      {
        replica_id: 'r1',
        node_id: 'node-1',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'leader',
        address: 'node-1/partition/nodes-p1-r1',
      },
      {
        replica_id: 'r2',
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'learner',
        address: 'node-2/partition/nodes-p1-r2',
      },
      {
        replica_id: 'r3',
        node_id: 'node-3',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
        address: 'node-3/partition/nodes-p1-r3',
      },
      {
        replica_id: 'r4',
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
        address: null,
      },
    ];

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 1, 'only routable non-learner replicas on ready nodes should count');
    t.equal(healthy[0].replica_id, 'r1', 'leader on ready node should remain healthy');
  });

  await t.test('surfaces priority spread as an explicit planner invariant',
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
      });

      const replicas = [
        {
          replica_id: 'r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
          address: 'node-1/partition/nodes-p1-r1',
        },
        {
          replica_id: 'r2',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-1/partition/nodes-p1-r2',
        },
      ];
      const policy = {
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };

      const prioritySpread = rebalancer.movePlanner.analyzePrioritySpread(
        replicas,
        policy,
        rebalancer.getAvailableNodes(),
      );

      t.equal(prioritySpread.requiresSpread, true);
      t.equal(prioritySpread.satisfied, false);
      t.equal(prioritySpread.requiredDistinctNodeCount, 3);
      t.equal(prioritySpread.actualDistinctNodeCount, 1);
      t.equal(prioritySpread.hasUnusedReadyNodes, true);
    });

  await t.test(
    'uses the local canonical planning view for priority blocker snapshots',
    async (t) => {
      const asyncCalls = [];
      const syncCalls = [];
      const planningSnapshot = Object.freeze({
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze([
          'node-a',
          'node-local',
          'node-remote',
        ]),
        projectedServingNodeIds: Object.freeze([
          'node-a',
          'node-local',
          'node-remote',
        ]),
        locallyEligibleNodeIds: Object.freeze([
          'node-a',
          'node-local',
          'node-remote',
        ]),
        priorityPartitionSummary: Object.freeze({
          satisfied: false,
          requiredDistinctNodeCount: 3,
          missingPartitionIds: Object.freeze([
            'sql_write_operations-p1',
          ]),
        }),
      });
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-local',
        nodes: [
          {node_id: 'node-local', status: NodeStatus.ACTIVE},
          {node_id: 'node-remote', status: NodeStatus.ACTIVE},
          {node_id: 'node-a', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
            asyncCalls.push(nodeId);
            return Promise.resolve(planningSnapshot);
          },
          getPriorityRecoveryPlanningAnswerSync(nodeId) {
            syncCalls.push(nodeId);
            return planningSnapshot;
          },
        },
      });

      const operation = {
        partitionId: 'sql_write_operations-p1',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-remote',
      };

      const asyncSnapshot =
        await rebalancer.getPriorityRecoveryPlanningSnapshot(operation);
      const syncSnapshot =
        rebalancer.getPriorityRecoveryPlanningSnapshotSync(operation);

      t.equal(
        asyncSnapshot?.priorityPartitionSummary?.missingPartitionIds?.[0],
        'sql_write_operations-p1',
        'async priority blocker planning should still resolve the canonical snapshot',
      );
      t.equal(
        syncSnapshot?.priorityPartitionSummary?.missingPartitionIds?.[0],
        'sql_write_operations-p1',
        'sync priority blocker planning should still resolve the canonical snapshot',
      );
      t.same(
        asyncCalls,
        ['node-local'],
        'async priority blocker planning should consult the local canonical planning view',
      );
      t.same(
        syncCalls,
        ['node-local'],
        'sync priority blocker planning should consult the local canonical planning view',
      );
    },
  );

  await t.test('derives priority spread blocker from the sync planning answer owner',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          };
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            t.fail(
              'priority spread blocker should route through the sync planning answer owner',
            );
          },
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [],
        controlPlaneReadinessService: readinessService,
      });

      t.same(
        rebalancer.getControlPlanePrioritySpreadBlocker(),
        {
          requiredDistinctNodeCount: 3,
          requiredQuorumDistinctNodeCount: 2,
          blockedPartitions: [{
            partitionId: 'replica_operations-p1',
            readyReplicaCount: null,
            readyDistinctNodeCount: 0,
            spreadGap: 1,
            exclusionReasonCounts: null,
          }],
        },
        'priority gating should be driven by the canonical sync planning answer',
      );
    });

  await t.test('keeps current priority spread ahead of a sticky satisfied publication',
    async (t) => {
      const mockCache = createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ]);
      const baseReadinessService = createMockReadinessService(mockCache);
      const readinessCalls = [];
      const readinessService = {
        ...baseReadinessService,
        getNodeReadinessSync(nodeId, options) {
          if (!options || typeof options !== 'object') {
            throw new Error('readiness options object required');
          }
          readinessCalls.push(nodeId);
          return baseReadinessService.getNodeReadinessSync(nodeId, options);
        },
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
              blockedPartitions: [],
            },
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: 'replica_operations-p1',
          table_id: 'replica_operations',
          replica_count: 3,
        }],
        services: [
          {
            service_id: 'priority-r1',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-1',
            status: 'active',
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 'priority-r2',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-1',
            status: 'active',
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      const blocker = rebalancer.getControlPlanePrioritySpreadBlocker();
      const ledgerBlocker = blocker?.blockedPartitions.find(
        (partition) => partition.partitionId === 'replica_operations-p1',
      );
      t.equal(
        blocker?.requiredDistinctNodeCount,
        3,
        'same-cache current placement should override sticky publication satisfaction',
      );
      t.match(ledgerBlocker, {
        partitionId: 'replica_operations-p1',
        expectedReplicaCount: 3,
        readyReplicaCount: 2,
        readyDistinctNodeCount: 1,
        spreadGap: 2,
        exclusionReasonCounts: {row_absent: 1},
      });
      t.same(
        readinessCalls.sort(),
        ['node-1', 'node-2', 'node-3'],
        'current voter placement reuses the canonical available-node pass ' +
          'instead of rebuilding readiness for every eligible node',
      );
    });

  await t.test('current priority placement retains learner readiness filtering',
    async (t) => {
      const mockCache = createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ]);
      const baseReadinessService = createMockReadinessService(mockCache);
      const readinessCalls = [];
      const readinessService = {
        ...baseReadinessService,
        getNodeReadinessSync(nodeId, options) {
          readinessCalls.push(nodeId);
          return baseReadinessService.getNodeReadinessSync(nodeId, options);
        },
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
              blockedPartitions: [],
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'priority-r1',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-1',
            status: 'active',
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 'priority-r2',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-2',
            status: 'active',
            raft_role: 'learner',
            address: 'node-2/partition/replica_operations-p1-r2',
          },
          {
            service_id: 'priority-r3',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-3',
            status: 'active',
            raft_role: 'follower',
            address: 'node-3/partition/replica_operations-p1-r3',
          },
        ],
        partitions: [{
          partition_id: 'replica_operations-p1',
          leader_node_id: 'node-1',
          state: 'NORMAL',
        }],
        controlPlaneReadinessService: readinessService,
      });

      const blocker = rebalancer.getControlPlanePrioritySpreadBlocker();
      const ledgerBlocker = blocker?.blockedPartitions.find(
        (partition) => partition.partitionId === 'replica_operations-p1',
      );

      t.equal(
        ledgerBlocker,
        undefined,
        'a promotable learner still counts toward current priority spread ' +
          'when the canonical leader is present',
      );
      t.same(
        readinessCalls.sort(),
        ['node-1', 'node-2', 'node-2', 'node-3'],
        'only the learner receives the additional promotability read',
      );
    });

  await t.test('holds non-priority work while a spread priority partition has no active leader',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
            locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
              blockedPartitions: [],
            },
          };
        },
      };
      const services = ['node-1', 'node-2', 'node-3'].map(
        (nodeId, index) => ({
          service_id: `priority-r${index + 1}`,
          partition_id: 'replica_operations-p1',
          service_type: EntityType.PARTITION,
          node_id: nodeId,
          status: 'active',
          raft_role: 'follower',
          address: `${nodeId}/partition/replica_operations-p1-r${index + 1}`,
        }),
      );
      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services,
        controlPlaneReadinessService: readinessService,
      });

      const blocker = rebalancer.getControlPlanePrioritySpreadBlocker();
      const ledgerBlocker = blocker?.blockedPartitions.find(
        (partition) => partition.partitionId === 'replica_operations-p1',
      );
      t.match(
        ledgerBlocker,
        {
          partitionId: 'replica_operations-p1',
          readyReplicaCount: null,
          readyDistinctNodeCount: null,
          spreadGap: null,
          missingActiveLeader: true,
        },
        'leaderless current placement should preserve the priority scheduling fence',
      );
    });

  await t.test('rebuilds stale embedded publication gates from the current sync planning answer',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publicationEpoch: 9,
            publicationStatus: 'PUBLISHED',
            recoveryProtocolState: 'steady_published',
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
              blockedPartitions: [],
            },
            publicationRecoveryGate: {
              state: 'priority_spread_pending',
              ready: false,
              active: true,
              publicationEpoch: 9,
              publicationStatus: 'PUBLISHED',
              recoveryProtocolState: 'priority_spread_pending',
              reasonCodes: ['priority_partitions_not_spread'],
              priorityPartitionSummary: {
                satisfied: false,
                missingPartitionIds: ['replica_operations-p1'],
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                }],
              },
              prioritySpreadPending: true,
              pendingAckNodeIds: [],
              missingPublishedNodeIds: [],
            },
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [],
        controlPlaneReadinessService: readinessService,
      });

      t.equal(
        rebalancer.getControlPlanePrioritySpreadBlocker(),
        null,
        'priority spread gating should follow the current planning evidence instead of a stale embedded gate',
      );
    });

  await t.test('treats priority spread repair moves as critical', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'replica_operations-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
    });

    t.equal(
      rebalancer.movePlanner.classifyMoveCriticality({
        type: MoveType.REMOVE,
        reason: 'spread_replicas',
      }),
      'critical',
      'priority spread removals should bypass reduced-priority pressure gating',
    );
    t.equal(
      rebalancer.movePlanner.classifyMoveCriticality({
        type: MoveType.REPLACE,
        reason: 'replace_replica',
      }),
      'critical',
      'priority spread replacements should remain on the critical path',
    );
  });

  await t.test(
    'defers standalone removes that would break priority spread during recovery',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'sql_write_operations-p1',
            table_id: 'sql_write_operations',
            replica_count: 3,
          },
        ],
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      ];

      const moves = rebalancer.calculateMoves(currentReplicas, {
        targetReplicaCount: 2,
        targetNodes: ['node-1', 'node-2'],
        degraded: false,
        availableNodeCount: 3,
      });

      t.same(
        moves,
        [],
        'planner should not evict a priority recovery replica when removal would drop spread below the required distinct-node count',
      );
    },
  );

  await t.test(
    'filters priority standalone removes when concurrent adds are present',
    async (t) => {
      const PARTITION_ID = 'sql_transactions-p1';
      const TABLE_ID = 'sql_transactions';
      const SOURCE_NODE_ID = 'node-1';
      const SPREAD_NODE_ID = 'node-2';
      const SYNCING_NODE_ID = 'node-3';
      const NEXT_NODE_ID = 'node-4';
      const SOURCE_REPLICA_ONE = 'sql_transactions-p1-r1';
      const SOURCE_REPLICA_TWO = 'sql_transactions-p1-r2';
      const SOURCE_REPLICA_THREE = 'sql_transactions-p1-r3';
      const SPREAD_REPLICA_ID = 'sql_transactions-p1-r4';
      const SYNCING_REPLICA_ID = 'sql_transactions-p1-r5';
      const FOLLOWER_ROLE = 'follower';

      const rebalancer = createTestRebalancer({
        entityId: PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: SOURCE_NODE_ID,
        nodes: [
          {node_id: SOURCE_NODE_ID, status: NodeStatus.ACTIVE},
          {node_id: SPREAD_NODE_ID, status: NodeStatus.ACTIVE},
          {node_id: SYNCING_NODE_ID, status: NodeStatus.ACTIVE},
          {node_id: NEXT_NODE_ID, status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: PARTITION_ID,
            table_id: TABLE_ID,
            replica_count: 3,
          },
        ],
      });

      const currentReplicas = [
        {
          replica_id: SOURCE_REPLICA_ONE,
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          raft_role: FOLLOWER_ROLE,
          address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_ONE}`,
        },
        {
          replica_id: SOURCE_REPLICA_TWO,
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          raft_role: FOLLOWER_ROLE,
          address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_TWO}`,
        },
        {
          replica_id: SOURCE_REPLICA_THREE,
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          raft_role: FOLLOWER_ROLE,
          address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_THREE}`,
        },
        {
          replica_id: SPREAD_REPLICA_ID,
          node_id: SPREAD_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          raft_role: FOLLOWER_ROLE,
          address: `${SPREAD_NODE_ID}/partition/${SPREAD_REPLICA_ID}`,
        },
        {
          replica_id: SYNCING_REPLICA_ID,
          node_id: SYNCING_NODE_ID,
          status: ReplicaStatus.SYNCING,
          raft_role: FOLLOWER_ROLE,
          address: `${SYNCING_NODE_ID}/partition/${SYNCING_REPLICA_ID}`,
        },
      ];

      const moves = rebalancer.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: [
          SOURCE_NODE_ID,
          SYNCING_NODE_ID,
          NEXT_NODE_ID,
        ],
        degraded: false,
        availableNodeCount: 4,
      });

      t.equal(
        moves.some((move) =>
          move.type === MoveType.REMOVE &&
          move.replicaId === SPREAD_REPLICA_ID),
        false,
        'spread-contributing replicas must not be emitted as standalone removes while a priority add is still pending',
      );
      // The priority spread cure is the narrow exception to the over-target
      // hold: retain the spread-contributing voter and mint only the missing
      // distinct-node ADD, even while the concentrated surplus still exists.
      t.same(
        moves,
        [{
          type: MoveType.ADD,
          nodeId: NEXT_NODE_ID,
          reason: 'spread_replicas',
        }],
        'priority spread cure emits the exact missing-node ADD while preserving the spread voter',
      );
    },
  );

  await t.test('critical healthy replicas honor published membership boundary',
    async (t) => {
      // All three nodes hold current ready leases (nodes-p1 lease admission is
      // fail-closed), so the published-membership boundary stays the ONLY
      // discriminating factor in this test.
      const leasedNodes = () => ([
        {
          node_id: 'node-1',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() + 60000,
        },
        {
          node_id: 'node-2',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() + 60000,
        },
        {
          node_id: 'node-3',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() + 60000,
        },
      ]);
      const readinessService = {
        ...createMockReadinessService(createMockCache(leasedNodes())),
        membershipPublicationService: createMockMembershipPublicationService([
          'node-1',
          'node-2',
        ], 3),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: leasedNodes(),
        controlPlaneReadinessService: readinessService,
      });

      const replicas = [
        {
          replica_id: 'r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
          address: 'node-1/partition/nodes-p1-r1',
        },
        {
          replica_id: 'r2',
          node_id: 'node-2',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-2/partition/nodes-p1-r2',
        },
        {
          replica_id: 'r3',
          node_id: 'node-3',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-3/partition/nodes-p1-r3',
        },
      ];

      const healthy = rebalancer.getHealthyReplicas(replicas);

      t.same(
        healthy.map((replica) => replica.replica_id).sort(),
        ['r1', 'r2'],
        'critical partition health should ignore replicas on nodes outside published membership',
      );
    });

  await t.test('generates remove moves for failed replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 1);
    t.equal(removeMoves[0].replicaId, 'r2');
    t.equal(removeMoves[0].reason, 'replica_failed');
  });

  await t.test('generates add moves to create replacement replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
        {node_id: 'node-4', status: NodeStatus.ACTIVE},
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
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.FAILED, // Failed replica
        },
      ],
    });

    const currentReplicas = rebalancer.getCurrentReplicas();
    const policy = await rebalancer.getPolicy();
    const targetState = await rebalancer.calculateTargetState(currentReplicas, policy);
    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    // Should have remove move for failed replica
    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.ok(removeMoves.length >= 1, 'Should have at least one remove move');

    // Should have add moves to reach target count
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.ok(addMoves.length >= 1, 'Should have at least one add move');
  });

  await t.test('places new replicas on healthy nodes only', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.FAILED}, // Failed node
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
        {node_id: 'node-4', status: NodeStatus.ACTIVE},
      ],
    });

    const availableNodes = rebalancer.getAvailableNodes();

    // Should only include active nodes
    t.equal(availableNodes.length, 3);
    t.ok(availableNodes.every((n) => n.status === NodeStatus.ACTIVE));
    t.notOk(availableNodes.some((n) => n.node_id === 'node-2'));
  });

  await t.test('uses policy replica count regardless of current count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 3 healthy replicas, Policy: 5 replicas
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target 5 (policy count)
    t.equal(targetCount, 5);
  });

  await t.test('respects minimum replica count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 1 healthy replica, Policy: 3 replicas, Min: 3
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target at least minimum
    t.ok(targetCount >= policy.minReplicaCount);
  });

  await t.test('respects maximum replica count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 9 healthy replicas, Policy: 5 replicas, Max: 7
    const replicas = Array.from({length: 9}, (_, i) => ({
      replica_id: `r${i + 1}`,
      node_id: `node-${i + 1}`,
      status: ReplicaStatus.ACTIVE,
    }));

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target at most maximum
    t.ok(targetCount <= policy.maxReplicaCount);
  });
});

test('UnifiedRebalancer - onNodeStateChange', async (t) => {
  initializeTestEnvironment();

  await t.test('triggers immediate check when node becomes ready', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = (reason) => {
      checkTriggered = true;
      t.equal(reason, 'node_became_ready', 'reason should be node_became_ready');
    };

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(checkTriggered, true, 'should trigger immediate check');

    rebalancer.shutdown();
  });

  await t.test('triggers immediate check when node fails', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = (reason) => {
      checkTriggered = true;
      t.equal(reason, 'node_failed', 'reason should be node_failed');
    };

    rebalancer.onNodeStateChange('node-2', 'active', 'failed');

    t.equal(checkTriggered, true, 'should trigger immediate check');

    rebalancer.shutdown();
  });

  await t.test('does not trigger when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = () => {
      checkTriggered = true;
    };

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(checkTriggered, false, 'should not trigger when not leader');

    rebalancer.shutdown();
  });

  await t.test('emits nodeStateChange event always', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader - should still emit event

    const events = [];
    rebalancer.on('nodeStateChange', (e) => events.push(e));

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 1, 'should emit one nodeStateChange event');
    t.equal(events[0].nodeId, 'node-2', 'event should have nodeId');
    t.equal(events[0].oldState, 'disconnected', 'event should have oldState');
    t.equal(events[0].newState, 'active', 'event should have newState');
    t.ok(events[0].timestamp, 'event should have timestamp');

    rebalancer.shutdown();
  });

  await t.test('emits rebalanceNeeded event when leader and rebalance needed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const events = [];
    rebalancer.on('rebalanceNeeded', (e) => events.push(e));

    // Suppress the actual check
    rebalancer.triggerImmediateCheck = () => {};

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 1, 'should emit one rebalanceNeeded event');
    t.equal(events[0].nodeId, 'node-2', 'event should have nodeId');
    t.equal(events[0].reason, 'node_became_ready', 'event should have reason');
    t.ok(events[0].timestamp, 'event should have timestamp');

    rebalancer.shutdown();
  });

  await t.test('does not emit rebalanceNeeded when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    const events = [];
    rebalancer.on('rebalanceNeeded', (e) => events.push(e));

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 0, 'should not emit rebalanceNeeded when not leader');

    rebalancer.shutdown();
  });

  await t.test('critical in-flight operation details expose shared semantic phase',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      const detail = rebalancer.buildCriticalSystemInFlightReplicaOperationDetail({
        operation_id: 'replace-op-1',
        type: 'REPLACE',
        partition_id: 'partition-1',
        target_node_id: 'node-2',
        status: 'active',
        workflow_step: WORKFLOW_STEP.ACTIVE,
      });

      t.equal(
        detail.semanticPhase,
        REPLICA_OPERATION_SEMANTIC_PHASE.TARGET_READY,
        'diagnostics should expose semantic phase instead of only raw workflow steps',
      );

      rebalancer.shutdown();
    });

  await t.test('tracked in-flight filtering uses semantic phase termination',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      t.equal(
        rebalancer.isTrackedInFlightOperation({
          type: 'REPLACE',
          status: 'active',
          workflowStep: WORKFLOW_STEP.ACTIVE,
        }),
        true,
        'target_ready replace work should remain tracked in-flight',
      );
      t.equal(
        rebalancer.isTrackedInFlightOperation({
          type: 'REMOVE',
          status: 'removed',
          workflowStep: WORKFLOW_STEP.REMOVED,
        }),
        false,
        'settled work should no longer be tracked in-flight',
      );

      rebalancer.shutdown();
    });
});
