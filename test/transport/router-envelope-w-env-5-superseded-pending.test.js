// W-ENV-5 (Q6 stage 2, decision D3): a superseded pending delivery is a named
// transport outcome.
//
// Property. When a queued heartbeat NODE_STATE_UPDATE is replaced in the
// outbound queue by a newer one under the same replace key, before it was
// sent, the superseded delivery returns promptly (never waiting out its
// deadline) with the owner's superseded outcome: DELIVERED, reasonCode
// superseded, coalesced, no answer. It is never sent; the newer heartbeat is.
// The real router is driven through its transport write seam (sendMessage),
// which here holds the first send so the queue stays occupied.
import {test} from '../../src/test-helpers/tap.js';
import {ConnectionState} from '../../src/transport/message-router.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../../src/constants/transport.js';
// Read through the owner module so a missing owner name is an assertion, not
// a load failure.
import * as TRANSPORT_OUTCOME from '../../src/transport/transport-semantic-outcome.js';
import {
  createRouterEnvelopeFixture,
  serviceAddress,
  transportFactsOf,
} from './router-envelope-witness-fixture.js';

const NODE = Object.freeze({sender: 'wenv5-sender', target: 'wenv5-target'});
const ADDRESS = serviceAddress(NODE.target, 'wenv5-control-plane');
const DEADLINE_MS = 5000;
const PROMPT_MS = 1000;
const {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE, TRANSPORT_DELIVERY_OUTCOME_STATE} =
  TRANSPORT_OUTCOME;
const isSuperseded = (outcome) =>
  TRANSPORT_OUTCOME.isSupersededTransportDeliveryOutcome?.(outcome) === true;

function heartbeat(at) {
  return {type: 'NODE_STATE_UPDATE', node_id: 'wenv5-node', heartbeat_only: true,
    heartbeat_at: at};
}

test('W-ENV-5 a superseded heartbeat returns at once, named superseded', async (t) => {
  const fixture = createRouterEnvelopeFixture(import.meta.url, NODE.sender);
  await fixture.setup();
  t.teardown(() => fixture.teardown());
  const {router} = await fixture.start(NODE.sender, false);
  router.outboundQueueMaxConcurrent = 1;
  router.nodeConnections.set(NODE.target, {nodeId: NODE.target, connectionId: 'wenv5-c1',
    ws: {readyState: 1, send() {}}, state: ConnectionState.CONNECTED, isIncoming: false,
    address: `ws://${NODE.target}:1`, nodeAddress: `ws://${NODE.target}:1`});
  const sent = [];
  let releaseFirst;
  router.sendMessage = async (_connection, _address, messageId, payload, _target,
    correlationId) => {
    sent.push(payload.heartbeat_at);
    if (sent.length === 1) {
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    setImmediate(() => router.handleServiceResponse({messageId, result: {ok: true}}));
    return {messageId, correlationId, acknowledged: true};
  };
  const options = {deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.CRITICAL,
    timeoutMs: DEADLINE_MS};
  const first = router.deliver(ADDRESS, heartbeat(0), options);
  await new Promise((resolve) => setImmediate(resolve));
  const startedAt = Date.now();
  const superseded = router.deliver(ADDRESS, heartbeat(1), options);
  await new Promise((resolve) => setImmediate(resolve));
  const newest = router.deliver(ADDRESS, heartbeat(2), options);
  const outcome = await superseded;
  const elapsedMs = Date.now() - startedAt;
  releaseFirst();
  await Promise.all([first, newest]);
  // The connection record is the test's seam, not a socket the router owns.
  router.nodeConnections.delete(NODE.target);

  t.ok(elapsedMs < PROMPT_MS, `the superseded delivery returned promptly (${elapsedMs}ms)`);
  t.equal(typeof TRANSPORT_OUTCOME.isSupersededTransportDeliveryOutcome, 'function',
    'the transport owner names the superseded outcome');
  t.equal(isSuperseded(outcome), true,
    'the owner names the outcome superseded');
  const facts = transportFactsOf(outcome);
  t.same({deliveryState: facts.deliveryState, reasonCode: facts.reasonCode,
    errorCode: facts.errorCode},
  {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED, errorCode: null},
  'a superseded delivery is DELIVERED/superseded with no router error');
  t.same(sent, [0, 2], 'the superseded heartbeat was never sent; the newest was');
  t.equal(router.pendingResponses.size, 0, 'no response waiter is left behind');
});
