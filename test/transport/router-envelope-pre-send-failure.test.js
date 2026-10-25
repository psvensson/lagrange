import {test} from '../../src/test-helpers/tap.js';
import {ConnectionState} from '../../src/transport/message-router.js';
import {deliveryTransportOf, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../../src/transport/transport-semantic-outcome.js';
import {createRouterEnvelopeFixture, serviceAddress} from './router-envelope-witness-fixture.js';

test('a socket already closed before send retains the router pre-send fact through recovery',
  async (t) => {
    const fixture = createRouterEnvelopeFixture(import.meta.url, 'presend-owner');
    await fixture.setup();
    t.teardown(() => fixture.teardown());
    const {router} = await fixture.start('presend-owner', false);
    const target = 'presend-target';
    // A source-owned connection whose socket closed before sendWithAck enters
    // ws.send. The real send and recovery owners classify it; no deliver mock.
    router.nodeConnections.set(target, {
      nodeId: target, connectionId: 'presend-closed', state: ConnectionState.CONNECTED,
      isIncoming: true, ws: {readyState: 3},
    });
    t.teardown(() => router.nodeConnections.delete(target));
    const delivery = await router.deliver(serviceAddress(target, 'handler'), {type: 'PRESEND'});
    const outcome = deliveryTransportOf(delivery);
    t.equal(outcome.reasonCode, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED);
    t.equal(outcome.recoverableBeforeSend, true,
      'the genuine pre-send closure is not converted into lost-answer debt');
    t.equal(router.pendingMessages.size, 0, 'no ACK obligation was opened');
    t.equal(router.pendingResponses.size, 0, 'the unused answer waiter is retired');
  });
