import assert from 'node:assert/strict';
import {test} from 'node:test';
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

test('UNKNOWN identification stays compatible but grants no privileged delivery', async (t) => {
  const f = await createServiceDeliveryFixture(t, LOCAL);
  const delivery = await f.remote(REMOTE, 0);
  assert.equal(f.router.nodeConnections.get(REMOTE).bootIncarnation, 0);
  assert.equal(delivery, null, 'UNKNOWN socket identity must not become a membership grant');
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
