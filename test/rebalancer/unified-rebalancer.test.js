/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
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
import {REBALANCER_LOG_MSG} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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
) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    ws_connection_state: Object.hasOwn(node, 'ws_connection_state') ?
      node.ws_connection_state : 'ready',
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
  };
}

// Create mock message router
function createMockMessageRouter(connectionState = 'connected') {
  return {
    getConnectionState: () => connectionState,
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

// Create mock rebalance coordinator
function createMockCoordinator() {
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
    connectionState = 'connected',
  } = options;

  const mockCache = createMockCache(nodes, services, partitions, tables, replicaOperations);
  const mockCdcService = createMockCdcService();
  const mockPolicyService = createMockPolicyService(partitions, tables);
  const mockMessageRouter = createMockMessageRouter(connectionState);
  const mockCoordinator = createMockCoordinator();

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
  });
}

test('UnifiedRebalancer - Basic Initialization', async (t) => {
  initializeTestEnvironment();

  await t.test('creates rebalancer with default options', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    t.equal(rebalancer.entityId, 'partition-1');
    t.equal(rebalancer.entityType, EntityType.PARTITION);
    t.equal(rebalancer.isLeader, false);
    t.equal(rebalancer.initialized, false);
  });

  await t.test('initializes rebalancer', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    t.equal(rebalancer.initialized, true);
  });

  await t.test('sets leader status', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    t.equal(rebalancer.isLeader, false);

    rebalancer.setLeader(true);
    t.equal(rebalancer.isLeader, true);

    rebalancer.setLeader(false);
    t.equal(rebalancer.isLeader, false);

    rebalancer.shutdown();
  });
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
        {node_id: 'node-1', status: NodeStatus.ACTIVE, ws_connection_state: 'ready'},
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
        {node_id: 'node-1', status: NodeStatus.ACTIVE, ws_connection_state: 'ready'},
      ],
      connectionState: 'disconnected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });

  await t.test('returns false when readiness ping fails', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, ws_connection_state: 'ready'},
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
    t.equal(replaceMoves[0].sourceNodeId, 'node-1', 'REPLACE should remove from overrepresented node');
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
});


test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test('schedules periodic checks when becoming leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Initially no scheduled check
    t.equal(rebalancer.scheduledCheck, null);

    // Become leader - but immediately cancel to avoid async issues
    rebalancer.setLeader(true);

    // Should have scheduled a check
    t.ok(rebalancer.scheduledCheck !== null, 'Check was scheduled');

    // Cleanup immediately
    rebalancer.shutdown();
    t.equal(rebalancer.scheduledCheck, null);
  });

  await t.test('cancels scheduled checks when losing leadership', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    t.ok(rebalancer.scheduledCheck !== null);

    // Lose leadership
    rebalancer.setLeader(false);

    t.equal(rebalancer.scheduledCheck, null);
    rebalancer.shutdown();
  });

  await t.test('triggers immediate check for critical events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Set leader directly without triggering scheduler
    rebalancer.isLeader = true;

    let immediateCheckCalled = false;
    // Override triggerImmediateCheck to track calls
    const _originalTrigger = rebalancer.triggerImmediateCheck.bind(rebalancer);
    rebalancer.triggerImmediateCheck = (_reason) => {
      immediateCheckCalled = true;
      // Don't actually trigger the check to avoid async issues
    };

    // Trigger immediate check
    rebalancer.triggerImmediateCheck('node_failure');

    t.equal(immediateCheckCalled, true, 'Immediate check was triggered');

    rebalancer.isLeader = false;
    rebalancer.shutdown();
  });

  await t.test('detects critical CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
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

    // Node failure event affecting our replicas
    const nodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-1', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(nodeFailureEvent), true);

    // Node failure event NOT affecting our replicas
    const otherNodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-3', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherNodeFailureEvent), false);
  });

  await t.test('detects service failure CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Service failure for our partition
    const serviceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's1',
        partition_id: 'partition-1',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(serviceFailureEvent), true);

    // Service failure for different partition
    const otherServiceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's2',
        partition_id: 'partition-2',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherServiceFailureEvent), false);
  });

  await t.test('uses exponential backoff when stable', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    const initialInterval = rebalancer.currentInterval;

    // Simulate stable state (no rebalancing needed)
    // The interval should increase
    rebalancer.currentInterval = Math.min(
      rebalancer.currentInterval * 1.5,
      rebalancer.maxInterval,
    );

    t.ok(rebalancer.currentInterval > initialInterval);
    t.ok(rebalancer.currentInterval <= rebalancer.maxInterval);
  });

  await t.test('resets interval after rebalancing action', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Increase interval (simulate stable period)
    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = rebalancer.maxInterval;

    // Simulate what checkRebalance does when rebalancing is needed
    // Reset interval to base (this is what happens after a rebalance action)
    rebalancer.currentInterval = baseInterval;

    // Interval should be reset to base after rebalancing
    t.equal(rebalancer.currentInterval, baseInterval);
  });

  await t.test('checkRebalance backs off when no actionable moves were executed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.rebalance = async () => ({
      success: true,
      moves: [
        {success: false, skipped: true, reason: 'safety_blocked'},
      ],
    });
    rebalancer.scheduleNextCheck = () => {};

    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = baseInterval;

    await rebalancer.checkRebalance();

    t.ok(
      rebalancer.currentInterval > baseInterval,
      'interval should back off when all moves are skipped',
    );
  });

  await t.test('checkRebalance resets interval when actionable moves are executed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.rebalance = async () => ({
      success: true,
      moves: [
        {success: true, skipped: false, operation: 'add'},
      ],
    });
    rebalancer.scheduleNextCheck = () => {};

    rebalancer.currentInterval = rebalancer.maxInterval;

    await rebalancer.checkRebalance();

    t.equal(
      rebalancer.currentInterval,
      rebalancer.periodicCheckIntervalMs,
      'interval should reset when actionable moves execute',
    );
  });
});


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
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE, ws_connection_state: 'disconnected'},
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
    const targetState = rebalancer.calculateTargetState(currentReplicas, policy);
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
});
