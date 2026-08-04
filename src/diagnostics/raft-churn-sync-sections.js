/**
 * Sync-section site names + thin wrappers for the raft-formation churn burst
 * attribution (quest raft-churn-sync-section-attribution). The event-loop gap
 * watchdog (src/diagnostics/event-loop-gap-watchdog.js) lazily registers any
 * snake_case site string; these constants name the synchronous sweep loops
 * that converge on the seed during formation/churn and previously surfaced
 * only as 'unexplainedMs ~ gapMs'. The helpers live here (not inline in the
 * big sweep files) so each oversized file gains only an import plus a short
 * call, keeping the over-800-line ratchet baseline unchanged. Instrumentation
 * only - trackSyncSection is a try/finally around the wrapped call and
 * propagates its return value / thrown error unchanged.
 */

import {trackSyncSection} from './event-loop-gap-watchdog.js';

const RAFT_CHURN_SYNC_SECTION = Object.freeze({
  // StartupRuntimeSurfaceOwner.bindControlPlaneServices sweep (rebind all
  // partition + message-group coordinators).
  CONTROL_PLANE_REBIND_SWEEP: 'control_plane_rebind_sweep',
  // createDynamicConfigStartupWiring applyRaftTimingConfig sweep (re-apply
  // raft timing to every raft service; refires on config-watcher/CDC).
  RAFT_TIMING_APPLY_SWEEP: 'raft_timing_apply_sweep',
  // registerPartitionsWithReplicaHandler sweep (re-register every replica).
  REPLICA_REGISTRATION_SWEEP: 'replica_registration_sweep',
  // PartitionService.scheduleLeaderOwnedActivation activate callback (the
  // leader-path leaf; includes reconstructPreparedState).
  LEADER_ACTIVATION: 'leader_activation',
});

function trackControlPlaneRebindSweep(fn) {
  return trackSyncSection(
    RAFT_CHURN_SYNC_SECTION.CONTROL_PLANE_REBIND_SWEEP,
    fn,
  );
}

function trackRaftTimingApplySweep(fn) {
  return trackSyncSection(
    RAFT_CHURN_SYNC_SECTION.RAFT_TIMING_APPLY_SWEEP,
    fn,
  );
}

function trackReplicaRegistrationSweep(fn) {
  return trackSyncSection(
    RAFT_CHURN_SYNC_SECTION.REPLICA_REGISTRATION_SWEEP,
    fn,
  );
}

function trackLeaderActivation(fn) {
  return trackSyncSection(RAFT_CHURN_SYNC_SECTION.LEADER_ACTIVATION, fn);
}

export {
  RAFT_CHURN_SYNC_SECTION,
  trackControlPlaneRebindSweep,
  trackRaftTimingApplySweep,
  trackReplicaRegistrationSweep,
  trackLeaderActivation,
};
