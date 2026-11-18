/**
 * A dialer that abandons its outbound socket (ACK-timeout quarantine retires
 * the record and re-dials while the retired socket stays open for a grace)
 * must not have its re-dial refused as a duplicate by the acceptor, which
 * still holds the abandoned socket as its CONNECTED incoming primary.
 *
 * The connection-authority owner decides this on the dialer's own evidence:
 * a dialer sends IDENTIFY only on the socket it holds current, so a later
 * IDENTIFY from the same dialer boot supersedes the earlier incoming socket,
 * in either node-id ordering. An OLDER dial arriving out of order, or a frame
 * without the dialer's stamp, never displaces the current primary.
 */

import {EventEmitter} from 'node:events';
import {test} from '../../src/test-helpers/tap.js';
import {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const DIALER_ADDRESS = 'ws://dialer:9999';
const FIRST_DIAL_AT = 1000;
const REDIAL_AT = 2000;
// The acceptor sorts below and above the dialer: the refusal existed in both
// orderings because the existing primary is the dialer's own earlier socket.
const NODE_ORDERINGS = Object.freeze([
  Object.freeze({acceptor: 'node-a', dialer: 'node-b'}),
  Object.freeze({acceptor: 'node-z', dialer: 'node-b'}),
]);

function initializeEnvironment(nodeId) {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId},
    logging: {level: 'error'},
  });
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createIncomingSocket() {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.sent = [];
  ws.terminateCalled = false;
  ws.send = (bytes) => {
    ws.sent.push(JSON.parse(String(bytes)));
  };
  ws.terminate = () => {
    ws.terminateCalled = true;
    ws.readyState = 3;
  };
  ws.close = ws.terminate;
  return ws;
}

function identify(ws, dialer, timestamp, bootIncarnation = TEST_BOOT_INCARNATION) {
  ws.emit('message', JSON.stringify({
    type: RouterMessageType.IDENTIFY,
    nodeId: dialer,
    nodeAddress: DIALER_ADDRESS,
    bootIncarnation,
    ...(timestamp === undefined ? {} : {timestamp}),
  }));
}

async function buildAcceptor(t, nodeId) {
  initializeEnvironment(nodeId);
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId,
  });
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  return router;
}

function acceptDial(router, dialer, timestamp, bootIncarnation = TEST_BOOT_INCARNATION) {
  const ws = createIncomingSocket();
  router.handleIncomingConnection(ws, null);
  identify(ws, dialer, timestamp, bootIncarnation);
  return ws;
}

for (const {acceptor, dialer} of NODE_ORDERINGS) {
  test('a re-dial from the same dialer boot supersedes its abandoned socket ' +
    `(acceptor ${acceptor}, dialer ${dialer})`, async (t) => {
    const router = await buildAcceptor(t, acceptor);
    const abandoned = acceptDial(router, dialer, FIRST_DIAL_AT);
    t.equal(router.nodeConnections.get(dialer)?.ws, abandoned,
      'the first dial is the primary');

    const redial = acceptDial(router, dialer, REDIAL_AT);

    const primary = router.nodeConnections.get(dialer);
    t.equal(primary?.ws, redial,
      'the re-dial is adopted, not refused as a duplicate');
    t.equal(primary?.state, ConnectionState.CONNECTED,
      'the adopted re-dial is CONNECTED');
    t.equal(redial.terminateCalled, false, 'the re-dial is kept open');
    t.equal(abandoned.terminateCalled, true,
      'the socket the dialer abandoned is terminated');
    t.ok(redial.sent.some((frame) => frame.type === RouterMessageType.IDENTIFY),
      'the adopted re-dial is answered with this side\'s IDENTIFY');
  });

  test('an older dial arriving after a newer one does not displace it ' +
    `(acceptor ${acceptor}, dialer ${dialer})`, async (t) => {
    const router = await buildAcceptor(t, acceptor);
    const current = acceptDial(router, dialer, REDIAL_AT);

    const olderDial = acceptDial(router, dialer, FIRST_DIAL_AT);

    t.equal(router.nodeConnections.get(dialer)?.ws, current,
      'the newer dial stays the primary');
    t.equal(current.terminateCalled, false, 'the newer dial is kept open');
    t.equal(olderDial.terminateCalled, true, 'the older dial is refused');
  });

  test('a dial without the dialer\'s stamp never supersedes ' +
    `(acceptor ${acceptor}, dialer ${dialer})`, async (t) => {
    const router = await buildAcceptor(t, acceptor);
    const current = acceptDial(router, dialer, FIRST_DIAL_AT);

    const unstamped = acceptDial(router, dialer, undefined);

    t.equal(router.nodeConnections.get(dialer)?.ws, current,
      'the stamped primary is kept');
    t.equal(unstamped.terminateCalled, true, 'the unstamped dial is refused');
  });
}

test('an existing OUTBOUND primary keeps the node-id tie-break: a later ' +
  'incoming dial is not a re-dial of the same dialer', async (t) => {
  const router = await buildAcceptor(t, 'node-a');
  const outboundWs = createIncomingSocket();
  router.nodeConnections.set('node-b', {
    connectionId: 'outbound-1',
    nodeId: 'node-b',
    ws: outboundWs,
    state: ConnectionState.CONNECTED,
    isIncoming: false,
    isSelfConnection: false,
    bootIncarnation: TEST_BOOT_INCARNATION,
    dialerIdentifiedAt: FIRST_DIAL_AT,
    address: DIALER_ADDRESS,
  });

  const incoming = acceptDial(router, 'node-b', REDIAL_AT);

  t.equal(router.nodeConnections.get('node-b')?.ws, outboundWs,
    'node-a < node-b keeps its own outbound primary');
  t.equal(incoming.terminateCalled, true,
    'the cross-connect duplicate is refused as before');
});

// The same-boot rule applies only to a boot KNOWN to be the same. The
// acceptor sorts below the dialer, so the node-id tie-break keeps the
// existing incoming primary and only the same-boot rule could displace it.
test('a later dial from a different known boot is no re-dial of the same boot',
  async (t) => {
    const router = await buildAcceptor(t, 'node-a');
    const current = acceptDial(router, 'node-b', FIRST_DIAL_AT, TEST_BOOT_INCARNATION + 1);
    const otherBoot = router.connectionAuthorityOwner.isLaterDialFromSameDialerBoot(
      router.nodeConnections.get('node-b'),
      {dialerIdentifiedAt: REDIAL_AT},
      TEST_BOOT_INCARNATION,
      TEST_BOOT_INCARNATION + 1);
    t.equal(otherBoot, false, 'a later stamp from an older known boot never supersedes');
    t.equal(router.nodeConnections.get('node-b')?.ws, current, 'the primary is kept');
  });

test('an unknown boot incarnation never supersedes, even with a later stamp',
  async (t) => {
    const router = await buildAcceptor(t, 'node-a');
    const current = acceptDial(router, 'node-b', FIRST_DIAL_AT, 0);
    t.equal(router.nodeConnections.get('node-b')?.ws, current,
      'the first dial is the primary');

    const laterUnknown = acceptDial(router, 'node-b', REDIAL_AT, 0);

    t.equal(router.nodeConnections.get('node-b')?.ws, current,
      'two unknown incarnations are never the same boot: the primary is kept');
    t.equal(laterUnknown.terminateCalled, true, 'the unknown later dial is refused');
    t.equal(current.terminateCalled, false, 'the primary stays open');
  });
