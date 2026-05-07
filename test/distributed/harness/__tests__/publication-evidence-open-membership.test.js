import assert from 'node:assert/strict';
import {it} from 'node:test';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../../src/control-plane/membership-lifecycle-constants.js';
import {
  buildCanonicalPublicationEvidenceFromControlPlane,
} from '../publication-evidence-contract.js';

const TEST_NAME =
  'buildCanonicalPublicationEvidenceFromControlPlane keeps current selected ' +
  'publication-membership deficit when publication recovery remains open';
const TEST_PUBLICATION_EPOCH = 3;
const TEST_EXPECTED_NODE_COUNT = 5;
const TEST_ACTIVE_NODE_COUNT = 3;
const TEST_SNAPSHOT_COVERAGE_COUNT = 2;
const TEST_PENDING_ACK_COUNT = 1;
const TEST_EMPTY_COUNT = 0;
const TEST_PRIORITY_SPREAD_GAP = 9;
const TEST_PRIORITY_BLOCKED_PARTITION_COUNT = 3;
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_EMPTY_GATE_REASONS = Object.freeze([]);
const TEST_PRIORITY_RECOVERY_REASON_CODES = Object.freeze([
  'priority_partitions_not_spread',
]);
const TEST_PRIORITY_RECOVERY_UNRESOLVED_CLASS_IDS = Object.freeze([
  'priority_operation_serial_wait',
]);
const TEST_PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS = Object.freeze([
  'needs_operation',
]);
const TEST_PRIORITY_RECOVERY_BLOCKED_PARTITION_IDS = Object.freeze([
  'sql_write_operations-p1',
]);
const TEST_PRIORITY_RECOVERY_BLOCKERS = Object.freeze([
  'snapshot_coverage=2/5',
  'priority_recovery_progress_class=priority_operation_serial_wait',
]);
const TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS = Object.freeze([
  '11601fe0-72d6-5853-8590-ec2881853e72',
  '7493b0ab-a054-5fad-a91b-5e331db29304',
  '8be8d30f-4499-5eed-865c-71b4d529a67a',
]);
const TEST_SELECTED_MISSING_NODE_IDS = Object.freeze([
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
]);
const TEST_PER_NODE_PUBLICATION_DISAGREEMENT_SET = Object.freeze({
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[0]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[1]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[2]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_SELECTED_MISSING_NODE_IDS[0]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_SELECTED_MISSING_NODE_IDS[1]]: TEST_SELECTED_MISSING_NODE_IDS,
});

it(TEST_NAME, () => {
  const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      publishedActiveNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PENDING_ACK_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: true,
      prioritySpreadPending: true,
      priorityRecoveryReasonCodes: TEST_PRIORITY_RECOVERY_REASON_CODES,
    },
    priorityRecoveryObservation: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PENDING_ACK_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: true,
      prioritySpreadPending: true,
      priorityRecoveryReasonCodes: TEST_PRIORITY_RECOVERY_REASON_CODES,
      publicationConvergenceGateReasons: TEST_PRIORITY_RECOVERY_REASON_CODES,
    },
    activeGate: {
      mode: 'startup',
      ready: false,
      progress: {
        expectedNodeCount: TEST_EXPECTED_NODE_COUNT,
        activeNodeCount: TEST_ACTIVE_NODE_COUNT,
        snapshotCoverageNodeCount: TEST_SNAPSHOT_COVERAGE_COUNT,
        snapshotCoverageComplete: false,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        selectedPublishedActiveNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        selectedPublishedActiveCount:
          TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
        selectedMissingPublishedNodeIds: TEST_SELECTED_MISSING_NODE_IDS,
        pendingAckCount: TEST_PENDING_ACK_COUNT,
        missingPublishedCount: TEST_SELECTED_MISSING_NODE_IDS.length,
        perNodePublicationDisagreementSet:
          TEST_PER_NODE_PUBLICATION_DISAGREEMENT_SET,
        gateReasons: TEST_EMPTY_GATE_REASONS,
        prioritySpreadSatisfied: false,
        prioritySpreadGap: TEST_PRIORITY_SPREAD_GAP,
        priorityBlockedPartitionCount: TEST_PRIORITY_BLOCKED_PARTITION_COUNT,
        priorityRecoveryProgressClasses: {
          unresolvedClassIds: TEST_PRIORITY_RECOVERY_UNRESOLVED_CLASS_IDS,
          unresolvedClassCount:
            TEST_PRIORITY_RECOVERY_UNRESOLVED_CLASS_IDS.length,
          unresolvedSemanticStateIds:
            TEST_PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
          unresolvedSemanticStateCount:
            TEST_PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.length,
          blockedPartitionIds: TEST_PRIORITY_RECOVERY_BLOCKED_PARTITION_IDS,
          blockedPartitionCount:
            TEST_PRIORITY_RECOVERY_BLOCKED_PARTITION_IDS.length,
        },
        blockers: TEST_PRIORITY_RECOVERY_BLOCKERS,
      },
    },
  });
  const activeGateProgress =
    publicationEvidence.priorityRecoveryObservation.activeGate.progress;

  assert.equal(
    publicationEvidence.publicationConvergence.pendingAckCount,
    TEST_PENDING_ACK_COUNT,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.missingPublishedCount,
    TEST_SELECTED_MISSING_NODE_IDS.length,
  );
  assert.deepEqual(
    publicationEvidence.publicationConvergence.missingPublishedNodeIds,
    TEST_SELECTED_MISSING_NODE_IDS,
  );
  assert.equal(
    activeGateProgress.missingPublishedCount,
    TEST_SELECTED_MISSING_NODE_IDS.length,
  );
  assert.deepEqual(
    activeGateProgress.selectedMissingPublishedNodeIds,
    TEST_SELECTED_MISSING_NODE_IDS,
  );
  assert.deepEqual(activeGateProgress.gateReasons, TEST_EMPTY_GATE_REASONS);
});
