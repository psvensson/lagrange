/**
 * A bounded ping (MessageRouter.pingNode, bound PING_TIMEOUT_MS or the
 * caller's timeout) is a spent wait when no PONG arrives: exactly one
 * wait_bound_spent ERROR naming the bound and what the router last observed
 * of the peer, and the same `false` answer as before. A ping answered by a
 * PONG logs none.
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
