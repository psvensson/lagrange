// W-ENV-4 (Q6 stage 1, producer P18/P13): a no-handler reply carries no
// answer.
//
// Property. When the target router has no handler for the address, its
// SERVICE_RESPONSE frame states the router fact at frame level
// (`noHandler: true` with the router's error text) and carries no `result`
// slot, so nothing on the wire poses as a handler answer. The receiving router
// folds that frame into its own transport outcome: FAILED with the owner
// reason code no_handler.
import {test} from '../../src/test-helpers/tap.js';
import {ROUTER_ERROR_MSG, ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv4-sender', target: 'wenv4-target'});
const UNREGISTERED = serviceAddress(NODE.target, 'wenv4-unregistered');

test('W-ENV-4 a no-handler reply is a frame-level router fact', async (t) => {
  const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  const sender = await fixture.start(NODE.sender);
  const target = await fixture.start(NODE.target);
  await fixture.connect(sender, target);
  const frames = [];
  sender.router.nodeConnections.get(NODE.target).ws.on('message', (data) => {
    const frame = JSON.parse(String(data));
    if (frame.type === ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE) frames.push(frame);
  });

  const delivery = await sender.router.deliver(UNREGISTERED, {type: 'WENV4'});
  t.equal(frames.length, 1, 'exactly one SERVICE_RESPONSE answered the message');
  const [frame] = frames;
  t.same({noHandler: frame.noHandler, error: frame.error,
    hasResult: Object.hasOwn(frame, 'result')},
  {noHandler: true, error: ROUTER_ERROR_MSG.noHandlerForAddress(UNREGISTERED),
    hasResult: false},
  'the no-handler fact travels at frame level, with no answer slot');
  const facts = transportFactsOf(delivery);
  t.same({deliveryState: facts.deliveryState, reasonCode: facts.reasonCode,
    noHandler: facts.noHandler},
  {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER, noHandler: true},
  'the receiving router folds the frame into FAILED/no_handler');
});
