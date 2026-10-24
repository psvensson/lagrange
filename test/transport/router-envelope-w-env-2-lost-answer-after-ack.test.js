// W-ENV-2 (Q6 stage 1, finding F-A): a lost answer after the ACK is not
// DELIVERED.
//
// Property. When the target router ACKs a service message and the connection
// closes before its SERVICE_RESPONSE arrives, the caller's transport outcome
// is the router's own connection-closed deferral (DEFERRED, reasonCode
// connection_closed, the router error code kept), never DELIVERED with no
// answer. The "answer may be lost" reader of a source START keeps its
// meaning: the closed-after-ACK delivery is refused and marked a loss
// candidate instead of being taken as a processed START.
import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {
  deliverProcessedSourceReplicationStart,
  sourceReplicationStartAnswerMayBeLost,
} from '../../src/partition/managed-source-replication-start-delivery.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  settleUntil,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv2-sender', target: 'wenv2-target'});
const ADDRESS = serviceAddress(NODE.target, 'wenv2-held-answer');
const FALLBACK = 'wenv2 source start fallback';

async function heldAnswerPair(t) {
  const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
  await fixture.setup();
  const held = [];
  t.teardown(async () => {
    for (const release of held.splice(0)) release({success: true});
    await fixture.teardown();
  });
  const sender = await fixture.start(NODE.sender);
  const target = await fixture.start(NODE.target);
  let invocations = 0;
  // The handler is engaged (its ACK already sent) and holds its answer.
  target.router.register(ADDRESS, () => new Promise((resolve) => {
    invocations += 1;
    held.push(resolve);
  }));
  await fixture.connect(sender, target);
  return {
    sender: sender.router,
    invocations: () => invocations,
    // Close the sender's connection once the ACK settled and only the
    // SERVICE_RESPONSE waiter remains.
    async closeAfterAck(expectedInvocations) {
      await settleUntil(t, () => invocations === expectedInvocations &&
        sender.router.pendingMessages.size === 0 &&
        sender.router.pendingResponses.size === 1, 'ACK received, answer pending');
      sender.router.nodeConnections.get(NODE.target).ws.terminate();
    },
  };
}

test('W-ENV-2 a connection closed after the ACK is the router deferral', async (t) => {
  const pair = await heldAnswerPair(t);
  const delivery = pair.sender.deliver(ADDRESS, {type: 'WENV2'});
  await pair.closeAfterAck(1);
  const facts = transportFactsOf(await delivery);
  t.not(facts.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    'a lost answer after the ACK is never DELIVERED');
  t.same({deliveryState: facts.deliveryState, reasonCode: facts.reasonCode,
    errorCode: facts.errorCode},
  {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
    errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE},
  'the router connection-closed deferral survives the response waiter');
});

test('W-ENV-2 a source START whose answer was lost after the ACK is a loss candidate',
  async (t) => {
    const pair = await heldAnswerPair(t);
    const start = deliverProcessedSourceReplicationStart(pair.sender, ADDRESS,
      {type: 'WENV2_START'}, FALLBACK).then(
      (processed) => ({processed}), (error) => ({error}));
    await pair.closeAfterAck(1);
    const settled = await start;
    t.equal(settled.processed, undefined,
      'a START with no answer is not taken as processed');
    t.equal(sourceReplicationStartAnswerMayBeLost(settled.error), true,
      'the START reader marks the closed-after-ACK delivery a loss candidate');
  });
