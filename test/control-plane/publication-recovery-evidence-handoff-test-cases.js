import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../src/control-plane/control-plane-publication-merge.js';
import {
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from '../../src/control-plane/publication-owner-constants.js';
import {RECOVERY_PROTOCOL_STATE} from
  '../../src/control-plane/membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
  RECOVERY_PREEMPTION_DECISION,
  TopologyEpochFencer,
  PublicationRecoveryLease,
  adjudicateRecoveryPreemption,
} from '../../src/control-plane/publication-recovery-evidence.js';

const TEST_PUBLICATION_EPOCH = 9;
const TEST_EMPTY_PUBLICATION_DEBT_COUNT = 0;
const TEST_PUBLICATION_DEBT_COUNT = 1;
const TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT = 2;
const TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT = 3;
const TEST_ACTIVE_GATE_EXPECTED_NODE_COUNT = 5;
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
  THIRD: 'node-c',
  FOURTH: 'node-d',
  FIFTH: 'node-e',
});
const TEST_PUBLICATION_PENDING_REASON_CODE = 'publication_epoch_pending';
const TEST_STALE_REASON_CODE = 'priority_partitions_not_spread';
const TEST_STALE_PRESENTATION_REASON_CODE = Object.freeze({
  PRIORITY_CONTROL_PLANE_SPREAD_PENDING:
    'priority_control_plane_spread_pending',
  PUBLICATION_CONVERGENCE_MISSING: 'publication_convergence_missing',
  PUBLICATION_MISSING_ACTIVE_NODE: 'publication_missing_active_node=node-b',
  PUBLICATION_NOT_PUBLISHED_OPEN: 'publication_not_published=OPEN',
  PUBLICATION_NOT_PUBLISHED_UNKNOWN: 'publication_not_published=unknown',
  PUBLICATION_PENDING_ACK: 'publication_pending_ack=1',
});
const TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE = Object.freeze({
  PENDING: 'pending',
});
const TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON = Object.freeze({
  OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
});
const TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION = Object.freeze({
  RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
});
const TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE = Object.freeze({
  WRITE_DEFERRED: 'write_deferred',
});
const TEST_OPERATION_WORKFLOW_HANDOFF_STATE = 'deferred';
const TEST_OPERATION_WORKFLOW_HANDOFF_REASON_CODE =
  'classified_backpressure';
const TEST_PUBLICATION_OWNER = 'topology_publication_owner';
const TEST_PUBLICATION_BOUNDARY = 'publication_convergence';
const TEST_OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const TEST_OPERATION_WORKFLOW_BOUNDARY = 'workflow_progress';
const TEST_OPERATION_WORKFLOW_ADVANCE_ACTION = 'advance_existing_operation';
const TEST_OPERATION_WORKFLOW_ACTUATION_STATE = 'persisted_not_dispatched';
const TEST_OPERATION_WORKFLOW_WAIT_MODE = 'event_driven';
const TEST_OPERATION_WORKFLOW_PROGRESS_PHASE = 'dispatch_pending';
const TEST_OPERATION_WORKFLOW_OPERATION_ID = 'operation-workflow-1';
const TEST_NON_PRIORITY_PARTITION_ID =
  'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
const TEST_DECISION_SNAPSHOT_ACK_TARGET_ASSERTION =
  'decision snapshot ACK targets should become canonical pending ACK evidence';
const TEST_SELECTED_ONLY_MISSING_NODE_IDS = Object.freeze([
  TEST_NODE_ID.FOURTH,
  TEST_NODE_ID.FIFTH,
]);
const TEST_SELECTED_HANDOFF_MISSING_NODE_IDS = Object.freeze([
  TEST_NODE_ID.SECOND,
  TEST_NODE_ID.FOURTH,
  TEST_NODE_ID.FIFTH,
]);
const TEST_STALE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: false,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 1,
  missingPartitionIds: [TEST_PRIORITY_PARTITION_ID],
  blockedPartitions: [{
    partitionId: TEST_PRIORITY_PARTITION_ID,
    requiredDistinctNodeCount: 3,
    readyDistinctNodeCount: 2,
    spreadGap: 1,
  }],
  blockedPartitionCount: 1,
  largestSpreadGap: 1,
  totalSpreadGap: 1,
});
const TEST_ZERO_GAP_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: false,
  blockedPartitionCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
  largestSpreadGap: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
  totalSpreadGap: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
});
const TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 1,
  missingPartitionIds: [],
  blockedPartitions: [],
  blockedPartitionCount: 0,
  largestSpreadGap: 0,
  totalSpreadGap: 0,
});

function buildDecisionSnapshots() {
  return {
    capturedAt: 2000,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
    partitionIdsBySemanticState: {
      converged: [],
      spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
      needs_operation: [],
      operation_stalled: [],
      learner_promotion_blocked: [],
      coordination_mismatch: [],
      recovering_in_flight: [],
      blocked_unclassified: [],
    },
    snapshots: [{
      partitionId: TEST_PRIORITY_PARTITION_ID,
      publication: {
        concreteEligibleNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
      },
    }],
  };
}

test('buildCanonicalPublicationRecoveryEvidence narrows stale owner stream missing-published debt with count-only ACK debt',
  (t) => {
    const broadMissingPublishedNodeIds = [
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
      TEST_NODE_ID.FIFTH,
    ];
    const narrowedOwnerReconcileNodeIds = [
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.FIFTH,
    ];
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: broadMissingPublishedNodeIds,
        missingPublishedCount: broadMissingPublishedNodeIds.length,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      publicationConvergenceGate: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        pendingAckEvidenceState:
          PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
        missingPublishedNodeIds: broadMissingPublishedNodeIds,
        missingPublishedCount: broadMissingPublishedNodeIds.length,
        reasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        publicationPending: true,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        publicationOwnerStream: {
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
          pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          pendingAckEvidenceState:
            PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
          missingPublishedNodeIds: broadMissingPublishedNodeIds,
          missingPublishedCount: broadMissingPublishedNodeIds.length,
          streamOutcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
          recoveryOutcome:
            PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
        },
      },
      activeGate: {
        progress: {
          expectedNodeCount: TEST_ACTIVE_GATE_EXPECTED_NODE_COUNT,
          selectedPublishedActiveNodeIds: [TEST_NODE_ID.FIRST],
          selectedMissingPublishedNodeIds: broadMissingPublishedNodeIds,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
          missingPublishedCount: broadMissingPublishedNodeIds.length,
          membershipPublicationHandoffOutcomeState:
            TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
          membershipPublicationHandoffOutcomeEnqueued: true,
          publicationActiveGateHandoffState:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
          publicationActiveGateHandoffReasonCode:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
              .OWNER_RECONCILE_PENDING,
          publicationActiveGateHandoffNextAction:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
          publicationActiveGateHandoffRuntimePromotionAllowed: false,
          publicationActiveGateHandoffPendingReconcileNodeIds:
            narrowedOwnerReconcileNodeIds,
          publicationActiveGateHandoffPendingReconcileCount:
            narrowedOwnerReconcileNodeIds.length,
        },
      },
    });

    t.equal(
      evidence.publicationConvergenceGate.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      narrowedOwnerReconcileNodeIds,
    );
    t.equal(
      evidence.publicationConvergenceGate.missingPublishedCount,
      narrowedOwnerReconcileNodeIds.length,
    );
    t.same(
      evidence.publicationConvergenceGate.publicationOwnerStream
        .missingPublishedNodeIds,
      narrowedOwnerReconcileNodeIds,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      narrowedOwnerReconcileNodeIds,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      narrowedOwnerReconcileNodeIds.length,
    );
    t.same(
      evidence.publicationConvergence.publicationOwnerStream
        .missingPublishedNodeIds,
      narrowedOwnerReconcileNodeIds,
    );
    t.match(evidence.publicationConvergence.publicationActiveGateHandoff, {
      state: TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      pendingReconcileCount: narrowedOwnerReconcileNodeIds.length,
      pendingReconcileNodeIds: narrowedOwnerReconcileNodeIds,
    });
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence carries classified workflow backpressure handoff',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
          TEST_NODE_ID.FOURTH,
          TEST_NODE_ID.FIFTH,
        ],
        missingPublishedCount: TEST_SELECTED_ONLY_MISSING_NODE_IDS.length +
          TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        priorityRecoveryPartitionWitnesses: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          currentOwner: TEST_OPERATION_WORKFLOW_OWNER,
          blockingBoundary: TEST_OPERATION_WORKFLOW_BOUNDARY,
          nextRequiredAction: TEST_OPERATION_WORKFLOW_ADVANCE_ACTION,
          actuationState: TEST_OPERATION_WORKFLOW_ACTUATION_STATE,
          waitMode: TEST_OPERATION_WORKFLOW_WAIT_MODE,
          workflowProgressPhaseId: TEST_OPERATION_WORKFLOW_PROGRESS_PHASE,
          operationIds: [TEST_OPERATION_WORKFLOW_OPERATION_ID],
        }],
      },
      activeGate: {
        progress: {
          selectedPublishedActiveNodeIds: [TEST_NODE_ID.FIRST],
          selectedMissingPublishedNodeIds:
            TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
          publicationActiveGateHandoffState:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
          publicationActiveGateHandoffReasonCode:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
              .OWNER_RECONCILE_PENDING,
          publicationActiveGateHandoffNextAction:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
          publicationActiveGateHandoffRuntimePromotionAllowed: false,
          publicationActiveGateHandoffPendingReconcileNodeIds:
            TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
          publicationActiveGateHandoffPendingReconcileCount:
            TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT,
        },
      },
    });

    t.match(
      evidence.publicationConvergence.publicationActiveGateHandoff
        .operationWorkflowHandoff,
      {
        state: TEST_OPERATION_WORKFLOW_HANDOFF_STATE,
        reasonCode: TEST_OPERATION_WORKFLOW_HANDOFF_REASON_CODE,
        publicationOwner: TEST_PUBLICATION_OWNER,
        publicationBoundary: TEST_PUBLICATION_BOUNDARY,
        downstreamOwner: TEST_OPERATION_WORKFLOW_OWNER,
        downstreamBoundary: TEST_OPERATION_WORKFLOW_BOUNDARY,
        downstreamRequiredAction: TEST_OPERATION_WORKFLOW_ADVANCE_ACTION,
        publicationNextAction:
          TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        runtimePromotionAllowed: false,
        actuationState: TEST_OPERATION_WORKFLOW_ACTUATION_STATE,
        waitMode: TEST_OPERATION_WORKFLOW_WAIT_MODE,
        workflowProgressPhaseId: TEST_OPERATION_WORKFLOW_PROGRESS_PHASE,
        partitionIds: [TEST_PRIORITY_PARTITION_ID],
        operationIds: [TEST_OPERATION_WORKFLOW_OPERATION_ID],
      },
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence emits active-gate handoff for unpublished publication pending',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
        recoveryProtocolState:
          RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
        publicationPending: true,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        prioritySpreadPending: false,
      },
      activeGate: {
        progress: {
          expectedNodeCount: TEST_ACTIVE_GATE_EXPECTED_NODE_COUNT,
        },
      },
    });

    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.match(evidence.publicationConvergence.publicationActiveGateHandoff, {
      state: TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: false,
      pendingReconcileCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      pendingReconcileNodeIds: TEST_EMPTY_NODE_IDS,
    });
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence projects owner reconcile narrowing into the priority observation',
  (t) => {
    const stalePublicationReasonCodes = Object.freeze([
      TEST_PUBLICATION_PENDING_REASON_CODE,
      TEST_STALE_REASON_CODE,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_PENDING_ACK,
    ]);
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
          TEST_NODE_ID.FOURTH,
          TEST_NODE_ID.FIFTH,
        ],
        missingPublishedCount: TEST_SELECTED_ONLY_MISSING_NODE_IDS.length +
          TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT,
        priorityRecoveryReasonCodes: stalePublicationReasonCodes,
        priorityPartitionSummary: TEST_ZERO_GAP_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
          TEST_NODE_ID.FOURTH,
          TEST_NODE_ID.FIFTH,
        ],
        missingPublishedCount: TEST_SELECTED_ONLY_MISSING_NODE_IDS.length +
          TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT,
        priorityRecoveryReasonCodes: stalePublicationReasonCodes,
        publicationPending: true,
        prioritySpreadPending: true,
        priorityPartitionSummary: TEST_ZERO_GAP_PRIORITY_PARTITION_SUMMARY,
      },
      activeGate: {
        progress: {
          publicationActiveGateHandoffState:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
          publicationActiveGateHandoffReasonCode:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
              .OWNER_RECONCILE_PENDING,
          publicationActiveGateHandoffNextAction:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
          publicationActiveGateHandoffRuntimePromotionAllowed: false,
          publicationActiveGateHandoffPendingReconcileNodeIds:
            TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
          publicationActiveGateHandoffPendingReconcileCount:
            TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT,
        },
      },
    });

    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.same(
      evidence.priorityRecoveryObservation.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.equal(
      evidence.priorityRecoveryObservation.missingPublishedCount,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS.length,
    );
    t.equal(evidence.priorityRecoveryObservation.pendingAckCount, 0);
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes
        .includes(TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_PENDING_ACK),
      false,
    );
    t.same(evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes, [
      TEST_PUBLICATION_PENDING_REASON_CODE,
    ]);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence closes stale open publication when selected membership proves the cohort',
  (t) => {
    const selectedPublicationCohortNodeIds = Object.freeze([
      TEST_NODE_ID.FIRST,
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
      TEST_NODE_ID.FIFTH,
    ]);
    const selectedMissingPublishedNodeIds = Object.freeze([
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
      TEST_NODE_ID.FIFTH,
    ]);
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: selectedMissingPublishedNodeIds,
        missingPublishedCount: selectedMissingPublishedNodeIds.length,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      activeGate: {
        progress: {
          expectedNodeCount: selectedPublicationCohortNodeIds.length,
          selectedPublishedActiveNodeIds: [TEST_NODE_ID.FIRST],
          selectedPublishedActiveCount: TEST_PUBLICATION_DEBT_COUNT,
          selectedMissingPublishedNodeIds,
          pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
          missingPublishedCount: selectedMissingPublishedNodeIds.length,
          prioritySpreadSatisfied: true,
          priorityRecoveryProgressClasses: {
            unresolvedClassCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            unresolvedSemanticStateCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            blockedPartitionCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          },
        },
      },
    });

    t.equal(
      evidence.publicationConvergence.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    t.equal(
      evidence.publicationConvergence.recoveryProtocolState,
      RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    );
    t.same(
      evidence.publicationConvergence.publishedActiveNodeIds,
      selectedPublicationCohortNodeIds,
    );
    t.equal(
      evidence.publicationConvergence.pendingAckCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
    );
    t.equal(
      evidence.publicationConvergence.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.FRESH,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.READY,
    );
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence keeps selected membership closure ahead of stale owner reconcile handoff',
  (t) => {
    const selectedPublicationCohortNodeIds = Object.freeze([
      TEST_NODE_ID.FIRST,
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
      TEST_NODE_ID.FIFTH,
    ]);
    const selectedMissingPublishedNodeIds = Object.freeze([
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
      TEST_NODE_ID.FIFTH,
    ]);
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: selectedMissingPublishedNodeIds,
        missingPublishedCount: selectedMissingPublishedNodeIds.length,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      activeGate: {
        progress: {
          expectedNodeCount: selectedPublicationCohortNodeIds.length,
          selectedPublishedActiveNodeIds: [TEST_NODE_ID.FIRST],
          selectedPublishedActiveCount: TEST_PUBLICATION_DEBT_COUNT,
          selectedMissingPublishedNodeIds,
          pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          missingPublishedCount: selectedMissingPublishedNodeIds.length,
          prioritySpreadSatisfied: true,
          publicationActiveGateHandoffState:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
          publicationActiveGateHandoffReasonCode:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
              .OWNER_RECONCILE_PENDING,
          publicationActiveGateHandoffNextAction:
            TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
          publicationActiveGateHandoffRuntimePromotionAllowed: false,
          publicationActiveGateHandoffPendingReconcileNodeIds:
            TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
          publicationActiveGateHandoffPendingReconcileCount:
            TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT,
          priorityRecoveryProgressClasses: {
            unresolvedClassCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            unresolvedSemanticStateCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            blockedPartitionCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          },
        },
      },
    });

    t.equal(
      evidence.publicationConvergence.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    );
    t.equal(
      evidence.publicationConvergence.recoveryProtocolState,
      RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    );
    t.same(
      evidence.publicationConvergence.publishedActiveNodeIds,
      selectedPublicationCohortNodeIds,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.READY,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence filters stale presentation-only publication gate reasons',
  (t) => {
    const stalePresentationReasonCodes = Object.freeze([
      TEST_STALE_PRESENTATION_REASON_CODE
        .PRIORITY_CONTROL_PLANE_SPREAD_PENDING,
      TEST_STALE_REASON_CODE,
      TEST_PUBLICATION_PENDING_REASON_CODE,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_MISSING_ACTIVE_NODE,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_NOT_PUBLISHED_OPEN,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_PENDING_ACK,
    ]);
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: stalePresentationReasonCodes,
        prioritySpreadPending: true,
      },
      publicationConvergenceGate: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        reasonCodes: stalePresentationReasonCodes,
        publicationPending: true,
        prioritySpreadPending: true,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: stalePresentationReasonCodes,
        publicationPending: true,
        prioritySpreadPending: true,
      },
    });

    t.same(evidence.publicationConvergenceGate.reasonCodes, [
      TEST_PUBLICATION_PENDING_REASON_CODE,
      TEST_STALE_REASON_CODE,
    ]);
    t.same(evidence.publicationConvergence.priorityRecoveryReasonCodes, [
      TEST_PUBLICATION_PENDING_REASON_CODE,
      TEST_STALE_REASON_CODE,
    ]);
    t.equal(
      evidence.publicationConvergenceGate.reasonCodes.includes(
        TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_PENDING_ACK,
      ),
      false,
    );
    t.equal(evidence.publicationConvergenceGate.pendingAckCount, 0);
    t.equal(evidence.publicationConvergence.pendingAckCount, 0);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence closes zero-gap stale priority spread on open publication',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [
          TEST_PUBLICATION_PENDING_REASON_CODE,
          TEST_STALE_REASON_CODE,
        ],
        prioritySpreadPending: true,
        priorityPartitionSummary: TEST_ZERO_GAP_PRIORITY_PARTITION_SUMMARY,
      },
    });

    t.equal(evidence.publicationConvergenceGate.prioritySpreadPending, false);
    t.same(evidence.publicationConvergenceGate.reasonCodes, [
      TEST_PUBLICATION_PENDING_REASON_CODE,
    ]);
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.same(evidence.publicationConvergence.priorityRecoveryReasonCodes, [
      TEST_PUBLICATION_PENDING_REASON_CODE,
    ]);
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence closes published empty pending ACK list reentry debt',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
    });

    t.equal(
      evidence.publicationConvergenceGate.state,
      PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG,
    );
    t.equal(evidence.publicationConvergenceGate.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergenceGate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
    );
    t.equal(evidence.publicationConvergenceGate.publicationPending, false);
    t.equal(
      evidence.publicationConvergenceGate.reasonCodes.includes(
        TEST_PUBLICATION_PENDING_REASON_CODE,
      ),
      false,
    );
    t.equal(evidence.priorityRecoveryObservation.pendingAckCount, 0);
    t.same(
      evidence.priorityRecoveryObservation.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergence.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence carries pending ACK targets from priority decision snapshots',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryDecisionSnapshots: {
        snapshots: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          publication: {
            pendingAckNodeIds: [TEST_NODE_ID.SECOND],
          },
        }],
      },
    });

    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_DECISION_SNAPSHOT_ACK_TARGET_ASSERTION,
    );
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_DECISION_SNAPSHOT_ACK_TARGET_ASSERTION,
    );
    t.same(
      evidence.priorityRecoveryObservation.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_DECISION_SNAPSHOT_ACK_TARGET_ASSERTION,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence prefers the derived current observation when a stale observation keeps old blocked semantic states on the same ready gate',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [],
        priorityRecoverySemanticStateIds: ['recovering_in_flight'],
        priorityRecoveryBlockedPartitionIds: [TEST_PRIORITY_PARTITION_ID],
        priorityRecoveryPartitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [TEST_PRIORITY_PARTITION_ID],
          blocked_unclassified: [],
        },
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.same(
      evidence.priorityRecoveryObservation.priorityRecoverySemanticStateIds,
      [],
      'the decision-layer current summary should retire stale unresolved semantic states even when the gate state is already ready',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
      [],
      'current blocked partition ids should be rebuilt from the canonical decision summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .recovering_in_flight,
      [],
      'historical in-flight states should not survive as the current semantic-state contract',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [TEST_PRIORITY_PARTITION_ID],
      'the spread-satisfied lane should remain the current canonical semantic state',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence scopes current priority-recovery blockers to tracked priority partitions',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [
          'operation_created_but_no_step_transitions',
        ],
        priorityRecoverySemanticStateIds: ['operation_stalled'],
        priorityRecoveryBlockedPartitionIds: [TEST_NON_PRIORITY_PARTITION_ID],
        priorityRecoveryPartitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [TEST_NON_PRIORITY_PARTITION_ID],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
      },
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        partitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [TEST_NON_PRIORITY_PARTITION_ID],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        snapshots: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          publication: {
            concreteEligibleNodeIds: [
              TEST_NODE_ID.FIRST,
              TEST_NODE_ID.SECOND,
              TEST_NODE_ID.THIRD,
            ],
          },
        }, {
          partitionId: TEST_NON_PRIORITY_PARTITION_ID,
          blockerReasons: ['operation_created_but_no_step_transitions'],
          completion: {
            state: 'operation_stalled',
          },
          publication: {
            concreteEligibleNodeIds: [
              TEST_NODE_ID.FIRST,
              TEST_NODE_ID.SECOND,
              TEST_NODE_ID.THIRD,
            ],
          },
        }],
      },
    });

    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryProgressClassIds,
      [],
      'derived canonical evidence should retire non-priority workflow blockers from the current priority-recovery class summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoverySemanticStateIds,
      [],
      'derived canonical evidence should retire non-priority semantic blockers from the current priority-recovery summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
      [],
      'derived canonical evidence should not keep non-priority stalled partitions as current priority-recovery blockers',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [TEST_PRIORITY_PARTITION_ID],
      'the tracked priority partition should remain the canonical current semantic state',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .operation_stalled,
      [],
      'non-priority partitions should be excluded from the canonical current semantic-state map',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence preserves observation-only witness diagnostics when no independent canonical source exists',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [],
        priorityRecoveryProgressClassCount: 0,
        priorityRecoverySemanticStateIds: [],
        priorityRecoverySemanticStateCount: 0,
        priorityRecoveryBlockedPartitionIds: [],
        priorityRecoveryBlockedPartitionCount: 0,
        priorityRecoveryPartitionWitnesses: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          semanticStateId: 'spread_satisfied_in_flight',
          completionState: 'converged',
          workflowState: 'remove_phase',
          visibilityState: 'cache_visible',
          operationIds: ['op-spread-satisfied-active'],
        }],
      },
    });

    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses
        .length,
      1,
      'observation-only witness lists should remain available as diagnostics instead of being erased by a gate derived from the same observation',
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.partitionId,
      TEST_PRIORITY_PARTITION_ID,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.semanticStateId,
      'spread_satisfied_in_flight',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence preserves witness diagnostics when publication convergence only mirrors the same ready observation',
  (t) => {
    const observation = {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      priorityRecoveryReasonCodes: [],
      prioritySpreadPending: false,
      priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      priorityRecoveryProgressClassIds: [],
      priorityRecoveryProgressClassCount: 0,
      priorityRecoverySemanticStateIds: [],
      priorityRecoverySemanticStateCount: 0,
      priorityRecoveryBlockedPartitionIds: [],
      priorityRecoveryBlockedPartitionCount: 0,
      priorityRecoveryPartitionWitnesses: [{
        partitionId: TEST_PRIORITY_PARTITION_ID,
        semanticStateId: 'spread_satisfied_in_flight',
        completionState: 'converged',
        workflowState: 'remove_phase',
        visibilityState: 'cache_visible',
        operationIds: ['op-spread-satisfied-active'],
      }],
    };
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: observation,
    });

    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses
        .length,
      1,
      'a publication-convergence projection of the same ready observation should not erase retained witness diagnostics',
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.partitionId,
      TEST_PRIORITY_PARTITION_ID,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence narrows open publication debt using options.publicationActiveGateHandoff override',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: 'unknown',
        recoveryProtocolState: 'unpublished_observation',
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      publicationActiveGateHandoff: {
        state: 'pending',
        reasonCode: 'owner_reconcile_pending',
        nextAction: 'reconcile_owner_membership_publication',
        runtimePromotionAllowed: false,
      },
    });

    // With the override present, the deficit should narrow from unknown/unpublished_observation, meaning hasCountOnlyUnknownPublicationDeficit is false.
    // So the protocol state should correctly transition to the base membership state instead of staying in unpublished_observation.
    t.equal(evidence.publicationConvergence.recoveryProtocolState !== 'unpublished_observation', true);
    t.equal(
      evidence.publicationConvergence.publicationActiveGateHandoff?.state,
      'pending',
    );
    t.end();
  });

test('TopologyEpochFencer advance and fencing validation', (t) => {
  const fencer = new TopologyEpochFencer(5);
  t.equal(fencer.currentEpoch, 5);
  t.equal(fencer.advanceEpoch(), 6);
  t.equal(fencer.currentEpoch, 6);

  // Assert valid epoch does not throw
  t.equal(fencer.assertEpochValid(6), true);
  t.equal(fencer.assertEpochValid(7), true);

  // Assert stale epoch throws a fencing violation error
  t.throws(() => {
    fencer.assertEpochValid(5);
  }, /Fencing Violation/);

  t.end();
});

test('PublicationRecoveryLease expiration and liveness step down', (t) => {
  const lease = new PublicationRecoveryLease(1000);
  t.equal(lease.isExpired(1000), true);

  lease.acquire(1000);
  t.equal(lease.active, true);
  t.equal(lease.isExpired(1500), false);
  t.equal(lease.isExpired(2500), true);

  let steppedDown = false;
  const result = lease.evaluateLivenessOrStepDown(2500, () => {
    steppedDown = true;
  });

  t.equal(result, true);
  t.equal(lease.active, false);
  t.equal(steppedDown, true);

  t.end();
});

test('adjudicateRecoveryPreemption under handoff, epoch mismatch, and healthy state', (t) => {
  // 1. Healthy state
  const healthy = adjudicateRecoveryPreemption({
    publicationActiveGateHandoffPendingReconcileCount: 0,
    localEpoch: 5,
    globalEpoch: 5,
  });
  t.equal(healthy.decision, RECOVERY_PREEMPTION_DECISION.CONTINUE);
  t.match(healthy.reason, /No active preemption triggers/);

  // 2. Downstream pending handoff
  const handoffPending = adjudicateRecoveryPreemption({
    publicationActiveGateHandoffPendingReconcileCount: 2,
    localEpoch: 5,
    globalEpoch: 5,
  });
  t.equal(handoffPending.decision, RECOVERY_PREEMPTION_DECISION.PREEMPT_AND_BYPASS);
  t.match(handoffPending.reason, /Downstream active-gate reconcile handoff is pending/);

  // 3. Stale epoch mismatch
  const staleEpoch = adjudicateRecoveryPreemption({
    publicationActiveGateHandoffPendingReconcileCount: 0,
    localEpoch: 4,
    globalEpoch: 5,
  });
  t.equal(staleEpoch.decision, RECOVERY_PREEMPTION_DECISION.PREEMPT_AND_BYPASS);
  t.match(staleEpoch.reason, /Local coordination epoch is stale/);

  t.end();
});

test('buildCanonicalPublicationRecoveryEvidence preemption adjudication and lease expired integration', (t) => {
  const lease = new PublicationRecoveryLease(1000);
  lease.acquire(1000);

  const evidence = buildCanonicalPublicationRecoveryEvidence({
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: 'unknown',
      recoveryProtocolState: 'unpublished_observation',
      pendingAckNodeIds: [],
      priorityRecoveryReasonCodes: [],
      priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
    },
    localEpoch: 4,
    globalEpoch: 5,
    lease,
    now: 2500, // force expiration
  });

  t.equal(
    evidence.preemptionAdjudication.decision,
    RECOVERY_PREEMPTION_DECISION.PREEMPT_AND_BYPASS,
  );
  t.match(evidence.preemptionAdjudication.reason, /Local coordination epoch is stale/);
  t.equal(evidence.leaseExpired, true);

  t.end();
});
