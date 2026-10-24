// W-ENV-3 (Q6 stage 1, decision D1): a handler throw is classified the same
// on the LOCAL and the remote path.
//
// Property. A registered handler that throws E yields, for the delivery
// caller, the transport outcome FAILED with the owner reason code
// handler_failed, the router's handler-failed error code and E's message,
// whether the handler ran in the caller's router (LOCAL) or in a remote
// router whose SERVICE_RESPONSE carried the thrown text. Neither path reports
// a thrown handler DELIVERED.
import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  classifyTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import * as TRANSPORT_ERROR_CODES from '../../src/transport/transport-error-codes.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv3-sender', target: 'wenv3-target'});
const THROWN = 'wenv3 handler refused by throwing';
// Read through the owner module so a missing owner name is an assertion, not
// a load failure.
const HANDLER_FAILED_CODE = TRANSPORT_ERROR_CODES.ROUTER_HANDLER_FAILED_ERROR_CODE;
const HANDLER_FAILED_REASON = TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.HANDLER_FAILED;

test('W-ENV-3 a thrown handler is FAILED/handler_failed on both paths', async (t) => {
  const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  t.equal(typeof HANDLER_FAILED_CODE, 'string', 'the transport owner names the code');
  t.equal(typeof HANDLER_FAILED_REASON, 'string', 'the transport owner names the reason');
  const sender = await fixture.start(NODE.sender);
  const target = await fixture.start(NODE.target);
  const localAddress = serviceAddress(NODE.sender, 'wenv3-throws');
  const remoteAddress = serviceAddress(NODE.target, 'wenv3-throws');
  const throwing = () => {
    throw new Error(THROWN);
  };
  sender.router.register(localAddress, throwing);
  target.router.register(remoteAddress, throwing);
  await fixture.connect(sender, target);

  const local = await sender.router.deliver(localAddress, {type: 'WENV3'});
  const remote = await sender.router.deliver(remoteAddress, {type: 'WENV3'});
  const expected = {
    deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
    reasonCode: HANDLER_FAILED_REASON,
    errorCode: HANDLER_FAILED_CODE,
    error: THROWN,
  };
  const shapeOf = (delivery) => ({
    deliveryState: transportFactsOf(delivery).deliveryState,
    reasonCode: transportFactsOf(delivery).reasonCode,
    errorCode: transportFactsOf(delivery).errorCode,
    error: classifyTransportDeliveryOutcome(delivery).error,
  });
  t.same(shapeOf(local), expected, 'LOCAL: a thrown handler is FAILED/handler_failed');
  t.same(shapeOf(remote), expected, 'remote: a thrown handler is FAILED/handler_failed');
  t.same(transportFactsOf(remote), transportFactsOf(local),
    'the two paths classify a handler throw identically');
});
