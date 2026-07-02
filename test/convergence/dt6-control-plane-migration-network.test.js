import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {TABLES} from '../../src/constants/index.js';

// DT6 step 5 — the first REAL CONTROL-PLANE subsystem hosted alongside the real raft cluster
// on the VirtualNetwork. Steps 2–4 built the consensus layer (a real liferaft cluster electing
// and migrating leadership over the network); step 5 closes the loop to the layer where CL-039
// actually lived: it hosts the REAL owner-membership publication driver on every node, gated on
// THAT node's live raft leadership through the production Tier-0 path
// (resolveControlPlanePublicationsLeadership -> cdcIntegrationService.canWriteSystemTableLocally),
// and lets a REAL raft leadership migration drive the control-plane owner handoff.
//
// This is the multi-node, real-migration-driven generalisation of the DT4 full-chain scenario
// (dt4-full-chain-scenario.test.js), which composed the same real owner driver with ONE raft
// node on ONE clock and faked the leadership loss with change({state}). Here the leadership loss
// is a REAL partition-induced migration across THREE nodes on the network, and an owner driver
// runs on EACH node's network clock.
//
// HONEST SCOPE (unchanged from DT4 full-chain): we observe the owner driver's LEADERSHIP GATE —
// each node counts how many driver ticks pass resolveControlPlanePublicationsLeadership and reach
// the publish path (readPublicationPlanningSnapshot). We do NOT materialise a published epoch;
// the publish internals downstream of the gate are exercised by their own tests. The signal here
// is WHICH node acts as the publication owner over time, and that it tracks real raft leadership.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
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

// Host the REAL owner-membership driver on one node, gated on its live raft leadership. The
// gate path is the production Tier-0 one: systemTableCache misses (get/find -> null) force
// resolveControlPlanePublicationsLeadership onto cdcIntegrationService.canWriteSystemTableLocally,
// which here reflects the node's real raft role. gatePasses counts ticks that reach the publish
// path (past the leadership gate) — the "this node is acting as the publication owner" signal.
function hostOwnerDriver(net, raft, nodeId) {
  const counters = {gatePasses: 0};
  const coordinator = {
    driveOwnerMembershipReconcile: ownerProto.driveOwnerMembershipReconcile,
    startOwnerMembershipDriver: ownerProto.startOwnerMembershipDriver,
    stopOwnerMembershipDriver: ownerProto.stopOwnerMembershipDriver,
    nodeId,
    systemTableCache: {get: () => null, find: () => null},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS && raft.state === LifeRaft.LEADER,
    },
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
      counters.gatePasses += 1; // reached past the leadership gate -> acting as owner this tick
      return null; // past the gate; publish internals are out of scope (see header)
    },
    reconcileActiveGateMembershipPublication: async () => {},
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

// Run the full whole-system scenario for one seed; return a phase-by-phase snapshot of which
// node is acting as the publication owner (its cumulative gatePasses).
async function runControlPlaneMigration(seed) {
  const net = createVirtualNetwork();
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  const owners = new Map(IDS.map((id) => [id, hostOwnerDriver(net, rafts.get(id), id)]));
  const snapshot = () => Object.fromEntries(
    IDS.map((id) => [id, owners.get(id).counters.gatePasses]),
  );

  // Phase A — natural election; the owner gate should settle on the elected leader.
  await driveNetwork(net, {untilMs: 400, stepMs: 5});
  const leaderA = leaderOf(rafts);
  const afterElection = snapshot();

  // Phase B — partition the leader; leadership migrates and a new owner emerges.
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1000, stepMs: 5});
  const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
  const afterPartition = snapshot();

  // Phase C — heal; the old leader steps down and stops acting as owner. Two snapshots after
  // heal let us assert who is STILL accruing (the single stable owner) vs frozen.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1300, stepMs: 5});
  const healMid = snapshot();
  await driveNetwork(net, {untilMs: 1700, stepMs: 5});
  const healEnd = snapshot();

  IDS.forEach((id) => {
    owners.get(id).coordinator.stopOwnerMembershipDriver();
    rafts.get(id).end();
  });
  return {leaderA, leaderB, afterElection, afterPartition, healMid, healEnd};
}

t.test('Phase A: the real owner gate settles on the elected raft leader (single owner)',
  async (t) => {
    const m = await runControlPlaneMigration(3);
    t.not(m.leaderA, null, 'a leader was elected');
    t.ok(m.afterElection[m.leaderA] > 0,
      'the elected leader passed the real leadership gate and acted as publication owner');
    for (const id of IDS) {
      if (id !== m.leaderA) {
        t.equal(m.afterElection[id], 0,
          `${id} (a follower) deferred at the gate — it never acted as owner`);
      }
    }
  });

t.test('Phase B: a real migration hands the owner role to the new leader (with the realistic ' +
  'isolated-old-leader window)', async (t) => {
  const m = await runControlPlaneMigration(3);
  t.not(m.leaderB, null, 'leadership migrated to a new raft leader');
  t.ok(m.afterPartition[m.leaderB] > 0,
    'the migrated leader now passes the gate and acts as the publication owner');
  // The partitioned old leader still believes it leads (raft does not self-demote), so it keeps
  // acting as owner on its isolated side — the genuine dual-owner hazard a partition creates.
  t.ok(m.afterPartition[m.leaderA] > m.afterElection[m.leaderA],
    'the isolated old leader keeps acting as owner while partitioned (dual-owner window)');
});

t.test('Phase C: heal resolves to a single stable owner (old leader steps down, stops acting)',
  async (t) => {
    const m = await runControlPlaneMigration(3);
    const oldLeaderDelta = m.healEnd[m.leaderA] - m.healMid[m.leaderA];
    const newLeaderDelta = m.healEnd[m.leaderB] - m.healMid[m.leaderB];
    t.equal(oldLeaderDelta, 0,
      'after heal the old leader stepped down and stopped acting as owner (gate closed)');
    t.ok(newLeaderDelta > 0,
      'the migrated leader continues as the sole publication owner — the control-plane fail-back');
    const stillActing = IDS.filter((id) => m.healEnd[id] - m.healMid[id] > 0);
    t.same(stillActing, [m.leaderB], 'exactly one node is still acting as owner after heal');
  });

t.test('the whole-system handoff is deterministic and seed-determined', async (t) => {
  const a = await runControlPlaneMigration(5);
  const b = await runControlPlaneMigration(5);
  t.same(
    {leaderA: a.leaderA, leaderB: a.leaderB, afterElection: a.afterElection,
      afterPartition: a.afterPartition, healEnd: a.healEnd},
    {leaderA: b.leaderA, leaderB: b.leaderB, afterElection: b.afterElection,
      afterPartition: b.afterPartition, healEnd: b.healEnd},
    'same seed -> identical leadership, migration, and owner-gate handoff',
  );

  // Across seeds the owner gate always follows real raft leadership: exactly the elected leader
  // owns after election, and exactly the migrated leader is the sole stable owner after heal.
  const winners = new Set();
  for (let seed = 0; seed < 8; seed += 1) {
    const m = await runControlPlaneMigration(seed);
    const electionOwners = IDS.filter((id) => m.afterElection[id] > 0);
    t.same(electionOwners, [m.leaderA], `seed ${seed}: only the elected leader owned after election`);
    const finalOwners = IDS.filter((id) => m.healEnd[id] - m.healMid[id] > 0);
    t.same(finalOwners, [m.leaderB], `seed ${seed}: only the migrated leader owns after heal`);
    winners.add(m.leaderB);
  }
  t.ok(winners.size >= 2, 'the surviving owner varies with the seed (not a fixed node)');
});
