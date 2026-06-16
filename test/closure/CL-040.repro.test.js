import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// CL-040 — deterministic repro of the @markwylde/liferaft + InMemoryLogAdapter same-index
// stale-commit log-safety gap (surfaced by DT6 step 7 verification, see
// .kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-040.md).
//
// First violated invariant (Raft §5.3 Log Matching / State Machine Safety): if a log entry is
// committed at a given index, every node must hold the SAME committed entry at that index. Here a
// partitioned old leader appends an entry at index i its minority cannot commit; a new leader
// commits a DIFFERENT entry at index i via quorum; on heal the old leader is supposed to truncate
// its stale entry and adopt the committed one — but liferaft's append catch-up commits the
// follower's OWN same-index entry without a term/command match check, so two nodes end up with two
// DIFFERENT committed commands at the same index.
//
// This guard asserts the CORRECT invariant (committed-entry agreement across nodes). It currently
// FAILS — so it is marked `todo`: tap reports it as a known-failing reproduction without breaking
// the suite. EXIT CRITERION for CL-040: once the gap is fixed (a term/command match check before
// stale-committing a same-index entry on catch-up), this passes and the `todo` is removed.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const REPRO_SEED = 0; // fixed: the divergence is deterministic (leaderA=N1, leaderB=N2 at idx 2)

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
    'Log': InMemoryLogAdapter,
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// Map index -> set of distinct committed-command fingerprints across all nodes. Agreement holds
// iff every index maps to at most one distinct committed command.
function committedDivergenceByIndex(rafts) {
  const byIndex = new Map();
  for (const id of IDS) {
    const log = rafts.get(id).log;
    for (const [index, entry] of log.entries) {
      if (!entry || entry.committed !== true) {
        continue;
      }
      const fingerprint = JSON.stringify({term: entry.term, command: entry.command});
      if (!byIndex.has(index)) {
        byIndex.set(index, new Map());
      }
      byIndex.get(index).set(fingerprint, (byIndex.get(index).get(fingerprint) || 0) + 1);
    }
  }
  return byIndex;
}

t.test('committed raft log entries agree across nodes after a partition + heal',
  {todo: 'CL-040: liferaft/InMemoryLogAdapter same-index stale-commit (open)'},
  async (t) => {
    const net = createVirtualNetwork();
    const rafts = connectRaftCluster(net, IDS, clusterOptions(REPRO_SEED));
    t.teardown(() => rafts.forEach((raft) => raft.end()));

    // Elect a leader and commit entry A at index 1 (cluster-wide via real quorum).
    await driveNetwork(net, {untilMs: 500, stepMs: 5});
    const leaderA = leaderOf(rafts);
    await rafts.get(leaderA).command({tag: 'A', by: leaderA});
    await driveNetwork(net, {untilMs: 800, stepMs: 5});

    // Partition the leader. A new leader wins a higher term.
    const followers = IDS.filter((id) => id !== leaderA);
    for (const other of followers) {
      net.partition(leaderA, other);
    }
    await driveNetwork(net, {untilMs: 1300, stepMs: 5});
    const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER);

    // The partitioned old leader appends a stale entry at index 2 it cannot commit (minority); the
    // new leader commits a DIFFERENT entry at index 2 via quorum.
    try {
      await rafts.get(leaderA).command({tag: 'OLD', by: leaderA});
    } catch {
      // NOTLEADER is possible if it already stepped down; not required for the repro.
    }
    await rafts.get(leaderB).command({tag: 'NEW', by: leaderB});
    await driveNetwork(net, {untilMs: 2000, stepMs: 5});

    // Heal: the old leader is supposed to truncate its stale index-2 entry and adopt the committed
    // one. Drive long enough for catch-up.
    for (const other of followers) {
      net.heal(leaderA, other);
    }
    await driveNetwork(net, {untilMs: 2800, stepMs: 5});

    // INVARIANT: no index may carry two distinct COMMITTED commands across the cluster.
    const byIndex = committedDivergenceByIndex(rafts);
    const divergentIndexes = [...byIndex.entries()]
      .filter(([, fingerprints]) => fingerprints.size > 1)
      .map(([index, fingerprints]) => ({index, distinctCommitted: [...fingerprints.keys()]}));

    t.same(divergentIndexes, [],
      'every committed log index holds a single agreed entry cluster-wide (Raft state-machine safety)');
  });
