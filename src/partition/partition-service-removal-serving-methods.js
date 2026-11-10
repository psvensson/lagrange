// Replica removal's serving fence and drain consume only current request and
// participant owners. They add no timeout or recovery decision.
import {participantTransactionActive} from
  './partition-participant-transaction-session.js';

function fenceServingAdmissionForRemoval(service) {
  service.removalServingAdmissionFenced = true;
  return {
    activeServingRequestCount: service.activeServingRequestCount,
    participantTransactionActive: participantTransactionActive(service),
  };
}

async function waitForRemovalServingDrain(service, options = {}) {
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs > 0 ? Math.floor(options.pollIntervalMs) : 10;
  while (service.activeServingRequestCount > 0 ||
      participantTransactionActive(service)) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export {
  fenceServingAdmissionForRemoval,
  waitForRemovalServingDrain,
};
