// Replica removal's serving fence and drain consume only current request and
// participant owners. They add no timeout or recovery decision. Both are
// idempotent and answer a named state: on a service whose connection the
// lifecycle owner already released (a duplicate REMOVE during teardown, a
// retry after a failed removal) the answer is CLOSED - nothing serves there
// and nothing can drain - never a read through the released connection.
import {participantTransactionCustodyOf} from
  './partition-participant-transaction-session.js';
import {PARTICIPANT_TRANSACTION_CUSTODY as CUSTODY} from
  './partition-participant-transaction-constants.js';

const REMOVAL_SERVING_STATE = Object.freeze({
  FENCED: 'fenced',
  DRAINED: 'drained',
  CLOSED: 'closed',
});

const PARTITION_SERVICE_REMOVAL_SERVING_METHODS = Object.freeze({
  fenceServingAdmissionForRemoval() {
    this.removalServingAdmissionFenced = true;
    const custody = participantTransactionCustodyOf(this);
    return custody === CUSTODY.CLOSED ? {state: REMOVAL_SERVING_STATE.CLOSED} : {
      state: REMOVAL_SERVING_STATE.FENCED,
      activeServingRequestCount: this.activeServingRequestCount,
      participantTransactionActive: custody === CUSTODY.ACTIVE,
    };
  },

  async waitForRemovalServingDrain(options = {}) {
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
      options.pollIntervalMs > 0 ? Math.floor(options.pollIntervalMs) : 10;
    for (;;) {
      const custody = participantTransactionCustodyOf(this);
      if (custody === CUSTODY.CLOSED) {
        return {state: REMOVAL_SERVING_STATE.CLOSED};
      }
      if (this.activeServingRequestCount === 0 && custody === CUSTODY.IDLE) {
        return {state: REMOVAL_SERVING_STATE.DRAINED};
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  },
});

export {PARTITION_SERVICE_REMOVAL_SERVING_METHODS, REMOVAL_SERVING_STATE};
