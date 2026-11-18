// The membership publication owner's owner-recovery wait.
//
// A handoff whose next action is WAIT_OWNER_RECOVERY has nothing left for
// this owner to publish or acknowledge (the handoff decision table): either
// every remaining node is itself waiting, or everything is published and the
// cluster recovery gate is still active. Nothing this owner can do changes
// that answer; only the recovery owner's progress can. So the wait
// never re-enqueues itself (a re-run with the same captured handoff would
// re-evaluate the same snapshot at once, for ever). It is ended by the events
// that already wake this owner from current state, never by replaying the
// captured handoff:
//   - priority-recovery progress: the recovery owner enqueues this owner's
//     reconcile (unified-rebalancer-priority-recovery-coordination.js,
//     enqueueMembershipPublicationReconcile);
//   - a node's READY publication: replica dispatch enqueues this owner's
//     reconcile (replica-dispatch-replay-health-readiness.js);
//   - bound: the owner membership driver's cadence re-derives the handoff from
//     the authoritative planning snapshot (driveOwnerMembershipReconcile).
// Those wakes carry no captured handoff, so the run re-derives from current
// rows. The outcome's retryAfterMs states the bound to callers. The wait holds
// no listener or timer, so it has nothing to release.
import {CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME} from
  './control-plane-error-classification.js';
import {PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION} from
  './publication-active-gate-handoff-contract.js';
import {
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildControlPlaneConvergenceOutcome,
  normalizeControlPlaneConvergenceRetryAfterMs,
} from './membership-publication-control-plane-convergence.js';

const MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT = Object.freeze({
  // The reconcile answered; the recovery owner's progress (or the driver's
  // bounded re-derivation) runs this owner again from current state.
  AWAITING_RECOVERY_PROGRESS: 'awaiting_recovery_progress',
  // The handoff is not an owner-recovery wait.
  NOT_WAITING: 'not_waiting',
});

// The wait is the handoff's named next action. A wait for the cluster
// recovery gate names no node, so no count decides it.
function isMembershipPublicationOwnerRecoveryWaitTarget(target = null) {
  return target?.handoffContract?.nextAction ===
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY;
}

const MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT_VALUES = Object.freeze(
  new Set(Object.values(MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT)));

/**
 * The wait state every active-gate reconcile outcome carries. Required and
 * produced only by resolveMembershipPublicationOwnerRecoveryWait (or
 * NOT_WAITING on a path that is not a wait); anything else is a programming
 * error.
 * @param {string} ownerRecoveryWait
 * @return {string}
 */
function requireMembershipPublicationOwnerRecoveryWait(ownerRecoveryWait) {
  if (!MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT_VALUES.has(
    ownerRecoveryWait)) {
    throw new TypeError(
      `ownerRecoveryWait must be a MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT value, got ${String(ownerRecoveryWait)}`);
  }
  return ownerRecoveryWait;
}

function resolveMembershipPublicationOwnerRecoveryWait(target) {
  return isMembershipPublicationOwnerRecoveryWaitTarget(target) ?
    MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.AWAITING_RECOVERY_PROGRESS :
    MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.NOT_WAITING;
}

/**
 * The convergence outcome of an owner-recovery wait. `reentered` is true only
 * when this run itself drained snapshot pressure (a bounded re-entry that
 * already happened); the wait never admits a queued self re-run.
 * @param {Object} coordinator
 * @param {Object} target
 * @param {boolean} reentered
 * @return {Object}
 */
function buildMembershipPublicationOwnerRecoveryWaitConvergence(
  coordinator,
  target,
  reentered,
) {
  return buildControlPlaneConvergenceOutcome({
    pressureOutcome: reentered === true ?
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED :
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED,
    ownerKey: coordinator.buildOwnerKey(),
    operation:
      CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.OWNER_RECOVERY_WAKE,
    // The handoff contract names the wait's reason (owner_reconcile_pending
    // for WAIT_OWNER_RECOVERY); the target carries the normalized contract.
    reasonCode: target.handoffContract.reasonCode,
    retryAfterMs: normalizeControlPlaneConvergenceRetryAfterMs(
      target.handoffContract.retryAfterMs,
    ),
  });
}

export {
  MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT,
  buildMembershipPublicationOwnerRecoveryWaitConvergence,
  requireMembershipPublicationOwnerRecoveryWait,
  resolveMembershipPublicationOwnerRecoveryWait,
};
