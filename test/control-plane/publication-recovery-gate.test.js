import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
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
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';

const TEST_PUBLICATION_EPOCH = 7;
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
    t.same(gate.pendingAckNodeIds, [TEST_NODE_ID.SECOND]);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
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

test('buildPublicationRecoveryGateSnapshot keeps publication pending when published membership still excludes required nodes',
  (t) => {
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

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.publicationPending, true);
    t.equal(gate.missingPublishedCount, 1);
    t.same(gate.missingPublishedNodeIds, [TEST_NODE_ID.SECOND]);
    t.same(gate.reasonCodes, [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ]);
    t.end();
  });
