import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

const STARTUP_AUTHORITY_ADMISSION_STATE_BLOCKED = 'blocked';
const TEST_CLUSTER_INCARNATION_FENCE_BLOCKED = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze(['cluster_incarnation_identity_mismatch']),
  localIdentityState: 'mismatched',
  durableMembershipState: 'present',
  peerProofState: 'recovered',
});

function createCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    onCacheChange() {},
  };
}

test('ControlPlaneReadinessService builds recovery-pending startup authority snapshot', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 7,
    publicationStatus: 'ACK_PENDING',
    priorityPartitionSummary: {
      satisfied: false,
    },
    recoveryProtocolState: 'publication_pending',
    priorityRecoveryReasonCodes: ['publication_epoch_pending'],
    recoveryActiveNodeIds: ['seed-node', 'node-2', 'node-3'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
  });

  t.equal(snapshot.state, 'recovery_pending');
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.equal(snapshot.failure.state, 'none');
  t.equal(snapshot.publication.observationState, 'establishing');
  t.equal(snapshot.publication.epoch.state, 'known');
  t.equal(snapshot.publication.epoch.value, 7);
  t.equal(snapshot.publication.status.state, 'known');
  t.equal(snapshot.publication.status.value, 'ACK_PENDING');
  t.same(
    snapshot.canonicalStartupNodeIds,
    ['node-2', 'node-3', 'seed-node'],
    'startup authority should carry the canonical startup cohort',
  );
  t.same(
    snapshot.priorityRecoveryReasonCodes,
    [
      'publication_epoch_pending',
      'priority_partitions_not_spread',
    ],
    'startup authority should preserve the shared recovery-gate reasons',
  );
  t.match(snapshot.publicationRecoveryGate, {
    state: 'publication_pending',
    pendingAckCount: 0,
  });
  t.end();
});

test('ControlPlaneReadinessService marks startup authority unavailable when planning is incomplete', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 7,
    recoveryActiveNodeIds: ['seed-node', 'node-2'],
  });

  t.equal(snapshot.state, 'authority_unavailable');
  t.equal(snapshot.authorityAvailable, false);
  t.equal(snapshot.failureReason, 'control_plane_recovery_planning_incomplete');
  t.equal(snapshot.failure.state, 'present');
  t.equal(snapshot.failure.reason, 'control_plane_recovery_planning_incomplete');
  t.equal(snapshot.publication.observationState, 'observation_unavailable');
  t.equal(snapshot.publication.epoch.state, 'known');
  t.equal(snapshot.publication.epoch.value, 7);
  t.equal(snapshot.publication.status.state, 'unavailable');
  t.same(
    snapshot.canonicalStartupNodeIds,
    ['node-2', 'seed-node'],
    'incomplete planning should preserve the observed startup cohort even while failing closed',
  );
  t.end();
});

test('ControlPlaneReadinessService keeps startup authority available when an active recovery gate exists but publication details are still converging', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 7,
    recoveryProtocolState: 'publication_pending',
    priorityRecoveryReasonCodes: ['publication_epoch_pending'],
    targetParticipation: {
      nodeId: 'seed-node',
      state: 'recovery_pending_publish',
      reasons: ['publication_epoch_pending'],
    },
    recoveryActiveNodeIds: ['seed-node', 'node-2'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
  });

  t.equal(snapshot.state, 'recovery_pending');
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.same(snapshot.failure, {
    state: 'none',
  });
  t.equal(snapshot.publication.observationState, 'establishing');
  t.equal(snapshot.publication.epoch.state, 'known');
  t.equal(snapshot.publication.epoch.value, 7);
  t.equal(snapshot.publication.status.state, 'unavailable');
  t.equal(snapshot.recoveryProtocol.state, 'known');
  t.equal(snapshot.recoveryProtocol.value, 'publication_pending');
  t.match(snapshot.targetParticipation, {
    nodeId: 'seed-node',
    state: 'recovery_pending_publish',
  });
  t.same(
    snapshot.priorityRecoveryReasonCodes,
    ['publication_epoch_pending'],
    'active recovery-gate reasons should remain the authority vocabulary',
  );
  t.same(
    snapshot.canonicalStartupNodeIds,
    ['node-2', 'seed-node'],
    'transitional recovery authority should preserve the startup cohort',
  );
  t.match(snapshot.publicationRecoveryGate, {
    state: 'publication_pending',
    active: true,
  });
  t.end();
});

test('ControlPlaneReadinessService treats unpublished observation as explicit startup state', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationObservationState: 'unpublished',
    recoveryProtocolState: 'unpublished_observation',
    priorityRecoveryReasonCodes: ['publication_epoch_pending'],
    targetParticipation: {
      nodeId: 'seed-node',
      state: 'recovery_pending_publish',
    },
    priorityPartitionSummary: {
      satisfied: true,
      missingPartitionIds: [],
    },
    recoveryActiveNodeIds: ['seed-node', 'node-2', 'node-3'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
  });

  t.equal(snapshot.state, 'seed_locally_ready_unpublished');
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.equal(snapshot.publicationObservationState, 'unpublished');
  t.equal(snapshot.failure.state, 'none');
  t.equal(snapshot.publication.epoch.state, 'unpublished');
  t.equal(snapshot.publication.status.state, 'unpublished');
  t.same(
    snapshot.priorityRecoveryReasonCodes,
    ['publication_epoch_pending'],
  );
  t.same(
    snapshot.canonicalStartupNodeIds,
    ['node-2', 'node-3', 'seed-node'],
  );
  t.end();
});

test('ControlPlaneReadinessService marks startup authority blocked when explicit admission evidence blocks the target node', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 7,
    publicationStatus: 'ACK_PENDING',
    priorityPartitionSummary: {
      satisfied: false,
    },
    recoveryProtocolState: 'priority_spread_pending',
    recoveryActiveNodeIds: ['seed-node', 'node-2'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
    targetParticipation: {
      nodeId: 'node-4',
      state: 'recovery_pending_publish',
      reasons: ['node_admission_blocked'],
    },
    admissionState: STARTUP_AUTHORITY_ADMISSION_STATE_BLOCKED,
    admissionReasonCodes: ['cluster_incarnation_identity_mismatch'],
    clusterIncarnationFence: TEST_CLUSTER_INCARNATION_FENCE_BLOCKED,
  });

  t.equal(snapshot.state, 'blocked');
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, false);
  t.match(snapshot.admission, {
    state: STARTUP_AUTHORITY_ADMISSION_STATE_BLOCKED,
    admitted: false,
    reasonCodes: ['cluster_incarnation_identity_mismatch'],
    clusterIncarnationFence: TEST_CLUSTER_INCARNATION_FENCE_BLOCKED,
  });
  t.same(
    snapshot.canonicalStartupNodeIds,
    ['node-2', 'seed-node'],
    'explicit admission block should not erase the observed startup cohort while failing closed',
  );
  t.end();
});

test('ControlPlaneReadinessService does not treat steady published participation reasons as recovery blockers once the publication gate is ready', async (t) => {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });

  const snapshot = service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 8,
    publicationStatus: 'PUBLISHED',
    publicationObservationState: 'authoritative',
    priorityPartitionSummary: {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
    },
    recoveryProtocolState: 'steady_published',
    targetParticipation: {
      nodeId: 'seed-node',
      state: 'published_active',
      reasons: ['published_membership', 'projected_serving', 'locally_eligible'],
    },
    recoveryActiveNodeIds: ['seed-node', 'node-2', 'node-3'],
    recoveryActiveNodeSource: 'published_membership',
  });

  t.equal(snapshot.state, 'ready');
  t.equal(snapshot.authorityAvailable, true);
  t.equal(snapshot.ready, true);
  t.same(
    snapshot.priorityRecoveryReasonCodes,
    [],
    'participation diagnostics should not reopen recovery once the publication gate is ready',
  );
  t.match(snapshot.publicationRecoveryGate, {
    state: 'ready',
    ready: true,
    active: false,
  });
  t.end();
});
