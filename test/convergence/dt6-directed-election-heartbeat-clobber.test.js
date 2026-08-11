import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// Directed-election heartbeat clobber (quest
// user-table-leader-handoff-demotion-pairing).
//
// requestElectionNow (liferaft-provider.js) is raftNode.heartbeat(1): a
// 1ms draw armed on the SAME 'heartbeat' timer that every packet from a
// healthy leader re-arms with a fresh randomized [election min, election
// max] draw (base liferaft data path). If one leader packet lands
// between the arm and the 1ms fire, the directed election is not merely
// delayed — it is gone: the re-armed draw (>=150ms here, >=1000ms in
// production) always exceeds the leader's heartbeat cadence (50ms), so
// every subsequent heartbeat re-arms the timer before it can fire.
// Live witness: run 20260810T221340Z — two completed STEP_DOWN
// dispatches at a stable seed, zero campaigns in 420 seconds.
//
// The cure's fix is PAIRING: demote the source leader first (the shared
// flap-safe tracked demotion — candidacy deferred, heartbeats stop),
// then arm the target's directed election with nothing left to clobber
// it. Scenario 2 pins that ordering; scenario 3 pins convergence in the
// straggler worst case. The production pairing itself is red-on-revert
// via the cure's unit suite (deliveries pairing in
// test/rebalancer/user-table-leader-placement-cure.test.js).

const ELECTION_TIMING = Object.freeze({
  'election min': '150 ms',
  'election max': '300 ms',
  'heartbeat': '50 ms',
});

const NOOP_WRITE = (_packet, callback) => {
  if (typeof callback === 'function') {
    callback(null);
  }
};

const IDS = ['A', 'B', 'C'];
const SEED_SWEEP = Array.from({length: 10}, (_, i) => 3000 + i * 11);

function buildCluster(net, seed) {
  return connectRaftCluster(net, IDS, (id) => ({
    ...ELECTION_TIMING,
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

// The distilled performTrackedLeaderDemotion ordering
// (src/raft/tracked-leader-demotion.js): defer candidacy BEFORE the
// re-arm so the demoted leader cannot immediately re-win.
function demoteLeader(raft) {
  if (typeof raft.deferCandidacy === 'function') {
    raft.deferCandidacy();
  }
  raft.change({state: LifeRaft.FOLLOWER, leader: ''});
  raft.heartbeat(raft.timeout());
}

// untilMs on the substrate is ABSOLUTE virtual time; drive in absolute
// steps from fromMs so repeated calls keep advancing the shared clock.
// Steps are FINE (10ms): every async packet hop inside liferaft lands
// on the next drive step, so a coarse step quantizes vote round-trips
// past the ambient election draws and destroys the very directedness
// margin these scenarios measure.
async function driveUntilLeader(net, rafts, fromMs, untilMs) {
  const step = 10;
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

t.test('scenario 1 — one leader packet inside the 1ms window cancels the ' +
  'directed election PERMANENTLY against a healthy leader (the live ' +
  'run-20260810T221340Z mechanism, deterministic)', async (t) => {
  const seed = 515;
  const net = createVirtualNetwork({seed});
  const rafts = buildCluster(net, seed);
  t.teardown(() => rafts.forEach((raft) => raft.end()));
  const A = await electInitialLeader(net, rafts);
  t.equal(A.state, LifeRaft.LEADER, 'A led before the directed election');

  const B = rafts.get('B');
  // The unpaired cure dispatch: arm the directed election on B...
  B.heartbeat(1);
  // ...and a leader packet arrives before the 1ms fires — exactly what
  // base liferaft's data path does on every packet from the current
  // leader: re-arm with a fresh randomized draw.
  B.heartbeat(B.timeout());

  // With A healthy at a 50ms cadence and every re-arm drawing >=150ms,
  // B's timer can never fire again: the directed election is not late,
  // it is cancelled.
  await driveNetwork(net, {untilMs: 5400});
  t.equal(A.state, LifeRaft.LEADER,
    'the stable leader absorbed the directed election without a campaign');
  t.not(B.state, LifeRaft.LEADER,
    'the named target never won leadership within 5s of virtual time');
});

t.test('scenario 2 — demote-first pairing, no straggler: the named target ' +
  'wins the takeover on every seed (directedness, not just liveness)',
async (t) => {
  const wrongWinners = [];
  for (const seed of SEED_SWEEP) {
    const net = createVirtualNetwork({seed});
    const rafts = buildCluster(net, seed);
    const A = await electInitialLeader(net, rafts);
    if (A.state !== LifeRaft.LEADER) {
      rafts.forEach((raft) => raft.end());
      continue;
    }

    // The paired handoff: stop the heartbeat stream FIRST, then arm the
    // target — nothing is left to re-arm B's timer, so its 1ms draw
    // beats every randomized peer draw and the takeover lands exactly
    // where the census chose. The drive between the two legs is the
    // STEP_DOWN request's own network hop: by the time the target arms,
    // the demoted leader's final in-flight heartbeat has already landed
    // (the straggler case where it has NOT is scenario 3).
    demoteLeader(A);
    await driveNetwork(net, {untilMs: 450, stepMs: 50});
    rafts.get('B').heartbeat(1);

    const winner = await driveUntilLeader(net, rafts, 450, 1450);
    t.equal(winner, 'B', `seed ${seed}: the NAMED target took over`);
    if (winner !== 'B') {
      wrongWinners.push({seed, winner});
    }
    rafts.forEach((raft) => raft.end());
  }
  t.strictSame(wrongWinners, [],
    'the directed takeover missed its named target on ZERO seeds — ' +
    'reorder the pairing (elect before demote) and the healthy leader\'s ' +
    'in-flight packets cancel the arm instead (scenario 1)');
});

t.test('scenario 3 — demote-first pairing survives the clobber: with the ' +
  'source demoted, the straggler re-arm only delays the takeover to one ' +
  'randomized draw, and the demoted leader never re-wins (seed sweep)',
async (t) => {
  const reWins = [];
  for (const seed of SEED_SWEEP) {
    const net = createVirtualNetwork({seed});
    const rafts = buildCluster(net, seed);
    const A = await electInitialLeader(net, rafts);
    if (A.state !== LifeRaft.LEADER) {
      rafts.forEach((raft) => raft.end());
      continue;
    }

    // The paired handoff, demote-first: A's heartbeats stop and its
    // candidacy is deferred BEFORE the target election is armed.
    demoteLeader(A);
    const B = rafts.get('B');
    B.heartbeat(1);
    // Worst case: a final in-flight packet from the pre-demotion leader
    // still clobbers the 1ms arm. The re-armed randomized draw now has
    // no heartbeat stream left to out-pace it — the takeover happens
    // one draw later instead of never.
    B.heartbeat(B.timeout());

    const winner = await driveUntilLeader(net, rafts, 400, 3400);
    t.ok(winner === 'B' || winner === 'C',
      `seed ${seed}: a live follower took over (winner=${winner})`);
    if (winner === 'A') {
      reWins.push(seed);
    }
    rafts.forEach((raft) => raft.end());
  }
  t.strictSame(reWins, [],
    'the demoted source re-won on ZERO seeds — remove the demoteLeader ' +
    'call and the healthy leader cancels the takeover instead');
});
