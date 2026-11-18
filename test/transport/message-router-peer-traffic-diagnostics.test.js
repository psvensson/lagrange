/**
 * The per-peer traffic diagnostics aggregate frame counters into at most one
 * line per active peer per interval, forget idle peers, bound their own
 * state, and never add work to the logs table. The router feeds them from
 * its real send and receive paths.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  FRAME_CLASS,
  PEER_TRAFFIC_INTERVAL_MS,
  PeerTrafficDiagnostics,
  classifyRouterFrame,
  countAnswerRows,
  describeServedQuery,
  reportRouterPeerTraffic,
} from '../../src/transport/message-router-peer-traffic-diagnostics.js';
import {
  MessageRouter,
  ConnectionState,
  RouterMessageType,
} from '../../src/transport/message-router.js';
import {ROUTER_LOG_MSG} from '../../src/constants/transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NO_GAUGES = () => ({});
const START_MS = 10000;

function openInterval(diagnostics) {
  diagnostics.collectDue(START_MS, NO_GAUGES);
}

test('frames are classed by what they carry', async (t) => {
  t.equal(classifyRouterFrame({type: RouterMessageType.ACK}), FRAME_CLASS.ACK);
  t.equal(classifyRouterFrame({type: RouterMessageType.PONG}), FRAME_CLASS.PONG);
  t.equal(classifyRouterFrame({type: RouterMessageType.SERVICE_RESPONSE}),
    FRAME_CLASS.RESPONSE);
  t.equal(classifyRouterFrame({
    type: RouterMessageType.SERVICE_MESSAGE, payload: {type: 'QUERY'},
  }), FRAME_CLASS.REQUEST);
  t.equal(classifyRouterFrame({
    type: RouterMessageType.SERVICE_MESSAGE, oneWay: true, payload: {},
  }), FRAME_CLASS.RAFT);
  t.equal(classifyRouterFrame({type: RouterMessageType.PING}), FRAME_CLASS.CONTROL);
  t.equal(classifyRouterFrame({type: RouterMessageType.IDENTIFY}),
    FRAME_CLASS.CONTROL);
});

test('no line is due before a full interval has passed', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  openInterval(diagnostics);
  diagnostics.recordSent('node-b', 100, FRAME_CLASS.REQUEST);

  t.equal(diagnostics.collectDue(START_MS + PEER_TRAFFIC_INTERVAL_MS - 1, NO_GAUGES),
    null, 'the interval is still open');
  const due = diagnostics.collectDue(START_MS + PEER_TRAFFIC_INTERVAL_MS, NO_GAUGES);
  t.equal(due.peerLines.length, 1, 'one line for the one active peer');
});

test('one line per active peer carries the interval totals', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  const ws = {};
  openInterval(diagnostics);
  diagnostics.recordReceived('node-b', ws, 40, FRAME_CLASS.ACK);
  diagnostics.recordReceived('node-b', ws, 900, FRAME_CLASS.RESPONSE);
  diagnostics.recordSent('node-b', 300, FRAME_CLASS.REQUEST);
  diagnostics.recordSentOnSocket(ws, 50, FRAME_CLASS.PONG);
  diagnostics.recordSent('node-b', 120, FRAME_CLASS.RAFT);
  for (const latencyMs of [5, 1, 9, 3, 7]) {
    diagnostics.recordOneWayLatency('node-b', latencyMs);
  }
  diagnostics.recordOneWayLatency('node-b', Number.NaN);

  const due = diagnostics.collectDue(START_MS + 1500, (peerKey) => ({
    bufferedAmount: 4096, queueInFlight: 2, queuePending: 3, gaugeFor: peerKey,
  }));

  t.same(due.peerLines, [{
    peerNodeId: 'node-b',
    intervalMs: 1500,
    bufferedAmount: 4096,
    queueInFlight: 2,
    queuePending: 3,
    gaugeFor: 'node-b',
    bytesSent: 470,
    bytesReceived: 940,
    framesSent: {ack: 0, pong: 1, raft: 1, request: 1, response: 0, control: 0},
    framesReceived: {ack: 1, pong: 0, raft: 0, request: 0, response: 1, control: 0},
    largestFrameSentBytes: 300,
    largestFrameReceivedBytes: 900,
    oneWayLatencyP50Ms: 5,
    oneWayLatencyMaxMs: 9,
    oneWayLatencySamples: 5,
    omittedPeers: 0,
  }], 'totals, largest frames and latency p50/max; a NaN latency is ignored');
});

test('an idle peer produces no line and keeps no state', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  openInterval(diagnostics);
  diagnostics.recordSent('node-b', 10, FRAME_CLASS.REQUEST);
  diagnostics.collectDue(START_MS + 1000, NO_GAUGES);

  const idle = diagnostics.collectDue(START_MS + 2000, NO_GAUGES);

  t.same(idle.peerLines, [], 'no activity, no line');
  t.equal(diagnostics.peers.size, 0,
    'keys of peers that went quiet (or reconnect-churn ids) are forgotten');
});

test('the lines per interval are capped, busiest peers first', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  openInterval(diagnostics);
  for (let index = 0; index < 20; index += 1) {
    diagnostics.recordSent(`node-${index}`, index + 1, FRAME_CLASS.REQUEST);
  }

  const due = diagnostics.collectDue(START_MS + 1000, NO_GAUGES);

  t.equal(due.peerLines.length, 16, 'at most sixteen peer lines per interval');
  t.equal(due.peerLines[0].peerNodeId, 'node-19', 'the busiest peer leads');
  t.ok(due.peerLines.every((line) => line.omittedPeers === 4),
    'every line says how many active peers were left out');
});

test('a frame sent on a socket never seen inbound is counted, unattributed',
  async (t) => {
    const diagnostics = new PeerTrafficDiagnostics();
    openInterval(diagnostics);
    diagnostics.recordSentOnSocket({}, 64, FRAME_CLASS.CONTROL);

    const due = diagnostics.collectDue(START_MS + 1000, NO_GAUGES);

    t.equal(due.peerLines[0].peerNodeId, 'unidentified');
    t.equal(due.peerLines[0].bytesSent, 64);
  });

test('served queries aggregate per table, operation and caller', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  openInterval(diagnostics);
  const served = {tableName: 'ratings', operation: 'select', sourceNodeId: 'node-a'};
  diagnostics.recordServedQuery(
    {...served, rowCount: 10, responseBytes: 2000, executionMs: 4});
  diagnostics.recordServedQuery(
    {...served, rowCount: 30, responseBytes: 5000, executionMs: 12});
  diagnostics.recordServedQuery(
    {...served, rowCount: null, responseBytes: 100, executionMs: 1});
  diagnostics.recordServedQuery({
    ...served, sourceNodeId: 'node-c', rowCount: 1, responseBytes: 90, executionMs: 2,
  });

  const due = diagnostics.collectDue(START_MS + 1000, NO_GAUGES);

  t.same(due.servedQueryLines, [{
    tableName: 'ratings', operation: 'select', sourceNodeId: 'node-a',
    queries: 3, rows: 40, queriesWithoutRowCount: 1,
    responseBytes: 7100, largestResponseBytes: 5000,
    executionMs: 17, maxExecutionMs: 12, intervalMs: 1000, omittedKeys: 0,
  }, {
    tableName: 'ratings', operation: 'select', sourceNodeId: 'node-c',
    queries: 1, rows: 1, queriesWithoutRowCount: 0,
    responseBytes: 90, largestResponseBytes: 90,
    executionMs: 2, maxExecutionMs: 2, intervalMs: 1000, omittedKeys: 0,
  }], 'one line per key, slowest first');
  t.same(diagnostics.collectDue(START_MS + 2000, NO_GAUGES).servedQueryLines, [],
    'the next interval starts empty');
});

test('served-query keys are bounded and the overflow is counted', async (t) => {
  const diagnostics = new PeerTrafficDiagnostics();
  openInterval(diagnostics);
  for (let index = 0; index < 70; index += 1) {
    diagnostics.recordServedQuery({
      tableName: `table_${index}`, operation: 'select', sourceNodeId: 'node-a',
      rowCount: 1, responseBytes: 1, executionMs: index,
    });
  }

  const due = diagnostics.collectDue(START_MS + 1000, NO_GAUGES);

  t.equal(due.servedQueryLines.length, 16, 'at most sixteen lines per interval');
  t.equal(due.servedQueryLines[0].omittedKeys, 6 + 48,
    'keys refused at the state bound plus keys cut from the lines');
  t.equal(diagnostics.servedQueries.size, 0, 'the state is drained');
});

test('a served query is recognised from the message, not from the address',
  async (t) => {
    t.same(describeServedQuery('node-b/service/query', {
      type: 'QUERY', sql: 'SELECT * FROM ratings WHERE user_id = ?',
    }), {operation: 'select', tableName: 'ratings'});
    t.equal(describeServedQuery('node-b/service/query', {type: 'HEARTBEAT'}), null,
      'a non-query message is not a served query');
    t.equal(countAnswerRows({rows: [1, 2, 3]}), 3);
    t.equal(countAnswerRows({result: {rows: [1]}}), 1);
    t.equal(countAnswerRows({ok: true}), null,
      'an answer without a row array has no row count, never zero');
  });

test('the router feeds the counters and logs through the console-only sink',
  async (t) => {
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'node-a'},
      logging: {level: 'error'},
    });
    const logging = LoggingService.getInstance();
    if (!logging.isInitialized()) {
      logging.initialize({level: 'error'});
    }
    const consoleOnly = [];
    const persisted = [];
    const originalConsoleOnly = logging.logConsoleOnly;
    const originalLog = logging.log;
    logging.logConsoleOnly = (level, message, context) => {
      consoleOnly.push({level, message, context});
    };
    logging.log = function countedLog(level, message, context) {
      persisted.push(message);
      return originalLog.call(this, level, message, context);
    };
    t.teardown(() => {
      logging.logConsoleOnly = originalConsoleOnly;
      logging.log = originalLog;
    });
    let nowMs = START_MS;
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-a',
      inProcess: true,
      timeSource: {
        now: () => nowMs,
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout: (handle) => clearTimeout(handle),
        setInterval: (callback, delayMs) => setInterval(callback, delayMs),
        clearInterval: (handle) => clearInterval(handle),
      },
    });
    router.register('node-a/service/query', () => ({rows: [{id: 1}, {id: 2}]}));
    const sentFrames = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 777,
      send: (bytes) => {
        sentFrames.push(JSON.parse(String(bytes)));
      },
    };
    router.nodeConnections.set('node-b', {
      nodeId: 'node-b', connectionId: 'c1', ws, state: ConnectionState.CONNECTED,
      isIncoming: true,
    });
    reportRouterPeerTraffic(router);

    const request = JSON.stringify({
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId: 'q-1',
      targetAddress: 'node-a/service/query',
      sourceAddress: 'node-b/router/node-b',
      sourceNodeId: 'node-b',
      payload: {type: 'QUERY', sql: 'SELECT * FROM ratings'},
      timestamp: nowMs,
    });
    router.handleMessage('node-b', ws, Buffer.from(request));
    const pong = JSON.stringify({
      type: RouterMessageType.PONG, pingId: 'none', timestamp: nowMs - 25,
    });
    router.handleMessage('node-b', ws, Buffer.from(pong));
    nowMs += 7;
    await new Promise((resolve) => setImmediate(resolve));
    nowMs = START_MS + PEER_TRAFFIC_INTERVAL_MS;
    reportRouterPeerTraffic(router);

    const ack = sentFrames.find((frame) => frame.type === RouterMessageType.ACK);
    t.equal(ack.timestamp, START_MS,
      'the ACK carries the sender stamp the receiver measures latency from');
    const peerLine = consoleOnly.find(
      (line) => line.message === ROUTER_LOG_MSG.PEER_TRAFFIC);
    t.equal(peerLine.level, 'info');
    t.equal(peerLine.context.peerNodeId, 'node-b');
    t.equal(peerLine.context.bufferedAmount, 777, 'the live socket backlog');
    t.equal(peerLine.context.framesReceived.request, 1);
    t.equal(peerLine.context.framesReceived.pong, 1);
    t.equal(peerLine.context.framesSent.ack, 1);
    t.equal(peerLine.context.framesSent.response, 1);
    t.equal(peerLine.context.bytesReceived,
      Buffer.byteLength(request) + Buffer.byteLength(pong),
      'received bytes are the raw frame sizes');
    t.equal(peerLine.context.oneWayLatencyMaxMs, 25,
      'PONG latency is receiver clock minus the sender stamp');
    const queryLine = consoleOnly.find(
      (line) => line.message === ROUTER_LOG_MSG.REMOTE_QUERY_SERVED);
    t.equal(queryLine.context.tableName, 'ratings');
    t.equal(queryLine.context.operation, 'select');
    t.equal(queryLine.context.sourceNodeId, 'node-b');
    t.equal(queryLine.context.rows, 2);
    t.equal(queryLine.context.executionMs, 7);
    t.ok(queryLine.context.responseBytes > 0, 'the encoded response size');
    t.notOk(persisted.includes(ROUTER_LOG_MSG.PEER_TRAFFIC) ||
      persisted.includes(ROUTER_LOG_MSG.REMOTE_QUERY_SERVED),
    'neither line goes through the persisting log path');
  });
