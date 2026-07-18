// CL-038 churn-root lever: when a partition is OVER target (surplus drain), the
// target-node selection must RETAIN the node currently hosting the raft leader so
// the drain removes a non-leader replica instead of forcing a leadership move.
// Every forced re-election resets the topology-quiescence quiet window, which is
// the demonstrated reason a 5-node rolling restart cannot settle inside the wall
// budget (gate run2 = replica_operations-p1 over-target > 120s). The retention is
// a placement-owner reservation, so it only ever applies to a FEASIBLE
// (capacity-accepted, ranked) leader node and never inflates the move count.
import {test} from '../../src/test-helpers/tap.js';
import {NUM} from '../../src/constants/index.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_RESERVATION_REASON,
  PLACEMENT_OWNER_SCORE_PROFILE,
} from '../../src/rebalancer/placement-owner-constants.js';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';

const PARTITION_ID = 'cl-038-partition';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const CPU_LOW = 1;
const CPU_MID = 2;
const CPU_HIGH = NUM.THREE;
const ESTIMATED_BYTES = NUM.BYTES_PER_MIB;

function createNode(nodeId, cpu) {
  return {
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    cpu_usage_percent: cpu,
    memory_usage_percent: 0,
    disk_usage_percent: 0,
  };
}

function createReplica(replicaId, nodeId, raftRole = null) {
  const replica = {
    replica_id: replicaId,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
  if (raftRole) {
    replica.raft_role = raftRole;
  }
  return replica;
}

function createMoveStateProvider(nodes, currentReplicas, extra = {}) {
  return {
    isLeader: extra.isLeader === true,
    nodeId: extra.leaderNodeId || null,
    replicaId: extra.leaderReplicaId || null,
    getAvailableNodes: () => nodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function createPlanner(nodes, currentReplicas, extra = {}) {
  return new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: createMoveStateProvider(
      nodes,
      currentReplicas,
      extra,
    ),
    storageAdmissionService: extra.storageAdmissionService,
    accountingService: extra.accountingService,
  });
}

function denyAdmissionService(deniedNodeId) {
  return {
    async checkAdd(options = {}) {
      if (options.targetNodeId === deniedNodeId) {
        return {
          decision: ADMISSION_DECISION.DENY,
          reason: ADMISSION_REASON.BUDGET_EXCEEDED,
          projectedUtilization: {},
        };
      }
      return {
        decision: ADMISSION_DECISION.ALLOW,
        reason: ADMISSION_REASON.CAPACITY_AVAILABLE,
        projectedUtilization: {},
      };
    },
  };
}

function accountingService() {
  return {estimateReplicaBytes: () => ESTIMATED_BYTES};
}

const PARTITION_POLICY = {
  targetReplicaCount: 2,
  minReplicaCount: 1,
  maxReplicaCount: NUM.THREE,
  placementConstraints: {considerCpuLoad: true},
};

test('CL-038 surplus drain retains the leader node', async (t) => {
  await t.test(
    'over-target drain removes a non-leader even when the leader is highest load',
    async (t) => {
      // Leader sits on the highest-load node. Pure load scoring would rank it
      // last and drain it (forcing a re-election). Retention must keep it.
      const nodes = [
        createNode(NODE_1, CPU_HIGH),
        createNode(NODE_2, CPU_LOW),
        createNode(NODE_3, CPU_MID),
      ];
      const currentReplicas = [
        createReplica('replica-1', NODE_1, 'leader'),
        createReplica('replica-2', NODE_2, 'follower'),
        createReplica('replica-3', NODE_3, 'follower'),
      ];
      const planner = createPlanner(nodes, currentReplicas);
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);
      const moves = planner.calculateMoves(currentReplicas, targetState);

      t.ok(
        targetState.targetNodes.includes(NODE_1),
        'leader node is retained in the target cohort',
      );
      t.notOk(
        targetState.targetNodes.includes(NODE_3),
        'a non-leader node is dropped from the target cohort instead',
      );
      t.equal(moves.length, 1, 'still exactly one surplus-drain move');
      t.equal(moves[0].type, REBALANCER_MOVE_TYPE.REMOVE);
      t.equal(
        moves[0].nodeId,
        NODE_3,
        'the drained replica is the non-leader, not the leader',
      );
      t.equal(moves[0].reason, MOVE_REASON.NODE_NOT_IN_TARGET);
      t.ok(
        targetState.placementOwnerDecision.reservationResult.reasons.includes(
          PLACEMENT_OWNER_RESERVATION_REASON.LEADER_RETENTION,
        ),
        'reservation is attributed to leader retention',
      );
    },
  );

  await t.test(
    'safety: an infeasible (capacity-denied) leader is NOT resurrected',
    async (t) => {
      // The leader's node is capacity-denied so it never enters the ranked
      // candidate set. Retention must not floor it back in — an unhealthy
      // leader must still drain.
      const nodes = [
        createNode(NODE_1, CPU_LOW),
        createNode(NODE_2, CPU_LOW),
        createNode(NODE_3, CPU_LOW),
      ];
      const currentReplicas = [
        createReplica('replica-1', NODE_1, 'leader'),
        createReplica('replica-2', NODE_2, 'follower'),
        createReplica('replica-3', NODE_3, 'follower'),
      ];
      const planner = createPlanner(nodes, currentReplicas, {
        storageAdmissionService: denyAdmissionService(NODE_1),
        accountingService: accountingService(),
      });
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);

      t.notOk(
        targetState.targetNodes.includes(NODE_1),
        'capacity-denied leader is not floored back into the target cohort',
      );
    },
  );

  await t.test(
    'safety: at/under target placement is unchanged (no surplus)',
    async (t) => {
      // Not over target -> no surplus drain -> leader retention must not fire,
      // so a fresh under-replicated placement still ranks purely by load.
      const nodes = [
        createNode(NODE_1, CPU_HIGH),
        createNode(NODE_2, CPU_LOW),
        createNode(NODE_3, CPU_MID),
      ];
      const currentReplicas = [
        createReplica('replica-1', NODE_1, 'leader'),
      ];
      const planner = createPlanner(nodes, currentReplicas);
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);

      t.notOk(
        targetState.placementOwnerDecision.reservationResult.reasons.includes(
          PLACEMENT_OWNER_RESERVATION_REASON.LEADER_RETENTION,
        ),
        'leader retention does not fire when there is no surplus to drain',
      );
    },
  );

  await t.test(
    'safety: in-flight transition reservations are not evicted by leader retention',
    async (t) => {
      // Budget collision: targetCount=2, two entity-add transitions {NODE_1,
      // NODE_2}, leader on NODE_3 ranking FIRST (lowest load). Leader retention
      // must yield to the in-flight establishments, not evict one of them.
      const decision = buildPlacementOwnerDecision({
        candidateNodes: [
          createNode(NODE_1, CPU_MID),
          createNode(NODE_2, CPU_HIGH),
          createNode(NODE_3, CPU_LOW),
        ],
        currentReplicas: [
          createReplica('replica-1', NODE_1, 'follower'),
          createReplica('replica-2', NODE_2, 'follower'),
          createReplica('replica-3', NODE_3, 'leader'),
        ],
        targetCount: 2,
        policy: {placementConstraints: {considerCpuLoad: true}},
        transitionSnapshot: {
          nodesWithEntityAddTransitional: new Set([NODE_1, NODE_2]),
        },
        placementPolicy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
        scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
      });

      t.same(
        decision.intent.targetNodeIds.slice().sort(),
        [NODE_1, NODE_2],
        'both in-flight transition nodes are retained',
      );
      t.notOk(
        decision.intent.targetNodeIds.includes(NODE_3),
        'the leader is not pinned at the expense of a transition node',
      );
      t.notOk(
        decision.reservationResult.reasons.includes(
          PLACEMENT_OWNER_RESERVATION_REASON.LEADER_RETENTION,
        ),
        'leader retention does not consume budget owed to a transition',
      );
    },
  );

  await t.test(
    'live owner identity retains a collapsed-role leader and drains its co-located follower',
    async (t) => {
      // Runtime SERVICES publication intentionally collapses leader to follower.
      // Formation can also leave multiple replicas on the leader node. The
      // active Raft owner identity must therefore preserve both the leader node
      // in the target cohort and the exact leader replica within that node.
      const node4 = 'node-4';
      const nodes = [
        createNode(NODE_1, CPU_HIGH),
        createNode(NODE_2, CPU_LOW),
        createNode(NODE_3, CPU_MID),
        createNode(node4, 0),
      ];
      const currentReplicas = [
        createReplica('leader-replica', NODE_1, 'follower'),
        createReplica('co-located-follower', NODE_1, 'follower'),
        createReplica('replica-2', NODE_2, 'follower'),
        createReplica('replica-3', NODE_3, 'follower'),
      ];
      const planner = createPlanner(nodes, currentReplicas, {
        isLeader: true,
        leaderNodeId: NODE_1,
        leaderReplicaId: 'leader-replica',
      });
      const targetState =
        await planner.calculateTargetState(currentReplicas, {
          ...PARTITION_POLICY,
          targetReplicaCount: NUM.THREE,
        });
      const moves = planner.calculateMoves(currentReplicas, targetState);

      t.ok(
        targetState.targetNodes.includes(NODE_1),
        'live leader node remains in the target cohort despite collapsed roles',
      );
      t.notOk(
        moves.some((move) => move.replicaId === 'leader-replica'),
        'the exact live leader replica is never selected as a drain source',
      );
      t.ok(
        moves.some((move) => move.replicaId === 'co-located-follower'),
        'the co-located follower is selected ahead of the leader',
      );
    },
  );
});
