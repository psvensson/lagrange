// Replica removal's serving fence and drain consume only current request and
// participant owners. They add no timeout or recovery decision. Both are
// idempotent and answer a named state: on a service whose connection the
// lifecycle owner already released (a duplicate REMOVE during teardown, a
// retry after a failed removal) the answer is CLOSED - nothing serves there
// and nothing can drain - never a read through the released connection. A
// CLOSED answer carries the participant owner's custody as it can be told
// without the connection (ACTIVE for volatile work, otherwise UNAVAILABLE):
// it is never an answer that participant custody is settled (2026-11-11);
// the removal owner reads the durable custody before anything irreversible.
// The drain waits on the named wake of the change that can end it.
// A cancelled removal lifts the fence it raised (the replica serves again).
import {participantTransactionCustodyOf} from
  './partition-participant-transaction-session.js';
import {participantStoreConnectionStateOf} from
  './partition-participant-transaction-store.js';
import {nextRemovalDrainWake} from './partition-service-removal-drain-wake.js';
import {
  PARTICIPANT_STORE_CONNECTION_STATE as CONNECTION_STATE,
  PARTICIPANT_TRANSACTION_CUSTODY as CUSTODY,
} from './partition-participant-transaction-constants.js';

const REMOVAL_SERVING_STATE = Object.freeze({
  FENCED: 'fenced',
  DRAINED: 'drained',
  CLOSED: 'closed',
});

function closedAnswer(service) {
  return {state: REMOVAL_SERVING_STATE.CLOSED,
    participantCustody: participantTransactionCustodyOf(service)};
}

function connectionClosed(service) {
  return participantStoreConnectionStateOf(service.db) ===
    CONNECTION_STATE.CLOSED;
}

const PARTITION_SERVICE_REMOVAL_SERVING_METHODS = Object.freeze({
  fenceServingAdmissionForRemoval() {
    this.removalServingAdmissionFenced = true;
    if (connectionClosed(this)) {
      return closedAnswer(this);
    }
    const custody = participantTransactionCustodyOf(this);
    return {
      state: REMOVAL_SERVING_STATE.FENCED,
      activeServingRequestCount: this.activeServingRequestCount,
      participantTransactionActive: custody === CUSTODY.ACTIVE,
    };
  },

  /**
   * Lift the removal's serving fence: only its removal owner, once that
   * removal is cancelled and the replica's row serves again.
   * @return {boolean} Whether the fence was raised.
   */
  liftServingAdmissionFenceForCancelledRemoval() {
    const fenced = this.removalServingAdmissionFenced === true;
    this.removalServingAdmissionFenced = false;
    return fenced;
  },

  /**
   * Wait until the requests and participant work admitted before the fence
   * are done, woken by the change that can end it
   * (partition-service-removal-drain-wake.js), never by a poll. Its bound
   * is the removal's own.
   * @return {Promise<Object>} DRAINED, or CLOSED with the custody.
   */
  async waitForRemovalServingDrain() {
    for (;;) {
      if (connectionClosed(this)) {
        return closedAnswer(this);
      }
      const custody = participantTransactionCustodyOf(this);
      if (this.activeServingRequestCount === 0 && custody === CUSTODY.IDLE) {
        return {state: REMOVAL_SERVING_STATE.DRAINED};
      }
      await nextRemovalDrainWake(this);
    }
  },
});

export {PARTITION_SERVICE_REMOVAL_SERVING_METHODS, REMOVAL_SERVING_STATE};
