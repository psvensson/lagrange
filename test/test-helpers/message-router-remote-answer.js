// The one current MessageRouter wire protocol, for tests that stand in for
// the remote peer: the transport ACK is plain (messageId, acknowledged) and
// the handler's answer arrives as its own SERVICE_RESPONSE frame. An ACK that
// carries a handler result is not a completion (the retired inline-ACK path),
// so a double must never answer through the ACK.
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';

/**
 * Answer a stubbed `router.sendMessage` the way a remote router does: return
 * the plain ACK and deliver `result` as the SERVICE_RESPONSE on the next turn.
 * @param {Object} router - The real MessageRouter under test.
 * @param {{messageId: string, correlationId?: string, result?: Object}} answer
 * @return {Object} The plain ACK result `sendMessage` resolves with.
 */
function acknowledgeThenRespond(router, {messageId, correlationId, result = {}}) {
  setImmediate(() => router.handleServiceResponse({
    type: ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE, messageId, result}));
  return {messageId, correlationId, acknowledged: true};
}

/**
 * The two wire frames a remote router peer sends for one handled message.
 * @param {string} messageId - The SERVICE_MESSAGE id being answered.
 * @param {Object} result - The handler result.
 * @return {Array<Object>} The plain ACK frame, then the SERVICE_RESPONSE frame.
 */
function acknowledgeThenRespondFrames(messageId, result = {}) {
  return [
    {type: ROUTER_MESSAGE_TYPE.ACK, messageId, acknowledged: true},
    {type: ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE, messageId, result},
  ];
}

export {acknowledgeThenRespond, acknowledgeThenRespondFrames};
