/**
 * Falsifier: MovePlanner critical-partition REPLACE serialization cap.
 *
 * Pins the rolling-restart REPLACE-churn standoff (gate 202310Z run1:
 * sql_transactions-p1 accumulated 10+ distinct REPLACE op ids — 3 concurrent at
 * peak, each a different source/target — over a ~54s burst across ticks; their
 * source removals then mutually deferred on the per-partition reconfiguration
 * serialization lock for ~114s, holding the partition over target until
 * convergence timed out). A row-only surplus read does not see prior in-flight
 * REPLACEs, so each tick minted ANOTHER one.
 *
 * Policy under test: on a critical control-plane partition, at most ONE REPLACE
 * may be in flight at a time. The cap counts in-flight REPLACEs in ANY phase
 * (creation AND remove-dispatch drain) — the drain phase is exactly the long
 * window that builds the standoff and is invisible to a creation-only count.
 * Genuine count-increasing provisioning (ADD) and non-critical partitions are
 * untouched.
 *
 * RED before the cap (a second/within-tick-batch REPLACE is minted); GREEN after.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {isReplaceRemoveDispatchPhase} from '../../src/rebalancer/replica-operation-progress.js';

const PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const NON_PRIORITY_PARTITION_ID = 'app_data-p1';

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
    // Faithful to the production UnifiedRebalancer split: getInFlightOperations is
    // ALL non-terminal ops (drain-inclusive); getTopologyBlockingInFlightOperations
    // EXCLUDES drain-phase REPLACEs (isReplaceRemoveDispatchPhase) — exactly the
    // distinction the cap depends on. If the cap read the topology-blocking set
    // instead, a draining REPLACE would be invisible and the standoff case would
    // mint a fresh REPLACE (the test would catch the regression).
    getInFlightOperations: () => inFlightOperations,
    getTopologyBlockingInFlightOperations: () =>
      inFlightOperations.filter((op) => !isReplaceRemoveDispatchPhase(op)),
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function active(replicaId, nodeId) {
  return {replica_id: replicaId, node_id: nodeId, status: ReplicaStatus.ACTIVE};
}

// An in-flight REPLACE in its remove-dispatch DRAIN phase: the replacement is
// already voter-ready and the source is draining. workflow_step ACTIVE is NOT
// add-transitional, so a creation-only count would miss it — yet it is the op
// that holds the per-partition serialization lock for the whole ~114s standoff.
function drainingReplace(partitionId) {
  return {
    type: REBALANCER_MOVE_TYPE.REPLACE,
    partition_id: partitionId,
    workflow_step: 'ACTIVE',
  };
}

function plannerFor(entityId, provider) {
  return new MovePlanner({
    entityId,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
  });
}

const TARGET_STATE = {
  targetReplicaCount: 3,
  targetNodes: ['node-1', 'node-2', 'node-3'],
  degraded: false,
};

function countByType(moves, type) {
  return moves.filter((move) => move.type === type).length;
}

test('MovePlanner critical-partition REPLACE serialization cap', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(resetEnv);

  await t.test(
    'with a REPLACE already draining, no new add-like move is minted ' +
    '(the standoff is not extended)',
    async (t) => {
      // At target (3 active) but mis-spread (node-3 empty), which on its own
      // would mint a spread-restoration REPLACE. A REPLACE is already draining
      // on this partition, so the cap must mint NOTHING new.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-2'),
      ];
      const provider = createMoveStateProvider({
        currentReplicas,
        inFlightOperations: [drainingReplace(PRIORITY_PARTITION_ID)],
      });
      const planner = plannerFor(PRIORITY_PARTITION_ID, provider);

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addLike = moves.filter(
        (m) =>
          m.type === REBALANCER_MOVE_TYPE.ADD ||
          m.type === REBALANCER_MOVE_TYPE.REPLACE,
      );
      t.same(addLike, [],
        'no new ADD/REPLACE while a REPLACE is already in flight (any phase)');
    },
  );

  await t.test(
    'with no REPLACE in flight, only ONE REPLACE is minted within a tick ' +
    '(not the whole spread batch)',
    async (t) => {
      // 3 active concentrated on node-1 (at target, mis-spread). The natural
      // batch is TWO REPLACEs (to node-2 and node-3); the cap serializes to one.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
      ];
      const provider = createMoveStateProvider({currentReplicas});
      const planner = plannerFor(PRIORITY_PARTITION_ID, provider);

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(countByType(moves, REBALANCER_MOVE_TYPE.REPLACE), 1,
        'exactly one REPLACE minted per tick on a critical partition');
      t.equal(countByType(moves, REBALANCER_MOVE_TYPE.ADD), 0,
        'the unpaired spread ADD is deferred, not leaked as a count-increasing ADD');
    },
  );

  await t.test(
    'a genuine deficit is still filled by ADD even while a REPLACE drains ' +
    '(cap never blocks liveness)',
    async (t) => {
      // Under target (2 active < 3) AND mis-spread (node-1 over its share), with
      // a REPLACE already draining. The REPLACE is capped, but the genuine
      // deficit must still be provisioned with ADDs.
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
      ];
      const provider = createMoveStateProvider({
        currentReplicas,
        inFlightOperations: [drainingReplace(PRIORITY_PARTITION_ID)],
      });
      const planner = plannerFor(PRIORITY_PARTITION_ID, provider);

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(countByType(moves, REBALANCER_MOVE_TYPE.REPLACE), 0,
        'no new REPLACE while one drains');
      t.ok(countByType(moves, REBALANCER_MOVE_TYPE.ADD) > 0,
        'genuine deficit (active 2 < target 3) is still filled by ADD');
    },
  );

  await t.test(
    'the within-tick cap is scoped to critical partitions only',
    async (t) => {
      // Same at-target mis-spread (natural batch = TWO REPLACEs), no op in
      // flight. A non-priority partition must mint the FULL batch — the
      // serialization cap is a critical-control-plane pathology fix and must not
      // throttle ordinary-table rebalancing. (Non-critical partitions are
      // already protected from over-minting while ops are pending by
      // cleanupOnlyWhilePending; critical partitions bypass that, which is why
      // they — and only they — need this REPLACE cap.)
      const currentReplicas = [
        active('r1', 'node-1'),
        active('r2', 'node-1'),
        active('r3', 'node-1'),
      ];
      const provider = createMoveStateProvider({currentReplicas});
      const planner = plannerFor(NON_PRIORITY_PARTITION_ID, provider);

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(countByType(moves, REBALANCER_MOVE_TYPE.REPLACE), 2,
        'non-critical partition mints the full spread batch (cap not applied)');
    },
  );
});
