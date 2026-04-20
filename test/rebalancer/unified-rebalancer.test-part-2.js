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

function createNodeEndpoint(nodeId) {
  return {
    node_id: nodeId,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    status: ENDPOINT_STATUS.ACTIVE,
  };
}

function createPostgresWireEndpoint(nodeId) {
  return {
    node_id: nodeId,
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    health_status: ENDPOINT_SYNC_HEALTH.HEALTHY,
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

function createMockMembershipPublicationService(
  publishedActiveNodeIds = [],
  publicationEpoch = 1,
  options = {},
) {
  return {
    getLatestClusterPublicationSync() {
      return {
        status: 'PUBLISHED',
        publicationEpoch,
        publishedActiveNodeIds,
        ...(options && typeof options === 'object' ? options : {}),
      };
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

test('UnifiedRebalancer serializes ordinary priority recovery moves while another ordinary priority move is already in flight',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'sql_transactions-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'sql_transactions-p1',
              spreadGap: 1,
            }],
          },
        },
      );
    rebalancer.rebalanceCoordinator.getConcurrentAddCountByPriorityClass =
      async () => ({
        priorityCount: 1,
        ordinaryPriorityCount: 1,
        emergencyPriorityCount: 0,
        nonPriorityCount: 0,
      });

    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    rebalancer.getAvailableNodes = () => ([
      {node_id: 'node-1'},
      {node_id: 'node-2'},
    ]);
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: 2,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.ADD,
        nodeId: 'node-2',
        replicaId: 'sql-transactions-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.executeRebalancingMoves = async () => {
      t.fail(
        'ordinary priority recovery should not launch another move while one ordinary priority add is already in flight',
      );
    };

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(
      result.success,
      true,
      'serial ordinary priority gating should remain a clean skip',
    );
    t.equal(
      result.skipped,
      true,
      'ordinary priority recovery should defer while another ordinary priority move is in flight',
    );
    t.equal(
      result.reason,
      REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      'serial ordinary priority gating should surface through the existing budget skip reason',
    );
    t.equal(
      result.ordinaryPriorityRecoverySerialGate?.ordinaryPriorityInFlightCount,
      1,
      'serial priority gating should expose the blocking in-flight ordinary priority count',
    );

    rebalancer.shutdown();
  });

test('UnifiedRebalancer keeps emergency priority recovery eligible while ordinary priority work is already in flight',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              spreadGap: 1,
            }],
          },
        },
      );
    rebalancer.rebalanceCoordinator.getConcurrentAddCountByPriorityClass =
      async () => ({
        priorityCount: 1,
        ordinaryPriorityCount: 1,
        emergencyPriorityCount: 0,
        nonPriorityCount: 0,
      });

    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    rebalancer.getAvailableNodes = () => ([
      {node_id: 'node-1'},
      {node_id: 'node-2'},
    ]);
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: 2,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.ADD,
        nodeId: 'node-2',
        replicaId: 'control-plane-publications-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.executeRebalancingMoves = async (moves) => moves.map((move) => ({
      success: true,
      skipped: false,
      operation: move.type,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
    }));

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(
      result.success,
      true,
      'emergency priority recovery should still schedule work',
    );
    t.equal(
      result.moves.length,
      1,
      'emergency priority recovery should keep its bounded overflow lane',
    );
    t.equal(
      result.ordinaryPriorityRecoverySerialGate,
      undefined,
      'emergency partitions should not be blocked by the ordinary-priority serial gate',
    );

    rebalancer.shutdown();
  });

test('UnifiedRebalancer uses the canonical emergency priority classification for transport-critical recovery',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        ['node-1', 'node-2'],
        1,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              spreadGap: 1,
            }],
          },
        },
      );

    t.equal(
      rebalancer.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive,
      true,
      'transport-critical publication partitions should activate the emergency recovery classification',
    );

    rebalancer.shutdown();
  });

test('UnifiedRebalancer keeps reserved priority move capacity during transient publication-summary gaps',
  async (t) => {
    initializeTestEnvironment();

    let nowMs = 10_000;
    let publicationRow = {
      status: 'PUBLISHED',
      priorityPartitionSummary: {
        satisfied: false,
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'tables-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nowFn: () => nowMs,
      priorityRecoveryActivityStaleGraceMs: 15_000,
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService = {
      getLatestClusterPublicationSync() {
        return publicationRow;
      },
    };

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      1,
      'active priority recovery should reserve one global move slot',
    );

    publicationRow = null;
    nowMs += 5_000;

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      1,
      'transient publication read gaps should reuse the last active recovery plan within stale grace',
    );

    nowMs += 20_000;

    t.equal(
      rebalancer.getReservedPriorityRecoveryMoveSlots(),
      0,
      'once stale grace expires the reserved move slot should clear',
    );

    rebalancer.shutdown();
  });


test('UnifiedRebalancer - Policy Management', async (t) => {
  initializeTestEnvironment();

  await t.test('returns default table policy when no cache data', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.replicaCount, DEFAULT_TABLE_POLICY.replicaCount);
    t.equal(policy.minReplicaCount, DEFAULT_TABLE_POLICY.minReplicaCount);
    t.equal(policy.maxReplicaCount, DEFAULT_TABLE_POLICY.maxReplicaCount);
  });

  await t.test('returns default message group policy', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount);
    t.equal(policy.ensureLocalAccess, DEFAULT_MESSAGE_GROUP_POLICY.ensureLocalAccess);
  });

  await t.test('returns table policy from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      partitions: [{partition_id: 'partition-1', table_id: 'table-1'}],
      tables: [{
        table_id: 'table-1',
        table_policies: JSON.stringify({replicaCount: 5, minReplicaCount: 3}),
      }],
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.replicaCount, 5);
    t.equal(policy.minReplicaCount, 3);
  });

  await t.test(
    'message-group local access is satisfied by any local message-group replica',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'mg-1',
        entityType: EntityType.MESSAGE_GROUP,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'mg-1-r1',
            group_id: 'mg-1',
            node_id: 'node-1',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-1-r2',
            group_id: 'mg-1',
            node_id: 'node-2',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-3-r0',
            group_id: 'mg-self-hosted-3',
            node_id: 'node-3',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-4-r0',
            group_id: 'mg-self-hosted-4',
            node_id: 'node-4',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
        ],
      });

      const nodesWithoutReplica = rebalancer.getNodesWithoutLocalReplica(
        rebalancer.getCurrentReplicas(),
      );

      t.same(
        nodesWithoutReplica,
        [],
        'other local message-group replicas should satisfy local access',
      );
    },
  );
});

test('UnifiedRebalancer - Node Management', async (t) => {
  initializeTestEnvironment();

  await t.test('gets available nodes from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.FAILED},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();

    t.equal(nodes.length, 2);
    t.ok(nodes.some((n) => n.node_id === 'node-1'));
    t.ok(nodes.some((n) => n.node_id === 'node-2'));
    t.notOk(nodes.some((n) => n.node_id === 'node-3'));
  });

  await t.test('uses published membership as steady-state topology truth',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService([
          'node-1',
          'node-3',
        ]),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'only published active nodes should be available for steady-state placement',
      );
    });

  await t.test(
    'allows priority control-plane recovery to use recovery-eligible nodes before publication spread converges',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2'],
          3,
          {
            priorityPartitionSummary: {
              satisfied: false,
            },
          },
        ),
      };

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
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-2', 'node-3'],
        'priority recovery should not deadlock by filtering candidates to only published active nodes',
      );
    },
  );

  await t.test(
    'retains the latest published membership when a newer publication is still open',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              status: 'OPEN',
              publicationEpoch: 8,
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              status: 'PUBLISHED',
              publicationEpoch: 7,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            };
          },
        },
      };

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
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'steady-state availability should keep the last published membership while a newer publication remains open',
      );
    });

  await t.test('requires canonical readiness for steady-state availability',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync() {
            return null;
          },
        },
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes,
        [],
        'steady-state placement must not fall back to cache rows when canonical readiness is unavailable',
      );
    });

  await t.test('sorts nodes by load', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, cpu_usage_percent: 80},
        {node_id: 'node-2', status: NodeStatus.ACTIVE, cpu_usage_percent: 20},
        {node_id: 'node-3', status: NodeStatus.ACTIVE, cpu_usage_percent: 50},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();
    const sorted = rebalancer.sortNodesByLoad(nodes);

    t.equal(sorted[0].node_id, 'node-2'); // Lowest load
    t.equal(sorted[1].node_id, 'node-3');
    t.equal(sorted[2].node_id, 'node-1'); // Highest load
  });
});

test('UnifiedRebalancer - Readiness Checks', async (t) => {
  initializeTestEnvironment();

  await t.test('returns true when node is ready and connected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'connected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, true);

    rebalancer.shutdown();
  });

  await t.test('returns false when node is disconnected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'disconnected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });

  await t.test('returns false when readiness ping fails', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
    ]);
    const mockCdcService = createMockCdcService();
    const mockPolicyService = createMockPolicyService();
    const mockCoordinator = createMockCoordinator();
    const messageRouter = {
      getConnectionState: () => 'connected',
      pingNode: async () => false,
      isOutboundQueueAvailable: () => true,
    };

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCdcService,
      tablePolicyService: mockPolicyService,
      messageRouter,
      rebalanceCoordinator: mockCoordinator,
    });
    rebalancer.enableReadinessPing = true;

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });
});

test('UnifiedRebalancer - Replica State', async (t) => {
  initializeTestEnvironment();

  await t.test('gets healthy replicas only', async (t) => {
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.some((r) => r.replica_id === 'r1'));
    t.ok(healthy.some((r) => r.replica_id === 'r3'));
  });

  await t.test('detects multiple replicas on same node', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const duplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-1'},
      {replica_id: 'r3', node_id: 'node-2'},
    ];

    const noDuplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-2'},
      {replica_id: 'r3', node_id: 'node-3'},
    ];

    t.equal(rebalancer.hasMultipleReplicasOnSameNode(duplicates), true);
    t.equal(rebalancer.hasMultipleReplicasOnSameNode(noDuplicates), false);
  });
});

