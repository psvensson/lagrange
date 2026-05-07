import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../src/control-plane/control-plane-publication-merge.js';
import {RECOVERY_PROTOCOL_STATE} from
  '../../src/control-plane/membership-lifecycle-constants.js';
import {buildCanonicalPublicationRecoveryEvidence} from
  '../../src/control-plane/publication-recovery-evidence.js';

const TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence keeps current selected ' +
  'publication-membership deficit while publication recovery remains open';
const TEST_PUBLICATION_EPOCH = 9;
const TEST_EMPTY_COUNT = 0;
const TEST_PENDING_ACK_COUNT = 1;
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
const TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS = Object.freeze([
  'node-a',
  'node-b',
  'node-c',
]);
const TEST_SELECTED_MISSING_NODE_IDS = Object.freeze([
  'node-d',
  'node-e',
]);
const TEST_EXPECTED_NODE_COUNT =
  TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length +
  TEST_SELECTED_MISSING_NODE_IDS.length;
const TEST_CURRENT_SELECTED_PUBLICATION_DISAGREEMENT_SET = Object.freeze({
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[0]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[1]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS[2]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_SELECTED_MISSING_NODE_IDS[0]]: TEST_SELECTED_MISSING_NODE_IDS,
  [TEST_SELECTED_MISSING_NODE_IDS[1]]: TEST_SELECTED_MISSING_NODE_IDS,
});
const TEST_PRIORITY_RECOVERY_REASON_CODES = Object.freeze([
  'publication_epoch_pending',
]);
const STEADY_TEST_NAME =
  'buildCanonicalPublicationRecoveryEvidence keeps current selected ' +
  'publication-membership deficit while steady-published startup ' +
  'progress remains incomplete';
const STEADY_PUBLICATION_EPOCH = 10;
const STEADY_EMPTY_REASON_CODES = Object.freeze([]);
const STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS = Object.freeze([
  'steady-node-a',
]);
const STEADY_SELECTED_MISSING_NODE_IDS = Object.freeze([
  'steady-node-b',
  'steady-node-c',
]);
const STEADY_EXPECTED_NODE_COUNT =
  STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS.length +
  STEADY_SELECTED_MISSING_NODE_IDS.length;
const STEADY_CURRENT_SELECTED_PUBLICATION_DISAGREEMENT_SET = Object.freeze({
  [STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS[0]]:
    STEADY_SELECTED_MISSING_NODE_IDS,
  [STEADY_SELECTED_MISSING_NODE_IDS[0]]: STEADY_SELECTED_MISSING_NODE_IDS,
  [STEADY_SELECTED_MISSING_NODE_IDS[1]]: STEADY_SELECTED_MISSING_NODE_IDS,
});

test(TEST_NAME, (t) => {
  const evidence = buildCanonicalPublicationRecoveryEvidence({
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
    },
    activeGate: {
      progress: {
        expectedNodeCount: TEST_EXPECTED_NODE_COUNT,
        selectedPublishedActiveNodeIds: TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        selectedPublishedActiveCount:
          TEST_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
        selectedMissingPublishedNodeIds: TEST_SELECTED_MISSING_NODE_IDS,
        pendingAckCount: TEST_PENDING_ACK_COUNT,
        missingPublishedCount: TEST_SELECTED_MISSING_NODE_IDS.length,
        perNodePublicationDisagreementSet:
          TEST_CURRENT_SELECTED_PUBLICATION_DISAGREEMENT_SET,
      },
    },
  });

  t.equal(
    evidence.publicationConvergenceGate.pendingAckCount,
    TEST_PENDING_ACK_COUNT,
  );
  t.equal(
    evidence.publicationConvergenceGate.missingPublishedCount,
    TEST_SELECTED_MISSING_NODE_IDS.length,
  );
  t.same(
    evidence.publicationConvergenceGate.missingPublishedNodeIds,
    TEST_SELECTED_MISSING_NODE_IDS,
  );
  t.equal(
    evidence.publicationConvergence.pendingAckCount,
    TEST_PENDING_ACK_COUNT,
  );
  t.equal(
    evidence.publicationConvergence.missingPublishedCount,
    TEST_SELECTED_MISSING_NODE_IDS.length,
  );
  t.same(
    evidence.publicationConvergence.missingPublishedNodeIds,
    TEST_SELECTED_MISSING_NODE_IDS,
  );
  t.end();
});

test(STEADY_TEST_NAME, (t) => {
  const evidence = buildCanonicalPublicationRecoveryEvidence({
    publicationConvergence: {
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      publishedActiveNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: false,
      prioritySpreadPending: false,
      priorityRecoveryReasonCodes: STEADY_EMPTY_REASON_CODES,
    },
    publicationConvergenceGate: {
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      requiredAckNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      acknowledgedNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount: TEST_EMPTY_COUNT,
      publicationPending: false,
      prioritySpreadPending: false,
      reasonCodes: STEADY_EMPTY_REASON_CODES,
    },
    priorityRecoveryObservation: {
      publicationEpoch: STEADY_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      publishedActiveNodeIds: STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_EMPTY_COUNT,
      missingPublishedNodeIds: STEADY_SELECTED_MISSING_NODE_IDS,
      missingPublishedCount: STEADY_SELECTED_MISSING_NODE_IDS.length,
      publicationPending: false,
      prioritySpreadPending: false,
      priorityRecoveryReasonCodes: STEADY_EMPTY_REASON_CODES,
    },
    activeGate: {
      progress: {
        expectedNodeCount: STEADY_EXPECTED_NODE_COUNT,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        selectedPublishedActiveNodeIds:
          STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS,
        selectedPublishedActiveCount:
          STEADY_AUTHORITATIVE_PUBLISHED_NODE_IDS.length,
        selectedMissingPublishedNodeIds: STEADY_SELECTED_MISSING_NODE_IDS,
        pendingAckCount: TEST_EMPTY_COUNT,
        missingPublishedCount: STEADY_SELECTED_MISSING_NODE_IDS.length,
        prioritySpreadSatisfied: true,
        priorityRecoveryProgressClasses: {
          unresolvedClassCount: TEST_EMPTY_COUNT,
          unresolvedSemanticStateCount: TEST_EMPTY_COUNT,
          blockedPartitionCount: TEST_EMPTY_COUNT,
        },
        perNodePublicationDisagreementSet:
          STEADY_CURRENT_SELECTED_PUBLICATION_DISAGREEMENT_SET,
      },
    },
  });

  t.equal(
    evidence.publicationConvergenceGate.missingPublishedCount,
    STEADY_SELECTED_MISSING_NODE_IDS.length,
  );
  t.same(
    evidence.publicationConvergenceGate.missingPublishedNodeIds,
    STEADY_SELECTED_MISSING_NODE_IDS,
  );
  t.equal(
    evidence.publicationConvergence.missingPublishedCount,
    STEADY_SELECTED_MISSING_NODE_IDS.length,
  );
  t.same(
    evidence.publicationConvergence.missingPublishedNodeIds,
    STEADY_SELECTED_MISSING_NODE_IDS,
  );
  t.end();
});
