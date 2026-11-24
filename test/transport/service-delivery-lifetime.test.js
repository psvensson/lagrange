import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {ROUTER_MESSAGE_TYPE, TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {createServiceDeliveryFixture} from '../test-helpers/service-delivery-fixture.js';

const LOCAL = 'delivery-receiver';
const REMOTE = 'delivery-sender';

test('delivery context uses actual adopted socket identity, not source fields', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  const delivery = await f.remote(REMOTE, 1, 'forged-payload-sender');
  assert.ok(delivery, 'registered remote handler requires owner-bound delivery context');
  assert.equal(delivery.senderNodeId, REMOTE);
  assert.equal(delivery.nodeId, LOCAL);
  assert.equal(delivery.senderBootIncarnation, 1);
  assert.equal(delivery.bootIncarnation, 1);
  assert.equal(delivery.isCurrent(), true);
  assert.equal(Object.isFrozen(delivery), true);
  assert.equal(JSON.parse(JSON.stringify(delivery)).isCurrent, undefined,
    'a serialized copy must not contain the local callable lifetime fence');
});

test('socket closure and same-boot replacement cannot revive an old delivery', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  const old = await f.remote(REMOTE);
  assert.ok(old, 'remote delivery context must be present');
  const firstConnection = f.router.nodeConnections.get(REMOTE);
  await f.closeRemote(REMOTE);
  assert.equal(old.isCurrent(), false);
  const replacement = await f.remote(REMOTE);
  assert.notEqual(f.router.nodeConnections.get(REMOTE), firstConnection);
  assert.notEqual(replacement.connectionId, old.connectionId);
  assert.equal(replacement.isCurrent(), true);
  assert.equal(old.isCurrent(), false, 'old delivery remains invalid after same-boot replacement');
});

test('missing or zero bootIncarnation IDENTIFY is rejected fail-closed without adoption', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  for (const frame of [
    {type: ROUTER_MESSAGE_TYPE.IDENTIFY, nodeId: REMOTE, nodeAddress: `ws://${REMOTE}:9999`},
    {type: ROUTER_MESSAGE_TYPE.IDENTIFY, nodeId: REMOTE, nodeAddress: `ws://${REMOTE}:9999`, bootIncarnation: 0},
  ]) {
    const pair = createInProcWebSocketPair();
    t.after(() => pair.a.terminate());
    const closed = Promise.withResolvers();
    let repliedIdentify = false;
    pair.a.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      if (JSON.parse(data.toString()).type === ROUTER_MESSAGE_TYPE.IDENTIFY) {
        repliedIdentify = true;
      }
    });
    pair.a.once(TRANSPORT_EVENT.CLOSE, closed.resolve);
    f.router.handleIncomingConnection(pair.b, null);
    pair.a.send(JSON.stringify(frame));
    await closed.promise;
    assert.equal(repliedIdentify, false, 'incomplete IDENTIFY must never be answered or adopted');
    assert.equal(f.router.nodeConnections.get(REMOTE), undefined,
      'incomplete IDENTIFY must not occupy the peer connection slot');
  }
});

test('newer boot adoption invalidates old socket delivery', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  const old = await f.remote(REMOTE, 1);
  const current = await f.remote(REMOTE, 2);
  assert.equal(current.senderBootIncarnation, 2);
  assert.equal(current.isCurrent(), true);
  assert.equal(old.isCurrent(), false, 'newly adopted boot permanently defeats old delivery');
});

test('router shutdown invalidates local delivery after reinitialization', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  const old = await f.local();
  assert.ok(old, 'local handler also receives an owned lifetime context');
  assert.equal(old.isCurrent(), true);
  await f.router.shutdown();
  assert.equal(old.isCurrent(), false);
  await f.router.initialize({startServer: false});
  const fresh = await f.local();
  assert.equal(fresh.isCurrent(), true);
  assert.equal(old.isCurrent(), false, 'shutdown permanently invalidates old contexts');
});
