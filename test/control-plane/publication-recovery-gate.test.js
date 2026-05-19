import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_PRESSURE_STATE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
} from '../../src/control-plane/publication-owner-state.js';

const TEST_PUBLICATION_EPOCH = 7;
const TEST_UNAVAILABLE_PUBLICATION_EPOCH = 0;
const TEST_CONFLICTING_PUBLICATION_EPOCH = 3;
const TEST_PUBLICATION_DEBT_COUNT = 1;
const TEST_EMPTY_PUBLICATION_DEBT_COUNT = 0;
const TEST_PRESSURE_RETRY_AFTER_MS = 250;
const TEST_PRESSURE_REASON_CODE = 'control_plane_pressure_degraded';
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
});
const TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TEST_PRIORITY_SPREAD_DECISION_SOURCE_OWNER_EVIDENCE_UNAVAILABLE =
  'owner_evidence_unavailable';
const TEST_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  BLOCKED: Object.freeze({
    satisfied: false,
    missingPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
  }),
  STALE_ZERO_GAP: Object.freeze({
    satisfied: false,
    blockedPartitionCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    largestSpreadGap: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
    totalSpreadGap: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
  }),
  SATISFIED: Object.freeze({
    satisfied: true,
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([]),
  }),
});
const TEST_PRIORITY_RECOVERY_CLOSURE_WITNESS = Object.freeze({
  state: PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
  prioritySpreadPending: false,
  publicationRefreshRequired: true,
  closureRecordId: PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
  closureWitnessClass:
    PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
      .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
  refreshedPriorityPartitionSummary:
    TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
});
const TEST_PRIORITY_RECOVERY_DECISION_SNAPSHOTS = Object.freeze({
  closureWitness: TEST_PRIORITY_RECOVERY_CLOSURE_WITNESS,
});
const TEST_SETTLED_PUBLISHED_MISSING_MEMBERSHIP_TEST_NAME =
  'buildPublicationRecoveryGateSnapshot settles publication pending when ' +
  'published membership still excludes required nodes';

test('buildPublicationRecoveryGateSnapshot emits pressure-deferred owner state without publication debt',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      pressureDeferred: true,
      pressureCoalesced: true,
      pressureRetryAfterMs: TEST_PRESSURE_RETRY_AFTER_MS,
      pressureReasonCodes: [TEST_PRESSURE_REASON_CODE],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PRESSURE_DEFERRED);
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(gate.pendingAckCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(gate.missingPublishedCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(
      gate.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.PRESSURE_DEFERRED,
    );
    t.equal(
      gate.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.PRESSURE_DEFERRED,
    );
    t.equal(
      gate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PRESSURE_DEFERRED,
    );
    t.equal(gate.pressureState, PUBLICATION_OWNER_PRESSURE_STATE.COALESCED);
    t.equal(gate.pressureDeferred, true);
    t.equal(gate.pressureCoalesced, true);
    t.equal(gate.pressureRetryAfterMs, TEST_PRESSURE_RETRY_AFTER_MS);
    t.same(gate.pressureReasonCodes, [TEST_PRESSURE_REASON_CODE]);
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot lets pressure state override stale open publication debt',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: [TEST_NODE_ID.FOURTH],
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.FIFTH],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      pressureState: PUBLICATION_OWNER_PRESSURE_STATE.COALESCED,
      pressureRetryAfterMs: TEST_PRESSURE_RETRY_AFTER_MS,
      pressureReasonCodes: [TEST_PRESSURE_REASON_CODE],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PRESSURE_DEFERRED);
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(gate.pendingAckCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(gate.missingPublishedCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(gate.pressureState, PUBLICATION_OWNER_PRESSURE_STATE.COALESCED);
    t.equal(gate.pressureDeferred, true);
    t.equal(gate.pressureCoalesced, true);
    t.equal(gate.pressureRetryAfterMs, TEST_PRESSURE_RETRY_AFTER_MS);
    t.same(gate.pressureReasonCodes, [TEST_PRESSURE_REASON_CODE]);
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot classifies acknowledgement lag explicitly',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, 1);
    t.equal(gate.ackState, PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK);
    t.equal(
      gate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    );
    t.same(gate.pendingAckNodeIds, [TEST_NODE_ID.SECOND]);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot preserves count-only publication debt',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, TEST_PUBLICATION_DEBT_COUNT);
    t.same(gate.pendingAckNodeIds, TEST_EMPTY_NODE_IDS);
    t.equal(
      gate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(gate.missingPublishedCount, TEST_PUBLICATION_DEBT_COUNT);
    t.equal(gate.ackPending, true);
    t.equal(gate.publicationPending, true);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot reduces open count-only ACK evidence to publication pending',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.same(gate.pendingAckNodeIds, TEST_EMPTY_NODE_IDS);
    t.equal(
      gate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(gate.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(gate.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(gate.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      gate.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.equal(gate.publicationPending, true);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot treats published empty pending ACK list as consumer lag',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, 0);
    t.same(gate.pendingAckNodeIds, TEST_EMPTY_NODE_IDS);
    t.equal(gate.ackPending, false);
    t.equal(gate.publicationPending, false);
    t.equal(
      gate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
    );
    t.equal(
      gate.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    );
    t.equal(
      gate.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.equal(
      gate.reasonCodes.includes(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ),
      false,
    );
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot preserves reason-only publication debt',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, true);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot closes stale ACK status when the required ACK list is empty',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
      acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY);
    t.equal(gate.ready, true);
    t.equal(gate.pendingAckCount, 0);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(
      gate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
    );
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot does not treat UNKNOWN no-debt unpublished observation as pending',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_UNAVAILABLE_PUBLICATION_EPOCH,
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: 0,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: 0,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(
      gate.state,
      PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION,
    );
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(gate.pendingAckCount, 0);
    t.equal(
      gate.pendingAckEvidenceState,
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
    );
    t.equal(gate.ackState, PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED);
    t.equal(
      gate.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    );
    t.equal(
      gate.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    );
    t.equal(
      gate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    );
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot does not let supplied NOT_STARTED stream reopen UNKNOWN no-debt observation',
  (t) => {
    const publicationOwnerStream = buildPublicationOwnerStreamState({
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
      acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: 0,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: 0,
    });

    const gate = buildPublicationRecoveryGateSnapshot({
      publicationOwnerStream,
      publicationEpoch: TEST_CONFLICTING_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckCount: 0,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.publicationOwnerStream, publicationOwnerStream);
    t.equal(
      publicationOwnerStream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    );
    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(gate.pendingAckCount, 0);
    t.equal(
      gate.recoveryProtocolState,
      RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    );
    t.equal(gate.ackState, PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED);
    t.equal(
      gate.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    );
    t.equal(
      gate.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    );
    t.equal(
      gate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    );
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot keeps count-only UNKNOWN owner stream deferred',
  (t) => {
    const publicationOwnerStream = buildPublicationOwnerStreamState({
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      publicationPendingHint: true,
      prioritySpreadPending: false,
    });

    const gate = buildPublicationRecoveryGateSnapshot({
      publicationOwnerStream,
      publicationEpoch: TEST_UNAVAILABLE_PUBLICATION_EPOCH,
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(
      publicationOwnerStream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    );
    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION);
    t.equal(gate.publicationPending, false);
    t.equal(gate.ackPending, false);
    t.equal(gate.pendingAckCount, TEST_EMPTY_PUBLICATION_DEBT_COUNT);
    t.equal(gate.missingPublishedCount, TEST_PUBLICATION_DEBT_COUNT);
    t.equal(
      gate.recoveryProtocolState,
      RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    );
    t.equal(gate.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED);
    t.same(gate.reasonCodes, TEST_EMPTY_NODE_IDS);

    const directGate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_UNAVAILABLE_PUBLICATION_EPOCH,
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(
      directGate.state,
      PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION,
    );
    t.equal(directGate.publicationPending, false);
    t.equal(
      directGate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    );
    t.same(directGate.reasonCodes, TEST_EMPTY_NODE_IDS);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot classifies priority spread once acknowledgements close',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.BLOCKED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, 0);
    t.equal(gate.prioritySpreadPending, true);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot lets satisfied summary close stale spread inputs',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY);
    t.equal(gate.ready, true);
    t.equal(gate.pendingAckCount, 0);
    t.equal(gate.prioritySpreadPending, false);
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot closes zero-gap stale spread summary',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      priorityPartitionSummary:
        TEST_PRIORITY_PARTITION_SUMMARY.STALE_ZERO_GAP,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, true);
    t.equal(gate.prioritySpreadPending, false);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot closes zero-gap stale owner stream spread',
  (t) => {
    const publicationOwnerStream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: true,
    });
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationOwnerStream,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_PUBLICATION_DEBT_COUNT,
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
      missingPublishedCount: TEST_PUBLICATION_DEBT_COUNT,
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      priorityPartitionSummary:
        TEST_PRIORITY_PARTITION_SUMMARY.STALE_ZERO_GAP,
    });

    t.equal(gate.publicationOwnerStream, publicationOwnerStream);
    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING);
    t.equal(gate.publicationPending, true);
    t.equal(gate.prioritySpreadPending, false);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot blocks on missing priority spread owner evidence',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
    });

    t.equal(
      gate.state,
      PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    );
    t.equal(gate.ready, false);
    t.equal(gate.prioritySpreadPending, false);
    t.equal(gate.prioritySpreadEvidenceUnavailable, true);
    t.equal(
      gate.prioritySpreadDecisionSource,
      TEST_PRIORITY_SPREAD_DECISION_SOURCE_OWNER_EVIDENCE_UNAVAILABLE,
    );
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON
        .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    ]);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot prefers the closure witness over stale durable spread metadata',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.BLOCKED,
      priorityRecoveryClosureWitness: TEST_PRIORITY_RECOVERY_CLOSURE_WITNESS,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY);
    t.equal(gate.ready, true);
    t.equal(gate.prioritySpreadPending, false);
    t.equal(
      gate.closureRecordId,
      PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
    );
    t.equal(
      gate.closureWitnessClass,
      PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
        .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
    );
    t.match(gate.priorityPartitionSummary, {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
    });
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot retires stale closure witness once durable spread metadata is refreshed',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
      priorityRecoveryClosureWitness: TEST_PRIORITY_RECOVERY_CLOSURE_WITNESS,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY);
    t.equal(gate.ready, true);
    t.equal(gate.prioritySpreadPending, false);
    t.equal(gate.closureRecordId, null);
    t.equal(gate.closureWitnessClass, null);
    t.equal(
      gate.priorityRecoveryClosureWitness.state,
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH,
    );
    t.equal(
      gate.priorityRecoveryClosureWitness.publicationRefreshRequired,
      false,
    );
    t.same(gate.reasonCodes, []);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot consumes the decision snapshot closure witness',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.BLOCKED,
      priorityRecoveryDecisionSnapshots:
        TEST_PRIORITY_RECOVERY_DECISION_SNAPSHOTS,
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY);
    t.equal(gate.ready, true);
    t.equal(gate.prioritySpreadPending, false);
    t.equal(
      gate.closureRecordId,
      PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
    );
    t.same(gate.reasonCodes, []);
    t.end();
  });

test(TEST_SETTLED_PUBLISHED_MISSING_MEMBERSHIP_TEST_NAME, (t) => {
  const gate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
    acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
    priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
    priorityRecoveryReasonCodes: [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ],
  });

  t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG);
  t.equal(gate.ready, false);
  t.equal(gate.publicationPending, false);
  t.equal(
    gate.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
  );
  t.equal(
    gate.freshnessFence,
    PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
  );
  t.equal(
    gate.recoveryOutcome,
    PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
  );
  t.equal(gate.missingPublishedCount, 1);
  t.same(gate.missingPublishedNodeIds, [TEST_NODE_ID.SECOND]);
  t.same(gate.reasonCodes, []);
  t.end();
});

test('buildPublicationRecoveryGateSnapshot uses supplied owner stream as authority',
  (t) => {
    const publicationOwnerStream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_EPOCH,
      desiredPublicationRevision: TEST_PUBLICATION_EPOCH,
      committedPublicationRevision: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
    });

    const gate = buildPublicationRecoveryGateSnapshot({
      publicationOwnerStream,
      publicationEpoch: TEST_CONFLICTING_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
      acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: 0,
      priorityPartitionSummary: TEST_PRIORITY_PARTITION_SUMMARY.SATISFIED,
    });

    t.equal(gate.publicationOwnerStream, publicationOwnerStream);
    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING);
    t.equal(gate.publicationEpoch, TEST_PUBLICATION_EPOCH);
    t.equal(
      gate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
    );
    t.equal(
      gate.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    );
    t.equal(gate.ackState, PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK);
    t.same(gate.requiredAckNodeIds, [
      TEST_NODE_ID.FIRST,
      TEST_NODE_ID.SECOND,
    ]);
    t.same(gate.acknowledgedNodeIds, [TEST_NODE_ID.FIRST]);
    t.same(gate.pendingAckNodeIds, [TEST_NODE_ID.SECOND]);
    t.equal(gate.pendingAckCount, TEST_PUBLICATION_DEBT_COUNT);
    t.equal(gate.publicationPending, true);
    t.equal(gate.ackPending, true);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });
