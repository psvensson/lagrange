// The message-group forwarding owner decides a failed forward from the
// transport's one delivery-failure decision, never from an error text: a
// forward no frame of which left (connect timeout, backpressure, no
// connection) or with no handler at the target is retried and sets the
// target aside; one the leader may hold is retried as the same CDC event
// (applied under its event identity); a refusal is not retried; and a text
// that says "No connection to node" or "Connection to node ... closed"
// decides nothing.
import {test} from '../../src/test-helpers/tap.js';
import {MessageGroupForwardingOwner} from
  '../../src/message-group/message-group-forwarding-owner.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT as ACK,
  buildDeliveryEnvelope,
  deliveryReadingOf,
} from '../../src/transport/transport-semantic-outcome.js';

function forwardingOwner() {
  const owner = Object.create(MessageGroupForwardingOwner.prototype);
  owner.service = {shouldRepairForwardTopology: () => false,
    isForwardTargetBackpressured: (result) =>
      owner.isForwardTargetBackpressured(result)};
  return owner;
}

const reading = (facts) => deliveryReadingOf(buildDeliveryEnvelope(facts));

test('a forward that left no frame is retried and sets the target aside',
  async (t) => {
    const owner = forwardingOwner();
    for (const [name, facts] of [
      ['connect timeout', {errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
        error: 'WebSocket connection timeout after 2000ms'}],
      ['no connection', {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
        error: ROUTER_ERROR_MSG.noConnectionToNode('n2')}],
      ['backpressure', {errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
        error: ROUTER_ERROR_MSG.outboundQueueBackpressured('n2', 256),
        acknowledgement: ACK.NOT_SENT}],
      ['no handler', {acknowledged: true, noHandler: true,
        error: ROUTER_ERROR_MSG.noHandlerForAddress('n2/message-group/g')}],
    ]) {
      const failure = reading(facts);
      t.equal(owner.isRetryableForwardDeliveryFailure(failure), true,
        `${name}: retried`);
      t.equal(owner.shouldSuppressForwardTarget(failure, failure.error), true,
        `${name}: the target is set aside`);
    }
  });

test('a refusal is not retried, and a text alone decides nothing',
  async (t) => {
    const owner = forwardingOwner();
    t.equal(owner.isRetryableForwardDeliveryFailure(reading({
      errorCode: ROUTER_HANDLER_FAILED_ERROR_CODE, error: 'handler threw',
      acknowledgement: ACK.ACKNOWLEDGED})), false, 'handler failure');
    for (const text of [ROUTER_ERROR_MSG.noConnectionToNode('n2'),
      ROUTER_ERROR_MSG.connectionClosed('n2')]) {
      const answer = {success: false, error: text};
      t.equal(owner.isRetryableForwardDeliveryFailure(answer), false,
        `"${text}" alone is not retried`);
      t.equal(owner.shouldSuppressForwardTarget(answer, text), false,
        `"${text}" alone sets no target aside`);
    }
  });
