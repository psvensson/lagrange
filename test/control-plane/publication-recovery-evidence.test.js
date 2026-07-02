import './publication-recovery-evidence-handoff-test-cases.js';
import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../src/control-plane/control-plane-publication-merge.js';
import {
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_PRESSURE_STATE,
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
} from '../../src/control-plane/publication-recovery-evidence.js';

const TEST_PUBLICATION_EPOCH = 9;
const TEST_EMPTY_PUBLICATION_DEBT_COUNT = 0;
const TEST_PUBLICATION_DEBT_COUNT = 1;
const TEST_PUBLICATION_SELECTED_SNAPSHOT_FRONTIER_COUNT = 2;
const TEST_PUBLICATION_SELECTED_HANDOFF_PENDING_COUNT = 3;
const TEST_PUBLISHED_ACTIVE_NODE_COUNT = 3;
const TEST_ACTIVE_GATE_EXPECTED_NODE_COUNT = 5;
const TEST_UNKNOWN_PUBLICATION_MISSING_COUNT = 5;
const TEST_PRESSURE_RETRY_AFTER_MS = 250;
const TEST_PRESSURE_REASON_CODE = 'control_plane_pressure_degraded';
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
const TEST_COUNT_ONLY_REENTRY_ACK_TARGET_ASSERTION =
  'count-only canonical reentry should preserve explicit pending ACK targets';
const TEST_COUNT_ONLY_REENTRY_ACK_TARGET_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence keeps pending ACK targets ' +
  'when empty required lists are canonical reentry noise';
const TEST_STALE_PUBLISHED_PUBLICATION_PENDING_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence settles stale published ' +
  'publication pending evidence';
const TEST_UNKNOWN_COUNT_ONLY_PUBLICATION_PENDING_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence classifies unknown count-only ' +
  'publication debt as unpublished startup evidence';
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

test('buildCanonicalPublicationRecoveryEvidence projects pressure-deferred gate without reopening publication debt',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergenceGate: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
        missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        pressureState: PUBLICATION_OWNER_PRESSURE_STATE.COALESCED,
        pressureRetryAfterMs: TEST_PRESSURE_RETRY_AFTER_MS,
        pressureReasonCodes: [TEST_PRESSURE_REASON_CODE],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        publicationPending: true,
        pendingAckNodeIds: [TEST_NODE_ID.FOURTH],
        pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: [TEST_NODE_ID.FIFTH],
        missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
        priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
      },
    });

    t.equal(
      evidence.publicationConvergenceGate.state,
      PUBLICATION_RECOVERY_GATE_STATE.PRESSURE_DEFERRED,
    );
    t.equal(evidence.publicationConvergenceGate.ready, false);
    t.equal(evidence.publicationConvergenceGate.publicationPending, false);
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.equal(
      evidence.publicationConvergence.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PRESSURE_DEFERRED,
    );
    t.equal(
      evidence.publicationConvergence.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.PRESSURE_DEFERRED,
    );
    t.equal(
      evidence.publicationConvergence.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.PRESSURE_DEFERRED,
    );
    t.equal(
      evidence.priorityRecoveryObservation.publicationPending,
      false,
    );
    t.equal(
      evidence.priorityRecoveryObservation.pendingAckCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.priorityRecoveryObservation.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.priorityRecoveryObservation.pressureState,
      PUBLICATION_OWNER_PRESSURE_STATE.COALESCED,
    );
    t.equal(evidence.priorityRecoveryObservation.pressureDeferred, true);
    t.equal(evidence.priorityRecoveryObservation.pressureCoalesced, true);
    t.equal(
      evidence.priorityRecoveryObservation.pressureRetryAfterMs,
      TEST_PRESSURE_RETRY_AFTER_MS,
    );
    t.same(
      evidence.priorityRecoveryObservation.pressureReasonCodes,
      [TEST_PRESSURE_REASON_CODE],
    );
    t.same(evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes, []);
    t.end();
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

test(TEST_UNKNOWN_COUNT_ONLY_PUBLICATION_PENDING_TEST_NAME, (t) => {
  const evidence = buildCanonicalPublicationRecoveryEvidence({
    publicationConvergence: {
      publicationEpoch: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
      publicationPending: true,
      prioritySpreadPending: false,
      priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
      priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
    },
    priorityRecoveryObservation: {
      publicationEpoch: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      publicationPending: true,
      priorityRecoveryReasonCodes: [TEST_PUBLICATION_PENDING_REASON_CODE],
      priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
    },
    activeGate: {
      progress: {
        expectedNodeCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
        activeNodeCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        inactiveNodeCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
        snapshotCoverageNodeCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        snapshotCoverageComplete: false,
        publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
        publicationEpoch: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        selectedPublishedActiveNodeIds: TEST_EMPTY_NODE_IDS,
        selectedPublishedActiveCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        selectedMissingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
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
    evidence.publicationConvergenceGate.state,
    PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION,
  );
  t.equal(evidence.publicationConvergenceGate.publicationPending, false);
  t.same(evidence.publicationConvergenceGate.reasonCodes, TEST_EMPTY_NODE_IDS);
  t.equal(
    evidence.publicationConvergenceGate.missingPublishedCount,
    TEST_EMPTY_PUBLICATION_DEBT_COUNT,
  );
  t.same(
    evidence.publicationConvergenceGate.missingPublishedNodeIds,
    TEST_EMPTY_NODE_IDS,
  );
  t.equal(
    evidence.publicationConvergence.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
  );
  t.equal(evidence.publicationConvergence.publicationPending, false);
  t.same(
    evidence.publicationConvergence.priorityRecoveryReasonCodes,
    TEST_EMPTY_NODE_IDS,
  );
  t.equal(
    evidence.publicationConvergence.streamOutcome,
    PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
  );
  t.equal(evidence.priorityRecoveryObservation.publicationPending, false);
  t.same(
    evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes,
    TEST_EMPTY_NODE_IDS,
  );
  t.equal(
    evidence.priorityRecoveryObservation.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
  );
  t.end();
});

test('buildCanonicalPublicationRecoveryEvidence closes stale nested not-started count-only publication evidence',
  (t) => {
    const stalePublicationReasonCodes = Object.freeze([
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_CONVERGENCE_MISSING,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_MISSING_ACTIVE_NODE,
      TEST_STALE_PRESENTATION_REASON_CODE.PUBLICATION_NOT_PUBLISHED_UNKNOWN,
    ]);
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: null,
        publicationStatus: null,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
        publicationPending: true,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
        missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
        missingPublishedCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
        streamOutcome: PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
        recoveryOutcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
        prioritySpreadPending: false,
        priorityRecoveryReasonCodes: stalePublicationReasonCodes,
        publicationRecoveryGate: {
          state: PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION,
          ready: false,
          publicationEpoch: null,
          publicationStatus: null,
          recoveryProtocolState:
            RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
          publicationPending: false,
          pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
          pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
          missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
          missingPublishedCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
          streamOutcome: PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
          recoveryOutcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
          prioritySpreadPending: false,
          prioritySpreadEvidenceUnavailable: false,
          reasonCodes: TEST_EMPTY_NODE_IDS,
        },
        activeGate: {
          progress: {
            publicationStatus: null,
            recoveryProtocolState:
              RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
            expectedNodeCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
            selectedPublishedActiveNodeIds: TEST_EMPTY_NODE_IDS,
            selectedMissingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
            pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            missingPublishedCount: TEST_UNKNOWN_PUBLICATION_MISSING_COUNT,
            prioritySpreadSatisfied: true,
            priorityRecoveryProgressClasses: {
              unresolvedClassCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
              unresolvedSemanticStateCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
              blockedPartitionCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
            },
          },
        },
      },
    });

    t.equal(evidence.publicationConvergenceGate.publicationPending, false);
    t.equal(
      evidence.publicationConvergenceGate.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergenceGate.reasonCodes,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.publicationConvergence.publicationPending, false);
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergence.priorityRecoveryReasonCodes,
      TEST_EMPTY_NODE_IDS,
    );
    t.equal(evidence.priorityRecoveryObservation.publicationPending, false);
    t.equal(
      evidence.priorityRecoveryObservation.missingPublishedCount,
      TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes,
      TEST_EMPTY_NODE_IDS,
    );
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

test('buildCanonicalPublicationRecoveryEvidence narrows open publication debt from active-gate owner reconcile handoff',
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
    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergenceGate.missingPublishedCount,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS.length,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS.length,
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

test('buildCanonicalPublicationRecoveryEvidence narrows open publication debt from active-gate owner reconcile handoff when runtime promotion allowed is a string false',
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
          publicationActiveGateHandoffRuntimePromotionAllowed: 'false',
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
    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergenceGate.missingPublishedCount,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS.length,
    );
    t.same(
      evidence.publicationConvergence.missingPublishedNodeIds,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      TEST_SELECTED_HANDOFF_MISSING_NODE_IDS.length,
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

test('buildCanonicalPublicationRecoveryEvidence keeps write-deferred active-gate ACK debt aligned with a stale gate stream',
  (t) => {
    const missingPublishedNodeIds = [
      TEST_NODE_ID.SECOND,
      TEST_NODE_ID.THIRD,
      TEST_NODE_ID.FOURTH,
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
        missingPublishedNodeIds,
        missingPublishedCount: missingPublishedNodeIds.length,
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
        missingPublishedNodeIds,
        missingPublishedCount: missingPublishedNodeIds.length,
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
          missingPublishedNodeIds,
          missingPublishedCount: missingPublishedNodeIds.length,
          streamOutcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
          recoveryOutcome:
            PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
        },
      },
      activeGate: {
        progress: {
          expectedNodeCount: TEST_ACTIVE_GATE_EXPECTED_NODE_COUNT,
          selectedPublishedActiveNodeIds: [TEST_NODE_ID.FIRST],
          selectedPublishedActiveCount: TEST_PUBLICATION_DEBT_COUNT,
          selectedMissingPublishedNodeIds: missingPublishedNodeIds,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
          missingPublishedCount: missingPublishedNodeIds.length,
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
            missingPublishedNodeIds,
          publicationActiveGateHandoffPendingReconcileCount:
            missingPublishedNodeIds.length,
        },
      },
    });

    t.equal(
      evidence.publicationConvergenceGate.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.publicationConvergence.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.priorityRecoveryObservation.pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.equal(
      evidence.publicationConvergenceGate.publicationOwnerStream
        .pendingAckCount,
      TEST_PUBLICATION_DEBT_COUNT,
    );
    t.same(
      evidence.publicationConvergenceGate.missingPublishedNodeIds,
      missingPublishedNodeIds,
    );
    t.equal(
      evidence.publicationConvergence.missingPublishedCount,
      missingPublishedNodeIds.length,
    );
    t.match(evidence.publicationConvergence.publicationActiveGateHandoff, {
      state: TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: false,
      pendingReconcileCount: missingPublishedNodeIds.length,
      pendingReconcileNodeIds: missingPublishedNodeIds,
    });
    t.end();
  });
