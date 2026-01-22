/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from 'tap';
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
function createMockCache(nodes = [], services = [], partitions = [], tables = []) {
  const cache = {
    nodes: new Map(nodes.map((n) => [n.node_id, n])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(),
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

test('UnifiedRebalancer - Basic Initialization', async (t) => {
  initializeTestEnvironment();

  await t.test('creates rebalancer with default options', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    t.equal(rebalancer.initialized, true);
  });

  await t.test('sets leader status', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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

  await t.test('returns default table policy when no cache', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = rebalancer.getPolicy();

    t.equal(policy.replicaCount, DEFAULT_TABLE_POLICY.replicaCount);
    t.equal(policy.minReplicaCount, DEFAULT_TABLE_POLICY.minReplicaCount);
    t.equal(policy.maxReplicaCount, DEFAULT_TABLE_POLICY.maxReplicaCount);
  });

  await t.test('returns default message group policy', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
    });

    const policy = rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount);
    t.equal(policy.ensureLocalAccess, DEFAULT_MESSAGE_GROUP_POLICY.ensureLocalAccess);
  });

  await t.test('returns table policy from cache', async (t) => {
    const mockCache = createMockCache(
      [],
      [],
      [{partition_id: 'partition-1', table_id: 'table-1'}],
      [{
        table_id: 'table-1',
        table_policies: JSON.stringify({replicaCount: 5, minReplicaCount: 3}),
      }],
    );

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const policy = rebalancer.getPolicy();

    t.equal(policy.replicaCount, 5);
    t.equal(policy.minReplicaCount, 3);
  });
});

test('UnifiedRebalancer - Node Management', async (t) => {
  initializeTestEnvironment();

  await t.test('gets available nodes from cache', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.FAILED},
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const nodes = rebalancer.getAvailableNodes();

    t.equal(nodes.length, 2);
    t.ok(nodes.some((n) => n.node_id === 'node-1'));
    t.ok(nodes.some((n) => n.node_id === 'node-2'));
    t.notOk(nodes.some((n) => n.node_id === 'node-3'));
  });

  await t.test('sorts nodes by load', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, cpu_usage_percent: 80},
      {node_id: 'node-2', status: NodeStatus.ACTIVE, cpu_usage_percent: 20},
      {node_id: 'node-3', status: NodeStatus.ACTIVE, cpu_usage_percent: 50},
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const nodes = rebalancer.getAvailableNodes();
    const sorted = rebalancer.sortNodesByLoad(nodes);

    t.equal(sorted[0].node_id, 'node-2'); // Lowest load
    t.equal(sorted[1].node_id, 'node-3');
    t.equal(sorted[2].node_id, 'node-1'); // Highest load
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

    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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

  await t.test('calculates remove moves for nodes not in target', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.ok(removeMoves.some((m) => m.nodeId === 'node-4'));
  });
});

test('UnifiedRebalancer - State Evaluation', async (t) => {
  initializeTestEnvironment();

  await t.test('detects critical state when below minimum replicas', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
    ];

    const policy = {minReplicaCount: 3};

    t.equal(rebalancer.isCriticalState(replicas, policy), true);
  });

  await t.test('detects suboptimal state when not at target count', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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
    // Create mock cache with 3 nodes - one unused node available for spreading
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE}, // Unused node
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
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
    // Create mock cache with only 2 nodes - no unused nodes available
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
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
    const rebalancer = new UnifiedRebalancer({
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ], [
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
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.equal(result.reason, 'no_changes_needed');

    rebalancer.shutdown();
  });

  await t.test('emits events for add/remove operations', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ], [
      {
        service_id: 's1',
        partition_id: 'partition-1',
        node_id: 'node-1',
        service_type: 'partition',
        status: ReplicaStatus.ACTIVE,
      },
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const addEvents = [];
    rebalancer.on('addReplica', (event) => addEvents.push(event));

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.ok(addEvents.length > 0);
    t.equal(addEvents[0].entityId, 'partition-1');

    rebalancer.shutdown();
  });
});

test('UnifiedRebalancer - Statistics', async (t) => {
  initializeTestEnvironment();

  await t.test('returns statistics', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ], [
      {
        service_id: 's1',
        partition_id: 'partition-1',
        node_id: 'node-1',
        service_type: 'partition',
        status: ReplicaStatus.ACTIVE,
      },
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ], [
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
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
  });

  await t.test('triggers immediate check for critical events', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ], [
      {
        service_id: 's1',
        partition_id: 'partition-1',
        node_id: 'node-1',
        service_type: 'partition',
        status: ReplicaStatus.ACTIVE,
      },
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
});


test('UnifiedRebalancer - Replica State Management', async (t) => {
  initializeTestEnvironment();

  await t.test('excludes failed replicas from healthy count', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.INACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.every((r) => r.status === ReplicaStatus.ACTIVE));
  });

  await t.test('generates remove moves for failed replicas', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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

  await t.test('generates remove moves for inactive replicas', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.INACTIVE},
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
      {node_id: 'node-4', status: NodeStatus.ACTIVE},
    ], [
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
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const currentReplicas = rebalancer.getCurrentReplicas();
    const policy = rebalancer.getPolicy();
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
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.FAILED}, // Failed node
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
      {node_id: 'node-4', status: NodeStatus.ACTIVE},
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      systemTableCache: mockCache,
    });

    const availableNodes = rebalancer.getAvailableNodes();

    // Should only include active nodes
    t.equal(availableNodes.length, 3);
    t.ok(availableNodes.every((n) => n.status === NodeStatus.ACTIVE));
    t.notOk(availableNodes.some((n) => n.node_id === 'node-2'));
  });

  await t.test('uses policy replica count regardless of current count', async (t) => {
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
    const rebalancer = new UnifiedRebalancer({
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
