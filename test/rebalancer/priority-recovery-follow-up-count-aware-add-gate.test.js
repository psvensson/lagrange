import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestRebalancer} from './test-helpers.js';

// Count-aware deficit ADD gate (reframe lever #2 — see memory
// metastable-reconfig-reframe / over-removal-readd-oscillation-root).
//
// The over-removal -> re-ADD storm is a metastable limit cycle: while a
// critical partition sits under-replicated, the priority-recovery follow-up
// path re-issues an `increase_replica_count` ADD every plan tick (~1s) even
// though a prior ADD is still settling (learner catch-up + promotion runs on a
// ~5s plant settle window). Gate 092618Z proved a BLANKET "one ADD at a time"
// serialization collapses the storm DECISIVELY (replica_operations-p1 27->2,
// wall 574->205s) but breaks legitimate concurrent PROVISIONING (filling a
// fresh partition 0 -> N replicas) -> BLOCK_EVIDENCE_INCOMPLETE.
//
// The fix is COUNT-AWARE: a genuine deficit may need several concurrent ADDs,
// so allow ADDs up to `healthy + inFlightAdds < target` and defer only the
// re-issuance BEYOND the true deficit. That bounds the storm yet still lets
// provisioning fan out, and never hard-throws on the admin path.
//
// These tests pin the discriminator directly on buildPriorityRecoveryFollowUpMove
// so they are red-on-revert of the source change.

const PARTITION_ID = 'count-aware-followup-p1';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_D = 'node-d';
const TARGET_REPLICA_COUNT = 3;

function activeVoterReplica(nodeId, replicaId) {
  return {
    service_id: replicaId,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    address: `addr-${replicaId}`,
    raft_role: 'voter',
    status: ReplicaStatus.ACTIVE,
  };
}

function activeLearnerReplica(nodeId, replicaId) {
  return {
    service_id: replicaId,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    address: `addr-${replicaId}`,
    raft_role: 'learner',
    status: ReplicaStatus.ACTIVE,
  };
}

function inFlightOperation(operationId, type, targetNodeId, replicaId) {
  return {
    operation_id: operationId,
    type,
    entity_type: EntityType.PARTITION,
    entity_id: PARTITION_ID,
    partition_id: PARTITION_ID,
    target_node_id: targetNodeId,
    replica_id: replicaId,
    status: 'pending',
    workflow_step: 'sending',
  };
}

function buildDecision() {
  return {
    decisionSnapshot: {
      partitionId: PARTITION_ID,
      semanticState: 'needs_operation',
      progress: {nextRequiredAction: 'create_recovery_operation'},
      planner: {requiredDistinctNodeCount: TARGET_REPLICA_COUNT},
      admission: {
        effectiveEligibleNodeIds: [NODE_A, NODE_B, NODE_C, NODE_D],
      },
      publication: {
        recoveryActiveNodeIds: [NODE_A, NODE_B, NODE_C, NODE_D],
      },
    },
  };
}

function buildRebalancer(replicaOperations = []) {
  return createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: NODE_A,
    cacheData: {
      nodes: [
        {node_id: NODE_A, status: 'active'},
        {node_id: NODE_B, status: 'active'},
        {node_id: NODE_C, status: 'active'},
        {node_id: NODE_D, status: 'active'},
      ],
      replicaOperations,
    },
  });
}

test('count-aware gate defers a deficit ADD already covered by an in-flight ADD',
  async (t) => {
    // healthy = 2, target = 3, one in-flight ADD (-> 2 + 1 >= 3). The storm-era
    // behaviour would emit a SECOND ADD here; count-aware defers it.
    const rebalancer = buildRebalancer([
      inFlightOperation('op-add-c', MoveType.ADD, NODE_C, 'r-c'),
    ]);
    try {
      const move = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision: buildDecision(),
        currentReplicas: [
          activeVoterReplica(NODE_A, 'r-a'),
          activeVoterReplica(NODE_B, 'r-b'),
        ],
      });

      t.equal(
        move.followUpMoveState,
        'in_flight_add_satisfies_deficit',
        'in-flight ADD covering the deficit should defer a redundant follow-up ADD',
      );
      t.equal(
        move.type,
        undefined,
        'deferred follow-up should emit no ADD move',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('count-aware gate still creates an ADD for a genuine uncovered deficit',
  async (t) => {
    // healthy = 2, target = 3, NO in-flight ADD -> 2 + 0 < 3 -> ADD.
    const rebalancer = buildRebalancer([]);
    try {
      const move = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision: buildDecision(),
        currentReplicas: [
          activeVoterReplica(NODE_A, 'r-a'),
          activeVoterReplica(NODE_B, 'r-b'),
        ],
      });

      t.equal(
        move.type,
        MoveType.ADD,
        'an uncovered replica-count deficit must still create a follow-up ADD',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('count-aware gate allows provisioning ADDs while in-flight ADDs fall short',
  async (t) => {
    // Provisioning regression guard: healthy = 1, target = 3, one in-flight ADD
    // -> 1 + 1 = 2 < 3 -> another ADD is still legitimate. The blanket
    // one-at-a-time serialization (gate 092618Z) wrongly blocked this.
    const rebalancer = buildRebalancer([
      inFlightOperation('op-add-b', MoveType.ADD, NODE_B, 'r-b'),
    ]);
    try {
      const move = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision: buildDecision(),
        currentReplicas: [activeVoterReplica(NODE_A, 'r-a')],
      });

      t.equal(
        move.type,
        MoveType.ADD,
        'concurrent provisioning ADDs are allowed until in-flight ADDs cover the deficit',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

// The learner-exclusion bug (getHealthyReplicas drops non-voting learners) only
// applies to CRITICAL system partitions, so these two pin the occupied-slot gate
// against a real system partition id (control_plane_publications-p1).
const CRIT_PARTITION = 'control_plane_publications-p1';
function critReplica(nodeId, replicaId, role) {
  return {
    service_id: replicaId,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    partition_id: CRIT_PARTITION,
    replica_id: replicaId,
    address: `addr-${replicaId}`,
    raft_role: role,
    status: ReplicaStatus.ACTIVE,
  };
}
function buildCriticalRebalancer(extraNodeIds = []) {
  return createTestRebalancer({
    entityId: CRIT_PARTITION,
    entityType: EntityType.PARTITION,
    nodeId: NODE_A,
    cacheData: {
      nodes: [NODE_A, NODE_B, NODE_C, NODE_D, ...extraNodeIds].map((id) => ({
        node_id: id,
        status: 'active',
      })),
      replicaOperations: [],
    },
  });
}
function buildCriticalDecision() {
  return {
    decisionSnapshot: {
      partitionId: CRIT_PARTITION,
      semanticState: 'needs_operation',
      progress: {nextRequiredAction: 'create_recovery_operation'},
      planner: {requiredDistinctNodeCount: TARGET_REPLICA_COUNT},
      admission: {effectiveEligibleNodeIds: [NODE_A, NODE_B, NODE_C, NODE_D]},
      publication: {recoveryActiveNodeIds: [NODE_A, NODE_B, NODE_C, NODE_D]},
    },
  };
}

test('occupied-slot gate defers an ADD when settled ALIVE learners already fill the target ' +
  '(red-on-revert: counting voter-ready healthy replicas alone re-mints the over-replication storm)',
async (t) => {
  // Critical partition. healthy(voters) = 2, plus ONE settled non-voting
  // learner on a ready node, target = 3, NO in-flight ADD. getHealthyReplicas
  // excludes the learner -> pre-fix sees 2 < 3 with 0 in-flight -> emits
  // ANOTHER ADD (the storm). getReadyNodeOccupiedReplicas counts the alive
  // learner -> 3 >= 3 -> defer and let the existing learner promote (uncapped
  // while voters < target).
  const rebalancer = buildCriticalRebalancer();
  try {
    const move = rebalancer.buildPriorityRecoveryFollowUpMove({
      decision: buildCriticalDecision(),
      currentReplicas: [
        critReplica(NODE_A, 'r-a', 'voter'),
        critReplica(NODE_B, 'r-b', 'voter'),
        critReplica(NODE_C, 'r-c', 'learner'),
      ],
    });
    t.equal(
      move.followUpMoveState,
      'in_flight_add_satisfies_deficit',
      'a settled alive learner occupies its slot -> defer the redundant follow-up ADD',
    );
    t.equal(move.type, undefined, 'deferred follow-up should emit no ADD move');
  } finally {
    rebalancer.shutdown();
  }
});

test('occupied-slot gate STILL creates an ADD when a learner is on a NOT-ready (dead) node ' +
  '(alive-guard: a dead replica must be re-placed, never suppressed)',
async (t) => {
  // Critical partition. healthy(voters) = 2, plus a learner on DEAD_NODE which
  // is NOT in the ready node set, target = 3, no in-flight ADD. The dead-node
  // learner is excluded by the readyNodeIds liveness filter -> occupied = 2 <
  // 3 -> ADD still fires (the dead replica must be re-placed).
  const DEAD_NODE = 'node-e-dead';
  const rebalancer = buildCriticalRebalancer();
  try {
    const move = rebalancer.buildPriorityRecoveryFollowUpMove({
      decision: buildCriticalDecision(),
      currentReplicas: [
        critReplica(NODE_A, 'r-a', 'voter'),
        critReplica(NODE_B, 'r-b', 'voter'),
        critReplica(DEAD_NODE, 'r-e', 'learner'),
      ],
    });
    t.equal(
      move.type,
      MoveType.ADD,
      'a learner on a dead node does not occupy a live slot -> re-placement ADD must still fire',
    );
  } finally {
    rebalancer.shutdown();
  }
});

test('count-aware gate counts only replica-count-increasing ADD operations',
  async (t) => {
    // REPLACE is count-neutral and REMOVE decreases the count, so neither should
    // count toward deficit satisfaction; only `add` ops do.
    const rebalancer = buildRebalancer([
      inFlightOperation('op-add-c', MoveType.ADD, NODE_C, 'r-c'),
      inFlightOperation('op-replace-d', MoveType.REPLACE, NODE_D, 'r-d'),
      inFlightOperation('op-remove-a', MoveType.REMOVE, NODE_A, 'r-a'),
    ]);
    try {
      t.equal(
        rebalancer.countPriorityRecoveryFollowUpInFlightAdds(PARTITION_ID),
        1,
        'only the in-flight ADD should be tallied (REPLACE/REMOVE are not count-increasing)',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('occupied-slot gate defers an ADD for a member on a PROCESS-ALIVE not-yet-ready (restarting) node ' +
  '(red-on-revert: the ready-only liveness filter treated a restarting rejoiner like a dead node)',
async (t) => {
  // The over-replication residual that survives the count-aware gate: a member
  // that just materialized (ACTIVE) on a rejoiner whose PROCESS is alive but is
  // not yet serve-ready is invisible to BOTH the transitional in-flight-ADD count
  // AND the ready-occupied count, so the deficit gate re-mints an ADD every ~1s
  // tick (3 -> 4 -> 5 over-replication -> surplus drain -> raft leader churn).
  // The fix widens the occupied liveness guard from serve-READY nodes to nodes
  // that are serve-ready OR PROCESS-ALIVE (up, reporting runtime authority). A
  // genuinely dead node is NOT process-alive (incl. a membership-freeze-retained
  // one — processAlive reflects live runtime evidence, not membership retention),
  // so it is still re-placed (the dead-node test above stays green).
  const RESTARTING = 'node-r-restarting';
  const rebalancer = buildCriticalRebalancer();
  // RESTARTING is process-alive (up) but not serve-ready (absent from the cache,
  // hence absent from getAvailableNodes). Report processAlive only for it.
  const readinessService = rebalancer.controlPlaneReadinessService;
  const originalGetNodeReadinessSync =
      readinessService.getNodeReadinessSync.bind(readinessService);
  readinessService.getNodeReadinessSync = (nodeId, opts) =>
    nodeId === RESTARTING ?
      {nodeId, dimensions: {processAlive: true}} :
      originalGetNodeReadinessSync(nodeId, opts);
  try {
    const move = rebalancer.buildPriorityRecoveryFollowUpMove({
      decision: buildCriticalDecision(),
      currentReplicas: [
        critReplica(NODE_A, 'r-a', 'voter'),
        critReplica(NODE_B, 'r-b', 'voter'),
        critReplica(RESTARTING, 'r-r', 'learner'),
      ],
    });
    t.equal(
      move.followUpMoveState,
      'in_flight_add_satisfies_deficit',
      'a member on a process-alive restarting node occupies its slot -> defer the over-replicating ADD',
    );
    t.equal(move.type, undefined, 'deferred follow-up should emit no ADD move');
  } finally {
    rebalancer.shutdown();
  }
});
