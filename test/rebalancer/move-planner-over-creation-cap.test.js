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
 * Policy under test: while activeCount > target (a surplus that has not
 * drained), a priority partition must NOT mint surplus-growing add-like moves.
 * Quest over-target-cap-spread-cure-wipe refined the cap's decision table:
 * when the distinct-node spread floor is UNMET (prioritySpreadGapOpen), the
 * cap retains exactly the gap-capped spread-cure ADDs onto nodes not already
 * hosting the partition (re-typed to the spread cure row) and refuses
 * everything else; when the floor is met, every ADD stays refused and only
 * drain proceeds — the pre-existing fail-closed floor. At/under target a
 * priority partition may mint one serial spread ADD; the next pass drains
 * the resulting target-plus-one surplus without a REPLACE handoff.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {MOVE_REASON, REBALANCER_ENTITY_TYPE, REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
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

function createMoveStateProvider({
  currentReplicas = [],
  inFlightOperations = [],
  pendingMoveReplicaIds = [],
} = {}) {
  const pendingMoves = new Set(pendingMoveReplicaIds);
  return {
    getAvailableNodes: () => [],
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica?.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => inFlightOperations,
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: (replicaId) => pendingMoves.has(replicaId),
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
    'OVER target with the distinct-node floor UNMET retains exactly the ' +
    'spread-cure ADD (quest over-target-cap-spread-cure-wipe)',
    async (t) => {
      // The archived ec-postfix cure-starvation shape: activeCount=4 for
      // target 3, all voters on 2 of 3 distinct target nodes ([S,S,S,J]).
      // The cap used to wipe the only floor-restoring ADD onto node-3 while
      // its own diagnostic logged prioritySpreadGapOpen:true. Sealed
      // behavior: the ADD onto the non-hosting node survives, re-typed to
      // the spread cure row; no surplus-growing move and no REPLACE
      // handoff is minted alongside it.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
        active('r4', 'node-2'),
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addMoves = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.ADD,
      );
      t.equal(addMoves.length, 1,
        'exactly the one floor-restoring spread-cure ADD survives the cap');
      t.equal(addMoves[0]?.nodeId, 'node-3',
        'the retained ADD targets the node not already hosting the partition');
      t.equal(addMoves[0]?.reason, MOVE_REASON.SPREAD_REPLICAS,
        'the retained ADD carries the spread cure row reason, not a ' +
        'count-increasing one');
      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.REPLACE),
        false,
        'the retained spread cure stays a serial ADD — no REPLACE handoff');
    },
  );

  await t.test(
    'OVER target with drains BLOCKED (pending moves on every replica) the ' +
    'cap still retains exactly the spread-cure ADD — the live starved-drain ' +
    'stall shape',
    async (t) => {
      // Live circle: the surplus sources cannot drain (their removals are
      // pending, gated on voter-ready spread) while the spread ADD used to
      // be wiped because the partition is over target. The retained ADD is
      // the only enforceable cure in this state.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
        active('r4', 'node-2'),
      ];
      const planner = plannerFor(createMoveStateProvider({
        currentReplicas,
        pendingMoveReplicaIds: ['r1', 'r2', 'r3', 'r4'],
      }));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.same(
        moves.map((m) => ({type: m.type, nodeId: m.nodeId, reason: m.reason})),
        [{
          type: REBALANCER_MOVE_TYPE.ADD,
          nodeId: 'node-3',
          reason: MOVE_REASON.SPREAD_REPLICAS,
        }],
        'exactly the spread-cure ADD onto the non-hosting node is emitted');
    },
  );

  await t.test(
    'OVER target with the distinct-node floor already MET refuses every ADD ' +
    '(fail-closed floor) and drains the surplus',
    async (t) => {
      // Already-spread over-target partition: 4 active on 3 distinct nodes
      // (node-4 hosts a stray replica outside the target set, so an ADD onto
      // free node-3 is still minted upstream). The floor is met, so surplus
      // growth stays refused even though the minted ADD targets a
      // non-hosting node — retention requires the OPEN gap, not merely a
      // fresh target node.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-2'),
        active('r4', 'node-4'),
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addLike = moves.filter(
        (m) =>
          m.type === REBALANCER_MOVE_TYPE.ADD ||
          m.type === REBALANCER_MOVE_TYPE.REPLACE,
      );
      t.same(addLike, [],
        'no ADD/REPLACE for an already-spread over-target partition');
      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.REMOVE),
        true,
        'surplus drain remains available once the floor is met');
    },
  );

  await t.test(
    'retention is gap-capped and refuses ADDs onto already-hosting nodes',
    async (t) => {
      // Gap arithmetic: target 4 over nodes [n1,n1,n2,n3] (distinct floor
      // min(4,3)=3), actives on {n1,n4} -> open gap 1. Upstream mints ADDs
      // onto n1 (already hosting), n2 and n3 (both fresh). The cap must
      // refuse the hosting-node ADD, retain ONE fresh-node ADD (gap cap),
      // and refuse the second fresh-node ADD as surplus growth beyond the
      // cure. Drains are pending-blocked to isolate the cap decision.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-4'),
        active('r3', 'node-4'),
        active('r4', 'node-4'),
        active('r5', 'node-4'),
      ];
      const planner = plannerFor(createMoveStateProvider({
        currentReplicas,
        pendingMoveReplicaIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      }));

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 4,
        targetNodes: ['node-1', 'node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.same(
        moves.map((m) => ({type: m.type, nodeId: m.nodeId, reason: m.reason})),
        [{
          type: REBALANCER_MOVE_TYPE.ADD,
          nodeId: 'node-2',
          reason: MOVE_REASON.SPREAD_REPLICAS,
        }],
        'exactly one gap-capped spread-cure ADD onto a fresh node; the ' +
        'already-hosting node-1 ADD and the beyond-gap node-3 ADD are refused');
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
      // group further over target until learner promotion dead-locked. The
      // raft_role read must still trip the cap (activeVoterCount=4 > 3).
      // Because the distinct-node floor is unmet (2 of 3), the cap retains
      // the single gap-capped spread-cure ADD onto node-3 — bounded, and
      // refused again once node-3 hosts (the pile-up cannot resume: an ADD
      // onto an already-hosting node is never retained).
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
      t.same(
        addLike.map((m) => ({type: m.type, nodeId: m.nodeId, reason: m.reason})),
        [{
          type: REBALANCER_MOVE_TYPE.ADD,
          nodeId: 'node-3',
          reason: MOVE_REASON.SPREAD_REPLICAS,
        }],
        'the raft-voter cap fires (no count-increasing or hosting-node move) ' +
        'and retains only the bounded spread-cure ADD onto the fresh node');
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
