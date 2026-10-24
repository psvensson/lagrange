// The query data plane's transport readiness: whether a message-group
// transport is selected (READY), or why a query must wait (DEFERRED) or fail.
import {ROUTER_ERROR_MSG} from '../constants/transport.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
} from './transport-error-codes.js';
import {
  normalizeOptionalString,
  normalizePositiveRetryAfterMs,
} from './transport-semantic-outcome.js';

const TRANSPORT_SEMANTIC_OUTCOME_STATE = Object.freeze({
  READY: 'ready',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE = Object.freeze({
  QUERY_TRANSPORT_NOT_READY: 'query_transport_not_ready',
  CONNECTION_CLOSED: 'connection_closed',
  TRANSPORT_DEFERRED: 'transport_deferred',
});

function resolveTransportSemanticReasonCode(errorCode, deferred) {
  if (errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.CONNECTION_CLOSED;
  }
  if (errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY;
  }
  if (deferred) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED;
  }
  return null;
}

function buildTransportSemanticOutcome(options = {}) {
  const ready = options.ready === true;
  const retryAfterMs = normalizePositiveRetryAfterMs(
    options.retryAfterMs,
    null,
  );
  const errorCode = normalizeOptionalString(options.errorCode);
  const deferred =
    options.deferRetry === true ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE ||
    retryAfterMs !== null;

  return Object.freeze({
    state:
      ready ?
        TRANSPORT_SEMANTIC_OUTCOME_STATE.READY :
        (
          deferred ?
            TRANSPORT_SEMANTIC_OUTCOME_STATE.DEFERRED :
            TRANSPORT_SEMANTIC_OUTCOME_STATE.FAILED
        ),
    ready,
    deferRetry: deferred,
    reason: normalizeOptionalString(options.reason),
    reasonCode: resolveTransportSemanticReasonCode(errorCode, deferred),
    errorCode,
    retryAfterMs,
    service:
      options.service &&
        typeof options.service.sendMessage === 'function' ?
        options.service :
        null,
  });
}

function buildQueryTransportSemanticOutcome(selection = null) {
  const resolvedSelection =
    selection && typeof selection === 'object' ?
      selection :
      {};
  const service =
    resolvedSelection.service &&
      typeof resolvedSelection.service.sendMessage === 'function' ?
      resolvedSelection.service :
      null;

  if (service) {
    return buildTransportSemanticOutcome({
      ready: true,
      service,
      retryAfterMs: resolvedSelection.retryAfterMs,
      errorCode: resolvedSelection.errorCode,
    });
  }

  return buildTransportSemanticOutcome({
    ready: false,
    service: null,
    reason:
      normalizeOptionalString(resolvedSelection.reason) ||
      ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
    errorCode:
      resolvedSelection.errorCode ||
      ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    retryAfterMs: normalizePositiveRetryAfterMs(resolvedSelection.retryAfterMs, null),
    deferRetry: true,
  });
}

export {
  TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE,
  TRANSPORT_SEMANTIC_OUTCOME_STATE,
  buildQueryTransportSemanticOutcome,
};
