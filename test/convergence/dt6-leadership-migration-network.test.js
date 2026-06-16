import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// DT6 step 4 — a REAL leadership migration + fail-back, end-to-end over the network, from a
// seed. This is the CL-039 mechanism class (leadership migrating off a leader that stops being
// reachable, then re-stabilizing) at the consensus layer, reproduced deterministically:
//   Phase A — three real liferaft nodes elect a leader NATURALLY over the seeded network (the
//     node whose seeded election timeout is shortest wins; real vote RPCs, step 3's transport).
//   Phase B — PARTITION the elected leader from the other two. They stop hearing its heartbeats,
//     a remaining node's real election timer fires, and it wins a STRICTLY HIGHER term — real
//     leadership migration (CL-039 L1->L2: leadership leaves the unreachable node).
//   Phase C — HEAL. The old leader hears the new leader's higher-term append and steps down to
//     FOLLOWER (raft §5.1), leaving exactly one stable leader — the fail-back.
//
// Every transition is real liferaft over real VirtualNetwork messages; the whole run is a pure
// function of the seed (per-node seeded election timeouts via the DT5 RandomSource seam +
// seeded delivery), so it replays identically and the outcome varies with the seed.
//
// Honest scope: this reproduces the RAFT-LAYER migration/fail-back that CL-039 is an instance
// of. CL-039's specific bug lived in the repo's control-plane leadership layer (a missing
// fail-back ABOVE raft); hosting that layer on the network is the remaining whole-system DST.

const IDS = Object.freeze(['N1', 'N2', 'N3']);

// Sane, uniform real election windows (so a stepped-down leader re-stabilizes as a follower
// instead of immediately re-electing), a fast heartbeat so a healthy leader keeps followers
// reset, and a per-node seeded election-timeout stream for symmetry breaking.
function clusterOptions(seed) {
  return (id) => ({
    'election min': '100 ms',
    'election max': '200 ms',
    'heartbeat': '30 ms',
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  for (const id of IDS) {
    if (rafts.get(id).state === LifeRaft.LEADER) {
      return id;
    }
  }
  return null;
}

function countLeaders(rafts) {
  return IDS.filter((id) => rafts.get(id).state === LifeRaft.LEADER).length;
}

// Run the full A->B->C scenario for one seed and return what each phase observed.
async function runMigration(seed) {
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));

  await driveNetwork(net, {untilMs: 400, stepMs: 5});
  const leaderA = leaderOf(rafts);
  const termA = leaderA ? rafts.get(leaderA).term : null;
  const followersA = IDS.filter((id) => id !== leaderA);

  for (const other of followersA) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1000, stepMs: 5});
  const leaderB = followersA.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  const termB = leaderB ? rafts.get(leaderB).term : null;

  for (const other of followersA) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1400, stepMs: 5});
  const observation = {
    leaderA,
    termA,
    leaderB,
    termB,
    oldLeaderStateAfterHeal: leaderA ? rafts.get(leaderA).state : null,
    finalLeader: leaderOf(rafts),
    finalLeaderCount: countLeaders(rafts),
  };
  rafts.forEach((raft) => raft.end());
  return observation;
}

t.test('Phase A: a real 3-node cluster elects a single leader over the network', async (t) => {
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(1));
  t.teardown(() => rafts.forEach((raft) => raft.end()));

  await driveNetwork(net, {untilMs: 400, stepMs: 5});
  const leader = leaderOf(rafts);
  t.not(leader, null, 'a leader emerged from a real election');
  t.equal(countLeaders(rafts), 1, 'exactly one leader');
  for (const id of IDS) {
    if (id !== leader) {
      t.equal(rafts.get(id).state, LifeRaft.FOLLOWER, `${id} is a follower`);
      t.equal(rafts.get(id).leader, leader, `${id} recognizes ${leader} as leader`);
    }
  }
});

t.test('Phase B+C: partition migrates leadership; heal fails the old leader back', async (t) => {
  const m = await runMigration(1);

  // Migration: leadership left the partitioned node onto a remaining node at a higher term.
  t.not(m.leaderB, null, 'a remaining node won a new election while the old leader was isolated');
  t.not(m.leaderB, m.leaderA, 'leadership migrated to a DIFFERENT node');
  t.ok(m.termB > m.termA,
    `the new leader's term ${m.termB} is strictly higher than the old ${m.termA} (real new term)`);

  // Fail-back: on heal the old leader recognized the higher term and stepped down.
  t.equal(m.oldLeaderStateAfterHeal, LifeRaft.FOLLOWER,
    'the old leader stepped down to FOLLOWER on heal (raft §5.1 fail-back)');
  t.equal(m.finalLeaderCount, 1, 'exactly one leader cluster-wide after heal');
  t.equal(m.finalLeader, m.leaderB, 'the migrated leader is the single stable leader');
});

t.test('the migration is deterministic and seed-determined', async (t) => {
  const a = await runMigration(5);
  const b = await runMigration(5);
  t.same(
    {leaderA: a.leaderA, leaderB: a.leaderB, finalLeader: a.finalLeader},
    {leaderA: b.leaderA, leaderB: b.leaderB, finalLeader: b.finalLeader},
    'same seed -> identical election, migration, and fail-back',
  );

  // Across seeds the migration is always clean (migrates to a higher term, fails back to one
  // leader) and the winner varies with the seed — the outcome is a function of the seed.
  const newLeaders = new Set();
  for (let seed = 0; seed < 12; seed += 1) {
    const m = await runMigration(seed);
    t.ok(m.leaderB && m.leaderB !== m.leaderA && m.termB > m.termA,
      `seed ${seed}: leadership migrated to a higher term`);
    t.equal(m.finalLeaderCount, 1, `seed ${seed}: a single stable leader after fail-back`);
    newLeaders.add(m.leaderB);
  }
  t.ok(newLeaders.size >= 2, 'the migration winner varies with the seed (not a fixed node)');
});
