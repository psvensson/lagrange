// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

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
    ['publication_epoch_pending'],
    'startup authority should preserve the recovery reasons',
  );
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
