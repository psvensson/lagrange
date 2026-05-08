import {test} from '../../src/test-helpers/tap.js';
import {
  buildRecoveryProtocolSnapshot,
  PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE,
} from '../../src/control-plane/recovery-protocol-snapshot.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';

test('buildRecoveryProtocolSnapshot classifies unpublished observation explicitly', async (t) => {
  const snapshot = buildRecoveryProtocolSnapshot({
    targetNodeId: 'seed-node',
    recoveryActiveNodeIds: ['seed-node', 'node-2', 'node-3'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
    projectedServingNodeIds: ['seed-node', 'node-2', 'node-3'],
    locallyEligibleNodeIds: ['seed-node', 'node-2', 'node-3'],
    priorityPartitionSummary: {
      satisfied: true,
      missingPartitionIds: [],
    },
  });

  t.equal(snapshot.publicationObservationState, 'unpublished');
  t.equal(snapshot.recoveryProtocolState, 'unpublished_observation');
  t.match(snapshot.publicationBoundaryOutcome, {
    publicationState: PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE.UNPUBLISHED,
    ackState: PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE.UNAVAILABLE,
    freshnessState: PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE.UNPUBLISHED,
    recoveryGateState: 'unpublished_observation',
    ready: false,
    active: true,
  });
  t.same(
    snapshot.priorityRecoveryReasonCodes,
    [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
  );
  t.match(snapshot.targetParticipation, {
    nodeId: 'seed-node',
    state: 'recovery_pending_publish',
  });
  t.end();
});
