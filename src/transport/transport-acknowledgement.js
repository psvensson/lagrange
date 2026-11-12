// The acknowledgement fact of one delivery hop: what this router knows about
// whether the target router accepted the message. It is a named state on
// every transport outcome, recorded by the hop's producer, never inferred by
// a consumer from a timeout or an absent value.
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from './transport-error-codes.js';

const TRANSPORT_ACKNOWLEDGEMENT = Object.freeze({
  // The target router accepted the message (its ACK arrived, or the target is
  // this router and its handler was invoked).
  ACKNOWLEDGED: 'acknowledged',
  // The frame was handed to the socket and the ACK wait ended with no ACK.
  UNACKNOWLEDGED: 'unacknowledged',
  // No frame left this router: no connection, closed before send, connect
  // timeout, backpressure refusal, or replaced in the queue.
  NOT_SENT: 'not_sent',
  // The target router answered with a negative ACK.
  REJECTED: 'rejected',
  // A one-way frame (raft-direct, `oneWay: true`) was handed to the socket.
  // No ACK is requested and none will arrive, by design.
  NOT_REQUESTED: 'not_requested',
  // The producer of this outcome recorded no acknowledgement fact (a failure
  // that does not say whether the frame left, or a value that is no router
  // outcome at all).
  UNESTABLISHED: 'unestablished',
});

const TRANSPORT_ACKNOWLEDGEMENT_STATES = Object.freeze(
  Object.values(TRANSPORT_ACKNOWLEDGEMENT),
);

// The ACK wait of a delivery is open until one of these is recorded.
const ACK_WAIT_OPEN_STATES = Object.freeze([
  TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT,
  TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED,
]);

const NOT_SENT_ERROR_CODES = Object.freeze([
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
]);

function isTransportAcknowledgement(value) {
  return TRANSPORT_ACKNOWLEDGEMENT_STATES.includes(value);
}

function isAckWaitOpen(acknowledgement) {
  return ACK_WAIT_OPEN_STATES.includes(acknowledgement);
}

// One delivery's acknowledgement only moves forward: nothing sent, then (for
// a delivery carried by another transport) not established by this hop, then
// a frame that left, then the settled ACK wait. A settled state is final.
const ACKNOWLEDGEMENT_PROGRESS = Object.freeze({
  [TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT]: 0,
  [TRANSPORT_ACKNOWLEDGEMENT.UNESTABLISHED]: 1,
  [TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED]: 2,
  [TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED]: 3,
  [TRANSPORT_ACKNOWLEDGEMENT.REJECTED]: 3,
  [TRANSPORT_ACKNOWLEDGEMENT.NOT_REQUESTED]: 3,
});

function advancesAcknowledgement(current, next) {
  return isTransportAcknowledgement(next) &&
    ACKNOWLEDGEMENT_PROGRESS[next] > ACKNOWLEDGEMENT_PROGRESS[current];
}

// The acknowledgement the router's own facts state when the producer named
// none: a delivered hop and a handler that was reached were accepted by the
// target router; the refusals that never write a frame were not sent. Every
// other outcome says nothing about the ACK and is named unestablished.
function acknowledgementOfTransportFacts({
  acknowledged, errorCode, noHandler, recoverableBeforeSend,
}) {
  if (acknowledged === true || noHandler === true ||
      errorCode === ROUTER_HANDLER_FAILED_ERROR_CODE) {
    return TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED;
  }
  if (NOT_SENT_ERROR_CODES.includes(errorCode) ||
      (errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE &&
        recoverableBeforeSend === true)) {
    return TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT;
  }
  return TRANSPORT_ACKNOWLEDGEMENT.UNESTABLISHED;
}

export {
  TRANSPORT_ACKNOWLEDGEMENT,
  acknowledgementOfTransportFacts,
  advancesAcknowledgement,
  isAckWaitOpen,
  isTransportAcknowledgement,
};
