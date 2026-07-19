import {test} from '../../src/test-helpers/tap.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  buildEffectivePlacement,
  selectSerialPriorityMove,
} from '../../src/rebalancer/effective-placement-serial-priority-planner.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  buildReplicaInventorySnapshot,
} from '../../src/rebalancer/replica-inventory.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const PARTITION_ID = 'schema_operations-p1';
const TARGET_STATE = Object.freeze({
  targetReplicaCount: 3,
  targetNodes: Object.freeze(['node-1', 'node-2', 'node-3']),
});

function buildInventory(rows, operations = [], options = {}) {
  return buildReplicaInventorySnapshot({
    entityType: 'partition',
    entityId: PARTITION_ID,
    capturedAtMs: 1000,
    committedRowsObservation: {
      state: options.committedState || 'present',
      rows,
      observedAtMs: 1000,
    },
    inFlightOperationObservation: {
      state: options.operationState ||
        (operations.length > 0 ? 'present' : 'empty'),
      operations,
      observedAtMs: 1000,
    },
  });
}

function active(replicaId, nodeId) {
  return {
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
  };
}

function candidate(type, reason, extra = {}) {
  return {type, reason, ...extra};
}

test('EffectivePlacement is one immutable priority-planning projection', (t) => {
  const inventory = buildInventory([
    active('r1', 'node-1'),
    active('r2', 'node-1'),
    active('r3', 'node-2'),
  ]);
  const placement = buildEffectivePlacement({
    inventory,
    targetState: TARGET_STATE,
    unresolvedOperations: [],
  });

  t.equal(Object.isFrozen(placement), true, 'projection is immutable');
  t.equal(placement.activeReplicaCount, 3, 'active count has one owner');
  t.equal(placement.effectiveReplicaCount, 3, 'effective count uses inventory');
  t.equal(placement.activeDistinctNodeCount, 2, 'distinct placement is projected');
  t.equal(placement.requiredDistinctNodeCount, 3, 'spread target is projected');
  t.equal(placement.spreadGap, 1, 'concentration is explicit');
  t.equal(placement.deficitCount, 0, 'at-target concentration is not a deficit');
  t.equal(placement.surplusCount, 0, 'at-target concentration is not surplus');
  t.equal(placement.unresolvedTransitionCount, 0, 'no workflow is in flight');
  t.equal(placement.topologyIncreaseUsable, true, 'coherent inventory can expand');
  t.end();
});

test('serial priority owner applies one total action precedence', (t) => {
  const placement = buildEffectivePlacement({
    inventory: buildInventory([
      active('r1', 'node-1'),
      active('r2', 'node-2'),
    ]),
    targetState: TARGET_STATE,
    unresolvedOperations: [],
  });
  const failedRemove = candidate(
    REBALANCER_MOVE_TYPE.REMOVE,
    MOVE_REASON.REPLICA_FAILED,
    {replicaId: 'failed-r'},
  );
  const deficitAdd = candidate(
    REBALANCER_MOVE_TYPE.ADD,
    MOVE_REASON.INCREASE_REPLICA_COUNT,
    {nodeId: 'node-3'},
  );
  const spreadAdd = candidate(
    REBALANCER_MOVE_TYPE.ADD,
    MOVE_REASON.SPREAD_REPLICAS,
    {nodeId: 'node-3'},
  );
  const safeRemove = candidate(
    REBALANCER_MOVE_TYPE.REMOVE,
    MOVE_REASON.SPREAD_REPLICAS,
    {replicaId: 'surplus-r'},
  );
  const replace = candidate(
    REBALANCER_MOVE_TYPE.REPLACE,
    MOVE_REASON.SPREAD_REPLICAS,
    {replicaId: 'source-r', nodeId: 'node-3'},
  );

  const precedence = [
    {
      candidates: [replace, safeRemove, spreadAdd, deficitAdd, failedRemove],
      expected: failedRemove,
    },
    {
      candidates: [replace, safeRemove, spreadAdd, deficitAdd],
      expected: deficitAdd,
    },
    {
      candidates: [replace, safeRemove, spreadAdd],
      expected: spreadAdd,
    },
    {
      candidates: [replace, safeRemove],
      expected: safeRemove,
    },
    {
      candidates: [replace],
      expected: replace,
    },
  ];

  for (const row of precedence) {
    const decision = selectSerialPriorityMove({
      placement,
      candidates: row.candidates,
    });
    t.same(decision?.move, row.expected);
    t.equal(decision?.newMoveCount, 1, 'one candidate wins each tick');
  }
  t.end();
});

test('an unresolved REMOVE workflow is progressed without a companion move', (t) => {
  const stoppingRemove = {
    operation_id: '8ee9d56b-1eba-4c31-95b8-364b252945e0',
    operation_type: 'REMOVE',
    status: 'removing',
    workflow_step: 'STOPPING',
    partition_id: PARTITION_ID,
    source_replica_id: 'r4',
    source_node_id: 'node-3',
  };
  const placement = buildEffectivePlacement({
    inventory: buildInventory([
      active('r1', 'node-1'),
      active('r2', 'node-2'),
      {
        replica_id: 'r4',
        node_id: 'node-3',
        status: ReplicaStatus.REMOVING,
        raft_role: 'follower',
      },
    ], [stoppingRemove]),
    targetState: TARGET_STATE,
    unresolvedOperations: [stoppingRemove],
  });
  const decision = selectSerialPriorityMove({
    placement,
    candidates: [
      candidate(
        REBALANCER_MOVE_TYPE.ADD,
        MOVE_REASON.INCREASE_REPLICA_COUNT,
        {nodeId: 'node-3'},
      ),
      candidate(
        REBALANCER_MOVE_TYPE.REPLACE,
        MOVE_REASON.SPREAD_REPLICAS,
        {replicaId: 'r1', nodeId: 'node-3'},
      ),
    ],
  });

  t.equal(placement.activeReplicaCount, 2, 'REMOVE shape exposes two ready replicas');
  t.equal(placement.spreadGap, 1, 'REMOVE shape exposes the live spread gap');
  t.equal(placement.unresolvedTransitionCount, 1, 'workflow is explicit');
  t.equal(decision.move, null, 'no new placement move accompanies the workflow');
  t.equal(decision.action, 'progress_existing_transition');
  t.same(
    decision.operationIds,
    ['8ee9d56b-1eba-4c31-95b8-364b252945e0'],
    'decision points at the durable operation to progress',
  );
  t.end();
});

test('unavailable inventory fails closed only for topology-increasing moves', (t) => {
  const placement = buildEffectivePlacement({
    inventory: buildInventory([], [], {
      committedState: 'unavailable',
      operationState: 'unavailable',
    }),
    targetState: TARGET_STATE,
    unresolvedOperations: [],
  });
  const failedRemove = candidate(
    REBALANCER_MOVE_TYPE.REMOVE,
    MOVE_REASON.REPLICA_FAILED,
    {replicaId: 'failed-r'},
  );
  const decision = selectSerialPriorityMove({
    placement,
    candidates: [
      candidate(
        REBALANCER_MOVE_TYPE.ADD,
        MOVE_REASON.INCREASE_REPLICA_COUNT,
        {nodeId: 'node-3'},
      ),
      failedRemove,
    ],
  });

  t.equal(placement.topologyIncreaseUsable, false);
  t.same(decision.move, failedRemove, 'failed cleanup remains eligible');
  t.equal(
    selectSerialPriorityMove({
      placement,
      candidates: [
        candidate(
          REBALANCER_MOVE_TYPE.ADD,
          MOVE_REASON.INCREASE_REPLICA_COUNT,
          {nodeId: 'node-3'},
        ),
      ],
    }).move,
    null,
    'topology increase remains fail-closed',
  );
  t.end();
});

test('MovePlanner priority path emits only the serial owner decision', (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const currentReplicas = [
    active('r1', 'node-1'),
    active('r2', 'node-2'),
    {
      replica_id: 'failed-r',
      node_id: 'node-1',
      status: ReplicaStatus.FAILED,
      raft_role: 'follower',
    },
  ];
  const moveStateProvider = {
    getAvailableNodes: () => TARGET_STATE.targetNodes.map(
      (nodeId) => ({node_id: nodeId}),
    ),
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getTopologyBlockingInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };

  try {
    const planner = new MovePlanner({
      entityId: PARTITION_ID,
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider,
    });
    const moves = planner.calculateMoves(currentReplicas, {
      ...TARGET_STATE,
      degraded: false,
    });

    t.matchOnly(moves, [{
      type: REBALANCER_MOVE_TYPE.REMOVE,
      replicaId: 'failed-r',
      nodeId: 'node-1',
      reason: MOVE_REASON.REPLICA_FAILED,
    }], 'failed cleanup wins without a parallel deficit ADD');
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
  t.end();
});
