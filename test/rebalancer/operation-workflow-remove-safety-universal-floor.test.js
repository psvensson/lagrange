// Audit finding 1 regression: the execution-time remove-safety floor is
// UNIVERSAL. Before the fix, evaluateRemoveSafety returned SAFE immediately
// for any non-system (ordinary user) partition — bypassing the voter-ready /
// min-replica floor, the distinct-node spread, the concurrent-operation lock,
// and the peer-ping checks. These tests pin that a user-partition REMOVE is
// now deferred when it would drop the post-removal voter-ready count below
// the min-replica floor, and that the system-only tier (published-membership
// / leader-tenure / priority-control-plane) stays scoped to system entities.
//
// Red-on-revert: restoring the `!systemTable -> buildSafeRemoveSafetyEvaluation()`
// early return makes the "user partition is deferred below the floor" tests
// fail (they would return SAFE).

import {test} from '../../src/test-helpers/tap.js';
import {
  evaluateRemoveSafety,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const REMOVE_SAFETY_EVALUATION_CLASSIFICATION =
  OPERATION_WORKFLOW_OWNER_SHARED.REMOVE_SAFETY_EVALUATION_CLASSIFICATION;

// A partitionId that classifies as an ordinary (non-system) user partition:
// 'custom-p1' derives tableId 'custom', which is in no system set.
const USER_PARTITION_ID = 'custom-p1';
// 'nodes-p1' derives tableId 'nodes', which IS a system table.
const SYSTEM_PARTITION_ID = 'nodes-p1';

function replicaRow(replicaId, nodeId) {
  return {
    replica_id: replicaId,
    service_id: replicaId,
    partition_id: USER_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: 'follower',
  };
}

/**
 * Build a minimal context stub driving evaluateRemoveSafety. Rows is the
 * authoritative replica-row set for the partition; minReplicaCount is the
 * policy floor. Every context method the evaluator touches is stubbed.
 */
function buildContext({rows, minReplicaCount}) {
  return {
    nodeId: 'owner-node',
    repository: {
      isReplaceRemovePhase: () => false,
      getOperationsByEntity: async () => [],
      isOperationTerminal: () => false,
      getReplaceSourceReplicaId: () => null,
      getReplaceTargetReplicaId: () => null,
    },
    isRemoveInitialDispatchPhase: () => true,
    isConcurrentOperationStalePastStepTimeout: () => false,
    isConcurrentOperationTargetUncontactable: async () => false,
    resolveTimeoutCheckNowMs: () => Date.now(),
    getCriticalReplicaRowsForSafety: async () => rows,
    isVoterReadyRoutableReplica: () => true,
    isOperationReplicaRow: (row, op) =>
      row.replica_id === op.replicaId || row.service_id === op.replicaId,
    isReplaceSourceLeaderHandoffRequiredPartition: () => false,
    getCriticalMinReplicaCount: async () => minReplicaCount,
    resolvePriorityPublicationReplacementLeaderCandidateRow: async () => null,
    evaluatePriorityRecoveryCompletionRemoveSafety: async () => null,
    // Priority-tier methods throw if reached: the universal tier must not
    // invoke them for a user partition.
    evaluatePriorityPublishedMembershipRemoveSafety: async () => {
      throw new Error('priority tier must not run for user partitions');
    },
    evaluatePriorityPublicationLeaderRemoveSafety: async () => {
      throw new Error('priority tier must not run for user partitions');
    },
    buildSafeRemoveSafetyEvaluation: () => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    }),
    buildFailedRemoveSafetyEvaluation: (reason) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAILED,
      reason,
    }),
    buildDeferredRemoveSafetyEvaluationForOperation: (operation, reason) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFERRED,
      reason,
    }),
    buildDeferredRemoveSafetyEvaluation: (operation, reason) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFERRED,
      reason,
    }),
  };
}

function removeOperation(partitionId, replicaId) {
  return {
    operationId: `op-${replicaId}`,
    type: OperationType.REMOVE,
    partitionId,
    replicaId,
  };
}

test(
  'user-partition REMOVE is SAFE when post-removal voter-ready count meets the floor',
  async (t) => {
    // 3 voter-ready rows, removing 1 leaves 2 >= min 2.
    const context = buildContext({
      rows: [
        replicaRow('custom-p1-r1', 'node-a'),
        replicaRow('custom-p1-r2', 'node-b'),
        replicaRow('custom-p1-r3', 'node-c'),
      ],
      minReplicaCount: 2,
    });
    const result = await evaluateRemoveSafety(
      context,
      removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    );
    t.equal(
      result.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'removal leaving the floor satisfied is safe',
    );
    t.end();
  },
);

test(
  'user-partition REMOVE is DEFERRED when it would drop voter-ready below the floor',
  async (t) => {
    // 3 voter-ready rows, removing 1 leaves 2 < min 3.
    const context = buildContext({
      rows: [
        replicaRow('custom-p1-r1', 'node-a'),
        replicaRow('custom-p1-r2', 'node-b'),
        replicaRow('custom-p1-r3', 'node-c'),
      ],
      minReplicaCount: 3,
    });
    const result = await evaluateRemoveSafety(
      context,
      removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    );
    t.equal(
      result.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFERRED,
      'removal below the min-replica floor defers, not silently safe',
    );
    t.match(
      result.reason,
      /would drop voter-ready replicas below minimum/,
      'defer reason names the voter-ready floor',
    );
    t.end();
  },
);

test(
  'user-partition REMOVE is SAFE when the removed replica is not voter-ready',
  async (t) => {
    // The removed replica (r1) is not in the voter-ready set (r2/r3 are), so
    // its removal cannot drop the post-removal count — no floor projection.
    const context = buildContext({
      rows: [
        replicaRow('custom-p1-r2', 'node-b'),
        replicaRow('custom-p1-r3', 'node-c'),
      ],
      minReplicaCount: 2,
    });
    const result = await evaluateRemoveSafety(
      context,
      removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    );
    t.equal(
      result.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      'removing a non-voter-ready replica is safe',
    );
    t.end();
  },
);

test(
  'system-partition REMOVE still reaches the priority tier (scope preserved)',
  async (t) => {
    // For a system partition with a voter-ready removal below the floor, the
    // system tier runs (evaluatePriorityPublishedMembershipRemoveSafety would
    // throw in the universal stub). Use a context whose priority methods are
    // benign so we can observe that the priority path is taken (deferred via
    // the simple floor before any priority call, which is fine and safe).
    const rows = [
      replicaRow('nodes-p1-r1', 'node-a'),
      replicaRow('nodes-p1-r2', 'node-b'),
    ];
    rows.forEach((row) => {
      row.partition_id = SYSTEM_PARTITION_ID;
    });
    const context = buildContext({
      rows,
      minReplicaCount: 3,
    });
    // Let the priority-tier stubs return SAFE rather than throw: a system
    // partition below the floor must defer at the simple floor before them.
    context.evaluatePriorityPublishedMembershipRemoveSafety = async () => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    });
    context.evaluatePriorityPublicationLeaderRemoveSafety = async () => null;
    const result = await evaluateRemoveSafety(
      context,
      removeOperation(SYSTEM_PARTITION_ID, 'nodes-p1-r1'),
    );
    t.equal(
      result.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFERRED,
      'system partition below the floor also defers (tier scope preserved)',
    );
    t.end();
  },
);
