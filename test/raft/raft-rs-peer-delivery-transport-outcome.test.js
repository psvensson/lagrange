// The rs-raft peer-delivery boundary consumes the transport owner's delivery
// decision: sendToPeer resolves to the router's delivery envelope and only
// its transport half is read. Outcomes below come from a real MessageRouter
// local dispatch (a handler reply, or a handler throw) or from the router's
// own producers built through the owner (its deferred-failure builder, a
// no-handler failure, contradictory router facts).
//
// Property: an outcome the owner does not classify DELIVERED (FAILED,
// including a contradictory delivery-state claim or a failed claim with a
// retry hint, and DEFERRED) is never recorded as a delivered peer delivery,
// and later messages to that peer in the batch are dropped with it; an
// ordinary delivery is recorded as delivered, and so is a delivery whose
// handler ANSWER names transport fields (an answer cannot change transport).
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ROUTER_NO_CONNECTION_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {sendMessages} from '../../src/raft/raft-rs-peer-delivery.js';
import {
  PEER_DELIVERY_OUTCOME,
  RUNTIME_PHASE,
} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'raft-peer-delivery-node';
const ADDRESS = `${NODE_ID}/service/raft-peer`;
const RETRY_HINT_MS = 250;
const STATE = TRANSPORT_DELIVERY_OUTCOME_STATE;

// Handler replies the peer answers; undefined is a bare acknowledgement.
const REPLIES = Object.freeze({
  ORDINARY: undefined,
  ANSWER_NAMES_FAILURE: {acknowledged: false, deliveryState: STATE.FAILED,
    noHandler: true, retryAfterMs: RETRY_HINT_MS},
});
// Router-produced facts the owner does not deliver.
const ROUTER_FACTS = Object.freeze({
  CONTRADICTORY_DELIVERED_WITH_HINT: {acknowledged: true, deliveryState: STATE.DELIVERED,
    retryAfterMs: RETRY_HINT_MS},
  FAILED_CLAIM: {acknowledged: true, deliveryState: STATE.FAILED},
  FAILED_CLAIM_WITH_HINT: {acknowledged: true, deliveryState: STATE.FAILED,
    retryAfterMs: RETRY_HINT_MS},
  UNNAMED_CLAIM: {acknowledged: true, deliveryState: ''},
  NO_HANDLER: {acknowledged: false, noHandler: true,
    error: 'No handler registered for address'},
});

function groupWith(sendToPeer) {
  return {groupId: 'raft-peer-delivery-group', peerDelivery: new Map(),
    resolvePeerAddress: (peer) => `${ADDRESS}#${peer}`, sendToPeer};
}

async function settle(outcome) {
  const sent = [];
  const group = groupWith((address, envelope) => {
    sent.push(envelope.message.index);
    return Promise.resolve(outcome);
  });
  await sendMessages(group, [{to: 2, from: 1, index: 1}, {to: 2, from: 1, index: 2}]);
  return {sent, observation: group.peerDelivery.get('2')};
}

test('rs-raft peer delivery records DELIVERED only on the transport owner decision',
  async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(() => router.shutdown());
    let reply;
    router.register(ADDRESS, () => {
      if (reply instanceof Error) throw reply;
      return reply;
    });
    const outcomes = {};
    for (const [name, value] of Object.entries(REPLIES)) {
      reply = value;
      outcomes[name] = await router.deliver(ADDRESS, {type: 'RAFT_PEER_TEST'});
    }
    reply = new Error('peer handler threw');
    outcomes.HANDLER_THROW = await router.deliver(ADDRESS, {type: 'RAFT_PEER_TEST'});
    for (const [name, facts] of Object.entries(ROUTER_FACTS)) {
      outcomes[name] = buildDeliveryEnvelope(facts);
    }
    outcomes.ROUTER_DEFERRED = buildDeliveryEnvelope(router.buildDeferredDeliveryFailure(
      'm', 'm', 'No connection to node',
      {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE, retryAfterMs: RETRY_HINT_MS}));

    for (const name of ['ORDINARY', 'ANSWER_NAMES_FAILURE']) {
      t.equal(outcomes[name].transport.deliveryState,
        STATE.DELIVERED, `${name}: the owner classifies the router outcome delivered`);
      const {sent, observation} = await settle(outcomes[name]);
      t.same({sent, outcome: observation?.outcome},
        {sent: [1, 2], outcome: PEER_DELIVERY_OUTCOME.DELIVERED},
        `${name}: an ordinary delivery is recorded delivered and the batch continues`);
    }
    for (const name of ['HANDLER_THROW', ...Object.keys(ROUTER_FACTS), 'ROUTER_DEFERRED']) {
      t.not(outcomes[name].transport.deliveryState,
        STATE.DELIVERED, `${name}: the owner does not classify the outcome delivered`);
      const {sent, observation} = await settle(outcomes[name]);
      t.same({sent, outcome: observation?.outcome},
        {sent: [1], outcome: PEER_DELIVERY_OUTCOME.FAILED},
        `${name}: never recorded delivered; the peer's later batch messages are dropped`);
    }
    t.equal((await settle(outcomes.NO_HANDLER)).observation?.phase,
      RUNTIME_PHASE.SEND_NO_HANDLER, 'a missing handler keeps its named phase');
  });
