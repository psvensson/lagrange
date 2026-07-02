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

  await t.test(
    'the replaceMoves>0 leak still emits the bare ADD',
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
        'the replaceMoves>0 leak still emits the bare ADD (count-neutral ' +
        'reconciliation only defers when no REPLACE paired this round)');
    },
  );
});
