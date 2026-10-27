// Witness: a delivery the outbound queue supersedes completes through
// MessageRouter.deliver at once, without waiting for a SERVICE_RESPONSE that
// can never arrive (the superseded message is never sent). The queue resolves
// it with the transport owner's named superseded outcome (decision D3:
// DELIVERED, reasonCode superseded, no answer); completeRemoteDelivery
// completes that outcome by name without arming a response wait. Remove that
// completion and the superseded delivery is held until its full delivery
// deadline.
//
// The router, its outbound queue and the identified in-process socket are
// real; the first write is held so the single dispatch slot stays occupied,
// and the virtual clock never advances, so no deadline can settle anything.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_ROUTER_TEST, cdcRouterFixture, controlledCdcPeer, nextTurn, watchSettlement}
  from '../test-helpers/message-router-cdc-fixture.js';
import {deliveryTransportOf, isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  isSupersededTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';

const CASE_TIMEOUT_MS = 2000;
const CONTROL_PLANE = `${CDC_ROUTER_TEST.PEER}/service/control-plane`;
const heartbeat = (heartbeatAt) => ({type: 'NODE_STATE_UPDATE', node_id: 'node-x',
  heartbeat_only: true, heartbeat_at: heartbeatAt});

// Both replacement-key producers: the implicit heartbeat NODE_STATE_UPDATE key
// and an explicit caller key (control-plane transactions, CDC visibility).
const CASES = [
  {name: 'heartbeat NODE_STATE_UPDATE', message: heartbeat, options: {}},
  {name: 'explicit replacePendingKey', message: (n) => ({type: 'T', sequence: n}),
    options: {replacePendingKey: 'witness-coalesce-key'}},
];

for (const {name, message, options} of CASES) {
  test(`a superseded ${name} delivery completes immediately, named superseded`,
    {timeout: CASE_TIMEOUT_MS}, async (t) => {
      const f = await cdcRouterFixture(t);
      const peer = await controlledCdcPeer(f);
      const deliver = (n) => f.router.deliver(CONTROL_PLANE, message(n),
        {...options, deliveryPriority: 'critical'});
      const first = deliver(0);
      const held = await peer.nextWrite(0);
      await held.handedOff;
      const superseded = watchSettlement(deliver(1));
      await nextTurn();
      const successor = deliver(2);
      await nextTurn();
      await nextTurn();

      assert.equal(superseded.settled, true,
        'the superseded delivery settled with no clock advance and no response');
      assert.equal(superseded.error, null);
      const transport = superseded.value?.transport;
      assert.equal(isSupersededTransportDeliveryOutcome(transport), true,
        'the owner names the outcome superseded');
      assert.equal(transport?.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED);
      assert.equal(transport?.reasonCode, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.SUPERSEDED);
      assert.equal(transport?.errorCode, null);
      assert.equal(superseded.value?.answer, null, 'a superseded delivery has no answer');
      assert.equal(peer.writes.length, 1, 'the superseded message was never sent');

      peer.ack(held.frame.messageId, {ok: true});
      held.release();
      assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(await first)), true);
      const next = await peer.nextWrite(1);
      await next.handedOff;
      peer.ack(next.frame.messageId, {ok: true});
      next.release();
      assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(await successor)), true);
      assert.equal(f.router.pendingResponses.size, 0, 'no response wait is left behind');
    });
}
