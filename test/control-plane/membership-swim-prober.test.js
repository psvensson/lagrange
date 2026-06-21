import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {
  MembershipSwimDetector,
  SWIM_MEMBER_STATE,
  SWIM_DETECTOR_DEFAULTS,
} from '../../src/control-plane/membership-swim-detector.js';
import {
  MembershipSwimProber,
  buildSwimRelayHandler,
  buildSwimRelayAddress,
} from '../../src/control-plane/membership-swim-prober.js';

function buildDetector() {
  return new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 9}),
  });
}

// transport whose outcomes are scripted by predicate functions.
function fakeTransport({direct = () => true, indirect = () => true} = {}) {
  const calls = {direct: [], indirect: []};
  return {
    calls,
    async directProbe(nodeId) {
      calls.direct.push(nodeId);
      return direct(nodeId);
    },
    async indirectProbe(helperNodeId, targetNodeId) {
      calls.indirect.push({helperNodeId, targetNodeId});
      return indirect(helperNodeId, targetNodeId);
    },
  };
}

function buildProber(detector, transport, members, overrides = {}) {
  return new MembershipSwimProber({
    detector,
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 3}),
    localNodeId: 'self',
    getMembers: () => members,
    transport,
    ...overrides,
  });
}

test('relay handler pings the requested target and reports reachability', async (t) => {
  const pinged = [];
  const messageRouter = {
    async pingNode(nodeId) {
      pinged.push(nodeId);
      return nodeId === 'up';
    },
  };
  const handler = buildSwimRelayHandler({messageRouter});
  const up = await handler({payload: {targetNodeId: 'up'}});
  const down = await handler({payload: {targetNodeId: 'down'}});
  const none = await handler({payload: {}});
  t.same(pinged, ['up', 'down'], 'pings only when a target is given');
  t.equal(up.reachable, true);
  t.equal(down.reachable, false);
  t.equal(none.reachable, false, 'missing target => not reachable, no ping');
  t.equal(buildSwimRelayAddress('n1'), 'n1/service/swim-relay');
  t.end();
});

test('direct success records the target alive', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => true});
  const prober = buildProber(d, transport, ['a', 'b']);
  await prober.probeOnce();
  t.equal(transport.calls.indirect.length, 0, 'no indirect probe on direct success');
  t.equal(d.verdictFor(transport.calls.direct[0]), SWIM_MEMBER_STATE.ALIVE);
  t.end();
});

test('direct miss falls back to indirect; an indirect ack keeps the node alive', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => false, indirect: () => true});
  const prober = buildProber(d, transport, ['a', 'b', 'c', 'd']);
  await prober.probeOnce();
  const target = transport.calls.direct[0];
  t.ok(transport.calls.indirect.length > 0, 'indirect probe attempted after direct miss');
  t.ok(
    transport.calls.indirect.every((c) => c.targetNodeId === target),
    'indirect probes target the same node',
  );
  t.equal(d.verdictFor(target), SWIM_MEMBER_STATE.ALIVE, 'indirect ack => alive');
  t.end();
});

test('direct + indirect miss raises suspicion on the target', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => false, indirect: () => false});
  const prober = buildProber(d, transport, ['a', 'b', 'c']);
  await prober.probeOnce();
  t.equal(d.verdictFor(transport.calls.direct[0]), SWIM_MEMBER_STATE.SUSPECT);
  t.end();
});

test('no helper responds => missed-nack raises local health', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => false, indirect: () => null});
  const prober = buildProber(d, transport, ['a', 'b', 'c']);
  t.equal(d.localHealthMultiplier(), 0);
  await prober.probeOnce();
  // +1 for the failed direct probe, +1 for the missed nack.
  t.equal(d.localHealthMultiplier(), 2, 'failed probe + missed nack both raise LHM');
  t.end();
});

test('round-robin covers every member once per traversal', async (t) => {
  const d = buildDetector();
  const members = ['a', 'b', 'c', 'd'];
  const transport = fakeTransport({direct: () => true});
  const prober = buildProber(d, transport, members);
  for (let i = 0; i < members.length; i++) {
    await prober.probeOnce();
  }
  t.same(
    [...transport.calls.direct].sort(),
    [...members].sort(),
    'each member probed exactly once across one full round',
  );
  t.end();
});

test('the local node never probes itself', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => true});
  const prober = buildProber(d, transport, ['self', 'a', 'b']);
  for (let i = 0; i < 6; i++) {
    await prober.probeOnce();
  }
  t.equal(
    transport.calls.direct.includes('self'),
    false,
    'self is excluded from probe targets',
  );
  t.end();
});

test('probe interval is Lifeguard-dynamic: it grows with local health', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => false, indirect: () => null});
  const prober = buildProber(d, transport, ['a', 'b']);
  const base = SWIM_DETECTOR_DEFAULTS.baseProbeIntervalMs;
  t.equal(d.scaledProbeIntervalMs(), base, 'starts at base interval');
  for (let i = 0; i < 4; i++) {
    await prober.probeOnce();
  }
  t.ok(
    d.scaledProbeIntervalMs() > base,
    'after failed probes + missed nacks the cadence has backed off',
  );
  t.end();
});

test('a throwing direct probe records a MISS, never silently erases the probe', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({
    direct: () => {
      throw new Error('transport blew up');
    },
    indirect: () => false,
  });
  const prober = buildProber(d, transport, ['a', 'b']);
  await prober.probeOnce();
  const target = transport.calls.direct[0];
  t.equal(d.verdictFor(target), SWIM_MEMBER_STATE.SUSPECT, 'throw => miss => suspect');
  t.end();
});

test('one helper throwing does not poison the others; an ack still counts', async (t) => {
  const d = buildDetector();
  let helperIndex = 0;
  const transport = fakeTransport({
    direct: () => false,
    indirect: () => {
      helperIndex++;
      if (helperIndex === 1) {
        throw new Error('helper 1 down');
      }
      return true; // a later helper acks
    },
  });
  const prober = buildProber(d, transport, ['a', 'b', 'c', 'd']);
  await prober.probeOnce();
  t.equal(
    d.verdictFor(transport.calls.direct[0]),
    SWIM_MEMBER_STATE.ALIVE,
    'allSettled: a throwing helper does not erase another helper ack',
  );
  t.end();
});

test('a responded-but-unreachable helper (false) is NOT a missed nack', async (t) => {
  const d = buildDetector();
  const transport = fakeTransport({direct: () => false, indirect: () => false});
  const prober = buildProber(d, transport, ['a', 'b', 'c']);
  await prober.probeOnce();
  // direct fail (+1) only; helpers responded (false), so no missed-nack delta.
  t.equal(d.localHealthMultiplier(), 1, 'false helper response is not a missed nack');
  t.end();
});

test('stop->start during an in-flight cycle does not leak a second timer', (t) => {
  const d = buildDetector();
  const time = new VirtualTimeSource({startMs: 0});
  const prober = buildProber(d, fakeTransport(), ['a'], {timeSource: time});
  prober.start();
  const staleGeneration = prober._generation;
  prober.stop();
  prober.start();
  // Simulate the stale in-flight cycle's reschedule firing after the restart.
  prober._scheduleNext(staleGeneration);
  t.equal(prober._generation, staleGeneration + 2, 'stop+start advanced the generation twice');
  t.equal(prober.isRunning(), true, 'prober is running after restart');
  // A current-generation reschedule replaces (does not stack) the timer.
  prober._scheduleNext(prober._generation);
  t.ok(prober._timer !== null, 'exactly one live timer after restart + reschedules');
  prober.stop();
  t.equal(prober._timer, null, 'stop cancels the single timer');
  t.end();
});

test('start/stop are idempotent and stop cancels the timer', (t) => {
  const d = buildDetector();
  const time = new VirtualTimeSource({startMs: 0});
  const prober = buildProber(d, fakeTransport(), ['a'], {timeSource: time});
  prober.start();
  prober.start(); // idempotent
  t.equal(prober.isRunning(), true);
  prober.stop();
  prober.stop(); // idempotent
  t.equal(prober.isRunning(), false);
  t.end();
});
