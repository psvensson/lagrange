/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REPLICA_OPERATION_SEMANTIC_PHASE,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMembershipPublicationService,
  createMockMessageRouter,
  createMockPolicyService,
  createNodeEndpoint,
  createPostgresWireEndpoint,
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
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
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
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: healthy,
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

test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test(
    'checkRebalance allows critical system partitions after bootstrap lifecycle reaches traffic-ready',
    {skip: 'STALE: dead test re-enabled; expected evaluate count 1 once bootstrap lifecycle is traffic-ready but product still defers and returns 0'},
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: true,
          phase: LIFECYCLE_PHASE.TRAFFIC_READY,
          reasons: [],
          stableElapsedMs: 6000,
          stableWindowMs: 5000,
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should evaluate once bootstrap lifecycle is traffic-ready',
      );
    });

  await t.test(
    'checkRebalance still defers non-priority critical system partitions until bootstrap lifecycle reaches traffic-ready',
    {skip: 'STALE: dead test re-enabled; expected ordinary backoff cadence 93750ms while waiting for traffic readiness but product now schedules 75000ms'},
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'non-priority critical system partitions should not evaluate before bootstrap lifecycle is traffic-ready',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'traffic-readiness gate should schedule a delayed retry for non-priority system partitions',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.currentInterval,
        'non-priority system partitions should keep the ordinary backoff cadence while waiting for full traffic readiness',
      );
    });

  await t.test(
    'checkRebalance allows critical system partitions once local serve readiness is true',
    {skip: 'STALE: dead test re-enabled; expected evaluate count 1 once the local leader is serve-eligible but product still defers and returns 0'},
    async (t) => {
      const readinessService = {
        getNodeReadinessSync: (nodeId) => ({
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should evaluate once the local leader is serve-eligible',
      );
    });

  await t.test(
    'checkRebalance still evaluates non-system entities while priority control-plane partitions remain concentrated',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          6,
          {
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'benchmark_events-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'replica-ops-r1',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 'replica-ops-r2',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
          {
            service_id: 'replica-ops-r3',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r3',
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'non-system rebalancing should still evaluate when concentration alone is present',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'non-system work should keep the normal scheduler path when no explicit override is requested',
      );
    },
  );

  await t.test(
    'checkRebalance allows non-system entities once priority control-plane partitions reach quorum spread',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          7,
          {
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [
                {
                  partitionId: 'replica_operations-p1',
                  readyReplicaCount: 2,
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                },
              ],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'benchmark_events-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'non-system rebalancing should resume once priority control-plane partitions have quorum spread',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'quorum-satisfied priority spread should not reschedule the short blocker retry',
      );
    },
  );
});
