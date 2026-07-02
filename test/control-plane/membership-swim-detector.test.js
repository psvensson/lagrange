import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipSwimDetector,
  SWIM_MEMBER_STATE,
  SWIM_DETECTOR_DEFAULTS,
} from '../../src/control-plane/membership-swim-detector.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

function buildDetector(options = {}) {
  return new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 42}),
    ...options,
  });
}

test('untracked node defaults to alive', (t) => {
  const d = buildDetector();
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE);
  t.same(d.verdictByNodeId(), {});
  t.end();
});

test('failed probe raises suspicion, deadline elapse confirms dead', (t) => {
  const time = new VirtualTimeSource({startMs: 0});
  const d = buildDetector({timeSource: time});
  d.recordProbeResult('n1', false);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT, 'suspect after failed probe');

  // n=1 tracked => nodeScale=1, LHM=1 (one failure) => probeInterval=2000,
  // Min=4*1*2000=8000, Max=6*8000=48000; C=0 => timeout=Max=48000.
  d.tick(1000);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT, 'still suspect before deadline');
  d.tick(48000);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.DEAD, 'dead at/after deadline');
  t.end();
});

test('successful probe refutes a local suspicion', (t) => {
  const d = buildDetector();
  d.recordProbeResult('n1', false);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT);
  d.recordProbeResult('n1', true);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'ack returns node to alive');
  t.end();
});

test('local health multiplier saturates in [0, S-1] and scales timeouts', (t) => {
  const d = buildDetector();
  t.equal(d.localHealthMultiplier(), 0, 'starts at 0');
  t.equal(d.scaledProbeIntervalMs(), SWIM_DETECTOR_DEFAULTS.baseProbeIntervalMs);
  t.equal(d.scaledProbeTimeoutMs(), SWIM_DETECTOR_DEFAULTS.baseProbeTimeoutMs);

  // Drive failures on distinct nodes to raise LHM without re-suspecting one node.
  for (let i = 0; i < 20; i++) {
    d.recordProbeResult('node-' + i, false);
  }
  const max = SWIM_DETECTOR_DEFAULTS.awarenessMax - 1;
  t.equal(d.localHealthMultiplier(), max, 'saturates at S-1');
  t.equal(
    d.scaledProbeTimeoutMs(),
    SWIM_DETECTOR_DEFAULTS.baseProbeTimeoutMs * (max + 1),
    'probe timeout scales by (LHM+1)',
  );

  for (let i = 0; i < 50; i++) {
    d.recordProbeResult('alive-node', true);
  }
  t.equal(d.localHealthMultiplier(), 0, 'decays back to 0 on sustained success');
  t.end();
});

test('incarnation precedence: alive refutes only at strictly higher incarnation', (t) => {
  const d = buildDetector();
  d.recordSuspect('n1', 'peerA', 5);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT);

  d.recordAlive('n1', 5); // equal incarnation must NOT refute
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT, 'equal-incarnation alive ignored');

  d.recordAlive('n1', 6); // strictly higher refutes
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'higher-incarnation alive refutes');

  d.recordSuspect('n1', 'peerA', 5); // stale suspect must be ignored
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'stale suspect ignored');
  t.end();
});

test('self-suspicion bumps own incarnation above the accusation and raises LHM', (t) => {
  const d = buildDetector();
  t.equal(d.selfIncarnation(), 0);
  const advertised = d.recordSelfSuspected(3);
  t.equal(advertised, 4, 'refuting incarnation is accusation + 1');
  t.equal(d.selfIncarnation(), 4);
  t.equal(d.localHealthMultiplier(), 1, 'refuting self is a local-health signal');

  const stale = d.recordSelfSuspected(2); // older accusation: no bump
  t.equal(stale, 4, 'stale self-suspicion does not bump');
  t.equal(d.localHealthMultiplier(), 1, 'no extra LHM for stale accusation');
  t.end();
});

test('LHA-suspicion: more independent confirmations shorten the timeout (Max->Min)', (t) => {
  // One confirmer (C=0) holds at Max; four confirmers (C=3) collapse to Min.
  const slow = buildDetector();
  slow.recordSuspect('t', 'A', 0);

  const fast = buildDetector();
  fast.recordSuspect('t', 'A', 0);
  fast.recordSuspect('t', 'B', 0);
  fast.recordSuspect('t', 'C', 0);
  fast.recordSuspect('t', 'D', 0);

  // n=1 tracked, LHM=0 => probeInterval=1000, Min=4000, Max=24000.
  const between = 5000;
  slow.tick(between);
  fast.tick(between);
  t.equal(slow.verdictFor('t'), SWIM_MEMBER_STATE.SUSPECT, 'Max-timeout suspect still open');
  t.equal(fast.verdictFor('t'), SWIM_MEMBER_STATE.DEAD, 'collapsed-to-Min suspect fired');
  t.end();
});

test('Lifeguard property: a degraded (high-LHM) detector suspects more leniently', (t) => {
  const healthy = buildDetector();
  const degraded = buildDetector();
  for (let i = 0; i < 7; i++) {
    degraded.recordMissedNack(); // raise LHM to saturation without touching members
  }
  t.equal(healthy.localHealthMultiplier(), 0);
  t.equal(degraded.localHealthMultiplier(), SWIM_DETECTOR_DEFAULTS.awarenessMax - 1);

  healthy.recordSuspect('t', 'A', 0);
  degraded.recordSuspect('t', 'A', 0);

  // Healthy Max = 24000; degraded probeInterval scales by (LHM+1)=8 => Min/Max 8x,
  // so the degraded node holds its suspicion open far longer (fewer false trims).
  healthy.tick(30000);
  degraded.tick(30000);
  t.equal(healthy.verdictFor('t'), SWIM_MEMBER_STATE.DEAD, 'healthy node trimmed by 30s');
  t.equal(
    degraded.verdictFor('t'),
    SWIM_MEMBER_STATE.SUSPECT,
    'degraded node still gives the peer time (no false positive)',
  );
  t.end();
});

test('dead is sticky against stale gossip; tick is idempotent', (t) => {
  const d = buildDetector();
  d.recordSuspect('n1', 'A', 0);
  d.tick(1000000); // far past any deadline
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.DEAD);
  d.recordSuspect('n1', 'B', 0); // stale suspect on a dead node: ignored
  d.recordProbeResult('n1', true); // ack without incarnation bump: dead stays
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.DEAD, 'dead is sticky without incarnation refute');
  d.recordAlive('n1', 1); // higher incarnation resurrects
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'higher-incarnation alive resurrects');
  t.end();
});

test('malformed suspect without an incarnation is dropped (no precedence bypass)', (t) => {
  const d = buildDetector();
  d.recordAlive('n1', 5); // establish a tracked node at incarnation 5
  d.recordSuspect('n1', 'peerA', undefined); // no incarnation: must be ignored
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'undefined-incarnation suspect ignored');
  d.recordSuspect('n1', 'peerA', NaN);
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.ALIVE, 'NaN-incarnation suspect ignored');
  d.recordSuspect('n1', 'peerA', 5); // valid equal-incarnation suspect: takes effect
  t.equal(d.verdictFor('n1'), SWIM_MEMBER_STATE.SUSPECT, 'valid suspect still works');
  t.end();
});

test('a duplicate confirmer does not shorten the suspicion deadline', (t) => {
  const repeated = buildDetector();
  repeated.recordSuspect('t', 'A', 0);
  repeated.recordSuspect('t', 'A', 0); // same confirmer again
  repeated.recordSuspect('t', 'A', 0);

  // Same-confirmer repeats keep C=0 => deadline stays at Max (24000), so at
  // t=5000 it must still be SUSPECT (cf. the distinct-confirmer test which is DEAD).
  repeated.tick(5000);
  t.equal(
    repeated.verdictFor('t'),
    SWIM_MEMBER_STATE.SUSPECT,
    'repeated identical confirmer does not collapse the timeout',
  );
  t.end();
});

test('raising local health lengthens the suspicion timeout end-to-end', (t) => {
  const base = buildDetector();
  const loaded = buildDetector();
  loaded.recordSelfSuspected(0); // +1 LHM
  loaded.recordMissedNack(); // +1 LHM  => LHM=2 => interval x3 => Min/Max x3

  base.recordSuspect('t', 'A', 0); // Max=24000
  loaded.recordSuspect('t', 'A', 0); // Max=72000

  base.tick(30000);
  loaded.tick(30000);
  t.equal(base.verdictFor('t'), SWIM_MEMBER_STATE.DEAD, 'healthy timeout elapsed by 30s');
  t.equal(
    loaded.verdictFor('t'),
    SWIM_MEMBER_STATE.SUSPECT,
    'degraded local health holds the suspicion open longer',
  );
  t.end();
});

test('deterministic replay: identical ordered input yields identical verdicts', (t) => {
  const ops = (d) => {
    d.recordProbeResult('a', false);
    d.recordSuspect('b', 'x', 2);
    d.recordSuspect('b', 'y', 2);
    d.recordAlive('a', 1);
    d.recordProbeResult('c', false);
    d.tick(7000);
  };
  const d1 = buildDetector();
  const d2 = buildDetector();
  ops(d1);
  ops(d2);
  t.same(d1.verdictByNodeId(), d2.verdictByNodeId(), 'same input => same verdicts');
  t.end();
});
