import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftRsNetwork} from '../test-helpers/raft-rs-network-host.js';

// CL-040 — committed-entry agreement after a partition + heal, on real raft-rs operation ports
// (solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-040.md).
//
// Invariant (Raft §5.3 Log Matching / State Machine Safety): if a log entry is committed at a
// given index, every node holds the SAME committed entry at that index. The scenario that exposed
// the retired runtime's same-index stale commit: a partitioned old leader appends an entry its
// minority cannot commit; a new leader commits a DIFFERENT entry via quorum; on heal the old leader
// must discard its stale entry and adopt the committed one.
//
// Every peer is the raft-rs operation port PartitionNodeCluster builds over its own SQLite file,
// joined by the DT6 VirtualNetwork (test/test-helpers/raft-rs-network-host.js). The test reads only
// the committed entries each replica's application received.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const PARTITION_ID = 'cl-040-log-matching';
const REPRO_SEED = 0;

function leaderOf(host) {
  return IDS.find((id) => host.isLeader(id)) || null;
}

// A proposal's outcome is the port's to name; the stale one is expected to go nowhere.
function proposeWithoutWaiting(host, id, command) {
  Promise.resolve(host.propose(id, command)).catch(() => undefined);
}

function committedTags(host, id) {
  return host.committedEntries(id)
    .map(({command}) => command && command.tag)
    .filter(Boolean);
}

// Agreement holds iff every index maps to at most one distinct committed {term, command}.
function committedDivergence(host) {
  const byIndex = new Map();
  for (const id of IDS) {
    for (const {index, term, command} of host.committedEntries(id)) {
      if (!byIndex.has(index)) {
        byIndex.set(index, new Set());
      }
      byIndex.get(index).add(JSON.stringify({term, command}));
    }
  }
  return [...byIndex.entries()]
    .filter(([, fingerprints]) => fingerprints.size > 1)
    .map(([index, fingerprints]) => ({index, distinctCommitted: [...fingerprints]}));
}

t.test('committed raft log entries agree across nodes after a partition + heal',
  async (t) => {
    const net = createVirtualNetwork();
    const host = connectRaftRsNetwork(net, IDS, {partitionId: PARTITION_ID, seed: REPRO_SEED});
    t.teardown(() => host.dispose());
    host.start();

    // Elect a leader and commit entry A cluster-wide via real quorum.
    await host.runUntil(500);
    const leaderA = leaderOf(host);
    t.ok(leaderA, 'a leader is elected');
    proposeWithoutWaiting(host, leaderA, {tag: 'A', by: leaderA});
    await host.runUntil(800);
    const termA = host.term(leaderA);

    // Partition the leader; it appends a stale entry its minority cannot commit.
    const followers = IDS.filter((id) => id !== leaderA);
    for (const other of followers) {
      net.partition(leaderA, other);
    }
    proposeWithoutWaiting(host, leaderA, {tag: 'OLD', by: leaderA});
    await host.runUntil(1600);
    const leaderB = followers.find((id) => host.isLeader(id)) || null;
    t.ok(leaderB, 'the majority elects a new leader');
    t.ok(host.term(leaderB) > termA, 'the new leader holds a higher term');

    // The new leader commits a DIFFERENT entry via quorum, then the partition heals.
    proposeWithoutWaiting(host, leaderB, {tag: 'NEW', by: leaderB});
    await host.runUntil(2200);
    for (const other of followers) {
      net.heal(leaderA, other);
    }
    await host.runUntil(3000);

    for (const id of IDS) {
      t.ok(committedTags(host, id).includes('NEW'),
        `${id} committed the entry the quorum committed`);
      t.notOk(committedTags(host, id).includes('OLD'),
        `${id} never committed the partitioned leader's stale entry`);
    }
    // INVARIANT: no index may carry two distinct COMMITTED entries across the cluster.
    t.same(committedDivergence(host), [],
      'every committed log index holds a single agreed entry cluster-wide (Raft state-machine safety)');
  });
