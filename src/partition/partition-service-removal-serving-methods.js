// Replica removal's serving fence and drain consume only current request and
// participant owners. They add no timeout or recovery decision.
import {participantTransactionActive} from
  './partition-participant-transaction-session.js';

const PARTITION_SERVICE_REMOVAL_SERVING_METHODS = Object.freeze({
  fenceServingAdmissionForRemoval() {
    this.removalServingAdmissionFenced = true;
    return {
      activeServingRequestCount: this.activeServingRequestCount,
      participantTransactionActive: participantTransactionActive(this),
    };
  },

  async waitForRemovalServingDrain(options = {}) {
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
      options.pollIntervalMs > 0 ? Math.floor(options.pollIntervalMs) : 10;
    while (this.activeServingRequestCount > 0 ||
        participantTransactionActive(this)) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  },
});

export {PARTITION_SERVICE_REMOVAL_SERVING_METHODS};
