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

test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test(
    'checkRebalance defers critical system partitions while cluster membership is transitional',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: 'warming'},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
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
        'critical system partitions should not evaluate while nodes are still transitional',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'topology-settling gate should schedule a delayed retry',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.criticalCheckDelayMs,
        'priority control-plane partitions should retry topology-settling checks on the short critical cadence',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while active nodes have not published ready heartbeats',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: null,
          },
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
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
        'critical system partitions should not evaluate while active nodes are still missing ready-heartbeat publication',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'ready-heartbeat settling should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance does not defer critical system partitions for a ' +
    'transport-connected ACTIVE node when canonical readiness keeps ' +
    'cluster membership healthy despite a stale lease',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: Date.now() - 1000,
          },
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should follow canonical readiness rather than raw stale ready-lease rows',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should stay open when canonical readiness already recovered cluster membership',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when readiness quorum is healthy',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const healthy = nodeId !== 'node-5';
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                healthy,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: healthy,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: healthy,
            },
            reasons: healthy ? [] : [{code: 'cluster_member_unhealthy'}],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
          {node_id: 'node-5', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
          createNodeEndpoint('node-4'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
          createPostgresWireEndpoint('node-4'),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane partitions should continue planning when healthy-node quorum is satisfied',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should remain open when priority quorum is healthy',
      );
    });

  await t.test(
    'checkRebalance keeps nodes-p1 load-shedding while full readiness is ' +
    'incomplete despite a recovery-eligible quorum',
    async (t) => {
      const recoveryEligibleNodeIds = new Set([
        'node-1',
        'node-2',
        'node-3',
      ]);
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const recoveryEligible = recoveryEligibleNodeIds.has(nodeId);
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
                recoveryEligible,
            },
            reasons: recoveryEligible ? [] : [{code: 'ready_lease_expired'}],
          };
        },
      };
      const nodes = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5']
        .map((nodeId) => ({
          node_id: nodeId,
          status: NodeStatus.ACTIVE,
        }));
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'nodes-p1',
          table_id: 'nodes',
          replica_count: 3,
        }],
        nodeEndpoints: [...recoveryEligibleNodeIds]
          .map((nodeId) => createNodeEndpoint(nodeId)),
        serviceEndpoints: [...recoveryEligibleNodeIds]
          .map((nodeId) => createPostgresWireEndpoint(nodeId)),
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
      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      t.ok(
        rebalancer.getCriticalSystemTopologySettlingBlocker(),
        'nodes-p1 should retain the full-readiness topology gate after the adverse live A/B',
      );
      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'nodes-p1 should not add recovery work while its readiness prerequisite is incomplete',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'nodes-p1 should schedule the canonical delayed retry rather than advance now',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when ' +
    'quorum is recovery-eligible during ACK_PENDING convergence',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const recoveryEligibleNodeIds = new Set([
            'node-1',
            'node-2',
            'node-3',
          ]);
          const recoveryEligible = recoveryEligibleNodeIds.has(nodeId);
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                nodeId === 'node-1',
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
                nodeId === 'node-1',
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
                nodeId === 'node-1',
            },
            reasons: recoveryEligible ? [] : [{code: 'cluster_member_unhealthy'}],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
          {node_id: 'node-5', status: NodeStatus.ACTIVE},
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane recovery should continue once quorum is control-plane-recovery-eligible even when cluster-member health is still converging',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should remain open when recovery-eligible quorum is present',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while failed membership is pending cleanup',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.FAILED},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-3'),
        ],
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
        0,
        'failed membership should remain behind the topology-settling gate until cleanup completes',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while connected membership exceeds nodes cache',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        messageRouter: createMockMessageRouter('connected', [
          'node-2',
          'node-3',
          'node-4',
        ]),
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
        'critical system partitions should not evaluate while transport sees extra cluster members',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'live-membership settling should schedule a delayed retry',
      );

      rebalancer.shutdown();
    });

  await t.test(
    'checkRebalance keeps priority control-plane recovery open when ' +
    'transport sees unpublished extra peers beyond the readiness quorum',
    async (t) => {
      const readinessService = {
        membershipPublicationService:
          createMockMembershipPublicationService(
            ['node-1', 'node-2'],
            1,
            {
              status: 'PUBLISHED',
              priorityPartitionSummary: {
                satisfied: false,
              },
            },
          ),
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        messageRouter: createMockMessageRouter('connected', [
          'node-2',
          'node-3',
          'node-4',
        ]),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority recovery should continue when only unpublished peers remain outside the nodes cache',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'unpublished extra peers should not keep the topology-settling gate closed once quorum is healthy',
      );

      rebalancer.shutdown();
    });

  await t.test(
    'checkRebalance keeps priority control-plane recovery open when ' +
    'published membership outruns the local nodes cache',
    async (t) => {
      const publishedActiveNodeIds = Object.freeze([
        'node-1',
        'node-2',
        'node-3',
        'node-4',
      ]);
      const connectedNodeIds = Object.freeze([
        'node-2',
        'node-3',
        'node-4',
      ]);
      const readinessService = {
        membershipPublicationService:
          createMockMembershipPublicationService(
            [...publishedActiveNodeIds],
            1,
            {
              status: 'PUBLISHED',
              priorityPartitionSummary: {
                satisfied: false,
              },
            },
          ),
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        messageRouter: createMockMessageRouter('connected', [
          ...connectedNodeIds,
        ]),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'published-membership cache lag should not keep priority recovery behind the transport-settling gate',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'priority recovery should not schedule a topology-settling retry once published membership is authoritative',
      );

      rebalancer.shutdown();
    });

  await t.test(
    'checkRebalance defers critical system partitions while active node endpoint visibility is incomplete',
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
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
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
        'critical system partitions should not evaluate before endpoint coverage reaches every active node',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'endpoint-visibility settling should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance allows priority control-plane partitions to proceed ' +
      'once endpoint visibility covers the policy target',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
          {node_id: 'node-5', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
          createNodeEndpoint('node-4'),
          // node-5 intentionally missing endpoint publication
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
          createPostgresWireEndpoint('node-4'),
          // node-5 intentionally missing endpoint publication
        ],
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
        1,
        'priority control-plane partitions should continue once endpoint coverage satisfies the replica target',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'target-satisfied endpoint visibility should not force topology-settling deferral',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when ' +
      'websocket endpoint publication lags a readiness-healthy connected peer',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
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
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        messageRouter: createMockMessageRouter('connected', [
          'node-2',
          'node-3',
        ]),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority recovery should continue when readiness and transport already make the peer visible',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'endpoint publication lag should not close the topology-settling gate once visibility is recoverably established',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when ' +
      'postgres wire endpoint publication lags a control-plane-writable peer',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority recovery should continue when control-plane writability already confirms SQL visibility',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'postgres wire publication lag should not keep the topology-settling gate closed after readiness recovers',
      );
    });

  await t.test(
    'checkRebalance keeps control_plane_publications open when ' +
      'postgres wire publication lags a control-plane-writable active peer',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'control_plane_publications should continue once canonical readiness already confirms SQL visibility on every active node',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'control_plane_publications should not keep a topology-settling retry scheduled after readiness recovers',
      );
    },
  );

  await t.test(
    'checkRebalance still defers control_plane_publications when ' +
      'an active peer is not control-plane-writable',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const controlPlaneWritable = nodeId !== 'node-3';
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                controlPlaneWritable,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: controlPlaneWritable,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: 'control_plane_publications-p1',
          table_id: 'control_plane_publications',
        }],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
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

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'control_plane_publications should still wait when an active node lacks canonical SQL readiness',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'control_plane_publications should keep a delayed topology-settling retry while readiness remains incomplete',
      );
    },
  );
});
