import {test} from '../../src/test-helpers/tap.js';
import {
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  BootstrapClusterViewOwner,
} from '../../src/bootstrap/owners/bootstrap-cluster-view-owner.js';
import {
  STARTUP_AUTHORITY_STATE,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';

const BOOTSTRAP_INIT_PRIORITY_RECOVERY_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);
const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';
const BOOTSTRAP_INIT_DIAGNOSTICS_RECOVERY_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
]);
const STARTUP_AUTHORITY_PUBLICATION_UNPUBLISHED = 'unpublished';

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

test('StartupRecoveryCoordinator treats seed-authorized bootstrap INIT as control-plane recovery-ready', async (t) => {
  const coordinator = new StartupRecoveryCoordinator({
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: BOOTSTRAP_INIT_PRIORITY_RECOVERY_REASONS,
        };
      },
    },
  });

  const result = coordinator.evaluate({
    partitionId: 'control_plane_publications-p1',
    allowBootstrapInitPriorityBypass: true,
    startupAuthority: {
      state: STARTUP_AUTHORITY_STATE.SEED_LOCALLY_READY_UNPUBLISHED,
      authorityAvailable: true,
      publicationObservationState: STARTUP_AUTHORITY_PUBLICATION_UNPUBLISHED,
    },
  });

  t.equal(result.controlPlaneRecoveryReady, true);
  t.equal(
    result.recoveryStage,
    STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY,
  );
  t.equal(result.recoveryBlocked, false);
  t.end();
});

test('StartupRecoveryCoordinator treats seed-authorized bootstrap INIT diagnostics lag as recovery-ready', async (t) => {
  const coordinator = new StartupRecoveryCoordinator({
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: BOOTSTRAP_INIT_DIAGNOSTICS_RECOVERY_REASONS,
        };
      },
    },
  });

  const result = coordinator.evaluate({
    partitionId: 'control_plane_publications-p1',
    allowBootstrapInitPriorityBypass: true,
    startupAuthority: {
      state: STARTUP_AUTHORITY_STATE.SEED_LOCALLY_READY_UNPUBLISHED,
      authorityAvailable: true,
      publicationObservationState: STARTUP_AUTHORITY_PUBLICATION_UNPUBLISHED,
    },
  });

  t.equal(result.controlPlaneRecoveryReady, true);
  t.equal(
    result.recoveryStage,
    STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY,
  );
  t.equal(result.recoveryBlocked, false);
  t.equal(result.shouldBypassLocalPriorityControlPlaneStartupReadiness, true);
  t.end();
});

test('StartupRecoveryCoordinator keeps bootstrap-init recovery bypass open for recovery-pending startup authority with converging publication details', async (t) => {
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
      state: 'recovery_pending',
      authorityAvailable: true,
      publicationObservationState: 'establishing',
      recoveryProtocolState: 'publication_pending',
      canonicalStartupNodeIds: ['seed-node', 'node-2'],
    },
  });

  t.equal(result.startupAuthorityState, 'recovery_pending');
  t.equal(result.startupAuthorityAvailable, true);
  t.equal(result.publicationObservationState, 'establishing');
  t.same(result.startupAuthorityFailure, {
    state: 'none',
  });
  t.same(result.startupAuthorityPublication, {
    observationState: 'establishing',
  });
  t.equal(result.shouldBypassLocalPriorityControlPlaneStartupReadiness, true);
  t.end();
});
