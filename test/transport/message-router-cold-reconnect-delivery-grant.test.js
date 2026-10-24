/**
 * Cold-reconnect delivery grant witness (C6).
 *
 * A delivery that finds its target cold dials it as a child of the delivery
 * grant: `shouldDeferColdReconnectForDeliveryBudget` defers only when the
 * remaining grant is below the minimum operation budget, and the dial owner
 * (`establishConnection`) bounds the connect timer by
 * min(connectTimeoutMs, remaining grant). The gate must never compare the
 * debited remainder with the undebited connect limit: with default options
 * (connectTimeoutMs = messageTimeoutMs) that comparison deferred every cold
 * delivery once one millisecond of its grant had elapsed.
 */

import net from 'node:net';
import t from '../../src/test-helpers/tap.js';
import {MessageRouter, ConnectionState} from
  '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {acknowledgeThenRespond} from '../test-helpers/message-router-remote-answer.js';

const REMOTE_NODE_ID = 'cold-remote-node';
const TARGET_ADDRESS = `${REMOTE_NODE_ID}/service/remote-service`;
const MESSAGE = Object.freeze({type: 'TEST_MESSAGE'});
const ELAPSED_BEFORE_DIAL_MS = 3;
const SHORT_GRANT_MS = 300;
// The proof is "bounded by the grant, not by the 5000 ms connect limit"; the
// slack only absorbs a slow host and stays far below the connect limit.
const SHORT_GRANT_SLACK_MS = 1200;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'cold-dialer'},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

async function createRouter(t, options = {}) {
  initializeTestEnvironment();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'cold-dialer',
    ...options,
  });
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
    cleanupTestEnvironment();
  });
  return router;
}

/**
 * Resolve the cold target once, spending `elapsedMs` of the delivery grant on
 * the virtual clock at the moment the delivery owner resolves the reconnect
 * address (immediately before the gate reads the remaining grant).
 * @param {MessageRouter} router
 * @param {VirtualTimeSource} clock
 * @param {number} elapsedMs
 */
function resolveAfterElapsed(router, clock, elapsedMs) {
  let spent = false;
  router.setNodeAddressResolver((nodeId) => {
    if (nodeId !== REMOTE_NODE_ID) {
      return null;
    }
    if (!spent) {
      spent = true;
      clock.advance(elapsedMs);
    }
    return 'ws://cold-remote-node:9999';
  });
}

function countDials(router) {
  const dials = [];
  router.connectToNode = async (nodeId, address, options = {}) => {
    dials.push({nodeId, address, connectBudgetMs: options.connectBudgetMs});
    router.nodeConnections.set(nodeId, {
      nodeId,
      address,
      state: ConnectionState.CONNECTED,
      ws: {},
      isIncoming: false,
    });
  };
  router.sendMessage = async (
    _connection, _targetAddress, messageId, _payload, targetNodeId,
    correlationId,
  ) => acknowledgeThenRespond(router, {messageId, correlationId,
    result: {targetNodeId}});
  return dials;
}

t.test('default-configured cold reconnect dials once its grant is debited ' +
  '(shouldDeferColdReconnectForDeliveryBudget reads the remaining grant)',
async (t) => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = await createRouter(t, {timeSource: clock});
  t.equal(router.connectTimeoutMs, router.messageTimeoutMs,
    'fixture uses the default connect limit (= messageTimeoutMs)');
  resolveAfterElapsed(router, clock, ELAPSED_BEFORE_DIAL_MS);
  const dials = countDials(router);

  const result = await router.deliver(TARGET_ADDRESS, MESSAGE);

  t.equal(dials.length, 1, 'the cold target is dialled, not deferred');
  t.equal(result.acknowledged, true, 'the delivery completes on the new socket');
  t.ok(dials[0]?.connectBudgetMs > 0 &&
    dials[0]?.connectBudgetMs <=
      router.messageTimeoutMs - ELAPSED_BEFORE_DIAL_MS,
  'the dial receives the debited remaining grant as its connect budget');
});

t.test('a grant below the minimum operation budget defers typed without ' +
  'dialling (buildColdReconnectBudgetFailure)', async (t) => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = await createRouter(t, {timeSource: clock});
  const leftMs = TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS - 1;
  resolveAfterElapsed(router, clock, router.messageTimeoutMs - leftMs);
  const dials = countDials(router);

  const result = await router.deliver(TARGET_ADDRESS, MESSAGE);

  t.equal(dials.length, 0, 'no dial is started on a spent grant');
  t.equal(result.acknowledged, false, 'the delivery fails closed');
  t.equal(result.deferRetry, true, 'the refusal carries deferRetry evidence');
  t.equal(result.errorCode, ROUTER_CONNECTION_CLOSED_ERROR_CODE,
    'the refusal is typed by the reconnect owner');
  t.equal(router.nodeConnections.get(REMOTE_NODE_ID)?.state,
    ConnectionState.RECONNECTING,
    'the reconnect owner is armed for the peer');
});

t.test('an exhausted grant is refused by the delivery lifetime without ' +
  'dialling', async (t) => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const router = await createRouter(t, {timeSource: clock});
  resolveAfterElapsed(router, clock, router.messageTimeoutMs);
  const dials = countDials(router);

  const result = await router.deliver(TARGET_ADDRESS, MESSAGE);

  t.equal(dials.length, 0, 'no dial is started on an exhausted grant');
  t.equal(result.acknowledged, false, 'the delivery fails closed');
  t.equal(result.deferRetry, true, 'the refusal carries deferRetry evidence');
  t.equal(result.errorCode, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    'the refusal is typed by the delivery lifetime owner');
});

t.test('a real cold dial started with a short grant is bounded by the grant, ' +
  'not by connectTimeoutMs (establishConnection connect timer)', async (t) => {
  // A peer that accepts TCP and never answers the WebSocket upgrade: only the
  // dial owner's connect timer can end the dial.
  const accepted = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    const dial = {acceptedAtMs: Date.now(), closedAtMs: null};
    accepted.push(dial);
    socket.on('close', () => {
      dial.closedAtMs = Date.now();
    });
    socket.on('error', () => {});
    // Drain the upgrade request so the client's close is observed as 'close'.
    socket.resume();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  t.teardown(() => new Promise((resolve) => {
    server.close(() => resolve());
    for (const socket of sockets) {
      socket.destroy();
    }
  }));
  const router = await createRouter(t);
  t.ok(router.connectTimeoutMs > SHORT_GRANT_MS + SHORT_GRANT_SLACK_MS,
    'fixture connect limit is far longer than the grant');
  router.setNodeAddressResolver((nodeId) =>
    nodeId === REMOTE_NODE_ID ? `ws://127.0.0.1:${port}` : null);

  const startedAtMs = Date.now();
  const result = await router.deliver(TARGET_ADDRESS, MESSAGE,
    {timeoutMs: SHORT_GRANT_MS});
  const returnedAfterMs = Date.now() - startedAtMs;
  const dialsWhenReturned = accepted.length;
  const dialSettled = router.pendingNodeConnections.get(REMOTE_NODE_ID);
  await dialSettled;
  // The server observes the client's terminate one TCP round trip later.
  const closeDeadlineMs = startedAtMs + SHORT_GRANT_MS + SHORT_GRANT_SLACK_MS;
  while (accepted[0]?.closedAtMs === null && Date.now() < closeDeadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  t.equal(dialsWhenReturned, 1, 'the cold target is dialled once');
  t.equal(result.acknowledged, false, 'the unanswered dial fails closed');
  t.equal(result.deferRetry, true, 'the outcome carries deferRetry evidence');
  t.ok([ROUTER_CONNECTION_CLOSED_ERROR_CODE, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE]
    .includes(result.errorCode), `typed outcome (${result.errorCode})`);
  t.ok(returnedAfterMs < SHORT_GRANT_MS + SHORT_GRANT_SLACK_MS,
    `the delivery returns within its grant (${returnedAfterMs}ms)`);
  const closedAfterMs = Number.isFinite(accepted[0]?.closedAtMs) ?
    accepted[0].closedAtMs - startedAtMs : null;
  t.ok(closedAfterMs !== null &&
    closedAfterMs < SHORT_GRANT_MS + SHORT_GRANT_SLACK_MS,
  `the dial is terminated within the grant (closed after ${closedAfterMs}ms)`);
  t.equal(router.nodeConnections.get(REMOTE_NODE_ID)?.state,
    ConnectionState.RECONNECTING,
    'the failed dial arms the reconnect owner for the peer');
});
