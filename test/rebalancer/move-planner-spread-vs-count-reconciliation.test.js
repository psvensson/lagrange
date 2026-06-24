/**
 * Falsifier: MovePlanner spread-vs-count reconciliation.
 *
 * Pins the run4 over-target loop fix. In the rolling-restart gate, a
 * priority control-plane partition at its count target (3 active) but
 * spread-unsatisfied (concentrated on 2 nodes) emitted a PURE
 * count-increasing ADD (3->4) whenever the count-reducing surplus REMOVE
 * for that cycle was suppressed because its source replicas already had a
 * surplus-drain in flight (hasPendingMove). That spread-driven ADD
 * re-created surplus that fought the pending count-reducing REMOVE,
 * keeping the partition permanently over its voter target (132s).
 *
 * Policy under test: a count-increasing ADD that is NOT consumed into a
 * count-neutral REPLACE must not fire when the partition is already
 * at/over its replica-count target. Spread is still served by REPLACEs;
 * genuine under-target ADDs are unaffected.
 *
 * RED before the fix (emits an ADD); GREEN after (no ADD).
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

// A priority control-plane partition (the run4 victim class), so the
// cleanup-only-while-pending bypass does NOT gate ADDs for it.
const PRIORITY_PARTITION_ID = 'sql_transaction_participants-p1';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Move-state provider with hasPendingMove keyed on a replica-id set.
 * @param {Object} options - Provider options.
 * @return {Object} Move-state provider.
 */
function createMoveStateProvider(options = {}) {
  const {
    availableNodes = [],
    currentReplicas = [],
    pendingMoveReplicaIds = new Set(),
  } = options;
  return {
    getAvailableNodes: () => availableNodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica?.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: (replicaId) => pendingMoveReplicaIds.has(replicaId),
    hasPendingAddForNode: () => false,
  };
}

test('MovePlanner spread-vs-count reconciliation', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(resetEnv);

  await t.test(
    'does NOT emit a count-increasing ADD when already at target and the ' +
    'count-reducing REMOVE is suppressed by an in-flight surplus drain',
    async (t) => {
      // 3 active, concentrated on 2 nodes (spread unsatisfied), target 3.
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          currentReplicas,
          // The surplus-drain REMOVE for the over-represented node-1 is in
          // flight, so both node-1 replicas are skipped as REMOVE candidates.
          pendingMoveReplicaIds: new Set(['r1', 'r2']),
        }),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      const addMoves = moves.filter(
        (move) => move.type === REBALANCER_MOVE_TYPE.ADD,
      );
      t.same(addMoves, [],
        'no count-increasing ADD while already at target with a pending drain');
    },
  );

  await t.test(
    'still emits a count-neutral REPLACE for spread when no drain is pending',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({currentReplicas}),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.equal(
        moves.some((move) => move.type === REBALANCER_MOVE_TYPE.REPLACE),
        true,
        'spread is served by a count-neutral REPLACE');
      t.equal(
        moves.some((move) => move.type === REBALANCER_MOVE_TYPE.ADD),
        false,
        'no pure count-increasing ADD');
    },
  );

  await t.test(
    'still emits a legitimate ADD when genuinely under target',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({currentReplicas}),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.equal(
        moves.some(
          (move) =>
            move.type === REBALANCER_MOVE_TYPE.ADD &&
            move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT,
        ),
        true,
        'genuine under-target ADD still planned (active 2 < target 3)');
    },
  );

  // ---- Coupled-loop re-grounding (gate stat-gate-20260624T134940Z) ----
  // The existing reconciliation guard only defers the bare ADD when
  // replaceMoves.length === 0 AND active>=target. The rolling-restart
  // cascade defeats BOTH preconditions, leaking a count-increasing ADD that
  // over-replicates a critical-system partition (3->4->5->6) and churns raft
  // leadership. The default-off LAGRANGE_PR_COUNT_NEUTRAL_SPREAD_RESTORE lever
  // closes the two gaps: count by PHYSICAL occupancy (robust to a transiently
  // creating/syncing colocated copy) and defer leftover over-target ADDs even
  // when some REPLACEs paired this round.
  const COUNT_NEUTRAL_FLAG = 'LAGRANGE_PR_COUNT_NEUTRAL_SPREAD_RESTORE';

  await t.test(
    'flag-on: defers leftover over-target ADD even when a REPLACE paired ' +
    'this round (replaceMoves.length > 0 leak)',
    async (t) => {
      // 3 active colocated on node-1 (target 3). One surplus copy (r2) has a
      // surplus-drain already in flight, so only r1 survives as a REMOVE
      // candidate -> 1 REPLACE (r1 -> node-2) + 1 leftover bare ADD (node-3).
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];
      const moveStateProvider = createMoveStateProvider({
        currentReplicas,
        pendingMoveReplicaIds: new Set(['r2']),
      });
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider,
      });

      process.env[COUNT_NEUTRAL_FLAG] = 'true';
      let moves;
      try {
        moves = planner.calculateMoves(currentReplicas, {
          targetReplicaCount: 3,
          targetNodes: ['node-1', 'node-2', 'node-3'],
          degraded: false,
        });
      } finally {
        delete process.env[COUNT_NEUTRAL_FLAG];
      }

      const overTargetAdds = moves.filter(
        (move) =>
          move.type === REBALANCER_MOVE_TYPE.ADD &&
          move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT,
      );
      t.same(overTargetAdds, [],
        'no count-increasing ADD leaks past the paired REPLACE (count-neutral)');
    },
  );

  await t.test(
    'flag-on: defers over-target ADD when a colocated copy is transiently ' +
    'creating (active < target but physical occupancy >= target)',
    async (t) => {
      // 3 physical copies colocated on node-1, but r2 is CREATING (not yet
      // ACTIVE) during the cascade. activePlacementReplicas = 2 < target 3, so
      // the active-count guard misses it; physical occupancy = 3 >= target.
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.CREATING},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({currentReplicas}),
      });

      process.env[COUNT_NEUTRAL_FLAG] = 'true';
      let moves;
      try {
        moves = planner.calculateMoves(currentReplicas, {
          targetReplicaCount: 3,
          targetNodes: ['node-1', 'node-2', 'node-3'],
          degraded: false,
        });
      } finally {
        delete process.env[COUNT_NEUTRAL_FLAG];
      }

      const overTargetAdds = moves.filter(
        (move) =>
          move.type === REBALANCER_MOVE_TYPE.ADD &&
          move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT,
      );
      t.same(overTargetAdds, [],
        'no count-increasing ADD while physically at target (transient ' +
        'non-active colocated copy does not open the floodgate)');
    },
  );

  await t.test(
    'flag-on: genuine under-target ADD still planned (physical < target)',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({currentReplicas}),
      });

      process.env[COUNT_NEUTRAL_FLAG] = 'true';
      let moves;
      try {
        moves = planner.calculateMoves(currentReplicas, {
          targetReplicaCount: 3,
          targetNodes: ['node-1', 'node-2', 'node-3'],
          degraded: false,
        });
      } finally {
        delete process.env[COUNT_NEUTRAL_FLAG];
      }

      t.equal(
        moves.some(
          (move) =>
            move.type === REBALANCER_MOVE_TYPE.ADD &&
            move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT,
        ),
        true,
        'under-replication (physical 2 < target 3) still adds — liveness kept');
    },
  );

  await t.test(
    'flag-off byte-identical: the replaceMoves>0 leak still emits the bare ADD',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: PRIORITY_PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          currentReplicas,
          pendingMoveReplicaIds: new Set(['r2']),
        }),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.equal(
        moves.some(
          (move) =>
            move.type === REBALANCER_MOVE_TYPE.ADD &&
            move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT,
        ),
        true,
        'flag-off preserves the prior (leaky) behavior exactly');
    },
  );
});
