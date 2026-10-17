/**
 * N0 connected-mode attribution: on one real lab CPU, reproduce 1/8/16
 * independent three-voter raft-rs groups, collecting the native Ready
 * output and the time spent servicing the fixture's follower replies.
 *
 * This is an independently bounded diagnostic of the previously RED #117
 * test; it is NOT wire-network evidence, a production change, or an
 * alternative transport/retry/timing owner. Each size has fresh groups.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..');
const BINDING = path.join(ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const NATIVE_MAP = fs.readFileSync(BINDING, 'utf8');
function nativeType(name) {
  const match = new RegExp('([0-9]+)\\s*=>\\s*' + name + '\\b', 'u')
    .exec(NATIVE_MAP);
  assert.ok(match, 'vendored Raft message type required: ' + name);
  return Number(match[1]);
}
const HEARTBEAT = nativeType('MsgHeartbeat');
const HB_RESPONSE = nativeType('MsgHeartbeatResponse');
const COUNTS = Object.freeze([1, 8, 16]);
const SAMPLE_MS = 1250;
const PUMP_PERIOD_MS = 20;
const REQUIRED_WAVES = 4;
const TIMING = Object.freeze({
  heartbeatMs: 50,
  electionMinMs: 1000,
  electionMaxMs: 3000,
  tickIntervalMs: 20,
});

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1,
    Math.ceil(q * sorted.length) - 1)].toFixed(2));
}

function countWaves(packets) {
  const waves = [];
  for (const p of packets) {
    if (!waves.length || p.ms - waves[waves.length - 1] > 5) {
      waves.push(p.ms);
    }
  }
  return {waves: waves.length,
    intervalsMs: waves.slice(1).map((x, i) => x - waves[i])};
}

test('N0 full-duplex Raft group-timing attribution at 1, 8 and 16 groups',
  {timeout: 120000}, async (t) => {
    for (const count of COUNTS) {
      const groups = [];
      let phase = 'forming';
      const setupStart = performance.now();
      try {
        for (let i = 0; i < count; i++) {
          const label = 'n0-pump-' + count + '-' + i;
          const voters = ['a', 'b', 'c'].map((v) => label + '-' + v);
          const packets = [];
          const cluster = new PartitionNodeCluster({
            partitionId: label,
            replicaIds: voters,
            timingFor: () => TIMING,
            sendFor: (from, address, envelope) => {
              const msgType = envelope.message?.msgType ?? null;
              if (phase === 'observe') {
                packets.push({from, kind: msgType, ms: performance.now(),
                  bytes: Buffer.byteLength(JSON.stringify(envelope), 'utf8')});
              }
              return undefined; // existing fixture send/queue owns delivery
            },
          });
          groups.push({cluster, packets, voters, leader: null});
          assert.equal(cluster.settle(
            () => cluster.leaderReplicaId() !== null, {rounds: 250}), true,
          'fresh three-voter native group must elect');
          groups[i].leader = cluster.leaderReplicaId();
        }
        const setupMs = performance.now() - setupStart;
        const pumpMs = [], wakeLagMs = [];
        let pumpCycles = 0;
        let maxGroupPumpMs = 0;
        let inboundEnvelopesPumped = 0;
        const memoryBefore = process.memoryUsage();
        const cpuBefore = process.cpuUsage();
        phase = 'observe';
        const started = performance.now();
        for (const g of groups) {
          const startedScheduling = await g.cluster.node(g.leader)
            .startScheduling();
          assert.equal(startedScheduling?.outcome,
            RAFT_OPERATION_OUTCOME.CORE_OK);
        }
        try {
          const deadline = performance.now() + SAMPLE_MS;
          while (performance.now() < deadline) {
            const prior = performance.now();
            await new Promise((resolve) =>
              setTimeout(resolve, PUMP_PERIOD_MS));
            wakeLagMs.push(Math.max(0,
              performance.now() - prior - PUMP_PERIOD_MS));
            const begun = performance.now();
            for (const g of groups) {
              const beginGroup = performance.now();
              inboundEnvelopesPumped += [...g.cluster.replicas.values()]
                .reduce((sum, peer) => sum + peer.inbox.length, 0);
              g.cluster.deliverAll();
              maxGroupPumpMs = Math.max(maxGroupPumpMs,
                performance.now() - beginGroup);
            }
            pumpMs.push(performance.now() - begun);
            pumpCycles++;
            // Allow the async native Ready/inbound-drain continuation to
            // run before the next fixture pump. Never drive a second core.
            await new Promise((resolve) => setImmediate(resolve));
          }
        } finally {
          for (const g of groups) {
            g.cluster.node(g.leader).stopScheduling();
          }
        }
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuBefore);
        const memAfter = process.memoryUsage();
        const observation = groups.map((g, index) => {
          const hbs = g.packets.filter((p) =>
            p.from === g.leader && p.kind === HEARTBEAT);
          const responseCount = g.packets.filter((p) =>
            p.kind === HB_RESPONSE).length;
          const counted = countWaves(hbs);
          const status = g.cluster.node(g.leader).readStatus();
          return {index, heartbeatFrames: hbs.length,
            heartbeatWaves: counted.waves,
            heartbeatGapP95Ms: percentile(counted.intervalsMs, 0.95),
            responseFrames: responseCount,
            role: status.role,
            term: status.term,
            pendingInbox: [...g.cluster.replicas.values()]
              .reduce((sum, peer) => sum + peer.inbox.length, 0),
            totalNativeFrames: g.packets.length};
        });
        const result = {
          schema: 'lagrange-n0-connected-pump-attribution/1',
          count, voters: count * 3, physicalHost: true,
          interHost: false, virtualPeersInProcess: true,
          setupMs: +setupMs.toFixed(2),
          elapsedMs: +elapsedMs.toFixed(2),
          pumpCycles, inboundEnvelopesPumped,
          pumpMs: {p50: percentile(pumpMs, .5),
            p95: percentile(pumpMs, .95),
            max: percentile(pumpMs, 1)},
          maxSingleGroupPumpMs: +maxGroupPumpMs.toFixed(2),
          wakeLagMs: {p95: percentile(wakeLagMs, .95),
            max: percentile(wakeLagMs, 1)},
          cpuMs: {user: +(cpu.user / 1000).toFixed(2),
            system: +(cpu.system / 1000).toFixed(2)},
          rssDeltaBytes: memAfter.rss - memoryBefore.rss,
          groups: observation,
        };
        t.diagnostic('N0_CONNECTED_ATTRIBUTION ' + JSON.stringify(result));
        assert.ok(observation.every((o) =>
          o.role === 'leader' && o.heartbeatWaves >= REQUIRED_WAVES),
        'all live leaders must emit at least four native heartbeat waves');
      } finally {
        for (const g of groups) {
          g.cluster.dispose();
        }
      }
    }
  });
