import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from './transport-error-codes.js';

const TRANSPORT_DELIVERY_OUTCOME_STATE = Object.freeze({
  DELIVERED: 'delivered',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const TRANSPORT_COMPLETED_STATUS = 'completed';

const objectHasOwn = Object.hasOwn;

const TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD = Object.freeze({
  DELIVERY_STATE: 'deliveryState',
  DEFER_RETRY: 'deferRetry',
  ERROR_CODE: 'errorCode',
  NO_HANDLER: 'noHandler',
  REASON_CODE: 'reasonCode',
  RETRY_AFTER_MS: 'retryAfterMs',
});

const TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS = Object.freeze([
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DELIVERY_STATE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DEFER_RETRY,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.NO_HANDLER,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.RETRY_AFTER_MS,
]);

// Transport decides the delivery state; every other metadata field is a value
// a reply may supply. A supplied value is emitted exactly as supplied and only
// an absent one is computed, so transport adds facts and never rewrites a claim.
const TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS = Object.freeze(
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS.filter((field) =>
    field !== TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DELIVERY_STATE),
);

const TRANSPORT_DELIVERY_OUTCOME_REASON_CODE = Object.freeze({
  ACK_REJECTED: 'ack_rejected',
  COMPLETED_WITH_ERROR: 'completed_with_error',
  CONNECTION_CLOSED: 'connection_closed',
  CONTRADICTORY_DELIVERY_STATE: 'contradictory_delivery_state',
  HANDLER_FAILED: 'handler_failed',
  MESSAGE_TIMEOUT: 'message_timeout',
  NO_HANDLER: 'no_handler',
  NO_CONNECTION: 'no_connection',
  SUPERSEDED: 'superseded',
  OUTBOUND_QUEUE_BACKPRESSURED: 'outbound_queue_backpressured',
  QUERY_TRANSPORT_NOT_READY: 'query_transport_not_ready',
  TRANSPORT_DEFERRED: 'transport_deferred',
  WEBSOCKET_CONNECT_TIMEOUT: 'websocket_connect_timeout',
});

function normalizePositiveRetryAfterMs(value, fallback = null) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function isTransportDeliveryErrorCode(errorCode) {
  return errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_HANDLER_FAILED_ERROR_CODE ||
    errorCode === ROUTER_MESSAGE_TIMEOUT_ERROR_CODE ||
    errorCode === ROUTER_NO_CONNECTION_ERROR_CODE ||
    errorCode === WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE;
}

function isDeferredTransportDeliveryErrorCode(errorCode) {
  return errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_NO_CONNECTION_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE;
}

const NAMED_TRANSPORT_DELIVERY_STATES = Object.freeze(
  Object.values(TRANSPORT_DELIVERY_OUTCOME_STATE),
);

// An explicit state claim never upgrades an outcome. A claim of failure, a
// claim outside the named states, or a delivered claim the evidence does not
// support is a contradiction, and a contradiction fails the outcome.
function isContradictedDeliveryStateClaim(claim, supported) {
  return claim !== undefined && (
    !NAMED_TRANSPORT_DELIVERY_STATES.includes(claim) ||
    claim === TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED ||
    (claim === TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED && !supported)
  );
}

function resolveTransportDeliveryState(delivered, deferred) {
  if (delivered) {
    return TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED;
  }
  return deferred ?
    TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED :
    TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED;
}

// options.claimedDeliveryState is the supplied own value, undefined if absent.
function classifyTransportDeliveryState(options) {
  const claim = options.claimedDeliveryState;
  const deferralRequested =
    options.deferRetry === true ||
    isDeferredTransportDeliveryErrorCode(options.errorCode) ||
    options.retryAfterMs !== null ||
    claim === TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
  const hasConflict =
    options.noHandler ||
    options.completedWithError ||
    isTransportDeliveryErrorCode(options.errorCode);
  const supported = options.acknowledged && !deferralRequested && !hasConflict;
  // FAILED dominates deferral, so a normalized outcome is a fixed point.
  const contradicted = isContradictedDeliveryStateClaim(claim, supported);
  const delivered = supported && !contradicted;
  const deferred = deferralRequested && !contradicted;
  return {
    contradicted,
    deferralRequested,
    delivered,
    deferred,
    deliveryState: resolveTransportDeliveryState(delivered, deferred),
  };
}

function resolveTransportDeliveryReasonCode(
  errorCode,
  deferred,
  noHandler,
  delivered,
  completedWithError,
) {
  if (noHandler === true) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER;
  }
  if (errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED;
  }
  if (errorCode === ROUTER_HANDLER_FAILED_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.HANDLER_FAILED;
  }
  if (errorCode === ROUTER_MESSAGE_TIMEOUT_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT;
  }
  if (errorCode === ROUTER_NO_CONNECTION_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION;
  }
  if (errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED;
  }
  if (errorCode === WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.WEBSOCKET_CONNECT_TIMEOUT;
  }
  if (errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY;
  }
  if (deferred) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED;
  }
  if (completedWithError) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.COMPLETED_WITH_ERROR;
  }
  if (!delivered) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED;
  }
  return null;
}

function buildTransportDeliveryOutcome(options = {}) {
  const retryAfterMs = normalizePositiveRetryAfterMs(
    options.retryAfterMs,
    null,
  );
  const errorCode = normalizeOptionalString(options.errorCode);
  const noHandler = options.noHandler === true;
  const acknowledged = options.acknowledged === true;
  const completedWithError = options.status === TRANSPORT_COMPLETED_STATUS &&
    normalizeOptionalString(options.error) !== null;
  const {contradicted, deferralRequested, delivered, deferred, deliveryState} =
    classifyTransportDeliveryState({
      acknowledged,
      // An own undefined claim (dropped by JSON) is no claim.
      claimedDeliveryState: options.deliveryState,
      deferRetry: options.deferRetry,
      errorCode,
      noHandler,
      retryAfterMs,
      completedWithError,
    });
  // An absent deferRetry reports the deferral evidence, as before; a failed
  // contradiction does not withdraw a retry request it carried.
  const computed = {
    deferRetry: deferralRequested,
    errorCode,
    retryAfterMs,
    noHandler,
    reasonCode: contradicted ?
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONTRADICTORY_DELIVERY_STATE :
      resolveTransportDeliveryReasonCode(
        errorCode,
        deferred,
        noHandler,
        delivered,
        completedWithError,
      ),
  };
  const outcome = {...options, acknowledged, deliveryState};
  for (const field of TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS) {
    outcome[field] = objectHasOwn(options, field) ?
      options[field] :
      computed[field];
  }
  return Object.freeze(outcome);
}

// Classifies a router answer, or a thrown error as the outcome it carries. A
// thrown Error is the one other representation a delivery failure takes: its
// message is the error text, its code the error code (the JavaScript error
// convention), and its own value fields are carried as they are. An answer is
// handed to the builder exactly as supplied.
function thrownErrorOutcome(error) {
  const outcome = {errorCode: error.code ?? null, error: error.message};
  for (const field of TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS) {
    if (field !== TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.ERROR_CODE &&
        objectHasOwn(error, field)) {
      outcome[field] = error[field];
    }
  }
  return outcome;
}

// A registered handler that threw (decision D1). The LOCAL throw and the
// remote SERVICE_RESPONSE error text are both this one router failure, so the
// two paths classify alike: FAILED with reasonCode handler_failed.
function buildHandlerFailedError(text) {
  return Object.assign(new Error(text), {code: ROUTER_HANDLER_FAILED_ERROR_CODE});
}

// A queued delivery replaced by a newer one under the same replace key before
// it was sent (decision D3): DELIVERED, with no answer, named superseded.
function buildSupersededDeliveryOutcome(fields = {}) {
  return buildTransportDeliveryOutcome({...fields, acknowledged: true, coalesced: true,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED});
}

function isSupersededTransportDeliveryOutcome(outcome = null) {
  return isDeliveredTransportDeliveryOutcome(outcome) &&
    outcome.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED &&
    outcome.coalesced === true;
}

function classifyTransportDeliveryOutcome(value = null) {
  const resolvedValue = value && typeof value === 'object' ? value : {};
  return buildTransportDeliveryOutcome(resolvedValue instanceof Error ?
    thrownErrorOutcome(resolvedValue) :
    resolvedValue);
}

function isDeliveredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED;
}

function isDeferredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
}

export {
  TRANSPORT_COMPLETED_STATUS,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildHandlerFailedError,
  buildSupersededDeliveryOutcome,
  buildTransportDeliveryOutcome,
  classifyTransportDeliveryOutcome,
  isDeferredTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  isSupersededTransportDeliveryOutcome,
  normalizeOptionalString,
  normalizePositiveRetryAfterMs,
};
