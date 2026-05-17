import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../src/control-plane/control-plane-publication-merge.js';
import {
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from '../../src/control-plane/publication-owner-constants.js';
import {RECOVERY_PROTOCOL_STATE} from
  '../../src/control-plane/membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {buildCanonicalPublicationRecoveryEvidence} from
  '../../src/control-plane/publication-recovery-evidence.js';

const TEST_PUBLICATION_EPOCH = 9;
const TEST_EMPTY_PUBLICATION_DEBT_COUNT = 0;
const TEST_PUBLICATION_DEBT_COUNT = 1;
const TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT = 2;
const TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT = 3;
const TEST_PUBLISHED_ACTIVE_NODE_COUNT = 3;
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
  THIRD: 'node-c',
  FOURTH: 'node-d',
  FIFTH: 'node-e',
});
const TEST_CLOSURE_RECORD_ID = 'CL-003';
const TEST_CLOSURE_WITNESS_CLASS =
  'publication_converged_priority_spread_pending';
const TEST_CLOSURE_WITNESS_STATE = 'closure_satisfied_stale_publication';
const TEST_PUBLICATION_PENDING_REASON_CODE = 'publication_epoch_pending';
const TEST_STALE_REASON_CODE = 'priority_partitions_not_spread';
const TEST_STALE_PRESENTATION_REASON_CODE = Object.freeze({
  PRIORITY_CONTROL_PLANE_SPREAD_PENDING:
    'priority_control_plane_spread_pending',
  PUBLICATION_MISSING_ACTIVE_NODE: 'publication_missing_active_node=node-b',
  PUBLICATION_NOT_PUBLISHED_OPEN: 'publication_not_published=OPEN',
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
const TEST_NON_PRIORITY_PARTITION_ID =
  'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
const TEST_DECISION_SNAPSHOT_ACK_TARGET_ASSERTION =
  'decision snapshot ACK targets should become canonical pending ACK evidence';
const TEST_COUNT_ONLY_REENTRY_ACK_TARGET_ASSERTION =
  'count-only canonical reentry should preserve explicit pending ACK targets';
const TEST_COUNT_ONLY_REENTRY_ACK_TARGET_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence keeps pending ACK targets ' +
  'when empty required lists are canonical reentry noise';
const TEST_STALE_PUBLISHED_PUBLICATION_PENDING_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence settles stale published ' +
  'publication pending evidence';
const TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS = Object.freeze([
  TEST_NODE_ID.FIRST,
  TEST_NODE_ID.SECOND,
  TEST_NODE_ID.THIRD,
]);
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
const TEST_STALE_PRIORITY_RECOVERY_CLOSURE_WITNESS = Object.freeze({
  state: TEST_CLOSURE_WITNESS_STATE,
  prioritySpreadPending: false,
  publicationRefreshRequired: true,
  closureRecordId: TEST_CLOSURE_RECORD_ID,
  closureWitnessClass: TEST_CLOSURE_WITNESS_CLASS,
  refreshedPriorityPartitionSummary:
    TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
  summarySpreadPending: true,
  publicationEpoch: TEST_PUBLICATION_EPOCH,
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

test('buildCanonicalPublicationRecoveryEvidence closes stale spread metadata from the decision-layer closure witness',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        publishedActiveNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      publicationConvergenceGate: {
        state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        ready: false,
        active: true,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        reasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        publicationPending: false,
        prioritySpreadPending: true,
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.equal(evidence.publicationConvergenceGate.prioritySpreadPending, false);
    t.equal(
      evidence.publicationConvergenceGate.closureRecordId,
      TEST_CLOSURE_RECORD_ID,
    );
    t.equal(
      evidence.publicationConvergenceGate.closureWitnessClass,
      TEST_CLOSURE_WITNESS_CLASS,
    );
    t.same(
      evidence.publicationConvergenceGate.priorityPartitionSummary,
      TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
    );
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.priorityRecoveryObservation.prioritySpreadPending, false);
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryClosureState,
      TEST_CLOSURE_WITNESS_STATE,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary?.satisfied,
      true,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary
        ?.blockedPartitionCount,
      0,
    );
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.equal(
      evidence.publicationConvergence.closureRecordId,
      TEST_CLOSURE_RECORD_ID,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence retires stale closure diagnostics after durable spread metadata refreshes',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        publishedActiveNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryClosureWitness:
          TEST_STALE_PRIORITY_RECOVERY_CLOSURE_WITNESS,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        prioritySpreadPending: true,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        closureRecordId: TEST_CLOSURE_RECORD_ID,
        closureWitnessClass: TEST_CLOSURE_WITNESS_CLASS,
      },
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.publicationConvergenceGate.closureRecordId, null);
    t.equal(evidence.publicationConvergenceGate.closureWitnessClass, null);
    t.equal(evidence.priorityRecoveryObservation.prioritySpreadPending, false);
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes,
      [],
    );
    t.equal(evidence.priorityRecoveryObservation.closureRecordId, null);
    t.equal(evidence.priorityRecoveryObservation.closureWitnessClass, null);
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.same(evidence.publicationConvergence.priorityRecoveryReasonCodes, []);
    t.equal(evidence.publicationConvergence.closureRecordId, null);
    t.equal(evidence.publicationConvergence.closureWitnessClass, null);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence rebuilds a stale observation from the canonical publication gate',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        prioritySpreadPending: true,
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.priorityRecoveryObservation.prioritySpreadPending, false);
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes,
      [],
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary?.satisfied,
      true,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary
        ?.blockedPartitionCount,
      0,
    );
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.same(evidence.publicationConvergence.priorityRecoveryReasonCodes, []);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence does not reopen publication pending from selected-snapshot-only deficits outside the authoritative cohort',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        publishedActiveNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        pendingAckNodeIds: [],
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [],
        missingPublishedNodeIds: [],
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      },
      publicationConvergenceGate: {
        ready: true,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        requiredAckNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        acknowledgedNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        pendingAckNodeIds: [],
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        publicationPending: false,
        prioritySpreadPending: false,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: [],
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: TEST_SELECTED_ONLY_MISSING_NODE_IDS,
        missingPublishedCount: TEST_SELECTED_ONLY_MISSING_NODE_IDS.length,
        publicationPending: true,
        prioritySpreadPending: false,
      },
      activeGate: {
        progress: {
          expectedNodeCount:
            TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length +
            TEST_SELECTED_ONLY_MISSING_NODE_IDS.length,
          selectedPublishedActiveNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
          selectedPublishedActiveCount:
            TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
          selectedMissingPublishedNodeIds: TEST_SELECTED_ONLY_MISSING_NODE_IDS,
          pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          missingPublishedCount: TEST_SELECTED_ONLY_MISSING_NODE_IDS.length,
        },
      },
    });

    t.equal(evidence.publicationConvergenceGate.publicationPending, false);
    t.equal(evidence.publicationConvergenceGate.missingPublishedCount, 0);
    t.same(evidence.publicationConvergenceGate.missingPublishedNodeIds, []);
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.equal(evidence.publicationConvergence.missingPublishedCount, 0);
    t.same(evidence.publicationConvergence.missingPublishedNodeIds, []);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence carries owner stream consumer lag',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        requiredAckNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        acknowledgedNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
    });

    t.equal(
      evidence.publicationConvergence.publicationOwnerStream.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    );
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.end();
  });

test(TEST_STALE_PUBLISHED_PUBLICATION_PENDING_TEST_NAME, (t) => {
  const evidence = buildCanonicalPublicationRecoveryEvidence({
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      missingPublishedCount: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
      priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
      priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
    },
  });

  t.equal(
    evidence.publicationConvergenceGate.state,
    PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG,
  );
  t.equal(evidence.publicationConvergenceGate.publicationPending, false);
  t.equal(
    evidence.publicationConvergenceGate.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
  );
  t.equal(evidence.publicationConvergence.publicationPending, false);
  t.equal(
    evidence.publicationConvergence.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
  );
  t.same(
    evidence.publicationConvergence.priorityRecoveryReasonCodes,
    [TEST_STALE_REASON_CODE],
  );
  t.end();
});

test('buildCanonicalPublicationRecoveryEvidence keeps active-gate publication debt over stale top-level zero counts',
  (t) => {
    const activeGateProgress = {
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      selectedMissingPublishedNodeIds: [TEST_NODE_ID.SECOND],
    };
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        pendingAckNodeIds: [],
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        pendingAckNodeIds: [],
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [],
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        activeGateProgress,
      },
      activeGateProgress,
    });

    t.equal(
      evidence.publicationConvergenceGate.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.publicationConvergenceGate.missingPublishedCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.priorityRecoveryObservation.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.priorityRecoveryObservation.missingPublishedCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      [TEST_NODE_ID.SECOND],
    );
    t.equal(
      evidence.publicationConvergence.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence lets an explicit empty required ACK list override stale pending counts',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
        acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        pendingAckNodeIds: [TEST_NODE_ID.SECOND],
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      },
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.equal(evidence.publicationConvergenceGate.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergenceGate.publicationPending, false);
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.priorityRecoveryObservation.pendingAckCount, 0);
    t.same(
      evidence.priorityRecoveryObservation.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.priorityRecoveryObservation.publicationPending, false);
    t.equal(evidence.publicationConvergence.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.end();
  });

test(TEST_COUNT_ONLY_REENTRY_ACK_TARGET_TEST_NAME,
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
        acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckNodeIds: [TEST_NODE_ID.SECOND],
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
    });

    t.equal(
      evidence.publicationConvergenceGate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_COUNT_ONLY_REENTRY_ACK_TARGET_ASSERTION,
    );
    t.equal(
      evidence.publicationConvergenceGate.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.priorityRecoveryObservation.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_COUNT_ONLY_REENTRY_ACK_TARGET_ASSERTION,
    );
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      [TEST_NODE_ID.SECOND],
      TEST_COUNT_ONLY_REENTRY_ACK_TARGET_ASSERTION,
    );
    t.equal(
      evidence.publicationConvergence.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence lets closed ACK lists and selected coverage retire stale debt',
  (t) => {
    const activeGateProgress = {
      expectedNodeCount: TEST_PUBLISHED_ACTIVE_NODE_COUNT,
      selectedPublishedActiveNodeIds: [
        TEST_NODE_ID.FIRST,
        TEST_NODE_ID.SECOND,
        TEST_NODE_ID.THIRD,
      ],
      selectedPublishedActiveCount: TEST_PUBLISHED_ACTIVE_NODE_COUNT,
      selectedMissingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
    };
    const stalePublicationRecoveryGate = {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [
        TEST_NODE_ID.FIRST,
        TEST_NODE_ID.SECOND,
        TEST_NODE_ID.THIRD,
      ],
      acknowledgedNodeIds: [
        TEST_NODE_ID.FIRST,
        TEST_NODE_ID.SECOND,
        TEST_NODE_ID.THIRD,
      ],
      pendingAckNodeIds: [TEST_NODE_ID.SECOND],
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
    };
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        requiredAckNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
        acknowledgedNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
        pendingAckNodeIds: [TEST_NODE_ID.SECOND],
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        publicationRecoveryGate: stalePublicationRecoveryGate,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        pendingAckNodeIds: [TEST_NODE_ID.SECOND],
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      },
      activeGateProgress,
    });

    t.equal(evidence.publicationConvergenceGate.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergenceGate.missingPublishedCount, 0);
    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.priorityRecoveryObservation.pendingAckCount, 0);
    t.same(
      evidence.priorityRecoveryObservation.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.priorityRecoveryObservation.missingPublishedCount, 0);
    t.same(
      evidence.priorityRecoveryObservation.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergence.pendingAckCount, 0);
    t.same(
      evidence.publicationConvergence.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergence.missingPublishedCount, 0);
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence preserves count-only ACK debt across canonicalization reentry',
  (t) => {
    const firstEvidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
    });
    const secondEvidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: firstEvidence.publicationConvergence,
    });

    t.equal(
      firstEvidence.publicationConvergence.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(
      firstEvidence.publicationConvergence.requiredAckNodeIds,
      undefined,
    );
    t.equal(
      secondEvidence.publicationConvergenceGate.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      secondEvidence.publicationConvergenceGate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(secondEvidence.publicationConvergenceGate.ready, false);
    t.equal(secondEvidence.publicationConvergenceGate.publicationPending, true);
    t.equal(
      secondEvidence.publicationConvergence.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      secondEvidence.publicationConvergence.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence reduces open count-only ACK evidence to publishing',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
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
      PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING,
    );
    t.equal(
      evidence.publicationConvergenceGate.pendingAckCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergenceGate.pendingAckNodeIds,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.priorityRecoveryObservation.pendingAckCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(evidence.publicationConvergence.pendingAckCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
    );
    t.equal(
      evidence.publicationConvergence.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence carries flattened active-gate owner reconcile handoff on open publication',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publishedActiveNodeIds: [TEST_NODE_ID.FIRST],
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
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

    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.match(evidence.publicationConvergence.publicationActiveGateHandoff, {
      state: TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: false,
      pendingReconcileCount:
        TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT,
      pendingReconcileNodeIds: TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    });
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
