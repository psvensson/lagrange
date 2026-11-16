import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  ConnectionState,
  MessageRouter,
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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

test('syncBootIncarnation transitions live bidirectional connections in place, fencing old deliveries and admitting new ones', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});

  const acceptor = new MessageRouter({
    nodeId: LOCAL,
    wsPort: 19940,
    inProcess: true,
    bootIncarnation: 1,
  });
  const dialer = new MessageRouter({
    nodeId: REMOTE,
    wsPort: 19941,
    inProcess: true,
    bootIncarnation: 1,
  });
  await acceptor.initialize({startServer: true});
  await dialer.initialize({startServer: true});
  t.after(async () => {
    await dialer.shutdown().catch(() => {});
    await acceptor.shutdown().catch(() => {});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await dialer.connectToNode(LOCAL, 'ws://localhost:19940');
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return predicate();
  };

  assert.equal(
    await waitFor(
      () =>
        acceptor.getCurrentPrimaryConnectionBootIncarnation(REMOTE)
          ?.bootIncarnation === 1 &&
        dialer.getCurrentPrimaryConnectionBootIncarnation(LOCAL)
          ?.bootIncarnation === 1,
    ),
    true,
  );

  const acceptorConn = acceptor.nodeConnections.get(REMOTE);
  const dialerConn = dialer.nodeConnections.get(LOCAL);
  const acceptorConnId = acceptorConn.connectionId;
  const dialerConnId = dialerConn.connectionId;

  // Direction 1: outbound dialer -> inbound acceptor
  const d1OnAcceptor =
    acceptor.connectionAuthorityOwner.captureIncomingDelivery(
      REMOTE,
      acceptorConn.ws,
    );
  assert.equal(d1OnAcceptor.senderBootIncarnation, 1);
  assert.equal(d1OnAcceptor.isCurrent(), true);

  dialer.syncBootIncarnation(2);
  assert.equal(
    await waitFor(
      () =>
        acceptor.getCurrentPrimaryConnectionBootIncarnation(REMOTE)
          ?.bootIncarnation === 2,
    ),
    true,
  );
  assert.equal(acceptor.nodeConnections.get(REMOTE).state, ConnectionState.CONNECTED);
  assert.deepEqual(
    acceptor.getCurrentPrimaryConnectionBootIncarnation(REMOTE),
    {
      nodeId: REMOTE,
      bootIncarnation: 2,
      connectionId: acceptorConnId,
    },
  );
  assert.equal(d1OnAcceptor.isCurrent(), false);
  const d2OnAcceptor =
    acceptor.connectionAuthorityOwner.captureIncomingDelivery(
      REMOTE,
      acceptorConn.ws,
    );
  assert.equal(d2OnAcceptor.senderBootIncarnation, 2);
  assert.equal(d2OnAcceptor.connectionId, acceptorConnId);
  assert.equal(d2OnAcceptor.isCurrent(), true);

  // Direction 2: inbound acceptor -> outbound dialer
  const d1OnDialer =
    dialer.connectionAuthorityOwner.captureIncomingDelivery(
      LOCAL,
      dialerConn.ws,
    );
  assert.equal(d1OnDialer.senderBootIncarnation, 1);
  assert.equal(d1OnDialer.isCurrent(), true);

  acceptor.syncBootIncarnation(2);
  assert.equal(
    await waitFor(
      () =>
        dialer.getCurrentPrimaryConnectionBootIncarnation(LOCAL)
          ?.bootIncarnation === 2,
    ),
    true,
  );
  assert.equal(dialer.nodeConnections.get(LOCAL).state, ConnectionState.CONNECTED);
  assert.deepEqual(
    dialer.getCurrentPrimaryConnectionBootIncarnation(LOCAL),
    {
      nodeId: LOCAL,
      bootIncarnation: 2,
      connectionId: dialerConnId,
    },
  );
  assert.equal(d1OnDialer.isCurrent(), false);
  const d2OnDialer =
    dialer.connectionAuthorityOwner.captureIncomingDelivery(
      LOCAL,
      dialerConn.ws,
    );
  assert.equal(d2OnDialer.senderBootIncarnation, 2);
  assert.equal(d2OnDialer.connectionId, dialerConnId);
  assert.equal(d2OnDialer.isCurrent(), true);
});
