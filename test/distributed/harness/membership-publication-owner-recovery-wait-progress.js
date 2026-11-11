// The membership publication owner's named owner-recovery wait, as the
// active-wait harness reads it from a progress snapshot.
//
// The owner answers a WAIT_OWNER_RECOVERY handoff with a TARGET_BLOCKED
// outcome naming `ownerRecoveryWait: awaiting_recovery_progress` and the
// bound (`retryAfterMs`) after which its driver re-derives the handoff. It
// queues nothing for itself while it waits, so a reader classifies the wait
// from that named state, never from `enqueued` or from queued-write depth.
import {
  MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT,
} from '../../../src/control-plane/membership-publication-owner-recovery-wait.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../../src/control-plane/membership-publication-active-gate-reconcile.js';

const OWNER_RECOVERY_WAIT_OUTCOME_FIELD = 'ownerRecoveryWait';

/**
 * The flattened wait state of one handoff outcome record, or null when the
 * outcome names none (an outcome that is not the owner's).
 * @param {Object|null} outcome
 * @return {string|null}
 */
function readOwnerRecoveryWaitOutcomeState(outcome) {
  const value = outcome?.[OWNER_RECOVERY_WAIT_OUTCOME_FIELD];
  return Object.values(MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT)
    .includes(value) ? value : null;
}

/**
 * @param {Object} progressSnapshot
 * @return {boolean} whether the owner reports its bounded recovery wait
 */
function isOwnerRecoveryWaitProgress(progressSnapshot) {
  const retryAfterMs =
    progressSnapshot?.membershipPublicationHandoffOutcomeRetryAfterMs;
  return progressSnapshot?.membershipPublicationHandoffOutcomeState ===
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.TARGET_BLOCKED &&
    progressSnapshot?.membershipPublicationHandoffOutcomeOwnerRecoveryWait ===
      MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.AWAITING_RECOVERY_PROGRESS &&
    Number.isFinite(retryAfterMs) && retryAfterMs > 0;
}

export {
  OWNER_RECOVERY_WAIT_OUTCOME_FIELD,
  isOwnerRecoveryWaitProgress,
  readOwnerRecoveryWaitOutcomeState,
};
