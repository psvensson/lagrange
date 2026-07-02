import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
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

// DT6 step 6 — the CL-039 publication FAIL-BACK, end-to-end with REAL publication-decision and
// REAL published-row materialisation. Step 5 observed only the owner GATE (which node may
// publish); step 6 drives the REAL publication body: each node's real owner driver is fed a
// real planning snapshot and runs the REAL deficit computation
// (driveOwnerMembershipReconcile -> buildPublicationActiveGateHandoffContract); when it finds a
// deficit it materialises a REAL published row (buildMembershipPublicationRow) into a shared
// store. This reproduces CL-039 directly: after a leadership migration the NEW owner must detect
// the stale published epoch and re-publish for its term (the fail-back the real bug missed),
// while the partitioned old owner cannot commit.
//
// The store models raft COMMIT SAFETY with a term-gated rule: a write commits only if the
// writer's term >= the store's committed epoch (a stale-term writer — the partitioned old leader
// — is rejected, the same outcome as a minority leader whose raft write cannot reach quorum). A
// new leadership term therefore reopens the deficit (the published epoch must be re-established
// for the new term) — precisely the fail-back obligation.
//
// HONEST SCOPE (this step abstracts more than steps 2–5 — be precise about what is real):
//   REAL: the leadership gate (production Tier-0 path), the DRIVE-vs-SKIP deficit DECISION
//     (driveOwnerMembershipReconcile -> buildPublicationActiveGateHandoffContract, real
//     missingPublishedCount), and the materialised published ROW (buildMembershipPublicationRow).
//   MODELLED: the term-gated store stands in for the persistence/CDC/ack transport AND for raft
//     commit safety (term-monotonic single-writer) — that term-gate is LOAD-BEARING for the
//     safety conclusion, not mere transport. Consequently the new leader's re-publish is modelled
//     as GUARANTEED to commit: this test proves the new owner RE-DETECTS the deficit and re-drives
//     (the exact gap CL-039 had), but it does NOT prove the re-publish write itself reaches a real
//     quorum. Driving the real persistence + a real quorum-gated commit on the network is the
//     remaining whole-system DST.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const EXPECTED = Object.freeze([...IDS]);
const ownerProto = MembershipPublicationCoordinatorReconcile.prototype;

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
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// Host the REAL owner-membership publication driver on one node, against a shared published-row
// store. The planning snapshot is real: the published set counts for this node ONLY if the store
// was committed at this node's raft term (else it is stale for this term -> the real deficit
// computation reports the full membership missing -> the driver drives the reconcile).
function hostPublisher(net, raft, nodeId, store) {
  const counters = {commits: 0, rejectedStaleWrites: 0};
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
      const publishedForMyTerm = store.committedEpoch === raft.term ? store.published : [];
      return {
        nodeRows: EXPECTED.map((id) => ({node_id: id, status: 'active'})),
        readinessByNodeId: Object.fromEntries(EXPECTED.map((id) => [id, {ready: true}])),
        latestPublishedPublicationRow: {
          publicationEpoch: raft.term,
          publishedActiveNodeIds: publishedForMyTerm,
        },
        latestPublicationRow: {
          publicationEpoch: raft.term,
          publishedActiveNodeIds: publishedForMyTerm,
          status: MEMBERSHIP_PUBLICATION_STATUS.OPEN,
        },
      };
    },
    // The "write": a raft-replicated commit. A stale-term writer (the partitioned old leader,
    // still at its old term) cannot commit; the current-term leader materialises a REAL
    // published row and commits it to the shared store.
    reconcileActiveGateMembershipPublication: async () => {
      if (raft.term < store.committedEpoch) {
        counters.rejectedStaleWrites += 1;
        return;
      }
      const row = buildMembershipPublicationRow({
        candidate: {
          publicationEpoch: raft.term,
          publishedActiveNodeIds: EXPECTED,
          publisherNodeId: raft.address,
          requiredAckNodeIds: EXPECTED,
          acknowledgedNodeIds: EXPECTED,
        },
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        nowMs: net.now(),
      });
      store.committedEpoch = raft.term;
      store.published = row.published_active_node_ids;
      store.lastRow = row;
      counters.commits += 1;
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
  return {coordinator, counters};
}

async function runPublicationFailback(seed) {
  const store = {committedEpoch: 0, published: [], lastRow: null};
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  const pubs = new Map(IDS.map((id) => [id, hostPublisher(net, rafts.get(id), id, store)]));

  // Phase A — the elected leader publishes membership for its term.
  await driveNetwork(net, {untilMs: 400, stepMs: 5});
  const leaderA = leaderOf(rafts);
  const termA = rafts.get(leaderA).term;
  const afterElection = {
    store: {...store},
    leaderCommits: pubs.get(leaderA).counters.commits,
    followerCommits: IDS.filter((id) => id !== leaderA)
      .map((id) => pubs.get(id).counters.commits),
  };

  // Phase B — partition the leader; a new leader wins a higher term and must re-publish (the
  // fail-back), while the partitioned old leader cannot commit (stale-term writes rejected).
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1000, stepMs: 5});
  const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  const termB = leaderB ? rafts.get(leaderB).term : null;
  const afterPartition = {
    store: {...store},
    newLeaderCommits: leaderB ? pubs.get(leaderB).counters.commits : 0,
    oldLeaderRejected: pubs.get(leaderA).counters.rejectedStaleWrites,
    oldLeaderCommits: pubs.get(leaderA).counters.commits,
  };

  // Phase C — heal; the old leader steps down, the store stays at the migrated epoch.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1500, stepMs: 5});
  const afterHeal = {store: {...store}, oldLeaderState: rafts.get(leaderA).state};

  IDS.forEach((id) => {
    pubs.get(id).coordinator.stopOwnerMembershipDriver();
    rafts.get(id).end();
  });
  return {leaderA, termA, leaderB, termB, afterElection, afterPartition, afterHeal};
}

t.test('Phase A: the elected leader materialises a real published epoch for its term',
  async (t) => {
    const m = await runPublicationFailback(3);
    t.ok(m.afterElection.leaderCommits > 0,
      'the leader ran the REAL deficit decision and committed a publication');
    t.equal(m.afterElection.store.committedEpoch, m.termA,
      'the published epoch equals the leader\'s raft term');
    t.same(m.afterElection.store.published, EXPECTED,
      'the published set is the full membership (deficit closed)');
    t.same(m.afterElection.followerCommits, [0, 0],
      'followers never published (deferred at the leadership gate)');
    // The materialised row is a REAL membership publication row.
    t.equal(m.afterElection.store.lastRow.status, MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      'a real PUBLISHED membership row was materialised');
    t.equal(m.afterElection.store.lastRow.publication_epoch, m.termA,
      'the real row carries the leader\'s term as its publication epoch');
  });

t.test('Phase B: after a migration the NEW leader re-publishes for its term (CL-039 fail-back); ' +
  'the partitioned old leader cannot commit', async (t) => {
  const m = await runPublicationFailback(3);
  t.not(m.leaderB, null, 'leadership migrated to a new leader');
  t.ok(m.termB > m.termA, 'the new leader holds a strictly higher term');
  t.ok(m.afterPartition.newLeaderCommits > 0,
    'the new leader detected the stale epoch and RE-PUBLISHED — the fail-back');
  t.equal(m.afterPartition.store.committedEpoch, m.termB,
    'the published epoch advanced to the new leader\'s term');
  t.ok(m.afterPartition.oldLeaderRejected > 0,
    'the partitioned old leader kept trying to publish but its stale-term writes were rejected ' +
    '(the stuck isolated owner that cannot commit)');
  t.equal(m.afterPartition.oldLeaderCommits, m.afterElection.leaderCommits,
    'the partitioned old leader committed nothing further (frozen at its phase-A publication)');
});

t.test('Phase C: heal leaves the migrated epoch stable and the old leader stepped down',
  async (t) => {
    const m = await runPublicationFailback(3);
    t.equal(m.afterHeal.store.committedEpoch, m.termB,
      'the published epoch stays at the migrated leader\'s term after heal');
    t.same(m.afterHeal.store.published, EXPECTED, 'the published set remains the full membership');
    t.not(m.afterHeal.oldLeaderState, LifeRaft.LEADER,
      'the old leader stepped down (no split-brain publisher)');
  });

t.test('the publication fail-back is deterministic and holds across seeds', async (t) => {
  const a = await runPublicationFailback(5);
  const b = await runPublicationFailback(5);
  t.same(
    {leaderA: a.leaderA, termA: a.termA, leaderB: a.leaderB, termB: a.termB,
      epochA: a.afterElection.store.committedEpoch, epochB: a.afterPartition.store.committedEpoch},
    {leaderA: b.leaderA, termA: b.termA, leaderB: b.leaderB, termB: b.termB,
      epochA: b.afterElection.store.committedEpoch, epochB: b.afterPartition.store.committedEpoch},
    'same seed -> identical election, migration, and publication fail-back',
  );

  const survivors = new Set();
  for (let seed = 0; seed < 10; seed += 1) {
    const m = await runPublicationFailback(seed);
    // Phase A converged at the elected leader's term; Phase B re-published at a higher term
    // (the fail-back); the old leader was a stuck owner; heal is stable.
    t.ok(m.afterElection.store.committedEpoch === m.termA &&
      m.afterElection.store.published.length === EXPECTED.length,
    `seed ${seed}: leader A published its term's epoch`);
    t.ok(m.termB > m.termA && m.afterPartition.store.committedEpoch === m.termB &&
      m.afterPartition.newLeaderCommits > 0,
    `seed ${seed}: the new leader re-published for its term (fail-back)`);
    t.ok(m.afterPartition.oldLeaderRejected > 0,
      `seed ${seed}: the partitioned old leader could not commit (stuck owner)`);
    t.equal(m.afterHeal.store.committedEpoch, m.termB,
      `seed ${seed}: the migrated epoch is stable after heal`);
    survivors.add(m.leaderB);
  }
  t.ok(survivors.size >= 2, 'the failed-over publisher varies with the seed (not a fixed node)');
});
