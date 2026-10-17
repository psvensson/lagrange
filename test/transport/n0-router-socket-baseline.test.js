/**
 * N0: observational MessageRouter real TCP/WebSocket baseline.
 * Both peers use 127.0.0.1 on a physical lab machine. The counters are
 * TCP stream bytes (with WS framing), NOT IP headers or inter-host packets.
 * No production instrumentation, port forwarding, SSH, or network fallback.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:net';
import {performance} from 'node:perf_hooks';

import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';

const HOST = '127.0.0.1';
const A = 'n0-socket-a';
const B = 'n0-socket-b';
const SERVICE = B + '/service/n0-socket';
const RAFT = B + '/partition/n0-raft';
const DEADLINE_MS = 5000;
const RAFT_FRAMES = 8;
const DATA_BYTES = Object.freeze([0, 128, 1024, 4096]);

async function twoPorts() {
  const servers = [];
  try {
    for (let i = 0; i < 2; i++) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, HOST, resolve);
      });
      servers.push(server);
    }
    const ports = servers.map((server) => server.address().port);
    assert.notEqual(ports[0], ports[1]);
    return ports;
  } finally {
    for (const server of servers) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

async function until(condition, name) {
  const end = Date.now() + DEADLINE_MS;
  while (Date.now() < end) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.ok(condition(), name);
}

function sample(ws) {
  const socket = ws?._socket;
  assert.ok(socket, 'real IP socket required, not an in-process stub');
  assert.ok(Number.isSafeInteger(socket.bytesRead));
  assert.ok(Number.isSafeInteger(socket.bytesWritten));
  return {read: socket.bytesRead, written: socket.bytesWritten};
}

function diff(a, b) {
  assert.ok(b.read >= a.read && b.written >= a.written);
  return {read: b.read - a.read, written: b.written - a.written};
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
}

test('N0 real WS socket measures service, ACK and Raft-direct frames',
  {timeout: 25000}, async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: A},
      transport: {wsHost: HOST},
      logging: {level: 'error'},
    });
    LoggingService.getInstance().initialize({level: 'error'});
    const [portA, portB] = await twoPorts();
    const address = (port) => 'ws://' + HOST + ':' + port;
    const a = new MessageRouter({
      nodeId: A, bootIncarnation: TEST_BOOT_INCARNATION,
      nodeAddress: address(portA), wsPort: portA,
    });
    const b = new MessageRouter({
      nodeId: B, bootIncarnation: TEST_BOOT_INCARNATION,
      nodeAddress: address(portB), wsPort: portB,
    });
    try {
      await a.initialize({startServer: true});
      await b.initialize({startServer: true});
      let serviceCount = 0;
      let raftCount = 0;
      b.register(SERVICE, (envelope) => {
        serviceCount++;
        return {acknowledged: true,
          observedBytes: Buffer.byteLength(envelope.payload.data)};
      });
      b.register(RAFT, (envelope) => {
        assert.equal(envelope.payload.protocol, RAFT_RS_TRANSPORT_PROTOCOL);
        raftCount++;
        return {acknowledged: true};
      });
      await a.connectToNode(B, address(portB));
      await until(() => a.getConnectionState(B) === 'connected' &&
        b.getConnectionState(A) === 'connected',
      'both peers must identify the direct websocket');
      const aWs = a.nodeConnections.get(B)?.ws;
      const bWs = b.nodeConnections.get(A)?.ws;
      const frames = [];
      bWs.on('message', (data) => {
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
        let type = 'invalid';
        try {
          type = JSON.parse(bytes.toString('utf8')).type || 'unknown';
        } catch { /* diagnostic listener only */ }
        frames.push({type, bytes: bytes.byteLength});
      });
      const aBefore = sample(aWs);
      const bBefore = sample(bWs);
      const elapsed = [];
      let payloadBytes = 0;
      let calls = 0;
      for (const bytes of DATA_BYTES) {
        for (let i = 0; i < 4; i++) {
          const start = performance.now();
          const response = await a.deliver(SERVICE, {
            type: 'N0_SOCKET_PROBE', data: 'x'.repeat(bytes),
          }, {timeoutMs: DEADLINE_MS});
          elapsed.push(performance.now() - start);
          assert.equal(response.acknowledged, true,
            'actual router must observe an application acknowledgement');
          assert.equal(response.observedBytes, bytes);
          payloadBytes += bytes;
          calls++;
        }
      }
      assert.equal(serviceCount, calls);
      const aService = sample(aWs);
      const bService = sample(bWs);
      const serviceA = diff(aBefore, aService);
      const serviceB = diff(bBefore, bService);
      assert.ok(serviceA.written > payloadBytes);
      assert.ok(serviceB.read >= payloadBytes);

      // Native-shaped Raft packets are deliberately synthetic. A separate N0
      // test exercises the actual rs-raft Ready/sendToPeer boundary.
      for (let i = 0; i < RAFT_FRAMES; i++) {
        await a.deliver(RAFT, {
          protocol: RAFT_RS_TRANSPORT_PROTOCOL,
          groupId: 'n0-raft',
          from: '11', to: '22',
          message: {msgType: 8, from: '11', to: '22',
            term: '1', index: '1', commit: '1'},
        }, {timeoutMs: DEADLINE_MS});
      }
      await until(() => raftCount === RAFT_FRAMES,
        'all Raft-shaped frames must reach the remote route');
      const raftA = diff(aService, sample(aWs));
      const raftB = diff(bService, sample(bWs));
      assert.ok(raftA.written > 0 && raftB.read > 0,
        'Raft direct frames must cross the real TCP stream');
      assert.ok(frames.length >= calls + RAFT_FRAMES,
        'decoded inbound websocket frames must be counted');

      t.diagnostic('N0_SOCKET_EVIDENCE ' + JSON.stringify({
        schema: 'lagrange-n0-router-socket-observation/1',
        transport: 'websocket-over-loopback',
        interHost: false,
        ipHeadersIncluded: false,
        bootstrapExcluded: true,
        service: {
          calls, payloadBytes, clientTcp: serviceA, serverTcp: serviceB,
          requestRoundtripMs: {p50: percentile(elapsed, .5),
            p95: percentile(elapsed, .95), p99: percentile(elapsed, .99)},
        },
        raftShaped: {frames: RAFT_FRAMES, clientTcp: raftA, serverTcp: raftB},
        inboundFrames: {
          count: frames.length,
          decodedBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0),
        },
      }));
    } finally {
      await Promise.allSettled([a.shutdown(), b.shutdown()]);
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
