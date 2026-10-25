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

const objectHasOwn = Object.hasOwn;
const transportOutcomes = new WeakSet();
const deliveryEnvelopes = new WeakSet();

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
// a router producer may supply. A supplied value is emitted exactly as supplied
// and only an absent one is computed, so building is a fixed point. Every input
// is router-internal: a handler answer never reaches this builder (it travels
// beside the outcome as the envelope's `answer`).
const TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS = Object.freeze(
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS.filter((field) =>
    field !== TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DELIVERY_STATE),
);

const TRANSPORT_DELIVERY_OUTCOME_REASON_CODE = Object.freeze({
  ACK_REJECTED: 'ack_rejected',
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
  if (!delivered) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED;
  }
  return null;
}

// The closed key set of a transport outcome: the router's identity of this
// delivery, its acknowledgement and error text, and the owner metadata. The
// builder emits exactly these keys and copies nothing else from its input.
function buildTransportDeliveryOutcome(options = {}) {
  if (transportOutcomes.has(options)) return options;
  const retryAfterMs = normalizePositiveRetryAfterMs(
    options.retryAfterMs,
    null,
  );
  const errorCode = normalizeOptionalString(options.errorCode);
  const noHandler = options.noHandler === true;
  const acknowledged = options.acknowledged === true;
  const {contradicted, deferralRequested, delivered, deferred, deliveryState} =
    classifyTransportDeliveryState({
      acknowledged,
      // An own undefined claim (dropped by JSON) is no claim.
      claimedDeliveryState: options.deliveryState,
      deferRetry: options.deferRetry,
      errorCode,
      noHandler,
      retryAfterMs,
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
      resolveTransportDeliveryReasonCode(errorCode, deferred, noHandler, delivered),
  };
  const outcome = {
    messageId: normalizeOptionalString(options.messageId),
    correlationId: normalizeOptionalString(options.correlationId),
    recoverableBeforeSend: options.recoverableBeforeSend === true,
    deliveryState,
    error: options.error ?? null,
  };
  for (const field of TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS) {
    outcome[field] = objectHasOwn(options, field) ?
      options[field] :
      computed[field];
  }
  transportOutcomes.add(outcome);
  return Object.freeze(outcome);
}

// The one shape `deliver()` resolves to: the router-built transport outcome
// of THIS hop and, beside it, the handler's answer. Only a delivered outcome
// carries an answer; the router is the only writer of `transport`.
function buildDeliveryEnvelope(transportFacts = {}, answer = null, identity = null) {
  if (deliveryEnvelopes.has(transportFacts)) return transportFacts;
  let transport = buildTransportDeliveryOutcome(transportFacts);
  if (identity !== null) {
    transport = Object.freeze({...transport,
      messageId: normalizeOptionalString(identity.messageId),
      correlationId: normalizeOptionalString(identity.correlationId)});
    transportOutcomes.add(transport);
  }
  const envelope = Object.freeze({
    transport,
    answer: isDeliveredTransportDeliveryOutcome(transport) && answer !== undefined ?
      answer : null,
  });
  deliveryEnvelopes.add(envelope);
  return envelope;
}

const INVALID_DELIVERY_TRANSPORT = buildTransportDeliveryOutcome();
const EMPTY_DELIVERY_ANSWER = Object.freeze({});

function deliveryTransportOf(delivery) {
  return deliveryEnvelopes.has(delivery) ? delivery.transport : INVALID_DELIVERY_TRANSPORT;
}

function deliveryAnswerOf(delivery) {
  return deliveryEnvelopes.has(delivery) ? delivery.answer : null;
}

// The one reading a consumer decides on once the transport has spoken: the
// handler's answer when delivered (an answer-less delivery reads as an empty
// answer), else the transport outcome itself. One namespace, never a merge.
function deliveryReadingOf(delivery) {
  const transport = deliveryTransportOf(delivery);
  return isDeliveredTransportDeliveryOutcome(transport) ?
    deliveryAnswerOf(delivery) ?? EMPTY_DELIVERY_ANSWER : transport;
}

// What a forwarding handler answers for the onward hop it delivered: that
// hop's answer when it was delivered, otherwise a typed refusal carrying the
// onward hop's failure at answer level. The forwarder's own transport stays
// the forwarder's; no onward transport fact reaches it.
function forwardedDeliveryAnswer(delivery) {
  const transport = deliveryTransportOf(delivery);
  if (isDeliveredTransportDeliveryOutcome(transport)) return deliveryAnswerOf(delivery);
  return {
    success: false,
    error: transport.error ?? transport.reasonCode,
    deferRetry: transport.deferRetry,
    retryAfterMs: transport.retryAfterMs,
    forwardedReasonCode: transport.reasonCode,
  };
}

// A thrown Error is the one other representation a delivery failure takes:
// its message is the error text, its code the error code (the JavaScript error
// convention), and its own metadata is validated by the same builder. A
// carried FAILED state is not erased by retry hints; no Error supplies an ACK.
function thrownErrorOutcome(error) {
  const outcome = {errorCode: error.code ?? null, error: error.message,
    recoverableBeforeSend: error.recoverableBeforeSend === true};
  for (const field of TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS) {
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
// it was sent (decision D3): DELIVERED, with no answer, named superseded. The
// one named state is the reason code (finding F-V4).
function buildSupersededDeliveryOutcome() {
  return buildTransportDeliveryOutcome({acknowledged: true,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED});
}

function isSupersededTransportDeliveryOutcome(outcome = null) {
  return isDeliveredTransportDeliveryOutcome(outcome) &&
    outcome.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED;
}

// The transport outcome a thrown delivery error carries. A value that is not
// an Error carries no transport fact and reads as a failed delivery.
function classifyThrownDeliveryError(error = null) {
  return buildTransportDeliveryOutcome(error instanceof Error ?
    thrownErrorOutcome(error) : {});
}

function isDeliveredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED;
}

function isDeferredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
}

export {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildDeliveryEnvelope,
  buildHandlerFailedError,
  buildSupersededDeliveryOutcome,
  buildTransportDeliveryOutcome,
  classifyThrownDeliveryError,
  deliveryAnswerOf,
  deliveryReadingOf,
  deliveryTransportOf,
  forwardedDeliveryAnswer,
  isDeferredTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  isSupersededTransportDeliveryOutcome,
  normalizeOptionalString,
  normalizePositiveRetryAfterMs,
};
