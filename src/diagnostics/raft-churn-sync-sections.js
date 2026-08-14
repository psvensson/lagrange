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

import {
  enterSyncSection,
  exitSyncSection,
  trackSyncSection,
} from './event-loop-gap-watchdog.js';

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
  // RebalanceCoordinator.reconcileReservations periodic sweep (expire stale
  // + release orphan storage reservations; the continuous post-formation
  // churn site measured at 30-41 runs/min on the seed).
  STORAGE_RESERVATION_RECONCILE: 'storage_reservation_reconcile',
  // PartitionServiceTransactionBase.enforcePreparedStateHoldTimeouts sweep
  // (stuck-transaction heal / heal-deferred path; continuous on the seed).
  STUCK_TRANSACTION_HEAL: 'stuck_transaction_heal',
  // One SQLite follower commit+state-machine-apply transaction slice. The
  // slice owner has a wall-time budget and yields before starting another.
  RAFT_FOLLOWER_COMMIT_APPLY_SLICE: 'raft_follower_commit_apply_slice',
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

/**
 * Span variant of trackSyncSection for the reservation-reconcile sweep, whose
 * body is an async chain of authoritative control-plane reads. On the seed
 * those reads resolve in-process, so the await chain drains in microtasks and
 * the span approximates one synchronous block; an await that genuinely yields
 * over-attributes (never hides) reconcile time. Instrumentation only - the
 * wrapped call's resolution/rejection is propagated unchanged.
 * @param {Function} fn - Async sweep to measure.
 * @return {Promise<*>}
 */
async function trackStorageReservationReconcile(fn) {
  const token = enterSyncSection(
    RAFT_CHURN_SYNC_SECTION.STORAGE_RESERVATION_RECONCILE,
  );
  try {
    return await fn();
  } finally {
    exitSyncSection(
      RAFT_CHURN_SYNC_SECTION.STORAGE_RESERVATION_RECONCILE,
      token,
    );
  }
}

function trackStuckTransactionHeal(fn) {
  return trackSyncSection(RAFT_CHURN_SYNC_SECTION.STUCK_TRANSACTION_HEAL, fn);
}

function trackRaftFollowerCommitApplySlice(fn) {
  return trackSyncSection(
    RAFT_CHURN_SYNC_SECTION.RAFT_FOLLOWER_COMMIT_APPLY_SLICE,
    fn,
  );
}

export {
  RAFT_CHURN_SYNC_SECTION,
  trackControlPlaneRebindSweep,
  trackRaftTimingApplySweep,
  trackReplicaRegistrationSweep,
  trackLeaderActivation,
  trackStorageReservationReconcile,
  trackStuckTransactionHeal,
  trackRaftFollowerCommitApplySlice,
};
