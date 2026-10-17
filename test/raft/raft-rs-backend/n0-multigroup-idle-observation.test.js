/**
 * N0 additive, test-only multi-group resource/heartbeat observation.
 *
 * 1/8/16 raft-rs groups, three native voters each, one physical lab CPU.
 * Uses the real operation-port scheduler and WASM core, with synthetic
 * in-process envelope delivery. This is NOT a physical network stress test.
 * No production timeout, native Raft source or router semantics are changed.
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
const HEARTBEAT = Number(
  /(\d+)\s*=>\s*MsgHeartbeat\b/u.exec(
    fs.readFileSync(BINDING, 'utf8'))?.[1]);
const SIZES = Object.freeze([1, 8, 16]);
const WINDOW_MS = 750;
const BASE = Object.freeze({
  heartbeatMs: 50,
  electionMinMs: 1000,
  electionMaxMs: 3000,
  tickIntervalMs: 20,
});

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1,
    Math.ceil(s.length * quantile) - 1)].toFixed(2));
}

test('N0 bounded multi-group idle heartbeat profile on a physical lab CPU',
  {timeout: 90000}, async (t) => {
    assert.ok(Number.isSafeInteger(HEARTBEAT),
      'heartbeats derived from vendored native enum');
    const groups = [];
    let phase = 'formation';
    const observations = [];
    try {
      for (const count of SIZES) {
        // Each size is a fresh, independent three-voter group population.
        // Reusing old leaders across size windows without delivering their
        // responses triggered check_quorum stepdown in the rejected fixture.
        for (const {cluster} of groups) cluster.dispose();
        groups.length = 0;
        const constructStart = performance.now();
        for (let index = 0; index < count; index += 1) {
          const ids = ['a', 'b', 'c'].map((suffix) =>
            'n0-mg-' + count + '-' + index + '-' + suffix);
          const messages = [];
          const cluster = new PartitionNodeCluster({
            partitionId: 'n0-idle-scale-' + count + '-' + index,
            replicaIds: ids,
            timingFor: () => BASE,
            sendFor: (from, address, envelope) => {
              if (envelope.message?.msgType === HEARTBEAT) {
                messages.push({phase, from, ms: performance.now(),
                  bytes: Buffer.byteLength(JSON.stringify(envelope), 'utf8')});
              }
              // Fall through to the real fixture transport queue. The
              // send owner has no alternate semantic delivery path.
              return undefined;
            },
          });
          const elected = cluster.settle(
            () => cluster.leaderReplicaId() !== null, {rounds: 250});
          assert.equal(elected, true,
            'each native group must elect using its own operation port');
          groups.push({cluster, leader: cluster.leaderReplicaId(), messages});
        }
        const initializationMs = performance.now() - constructStart;
        phase = 'idle-' + count;
        const startedAt = performance.now();
        for (const {cluster, leader} of groups) {
          const result = await cluster.node(leader).startScheduling();
          assert.equal(result?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
            'each real native port must admit scheduled ticks');
        }
        try {
          // Connected peers must process heartbeats and send their
          // responses. The previous red test withheld all follower
          // deliveries; check_quorum correctly demoted those leaders.
          // Pump only the fixture's existing sendToPeer queue, never a
          // new transport or an alternate consensus entry point.
          const end = performance.now() + WINDOW_MS;
          while (performance.now() < end) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            for (const {cluster} of groups) cluster.deliverAll();
          }
        } finally {
          for (const {cluster, leader} of groups) {
            cluster.node(leader).stopScheduling();
            cluster.deliverAll();
          }
        }
        const endedAt = performance.now();
        const all = groups.flatMap((g) =>
          g.messages.filter((item) => item.phase === phase &&
            item.from === g.leader));
        const bytes = all.reduce((sum, value) => sum + value.bytes, 0);
        const perGroup = groups.map((g) => {
          const packets = g.messages.filter((item) =>
            item.phase === phase && item.from === g.leader);
          const waves = [];
          for (const packet of packets) {
            // Each leader sends one heartbeat to two peers in one tick.
            if (waves.length === 0 ||
                packet.ms - waves[waves.length - 1] > 5) {
              waves.push(packet.ms);
            }
          }
          return {frames: packets.length, waves: waves.length,
            gaps: waves.slice(1).map((x, i) => x - waves[i])};
        });
        t.diagnostic('N0_MULTIGROUP_DIAG ' + JSON.stringify({
          phase, groups: count,
          wallWindowMs: Number((endedAt - startedAt).toFixed(2)),
          initializationMs: Number(initializationMs.toFixed(2)),
          nativeHeartbeatFrames: all.length,
          perGroup: perGroup.map((g, i) => ({
            index: i, frames: g.frames, waves: g.waves,
            status: groups[i].cluster.node(groups[i].leader).readStatus()?.role,
            intervalsMs: g.gaps.map((v) => Number(v.toFixed(2))),
          })),
        }));
        assert.ok(perGroup.every((g) => g.waves >= 4),
          'every group must emit repeated native heartbeats');
        const gaps = perGroup.flatMap((g) => g.gaps);
        const measuredMs = endedAt - startedAt;
        observations.push({
          groups: count, voters: count * 3, measurementWindowMs: +measuredMs.toFixed(2),
          creationMs: +initializationMs.toFixed(2),
          frames: all.length,
          nativeEnvelopeBytes: bytes,
          framesPerSecond: +(1000 * all.length / measuredMs).toFixed(2),
          envelopeBytesPerSecond: +(1000 * bytes / measuredMs).toFixed(2),
          heartbeatsPerGroup: perGroup.map((g) => g.waves),
          meanEnvelopeBytes: all.length ?
            +(bytes / all.length).toFixed(2) : null,
          intervalMs: {p50: percentile(gaps, 0.5),
            p95: percentile(gaps, 0.95), p99: percentile(gaps, 0.99)},
        });
      }
      t.diagnostic('N0_MULTIGROUP_EVIDENCE ' + JSON.stringify({
        schema: 'lagrange-n0-multigroup-idle/1',
        hostType: 'physical-lab-host',
        virtualPeersInProcess: true,
        interHostTraffic: false,
        tcpIpBytesMeasured: false,
        measurementKind: 'native-ready-envelope-and-real-timer',
        observations,
      }));
    } finally {
      // Real intervals are stopped before disposal, so another test file
      // never inherits active timers, readers or SQLite handles.
      for (const {cluster} of groups) cluster.dispose();
    }
  });
