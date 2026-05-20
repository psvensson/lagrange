import assert from 'node:assert/strict';
import {it} from 'node:test';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../../src/control-plane/membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../../../src/control-plane/publication-recovery-gate.js';
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
const STEADY_TEST_NAME =
  'buildCanonicalPublicationEvidenceFromControlPlane keeps steady-published ' +
  'selected-membership deficit across current and last meaningful progress';
const STEADY_PUBLICATION_EPOCH = 4;
const STEADY_EXPECTED_NODE_COUNT = 3;
const STEADY_ACTIVE_NODE_COUNT = 1;
const STEADY_SNAPSHOT_COVERAGE_COUNT = 1;
const STEADY_ZERO_COUNT = 0;
const STEADY_EMPTY_REASON_CODES = Object.freeze([]);
const STEADY_EMPTY_GATE_REASONS = Object.freeze([]);
const STEADY_BLOCKERS = Object.freeze([
  'snapshot_coverage=1/3',
]);
const STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS = Object.freeze([
  'steady-node-a',
]);
const STEADY_SELECTED_MISSING_NODE_IDS = Object.freeze([
  'steady-node-b',
  'steady-node-c',
]);
const STEADY_PER_NODE_PUBLICATION_DISAGREEMENT_SET = Object.freeze({
  [STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS[0]]:
    STEADY_SELECTED_MISSING_NODE_IDS,
  [STEADY_SELECTED_MISSING_NODE_IDS[0]]: STEADY_SELECTED_MISSING_NODE_IDS,
  [STEADY_SELECTED_MISSING_NODE_IDS[1]]: STEADY_SELECTED_MISSING_NODE_IDS,
});
const STEADY_EMPTY_PROGRESS_CLASSES = Object.freeze({
  unresolvedClassIds: Object.freeze([]),
  unresolvedClassCount: STEADY_ZERO_COUNT,
  unresolvedSemanticStateIds: Object.freeze([]),
  unresolvedSemanticStateCount: STEADY_ZERO_COUNT,
  blockedPartitionIds: Object.freeze([]),
  blockedPartitionCount: STEADY_ZERO_COUNT,
});
const PUBLISHED_ACK_FRONTIER_TEST_NAME =
  'buildCanonicalPublicationEvidenceFromControlPlane closes publication ' +
    'pending when published ACK evidence is acknowledged';
const CLOSED_GATE_WRAPPER_TEST_NAME =
  'buildCanonicalPublicationEvidenceFromControlPlane keeps outer publication ' +
    'pending aligned with a closed no-debt gate';
const OWNER_RECONCILE_HANDOFF_TEST_NAME =
  'buildCanonicalPublicationEvidenceFromControlPlane narrows open ' +
    'publication debt from owner-reconcile handoff evidence';
const PUBLISHED_ACK_FRONTIER_EPOCH = 5;
const PUBLISHED_ACK_FRONTIER_ZERO_COUNT = 0;
const PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS = Object.freeze([
  'published-frontier-node-a',
  'published-frontier-node-b',
  'published-frontier-node-c',
]);
const PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS = Object.freeze([
  'published-frontier-node-d',
  'published-frontier-node-e',
]);
const PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES = Object.freeze([
  'priority_partitions_not_spread',
]);
const PUBLISHED_ACK_FRONTIER_EMPTY_GATE_REASONS = Object.freeze([]);
const PUBLISHED_ACK_FRONTIER_PROGRESS_CLASSES = Object.freeze({
  unresolvedClassIds: Object.freeze([]),
  unresolvedClassCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
  unresolvedSemanticStateIds: Object.freeze([]),
  unresolvedSemanticStateCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
  blockedPartitionIds: Object.freeze([]),
  blockedPartitionCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
});
const PUBLISHED_ACK_FRONTIER_PER_NODE_PUBLICATION_DISAGREEMENT_SET =
  Object.freeze({
    [PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS[0]]:
      PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
    [PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS[1]]:
      PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
    [PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS[2]]:
      PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
    [PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS[0]]:
      PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
    [PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS[1]]:
      PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
  });
const OWNER_RECONCILE_HANDOFF_STATE = Object.freeze({
  PENDING: 'pending',
});
const OWNER_RECONCILE_HANDOFF_REASON = Object.freeze({
  OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
});
const OWNER_RECONCILE_HANDOFF_NEXT_ACTION = Object.freeze({
  RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
});
const OWNER_RECONCILE_HANDOFF_OUTCOME_STATE = Object.freeze({
  WRITE_DEFERRED: 'write_deferred',
});
const OWNER_RECONCILE_BROAD_MISSING_NODE_IDS = Object.freeze([
  'owner-reconcile-node-b',
  'owner-reconcile-node-c',
  'owner-reconcile-node-d',
  'owner-reconcile-node-e',
]);
const OWNER_RECONCILE_HANDOFF_NODE_IDS = Object.freeze([
  'owner-reconcile-node-b',
  'owner-reconcile-node-e',
]);
const OWNER_RECONCILE_PUBLISHED_NODE_IDS = Object.freeze([
  'owner-reconcile-node-a',
]);

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

it(STEADY_TEST_NAME, () => {
  const steadyLastMeaningfulProgress = {
    expectedNodeCount: STEADY_EXPECTED_NODE_COUNT,
    activeNodeCount: STEADY_ACTIVE_NODE_COUNT,
    snapshotCoverageNodeCount: STEADY_SNAPSHOT_COVERAGE_COUNT,
    snapshotCoverageComplete: false,
    publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    publicationEpoch: STEADY_PUBLICATION_EPOCH,
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    selectedPublishedActiveNodeIds:
      STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
    selectedPublishedActiveCount:
      STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
    selectedMissingPublishedNodeIds: STEADY_SELECTED_MISSING_NODE_IDS,
    pendingAckCount: STEADY_ZERO_COUNT,
    missingPublishedCount: STEADY_ZERO_COUNT,
    perNodePublicationDisagreementSet:
      STEADY_PER_NODE_PUBLICATION_DISAGREEMENT_SET,
    gateReasons: STEADY_EMPTY_GATE_REASONS,
    prioritySpreadSatisfied: true,
    prioritySpreadGap: STEADY_ZERO_COUNT,
    priorityBlockedPartitionCount: STEADY_ZERO_COUNT,
    priorityRecoveryProgressClasses: STEADY_EMPTY_PROGRESS_CLASSES,
    blockers: STEADY_BLOCKERS,
  };
  const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
    publicationConvergence: {
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      publishedActiveNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: STEADY_ZERO_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: STEADY_ZERO_COUNT,
      publicationPending: false,
      prioritySpreadPending: false,
      priorityRecoveryReasonCodes: STEADY_EMPTY_REASON_CODES,
    },
    publicationConvergenceGate: {
      ready: true,
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      requiredAckNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      acknowledgedNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: STEADY_ZERO_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: STEADY_ZERO_COUNT,
      publicationPending: false,
      prioritySpreadPending: false,
      reasonCodes: STEADY_EMPTY_REASON_CODES,
      reasons: STEADY_EMPTY_REASON_CODES,
    },
    priorityRecoveryObservation: {
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      publishedActiveNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: STEADY_ZERO_COUNT,
      missingPublishedNodeIds: STEADY_SELECTED_MISSING_NODE_IDS,
      missingPublishedCount: STEADY_SELECTED_MISSING_NODE_IDS.length,
      publicationPending: false,
      prioritySpreadPending: false,
      priorityRecoveryReasonCodes: STEADY_EMPTY_REASON_CODES,
      publicationConvergenceGateReasons: STEADY_EMPTY_REASON_CODES,
    },
    activeGate: {
      mode: 'startup',
      ready: false,
      progress: {
        expectedNodeCount: STEADY_EXPECTED_NODE_COUNT,
        activeNodeCount: STEADY_ACTIVE_NODE_COUNT,
        snapshotCoverageNodeCount: STEADY_SNAPSHOT_COVERAGE_COUNT,
        snapshotCoverageComplete: false,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publicationEpoch: STEADY_PUBLICATION_EPOCH,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        selectedPublishedActiveNodeIds:
          STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        selectedPublishedActiveCount:
          STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
        selectedMissingPublishedNodeIds: STEADY_SELECTED_MISSING_NODE_IDS,
        pendingAckCount: STEADY_ZERO_COUNT,
        missingPublishedCount: STEADY_SELECTED_MISSING_NODE_IDS.length,
        perNodePublicationDisagreementSet:
          STEADY_PER_NODE_PUBLICATION_DISAGREEMENT_SET,
        gateReasons: STEADY_EMPTY_GATE_REASONS,
        prioritySpreadSatisfied: true,
        prioritySpreadGap: STEADY_ZERO_COUNT,
        priorityBlockedPartitionCount: STEADY_ZERO_COUNT,
        priorityRecoveryProgressClasses: STEADY_EMPTY_PROGRESS_CLASSES,
        blockers: STEADY_BLOCKERS,
      },
      lastMeaningfulProgress: steadyLastMeaningfulProgress,
    },
  });
  const activeGate =
    publicationEvidence.priorityRecoveryObservation.activeGate;

  assert.equal(
    publicationEvidence.publicationConvergence.missingPublishedCount,
    STEADY_SELECTED_MISSING_NODE_IDS.length,
  );
  assert.deepEqual(
    publicationEvidence.publicationConvergence.missingPublishedNodeIds,
    STEADY_SELECTED_MISSING_NODE_IDS,
  );
  assert.equal(
    activeGate.progress.missingPublishedCount,
    STEADY_SELECTED_MISSING_NODE_IDS.length,
  );
  assert.equal(
    activeGate.lastMeaningfulProgress.missingPublishedCount,
    STEADY_SELECTED_MISSING_NODE_IDS.length,
  );
  assert.deepEqual(
    activeGate.lastMeaningfulProgress.selectedMissingPublishedNodeIds,
    STEADY_SELECTED_MISSING_NODE_IDS,
  );
});

it(PUBLISHED_ACK_FRONTIER_TEST_NAME, () => {
  const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
    publicationConvergence: {
      publicationEpoch: PUBLISHED_ACK_FRONTIER_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      publishedActiveNodeIds: PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
      missingPublishedNodeIds: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
      missingPublishedCount: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
      publicationPending: true,
      prioritySpreadPending: true,
      priorityRecoveryReasonCodes:
        PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES,
    },
    publicationConvergenceGate: {
      publicationEpoch: PUBLISHED_ACK_FRONTIER_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
      requiredAckNodeIds: PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS,
      acknowledgedNodeIds: PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
      missingPublishedNodeIds: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
      missingPublishedCount: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
      publicationPending: false,
      prioritySpreadPending: true,
      reasonCodes: PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES,
      reasons: PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES,
    },
    priorityRecoveryObservation: {
      publicationEpoch: PUBLISHED_ACK_FRONTIER_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      publishedActiveNodeIds: PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
      missingPublishedNodeIds: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
      missingPublishedCount: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
      publicationPending: true,
      prioritySpreadPending: true,
      priorityRecoveryReasonCodes:
        PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES,
      publicationConvergenceGateReasons:
        PUBLISHED_ACK_FRONTIER_PRIORITY_REASON_CODES,
    },
    activeGate: {
      mode: 'startup',
      ready: false,
      progress: {
        expectedNodeCount:
          PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS.length +
          PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
        activeNodeCount: PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS.length,
        snapshotCoverageNodeCount:
          PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS.length,
        snapshotCoverageComplete: false,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publicationEpoch: PUBLISHED_ACK_FRONTIER_EPOCH,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        selectedPublishedActiveNodeIds:
          PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS,
        selectedPublishedActiveCount:
          PUBLISHED_ACK_FRONTIER_AUTHORITATIVE_NODE_IDS.length,
        selectedMissingPublishedNodeIds:
          PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS,
        pendingAckCount: PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
        missingPublishedCount: PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
        perNodePublicationDisagreementSet:
          PUBLISHED_ACK_FRONTIER_PER_NODE_PUBLICATION_DISAGREEMENT_SET,
        gateReasons: PUBLISHED_ACK_FRONTIER_EMPTY_GATE_REASONS,
        prioritySpreadSatisfied: false,
        priorityRecoveryProgressClasses:
          PUBLISHED_ACK_FRONTIER_PROGRESS_CLASSES,
      },
    },
  });

  assert.equal(
    publicationEvidence.publicationConvergence.pendingAckCount,
    PUBLISHED_ACK_FRONTIER_ZERO_COUNT,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.publicationPending,
    false,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.recoveryProtocolState,
    RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.missingPublishedCount,
    PUBLISHED_ACK_FRONTIER_MISSING_NODE_IDS.length,
  );
});

it(CLOSED_GATE_WRAPPER_TEST_NAME, () => {
  const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
    publicationConvergence: {
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: true,
      priorityRecoveryReasonCodes: TEST_EMPTY_GATE_REASONS,
    },
    publicationConvergenceGate: {
      ready: false,
      active: true,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
      requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
      acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: false,
      prioritySpreadPending: false,
      reasonCodes: TEST_EMPTY_GATE_REASONS,
      reasons: TEST_EMPTY_GATE_REASONS,
    },
  });

  assert.equal(
    publicationEvidence.publicationConvergence.publicationPending,
    false,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.publicationRecoveryGate
      .publicationPending,
    false,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.pendingAckCount,
    TEST_EMPTY_COUNT,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.missingPublishedCount,
    TEST_EMPTY_COUNT,
  );
});

it(OWNER_RECONCILE_HANDOFF_TEST_NAME, () => {
  const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      publishedActiveNodeIds: OWNER_RECONCILE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS,
      missingPublishedCount: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS.length,
      priorityRecoveryReasonCodes: TEST_PRIORITY_RECOVERY_REASON_CODES,
      priorityPartitionSummary: {
        satisfied: true,
      },
    },
    publicationConvergenceGate: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      pendingAckEvidenceState:
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      missingPublishedNodeIds: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS,
      missingPublishedCount: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS.length,
      publicationPending: true,
      priorityPartitionSummary: {
        satisfied: true,
      },
      reasonCodes: TEST_PRIORITY_RECOVERY_REASON_CODES,
      publicationOwnerStream: {
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
        pendingAckCount: TEST_EMPTY_COUNT,
        pendingAckEvidenceState:
          PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
        missingPublishedNodeIds: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS,
        missingPublishedCount: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS.length,
      },
    },
    activeGate: {
      progress: {
        expectedNodeCount:
          OWNER_RECONCILE_PUBLISHED_NODE_IDS.length +
          OWNER_RECONCILE_BROAD_MISSING_NODE_IDS.length,
        selectedPublishedActiveNodeIds: OWNER_RECONCILE_PUBLISHED_NODE_IDS,
        selectedMissingPublishedNodeIds:
          OWNER_RECONCILE_BROAD_MISSING_NODE_IDS,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
        pendingAckCount: TEST_PENDING_ACK_COUNT,
        missingPublishedCount: OWNER_RECONCILE_BROAD_MISSING_NODE_IDS.length,
        membershipPublicationHandoffOutcomeState:
          OWNER_RECONCILE_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
        membershipPublicationHandoffOutcomeEnqueued: true,
        publicationActiveGateHandoffState:
          OWNER_RECONCILE_HANDOFF_STATE.PENDING,
        publicationActiveGateHandoffReasonCode:
          OWNER_RECONCILE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        publicationActiveGateHandoffNextAction:
          OWNER_RECONCILE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        publicationActiveGateHandoffRuntimePromotionAllowed: false,
        publicationActiveGateHandoffPendingReconcileNodeIds:
          OWNER_RECONCILE_HANDOFF_NODE_IDS,
        publicationActiveGateHandoffPendingReconcileCount:
          OWNER_RECONCILE_HANDOFF_NODE_IDS.length,
      },
    },
  });

  assert.equal(
    publicationEvidence.publicationConvergence.pendingAckCount,
    TEST_PENDING_ACK_COUNT,
  );
  assert.deepEqual(
    publicationEvidence.publicationConvergence.missingPublishedNodeIds,
    OWNER_RECONCILE_HANDOFF_NODE_IDS,
  );
  assert.equal(
    publicationEvidence.publicationConvergence.missingPublishedCount,
    OWNER_RECONCILE_HANDOFF_NODE_IDS.length,
  );
  assert.deepEqual(
    publicationEvidence.publicationConvergence.publicationRecoveryGate
      .missingPublishedNodeIds,
    OWNER_RECONCILE_HANDOFF_NODE_IDS,
  );
});
