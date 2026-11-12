// Replica removal's serving fence and drain consume only current request and
// participant owners. They add no timeout or recovery decision.
import {participantTransactionActive} from
  './partition-participant-transaction-session.js';

// What a replica still serves. A shut-down replica serves nothing: its
// requests were released and its database is closed (a replica stopped for
// a snapshot install is removed in that state), so its removal has nothing
// to fence and nothing to drain.
function servingWorkOf(service) {
  if (service.isShutdown === true) {
    return {activeServingRequestCount: 0, participantTransactionActive: false};
  }
  return {
    activeServingRequestCount: service.activeServingRequestCount,
    participantTransactionActive: participantTransactionActive(service),
  };
}

const PARTITION_SERVICE_REMOVAL_SERVING_METHODS = Object.freeze({
  fenceServingAdmissionForRemoval() {
    this.removalServingAdmissionFenced = true;
    return servingWorkOf(this);
  },

  async waitForRemovalServingDrain(options = {}) {
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
      options.pollIntervalMs > 0 ? Math.floor(options.pollIntervalMs) : 10;
    for (;;) {
      const serving = servingWorkOf(this);
      if (serving.activeServingRequestCount === 0 &&
          !serving.participantTransactionActive) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  },
});

export {PARTITION_SERVICE_REMOVAL_SERVING_METHODS};
