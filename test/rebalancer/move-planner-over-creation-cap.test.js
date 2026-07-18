/**
 * Falsifier: MovePlanner in-flight-aware over-creation cap.
 *
 * Pins the rolling-restart over-replication drain stall (gate 144654Z run3:
 * replica_operations-p1 driven to activeVoterCount=4 / target 3 with an
 * unpromotable surplus learner r6, blocked source removals never draining).
 * Once a SURPLUS of committed voters already exists (prior replacements promoted
 * but their sources have not drained), the planner kept minting MORE REPLACE
 * replacements on hopping target nodes, driving the partition further over
 * target and dead-locking learner promotion (replica-count-limit).
 *
 * Policy under test: while activeCount > target (a surplus that has not drained),
 * a priority partition must NOT mint new add-like moves — only drain. At/under
 * target a priority partition may mint one serial spread ADD; the next pass
 * drains the resulting target-plus-one surplus without a REPLACE handoff.
 *
 * RED before the cap (emits an over-target ADD/REPLACE); GREEN after.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {REBALANCER_ENTITY_TYPE, REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildReplicaInventorySnapshot} from '../../src/rebalancer/replica-inventory.js';

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

function createMoveStateProvider({currentReplicas = [], inFlightOperations = []} = {}) {
  return {
    getAvailableNodes: () => [],
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica?.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => inFlightOperations,
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function active(replicaId, nodeId) {
  return {
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
  };
}

// A voter that has just been promoted (raft_role=follower) but whose status
// column still lags at creating — the read-disagreement row. status===ACTIVE
// counting MISSES it; the authoritative raft-voter count SEES it.
function promotedVoterStatusLagging(replicaId, nodeId) {
  return {
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.CREATING,
    raft_role: 'follower',
  };
}

function plannerFor(provider, replicaInventoryBuilder) {
  return new MovePlanner({
    entityId: PRIORITY_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
    replicaInventoryBuilder,
  });
}

const TARGET_STATE = {
  targetReplicaCount: 3,
  targetNodes: ['node-1', 'node-2', 'node-3'],
  degraded: false,
};

test('MovePlanner in-flight-aware over-creation cap', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(resetEnv);

  await t.test(
    'while OVER target (surplus voters not yet drained) no new add-like move ' +
    'is minted — only drain',
    async (t) => {
      // 4 active for target 3 = a surplus already exists. node-3 is unoccupied,
      // so without the cap the planner would over-create a replacement there
      // (the r4->r5->r6 pile-up). The cap must block it and let the surplus on
      // node-1 drain instead.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
        active('r4', 'node-2'),
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addLike = moves.filter(
        (m) =>
          m.type === REBALANCER_MOVE_TYPE.ADD ||
          m.type === REBALANCER_MOVE_TYPE.REPLACE,
      );
      t.same(addLike, [],
        'no new ADD/REPLACE while a surplus of committed voters has not drained');
    },
  );

  await t.test('target selection and move calculation reuse one inventory capture',
    async (t) => {
      const currentReplicas = [active('r1', 'node-1')];
      let inventoryBuildCount = 0;
      const inventoryBuilder = (options) => {
        inventoryBuildCount += 1;
        return buildReplicaInventorySnapshot(options);
      };
      const planner = plannerFor(
        createMoveStateProvider({currentReplicas}),
        inventoryBuilder,
      );

      const targetState = await planner.calculateTargetState(
        currentReplicas,
        {targetReplicaCount: 3, minReplicaCount: 1, maxReplicaCount: 5},
      );
      planner.calculateMoves(currentReplicas, targetState);

      t.equal(inventoryBuildCount, 1,
        'one canonical capture serves target selection and move decisions');
    },
  );

  await t.test('unusable inventory suppresses increases but permits cleanup',
    async (t) => {
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
        active('r4', 'node-1'),
      ];
      const unusableBuilder = (options) => buildReplicaInventorySnapshot({
        ...options,
        inFlightOperationObservation: {
          ...options.inFlightOperationObservation,
          state: 'deferred',
        },
      });
      const planner = plannerFor(
        createMoveStateProvider({currentReplicas}),
        unusableBuilder,
      );

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);
      const topologyIncreases = moves.filter((move) =>
        move.type === REBALANCER_MOVE_TYPE.ADD ||
        move.type === REBALANCER_MOVE_TYPE.REPLACE,
      );

      t.same(topologyIncreases, [],
        'deferred operation visibility cannot authorize ADD/REPLACE');
      t.equal(moves.some((move) =>
        move.type === REBALANCER_MOVE_TYPE.REMOVE), true,
      'surplus cleanup remains available');
    },
  );

  await t.test(
    'promotion-window surplus (raft_role voter, status still lagging) trips ' +
    'the cap that status===ACTIVE counting misses',
    async (t) => {
      // The voter-ready-60s stall. Authoritative voters = 4 for target 3
      // (r1/r2/r3 active + r4 just promoted: raft_role=follower, status=creating),
      // but status===ACTIVE counting sees only 3, so the status-only cap stayed
      // blind and kept minting the replacement onto empty node-3 — piling the
      // group further over target until learner promotion dead-locked. node-3 is
      // unoccupied, so without the raft_role read the planner emits an over-target
      // add-like move. RED before the raft_role cap (activeCount=3, not >3 -> no
      // cap); GREEN after (activeVoterCount=4 > 3 -> cap fires).
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-2'),
        active('r3', 'node-1'),
        promotedVoterStatusLagging('r4', 'node-2'),
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addLike = moves.filter(
        (m) =>
          m.type === REBALANCER_MOVE_TYPE.ADD ||
          m.type === REBALANCER_MOVE_TYPE.REPLACE,
      );
      t.same(addLike, [],
        'no new add-like move while the authoritative raft-voter count is over ' +
        'target, even though status===ACTIVE reads at target');
    },
  );

  await t.test(
    'AT target (no surplus) spread restoration starts with one serial ADD',
    async (t) => {
      // 3 active concentrated on node-1 (at target, mis-spread). This
      // legitimately expands once; the next pass drains the redundant source.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.ADD),
        true,
        'at target with no surplus, serial spread expansion proceeds');
      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.REPLACE),
        false,
        'priority spread expansion avoids a replacement handoff');
    },
  );

  await t.test(
    'UNDER target still provisions a genuine deficit',
    async (t) => {
      const currentReplicas = [active('r1', 'node-1')];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.ADD),
        true,
        'genuine deficit (active 1 < target 3) still provisions');
    },
  );
});
