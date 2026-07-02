import {
  buildQueryTransportSemanticOutcome,
} from '../../transport/transport-semantic-outcome.js';

function resolveQueryTransportSelection(getSelection) {
  if (typeof getSelection !== 'function') {
    return buildQueryTransportSemanticOutcome(null);
  }
  const selection = getSelection();
  if (selection &&
      typeof selection.sendMessage === 'function') {
    return selection.initialized === true ?
      buildQueryTransportSemanticOutcome({service: selection}) :
      buildQueryTransportSemanticOutcome(null);
  }
  if (!selection || typeof selection !== 'object') {
    return buildQueryTransportSemanticOutcome(null);
  }

  const service = selection.service;
  if (service &&
      typeof service.sendMessage === 'function' &&
      service.initialized === true) {
    return buildQueryTransportSemanticOutcome({
      ...selection,
      service,
    });
  }

  return buildQueryTransportSemanticOutcome({
    reason:
      typeof selection.reason === 'string' &&
      selection.reason.length > 0 ?
        selection.reason :
        null,
    errorCode: selection.errorCode || selection.code || null,
    retryAfterMs:
      Number.isFinite(selection.retryAfterMs) &&
      selection.retryAfterMs > 0 ?
        Math.floor(selection.retryAfterMs) :
        0,
    deferRetry: selection.deferRetry === true,
  });
}

export {resolveQueryTransportSelection};
