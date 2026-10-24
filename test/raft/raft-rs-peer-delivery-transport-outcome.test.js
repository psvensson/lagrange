// The rs-raft peer-delivery boundary consumes the transport owner's delivery
// decision. Every outcome below is produced by a real MessageRouter local
// dispatch of a handler reply (or the router's own deferred-failure builder),
// so the boundary sees exactly what transport.deliver hands sendToPeer.
//
// Property: an outcome the owner does not classify DELIVERED (FAILED,
// including a contradictory delivery-state claim or a failed claim with a
// retry hint, and DEFERRED) is never recorded as a delivered peer delivery,
// and later messages to that peer in the batch are dropped with it; an
// ordinary acknowledged delivery is still recorded as delivered.
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {normalizeDeliveryOutcome} from
  '../../src/transport/message-router-outbound-queue-admission.js';
import {ROUTER_NO_CONNECTION_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  classifyTransportDeliveryOutcome,
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
  ACKNOWLEDGED: {acknowledged: true},
  CONTRADICTORY_DELIVERED_WITH_HINT: {deliveryState: STATE.DELIVERED,
    retryAfterMs: RETRY_HINT_MS},
  FAILED_CLAIM: {deliveryState: STATE.FAILED},
  FAILED_CLAIM_WITH_HINT: {deliveryState: STATE.FAILED, retryAfterMs: RETRY_HINT_MS},
  DEFER_FALSE_WITH_HINT: {deferRetry: false, retryAfterMs: RETRY_HINT_MS},
  UNNAMED_CLAIM: {deliveryState: ''},
  NO_HANDLER: {noHandler: true, error: 'No handler registered for address'},
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
    router.register(ADDRESS, () => reply);
    const outcomes = {};
    for (const [name, value] of Object.entries(REPLIES)) {
      reply = value;
      outcomes[name] = await router.deliver(ADDRESS, {type: 'RAFT_PEER_TEST'});
    }
    outcomes.ROUTER_DEFERRED = normalizeDeliveryOutcome({
      result: router.buildDeferredDeliveryFailure('m', 'm', 'No connection to node',
        {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE, retryAfterMs: RETRY_HINT_MS}),
      queueWaitMs: 0,
    }).result;

    for (const name of ['ORDINARY', 'ACKNOWLEDGED']) {
      t.equal(classifyTransportDeliveryOutcome(outcomes[name]).deliveryState,
        STATE.DELIVERED, `${name}: the owner classifies the router outcome delivered`);
      const {sent, observation} = await settle(outcomes[name]);
      t.same({sent, outcome: observation?.outcome},
        {sent: [1, 2], outcome: PEER_DELIVERY_OUTCOME.DELIVERED},
        `${name}: an ordinary delivery is recorded delivered and the batch continues`);
    }
    for (const name of ['CONTRADICTORY_DELIVERED_WITH_HINT', 'FAILED_CLAIM',
      'FAILED_CLAIM_WITH_HINT', 'DEFER_FALSE_WITH_HINT', 'UNNAMED_CLAIM', 'NO_HANDLER',
      'ROUTER_DEFERRED']) {
      t.not(classifyTransportDeliveryOutcome(outcomes[name]).deliveryState,
        STATE.DELIVERED, `${name}: the owner does not classify the outcome delivered`);
      const {sent, observation} = await settle(outcomes[name]);
      t.same({sent, outcome: observation?.outcome},
        {sent: [1], outcome: PEER_DELIVERY_OUTCOME.FAILED},
        `${name}: never recorded delivered; the peer's later batch messages are dropped`);
    }
    t.equal((await settle(outcomes.NO_HANDLER)).observation?.phase,
      RUNTIME_PHASE.SEND_NO_HANDLER, 'a missing handler keeps its named phase');
  });
