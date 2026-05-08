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
  PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE,
  RECOVERY_PROTOCOL_STATE,
} from '../../src/control-plane/recovery-protocol-snapshot.js';

const RECOVERY_PROTOCOL_ADMISSION_STATE_BLOCKED = 'blocked';
const RECOVERY_PROTOCOL_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
const RECOVERY_PROTOCOL_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([RECOVERY_PROTOCOL_ADMISSION_REASON_CLUSTER_INTEGRITY]),
});

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
    t.match(snapshot.publicationBoundaryOutcome, {
      publicationState: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.ACK_PENDING,
      ackState: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.PENDING,
      freshnessState:
        PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.ESTABLISHING,
      recoveryGateState: 'ack_pending',
      ready: false,
      active: true,
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

test('buildRecoveryProtocolSnapshot preserves explicit admission blocking on the target participation',
  async (t) => {
    const snapshot = buildRecoveryProtocolSnapshot({
      publicationEpoch: 21,
      publicationStatus: 'ACK_PENDING',
      targetNodeId: 'node-c',
      admissionState: RECOVERY_PROTOCOL_ADMISSION_STATE_BLOCKED,
      admissionReasonCodes: [
        RECOVERY_PROTOCOL_ADMISSION_REASON_CLUSTER_INTEGRITY,
      ],
      clusterIncarnationFence: RECOVERY_PROTOCOL_BLOCKED_FENCE,
      publishedActiveNodeIdsPresent: true,
      publishedActiveNodeIds: ['node-a', 'node-b'],
      durablePublishedActiveNodeIds: ['node-a', 'node-b'],
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-a', 'node-b'],
        projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
        locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
        recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-c'],
        memberStatesByNodeId: {
          'node-a': MEMBERSHIP_MEMBER_STATE.SERVING,
          'node-b': MEMBERSHIP_MEMBER_STATE.SERVING,
          'node-c': MEMBERSHIP_MEMBER_STATE.JOINING,
        },
      },
    });

    t.match(snapshot.targetParticipation, {
      nodeId: 'node-c',
      state: NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH,
      admissionState: RECOVERY_PROTOCOL_ADMISSION_STATE_BLOCKED,
      admitted: false,
      admissionReasonCodes: [
        RECOVERY_PROTOCOL_ADMISSION_REASON_CLUSTER_INTEGRITY,
      ],
      clusterIncarnationFence: RECOVERY_PROTOCOL_BLOCKED_FENCE,
    });
    t.same(
      snapshot.targetParticipation?.reasons,
      [
        'recovery_active',
        'projected_serving',
        'locally_eligible',
        'node_admission_blocked',
        RECOVERY_PROTOCOL_ADMISSION_REASON_CLUSTER_INTEGRITY,
      ],
      'the shared participation model should surface admission blocking without erasing the observed recovery state',
    );
  });

test('buildRecoveryProtocolSnapshot exposes one publication boundary outcome for ready published rows',
  async (t) => {
    const snapshot = buildRecoveryProtocolSnapshot({
      publicationEpoch: 22,
      publicationStatus: 'PUBLISHED',
      publishedActiveNodeIdsPresent: true,
      publishedActiveNodeIds: ['node-a', 'node-b'],
      durablePublishedActiveNodeIds: ['node-a', 'node-b'],
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a', 'node-b'],
      priorityPartitionSummary: {
        satisfied: true,
        missingPartitionIds: [],
      },
    });

    t.match(snapshot.publicationBoundaryOutcome, {
      publicationEpoch: 22,
      publicationStatus: 'PUBLISHED',
      publicationState: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.PUBLISHED,
      ackState: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.SATISFIED,
      freshnessState: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.FRESH,
      recoveryGateState: 'ready',
      ready: true,
      active: false,
      pendingAckCount: 0,
      missingPublishedCount: 0,
    });
  });
