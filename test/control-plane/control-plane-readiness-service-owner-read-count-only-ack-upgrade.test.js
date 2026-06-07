import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
  createCache,
} from './control-plane-readiness-service-part-4-stage-1.js';

const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NAME_ASYNC =
  'ControlPlaneReadinessService owner-read planning answer upgrades direct count-only ACK debt to provided required-ACK evidence';
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NAME_SYNC =
  'ControlPlaneReadinessService owner-read sync planning answer upgrades direct count-only ACK debt to provided required-ACK evidence';
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID = Object.freeze({
  ASYNC: 'node-priority-owner-read-upgrade-count-only-ack',
  SYNC: 'node-priority-owner-read-sync-upgrade-count-only-ack',
});
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVED_AT = Object.freeze({
  ASYNC: 2460,
  SYNC: 2480,
});
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PUBLICATION_EPOCH = 50;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_COUNT = 1;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKED_NODE_ID = 'node-peer-a';
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_NODE_ID = 'node-peer-b';
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVATION_STATE =
  'authoritative';
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_SATISFIED = true;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_DISTINCT_NODE_COUNT = 3;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_READY_ELIGIBLE_NODE_COUNT = 3;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_TOTAL_PRIORITY_PARTITION_COUNT =
  1;
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_REASON_CODES =
  Object.freeze([
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  ]);
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_PARTITION_SUMMARY =
  Object.freeze({
    satisfied: TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_SATISFIED,
    requiredDistinctNodeCount:
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount:
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_READY_ELIGIBLE_NODE_COUNT,
    totalPriorityPartitionCount:
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_TOTAL_PRIORITY_PARTITION_COUNT,
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([]),
  });
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS =
  Object.freeze({
    ASYNC: Object.freeze([
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKED_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.ASYNC,
    ]),
    SYNC: Object.freeze([
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKED_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.SYNC,
    ]),
  });
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKNOWLEDGED_NODE_IDS =
  Object.freeze({
    ASYNC: Object.freeze([
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKED_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.ASYNC,
    ]),
    SYNC: Object.freeze([
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKED_NODE_ID,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.SYNC,
    ]),
  });
const TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS =
  Object.freeze([
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_NODE_ID,
  ]);

function createOwnerReadCountOnlyAckUpgradeService(mode) {
  const nodeId = TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID[mode];
  const requiredAckNodeIds =
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS[mode];
  const acknowledgedNodeIds =
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKNOWLEDGED_NODE_IDS[mode];
  const observedAt = TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVED_AT[mode];
  const membershipPublicationService = mode === 'ASYNC' ?
    {
      async getLatestPublicationForNode(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PUBLICATION_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
          pendingAckCount:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_COUNT,
          pendingAckNodeIds:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
          priorityPartitionSummary:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_PARTITION_SUMMARY,
        };
      },
      async deriveClusterMembershipCandidate() {
        return {
          targetNodeId: nodeId,
          publicationEpoch:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PUBLICATION_EPOCH,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          publicationObservationState:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVATION_STATE,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          priorityRecoveryReasonCodes:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_REASON_CODES,
          priorityPartitionSummary:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_PARTITION_SUMMARY,
          requiredAckNodeIds,
          acknowledgedNodeIds,
          pendingAckNodeIds:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
          pendingAckCount:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_COUNT,
        };
      },
    } :
    {
      getLatestPublicationForNodeSync(targetNodeId) {
        if (targetNodeId !== nodeId) {
          return null;
        }
        return {
          publicationEpoch:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PUBLICATION_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          createdAt: TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
          pendingAckCount:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_COUNT,
          pendingAckNodeIds:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
          priorityPartitionSummary:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_PARTITION_SUMMARY,
        };
      },
      deriveClusterMembershipCandidateSync() {
        return {
          targetNodeId: nodeId,
          publicationEpoch:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PUBLICATION_EPOCH,
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
          publicationObservationState:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVATION_STATE,
          recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
          priorityRecoveryReasonCodes:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_REASON_CODES,
          priorityPartitionSummary:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PRIORITY_PARTITION_SUMMARY,
          requiredAckNodeIds,
          acknowledgedNodeIds,
          pendingAckNodeIds:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
          pendingAckCount:
            TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_COUNT,
        };
      },
    };
  return new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: createCache(),
    membershipPublicationService,
    now: () => observedAt,
  });
}

test(TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NAME_ASYNC, async (t) => {
  const readinessService =
    createOwnerReadCountOnlyAckUpgradeService('ASYNC');
  const planningAnswer =
    await readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.ASYNC,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVED_AT.ASYNC,
    );

  t.equal(
    planningAnswer?.pendingAckEvidenceState,
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
  );
  t.same(
    planningAnswer?.requiredAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS.ASYNC,
  );
  t.same(
    planningAnswer?.acknowledgedNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_ACKNOWLEDGED_NODE_IDS.ASYNC,
  );
  t.same(
    planningAnswer?.pendingAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
  );
  t.equal(
    planningAnswer?.publicationRecoveryGate?.pendingAckEvidenceState,
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
  );
  t.same(
    planningAnswer?.publicationRecoveryGate?.requiredAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS.ASYNC,
  );
  t.end();
});

test(TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NAME_SYNC, (t) => {
  const readinessService =
    createOwnerReadCountOnlyAckUpgradeService('SYNC');
  const planningAnswer =
    readinessService.getPriorityRecoveryPlanningAnswerForOwnerReadSync(
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_NODE_ID.SYNC,
      TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_OBSERVED_AT.SYNC,
    );

  t.equal(
    planningAnswer?.pendingAckEvidenceState,
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
  );
  t.same(
    planningAnswer?.requiredAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS.SYNC,
  );
  t.same(
    planningAnswer?.pendingAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_PENDING_ACK_NODE_IDS,
  );
  t.equal(
    planningAnswer?.publicationRecoveryGate?.pendingAckEvidenceState,
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
  );
  t.same(
    planningAnswer?.publicationRecoveryGate?.requiredAckNodeIds,
    TEST_OWNER_READ_COUNT_ONLY_ACK_UPGRADE_REQUIRED_ACK_NODE_IDS.SYNC,
  );
  t.end();
});
