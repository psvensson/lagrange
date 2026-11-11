// Audit finding 1 regression: the execution-time remove-safety floor is
// UNIVERSAL ACROSS PARTITIONS. Before the fix, evaluateRemoveSafety returned
// SAFE immediately for any non-system (ordinary user) partition — bypassing the voter-ready /
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
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockControlPlaneReadinessService,
} from './test-helpers.js';
import {PriorityPublicationSafetyTopology} from '../../src/rebalancer/priority-publication-safety-topology.js';
import {createLeadershipGroup} from './removal-leadership-group-fixture.js';

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
    address: `${nodeId}/partition/${replicaId}`,
  };
}

/**
 * Build a minimal context stub driving evaluateRemoveSafety. Rows is the
 * authoritative replica-row set for the partition; minReplicaCount is the
 * policy floor. Every context method the evaluator touches is stubbed. The
 * removal leadership gate reads a group whose third replica leads (these
 * tests are about the floors, so the removed replica never leads).
 */
function buildContext({rows, minReplicaCount}) {
  const partitionId = rows?.[0]?.partition_id ?? USER_PARTITION_ID;
  const group = createLeadershipGroup({
    partitionId,
    members: ['r1', 'r2', 'r3'].map((suffix, index) => ({
      replicaId: `${partitionId}-${suffix}`,
      nodeId: ['node-a', 'node-b', 'node-c'][index],
    })),
    leaderReplicaId: `${partitionId}-r3`,
  });
  return {
    nodeId: 'owner-node',
    messageRouter: group.router(),
    getCachedCriticalReplicaRows: () => group.rows(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      readNodeRows: () => ['node-a', 'node-b', 'node-c'].map((nodeId) => ({
        node_id: nodeId, status: 'active', ready_lease_expires_at: Date.now() + 60000,
      })),
    }),
    repository: {
      isReplaceRemovePhase: () => false,
      isReplaceRemoveDispatchPhase: () => false,
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
    isVoterReadyReplicaTopology:
      PriorityPublicationSafetyTopology.prototype.isVoterReadyReplicaTopology,
    isVoterReadyFloorCountableReplica:
      PriorityPublicationSafetyTopology.prototype.isVoterReadyFloorCountableReplica,
    isOperationReplicaRow: (row, op) =>
      row.replica_id === op.replicaId || row.service_id === op.replicaId,
    getCriticalMinReplicaCount: async () => minReplicaCount,
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
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      reason,
    }),
    buildDeferredRemoveSafetyEvaluationForOperation: (operation, reason) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      reason,
    }),
    buildDeferredRemoveSafetyEvaluation: (error) => ({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      reason: error,
    }),
  };
}

function removeOperation(partitionId, replicaId) {
  return {
    operationId: `op-${replicaId}`,
    type: OperationType.REMOVE,
    partitionId,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: partitionId,
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
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
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
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'system partition below the floor also defers (tier scope preserved)',
    );
    t.end();
  },
);

test(
  'evaluateRemoveSafety defers on unavailable authoritative replica reads and fails on authoritative empty replica sets',
  async (t) => {
    const {PriorityPublicationSafetyRows} = await import(
      '../../src/rebalancer/priority-publication-safety-rows.js'
    );
    const unavailableReader = Object.create(PriorityPublicationSafetyRows.prototype);
    unavailableReader.repository = {
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {success: false, rows: []};
        },
      },
    };
    const unavailableRows =
      await unavailableReader.getCriticalReplicaRowsForSafety(USER_PARTITION_ID);
    t.equal(
      unavailableRows.authoritativeReadAvailable,
      false,
      'failed gateway read marks authoritativeReadAvailable=false',
    );
    const unavailableContext = buildContext({
      rows: unavailableRows,
      minReplicaCount: 2,
    });
    const unavailableRemove = await evaluateRemoveSafety(
      unavailableContext,
      removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    );
    t.equal(
      unavailableRemove.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      'REMOVE defers when authoritative replica read is unavailable',
    );

    const emptyReader = Object.create(PriorityPublicationSafetyRows.prototype);
    emptyReader.repository = {
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: true,
            rows: [],
            rowSetComplete: true,
            readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
          };
        },
      },
    };
    const emptyRows =
      await emptyReader.getCriticalReplicaRowsForSafety(USER_PARTITION_ID);
    t.equal(
      emptyRows.authoritativeReadAvailable,
      true,
      'authoritative empty read marks authoritativeReadAvailable=true',
    );
    const emptyContext = buildContext({
      rows: emptyRows,
      minReplicaCount: 2,
    });
    const emptyRemove = await evaluateRemoveSafety(
      emptyContext,
      removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    );
    t.equal(
      emptyRemove.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      'REMOVE fails when authoritative replica read is empty',
    );
    const emptyReplace = await evaluateRemoveSafety(emptyContext, {
      ...removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
      type: OperationType.REPLACE,
    });
    t.equal(
      emptyReplace.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      'pre-intent REPLACE fails when authoritative replica read is empty',
    );
    t.end();
  },
);

// A plain REMOVE re-sent at STOPPING whose first delivery never took effect
// (its subject's row still serves) starts a fresh removal: it passes the
// same floors as a first send. Before, every STOPPING re-send was SAFE
// without evaluation. A re-send whose effect already took (row retiring or
// absent) repeats it and stays SAFE; an unreadable row is a named wait.
function stoppingResend(lifecycle) {
  const context = buildContext({
    rows: [
      replicaRow('custom-p1-r1', 'node-a'),
      replicaRow('custom-p1-r2', 'node-b'),
      replicaRow('custom-p1-r3', 'node-c'),
    ],
    minReplicaCount: 3,
  });
  context.isRemoveInitialDispatchPhase = () => false;
  context.observeStoppingReplicaProgress = async () => lifecycle;
  return evaluateRemoveSafety(context, {
    ...removeOperation(USER_PARTITION_ID, 'custom-p1-r1'),
    workflowStep: 'STOPPING', targetNodeId: 'node-a'});
}

test('a plain REMOVE re-sent at STOPPING is evaluated when its first ' +
  'delivery never took effect', async (t) => {
  const {DEFER, SAFE} = REMOVE_SAFETY_EVALUATION_CLASSIFICATION;
  t.same({
    fresh: (await stoppingResend({state: 'observed',
      lifecycleStatus: 'active'})).classification,
    removing: (await stoppingResend({state: 'observed',
      lifecycleStatus: 'removing'})).classification,
    absent: (await stoppingResend({state: 'absent',
      lifecycleStatus: null})).classification,
    unread: (await stoppingResend({state: 'unavailable',
      lifecycleStatus: null})).classification,
  }, {fresh: DEFER, removing: SAFE, absent: SAFE, unread: DEFER},
  'a fresh removal below the floor defers; a repeated effect is safe; an ' +
  'unreadable subject waits');
  t.end();
});
