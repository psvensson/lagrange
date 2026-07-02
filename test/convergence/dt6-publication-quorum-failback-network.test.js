import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {TABLES} from '../../src/constants/index.js';

// DT6 step 7 — the CL-039 publication fail-back with a REAL QUORUM-GATED COMMIT. Step 6 proved
// the new owner RE-DETECTS the deficit and re-drives (the real decision + real row), but modelled
// the commit with a term-gated store (load-bearing for raft commit safety). Step 7 removes that
// model: the publication is committed through the REAL raft log (LifeRaft on the real
// InMemoryLogAdapter) via raft.command(), which replicates over the network and commits ONLY on a
// real majority. So a partitioned (minority) owner genuinely cannot commit — not because a term
// comparison says so, but because its append never reaches a quorum of followers.
//
// Each node: a real liferaft node with a real log + the real owner-membership driver (gated on
// live raft leadership, real deficit decision driveOwnerMembershipReconcile ->
// buildPublicationActiveGateHandoffContract). When the driver decides to publish it materialises a
// REAL published row (buildMembershipPublicationRow) and commits it via raft.command(); the node's
// "committed published version" advances only on the real raft 'commit' event.
//
// Scenario (CL-039 lineage): Phase A elect + publish membership v1 (commits cluster-wide); Phase B
// a membership change bumps the required version to v2 AND the leader is partitioned — the NEW
// leader re-publishes v2 and it COMMITS via real quorum (the fail-back), while the partitioned old
// leader issues its v2 command but it NEVER commits (no majority); Phase C heal — the old leader
// steps down and every node converges to a committed publication VERSION of 2.
//
// HONEST SCOPE: the leadership gate, the deficit DECISION, the published ROW, AND the COMMIT (real
// raft log replication + real quorum) are now all real. The remaining abstractions are the publish
// TRIGGER (a required-version bump standing in for a real membership change) and the row's content
// (a fixed 3-node membership model rather than real membership/readiness derivation).
//
// This guard asserts BOTH the published-VERSION convergence AND committed-COMMAND equality at the
// raft LOG-ENTRY level. The latter once exposed CL-040 — a healed old leader stale-committing its
// OWN v2 entry (its publisher/term) at the same index where the cluster committed the new leader's
// entry — but that @markwylde/liferaft + InMemoryLogAdapter log-safety gap is now fixed
// (src/raft/liferaft.js truncateConflictingSameIndexTail, Raft §5.3 same-index/different-term
// truncation; see closure-ledger CL-040), so committed log entries now agree cluster-wide on heal.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const EXPECTED = Object.freeze([...IDS]);
const ownerProto = MembershipPublicationCoordinatorReconcile.prototype;
const PUBLICATION_COMMAND_MARKER = '__membershipPublication';

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
    'Log': InMemoryLogAdapter, // a REAL raft log: commits require real majority replication
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// Host the real owner driver on one node; publication commits go through the REAL raft log.
function hostQuorumPublisher(net, raft, nodeId, required) {
  const state = {committedVersion: 0, committedRow: null, lastCommandKey: null, commands: 0};
  // The node's committed published version advances ONLY when the raft log actually commits the
  // publication entry (real majority) — on the leader AND on each follower that replicates it.
  raft.on('commit', (command) => {
    if (command && command[PUBLICATION_COMMAND_MARKER]) {
      state.committedVersion = command.requiredVersion;
      state.committedRow = command.row;
    }
  });
  const coordinator = {
    driveOwnerMembershipReconcile: ownerProto.driveOwnerMembershipReconcile,
    startOwnerMembershipDriver: ownerProto.startOwnerMembershipDriver,
    stopOwnerMembershipDriver: ownerProto.stopOwnerMembershipDriver,
    nodeId,
    systemTableCache: {get: () => null, find: () => null, getAll: () => []},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS && raft.state === LifeRaft.LEADER,
    },
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
      // Converged iff our COMMITTED publication matches the current required version. Until the
      // raft log commits a publication for the current version, the published set reads empty ->
      // the real deficit computation reports the full membership missing -> the driver drives.
      const published = state.committedVersion === required.version ? EXPECTED : [];
      return {
        nodeRows: EXPECTED.map((id) => ({node_id: id, status: 'active'})),
        readinessByNodeId: Object.fromEntries(EXPECTED.map((id) => [id, {ready: true}])),
        latestPublishedPublicationRow: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: published,
        },
        latestPublicationRow: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: published,
          status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
        },
      };
    },
    // The publish: commit a REAL published row through the REAL raft log. raft.command replicates
    // the entry and it commits only on a real majority — a partitioned minority leader's command
    // never commits. One attempt per (term, required-version) so a still-replicating entry is not
    // re-appended every tick.
    reconcileActiveGateMembershipPublication: async () => {
      const key = `${raft.term}:${required.version}`;
      if (state.lastCommandKey === key) {
        return;
      }
      state.lastCommandKey = key;
      const row = buildMembershipPublicationRow({
        candidate: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: EXPECTED,
          publisherNodeId: raft.address,
          requiredAckNodeIds: EXPECTED,
          acknowledgedNodeIds: EXPECTED,
        },
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        nowMs: net.now(),
      });
      state.commands += 1;
      try {
        await raft.command({
          [PUBLICATION_COMMAND_MARKER]: true,
          requiredVersion: required.version,
          row,
        });
      } catch {
        // raft.command throws NOTLEADER if leadership was lost between the gate and the write;
        // the next tick re-evaluates. Not fatal to the scenario.
      }
    },
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    logger: {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}},
  };
  coordinator.startOwnerMembershipDriver({
    enabled: true,
    intervalMs: 20,
    timeSource: net.networkTimeSource(nodeId),
  });
  return {coordinator, state};
}

async function runQuorumFailback(seed) {
  const required = {version: 1};
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  const pubs = new Map(
    IDS.map((id) => [id, hostQuorumPublisher(net, rafts.get(id), id, required)]),
  );
  const committedVersions = () =>
    Object.fromEntries(IDS.map((id) => [id, pubs.get(id).state.committedVersion]));
  const committedIndexes = () =>
    Object.fromEntries(IDS.map((id) => [id, rafts.get(id).log.committedIndex]));

  // Phase A — elect + publish membership v1; it commits cluster-wide via real raft replication.
  await driveNetwork(net, {untilMs: 500, stepMs: 5});
  const leaderA = leaderOf(rafts);
  const afterPublishV1 = {
    versions: committedVersions(),
    leaderRow: pubs.get(leaderA).state.committedRow,
  };

  // Phase B — a membership change requires v2 AND the leader is partitioned. The new leader must
  // re-publish v2 and commit it via real quorum (fail-back); the partitioned old leader cannot.
  required.version = 2;
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1400, stepMs: 5});
  const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  const afterFailback = {
    versions: committedVersions(),
    indexes: committedIndexes(),
    oldLeaderCommands: pubs.get(leaderA).state.commands,
  };

  // Phase C — heal; the old leader steps down and the cluster converges to v2 — both in published
  // VERSION and (since the CL-040 fix) in committed raft LOG ENTRIES (no same-index divergence).
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 2200, stepMs: 5});
  // Committed-log agreement: group every committed entry by index; any index with >1 distinct
  // {term, command} across nodes is a Raft safety violation (this is what CL-040 used to expose).
  const committedByIndex = new Map();
  for (const id of IDS) {
    for (const [index, entry] of rafts.get(id).log.entries) {
      if (!entry || entry.committed !== true) {
        continue;
      }
      const fingerprint = JSON.stringify({term: entry.term, command: entry.command});
      if (!committedByIndex.has(index)) {
        committedByIndex.set(index, new Set());
      }
      committedByIndex.get(index).add(fingerprint);
    }
  }
  const divergentCommittedIndexes = [...committedByIndex.entries()]
    .filter(([, fingerprints]) => fingerprints.size > 1)
    .map(([index]) => index);
  const afterHeal = {
    versions: committedVersions(),
    oldLeaderState: rafts.get(leaderA).state,
    divergentCommittedIndexes,
  };

  IDS.forEach((id) => {
    pubs.get(id).coordinator.stopOwnerMembershipDriver();
    rafts.get(id).end();
  });
  return {leaderA, leaderB, afterPublishV1, afterFailback, afterHeal};
}

t.test('Phase A: the elected leader commits membership v1 through the REAL raft log', async (t) => {
  const m = await runQuorumFailback(3);
  for (const id of IDS) {
    t.equal(m.afterPublishV1.versions[id], 1,
      `${id} committed published version 1 via real raft replication`);
  }
  t.equal(m.afterPublishV1.leaderRow.status, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
    'the committed entry is a real PUBLISHED membership row');
  t.same(m.afterPublishV1.leaderRow.published_active_node_ids, EXPECTED,
    'the real row carries the full membership');
});

t.test('Phase B: the new leader commits v2 via real QUORUM; the partitioned old leader cannot',
  async (t) => {
    const m = await runQuorumFailback(3);
    t.not(m.leaderB, null, 'leadership migrated to a new leader');
    t.equal(m.afterFailback.versions[m.leaderB], 2,
      'the new leader re-published v2 and it COMMITTED through a real majority (the fail-back)');
    t.ok(m.afterFailback.indexes[m.leaderB] > m.afterFailback.indexes[m.leaderA],
      'the new leader\'s committed log index advanced past the old leader\'s');
    // The partitioned old leader genuinely cannot commit: it issued its v2 command (commands >= 2:
    // v1 in phase A + v2 in phase B) but its log never reached a quorum, so its committed version
    // is still 1 — real raft quorum, not a modelled term-gate.
    t.ok(m.afterFailback.oldLeaderCommands >= 2,
      'the partitioned old leader DID attempt to publish v2 (issued the raft command)');
    t.equal(m.afterFailback.versions[m.leaderA], 1,
      'but the partitioned old leader could NOT commit v2 — no majority (real quorum gate)');
  });

t.test('Phase C: heal converges every node to a committed published version 2; old leader steps down',
  async (t) => {
    const m = await runQuorumFailback(3);
    for (const id of IDS) {
      t.equal(m.afterHeal.versions[id], 2,
        `${id} converged to committed published version 2 after heal`);
    }
    t.not(m.afterHeal.oldLeaderState, LifeRaft.LEADER,
      'the old leader stepped down (no longer LEADER)');
    t.same(m.afterHeal.divergentCommittedIndexes, [],
      'committed raft log entries agree across nodes at every index (CL-040 fixed — no ' +
      'same-index/different-term stale-commit)');
  });

t.test('the real-quorum publication fail-back is deterministic and holds across seeds',
  async (t) => {
    const a = await runQuorumFailback(5);
    const b = await runQuorumFailback(5);
    t.same(
      {leaderA: a.leaderA, leaderB: a.leaderB,
        vA: a.afterPublishV1.versions, vB: a.afterFailback.versions, vC: a.afterHeal.versions},
      {leaderA: b.leaderA, leaderB: b.leaderB,
        vA: b.afterPublishV1.versions, vB: b.afterFailback.versions, vC: b.afterHeal.versions},
      'same seed -> identical election, real-quorum fail-back, and convergence',
    );

    const survivors = new Set();
    for (let seed = 0; seed < 10; seed += 1) {
      const m = await runQuorumFailback(seed);
      t.ok(IDS.every((id) => m.afterPublishV1.versions[id] === 1),
        `seed ${seed}: v1 committed cluster-wide`);
      t.ok(m.leaderB && m.afterFailback.versions[m.leaderB] === 2 &&
        m.afterFailback.versions[m.leaderA] === 1,
      `seed ${seed}: new leader committed v2 via quorum; partitioned old leader could not`);
      t.ok(IDS.every((id) => m.afterHeal.versions[id] === 2),
        `seed ${seed}: all nodes converged to committed v2 after heal`);
      survivors.add(m.leaderB);
    }
    t.ok(survivors.size >= 2, 'the failed-over committer varies with the seed (not a fixed node)');
  });
