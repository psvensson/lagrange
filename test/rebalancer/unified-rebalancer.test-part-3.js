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
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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

test('UnifiedRebalancer - Move Calculation', async (t) => {
  initializeTestEnvironment();

  await t.test('calculates add moves when below target', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 2);
    t.ok(addMoves.some((m) => m.nodeId === 'node-2'));
    t.ok(addMoves.some((m) => m.nodeId === 'node-3'));
  });

  await t.test(
    'ignores REPLACE remove-dispatch rows for pending-add node gating',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        replicaOperations: [
          {
            operation_id: 'op-active',
            type: 'REPLACE',
            partition_id: 'partition-1',
            replica_id: 'replica-target-active',
            target_node_id: 'node-2',
            status: ReplicaStatus.ACTIVE,
            workflow_step: WORKFLOW_STEP.ACTIVE,
          },
          {
            operation_id: 'op-stopping',
            type: 'REPLACE',
            partition_id: 'partition-1',
            replica_id: 'replica-target-stopping',
            target_node_id: 'node-3',
            status: ReplicaStatus.REMOVING,
            workflow_step: WORKFLOW_STEP.STOPPING,
          },
        ],
      });

      t.equal(
        rebalancer.hasPendingAddForNode('node-2'),
        false,
        'ACTIVE remove-dispatch phase should not consume add gating',
      );
      t.equal(
        rebalancer.hasPendingAddForNode('node-3'),
        false,
        'STOPPING remove-dispatch phase should not consume add gating',
      );
      t.equal(
        rebalancer.getTopologyBlockingInFlightOperations().length,
        0,
        'remove-dispatch rows should be excluded from topology blockers',
      );
    },
  );

  await t.test(
    'does not stall non-priority planning on REPLACE remove-dispatch rows',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        replicaOperations: [
          {
            operation_id: 'op-active',
            type: 'REPLACE',
            partition_id: 'partition-1',
            replica_id: 'replica-target',
            target_node_id: 'node-2',
            status: ReplicaStatus.ACTIVE,
            workflow_step: WORKFLOW_STEP.ACTIVE,
          },
        ],
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((move) => move.type === MoveType.ADD);

      t.equal(addMoves.length, 2, 'planner should keep creating add moves');
      t.ok(addMoves.some((move) => move.nodeId === 'node-2'));
      t.ok(addMoves.some((move) => move.nodeId === 'node-3'));
    },
  );

  await t.test(
    'does not block rebalance on stale syncing replicas without in-flight operations',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.SYNCING},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);

      t.equal(addMoves.length, 2, 'should still produce ADD moves');
      t.ok(addMoves.some((m) => m.nodeId === 'node-2'));
      t.ok(addMoves.some((m) => m.nodeId === 'node-3'));
    },
  );

  await t.test(
    'does not schedule local ADD in degraded single-node placement when replicas already occupy node',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.SYNCING},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1'],
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 1,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);
      t.equal(
        addMoves.length,
        0,
        'should not create local ADD when node is already occupied by syncing replicas',
      );
    },
  );

  await t.test('calculates remove moves for failed replicas', async (t) => {
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

  await t.test('converts node_not_in_target + add into REPLACE move', async (t) => {
    // When there's a node not in target (node-4) and a node missing (node-3),
    // planner should emit REPLACE to avoid add-only growth.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should not emit standalone ADD');

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 0, 'should not emit standalone REMOVE');

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(replaceMoves.length, 1, 'should emit one REPLACE move');
    t.equal(replaceMoves[0].nodeId, 'node-3', 'REPLACE should target node-3');
    t.equal(replaceMoves[0].sourceNodeId, 'node-4', 'REPLACE should remove from node-4');
    t.equal(replaceMoves[0].replicaId, 'r3', 'REPLACE should remove replica r3');
  });

  await t.test('uses REPLACE moves when target is degraded but spread can improve', async (t) => {
    // In degraded topology (insufficient ready nodes), when policy target is already
    // satisfied we should avoid ADD-only growth and use paired REPLACE moves.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-3'],
      degraded: true,
      degradedReason: 'insufficient_nodes',
      availableNodeCount: 2,
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(
      addMoves.length,
      0,
      'should not emit standalone ADD moves when degraded and already at target',
    );

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(
      removeMoves.length,
      0,
      'should not emit standalone non-failed REMOVE moves while degraded',
    );

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(
      replaceMoves.length,
      1,
      'should emit one REPLACE move to improve spread under degraded topology',
    );
    t.equal(
      replaceMoves[0].nodeId,
      'node-3',
      'replacement target should be the underrepresented ready node',
    );
    t.equal(
      replaceMoves[0].replicaId,
      'r2',
      'replacement source should come from overrepresented node',
    );
  });

  await t.test('keeps ADD move in degraded topology when below policy target', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-3'],
      degraded: true,
      degradedReason: 'insufficient_nodes',
      availableNodeCount: 2,
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);

    t.equal(addMoves.length, 1, 'should keep ADD while below policy target');
    t.equal(addMoves[0].nodeId, 'node-3', 'ADD should target missing node');
  });

  await t.test(
    'does not emit degraded ADDs for critical partitions already at replica target',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
      });

      // All replicas are present and active, but intentionally lack routability
      // metadata to simulate transient bootstrap/service-row lag.
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1'],
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 1,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);

      t.equal(
        addMoves.length,
        0,
        'degraded planning should not create local ADDs when replica count is already met',
      );
    },
  );

  await t.test('converts spread_replicas + add into REPLACE move', async (t) => {
    // When a node has excess replicas and there is a missing target node,
    // planner should emit REPLACE to keep replica count bounded.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // node-1 has 2 replicas, node-2 has 1, node-3 needs 1
    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should not emit standalone ADD');

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 0, 'should not emit standalone spread REMOVE');

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(replaceMoves.length, 1, 'should emit one REPLACE move');
    t.equal(replaceMoves[0].nodeId, 'node-3', 'REPLACE should target node-3');
    t.equal(
      replaceMoves[0].sourceNodeId,
      'node-1',
      'REPLACE should remove from overrepresented node',
    );
  });

  await t.test('calculates remove moves when no add moves needed', async (t) => {
    // When all target nodes have replicas but there's an extra replica on
    // a non-target node, REMOVE should be generated (no ADDs to defer for)
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    // No ADD moves needed - all target nodes have replicas
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should have no ADD moves');

    // REMOVE move should be generated for node-4
    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.ok(removeMoves.some((m) => m.nodeId === 'node-4'), 'should remove from node-4');
  });
});

test('UnifiedRebalancer - State Evaluation', async (t) => {
  initializeTestEnvironment();

  await t.test('logs degraded target once until topology signal changes', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
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
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const degradedLogs = [];
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.DEGRADED_TARGET) {
          degradedLogs.push(payload);
        }
      },
    };

    await rebalancer.evaluateState();
    await rebalancer.evaluateState();

    t.equal(
      degradedLogs.length,
      1,
      'degraded target should not spam on unchanged state',
    );
  });

  await t.test('logs suboptimal state once until topology signal changes', async (t) => {
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
          node_id: 'node-1',
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

    const suboptimalLogs = [];
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.SUBOPTIMAL_STATE) {
          suboptimalLogs.push(payload);
        }
      },
    };

    await rebalancer.evaluateState();
    await rebalancer.evaluateState();

    t.equal(
      suboptimalLogs.length,
      1,
      'suboptimal state should not spam on unchanged topology',
    );
  });

  await t.test('detects critical state when below minimum replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
    ];

    const policy = {minReplicaCount: 3};

    t.equal(rebalancer.isCriticalState(replicas, policy), true);
  });

  await t.test('does not treat below-min as critical when ready-node capacity is constrained',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
      });

      const replicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];

      const policy = {
        minReplicaCount: 3,
        targetReplicaCount: 3,
      };

      t.equal(
        rebalancer.isCriticalState(replicas, policy),
        false,
        'insufficient ready nodes should be treated as degraded, not critical',
      );
      t.equal(
        rebalancer.isSuboptimalState(replicas, policy),
        false,
        'at actionable target under degraded capacity should not be repeatedly rebalanced',
      );
    });

  await t.test('detects suboptimal state when not at target count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {replicaCount: 3};

    t.equal(rebalancer.isSuboptimalState(replicas, policy), true);
  });

  await t.test('detects suboptimal state when replicas not spread', async (t) => {
    // Create rebalancer with 3 nodes - one unused node available for spreading
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE}, // Unused node
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      placementConstraints: {spreadAcrossNodes: true},
    };

    t.equal(rebalancer.isSuboptimalState(replicas, policy), true);
  });

  await t.test('not suboptimal when no unused nodes for spreading', async (t) => {
    // Create rebalancer with only 2 nodes - no unused nodes available
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      placementConstraints: {spreadAcrossNodes: true},
    };

    // Not suboptimal because there are no unused nodes to spread to
    t.equal(rebalancer.isSuboptimalState(replicas, policy), false);
  });
});

test('UnifiedRebalancer - Rebalancing', async (t) => {
  initializeTestEnvironment();

  await t.test('skips rebalance when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, false);
    t.equal(result.reason, 'not_leader');
  });

  await t.test('returns no changes when already optimal', async (t) => {
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
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-3',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.equal(result.reason, 'no_changes_needed');

    rebalancer.shutdown();
  });

  await t.test('emits rebalanceComplete event', async (t) => {
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

    t.teardown(() => rebalancer.shutdown());

    const completeEvents = [];
    rebalancer.on('rebalanceComplete', (event) => completeEvents.push(event));

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.ok(completeEvents.length > 0);
    t.equal(completeEvents[0].entityId, 'partition-1');
    t.ok(result.moves.some((move) => move.operation === MoveType.ADD));
  });

  await t.test(
    'rebalance uses coordinator createOperation for published priority ' +
    'spread repair with no in-flight entity operations',
    async (t) => {
      const createOperationCalls = [];
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
            replica_count: 3,
          },
        ],
        services: [
          {
            service_id: 'cpub-r1',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-1',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/control_plane_publications-p1-r1',
          },
          {
            service_id: 'cpub-r2',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-1',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/control_plane_publications-p1-r2',
          },
          {
            service_id: 'cpub-r3',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-2',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-2/partition/control_plane_publications-p1-r3',
          },
        ],
        controlPlaneReadinessService: {
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
                  .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [],
            };
          },
          getCurrentPublishedMembershipEpochSync() {
            return 2;
          },
        },
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(move) {
            createOperationCalls.push(move);
            return {
              operationId: 'op-priority-spread-repair',
              replicaId: move.replicaId || 'cpub-r2',
            };
          },
        },
      });

      t.teardown(() => rebalancer.shutdown());

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.getConfiguredRebalanceBudget = async () => 4;
      rebalancer.getGlobalInFlightOperationCount = async () => 0;

      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          replicaCount: 3,
          minReplicaCount: 3,
          maxReplicaCount: 7,
          placementConstraints: {spreadAcrossNodes: true},
        },
      );

      t.equal(result.success, true, 'published priority repair should rebalance');
      t.equal(
        createOperationCalls.length,
        1,
        'priority spread repair should create one coordinator-owned operation',
      );
      t.equal(
        createOperationCalls[0]?.type,
        'REPLACE',
        'repair should replace an overrepresented replica instead of growing count',
      );
      t.equal(
        createOperationCalls[0]?.nodeId,
        'node-3',
        'repair should target the unused ready node',
      );
      t.equal(
        createOperationCalls[0]?.sourceNodeId,
        'node-1',
        'repair should remove from the overrepresented node',
      );
      t.equal(
        createOperationCalls[0]?.membershipPublicationEpoch,
        2,
        'repair should bind the created operation to the published membership epoch',
      );
      t.equal(
        result.moves.length,
        1,
        'rebalance should schedule one spread repair move',
      );
      t.equal(
        result.moves[0]?.operation,
        MoveType.REPLACE,
        'scheduled result should reflect the replacement repair move',
      );
    },
  );
});

test('UnifiedRebalancer - Statistics', async (t) => {
  initializeTestEnvironment();

  await t.test('returns statistics', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    const stats = rebalancer.getStats();

    t.equal(stats.entityId, 'partition-1');
    t.equal(stats.entityType, EntityType.PARTITION);
    t.equal(stats.isLeader, false);
    t.equal(stats.rebalanceCount, 0);
    t.equal(stats.initialized, true);
  });
});
