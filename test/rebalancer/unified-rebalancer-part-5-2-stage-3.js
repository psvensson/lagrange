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
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PRIORITY_RECOVERY_SEMANTIC_STATE} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
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
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

// Create a mock system table cache
function createMockCache(
  nodes = [],
  services = [],
  partitions = [],
  tables = [],
  replicaOperations = [],
  nodeEndpoints = [],
  serviceEndpoints = [],
) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    connection_state: Object.hasOwn(node, 'connection_state') ?
      node.connection_state : 'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + 10000,
    ...node,
  }));
  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(),
    replica_operations: new Map(replicaOperations.map((op) => [op.operation_id, op])),
    node_endpoints: new Map(nodeEndpoints.map((row, index) => [index, row])),
    service_endpoints:
      new Map(serviceEndpoints.map((row, index) => [index, row])),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
}

// Create mock CDC integration service
function createMockCdcService() {
  return {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

// Create mock table policy service
function createMockPolicyService(partitions = [], tables = []) {
  return {
    getPolicyForPartition: (partitionId) => {
      const partition = partitions.find((p) => p.partition_id === partitionId);
      if (!partition) return {...DEFAULT_TABLE_POLICY};
      const table = tables.find((t) => t.table_id === partition.table_id);
      if (!table || !table.table_policies) return {...DEFAULT_TABLE_POLICY};
      try {
        return {...DEFAULT_TABLE_POLICY, ...JSON.parse(table.table_policies)};
      } catch (_e) {
        return {...DEFAULT_TABLE_POLICY};
      }
    },
    getMessageGroupPolicy: async () => ({...DEFAULT_MESSAGE_GROUP_POLICY}),
  };
}

// Create mock message router
function createMockMessageRouter(
  connectionState = 'connected',
  connectedNodes = [],
) {
  return {
    getConnectionState: () => connectionState,
    getConnectedNodes: () => [...connectedNodes],
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

// Create mock rebalance coordinator
function createMockCoordinator() {
  const storageAccountingService = {
    estimateReplicaBytes: () => 1,
  };
  const storageAdmissionService = {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    // getStats is called synchronously by UnifiedRebalancer.getStats()
    getStats: () => ({
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: 0,
    }),
    storageAccountingService,
    storageAdmissionService,
  };
}

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
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
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
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: healthy,
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

test('UnifiedRebalancer - Rebalancing Triggers chunk 3', async (t) => {
  initializeTestEnvironment();
  await t.test(
    'checkRebalance lets priority recovery operation creation bypass startup ' +
    'readiness planning gates',
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_PUBLICATION_EPOCH = 8;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
      'eligible_but_no_operation_created';
      const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
      const TEST_TOPOLOGY_BLOCKER_REASON = 'endpoint_visibility_incomplete';
      const TEST_TOPOLOGY_OPERATIONS_IN_FLIGHT_REASON =
      'topology_operations_in_flight';
      const TEST_TRAFFIC_BLOCKER_PHASE = 'load';
      const TEST_TRAFFIC_BLOCKER_REASON = 'load_readiness_waiting';
      const TEST_LOCAL_SERVE_BLOCKER_REASON = 'serve_readiness_waiting';
      const TEST_ZERO_MS = 0;
      const TEST_STABLE_WINDOW_MS = 250;
      const TEST_EVALUATION_REACHED = 1;
      const nodes = Object.freeze([
        Object.freeze({node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE}),
      ]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: TEST_PRIORITY_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        })]),
        missingPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        projectedServingNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        locallyEligibleNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([Object.freeze({
            partitionId: TEST_PRIORITY_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: Object.freeze([
              TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
            ]),
            progress: Object.freeze({
              nextRequiredAction: TEST_NEXT_ACTION_CREATE_OPERATION,
            }),
            planner: Object.freeze({
              requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
              spreadGap: TEST_SPREAD_GAP,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              concreteEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              publishedActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          })]),
        }),
      });
      const cache = createMockCache(nodes);
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {priorityPartitionSummary};
          },
        },
      };
      const createPriorityRecoveryRebalancer = () => {
        const rebalancer = createTestRebalancer({
          entityId: TEST_PRIORITY_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: TEST_NODE_ID_A,
          nodes,
          controlPlaneReadinessService: readinessService,
        });

        rebalancer.initialize();
        rebalancer.isLeader = true;
        rebalancer.clusterReadinessConfirmed = true;
        rebalancer.isStabilized = () => true;
        rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
        rebalancer.scheduleNextCheck = () => {};

        return rebalancer;
      };

      await t.test('topology settling gate', async (t) => {
        const topologyBlocker = Object.freeze({
          reason: TEST_TOPOLOGY_BLOCKER_REASON,
          requiredReadyNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          endpointReadyNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
        });
        const rebalancer = createPriorityRecoveryRebalancer();

        rebalancer.getCriticalSystemTopologySettlingBlocker = () =>
          topologyBlocker;
        rebalancer.revalidateCriticalSystemTopologySettlingBlocker =
        async (blocker) => blocker;
        rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
        rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;

        let evaluateCalls = 0;
        rebalancer.evaluateState = async () => {
          evaluateCalls++;
          return false;
        };

        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          TEST_EVALUATION_REACHED,
          'missing priority work should not wait behind topology settling',
        );
      });

      await t.test('topology operations in flight gate', async (t) => {
        const topologyBlocker = Object.freeze({
          reason: TEST_TOPOLOGY_OPERATIONS_IN_FLIGHT_REASON,
        });
        const rebalancer = createPriorityRecoveryRebalancer();

        rebalancer.getCriticalSystemTopologySettlingBlocker = () =>
          topologyBlocker;
        rebalancer.revalidateCriticalSystemTopologySettlingBlocker =
        async (blocker) => blocker;
        rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
        rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;

        let evaluateCalls = 0;
        rebalancer.evaluateState = async () => {
          evaluateCalls++;
          return false;
        };

        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          TEST_EVALUATION_REACHED,
          'missing priority work should not wait behind in-flight topology work',
        );
      });

      await t.test('traffic readiness gate', async (t) => {
        const trafficReadinessBlocker = Object.freeze({
          phase: TEST_TRAFFIC_BLOCKER_PHASE,
          ready: false,
          reasons: Object.freeze([TEST_TRAFFIC_BLOCKER_REASON]),
          stableElapsedMs: TEST_ZERO_MS,
          stableWindowMs: TEST_STABLE_WINDOW_MS,
        });
        const rebalancer = createPriorityRecoveryRebalancer();

        rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
        rebalancer.getCriticalSystemTrafficReadinessBlocker = () =>
          trafficReadinessBlocker;
        rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;

        let evaluateCalls = 0;
        rebalancer.evaluateState = async () => {
          evaluateCalls++;
          return false;
        };

        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          TEST_EVALUATION_REACHED,
          'missing priority work should not wait behind traffic readiness',
        );
      });

      await t.test('local serve readiness gate', async (t) => {
        const localServeReadinessBlocker = Object.freeze({
          reasons: Object.freeze([
            Object.freeze({code: TEST_LOCAL_SERVE_BLOCKER_REASON}),
          ]),
        });
        const rebalancer = createPriorityRecoveryRebalancer();

        rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
        rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
        rebalancer.getCriticalSystemLocalServeReadinessBlocker = () =>
          localServeReadinessBlocker;

        let evaluateCalls = 0;
        rebalancer.evaluateState = async () => {
          evaluateCalls++;
          return false;
        };

        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          TEST_EVALUATION_REACHED,
          'missing priority work should not wait behind local serve readiness',
        );
      });
    },
  );

  await t.test(
    'checkRebalance lets a priority owner create surrogate recovery work when ' +
    'the control-plane critical reserve is exhausted',
    async (t) => {
      const TEST_OWNER_PARTITION_ID = 'replica_operations-p1';
      const TEST_BLOCKED_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_OWNER_TABLE_ID = 'replica_operations';
      const TEST_BLOCKED_TABLE_ID = 'sql_write_operations';
      const TEST_PUBLICATION_EPOCH = 5;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_OWNER_REPLICA_ID_A = 'replica_operations-p1-r1';
      const TEST_OWNER_REPLICA_ID_B = 'replica_operations-p1-r2';
      const TEST_OWNER_REPLICA_ID_C = 'replica_operations-p1-r3';
      const TEST_BLOCKED_REPLICA_ID_A = 'sql_write_operations-p1-r1';
      const TEST_SERVICE_TYPE_PARTITION = 'partition';
      const TEST_RAFT_ROLE_FOLLOWER = 'follower';
      const TEST_SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
      const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
      'eligible_but_no_operation_created';
      const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
      const TEST_SCOPE_SURROGATE = 'surrogate_partition';
      const TEST_CREATED_OPERATION_ID = 'op-surrogate-priority-recovery';
      const TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: 1,
        totalPending: 36,
        totalPendingCritical: 36,
        totalPendingBackground: 0,
        criticalReserveExhausted: true,
        maxPendingUtilization: 0.5625,
      });
      const nodes = Object.freeze([
        Object.freeze({node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE}),
      ]);
      const ownerServices = Object.freeze([
        Object.freeze({
          service_id: TEST_OWNER_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_OWNER_PARTITION_ID,
          replica_id: TEST_OWNER_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: `${TEST_NODE_ID_A}/partition/${TEST_OWNER_REPLICA_ID_A}`,
        }),
        Object.freeze({
          service_id: TEST_OWNER_REPLICA_ID_B,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_B,
          partition_id: TEST_OWNER_PARTITION_ID,
          replica_id: TEST_OWNER_REPLICA_ID_B,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: `${TEST_NODE_ID_B}/partition/${TEST_OWNER_REPLICA_ID_B}`,
        }),
        Object.freeze({
          service_id: TEST_OWNER_REPLICA_ID_C,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_C,
          partition_id: TEST_OWNER_PARTITION_ID,
          replica_id: TEST_OWNER_REPLICA_ID_C,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address: `${TEST_NODE_ID_C}/partition/${TEST_OWNER_REPLICA_ID_C}`,
        }),
      ]);
      const blockedServices = Object.freeze([Object.freeze({
        service_id: TEST_BLOCKED_REPLICA_ID_A,
        service_type: TEST_SERVICE_TYPE_PARTITION,
        node_id: TEST_NODE_ID_A,
        partition_id: TEST_BLOCKED_PARTITION_ID,
        replica_id: TEST_BLOCKED_REPLICA_ID_A,
        raft_role: TEST_RAFT_ROLE_FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: `${TEST_NODE_ID_A}/partition/${TEST_BLOCKED_REPLICA_ID_A}`,
      })]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: TEST_BLOCKED_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        })]),
        missingPartitionIds: Object.freeze([TEST_BLOCKED_PARTITION_ID]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        projectedServingNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        locallyEligibleNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([Object.freeze({
            partitionId: TEST_BLOCKED_PARTITION_ID,
            semanticState: TEST_SEMANTIC_STATE_NEEDS_OPERATION,
            blockerReasons: Object.freeze([
              TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
            ]),
            progress: Object.freeze({
              nextRequiredAction: TEST_NEXT_ACTION_CREATE_OPERATION,
            }),
            planner: Object.freeze({
              requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
              spreadGap: TEST_SPREAD_GAP,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              concreteEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              publishedActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          })]),
        }),
      });
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () =>
        TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY;
      const cache = createMockCache(
        nodes,
        [...ownerServices, ...blockedServices],
        [
          {partition_id: TEST_OWNER_PARTITION_ID, table_id: TEST_OWNER_TABLE_ID},
          {
            partition_id: TEST_BLOCKED_PARTITION_ID,
            table_id: TEST_BLOCKED_TABLE_ID,
          },
        ],
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort() {
          return planningSnapshot;
        },
        getMembershipPublicationPlanningAnswerSync() {
          return planningSnapshot;
        },
        async getMembershipPublicationPlanningSnapshotBestEffort() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {priorityPartitionSummary};
          },
        },
      };
      const createdOperations = [];
      const rebalancer = createTestRebalancer({
        entityId: TEST_OWNER_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_ID_A,
        nodes,
        services: [...ownerServices, ...blockedServices],
        partitions: [
          {partition_id: TEST_OWNER_PARTITION_ID, table_id: TEST_OWNER_TABLE_ID},
          {
            partition_id: TEST_BLOCKED_PARTITION_ID,
            table_id: TEST_BLOCKED_TABLE_ID,
          },
        ],
        messageRouter: router,
        controlPlaneReadinessService: readinessService,
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(operationRequest) {
            createdOperations.push(operationRequest);
            return {
              operationId: TEST_CREATED_OPERATION_ID,
              replicaId: operationRequest.replicaId,
              targetNodeId: operationRequest.nodeId,
            };
          },
        },
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        TEST_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () => 0;
      rebalancer.scheduleNextCheck = () => {};

      const gateSnapshot =
      rebalancer.buildTransportBackpressurePlanningGateSnapshot();
      await rebalancer.checkRebalance();

      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationRequired,
        true,
        'surrogate missing priority work should bypass pressure deferral',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationPartitionId,
        TEST_BLOCKED_PARTITION_ID,
        'transport gate should report the blocked surrogate partition',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationScope,
        TEST_SCOPE_SURROGATE,
        'transport gate should identify surrogate operation creation',
      );
      t.equal(
        createdOperations.length,
        1,
        'surrogate priority recovery should create exactly one operation',
      );
      t.equal(
        createdOperations[0]?.partitionId,
        TEST_BLOCKED_PARTITION_ID,
        'created operation should target the blocked priority partition',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_NODE_ID_B,
        'created operation should choose a missing eligible node',
      );
    },
  );
});
