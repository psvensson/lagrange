// What a failed delivery means for a re-send: the one decision every caller
// of the router consumes instead of reading codes, flags or texts itself.
// It is derived only from the router's own facts about the hop - its
// acknowledgement state, its error code and (for a failure that carries no
// code) its delivery reason - and never from an error text.
//
// NOT_SENT     no frame left this router: re-sending cannot duplicate.
// AMBIGUOUS    a frame may have reached the target (it left, or nothing says
//              whether it did): the target may hold or have executed it. A
//              caller re-sends it only under the same command identity (R14);
//              otherwise it surfaces the ambiguity to its own caller.
// WRONG_OWNER  the target answered that nothing there serves the address:
//              not executed; re-route (or re-send once the owner is known).
// REJECTED     the target answered with a refusal (a negative ACK, its handler
//              threw), or the router refused a delivery its caller built
//              wrongly: never re-sent as the same delivery.
// DELIVERED    the hop delivered (not a failure).
// NOT_TRANSPORT a value that carries no transport fact: its own owner decides.
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
  ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE,
  ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE,
  ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE,
} from './transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  acknowledgementOfTransportFacts,
  isTransportAcknowledgement,
} from './transport-acknowledgement.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
  isTransportDeliveryOutcome,
} from './transport-semantic-outcome.js';

const objectHasOwn = Object.hasOwn;
// What the transport owner reads from a value that is no delivery envelope.
const NO_ENVELOPE_TRANSPORT = deliveryTransportOf(null);

const TRANSPORT_DELIVERY_FAILURE = Object.freeze({
  NOT_SENT: TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT,
  AMBIGUOUS: 'ambiguous',
  WRONG_OWNER: 'wrong_owner',
  REJECTED: TRANSPORT_ACKNOWLEDGEMENT.REJECTED,
  DELIVERED: 'delivered',
  NOT_TRANSPORT: 'not_transport',
});

const {NOT_SENT, AMBIGUOUS, WRONG_OWNER, REJECTED, DELIVERED} =
  TRANSPORT_DELIVERY_FAILURE;

// One row per acknowledgement state. The acknowledgement decides first: no
// frame left (not_sent) or a negative ACK (rejected) say so whatever the
// code; a frame that left (acknowledged, unacknowledged, a one-way send)
// makes any failure without an answer ambiguous unless the code names the
// target's own answer. Where the router recorded no ACK fact (unestablished)
// the code alone decides.
function decisionRow(whenFrameLeft, whenUnestablished, reason) {
  return Object.freeze({
    [TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED]: whenFrameLeft,
    [TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED]: whenFrameLeft,
    [TRANSPORT_ACKNOWLEDGEMENT.NOT_REQUESTED]: whenFrameLeft,
    [TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT]: NOT_SENT,
    [TRANSPORT_ACKNOWLEDGEMENT.REJECTED]: REJECTED,
    [TRANSPORT_ACKNOWLEDGEMENT.UNESTABLISHED]: whenUnestablished,
    reason,
  });
}

// Every code a delivery failure carries from the router, decided.
const TRANSPORT_DELIVERY_FAILURE_BY_CODE = Object.freeze({
  [OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE]: decisionRow(AMBIGUOUS, NOT_SENT,
    'the outbound queue refused the frame under pressure (R12)'),
  [ROUTER_NO_CONNECTION_ERROR_CODE]: decisionRow(AMBIGUOUS, NOT_SENT,
    'no connection to the target'),
  [ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE]: decisionRow(AMBIGUOUS,
    NOT_SENT, 'the query transport is not ready'),
  [WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE]: decisionRow(AMBIGUOUS, NOT_SENT,
    'the connect attempt timed out'),
  [ROUTER_CONNECTION_CLOSED_ERROR_CODE]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the connection closed; only a close before send says no frame left'),
  [ROUTER_MESSAGE_TIMEOUT_ERROR_CODE]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the delivery lifetime was spent; only a spent ACK wait before any ' +
    'frame left says it was not sent'),
  [ROUTER_HANDLER_FAILED_ERROR_CODE]: decisionRow(REJECTED, REJECTED,
    'the target handler threw: its answer is a failure'),
  [ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE]: decisionRow(AMBIGUOUS,
    REJECTED, 'the caller passed no valid delivery lifetime'),
  [ROUTER_DELIVERY_ENCODING_INVALID_ERROR_CODE]: decisionRow(AMBIGUOUS,
    REJECTED, 'the payload cannot be encoded for the wire'),
  [ROUTER_DUPLICATE_PENDING_ACK_ERROR_CODE]: decisionRow(AMBIGUOUS, REJECTED,
    'the messageId already waits for its ACK'),
  [ROUTER_DUPLICATE_PENDING_RESPONSE_ERROR_CODE]: decisionRow(AMBIGUOUS,
    REJECTED, 'the messageId already waits for its answer'),
});

// Every delivery reason, decided for a failure that carries no code (a hop
// the router built without one, or a forwarding hop's answer that states
// only its onward reason).
const TRANSPORT_DELIVERY_FAILURE_BY_REASON = Object.freeze({
  [REASON.NO_HANDLER]: decisionRow(WRONG_OWNER, WRONG_OWNER,
    'the target serves nothing at the address'),
  [REASON.HANDLER_FAILED]: decisionRow(REJECTED, REJECTED,
    'the target handler threw'),
  // The router names a failure with no code, no deferral and no ACK fact
  // rejected; a frame that left before it keeps it ambiguous.
  [REASON.ACK_REJECTED]: decisionRow(AMBIGUOUS, REJECTED,
    'not delivered, with no code and no deferral'),
  [REASON.CONNECTION_CLOSED]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the connection closed'),
  [REASON.ACK_TIMEOUT]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the ACK wait was spent'),
  [REASON.ANSWER_TIMEOUT]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the target accepted the message and no answer came'),
  [REASON.UNESTABLISHED_TIMEOUT]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the lifetime was spent and nothing says whether the target received it'),
  [REASON.CONTRADICTORY_DELIVERY_STATE]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'the producer claimed a state its facts do not support'),
  [REASON.TRANSPORT_DEFERRED]: decisionRow(AMBIGUOUS, AMBIGUOUS,
    'deferred with no code'),
  [REASON.NO_CONNECTION]: decisionRow(AMBIGUOUS, NOT_SENT,
    'no connection to the target'),
  [REASON.OUTBOUND_QUEUE_BACKPRESSURED]: decisionRow(AMBIGUOUS, NOT_SENT,
    'the outbound queue refused the frame'),
  [REASON.QUERY_TRANSPORT_NOT_READY]: decisionRow(AMBIGUOUS, NOT_SENT,
    'the query transport is not ready'),
  [REASON.WEBSOCKET_CONNECT_TIMEOUT]: decisionRow(AMBIGUOUS, NOT_SENT,
    'the connect attempt timed out'),
  [REASON.SUPERSEDED]: decisionRow(DELIVERED, DELIVERED,
    'replaced in the queue by a newer delivery: delivered, nothing to send'),
});

/**
 * The error code of a transport failure, by the transport's one convention:
 * `code` on a thrown Error, `errorCode` on an answer or outcome object.
 * @param {*} value - A thrown Error or an answer/outcome object.
 * @return {string|null} The code, or null.
 */
function transportErrorCodeOf(value) {
  const code = value instanceof Error ? value.code : value?.errorCode;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function statedAcknowledgement(value, errorCode) {
  return isTransportAcknowledgement(value?.acknowledgement) ?
    value.acknowledgement :
    acknowledgementOfTransportFacts({errorCode,
      recoverableBeforeSend: value?.recoverableBeforeSend === true});
}

// The facts one value states about its hop. A router-built outcome states
// all of them; a thrown Error and an answer state only what they carry: a
// reason is read only when the producer stated it (an Error's own
// reasonCode, a forwarding hop's forwardedReasonCode), never computed.
function transportFactsOf(value) {
  const transport = deliveryTransportOf(value);
  const outcome = isTransportDeliveryOutcome(value) ? value :
    transport !== NO_ENVELOPE_TRANSPORT ? transport : null;
  if (outcome !== null) {
    return {delivered: isDeliveredTransportDeliveryOutcome(outcome),
      errorCode: outcome.errorCode, reasonCode: outcome.reasonCode,
      acknowledgement: outcome.acknowledgement};
  }
  const errorCode = transportErrorCodeOf(value);
  const reasonCode = value instanceof Error ?
    (value.noHandler === true ? REASON.NO_HANDLER : value.reasonCode) :
    value?.forwardedReasonCode;
  return {delivered: false, errorCode, reasonCode: reasonCode ?? null,
    acknowledgement: statedAcknowledgement(value, errorCode)};
}

/**
 * The one decision on a transport failure: a thrown Error, a delivery
 * envelope, a router-built outcome, or an answer object carrying a router
 * code (`errorCode`) or a forwarding hop's reason (`forwardedReasonCode`).
 * @param {*} value - The failure.
 * @return {string} One of TRANSPORT_DELIVERY_FAILURE.
 */
function classifyTransportDeliveryFailure(value) {
  if (value === null || typeof value !== 'object') {
    return TRANSPORT_DELIVERY_FAILURE.NOT_TRANSPORT;
  }
  const facts = transportFactsOf(value);
  if (facts.delivered) return DELIVERED;
  if (objectHasOwn(TRANSPORT_DELIVERY_FAILURE_BY_CODE, facts.errorCode)) {
    return TRANSPORT_DELIVERY_FAILURE_BY_CODE[facts.errorCode][
      facts.acknowledgement];
  }
  if (objectHasOwn(TRANSPORT_DELIVERY_FAILURE_BY_REASON, facts.reasonCode)) {
    return TRANSPORT_DELIVERY_FAILURE_BY_REASON[facts.reasonCode][
      facts.acknowledgement];
  }
  return TRANSPORT_DELIVERY_FAILURE.NOT_TRANSPORT;
}

/**
 * Whether a caller may send the same request again after this failure: a
 * frame that never left, or a wrong owner, always; an ambiguous one only
 * when the re-send carries the same command identity the target dedupes on
 * (the caller's one local fact); a refusal never.
 * @param {string} failure - One of TRANSPORT_DELIVERY_FAILURE.
 * @param {{identityKeyed: boolean}} resend - The caller's re-send fact.
 * @return {boolean}
 */
function mayResendAfterTransportFailure(failure, {identityKeyed}) {
  if (failure === NOT_SENT || failure === WRONG_OWNER) return true;
  return failure === AMBIGUOUS && identityKeyed === true;
}

/**
 * The Error a caller throws for a failed router outcome: the router's text,
 * its code, and every transport fact the outcome holds, so the failure keeps
 * its classification wherever it is rethrown.
 * @param {Object} transport - A router-built transport outcome.
 * @param {string} absentText - Text when the outcome carries none.
 * @return {Error}
 */
function buildTransportFailureError(transport, absentText) {
  const error = new Error(typeof transport?.error === 'string' &&
    transport.error.length > 0 ? transport.error : absentText);
  if (typeof transport?.errorCode === 'string') error.code = transport.errorCode;
  for (const field of ['acknowledgement', 'deliveryState', 'reasonCode',
    'deferRetry', 'retryAfterMs', 'recoverableBeforeSend']) {
    if (transport?.[field] !== undefined && transport[field] !== null) {
      error[field] = transport[field];
    }
  }
  if (transport?.noHandler === true) error.noHandler = true;
  return error;
}

export {
  TRANSPORT_DELIVERY_FAILURE,
  TRANSPORT_DELIVERY_FAILURE_BY_CODE,
  TRANSPORT_DELIVERY_FAILURE_BY_REASON,
  buildTransportFailureError,
  classifyTransportDeliveryFailure,
  mayResendAfterTransportFailure,
  transportErrorCodeOf,
};
