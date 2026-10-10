/**
 * A bounded ping (MessageRouter.pingNode, bound PING_TIMEOUT_MS or the
 * caller's timeout) is a spent wait when no PONG arrives and the ping
 * resolves dead: exactly one wait_bound_spent ERROR naming the bound and
 * what the router last observed of the peer, and the same `false` answer as
 * before. A ping answered by a PONG logs none. A ping (or a keepalive)
 * whose timer expires but whose peer is answered alive by recent inbound
 * traffic is not a spent wait: it keeps its INFO line and logs no ERROR.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  MessageRouter,
  ConnectionState,
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {ROUTER_LOG_MSG} from '../../src/constants/transport.js';

const PING_BOUND_MS = 10;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    transport: {
      messageTimeoutMs: 100,
      reconnectIntervalMs: 100,
      ackTimeoutQuarantineLivenessWindowMs: 30000,
    },
  });
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function installPeerConnection(router, peerNodeId) {
  router.nodeConnections.set(peerNodeId, {
    nodeId: peerNodeId,
    connectionId: `${peerNodeId}-conn-1`,
    ws: {readyState: 1, send: () => {}, terminate() {}},
    state: ConnectionState.CONNECTED,
    isIncoming: false,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    pingInterval: null,
    address: `ws://${peerNodeId}:9999`,
    isSelfConnection: false,
  });
}

async function buildRouter(t, capture) {
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
  });
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  router.logger = capture.logger;
  return router;
}

test('a ping with no PONG and no recent traffic spends its bound: one ' +
  'wait_bound_spent ERROR and the same false answer', async (t) => {
  initializeEnvironment();
  const capture = captureLogger();
  const router = await buildRouter(t, capture);
  installPeerConnection(router, 'node-silent');
  router.nodeInboundActivityAt.set('node-silent', Date.now() - 60000);

  const reachable = await router.pingNode('node-silent', PING_BOUND_MS);

  t.equal(reachable, false, 'the post-expiry answer is unchanged');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  const context = spent[0].context;
  t.equal(context.wait, 'PING_TIMEOUT_MS');
  t.equal(context.boundMs, PING_BOUND_MS);
  t.same(context.lastObserved, {
    connectionReplaced: false,
    answeredAliveByRecentInbound: false,
    livenessWindowMs: 30000,
  }, 'lastObserved says what the router saw of the peer at expiry');
  t.match(context.scope, {nodeId: 'node-a', targetNodeId: 'node-silent'});
});

test('a ping answered by a PONG logs no spent wait', async (t) => {
  initializeEnvironment();
  const capture = captureLogger();
  const router = await buildRouter(t, capture);
  installPeerConnection(router, 'node-answering');

  const reachability = router.pingNode('node-answering', 60000);
  // The inbound PONG handler's settlement of the pending ping.
  const [[pingId, pending]] = [...router.pendingPings.entries()];
  router.timeSource.clearTimeout(pending.timeout);
  router.pendingPings.delete(pingId);
  pending.resolve(true);

  t.equal(await reachability, true);
  t.equal(capture.spent().length, 0,
    'no spent wait on normal completion');
});

test('a ping whose timer expires but whose peer sent recent inbound ' +
  'traffic is answered alive: INFO, no wait_bound_spent', async (t) => {
  initializeEnvironment();
  const capture = captureLogger();
  const router = await buildRouter(t, capture);
  installPeerConnection(router, 'node-busy');
  router.recordNodeInboundActivity('node-busy');

  const reachable = await router.pingNode('node-busy', PING_BOUND_MS);

  t.equal(reachable, true, 'the post-expiry answer is unchanged (alive)');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent for an alive peer');
  t.equal(capture.errors().length, 0, 'no ERROR for an alive peer');
  const info = capture.lines.filter((line) => line.level === 'info' &&
    line.message === ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND);
  t.equal(info.length, 1, 'the alive-by-inbound INFO line is logged');
  t.equal(info[0].context.nodeId, 'node-busy');
  t.equal(info[0].context.livenessWindowMs, 30000);
});

test('a keepalive whose peer sent recent inbound traffic keeps the ' +
  'connection: INFO, no wait_bound_spent', async (t) => {
  initializeEnvironment();
  const capture = captureLogger();
  const router = await buildRouter(t, capture);
  installPeerConnection(router, 'node-busy');
  const connection = router.nodeConnections.get('node-busy');
  let terminated = false;
  connection.ws.terminate = () => {
    terminated = true;
  };
  connection.missedPings = router.pingMaxMissed - 1;
  router.recordNodeInboundActivity('node-busy');

  router.recordMissedKeepalivePing(connection);

  t.equal(terminated, false, 'the alive connection is kept');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent for an alive peer');
  t.equal(capture.errors().length, 0, 'no ERROR for an alive peer');
  const info = capture.lines.filter((line) => line.level === 'info' &&
    line.message === ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE);
  t.equal(info.length, 1, 'the skipped-alive INFO line is logged');
  t.match(info[0].context, {
    nodeId: 'node-busy',
    connectionId: 'node-busy-conn-1',
    missedPings: router.pingMaxMissed,
    livenessWindowMs: 30000,
  });
});

test('a keepalive whose peer is silent severs the socket: one ' +
  'wait_bound_spent ERROR', async (t) => {
  initializeEnvironment();
  const capture = captureLogger();
  const router = await buildRouter(t, capture);
  installPeerConnection(router, 'node-gone');
  const connection = router.nodeConnections.get('node-gone');
  let terminated = false;
  connection.ws.terminate = () => {
    terminated = true;
  };
  connection.missedPings = router.pingMaxMissed - 1;
  router.nodeInboundActivityAt.set('node-gone', Date.now() - 60000);

  router.recordMissedKeepalivePing(connection);

  t.equal(terminated, true, 'the stale socket is severed as before');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  t.equal(spent[0].context.wait, 'PING_TIMEOUT_MS x pingMaxMissed (keepalive)');
  t.same(spent[0].context.lastObserved, {
    missedPings: router.pingMaxMissed,
    answeredAliveByRecentInbound: false,
    severed: true,
  });
});
