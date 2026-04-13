// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  StartupRecoveryCoordinator,
} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  BootstrapClusterViewOwner,
} from '../../src/bootstrap/owners/bootstrap-cluster-view-owner.js';

function createCache(rowsByTable = {}) {
  return {
    getAll(tableName) {
      return rowsByTable[tableName] || [];
    },
  };
}

test('StartupRecoveryCoordinator does not bypass local startup readiness when startup authority is unavailable', async (t) => {
  const coordinator = new StartupRecoveryCoordinator({
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
    },
  });

  const result = coordinator.evaluate({
    partitionId: 'control_plane_publications-p1',
    allowBootstrapInitPriorityBypass: true,
    startupAuthority: {
      state: 'authority_unavailable',
      authorityAvailable: false,
      failureReason: 'control_snapshot_authority_unavailable',
    },
  });

  t.equal(result.shouldBypassLocalPriorityControlPlaneStartupReadiness, false);
  t.equal(result.startupAuthorityState, 'authority_unavailable');
  t.equal(result.startupAuthorityFailureReason, 'control_snapshot_authority_unavailable');
  t.same(result.startupAuthorityFailure, {
    state: 'present',
    reason: 'control_snapshot_authority_unavailable',
  });
  t.same(result.startupAuthorityPublication, {
    observationState: 'observation_unavailable',
  });
  t.end();
});

test('BootstrapClusterViewOwner prefers readiness-owned startup cohort during unpublished startup', async (t) => {
  const owner = new BootstrapClusterViewOwner({
    delegates: {
      getSystemTableCache: () => createCache({
        nodes: [
          {node_id: 'seed-node', status: 'active'},
          {node_id: 'node-2', status: 'joining'},
          {node_id: 'node-3', status: 'joining'},
        ],
        services: [],
        node_endpoints: [],
        control_plane_publications: [],
      }),
      getSeedNodeId: () => 'seed-node',
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync() {
          return {ready: false};
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
          };
        },
      }),
    },
  });

  t.same(
    owner.getReadyNodes(),
    ['seed-node', 'node-2', 'node-3'],
    'bootstrap cluster view should consume the readiness-owned startup cohort',
  );
  t.end();
});

test('StartupRecoveryCoordinator keeps bootstrap-init recovery bypass open for explicit unpublished startup authority', async (t) => {
  const coordinator = new StartupRecoveryCoordinator({
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: [
            'BOOTSTRAP_PHASE_INCOMPLETE',
            'SQL_ENGINE_UNAVAILABLE',
            'LEADER_METADATA_INCOMPLETE',
            'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
            'local_query_transport_not_ready',
          ],
        };
      },
    },
  });

  const result = coordinator.evaluate({
    partitionId: 'control_plane_publications-p1',
    allowBootstrapInitPriorityBypass: true,
    startupAuthority: {
      state: 'seed_locally_ready_unpublished',
      authorityAvailable: true,
      publicationObservationState: 'unpublished',
    },
  });

  t.equal(result.startupAuthorityState, 'seed_locally_ready_unpublished');
  t.equal(result.publicationObservationState, 'unpublished');
  t.same(result.startupAuthorityFailure, {
    state: 'none',
  });
  t.same(result.startupAuthorityPublication, {
    observationState: 'unpublished',
  });
  t.equal(result.shouldBypassLocalPriorityControlPlaneStartupReadiness, true);
  t.end();
});
