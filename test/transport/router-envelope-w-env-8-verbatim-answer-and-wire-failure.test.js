// W-ENV-8: no flat normalization, property evaluation or second answer encoding.
// LOCAL carries the handler return verbatim. Remote replies use the existing
// JSON wire protocol, whose serialization failure is its own handler failure.
import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  answerOf,
  createRouterEnvelopeFixture,
  serviceAddress,
  transportFactsOf,
  transportIdentityOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv8-sender', target: 'wenv8-target'});
const UNREADABLE = 'wenv8 answer field is unreadable';

function unreadableAnswer() {
  return Object.defineProperty({success: true}, 'rows', {
    enumerable: true,
    get() {
      throw new Error(UNREADABLE);
    },
  });
}

test('W-ENV-8 LOCAL preserves the answer; the wire owns serialization failure',
  async (t) => {
    const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
    await fixture.setup();
    t.teardown(() => fixture.teardown());
    const sender = await fixture.start(NODE.sender);
    const target = await fixture.start(NODE.target);
    const local = serviceAddress(NODE.sender, 'wenv8-unreadable');
    const remote = serviceAddress(NODE.target, 'wenv8-unreadable');
    sender.router.register(local, unreadableAnswer);
    target.router.register(remote, unreadableAnswer);
    await fixture.connect(sender, target);
    const answer = unreadableAnswer();
    sender.router.unregisterExact(local, sender.router.getRegisteredHandler(local));
    sender.router.register(local, () => answer);
    const localDelivery = await sender.router.deliver(local, {type: 'WENV8'});
    t.equal(answerOf(localDelivery), answer, 'LOCAL preserves the exact answer reference');
    t.equal(transportFactsOf(localDelivery).deliveryState, STATE.DELIVERED,
      'LOCAL never evaluates the answer getter');
    const remoteDelivery = await sender.router.deliver(remote, {type: 'WENV8'});
    t.same({deliveryState: transportFactsOf(remoteDelivery).deliveryState,
      reasonCode: transportFactsOf(remoteDelivery).reasonCode,
      error: transportIdentityOf(remoteDelivery).error},
    {deliveryState: STATE.FAILED, reasonCode: REASON.HANDLER_FAILED, error: UNREADABLE},
    'the existing wire serialization failure is classified at its own boundary');
    t.equal(answerOf(remoteDelivery), null, 'no remote answer was serialized');
  });
