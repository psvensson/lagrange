/**
 * N0: baseline actual raft-rs peer-envelope/timer observations.
 *
 * This file does not alter a Raft owner, tune timeouts, or claim physical
 * multi-host networking. It invokes the exact production rs-raft operation
 * port through PartitionNodeCluster on a lab host, observes native Ready
 * messages via sendToPeer, and measures real scheduler wall-time separately.
 *
 * The test intentionally characterizes live configureTick rather than
 * declaring that configuration metadata is an applied core setting.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {tuningOf} from '../../../src/raft/raft-rs-runtime-tuning.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FORK = path.join(ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const REPLICAS = Object.freeze(['n0-a', 'n0-b', 'n0-c']);
const BASE = Object.freeze({
  heartbeatMs: 50,
  electionMinMs: 1000,
  electionMaxMs: 3000,
  tickIntervalMs: 20,
});
const OVERLAY = Object.freeze({
  heartbeatMs: 750,
  electionMinMs: 10000,
  electionMaxMs: 20000,
  tickIntervalMs: 250,
});
const OBSERVATION_TICKS = 24;
const REAL_SAMPLE_MS = 950;
const REAL_SAMPLE_MIN_WAVES = 5;

// Derive message numbers from the vendored Rust binding's match arms. They
// are NOT defined by this test and must change if the binding changes.
function messageType(name) {
  const source = fs.readFileSync(FORK, 'utf8');
  const matched = new RegExp('([0-9]+)\\s*=>\\s*' + name + '\\b', 'u')
    .exec(source);
  assert.ok(matched, 'vendored binding must map ' + name);
  return Number.parseInt(matched[1], 10);
}

function makeFixture(timing) {
  const packets = [];
  const trace = {phase: 'formation', tick: 0};
  const cluster = new PartitionNodeCluster({
    partitionId: 'n0-timing-' + timing.tickIntervalMs,
    replicaIds: [...REPLICAS],
    timingFor: () => timing,
    sendFor: (fromReplicaId, address, packet) => {
      packets.push({
        phase: trace.phase,
        tick: trace.tick,
        ms: performance.now(),
        fromReplicaId,
        address,
        kind: packet?.message?.msgType,
        bytes: Buffer.byteLength(JSON.stringify(packet), 'utf8'),
      });
      // The fixture itself owns delivery. Returning undefined delegates to
      // its ordinary deterministic queue; no second transport is created.
      return undefined;
    },
  });
  return {cluster, packets, trace};
}

function elect(fixture) {
  const {cluster} = fixture;
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: 250}), true, 'real three-voter port must elect a leader');
  const leader = cluster.leaderReplicaId();
  assert.ok(leader);
  return leader;
}

async function collectNativeHeartbeats(fixture, leader, phase, ticks) {
  fixture.trace.phase = phase;
  const before = fixture.packets.length;
  for (let index = 1; index <= ticks; index += 1) {
    fixture.trace.tick = index;
    await fixture.cluster.node(leader).tick();
  }
  const heartbeats = fixture.packets.slice(before)
    .filter((packet) => packet.phase === phase &&
      packet.fromReplicaId === leader &&
      packet.kind === messageType('MsgHeartbeat'));
  const waves = [...new Set(heartbeats.map((packet) => packet.tick))];
  return {
    waves,
    intervals: waves.slice(1).map((value, i) => value - waves[i]),
    packets: heartbeats.length,
    bytes: heartbeats.reduce((sum, packet) => sum + packet.bytes, 0),
  };
}

function report(t, observation) {
  const serialized = JSON.stringify({
    schema: 'lagrange-n0-raft-timing-observation/1',
    ...observation,
  });
  // TAP diagnostics are preserved by source test runners that retain TAP,
  // and the summary reporter may suppress them. Do not mistake a missing
  // diagnostic in the bridge summary for an absent assertion.
  t.diagnostic('N0_TIMING_EVIDENCE ' + serialized);
}

test('N0 native heartbeat cadence is observed at the operation-port send boundary',
  {timeout: 25000}, async (t) => {
    const fixture = makeFixture(BASE);
    try {
      const leader = elect(fixture);
      const tuning = tuningOf(BASE);
      const measured = await collectNativeHeartbeats(
        fixture, leader, 'idle-baseline', OBSERVATION_TICKS);
      assert.equal(tuning.heartbeatTick, 3);
      assert.equal(BASE.tickIntervalMs * tuning.heartbeatTick, 60);
      assert.ok(measured.waves.length >= 5,
        'must see multiple real native MsgHeartbeat sends');
      assert.ok(measured.intervals.every((distance) =>
        distance === tuning.heartbeatTick),
      'native heartbeats must be separated by their configured tick count');
      report(t, {sample: 'baseline-idle', effectiveTickMs: 20,
        heartbeatTick: tuning.heartbeatTick,
        expectedNativeHeartbeatMs: 60, observed: measured});
    } finally {
      fixture.cluster.dispose();
    }
  });

test('N0 new proposal emits native append without waiting for slow overlay heartbeat',
  {timeout: 25000}, async (t) => {
    const fixture = makeFixture(OVERLAY);
    try {
      const leader = elect(fixture);
      fixture.trace.phase = 'proposal';
      fixture.trace.tick = 0;
      const first = fixture.packets.length;
      const beforeProposalStatus = fixture.cluster.node(leader).readStatus();
      const proposed = await fixture.cluster.node(leader).propose({
        n0: 'proposal-no-tick'});
      const afterProposalStatus = fixture.cluster.node(leader).readStatus();
      const emitted = fixture.packets.slice(first).filter((packet) =>
        packet.phase === 'proposal' && packet.fromReplicaId === leader);
      const append = emitted.filter((packet) =>
        packet.kind === messageType('MsgAppend'));
      report(t, {sample: 'proposal-boundary-diagnostic',
        leader, beforeProposalStatus, proposed, afterProposalStatus,
        emitted, appendCount: append.length});
      assert.ok(append.length >= 2,
        'propose must send to both peers without any scheduled tick');
      report(t, {sample: 'proposal-before-next-heartbeat',
        requestedHeartbeatMs: OVERLAY.heartbeatMs,
        messagesWithoutTick: emitted.length,
        appendWithoutTick: append.length,
        encodedBytes: append.reduce((sum, p) => sum + p.bytes, 0)});
    } finally {
      fixture.cluster.dispose();
    }
  });

test('N0 live millisecond-only config change is characterized against actual native packets',
  {timeout: 25000}, async (t) => {
    const fixture = makeFixture(BASE);
    try {
      const leader = elect(fixture);
      const before = await collectNativeHeartbeats(
        fixture, leader, 'before-configure', OBSERVATION_TICKS);
      const result = await fixture.cluster.node(leader).configureTick({
        heartbeatMs: OVERLAY.heartbeatMs,
        electionMinMs: OVERLAY.electionMinMs,
        electionMaxMs: OVERLAY.electionMaxMs,
      });
      assert.equal(result?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        'port reports only that the request was accepted');
      const after = await collectNativeHeartbeats(
        fixture, leader, 'after-configure', OBSERVATION_TICKS);
      assert.ok(before.waves.length >= 5 && after.waves.length >= 5);
      const observedBefore = before.intervals[0];
      const observedAfter = after.intervals[0];
      assert.ok(before.intervals.every((n) => n === observedBefore));
      assert.ok(after.intervals.every((n) => n === observedAfter));
      // Characterization, not a false PASS claiming live reconfiguration.
      // At the pinned source the core remains 3 ticks/heartbeat. An actual
      // core reconfiguration would be observed as a changed cadence.
      report(t, {sample: 'live-config-metadata-vs-core',
        requestedHeartbeatMs: OVERLAY.heartbeatMs,
        beforeNativeHeartbeatTicks: observedBefore,
        afterNativeHeartbeatTicks: observedAfter,
        effectiveHeartbeatChanged: observedBefore !== observedAfter,
        expectedConfigurationAccepted: true});
    } finally {
      fixture.cluster.dispose();
    }
  });

test('N0 physical lab host measures real scheduled native heartbeat envelopes',
  {timeout: 30000}, async (t) => {
    const fixture = makeFixture(BASE);
    try {
      const leader = elect(fixture);
      fixture.trace.phase = 'wall-clock';
      fixture.trace.tick = 0;
      const start = performance.now();
      const started = await fixture.cluster.node(leader).startScheduling();
      assert.equal(started?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      // Unlike the preceding virtual tick observations, this uses the
      // production RealTimeSource scheduler on the actual lab CPU.
      await new Promise((resolve) => setTimeout(resolve, REAL_SAMPLE_MS));
      fixture.cluster.node(leader).stopScheduling();
      const events = fixture.packets.filter((packet) =>
        packet.phase === 'wall-clock' &&
        packet.fromReplicaId === leader &&
        packet.kind === messageType('MsgHeartbeat'));
      const times = [];
      for (const event of events) {
        if (times.length === 0 ||
          event.ms - times[times.length - 1] > 5) {
          times.push(event.ms);
        }
      }
      const diffs = times.slice(1).map((n, i) => n - times[i]);
      const sorted = [...diffs].sort((a, b) => a - b);
      const percentile = (p) => sorted.length ?
        Number(sorted[Math.min(sorted.length - 1,
          Math.ceil(p * sorted.length) - 1)].toFixed(2)) : null;
      assert.ok(times.length >= REAL_SAMPLE_MIN_WAVES,
        'actual host must observe repeated scheduled native heartbeats');
      report(t, {sample: 'real-host-timer-and-native-send',
        measuredWallMs: Number((performance.now() - start).toFixed(2)),
        expectedNativeHeartbeatMs: 60,
        waves: times.length, nativeHeartbeats: events.length,
        intervalMs: {p50: percentile(0.5), p95: percentile(0.95),
          min: sorted.length ? Number(sorted[0].toFixed(2)) : null,
          max: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) :
            null},
        bytesPreRouter: events.reduce((n, event) => n + event.bytes, 0)});
    } finally {
      fixture.cluster.dispose();
    }
  });


test('N0 first native election request follows observed election ticks',
  {timeout: 25000}, async (t) => {
    const fixture = makeFixture(BASE);
    try {
      fixture.trace.phase = 'election';
      const expectedMinTicks = tuningOf(BASE).electionTick;
      const electionTypes = new Set([
        messageType('MsgRequestVote'),
        messageType('MsgRequestPreVote'),
      ]);
      let firstRequest = null;
      for (let tick = 1; tick <= expectedMinTicks * 3; tick += 1) {
        fixture.trace.tick = tick;
        await fixture.cluster.node(REPLICAS[0]).tick();
        firstRequest = fixture.packets.find((packet) =>
          packet.phase === 'election' &&
          packet.fromReplicaId === REPLICAS[0] &&
          electionTypes.has(packet.kind)) || null;
        if (firstRequest) break;
      }
      assert.ok(firstRequest,
        'a real native core must issue a vote or pre-vote when alone');
      assert.ok(firstRequest.tick >= expectedMinTicks,
        'election must not occur before its native lower bound');
      // Current vendored raft-rs default randomizes inside
      // [electionTick, 2 * electionTick). Do not interpret the configured
      // electionMaxMs as the native upper bound without a core change.
      assert.ok(firstRequest.tick <= expectedMinTicks * 2 + 1,
        'election should follow the native core randomized window');
      report(t, {sample: 'native-election-first-request',
        requestedElectionMinMs: BASE.electionMinMs,
        requestedElectionMaxMs: BASE.electionMaxMs,
        nativeElectionTick: expectedMinTicks,
        firstRequestTick: firstRequest.tick,
        firstRequestNominalMs: firstRequest.tick * BASE.tickIntervalMs,
        firstRequestKind: firstRequest.kind});
    } finally {
      fixture.cluster.dispose();
    }
  });
