import {NUM, TYPEOF} from '../../constants/index.js';
import {
  buildQueryTransportSemanticOutcome,
} from '../../transport/transport-semantic-outcome.js';

function resolveQueryTransportSelection(getSelection) {
  if (typeof getSelection !== TYPEOF.FUNCTION) {
    return buildQueryTransportSemanticOutcome(null);
  }
  const selection = getSelection();
  if (selection &&
      typeof selection.sendMessage === TYPEOF.FUNCTION) {
    return selection.initialized === true ?
      buildQueryTransportSemanticOutcome({service: selection}) :
      buildQueryTransportSemanticOutcome(null);
  }
  if (!selection || typeof selection !== TYPEOF.OBJECT) {
    return buildQueryTransportSemanticOutcome(null);
  }

  const service = selection.service;
  if (service &&
      typeof service.sendMessage === TYPEOF.FUNCTION &&
      service.initialized === true) {
    return buildQueryTransportSemanticOutcome({
      ...selection,
      service,
    });
  }

  return buildQueryTransportSemanticOutcome({
    reason:
      typeof selection.reason === TYPEOF.STRING &&
      selection.reason.length > NUM.ZERO ?
        selection.reason :
        null,
    errorCode: selection.errorCode || selection.code || null,
    retryAfterMs:
      Number.isFinite(selection.retryAfterMs) &&
      selection.retryAfterMs > NUM.ZERO ?
        Math.floor(selection.retryAfterMs) :
        NUM.ZERO,
    deferRetry: selection.deferRetry === true,
  });
}

export {resolveQueryTransportSelection};
