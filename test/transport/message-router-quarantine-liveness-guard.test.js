import {deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from '../../src/transport/transport-semantic-outcome.js';
/**
 * CL-007 guard: the ACK-timeout quarantine must not sever a connection to a
 * peer that is demonstrably ALIVE (recent inbound traffic or a recent ACK) —
 * slow is not dead ("never break, only slow"). The timed-out message still
 * fails and retries; only the connection teardown is skipped. Peers with no
 * recent liveness evidence still quarantine exactly as before.
 *
 * Production witness (closure record CL-007): during 5-node formation all
 * four joiners quarantined the alive-but-saturated seed — their only
 * control-plane path — within one second of each other (ACK threshold 2 x
 * 5s), detonating ROUTER_CONNECTION_CLOSED cascades and the pressure-creep
 * stall.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const PEER_NODE_ID = 'node-b';
const PEER_ADDRESS = 'ws://node-b:9999';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    transport: {
      messageTimeoutMs: 100,
      reconnectIntervalMs: 100,
      ackTimeoutQuarantineThreshold: 1,
      ackTimeoutQuarantineLivenessWindowMs: 30000,
    },
  });
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function installPeerConnection(router) {
  const ws = {
    readyState: 1,
    send: () => {},
    terminateCalled: false,
    terminate() {
      this.terminateCalled = true;
    },
  };
  const connection = {
    nodeId: PEER_NODE_ID,
    nodeAddress: PEER_ADDRESS,
    connectionId: 'node-b-conn-1',
    ws,
    state: ConnectionState.CONNECTED,
    isIncoming: false,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    pingInterval: null,
    address: PEER_ADDRESS,
    isSelfConnection: false,
    ackTimeoutStreak: 0,
    lastAckAt: null,
    lastAckTimeoutAt: null,
  };
  router.nodeConnections.set(PEER_NODE_ID, connection);
  return {connection, ws};
}

// An earlier ACK timeout on this socket that began one keepalive round (and
// a margin) ago: the streak spans enough of the socket to be evidence.
function seedStreakSpanningKeepaliveRound(router, connection) {
  connection.ackTimeoutStreak = 1;
  connection.ackTimeoutStreakStartedAt = Date.now() -
    (router.pingIntervalMs + router.pingTimeoutMs + 1000);
}

async function buildRouter(t) {
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'node-a'});
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  return router;
}

test('quarantine is SKIPPED when the peer shows recent inbound activity',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);

    // Liveness evidence: a message from the peer arrived just now.
    router.recordNodeInboundActivity(PEER_NODE_ID);

    const result = await router.deliver(
      `${PEER_NODE_ID}/service/no-ack`,
      {type: 'TEST'},
    );

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
      'the timed-out message itself must still fail');
    const current = router.nodeConnections.get(PEER_NODE_ID);
    t.equal(current, connection,
      'the connection must NOT be replaced for an alive-but-slow peer');
    t.equal(current.state, ConnectionState.CONNECTED,
      'the connection must stay CONNECTED');
    t.equal(ws.terminateCalled, false,
      'the socket must not be terminated');
    t.ok(current.ackTimeoutStreak >= 1,
      'the ACK-timeout streak still accumulates for diagnostics');
  });

test('quarantine is SKIPPED when the peer recently ACKed (lastAckAt)',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection} = installPeerConnection(router);
    connection.lastAckAt = Date.now();

    const result = await router.deliver(
      `${PEER_NODE_ID}/service/no-ack`,
      {type: 'TEST'},
    );

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false,
      'the timed-out message itself must still fail');
    t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
      'a recent ACK is liveness evidence — connection preserved');
  });

test('keepalive timeout is SKIPPED when the peer has recent inbound activity',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    connection.missedPings = router.pingMaxMissed - 1;

    router.recordNodeInboundActivity(PEER_NODE_ID);
    router.recordMissedKeepalivePing(connection);

    t.equal(ws.terminateCalled, false,
      'missed PONGs must not sever a peer that is still sending traffic');
    t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
      'the current live connection must remain authoritative');
    t.equal(connection.missedPings, 0,
      'fresh peer traffic should reset the missed-PONG streak');
  });

test('bounded ping accepts fresh parsed inbound traffic as peer contact evidence',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    installPeerConnection(router);
    router.recordNodeInboundActivity(PEER_NODE_ID);

    const reachable = await router.pingNode(PEER_NODE_ID, 10);

    t.equal(reachable, true,
      'a slow PONG must not overrule fresh traffic from the same peer');
  });

test('bounded ping rejects fresh traffic from a connection closed while waiting',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection} = installPeerConnection(router);
    router.recordNodeInboundActivity(PEER_NODE_ID);

    const pendingReachability = router.pingNode(PEER_NODE_ID, 10);
    connection.state = ConnectionState.DISCONNECTED;
    const reachable = await pendingReachability;

    t.equal(reachable, false,
      'historical traffic must not revive a connection closed during ping');
  });

test('bounded ping rejects stale parsed inbound traffic as peer contact evidence',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    installPeerConnection(router);
    router.nodeInboundActivityAt.set(PEER_NODE_ID, Date.now() - 60000);

    const reachable = await router.pingNode(PEER_NODE_ID, 10);

    t.equal(reachable, false,
      'a silent peer outside the liveness window must remain uncontactable');
  });

test('quarantine still fires when the peer has NO recent liveness evidence',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    // Stale evidence only: outside the 30s window.
    connection.lastAckAt = Date.now() - 60000;
    router.nodeInboundActivityAt.set(PEER_NODE_ID, Date.now() - 60000);
    seedStreakSpanningKeepaliveRound(router, connection);

    const result = await router.deliver(
      `${PEER_NODE_ID}/service/no-ack`,
      {type: 'TEST'},
    );

    t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)), false, 'delivery fails on ACK timeout');
    const current = router.nodeConnections.get(PEER_NODE_ID);
    t.not(current, connection,
      'a silent peer must still be quarantined (connection replaced)');
    t.equal(connection.state, ConnectionState.CLOSED,
      'the stale connection must be closed');
    // The stale socket terminates after a grace of
    // max(reconnectIntervalMs, messageTimeoutMs) = 100ms in this config.
    await new Promise((resolve) => setTimeout(resolve, 250));
    t.equal(ws.terminateCalled, true,
      'the stale socket must be terminated');
  });

test('liveness window of 0 disables the guard (pre-change behavior)',
  async (t) => {
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
      transport: {
        messageTimeoutMs: 100,
        reconnectIntervalMs: 100,
        ackTimeoutQuarantineThreshold: 1,
        ackTimeoutQuarantineLivenessWindowMs: 0,
      },
    });
    const logging = LoggingService.getInstance();
    if (!logging.isInitialized()) {
      logging.initialize({level: 'error'});
    }
    const router = await buildRouter(t);
    const {connection} = installPeerConnection(router);
    router.recordNodeInboundActivity(PEER_NODE_ID);
    seedStreakSpanningKeepaliveRound(router, connection);

    const reachable = await router.pingNode(PEER_NODE_ID, 10);
    t.equal(reachable, false,
      'window zero must disable inbound evidence for bounded pings');

    await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'});

    t.not(router.nodeConnections.get(PEER_NODE_ID), connection,
      'with the window disabled, fresh evidence must not block quarantine');
  });

// --- Socket-specific evidence (reviewer finding S1) -------------------------
// Node-level inbound activity is stamped by any frame on any socket from the
// peer, so it cannot vouch for THIS outbound socket. Both directions of
// CL-007 must hold on socket-scoped evidence: late ACKs are answers (never a
// quarantine), and an outbound socket that returns no ACK at all for a full
// liveness window of timeouts is wedged (quarantined although the peer is
// heard elsewhere).

const LIVENESS_WINDOW_MS = 30000;
const SUSTAINED_STREAK = 7;

function ackFrame(messageId) {
  return JSON.stringify({
    type: RouterMessageType.ACK,
    messageId,
    acknowledged: true,
  });
}

function seedSustainedStreak(connection, {streakStartedAgoMs, lastAckAgoMs}) {
  const nowMs = Date.now();
  connection.ackTimeoutStreak = SUSTAINED_STREAK;
  connection.ackTimeoutStreakStartedAt = nowMs - streakStartedAgoMs;
  connection.lastAckTimeoutAt = nowMs;
  connection.lastAckAt = nowMs - lastAckAgoMs;
}

test('a late ACK on this socket ends the timeout streak: no quarantine',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    seedSustainedStreak(connection, {
      streakStartedAgoMs: LIVENESS_WINDOW_MS * 2,
      lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
    });

    // The ACK is late: its delivery already spent its bound, so no pending
    // entry is left to match. It still proves this socket answers.
    router.handleMessage(PEER_NODE_ID, ws, ackFrame('already-timed-out'));

    await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'});

    t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
      'a slow-but-answering socket must not be quarantined');
    t.equal(connection.state, ConnectionState.CONNECTED,
      'the connection stays CONNECTED');
    t.equal(ws.terminateCalled, false, 'the socket is not terminated');
    t.equal(connection.ackTimeoutStreak, 1,
      'the late ACK restarted the streak; only the new timeout is counted');
  });

test('a burst of ACK timeouts on a long-idle socket is slowness, not death',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    // The socket last ACKed long ago only because nothing was sent on it;
    // the timeouts all began a moment ago (short caller bounds).
    seedSustainedStreak(connection, {
      streakStartedAgoMs: 1000,
      lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
    });
    router.recordNodeInboundActivity(PEER_NODE_ID);

    await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'});

    t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
      'the socket has not been silent for a liveness window of asking');
    t.equal(ws.terminateCalled, false, 'the socket is not terminated');
  });

test('a silent outbound socket is quarantined although the peer is heard ' +
  'on another socket', async (t) => {
  initializeEnvironment();
  const router = await buildRouter(t);
  const {connection, ws} = installPeerConnection(router);
  seedSustainedStreak(connection, {
    streakStartedAgoMs: LIVENESS_WINDOW_MS * 2,
    lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
  });
  // The peer's own traffic keeps arriving (node-level stamp), but not one
  // ACK has come back on this outbound socket for two liveness windows.
  router.recordNodeInboundActivity(PEER_NODE_ID);

  const result = await router.deliver(
    `${PEER_NODE_ID}/service/no-ack`,
    {type: 'TEST'},
  );

  t.equal(isDeliveredTransportDeliveryOutcome(deliveryTransportOf(result)),
    false, 'the timed-out delivery fails');
  const current = router.nodeConnections.get(PEER_NODE_ID);
  t.not(current, connection,
    'node-level inbound activity must not shield a wedged outbound socket');
  t.equal(connection.state, ConnectionState.CLOSED,
    'the wedged connection is retired');
  t.equal(current.ackTimeoutStreak, 0,
    'the replacement dial starts a fresh streak');
  t.equal(current.ackTimeoutStreakStartedAt, null,
    'the replacement dial carries no streak start');
  await new Promise((resolve) => setTimeout(resolve, 250));
  t.equal(ws.terminateCalled, true, 'the wedged socket is terminated');
});

test('a sustained streak that has not yet lasted a liveness window defers ' +
  'to node-level liveness', async (t) => {
  initializeEnvironment();
  const router = await buildRouter(t);
  const {connection} = installPeerConnection(router);
  seedSustainedStreak(connection, {
    streakStartedAgoMs: LIVENESS_WINDOW_MS - 5000,
    lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
  });
  router.recordNodeInboundActivity(PEER_NODE_ID);

  await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'});

  t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
    'inside the window the socket is still only slow');
});

test('late-ACK recording credits only the current outbound socket',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);

    t.test('an ACK on the current outbound socket is recorded', async (t) => {
      const {connection, ws} = installPeerConnection(router);
      seedSustainedStreak(connection, {
        streakStartedAgoMs: 1000,
        lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
      });
      const before = Date.now();
      router.handleMessage(PEER_NODE_ID, ws, ackFrame('late-1'));
      t.equal(connection.ackTimeoutStreak, 0, 'the streak is reset');
      t.equal(connection.ackTimeoutStreakStartedAt, null,
        'the streak start is cleared');
      t.equal(connection.lastAckTimeoutAt, null,
        'the last ACK timeout is cleared');
      t.ok(connection.lastAckAt >= before, 'lastAckAt is stamped now');
    });

    t.test('an ACK on a socket that is not the record\'s socket is not ' +
      'credited, even when it settles a pending delivery', async (t) => {
      const {connection} = installPeerConnection(router);
      seedSustainedStreak(connection, {
        streakStartedAgoMs: 1000,
        lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
      });
      const staleAckAt = connection.lastAckAt;
      let settled = null;
      router.pendingMessages.set('sent-on-retired-socket', {
        targetNodeId: PEER_NODE_ID,
        timeout: null,
        resolve: (value) => {
          settled = value;
        },
        reject: () => {},
      });
      const retiredWs = {readyState: 1, send: () => {}};
      router.handleMessage(
        PEER_NODE_ID, retiredWs, ackFrame('sent-on-retired-socket'));
      t.equal(settled?.acknowledged, true,
        'the pending delivery is still acknowledged');
      t.equal(connection.ackTimeoutStreak, SUSTAINED_STREAK,
        'another socket\'s ACK does not reset this socket\'s streak');
      t.equal(connection.lastAckAt, staleAckAt,
        'another socket\'s ACK is not this socket\'s evidence');
    });

    t.test('an ACK on an incoming record is not credited', async (t) => {
      const {connection, ws} = installPeerConnection(router);
      connection.isIncoming = true;
      seedSustainedStreak(connection, {
        streakStartedAgoMs: 1000,
        lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
      });
      router.handleMessage(PEER_NODE_ID, ws, ackFrame('late-2'));
      t.equal(connection.ackTimeoutStreak, SUSTAINED_STREAK,
        'outbound-only: an incoming record keeps no ACK-timeout evidence');
    });

    t.test('an ACK on the self-connection is not credited', async (t) => {
      const {connection, ws} = installPeerConnection(router);
      connection.isSelfConnection = true;
      seedSustainedStreak(connection, {
        streakStartedAgoMs: 1000,
        lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
      });
      router.handleMessage(PEER_NODE_ID, ws, ackFrame('late-3'));
      t.equal(connection.ackTimeoutStreak, SUSTAINED_STREAK,
        'the self-connection is never quarantined and keeps no evidence');
    });

    t.test('a negative ACK is not an acknowledgement', async (t) => {
      const {connection, ws} = installPeerConnection(router);
      seedSustainedStreak(connection, {
        streakStartedAgoMs: 1000,
        lastAckAgoMs: LIVENESS_WINDOW_MS * 2,
      });
      router.handleMessage(PEER_NODE_ID, ws, JSON.stringify({
        type: RouterMessageType.ACK,
        messageId: 'late-4',
        acknowledged: false,
      }));
      t.equal(connection.ackTimeoutStreak, SUSTAINED_STREAK,
        'only acknowledged ACK frames count');
    });
  });

// --- Streak span and keepalive cadence (review finding F6) ------------------
// A healthy idle socket: nothing sent on it for a while, its peer's last
// PONG just outside the liveness window. A burst of short-bound ACK timeouts
// that spans less than one keepalive round is no evidence against it.

test('a short burst of ACK timeouts on a healthy idle socket never quarantines it',
  async (t) => {
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
      transport: {
        messageTimeoutMs: 100,
        reconnectIntervalMs: 100,
        ackTimeoutQuarantineThreshold: 2,
        ackTimeoutQuarantineLivenessWindowMs: LIVENESS_WINDOW_MS,
      },
    });
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    connection.lastAckAt = Date.now() - (LIVENESS_WINDOW_MS + 1000);
    router.nodeInboundActivityAt.set(PEER_NODE_ID, Date.now() - (LIVENESS_WINDOW_MS + 1000));

    for (let index = 0; index < 2; index += 1) {
      await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'},
        {timeoutMs: 20});
    }

    t.equal(connection.ackTimeoutStreak, 2, 'the streak reached the threshold');
    t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
      'a streak shorter than one keepalive round is not evidence against the socket');
    t.equal(ws.terminateCalled, false, 'the socket is not terminated');
  });

test('the default keepalive runs strictly inside the liveness window', async (t) => {
  const {TRANSPORT_DEFAULT} = await import('../../src/constants/transport.js');
  const {DEFAULT_CONFIG} = await import('../../src/config/config-definitions.js');
  t.ok(TRANSPORT_DEFAULT.PING_INTERVAL_MS + TRANSPORT_DEFAULT.PING_TIMEOUT_MS <
    TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
  'a keepalive round (interval plus PONG bound) ends inside the window');
  t.same({
    pingIntervalMs: DEFAULT_CONFIG.transport.pingIntervalMs,
    window: DEFAULT_CONFIG.transport.ackTimeoutQuarantineLivenessWindowMs,
  }, {
    pingIntervalMs: TRANSPORT_DEFAULT.PING_INTERVAL_MS,
    window: TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_LIVENESS_WINDOW_MS,
  }, 'the configuration defaults are the constants owner\'s, never a second copy');
});
