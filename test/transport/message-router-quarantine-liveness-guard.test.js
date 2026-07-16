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
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

async function buildRouter(t) {
  const router = new MessageRouter({nodeId: 'node-a'});
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

    t.equal(result.acknowledged, false,
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

    t.equal(result.acknowledged, false,
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

test('quarantine still fires when the peer has NO recent liveness evidence',
  async (t) => {
    initializeEnvironment();
    const router = await buildRouter(t);
    const {connection, ws} = installPeerConnection(router);
    // Stale evidence only: outside the 30s window.
    connection.lastAckAt = Date.now() - 60000;
    router.nodeInboundActivityAt.set(PEER_NODE_ID, Date.now() - 60000);

    const result = await router.deliver(
      `${PEER_NODE_ID}/service/no-ack`,
      {type: 'TEST'},
    );

    t.equal(result.acknowledged, false, 'delivery fails on ACK timeout');
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

    await router.deliver(`${PEER_NODE_ID}/service/no-ack`, {type: 'TEST'});

    t.not(router.nodeConnections.get(PEER_NODE_ID), connection,
      'with the window disabled, fresh evidence must not block quarantine');
  });
