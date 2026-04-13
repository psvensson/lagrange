/**
 * Unit tests for MovePlanner runtime-service entity support.
 *
 * Validates that MovePlanner plans ADD/REMOVE/REPLACE operations
 * for runtime_service entities using cluster-global replica_count
 * target semantics and existing placement policy inputs.
 *
 * Requirements: 3.1, 3.3, 4.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMoveStateProvider(options = {}) {
  const {
    nodes = [],
    currentReplicas = [],
    healthyReplicas = null,
    inFlightOperations = [],
    pendingMoves = new Set(),
    pendingAddNodes = new Set(),
  } = options;
  return {
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) => {
      if (healthyReplicas !== null) return healthyReplicas;
      return replicas.filter(
        (r) => r.status === ReplicaStatus.ACTIVE,
      );
    },
    getInFlightOperations: () => inFlightOperations,
    hasPendingMove: (id) => pendingMoves.has(id),
    hasPendingAddForNode: (id) => pendingAddNodes.has(id),
  };
}

// --- calculateTargetState for runtime_service ---

test('MovePlanner calculateTargetState for runtime_service', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('uses partition placement strategy for runtime services',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const planner = new MovePlanner({
        entityId: 'sys-postgres-wire',
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({nodes}),
      });
      const policy = {...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE};
      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetReplicaCount, 3);
      t.equal(result.targetNodes.length, 3);
      t.equal(result.degraded, false);
    });

  await t.test('enforces cluster-global target (not per-node)',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
        {node_id: 'n4', cpu_usage_percent: 40},
        {node_id: 'n5', cpu_usage_percent: 50},
      ];
      const planner = new MovePlanner({
        entityId: 'sys-postgres-wire',
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({nodes}),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
        targetReplicaCount: 3,
      };
      const result = await planner.calculateTargetState([], policy);

      // 3 total across cluster, not 3 per node
      t.equal(result.targetNodes.length, 3);
      t.equal(result.targetReplicaCount, 3);
      // Each node appears at most once
      const unique = new Set(result.targetNodes);
      t.equal(unique.size, 3);
    });

  await t.test('marks degraded when fewer nodes than target',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
      ];
      const planner = new MovePlanner({
        entityId: 'sys-postgres-wire',
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({nodes}),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
        targetReplicaCount: 3,
      };
      const result = await planner.calculateTargetState([], policy);

      t.equal(result.targetReplicaCount, 3);
      t.equal(result.targetNodes.length, 2);
      t.equal(result.degraded, true);
    });

  await t.test('sorts nodes by suitability using policy constraints',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 90, memory_usage_percent: 80},
        {node_id: 'n2', cpu_usage_percent: 10, memory_usage_percent: 10},
        {node_id: 'n3', cpu_usage_percent: 50, memory_usage_percent: 50},
      ];
      const planner = new MovePlanner({
        entityId: 'sys-postgres-wire',
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({nodes}),
      });
      const policy = {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
        targetReplicaCount: 2,
      };
      const result = await planner.calculateTargetState([], policy);

      // Least loaded nodes should be selected first
      t.equal(result.targetNodes.length, 2);
      t.ok(result.targetNodes.includes('n2'));
      t.ok(result.targetNodes.includes('n3'));
    });
});

// --- calculateMoves ADD/REMOVE/REPLACE for runtime_service ---

test('MovePlanner calculateMoves for runtime_service', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('generates ADD moves when under target', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];
    const currentReplicas = [
      {
        service_id: 'sys-postgres-wire',
        node_id: 'n1',
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const planner = new MovePlanner({
      entityId: 'sys-postgres-wire',
      entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      moveStateProvider: createMoveStateProvider({
        nodes,
        currentReplicas,
      }),
    });
    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['n1', 'n2', 'n3'],
      degraded: false,
    };
    const moves = planner.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter(
      (m) => m.type === REBALANCER_MOVE_TYPE.ADD,
    );
    t.equal(addMoves.length, 2);
    const addNodeIds = addMoves.map((m) => m.nodeId).sort();
    t.same(addNodeIds, ['n2', 'n3']);
  });

  await t.test('generates REMOVE moves when over target', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
    ];
    const currentReplicas = [
      {
        service_id: 'r1',
        node_id: 'n1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r2',
        node_id: 'n2',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r3',
        node_id: 'n3',
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const planner = new MovePlanner({
      entityId: 'sys-postgres-wire',
      entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      moveStateProvider: createMoveStateProvider({
        nodes,
        currentReplicas,
      }),
    });
    const targetState = {
      targetReplicaCount: 2,
      targetNodes: ['n1', 'n2'],
      degraded: false,
    };
    const moves = planner.calculateMoves(currentReplicas, targetState);

    const removeMoves = moves.filter(
      (m) => m.type === REBALANCER_MOVE_TYPE.REMOVE,
    );
    t.equal(removeMoves.length, 1);
    t.equal(removeMoves[0].nodeId, 'n3');
    t.equal(removeMoves[0].reason, MOVE_REASON.NODE_NOT_IN_TARGET);
  });

  await t.test('generates REPLACE when node changes', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];
    const currentReplicas = [
      {
        service_id: 'r1',
        node_id: 'n1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r2',
        node_id: 'n2',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r3',
        node_id: 'n4',
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const planner = new MovePlanner({
      entityId: 'sys-postgres-wire',
      entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      moveStateProvider: createMoveStateProvider({
        nodes,
        currentReplicas,
      }),
    });
    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['n1', 'n2', 'n3'],
      degraded: false,
    };
    const moves = planner.calculateMoves(currentReplicas, targetState);

    const replaceMoves = moves.filter(
      (m) => m.type === REBALANCER_MOVE_TYPE.REPLACE,
    );
    t.equal(replaceMoves.length, 1);
    t.equal(replaceMoves[0].nodeId, 'n3');
    t.equal(replaceMoves[0].sourceNodeId, 'n4');
    t.equal(replaceMoves[0].reason, MOVE_REASON.REPLACE_REPLICA);
  });

  await t.test('removes failed replicas', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];
    const currentReplicas = [
      {
        service_id: 'r1',
        node_id: 'n1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r2',
        node_id: 'n2',
        status: ReplicaStatus.FAILED,
      },
      {
        service_id: 'r3',
        node_id: 'n3',
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const planner = new MovePlanner({
      entityId: 'sys-postgres-wire',
      entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      moveStateProvider: createMoveStateProvider({
        nodes,
        currentReplicas,
      }),
    });
    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['n1', 'n2', 'n3'],
      degraded: false,
    };
    const moves = planner.calculateMoves(currentReplicas, targetState);

    const failedRemoves = moves.filter(
      (m) => m.type === REBALANCER_MOVE_TYPE.REMOVE &&
        m.reason === MOVE_REASON.REPLICA_FAILED,
    );
    t.equal(failedRemoves.length, 1);
    t.equal(failedRemoves[0].replicaId, 'r2');
  });

  await t.test('returns empty when in-flight operations exist',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          service_id: 'r1',
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: 'sys-postgres-wire',
        entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
          inFlightOperations: [
            {
              operation_id: 'op-1',
              entity_type: 'runtime_service',
              entity_id: 'sys-postgres-wire',
              status: 'pending',
              target_node_id: 'n2',
            },
          ],
        }),
      });
      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['n1', 'n2', 'n3'],
        degraded: false,
      };
      const moves = planner.calculateMoves(
        currentReplicas, targetState,
      );
      t.equal(moves.length, 0);
    });

  await t.test('priority control-plane partitions keep planning with in-flight operations',
    async (t) => {
      const nodes = [
        {node_id: 'n1', cpu_usage_percent: 10},
        {node_id: 'n2', cpu_usage_percent: 20},
        {node_id: 'n3', cpu_usage_percent: 30},
      ];
      const currentReplicas = [
        {
          replica_id: 'r1',
          service_id: 'r1',
          node_id: 'n1',
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: 'nodes-p1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          nodes,
          currentReplicas,
          inFlightOperations: [
            {
              operation_id: 'op-priority-pending',
              type: 'ADD',
              partition_id: 'nodes-p1',
              entity_type: 'partition',
              entity_id: 'nodes-p1',
              status: 'pending',
              target_node_id: 'n2',
            },
          ],
          pendingAddNodes: new Set(['n2']),
        }),
      });
      planner.isControlPlanePriorityPartition = () => true;

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['n1', 'n2', 'n3'],
        degraded: false,
      };
      const moves = planner.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((move) =>
        move.type === REBALANCER_MOVE_TYPE.ADD,
      );

      t.equal(
        addMoves.length,
        1,
        'priority planning should continue and schedule the remaining add',
      );
      t.equal(addMoves[0]?.nodeId, 'n3');
    });

  await t.test('returns no moves when at target', async (t) => {
    const nodes = [
      {node_id: 'n1', cpu_usage_percent: 10},
      {node_id: 'n2', cpu_usage_percent: 20},
      {node_id: 'n3', cpu_usage_percent: 30},
    ];
    const currentReplicas = [
      {
        service_id: 'r1',
        node_id: 'n1',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r2',
        node_id: 'n2',
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'r3',
        node_id: 'n3',
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const planner = new MovePlanner({
      entityId: 'sys-postgres-wire',
      entityType: REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE,
      moveStateProvider: createMoveStateProvider({
        nodes,
        currentReplicas,
      }),
    });
    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['n1', 'n2', 'n3'],
      degraded: false,
    };
    const moves = planner.calculateMoves(currentReplicas, targetState);
    t.equal(moves.length, 0);
  });
});
