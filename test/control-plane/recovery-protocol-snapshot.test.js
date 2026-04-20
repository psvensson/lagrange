import {test} from '../../src/test-helpers/tap.js';
import {
  MEMBERSHIP_MEMBER_STATE,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildRecoveryProtocolSnapshot,
  NODE_PARTICIPATION_STATE,
  RECOVERY_PROTOCOL_STATE,
} from '../../src/control-plane/recovery-protocol-snapshot.js';

test('buildRecoveryProtocolSnapshot derives one canonical participation state per node',
  async (t) => {
    const snapshot = buildRecoveryProtocolSnapshot({
      publicationEpoch: 17,
      publicationStatus: 'ACK_PENDING',
      publishedActiveNodeIdsPresent: true,
      publishedActiveNodeIds: ['node-a'],
      durablePublishedActiveNodeIds: ['node-a'],
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['replica_operations-p1'],
      },
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-a'],
        projectedServingNodeIds: ['node-a', 'node-b'],
        locallyEligibleNodeIds: ['node-a', 'node-b'],
        recoveryActiveNodeIds: ['node-a', 'node-b'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-b'],
        suspectedOrTransitioningNodeIds: ['node-c'],
        memberStatesByNodeId: {
          'node-a': MEMBERSHIP_MEMBER_STATE.SERVING,
          'node-b': MEMBERSHIP_MEMBER_STATE.JOINING,
          'node-c': MEMBERSHIP_MEMBER_STATE.UNREACHABLE,
        },
        projectionDiagnostics: {
          recoveryEligibleIncludedNodeIds: ['node-b'],
          readinessExcludedNodeIds: ['node-c'],
          clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
        },
        membershipFreeze: {
          active: true,
          reasonCode: 'broad_suspicion',
          retainedPublishedNodeIds: ['node-a', 'node-c'],
          missingProjectedNodeIds: ['node-c'],
          unconfirmedProjectedNodeIds: [],
        },
      },
      targetNodeId: 'node-b',
    });

    t.equal(
      snapshot.recoveryProtocolState,
      RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
      'the protocol should remain in the publication-pending phase while the epoch is open',
    );
    t.same(
      snapshot.priorityRecoveryReasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'the shared protocol should preserve both publication and spread blockers',
    );
    t.match(snapshot.publicationRecoveryGate, {
      state: 'ack_pending',
      ready: false,
      pendingAckCount: 1,
    });
    t.match(snapshot.participationByNodeId, {
      'node-a': {
        state: NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE,
      },
      'node-b': {
        state: NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH,
        recoverySource: 'recovery_eligible_projection',
      },
      'node-c': {
        state: NODE_PARTICIPATION_STATE.SUSPECTED,
      },
    });
    t.match(snapshot.targetParticipation, {
      nodeId: 'node-b',
      state: NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH,
      recoverySource: 'recovery_eligible_projection',
    });
  });
