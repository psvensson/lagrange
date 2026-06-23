// C-2 incumbency-stickiness lever (Head A of convergence-timeout-leadership-settle).
// The rolling-restart `leadership_unstable` blocker is raft leader-map churn: load-
// only placement re-ranks freshly-returned LOW-load nodes above healthy incumbents
// on a control-plane-priority partition, displacing incumbents -> a 3->5
// over-replication migration that raises the raft majority while fresh followers
// can't heartbeat -> a re-election that resets the 15s topology-quiescence quiet
// window. The lever (flag LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS, default-off)
// reserves the current healthy+feasible incumbents into the target cohort so a
// merely-lower-load returned node cannot trigger the migration. Feasibility is
// enforced downstream exactly like CL-038 leader retention: a GONE/infeasible
// incumbent is NOT floored back in and still gets replaced (recovery never stalls).
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
  PLACEMENT_OWNER_RESERVATION_REASON,
} from '../../src/rebalancer/placement-owner-constants.js';

// A real priority-control-plane partition id: the table id resolves to one of
// PRIORITY_CONTROL_PLANE_TABLE_IDS, so isControlPlanePriorityPartition() is true
// without needing a systemTableCache row.
const PARTITION_ID = 'sql_write_operations-p1';
const FLAG = 'LAGRANGE_PR_PRIORITY_INCUMBENT_STICKINESS';

const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const NODE_4 = 'node-4';
const NODE_5 = 'node-5';
const CPU_INCUMBENT = NUM.THREE * NUM.TEN * NUM.TWO; // 60% — healthy but loaded
const CPU_RETURNED = NUM.ONE; // freshly returned, near-idle -> ranks first by load
const ESTIMATED_BYTES = NUM.BYTES_PER_MIB;

const PARTITION_POLICY = {
  targetReplicaCount: NUM.THREE,
  minReplicaCount: NUM.ONE,
  maxReplicaCount: NUM.FIVE,
  placementConstraints: {considerCpuLoad: true, spreadAcrossNodes: true},
};

function createNode(nodeId, cpu) {
  return {
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    cpu_usage_percent: cpu,
    memory_usage_percent: NUM.ZERO,
    disk_usage_percent: NUM.ZERO,
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

function createMoveStateProvider(nodes, currentReplicas) {
  return {
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

function accountingService() {
  return {estimateReplicaBytes: () => ESTIMATED_BYTES};
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

function createPlanner(nodes, currentReplicas, extra = {}) {
  return new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: createMoveStateProvider(nodes, currentReplicas),
    storageAdmissionService: extra.storageAdmissionService,
    accountingService: extra.accountingService,
  });
}

// Three healthy incumbents (loaded) + two freshly-returned near-idle nodes.
// By pure load ranking the returned nodes outrank the incumbents, so the cohort
// migrates onto them — the bug.
function steadyIncumbentTopology() {
  const nodes = [
    createNode(NODE_1, CPU_INCUMBENT),
    createNode(NODE_2, CPU_INCUMBENT),
    createNode(NODE_3, CPU_INCUMBENT),
    createNode(NODE_4, CPU_RETURNED),
    createNode(NODE_5, CPU_RETURNED),
  ];
  const currentReplicas = [
    createReplica('replica-1', NODE_1, 'leader'),
    createReplica('replica-2', NODE_2, 'follower'),
    createReplica('replica-3', NODE_3, 'follower'),
  ];
  return {nodes, currentReplicas};
}

const INCUMBENT_NODES = new Set([NODE_1, NODE_2, NODE_3]);

test('C-2 priority incumbent stickiness', async (t) => {
  t.teardown(() => {
    delete process.env[FLAG];
  });

  await t.test(
    'flag OFF (default): load re-ranking migrates the cohort onto returned nodes',
    async (t) => {
      delete process.env[FLAG];
      const {nodes, currentReplicas} = steadyIncumbentTopology();
      const planner = createPlanner(nodes, currentReplicas);
      t.ok(
        planner.isControlPlanePriorityPartition(),
        'fixture partition is a control-plane-priority partition',
      );
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);
      const returnedInTarget = targetState.targetNodes.filter(
        (nodeId) => !INCUMBENT_NODES.has(nodeId),
      );
      t.ok(
        returnedInTarget.length > NUM.ZERO,
        'baseline: lower-load returned nodes displace incumbents in the cohort',
      );
      t.notOk(
        targetState.placementOwnerDecision.reservationResult.reasons.includes(
          PLACEMENT_OWNER_RESERVATION_REASON.INCUMBENT_RETENTION,
        ),
        'no incumbent-retention reservation when the flag is off',
      );
    },
  );

  await t.test(
    'flag ON: healthy incumbents are retained — no migration cohort change',
    async (t) => {
      process.env[FLAG] = 'true';
      const {nodes, currentReplicas} = steadyIncumbentTopology();
      const planner = createPlanner(nodes, currentReplicas);
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);

      t.same(
        targetState.targetNodes.slice().sort(),
        [NODE_1, NODE_2, NODE_3],
        'cohort stays on the three healthy incumbents (no migration)',
      );
      t.ok(
        targetState.placementOwnerDecision.reservationResult.reasons.includes(
          PLACEMENT_OWNER_RESERVATION_REASON.INCUMBENT_RETENTION,
        ),
        'reservation attributed to incumbent retention',
      );
      const moves = planner.calculateMoves(currentReplicas, targetState);
      const migrationMoves = moves.filter(
        (move) => !INCUMBENT_NODES.has(move.nodeId),
      );
      t.equal(
        migrationMoves.length,
        NUM.ZERO,
        'no ADD/REPLACE move introduces a non-incumbent node',
      );
      t.equal(
        moves.filter(
          (move) => move.type === REBALANCER_MOVE_TYPE.REMOVE,
        ).length,
        NUM.ZERO,
        'lever retains placement: no removes either (no remove-floor deadlock)',
      );
    },
  );

  await t.test(
    'safety: an INFEASIBLE incumbent is NOT floored back in — it is replaced',
    async (t) => {
      // NODE_3 (incumbent) is capacity-denied, so it never enters the ranked
      // candidate set. Retention must not resurrect it; a feasible returned node
      // takes its slot so recovery proceeds.
      process.env[FLAG] = 'true';
      const {nodes, currentReplicas} = steadyIncumbentTopology();
      const planner = createPlanner(nodes, currentReplicas, {
        storageAdmissionService: denyAdmissionService(NODE_3),
        accountingService: accountingService(),
      });
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);

      t.notOk(
        targetState.targetNodes.includes(NODE_3),
        'capacity-denied incumbent is not retained',
      );
      t.equal(
        targetState.targetNodes.length,
        NUM.THREE,
        'cohort is still filled to target with a feasible replacement',
      );
    },
  );

  await t.test(
    'safety: OVER-target surplus drain still retains the leader (CL-038 preserved)',
    async (t) => {
      // 5 incumbents, target 3, leader on the HIGHEST-load node (ranks last by
      // load). Rank-ordered incumbent reservation would slice the leader out and
      // force a re-election — the exact churn this lever prevents. The leader must
      // be retained within the slice budget; the two lowest-ranked NON-leader
      // incumbents drain instead.
      process.env[FLAG] = 'true';
      const LEADER_NODE = NODE_5;
      const nodes = [
        createNode(NODE_1, CPU_RETURNED),
        createNode(NODE_2, CPU_RETURNED),
        createNode(NODE_3, CPU_INCUMBENT),
        createNode(NODE_4, CPU_INCUMBENT),
        createNode(LEADER_NODE, CPU_INCUMBENT * NUM.TWO),
      ];
      const currentReplicas = [
        createReplica('replica-1', NODE_1, 'follower'),
        createReplica('replica-2', NODE_2, 'follower'),
        createReplica('replica-3', NODE_3, 'follower'),
        createReplica('replica-4', NODE_4, 'follower'),
        createReplica('replica-5', LEADER_NODE, 'leader'),
      ];
      const planner = createPlanner(nodes, currentReplicas);
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);

      t.ok(
        targetState.targetNodes.includes(LEADER_NODE),
        'the raft leader node is retained in the over-target cohort',
      );
      t.equal(
        targetState.targetNodes.length,
        NUM.THREE,
        'cohort is drained to target',
      );
      const moves = planner.calculateMoves(currentReplicas, targetState);
      const leaderRemoved = moves.some(
        (move) =>
          move.type === REBALANCER_MOVE_TYPE.REMOVE &&
          move.nodeId === LEADER_NODE,
      );
      t.notOk(
        leaderRemoved,
        'the leader replica is never the drained surplus (no forced re-election)',
      );
    },
  );

  await t.test(
    'safety: under-target placement still adds (recovery never stalled)',
    async (t) => {
      // Only one incumbent remains, target 3. Stickiness must not suppress the
      // genuine under-target recovery ADDs.
      process.env[FLAG] = 'true';
      const nodes = [
        createNode(NODE_1, CPU_INCUMBENT),
        createNode(NODE_4, CPU_RETURNED),
        createNode(NODE_5, CPU_RETURNED),
      ];
      const currentReplicas = [createReplica('replica-1', NODE_1, 'leader')];
      const planner = createPlanner(nodes, currentReplicas);
      const targetState =
        await planner.calculateTargetState(currentReplicas, PARTITION_POLICY);
      const moves = planner.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter(
        (move) => move.type === REBALANCER_MOVE_TYPE.ADD,
      );
      t.ok(
        addMoves.length >= NUM.TWO,
        'under-target recovery still emits ADD moves to reach the target',
      );
      t.ok(
        targetState.targetNodes.includes(NODE_1),
        'the surviving incumbent is retained in the recovered cohort',
      );
    },
  );
});
