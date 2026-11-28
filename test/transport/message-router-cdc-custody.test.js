import {deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from '../../src/transport/transport-semantic-outcome.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {createInProcWebSocketPair as canonicalPair, InProcWebSocket as CanonicalSocket} from
  '../../src/transport/inproc-transport.js';
import {createInProcWebSocketPair as routerPair, InProcWebSocket as RouterSocket} from
  '../../src/transport/message-router-shared-vocabulary.js';
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {CDC_ROUTER_TEST, cdcRouterFixture, controlledCdcPeer, nextTurn, watchSettlement}
  from '../test-helpers/message-router-cdc-fixture.js';

const CASE_TIMEOUT_MS = 2000;
const PROBE = Object.freeze({type: 'transport-custody-probe'});

test('router timeout retains the actual write callback, outbound slot and branded CDC child',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await controlledCdcPeer(f);
    let closed = 0;
    const context = f.invocation(() => {
      closed += 1;
    });
    const first = f.router.deliver(CDC_ROUTER_TEST.ADDRESS,
      {...PROBE, messageId: 'same-message'},
      {deliveryContext: context, timeoutMs: CDC_ROUTER_TEST.SHORT_MS});
    const write = await peer.nextWrite(0);
    await write.handedOff;
    const queue = f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER);
    assert.equal(queue.inFlight, 1, 'the real outbound owner acquired this raw send');
    peer.inbound();
    await nextTurn();
    f.clock.elapse(CDC_ROUTER_TEST.SHORT_MS);
    f.clock.dispatchDue();
    const refused = await first;
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(refused)), false);
    assert.equal(refused.transport.errorCode, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
    assert.equal(peer.accepted.readyState, 1, 'the live incoming peer remains connected');
    context.finish();
    const cleanup = watchSettlement(context.cleanup);
    await nextTurn();
    assert.equal(cleanup.settled, false, 'public expiry does not close the raw child');
    assert.equal(queue.inFlight, 1);
    assert.notEqual(f.delivery.activeCdcInvocation, null);
    assert.throws(() => f.invocation(), {code: CDC_COMPLETION.BACKPRESSURE},
      'the genuine invocation owner refuses a second source slot');

    // An independent caller may queue; it cannot reuse the old physical slot.
    const successor = f.router.deliver(CDC_ROUTER_TEST.ADDRESS,
      {...PROBE, messageId: 'same-message'}, {timeoutMs: CDC_ROUTER_TEST.BUDGET_MS});
    const successorState = watchSettlement(successor);
    await nextTurn();
    const pending = f.router.pendingResponses.get('same-message');
    assert.ok(pending, 'the successor owns a distinct pending-response record');
    assert.equal(queue.pending.length, 1);
    assert.equal(peer.writes.length, 1, 'the retained raw write prevents another dispatch');
    write.release();
    await context.cleanup;
    const secondWrite = await peer.nextWrite(1);
    await secondWrite.handedOff;
    assert.equal(closed, 1);
    assert.equal(f.delivery.activeCdcInvocation, null);
    assert.equal(queue.inFlight, 1, 'the successor alone now occupies the slot');
    write.release();
    await nextTurn();
    assert.equal(queue.inFlight, 1, 'duplicate old callback cannot free successor custody');
    assert.equal(f.router.pendingResponses.get('same-message'), pending);
    assert.equal(successorState.settled, false);
    peer.ack('same-message', {transportProbe: 'successor'});
    secondWrite.release();
    const answer = await successor;
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(answer)), true);
    assert.equal(answer.answer.transportProbe, 'successor');
    assert.equal(queue.inFlight, 0);
    assert.equal(f.router.pendingMessages.size, 0);
    assert.equal(f.router.pendingResponses.size, 0);
  });

for (const firstBoundary of ['write', 'ack']) {
  test(`router ${firstBoundary}-first completion retains the other transport obligation`,
    {timeout: CASE_TIMEOUT_MS}, async (t) => {
      const f = await cdcRouterFixture(t);
      const peer = await controlledCdcPeer(f);
      const context = f.invocation();
      const result = f.router.deliver(CDC_ROUTER_TEST.ADDRESS,
        {...PROBE, messageId: firstBoundary}, {deliveryContext: context});
      const observation = watchSettlement(result);
      const write = await peer.nextWrite(0);
      await write.handedOff;
      if (firstBoundary === 'write') write.release();
      else peer.ack(firstBoundary, {transportProbe: firstBoundary});
      await nextTurn();
      assert.equal(observation.settled, false);
      assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 1);
      if (firstBoundary === 'write') peer.ack(firstBoundary, {transportProbe: firstBoundary});
      else write.release();
      assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(await result)), true);
      context.finish();
      await context.cleanup;
      assert.equal(f.delivery.activeCdcInvocation, null);
      assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 0);
    });
}

test('router CLOSE notification alone cannot release a held write callback',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await controlledCdcPeer(f);
    const context = f.invocation();
    const result = f.router.deliver(CDC_ROUTER_TEST.ADDRESS, PROBE,
      {deliveryContext: context, timeoutMs: CDC_ROUTER_TEST.SHORT_MS});
    result.catch(() => {});
    const write = await peer.nextWrite(0);
    await write.handedOff;
    const queue = f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER);
    peer.peer.terminate();
    const retired = new Error('source stopped while socket write still awaits its callback');
    context.retire(retired);
    await nextTurn();
    await assert.rejects(result, (error) => error === retired);
    const cleanup = watchSettlement(context.cleanup);
    await nextTurn();
    assert.equal(cleanup.settled, false);
    assert.equal(queue.inFlight, 1, 'notification did not settle the exact raw send');
    const callbackError = new Error('controlled ws write failed after close');
    write.release(callbackError);
    await context.cleanup;
    assert.equal(queue.inFlight, 0);
    assert.equal(f.delivery.activeCdcInvocation, null);
  });

test('a ws throw after acquisition does not manufacture raw write cleanup',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const peer = await controlledCdcPeer(f, {throwAfterSend: true});
    const context = f.invocation();
    const result = f.router.deliver(CDC_ROUTER_TEST.ADDRESS, PROBE,
      {deliveryContext: context, timeoutMs: CDC_ROUTER_TEST.SHORT_MS});
    const write = await peer.nextWrite(0);
    await write.handedOff;
    f.clock.elapse(CDC_ROUTER_TEST.SHORT_MS);
    f.clock.dispatchDue();
    const refused = await result;
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(refused)), false);
    assert.equal(refused.transport.errorCode, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
    context.finish();
    const cleanup = watchSettlement(context.cleanup);
    await nextTurn();
    assert.equal(cleanup.settled, false);
    assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 1);
    write.release();
    await context.cleanup;
    assert.equal(f.router.getOutboundQueue(CDC_ROUTER_TEST.PEER).inFlight, 0);
  });

test('both in-process import paths expose the same callback owner', () => {
  assert.equal(routerPair, canonicalPair);
  assert.equal(RouterSocket, CanonicalSocket);
});

for (const [name, pairFactory] of [['canonical', canonicalPair], ['router', routerPair]]) {
  test(`${name} in-process pair reports callback only after handoff or actual closed-peer refusal`,
    {timeout: CASE_TIMEOUT_MS}, async (t) => {
      const pair = pairFactory();
      t.after(() => pair.a.terminate());
      const order = [];
      pair.b.on(TRANSPORT_EVENT.MESSAGE, (bytes) => order.push(`data:${bytes}`));
      pair.a.send('first', {binary: false}, (error) => {
        assert.equal(error, undefined);
        order.push('callback:first');
      });
      assert.deepEqual(order, [], 'enqueue is not completion');
      await nextTurn();
      assert.deepEqual(order, ['data:first', 'callback:first']);
      const errors = [];
      pair.a.send('second', (error) => errors.push(error));
      pair.b.terminate();
      assert.equal(errors.length, 0, 'the queued write still owns its deferred callback');
      await nextTurn();
      assert.equal(errors.length, 1);
      assert.ok(errors[0] instanceof Error);
      assert.deepEqual(order, ['data:first', 'callback:first'],
        'closed-peer data is not handed off and the earlier callback is not repeated');
    });
}

test('actual router shutdown and initialize never revive the old local invocation argument',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const address = `${CDC_ROUTER_TEST.LOCAL}/message-group/local-lifetime`;
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.closes.push(() => release.resolve());
    let effects = 0;
    f.router.register(address, async (_envelope, delivery, invocation) => {
      entered.resolve({delivery, invocation});
      await release.promise;
      invocation.assertCurrent();
      effects += 1;
      return {transportProbe: 'old'};
    });
    const context = f.invocation();
    const result = f.router.deliver(address, PROBE, {deliveryContext: context});
    const old = await entered.promise;
    assert.equal(old.delivery.isCurrent(), true);
    old.invocation.assertCurrent();
    await f.router.shutdown();
    const refused = await result;
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(refused)), false);
    assert.match(refused.transport.error, /shutdown/i, 'the refusal names the router shutdown');
    await f.router.initialize({startServer: false});
    assert.equal(f.router.isShuttingDown, false);
    assert.equal(old.delivery.isCurrent(), false);
    assert.throws(() => old.invocation.assertCurrent());
    assert.throws(() => old.invocation.remainingMs());
    assert.ok(context.remainingMs() > 0, 'the independent source grant is still otherwise live');
    context.finish();
    const cleanup = watchSettlement(context.cleanup);
    await nextTurn();
    assert.equal(cleanup.settled, false, 'old local handler remains an actual child');
    f.router.register(address, (_envelope, delivery, invocation) => {
      assert.equal(delivery.isCurrent(), true);
      invocation.assertCurrent();
      effects += 1;
      return {transportProbe: 'fresh'};
    });
    const fresh = await f.router.deliver(address, PROBE);
    assert.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(fresh)), true);
    assert.equal(fresh.answer.transportProbe, 'fresh');
    assert.equal(effects, 1);
    release.resolve();
    await context.cleanup;
    assert.equal(effects, 1, 'late old handler cannot cross its retained effect gate');
    assert.equal(f.delivery.activeCdcInvocation, null);
  });
