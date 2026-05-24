/**
 * Message builders for WebSocketTransport.
 */

import {
  TRANSPORT_ERROR_MSG,
  TRANSPORT_TYPEOF,
  WS_ERROR_MSG,
  WS_MESSAGE_TYPE,
} from '../constants/transport.js';

const WSMessageType = WS_MESSAGE_TYPE;

function buildIdentificationMessage(localNodeId, localAddress) {
  return {
    type: WSMessageType.IDENTIFY,
    nodeId: localNodeId,
    address: localAddress,
    timestamp: Date.now(),
  };
}

function buildPongMessage() {
  return {
    type: WSMessageType.PONG,
    timestamp: Date.now(),
  };
}

function buildServiceAcknowledgment(messageId, result) {
  const ack = {
    type: WSMessageType.ACK,
    messageId,
    acknowledged: true,
  };

  if (result && typeof result === TRANSPORT_TYPEOF.OBJECT) {
    const {acknowledged: _ack, type: handlerType, ...rest} = result;
    Object.assign(ack, rest);
    if (handlerType) {
      ack.responseType = handlerType;
    }
  }

  return ack;
}

function buildServiceFailureAcknowledgment(messageId, error) {
  return {
    type: WSMessageType.ACK,
    messageId,
    acknowledged: false,
    error: error.message,
  };
}

function buildNoConnectionResult(messageId) {
  return {
    messageId,
    acknowledged: false,
    error: WS_ERROR_MSG.NO_CONNECTION,
  };
}

function buildDeliveryMessage({
  messageId,
  targetAddress,
  sourceAddress,
  sourceNodeId,
  payload,
}) {
  return {
    type: WSMessageType.SERVICE_MESSAGE,
    messageId,
    targetAddress,
    sourceAddress,
    sourceNodeId,
    payload,
    timestamp: Date.now(),
  };
}

function buildMessageTimeoutResult(messageId) {
  return {
    messageId,
    acknowledged: false,
    error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
  };
}

function buildPendingMessageRecord({messageId, resolve, reject, timeout}) {
  return {
    messageId,
    resolve,
    reject,
    timeout,
    sentAt: Date.now(),
  };
}

export {
  buildDeliveryMessage,
  buildIdentificationMessage,
  buildMessageTimeoutResult,
  buildNoConnectionResult,
  buildPendingMessageRecord,
  buildPongMessage,
  buildServiceAcknowledgment,
  buildServiceFailureAcknowledgment,
};
