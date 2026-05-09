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
  OperationType,
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
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

test('UnifiedRebalancer - Rebalancing Triggers chunk 4', async (t) => {
  initializeTestEnvironment();
  await t.test(
    'checkRebalance lets a priority owner prefer the widest-gap surrogate ' +
    'recovery candidate when decision snapshots are name-ordered',
    async (t) => {
      const TEST_OWNER_PARTITION_ID = 'replica_operations-p1';
      const TEST_OWNER_TABLE_ID = 'replica_operations';
      const TEST_FIRST_BLOCKED_PARTITION_ID = 'sql_transactions-p1';
      const TEST_FIRST_BLOCKED_TABLE_ID = 'sql_transactions';
      const TEST_SECOND_BLOCKED_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_SECOND_BLOCKED_TABLE_ID = 'sql_write_operations';
      const TEST_PUBLICATION_EPOCH = 6;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_FIRST_READY_DISTINCT_NODE_COUNT = 2;
      const TEST_SECOND_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_FIRST_SPREAD_GAP = 1;
      const TEST_SECOND_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_OWNER_REPLICA_ID_A = 'replica_operations-p1-r1';
      const TEST_OWNER_REPLICA_ID_B = 'replica_operations-p1-r2';
      const TEST_OWNER_REPLICA_ID_C = 'replica_operations-p1-r3';
      const TEST_FIRST_BLOCKED_REPLICA_ID_A = 'sql_transactions-p1-r1';
      const TEST_SECOND_BLOCKED_REPLICA_ID_A = 'sql_write_operations-p1-r1';
      const TEST_SERVICE_TYPE_PARTITION = 'partition';
      const TEST_RAFT_ROLE_FOLLOWER = 'follower';
      const TEST_SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
      const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
      'eligible_but_no_operation_created';
      const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
      const TEST_SCOPE_SURROGATE = 'surrogate_partition';
      const TEST_CREATED_OPERATION_ID = 'op-surrogate-priority-ranked';
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
      const blockedServices = Object.freeze([
        Object.freeze({
          service_id: TEST_FIRST_BLOCKED_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_FIRST_BLOCKED_PARTITION_ID,
          replica_id: TEST_FIRST_BLOCKED_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address:
          `${TEST_NODE_ID_A}/partition/${TEST_FIRST_BLOCKED_REPLICA_ID_A}`,
        }),
        Object.freeze({
          service_id: TEST_SECOND_BLOCKED_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_SECOND_BLOCKED_PARTITION_ID,
          replica_id: TEST_SECOND_BLOCKED_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address:
          `${TEST_NODE_ID_A}/partition/${TEST_SECOND_BLOCKED_REPLICA_ID_A}`,
        }),
      ]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([
          Object.freeze({
            partitionId: TEST_FIRST_BLOCKED_PARTITION_ID,
            readyDistinctNodeCount: TEST_FIRST_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: TEST_FIRST_SPREAD_GAP,
          }),
          Object.freeze({
            partitionId: TEST_SECOND_BLOCKED_PARTITION_ID,
            readyDistinctNodeCount: TEST_SECOND_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: TEST_SECOND_SPREAD_GAP,
          }),
        ]),
        missingPartitionIds: Object.freeze([
          TEST_FIRST_BLOCKED_PARTITION_ID,
          TEST_SECOND_BLOCKED_PARTITION_ID,
        ]),
      });
      const priorityRecoveryClosureWitness = Object.freeze({
        blockedPartitionIds: Object.freeze([
          TEST_FIRST_BLOCKED_PARTITION_ID,
          TEST_SECOND_BLOCKED_PARTITION_ID,
        ]),
        unresolvedSemanticStateIds: Object.freeze([
          TEST_SEMANTIC_STATE_NEEDS_OPERATION,
        ]),
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
        priorityRecoveryClosureWitness,
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([
            Object.freeze({
              partitionId: TEST_FIRST_BLOCKED_PARTITION_ID,
              semanticState: TEST_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: Object.freeze([
                TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
              ]),
              progress: Object.freeze({
                nextRequiredAction: TEST_NEXT_ACTION_CREATE_OPERATION,
              }),
              planner: Object.freeze({
                requiredDistinctNodeCount:
                TEST_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                TEST_FIRST_READY_DISTINCT_NODE_COUNT,
                spreadGap: TEST_FIRST_SPREAD_GAP,
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
            }),
            Object.freeze({
              partitionId: TEST_SECOND_BLOCKED_PARTITION_ID,
              semanticState: TEST_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: Object.freeze([
                TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
              ]),
              progress: Object.freeze({
                nextRequiredAction: TEST_NEXT_ACTION_CREATE_OPERATION,
              }),
              planner: Object.freeze({
                requiredDistinctNodeCount:
                TEST_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                TEST_SECOND_READY_DISTINCT_NODE_COUNT,
                spreadGap: TEST_SECOND_SPREAD_GAP,
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
            }),
          ]),
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
            partition_id: TEST_FIRST_BLOCKED_PARTITION_ID,
            table_id: TEST_FIRST_BLOCKED_TABLE_ID,
          },
          {
            partition_id: TEST_SECOND_BLOCKED_PARTITION_ID,
            table_id: TEST_SECOND_BLOCKED_TABLE_ID,
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
            return {
              priorityPartitionSummary,
              priorityRecoveryClosureWitness,
            };
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
            partition_id: TEST_FIRST_BLOCKED_PARTITION_ID,
            table_id: TEST_FIRST_BLOCKED_TABLE_ID,
          },
          {
            partition_id: TEST_SECOND_BLOCKED_PARTITION_ID,
            table_id: TEST_SECOND_BLOCKED_TABLE_ID,
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
        'ranked surrogate missing priority work should bypass pressure deferral',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationPartitionId,
        TEST_SECOND_BLOCKED_PARTITION_ID,
        'transport gate should report the widest-gap surrogate partition',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationScope,
        TEST_SCOPE_SURROGATE,
        'transport gate should identify surrogate operation creation',
      );
      t.equal(
        createdOperations.length,
        1,
        'ranked surrogate priority recovery should create exactly one operation',
      );
      t.equal(
        createdOperations[0]?.partitionId,
        TEST_SECOND_BLOCKED_PARTITION_ID,
        'created operation should target the widest-gap blocked partition',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_NODE_ID_B,
        'created operation should choose a missing eligible node',
      );
    },
  );

  await t.test(
    'checkRebalance lets blocked priority recovery re-enter follow-up when ' +
    'closure witness is blocked_unclassified and planning snapshots are absent',
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_PUBLICATION_EPOCH = 6;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_REPLICA_ID_A = 'sql_write_operations-p1-r1';
      const TEST_BLOCKED_SERVICE_STATUS = ReplicaStatus.ACTIVE;
      const TEST_SERVICE_TYPE_PARTITION = 'partition';
      const TEST_RAFT_ROLE_VOTER = 'voter';
      const TEST_CREATED_OPERATION_ID = 'op-priority-blocked-terminal';
      const TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: 1,
        totalPending: 36,
        totalPendingCritical: 36,
        totalPendingBackground: 0,
        criticalReserveExhausted: true,
        maxPendingUtilization: 0.5625,
      });
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        }]),
        missingPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      });
      const priorityRecoveryClosureWitness = {
        blockedPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
        unresolvedSemanticStateIds: Object.freeze([
          PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
        ]),
      };
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
        priorityRecoveryClosureWitness,
        publicationRecoveryGate: {
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        },
      });
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () =>
        TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY;
      const cache = createMockCache(
        [
          {node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
          {node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        ],
        [
          Object.freeze({
            service_id: TEST_REPLICA_ID_A,
            service_type: TEST_SERVICE_TYPE_PARTITION,
            node_id: TEST_NODE_ID_A,
            partition_id: TEST_PRIORITY_PARTITION_ID,
            replica_id: TEST_REPLICA_ID_A,
            raft_role: TEST_RAFT_ROLE_VOTER,
            status: TEST_BLOCKED_SERVICE_STATUS,
            address: `${TEST_NODE_ID_A}/partition/${TEST_REPLICA_ID_A}`,
          }),
        ],
        [
          {
            partition_id: TEST_PRIORITY_PARTITION_ID,
            table_id: 'sql_write_operations',
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
        entityId: TEST_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_ID_A,
        nodes: [
          {node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
          {node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        ],
        services: [{
          service_id: TEST_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_PRIORITY_PARTITION_ID,
          replica_id: TEST_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_VOTER,
          status: TEST_BLOCKED_SERVICE_STATUS,
          address: `${TEST_NODE_ID_A}/partition/${TEST_REPLICA_ID_A}`,
        }],
        partitions: [{
          partition_id: TEST_PRIORITY_PARTITION_ID,
          table_id: 'sql_write_operations',
        }],
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
        'blocked partition should be treated as follow-up required under critical reserve exhaustion',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationPartitionId,
        TEST_PRIORITY_PARTITION_ID,
        'transport gate should report the blocked partition as the creation target',
      );
      t.equal(
        createdOperations.length,
        2,
        'blocked terminal recovery should create follow-up operations despite pressure',
      );
      t.ok(
        createdOperations.every((operation) =>
          operation?.partitionId === TEST_PRIORITY_PARTITION_ID),
        'follow-up operations should target the blocked partition',
      );
      t.ok(
        createdOperations.every((operation) =>
          operation?.nodeId !== TEST_NODE_ID_A),
        'follow-up operations should avoid placing on same-node replica',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_NODE_ID_B,
        'blocked terminal recovery should prefer a missing eligible node',
      );
    },
  );

  await t.test(
    'rebalance continues surrogate priority recovery scheduling after a ' +
    'repaired priority partition is already in flight',
    async (t) => {
      const TEST_OWNER_PARTITION_ID = 'replica_operations-p1';
      const TEST_OWNER_TABLE_ID = 'replica_operations';
      const TEST_REPAIRED_PARTITION_ID = 'sql_transaction_participants-p1';
      const TEST_REPAIRED_TABLE_ID = 'sql_transaction_participants';
      const TEST_FIRST_REMAINING_PARTITION_ID = 'sql_transactions-p1';
      const TEST_FIRST_REMAINING_TABLE_ID = 'sql_transactions';
      const TEST_SECOND_REMAINING_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_SECOND_REMAINING_TABLE_ID = 'sql_write_operations';
      const TEST_PUBLICATION_EPOCH = 8;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_REPAIRED_SPREAD_GAP = 3;
      const TEST_REMAINING_SPREAD_GAP = 1;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_OWNER_REPLICA_ID_A = 'replica_operations-p1-r1';
      const TEST_OWNER_REPLICA_ID_B = 'replica_operations-p1-r2';
      const TEST_REPAIRED_REPLICA_ID_A =
        'sql_transaction_participants-p1-r1';
      const TEST_FIRST_REMAINING_REPLICA_ID_A = 'sql_transactions-p1-r1';
      const TEST_SECOND_REMAINING_REPLICA_ID_A =
        'sql_write_operations-p1-r1';
      const TEST_REPAIRED_OPERATION_ID = 'op-participants-in-flight';
      const TEST_WAITING_OPERATION_ID = 'op-write-operations-in-flight';
      const TEST_CREATED_OPERATION_ID_PREFIX = 'op-priority-remaining-';
      const TEST_SERVICE_TYPE_PARTITION = 'partition';
      const TEST_RAFT_ROLE_FOLLOWER = 'follower';
      const nodes = Object.freeze([
        Object.freeze({node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE}),
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
      ]);
      const priorityServices = Object.freeze([
        Object.freeze({
          service_id: TEST_REPAIRED_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_REPAIRED_PARTITION_ID,
          replica_id: TEST_REPAIRED_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address:
            `${TEST_NODE_ID_A}/partition/${TEST_REPAIRED_REPLICA_ID_A}`,
        }),
        Object.freeze({
          service_id: TEST_FIRST_REMAINING_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_FIRST_REMAINING_PARTITION_ID,
          replica_id: TEST_FIRST_REMAINING_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address:
            `${TEST_NODE_ID_A}/partition/${TEST_FIRST_REMAINING_REPLICA_ID_A}`,
        }),
        Object.freeze({
          service_id: TEST_SECOND_REMAINING_REPLICA_ID_A,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_NODE_ID_A,
          partition_id: TEST_SECOND_REMAINING_PARTITION_ID,
          replica_id: TEST_SECOND_REMAINING_REPLICA_ID_A,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
          address:
            `${TEST_NODE_ID_A}/partition/${TEST_SECOND_REMAINING_REPLICA_ID_A}`,
        }),
      ]);
      const partitionRows = Object.freeze([
        Object.freeze({
          partition_id: TEST_OWNER_PARTITION_ID,
          table_id: TEST_OWNER_TABLE_ID,
        }),
        Object.freeze({
          partition_id: TEST_REPAIRED_PARTITION_ID,
          table_id: TEST_REPAIRED_TABLE_ID,
        }),
        Object.freeze({
          partition_id: TEST_FIRST_REMAINING_PARTITION_ID,
          table_id: TEST_FIRST_REMAINING_TABLE_ID,
        }),
        Object.freeze({
          partition_id: TEST_SECOND_REMAINING_PARTITION_ID,
          table_id: TEST_SECOND_REMAINING_TABLE_ID,
        }),
      ]);
      const replicaOperations = Object.freeze([
        Object.freeze({
          operation_id: TEST_REPAIRED_OPERATION_ID,
          partition_id: TEST_REPAIRED_PARTITION_ID,
          type: OperationType.ADD,
          status: ReplicaStatus.PENDING,
          target_node_id: TEST_NODE_ID_B,
        }),
        Object.freeze({
          operation_id: TEST_WAITING_OPERATION_ID,
          partition_id: TEST_SECOND_REMAINING_PARTITION_ID,
          type: OperationType.ADD,
          status: ReplicaStatus.PENDING,
          target_node_id: TEST_NODE_ID_B,
        }),
      ]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([
          Object.freeze({
            partitionId: TEST_REPAIRED_PARTITION_ID,
            readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: TEST_REPAIRED_SPREAD_GAP,
          }),
          Object.freeze({
            partitionId: TEST_FIRST_REMAINING_PARTITION_ID,
            readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: TEST_REMAINING_SPREAD_GAP,
          }),
          Object.freeze({
            partitionId: TEST_SECOND_REMAINING_PARTITION_ID,
            readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: TEST_REMAINING_SPREAD_GAP,
          }),
        ]),
      });
      const priorityRecoveryClosureWitness = Object.freeze({
        blockedPartitionIds: Object.freeze([
          TEST_REPAIRED_PARTITION_ID,
          TEST_FIRST_REMAINING_PARTITION_ID,
          TEST_SECOND_REMAINING_PARTITION_ID,
        ]),
        unresolvedSemanticStateIds: Object.freeze([
          PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
        ]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
        ]),
        priorityPartitionSummary,
        priorityRecoveryClosureWitness,
        publicationRecoveryGate: Object.freeze({
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        }),
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([
            Object.freeze({
              partitionId: TEST_REPAIRED_PARTITION_ID,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
              blockerReasons: Object.freeze([]),
              planner: Object.freeze({
                requiredDistinctNodeCount:
                  TEST_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
                spreadGap: TEST_REPAIRED_SPREAD_GAP,
              }),
              coordinator: Object.freeze({
                operationCount: 1,
                operationIds: Object.freeze([TEST_REPAIRED_OPERATION_ID]),
              }),
            }),
            Object.freeze({
              partitionId: TEST_FIRST_REMAINING_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
              blockerReasons: Object.freeze([
                PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
              ]),
              progress: Object.freeze({
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .WAIT_FOR_OPERATION_PROGRESS,
              }),
              coordinator: Object.freeze({
                operationCount: 0,
                operationIds: Object.freeze([]),
                serialWaitOperationCount: 1,
                serialWaitOperationIds: Object.freeze([
                  TEST_REPAIRED_OPERATION_ID,
                ]),
                serialWaitPartitionIds: Object.freeze([
                  TEST_REPAIRED_PARTITION_ID,
                ]),
              }),
              planner: Object.freeze({
                requiredDistinctNodeCount:
                  TEST_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
                spreadGap: TEST_REMAINING_SPREAD_GAP,
              }),
              admission: Object.freeze({
                effectiveEligibleNodeIds: Object.freeze([
                  TEST_NODE_ID_A,
                  TEST_NODE_ID_B,
                ]),
              }),
              publication: Object.freeze({
                recoveryActiveNodeIds: Object.freeze([
                  TEST_NODE_ID_A,
                  TEST_NODE_ID_B,
                ]),
              }),
            }),
            Object.freeze({
              partitionId: TEST_SECOND_REMAINING_PARTITION_ID,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
              blockerReasons: Object.freeze([]),
              progress: Object.freeze({
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .WAIT_FOR_OPERATION_PROGRESS,
              }),
              coordinator: Object.freeze({
                operationCount: 1,
                operationIds: Object.freeze([TEST_WAITING_OPERATION_ID]),
              }),
              planner: Object.freeze({
                requiredDistinctNodeCount:
                  TEST_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
                spreadGap: TEST_REMAINING_SPREAD_GAP,
              }),
              admission: Object.freeze({
                effectiveEligibleNodeIds: Object.freeze([
                  TEST_NODE_ID_A,
                  TEST_NODE_ID_B,
                ]),
              }),
              publication: Object.freeze({
                recoveryActiveNodeIds: Object.freeze([
                  TEST_NODE_ID_A,
                  TEST_NODE_ID_B,
                ]),
              }),
            }),
          ]),
        }),
      });
      const cache = createMockCache(
        nodes,
        [...ownerServices, ...priorityServices],
        partitionRows,
        [],
        replicaOperations,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
              priorityRecoveryClosureWitness,
            };
          },
        },
      };
      const createdOperations = [];
      const rebalancer = createTestRebalancer({
        entityId: TEST_OWNER_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_ID_A,
        nodes,
        services: [...ownerServices, ...priorityServices],
        partitions: partitionRows,
        replicaOperations,
        controlPlaneReadinessService: readinessService,
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getConcurrentAddCountByPriorityClass() {
            return {
              ordinaryPriorityCount: 0,
              emergencyPriorityCount: 1,
              priorityCount: 1,
            };
          },
          async createOperation(operationRequest) {
            createdOperations.push(operationRequest);
            return {
              operationId:
                TEST_CREATED_OPERATION_ID_PREFIX + createdOperations.length,
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
      rebalancer.getConfiguredRebalanceBudget = async () =>
        TEST_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () => 1;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [TEST_NODE_ID_A, TEST_NODE_ID_B],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      await rebalancer.rebalance();

      t.same(
        createdOperations.map((operation) => operation.partitionId),
        [TEST_FIRST_REMAINING_PARTITION_ID],
        'serial-wait surrogate candidate without an operation should remain eligible',
      );
      t.ok(
        createdOperations.every((operation) =>
          operation.nodeId === TEST_NODE_ID_B),
        'remaining priority operations should target the missing eligible node',
      );
    },
  );
});
