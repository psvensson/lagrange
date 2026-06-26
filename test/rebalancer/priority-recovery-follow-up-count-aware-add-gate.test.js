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
