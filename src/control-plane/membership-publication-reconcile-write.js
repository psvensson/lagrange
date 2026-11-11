/**
 * What a membership reconcile answers for the publication write it made
 * (the typed outcome of control-plane-publication-change.js), and what it
 * does while that write is not settled.
 *
 * A reconcile reports a publication row only when the durable owner
 * confirmed it (COMMITTED, ALREADY_APPLIED or UNCHANGED). For any other
 * outcome it reports no row and names the hold:
 * - AWAITING_DURABLE_OWNER: the write's outcome is unknown, or it was
 *   refused for a reason that says nothing about the row (the durable owner
 *   could not be read, the rounds were spent on contention). The reconcile
 *   still owes the write; it re-runs after the declared delay (and on every
 *   later wake) and resolves it by reading the durable owner.
 * - REFUSED_BY_ROW: the durable row (or the change) refused; nothing is
 *   owed for this candidate.
 * The publication workflow advances to OPEN only on a landed admission.
 */
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {
  CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS,
} from './membership-publication-control-plane-convergence.js';
import {
  isPublicationWriteObligationRetained,
  isPublicationWriteSettled,
} from './owners/control-plane-publication-change.js';

const MEMBERSHIP_PUBLICATION_WRITE_HOLD = Object.freeze({
  AWAITING_DURABLE_OWNER: 'awaiting_durable_owner',
  REFUSED_BY_ROW: 'refused_by_row',
});

const PUBLICATION_WRITE_UNSETTLED_REASON = 'publication-write-unsettled';

// The held reconcile re-asks itself, never at once (the queue's declared
// delayed self-requeue). On unchanged input the re-ask backs off: each
// consecutive held answer doubles the delay, from the critical convergence
// bound up to PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS. The delay bounds
// only the re-ask nothing else triggers: an enqueue from outside the held
// run (any owner wake - a READY node, recovery progress, the owner driver)
// releases the hold at once (the queue's contract), and an answer that is
// no longer held resets the backoff.
const PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS = 30000;

function resolveHeldPublicationWriteRequeueDelayMs(consecutiveHolds) {
  return Math.min(
    CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS *
      (2 ** (consecutiveHolds - 1)),
    PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS,
  );
}

/**
 * The reconcile's answer for one publication write.
 * @param {Object} written - {publicationWrite, candidate, workflow}.
 * @return {Object} {candidate, workflow, publicationWrite} with
 *   `publicationRow` when the write settled, else `publicationWriteHold`.
 */
function buildReconcilePublicationWriteAnswer({publicationWrite, candidate,
  workflow}) {
  if (isPublicationWriteSettled(publicationWrite)) {
    return {
      candidate,
      publicationRow: normalizeControlPlanePublicationRow(
        publicationWrite.row),
      workflow,
      publicationWrite,
    };
  }
  return {
    candidate,
    workflow,
    publicationWrite,
    publicationWriteHold:
      isPublicationWriteObligationRetained(publicationWrite) ?
        MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER :
        MEMBERSHIP_PUBLICATION_WRITE_HOLD.REFUSED_BY_ROW,
  };
}

/**
 * Account one reconcile write answer on the coordinator's held-write
 * backoff, and re-ask the reconcile for a write it still owes (a hold on
 * the durable owner): through the coordinator's own queue, after the
 * backoff's delay. Any other answer ends the hold and resets the backoff.
 * @param {Object} coordinator
 * @param {Object} answer - A buildReconcilePublicationWriteAnswer result.
 * @return {Object} The answer.
 */
function requeueHeldPublicationWrite(coordinator, answer) {
  if (answer.publicationWriteHold !==
      MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER) {
    coordinator.heldPublicationWriteRequeueStreak = 0;
    return answer;
  }
  coordinator.heldPublicationWriteRequeueStreak += 1;
  coordinator.enqueueClusterMembershipReconcile(
    PUBLICATION_WRITE_UNSETTLED_REASON,
    {},
    {selfRequeue: {delayMs: resolveHeldPublicationWriteRequeueDelayMs(
      coordinator.heldPublicationWriteRequeueStreak)}},
  );
  return answer;
}

export {
  MEMBERSHIP_PUBLICATION_WRITE_HOLD,
  PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS,
  PUBLICATION_WRITE_UNSETTLED_REASON,
  buildReconcilePublicationWriteAnswer,
  requeueHeldPublicationWrite,
};
