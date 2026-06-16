import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork, VIRTUAL_NETWORK_RECORD_KIND} from
  '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {PctScheduler} from '../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// DT6 step 3 — REAL multi-node raft vote/append RPCs over the VirtualNetwork.
//
// Step 2 hosted ONE real liferaft node and modelled "leader contact" as a bare heartbeat
// message. Step 3 wires the ACTUAL liferaft transport (connectRaftCluster): every node's
// outbound packet is a VirtualNetwork message and its real on('data') handler processes the
// inbound ones, so a real multi-node election runs end-to-end over the seeded network. The
// clusters are ODD-sized (canonical raft: liferaft's majority is floor(N/2)+1, so N=3 needs 2
// votes); real liferaft handlers are async, so an election completes across microtasks and is
// driven with driveNetwork (bounded run({untilMs}) + microtask flushes).

// Keep each node's own election timer dormant so the test drives candidacy explicitly (no
// spontaneous re-election inside the window); election min==max => no RNG, fully deterministic.
const DORMANT = Object.freeze({
  'election min': '100000 ms',
  'election max': '100000 ms',
  'heartbeat': '100000 ms',
  'write': (_packet, callback) => {
    if (typeof callback === 'function') {
      callback(null);
    }
  },
});

t.test('a real 3-node election completes over the network transport (vote + append RPCs)',
  async (t) => {
    const net = createVirtualNetwork();
    const rafts = connectRaftCluster(net, ['A', 'B', 'C'], () => ({...DORMANT}));
    const [A, B, C] = ['A', 'B', 'C'].map((id) => rafts.get(id));
    t.teardown(() => rafts.forEach((raft) => raft.end()));

    A.promote(); // A stands for election; its real 'vote' RPCs travel over the network
    await driveNetwork(net, {untilMs: 200});

    t.equal(A.state, LifeRaft.LEADER,
      'A reached a real majority (self + >=1 of 2 peers) and became LEADER over the network');
    t.equal(B.state, LifeRaft.FOLLOWER, 'B is a follower');
    t.equal(C.state, LifeRaft.FOLLOWER, 'C is a follower');
    t.equal(B.votes.for, 'A', 'B granted its real vote to A');
    t.equal(B.leader, 'A', 'B learned A is leader via a real append/heartbeat RPC');
    t.equal(C.leader, 'A', 'C learned A is leader via a real append/heartbeat RPC');

    const deliveredTypes = new Set(net.getRecords()
      .filter((record) => record.kind === VIRTUAL_NETWORK_RECORD_KIND.DELIVERED)
      .map((record) => record.type));
    t.ok(deliveredTypes.has('raftReq') && deliveredTypes.has('raftReply'),
      'real raft request and reply packets were delivered over the virtual network');
  });

// --- The PCT-raced contested election --------------------------------------------------
// Two real candidates C1 and C2 stand for election at the same term; the decisive follower F
// votes for whichever real 'vote' packet the network delivers FIRST (raft grants once per term)
// and denies the other — so which REAL node wins is a function of the co-due delivery order at
// F, which the seeded PctScheduler controls. (Real liferaft is async, so we cannot reuse the
// SYNCHRONOUS exploreWithPct search loop; we drive the same PctScheduler + SeededRandomSource
// directly. The race is the genuine raft vote-grant, not a synthetic one.)

async function runContestedElection(seed) {
  const random = new SeededRandomSource({seed});
  const scheduler = new PctScheduler({
    randomSource: random,
    depth: 1, // one ordering constraint: deliver one candidate's vote to F before the other's
    stepBudget: 8,
    // Group the co-due vote requests by their candidate (packet.address) into distinct PCT
    // tasks so the scheduler can order one ahead of the other.
    keyOf: (event) => (event.payload && event.payload.packet && event.payload.packet.address) ||
      event.type,
  });
  const net = createVirtualNetwork({scheduler, random});
  const rafts = connectRaftCluster(net, ['C1', 'C2', 'F'], () => ({...DORMANT}));

  // Both candidates stand at the same instant; their vote packets to F are co-due.
  rafts.get('C1').promote();
  rafts.get('C2').promote();
  await driveNetwork(net, {untilMs: 160});

  const winner = ['C1', 'C2'].find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  return {fVotedFor: rafts.get('F').votes.for, winner};
}

t.test('the seeded PCT delivery order decides which REAL candidate wins F\'s vote',
  async (t) => {
    // Scan seeds for one where C1 wins and one where C2 wins — proving both orders are
    // reachable (a genuine race, not a fixed outcome). Census earlier: ~17/40 vs ~23/40.
    let c1Seed = null;
    let c2Seed = null;
    for (let seed = 0; seed < 40 && (c1Seed === null || c2Seed === null); seed += 1) {
      const {winner} = await runContestedElection(seed);
      if (winner === 'C1' && c1Seed === null) {
        c1Seed = seed;
      } else if (winner === 'C2' && c2Seed === null) {
        c2Seed = seed;
      }
    }
    t.not(c1Seed, null, 'some seed makes the real node C1 win the contested election');
    t.not(c2Seed, null, 'some seed makes the real node C2 win the contested election');

    // The winner is exactly the candidate F granted its real vote to, and it reached LEADER.
    const c1Run = await runContestedElection(c1Seed);
    t.equal(c1Run.winner, 'C1', 'C1 is the real LEADER for its seed');
    t.equal(c1Run.fVotedFor, 'C1', 'F granted its real vote to C1 (the decisive majority vote)');
  });

t.test('a contested-election seed replays the identical real winner (determinism)',
  async (t) => {
    const a = await runContestedElection(7);
    const b = await runContestedElection(7);
    t.equal(a.winner, b.winner, 'same seed -> same real LEADER every run');
    t.equal(a.fVotedFor, b.fVotedFor, 'same seed -> F grants its real vote identically');
    t.ok(a.winner === 'C1' || a.winner === 'C2', 'a real candidate did win');
  });
