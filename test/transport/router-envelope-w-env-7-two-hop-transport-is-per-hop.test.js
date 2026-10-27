// W-ENV-7 (Q6 stage 3b, design section 5): a forwarder's transport describes
// its own hop; the onward hop's outcome rides in the answer.
//
// Property (design section 5, "a forwarder decides on hop2's transport, then
// returns hop2's answer or its own typed refusal carrying hop2's deferral at
// answer level"):
// - hop2 delivered: the source's transport is DELIVERED for hop1 and its
//   answer is hop2's answer verbatim;
// - hop2 failed (handler_failed) or had no handler (no_handler): the source's
//   transport is still DELIVERED, because hop1's handler answered; the answer
//   is the forwarder's typed refusal, success false, naming hop2's reason as
//   forwardedReasonCode and carrying hop2's deferral at answer level; no hop2
//   transport fact appears in hop1's transport;
// - hop1's own hop failed (the forwarder threw, or hop1 has no forwarder):
//   only then is the source's transport FAILED, with hop1's own reason.
import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  answerOf,
  createRouterEnvelopeFixture,
  forwardingHandler,
  serviceAddress,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv7-sender', hop: 'wenv7-hop',
  target: 'wenv7-target'});
const ADDRESS = Object.freeze({
  answers: serviceAddress(NODE.target, 'wenv7-answers'),
  throws: serviceAddress(NODE.target, 'wenv7-throws'),
  absent: serviceAddress(NODE.target, 'wenv7-absent'),
  forwarder: serviceAddress(NODE.hop, 'wenv7-forwarder'),
  forwarderThrows: serviceAddress(NODE.hop, 'wenv7-forwarder-throws'),
  forwarderAbsent: serviceAddress(NODE.hop, 'wenv7-forwarder-absent'),
});
const HOP2_ANSWER = Object.freeze({success: true, rows: [1, 2], status: 'hop2'});
const THROWN = 'wenv7 hop handler threw';
const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);

async function setup(t) {
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  const sender = await fixture.start(NODE.sender);
  const hop = await fixture.start(NODE.hop);
  const target = await fixture.start(NODE.target);
  target.router.register(ADDRESS.answers, () => HOP2_ANSWER);
  target.router.register(ADDRESS.throws, () => {
    throw new Error(THROWN);
  });
  hop.router.register(ADDRESS.forwarder, forwardingHandler(hop.router));
  hop.router.register(ADDRESS.forwarderThrows, () => {
    throw new Error(THROWN);
  });
  await fixture.connect(hop, target);
  await fixture.connect(sender, hop);
  return sender.router;
}

const forwardTo = (sender, forwarder, onward) =>
  sender.deliver(forwarder, {type: 'WENV7', forwardTo: onward, inner: {type: 'WENV7_INNER'}});

function hopShape(delivery) {
  const facts = transportFactsOf(delivery);
  return {deliveryState: facts.deliveryState, reasonCode: facts.reasonCode,
    noHandler: facts.noHandler, errorCode: facts.errorCode,
    deferRetry: facts.deferRetry, retryAfterMs: facts.retryAfterMs};
}

const DELIVERED_HOP = Object.freeze({deliveryState: STATE.DELIVERED, reasonCode: null,
  noHandler: false, errorCode: null, deferRetry: false, retryAfterMs: null});

test('W-ENV-7 a delivered onward hop answers through the forwarder verbatim',
  async (t) => {
    const sender = await setup(t);
    const delivery = await forwardTo(sender, ADDRESS.forwarder, ADDRESS.answers);
    t.same(hopShape(delivery), DELIVERED_HOP, 'hop1 is delivered');
    t.same(answerOf(delivery), HOP2_ANSWER, 'the answer is hop2\'s answer');
  });

test('W-ENV-7 an onward hop failure is answer-level, never hop1 FAILED',
  async (t) => {
    const sender = await setup(t);
    for (const [onward, reasonCode] of [[ADDRESS.throws, REASON.HANDLER_FAILED],
      [ADDRESS.absent, REASON.NO_HANDLER]]) {
      const delivery = await forwardTo(sender, ADDRESS.forwarder, onward);
      t.same(hopShape(delivery), DELIVERED_HOP,
        `hop2 ${reasonCode}: hop1's transport describes hop1 only (delivered)`);
      const answer = answerOf(delivery);
      t.same({success: answer?.success, forwardedReasonCode: answer?.forwardedReasonCode,
        deferRetry: answer?.deferRetry, retryAfterMs: answer?.retryAfterMs},
      {success: false, forwardedReasonCode: reasonCode, deferRetry: false,
        retryAfterMs: null},
      `hop2 ${reasonCode}: the answer is the forwarder's typed refusal`);
      t.equal(typeof answer?.error, 'string', `hop2 ${reasonCode}: the refusal names hop2's error`);
    }
  });

test('W-ENV-7 only hop1\'s own failure makes the source transport FAILED',
  async (t) => {
    const sender = await setup(t);
    const threw = await forwardTo(sender, ADDRESS.forwarderThrows, ADDRESS.answers);
    t.same({deliveryState: hopShape(threw).deliveryState, reasonCode: hopShape(threw).reasonCode},
      {deliveryState: STATE.FAILED, reasonCode: REASON.HANDLER_FAILED},
      'hop1\'s forwarder threw: FAILED/handler_failed');
    t.equal(answerOf(threw), null, 'a failed hop has no answer');
    const absent = await forwardTo(sender, ADDRESS.forwarderAbsent, ADDRESS.answers);
    t.same({deliveryState: hopShape(absent).deliveryState, reasonCode: hopShape(absent).reasonCode},
      {deliveryState: STATE.FAILED, reasonCode: REASON.NO_HANDLER},
      'hop1 has no forwarder: FAILED/no_handler');
    t.equal(answerOf(absent), null, 'a no-handler hop has no answer');
  });
