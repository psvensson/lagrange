import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// Candidacy reluctance for drain step-downs (quest
// raft-candidacy-reluctance-drain-source).
//
// The leadership-flap attribution census (scripts/analyze-leadership-flap.js)
// measured that 68% of leadership gains by nodes the rebalancer was actively
// draining were UNDIRECTED — the stepped-down leader's fresh election timer
// out-raced the peers' and, holding the longest log, it re-won the very
// leadership being drained. deferCandidacy() (src/raft/liferaft.js) inflates
// the stepped-down node's randomized election delay 4x for a bounded window;
// the drain step-down path (replica-handler-leader-handoff-methods.js) sets it
// before re-arming.
//
// RED-ON-REVERT: scenario 1's sweep asserts the drained leader NEVER wins the
// succession while a live caught-up peer exists. Remove the deferCandidacy()
// call in the step-down below (or the timeout() inflation in liferaft.js) and
// seeds where the drained node draws the shortest delay re-win — red.
//
// Hosted on the DT6 substrate: real liferaft nodes, real vote/append RPCs over
// the VirtualNetwork, virtual clock (deferCandidacy's window runs on the same
// networkTimeSource), per-node seeded election RNG — fully deterministic.

const ELECTION_TIMING = Object.freeze({
  'election min': '150 ms',
  'election max': '300 ms',
  'heartbeat': '50 ms',
});

// Peers that never self-promote (vote-only participants) for the liveness
// scenario: only the reluctant node can stand, proving finite inflation is
// not suppression.
const DORMANT_TIMING = Object.freeze({
  'election min': '100000 ms',
  'election max': '100000 ms',
  'heartbeat': '100000 ms',
});

const NOOP_WRITE = (_packet, callback) => {
  if (typeof callback === 'function') {
    callback(null);
  }
};

const SEED_SWEEP = Array.from({length: 20}, (_, i) => 1000 + i * 7);
const IDS = ['A', 'B', 'C'];

function buildCluster(net, seed, timingFor) {
  return connectRaftCluster(net, IDS, (id) => ({
    ...timingFor(id),
    'write': NOOP_WRITE,
    'randomSource': new SeededRandomSource({seed: seed + IDS.indexOf(id)}),
  }));
}

async function electInitialLeader(net, rafts) {
  const A = rafts.get('A');
  A.promote();
  await driveNetwork(net, {untilMs: 400});
  return A;
}

// The production drain step-down, distilled from
// requestTrackedPartitionLeaderHandoff: defer candidacy (the lever under
// test), demote to follower with no leader, re-arm the election timer.
function drainStepDown(raft, {withReluctance}) {
  // typeof-guarded like the production step-down: reverting the liferaft
  // lever leaves this a no-op and the sweep goes red on BEHAVIOR (re-wins),
  // not on a missing method.
  if (withReluctance && typeof raft.deferCandidacy === 'function') {
    raft.deferCandidacy();
  }
  raft.change({state: LifeRaft.FOLLOWER, leader: ''});
  raft.heartbeat(raft.timeout());
}

// untilMs on the substrate is ABSOLUTE virtual time; drive in absolute steps
// from fromMs so repeated calls keep advancing the shared clock.
async function driveUntilLeader(net, rafts, fromMs, untilMs) {
  const step = 100;
  for (let tEnd = fromMs + step; tEnd <= untilMs; tEnd += step) {
    await driveNetwork(net, {untilMs: tEnd, stepMs: step});
    for (const raft of rafts.values()) {
      if (raft.state === LifeRaft.LEADER) {
        return raft.address;
      }
    }
  }
  return null;
}

t.test('scenario 1 — a drained leader never re-wins the succession ahead of ' +
  'live caught-up peers (seed sweep, red-on-revert via the deferCandidacy ' +
  'call in drainStepDown)', async (t) => {
  const rewinners = [];
  for (const seed of SEED_SWEEP) {
    const net = createVirtualNetwork({seed});
    const rafts = buildCluster(net, seed, () => ELECTION_TIMING);
    const A = await electInitialLeader(net, rafts);
    if (A.state !== LifeRaft.LEADER) {
      // A must be leader before it can be drained; drive further if the
      // seeded timers raced (rare) — skip seeds where A never led.
      rafts.forEach((raft) => raft.end());
      continue;
    }

    drainStepDown(A, {withReluctance: true});
    // Peers' timers were re-armed by A's last heartbeat; re-arm explicitly at
    // the step-down instant so all three race from fresh seeded draws — the
    // adversarial-fairest race for the drained node to re-win.
    rafts.get('B').heartbeat(rafts.get('B').timeout());
    rafts.get('C').heartbeat(rafts.get('C').timeout());

    const winner = await driveUntilLeader(net, rafts, 400, 2400);
    t.ok(winner === 'B' || winner === 'C',
      `seed ${seed}: a caught-up peer won the succession (winner=${winner})`);
    if (winner === 'A') {
      rewinners.push(seed);
    }
    rafts.forEach((raft) => raft.end());
  }
  t.strictSame(rewinners, [],
    'the drained leader re-won on ZERO seeds — remove deferCandidacy() from ' +
    'the step-down and shortest-draw seeds re-win (red-on-revert)');
});

t.test('scenario 2 — liveness: with no other viable candidate the reluctant ' +
  'node still campaigns and re-wins within the window (finite inflation, ' +
  'not suppression)', async (t) => {
  const seed = 4242;
  const net = createVirtualNetwork({seed});
  // B and C answer votes but never self-promote: A is the only possible
  // candidate, and it is reluctant.
  const rafts = buildCluster(net, seed,
    (id) => (id === 'A' ? ELECTION_TIMING : DORMANT_TIMING));
  t.teardown(() => rafts.forEach((raft) => raft.end()));
  const A = await electInitialLeader(net, rafts);
  t.equal(A.state, LifeRaft.LEADER, 'A led before the drain');

  drainStepDown(A, {withReluctance: true});
  // Inflated ceiling = election max (300ms) * multiplier (4) = 1200ms; give
  // the virtual clock a comfortable multiple.
  const winner = await driveUntilLeader(net, rafts, 400, 5400);
  t.equal(winner, 'A',
    'the reluctant node itself re-won once its inflated delay elapsed — ' +
    'liveness holds unconditionally');
});

t.test('scenario 3 — the deliberate replacement-election path bypasses ' +
  'reluctance: an explicit 1ms heartbeat (requestElectionNow) promotes ' +
  'immediately', async (t) => {
  const seed = 777;
  const net = createVirtualNetwork({seed});
  const rafts = buildCluster(net, seed,
    (id) => (id === 'B' ? ELECTION_TIMING : DORMANT_TIMING));
  t.teardown(() => rafts.forEach((raft) => raft.end()));
  const B = rafts.get('B');
  B.promote();
  await driveNetwork(net, {untilMs: 400});
  t.equal(B.state, LifeRaft.LEADER, 'B led before the drain');

  drainStepDown(B, {withReluctance: true});
  // R1/R3's requestElectionNow(raftNode) is raftNode.heartbeat(1): an
  // explicit duration that never consults timeout(), so reluctance cannot
  // delay a deliberate election — even of the reluctant node itself.
  B.heartbeat(1);
  const winner = await driveUntilLeader(net, rafts, 400, 900);
  t.equal(winner, 'B',
    'the explicitly-driven election completed immediately despite reluctance');
});

t.test('scenario 4 — the reluctance window lapses on the node clock: ' +
  'timeout() returns inflated draws inside the window and base draws after',
async (t) => {
  const seed = 99;
  const net = createVirtualNetwork({seed});
  const rafts = buildCluster(net, seed, () => ELECTION_TIMING);
  t.teardown(() => rafts.forEach((raft) => raft.end()));
  const A = rafts.get('A');

  const baseDraws = [A.timeout(), A.timeout(), A.timeout()];
  t.ok(baseDraws.every((d) => d >= 150 && d <= 300),
    'base draws sit in [election min, election max]');

  A.deferCandidacy();
  const inflated = [A.timeout(), A.timeout(), A.timeout()];
  t.ok(inflated.every((d) => d >= 600 && d <= 1200),
    'reluctant draws are exactly 4x the base range');

  // Advance the virtual clock past the 10s window; no leader is needed —
  // this is a pure clock check.
  await driveNetwork(net, {untilMs: 10100});
  const after = A.timeout();
  t.ok(after >= 150 && after <= 300,
    'after the window lapses on the virtual clock, draws return to base');
});
