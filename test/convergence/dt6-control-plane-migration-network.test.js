import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftRsNetwork} from
  '../test-helpers/raft-rs-network-host.js';
import {TABLES} from '../../src/constants/index.js';
import {
  assertMembershipPublicationOwnerDriverHostsHealthy,
  createMembershipPublicationOwnerDriverHost,
} from './membership-publication-owner-driver-host.js';

// DT6 step 5 — the first REAL CONTROL-PLANE subsystem hosted alongside the real raft cluster
// on the VirtualNetwork. Steps 2–4 built the consensus layer (real raft-rs ports electing
// and migrating leadership over the network); step 5 closes the loop to the layer where CL-039
// actually lived: it hosts the REAL owner-membership publication driver on every node, gated on
// THAT node's live raft leadership through the production Tier-0 path
// (resolveControlPlanePublicationsLeadership -> cdcIntegrationService.canWriteSystemTableLocally),
// and lets a REAL raft leadership migration drive the control-plane owner handoff.
//
// This is the multi-node, real-migration-driven generalisation of the DT4 full-chain scenario
// (the DT4 full-chain scenario, retired with the legacy consensus runtime), which composed the same real owner driver with ONE raft
// node on ONE clock and faked the leadership loss with change({state}). Here the leadership loss
// is a REAL partition-induced migration across THREE nodes on the network, and an owner driver
// runs on EACH node's network clock.
//
// HONEST SCOPE (unchanged from DT4 full-chain): we observe the owner driver's LEADERSHIP GATE —
// each node counts how many driver ticks pass resolveControlPlanePublicationsLeadership and reach
// the publish path (readPublicationPlanningSnapshot). We do NOT materialise a published epoch;
// the publish internals downstream of the gate are exercised by their own tests. The signal here
// is WHICH node acts as the publication owner over time, and that it tracks real raft leadership.
// That signal is also all the determinism witness compares (see ownerHandoff below).

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const CONSENSUS_PARTITION_ID = 'control-plane-migration-p1';

function leaderOf(consensus) {
  return IDS.find((id) => consensus.isLeader(id)) || null;
}

// Host the REAL owner-membership driver on one node, gated on its live raft leadership. The
// gate path is the production Tier-0 one: systemTableCache misses (get/find -> null) force
// resolveControlPlanePublicationsLeadership onto cdcIntegrationService.canWriteSystemTableLocally,
// which here reflects the node's real raft role. gatePasses counts ticks that reach the publish
// path (past the leadership gate) — the "this node is acting as the publication owner" signal.
function hostOwnerDriver(net, consensus, nodeId) {
  const counters = {gatePasses: 0};
  const coordinator = createMembershipPublicationOwnerDriverHost({
    nodeId,
    systemTableCache: {get: () => null, find: () => null},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS &&
        consensus.isLeader(nodeId),
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
  });
  coordinator.startOwnerMembershipDriver({
    enabled: true,
    intervalMs: 20,
    timeSource: net.networkTimeSource(nodeId),
  });
  return {coordinator, counters};
}

// Run the full whole-system scenario for one seed; return a phase-by-phase snapshot of which
// node is acting as the publication owner (its cumulative gatePasses).
const PHASE_B_DEADLINE_MS = 4000;
const PHASE_SETTLE_MS = 300;
const HEAL_OBSERVE_MS = 400;

async function runControlPlaneMigration(seed) {
  const net = createVirtualNetwork();
  const consensus = connectRaftRsNetwork(net, IDS, {
    partitionId: CONSENSUS_PARTITION_ID,
    seed,
  });
  consensus.start();
  const owners = new Map(IDS.map((id) =>
    [id, hostOwnerDriver(net, consensus, id)]));
  const snapshot = () => Object.fromEntries(
    IDS.map((id) => [id, owners.get(id).counters.gatePasses]),
  );

  // Phase A — natural election; the owner gate should settle on the elected leader.
  await consensus.runUntil(400, {stepMs: 5});
  const leaderA = leaderOf(consensus);
  const afterElection = snapshot();

  // Phase B — partition the leader; leadership migrates and a new owner emerges.
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  // Under check_quorum each follower ignores pre-votes for its own election
  // timeout after A's last heartbeat (its leader lease): the migration is
  // awaited as an event, then the phase settles.
  await consensus.runUntilTrue(() => followers.some((id) =>
    consensus.isLeader(id) && owners.get(id).counters.gatePasses > 0),
  {deadlineMs: PHASE_B_DEADLINE_MS, stepMs: 5});
  await consensus.runUntil(net.now() + PHASE_SETTLE_MS, {stepMs: 5});
  const leaderB = followers.find((id) => consensus.isLeader(id)) || null;
  const afterPartition = snapshot();
  const oldLeaderLeadsAfterPartition = consensus.isLeader(leaderA);

  // Phase C — heal; the old leader steps down and stops acting as owner. Two snapshots after
  // heal let us assert who is STILL accruing (the single stable owner) vs frozen.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await consensus.runUntil(net.now() + PHASE_SETTLE_MS, {stepMs: 5});
  const healMid = snapshot();
  await consensus.runUntil(net.now() + HEAL_OBSERVE_MS, {stepMs: 5});
  const healEnd = snapshot();

  assertMembershipPublicationOwnerDriverHostsHealthy(
    [...owners.values()].map(({coordinator}) => coordinator),
  );
  IDS.forEach((id) => {
    owners.get(id).coordinator.stopOwnerMembershipDriver();
  });
  consensus.dispose();
  return {leaderA, leaderB, afterElection, afterPartition, healMid, healEnd,
    oldLeaderLeadsAfterPartition};
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
  // The partitioned old leader still believes it leads until check_quorum
  // steps it down (one election timeout without a quorum), so it keeps acting
  // as owner on its isolated side for that bounded window - the dual-owner
  // hazard a partition creates.
  t.ok(m.afterPartition[m.leaderA] > m.afterElection[m.leaderA],
    'the isolated old leader acts as owner while partitioned until check_quorum ' +
      'steps it down (bounded dual-owner window)');
  t.equal(m.oldLeaderLeadsAfterPartition, false,
    'check_quorum stepped the isolated old leader down');
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

// Which nodes acted as the publication owner in each settled phase: the handoff's structure,
// without the tick counts the core's election timing moves. The first ticks after heal are left
// out: whether the old leader passes its gate once more before it hears the higher term is
// election timing too.
function ownerHandoff(m) {
  const actedBetween = (from, to) => IDS.filter((id) => (to[id] - (from?.[id] ?? 0)) > 0);
  return {
    leaderA: m.leaderA,
    leaderB: m.leaderB,
    election: actedBetween(null, m.afterElection),
    partition: actedBetween(m.afterElection, m.afterPartition),
    healed: actedBetween(m.healMid, m.healEnd),
  };
}

// DETERMINISM IS NARROWED TO THE FIRST ELECTION (owner decision O2, closed 2026-10-04: the
// raft-rs binding is not seeded; owner 2026-10-05: "narrow the tests", no crate fork). raft-rs
// draws each randomized election timeout from the platform RNG, which no seed can choose. Phase A
// is still seed-determined (no leader is known, nobody holds a lease: the seed's rank-0 replica
// wins). Phase B is not: under check_quorum the followers keep the dead leader's lease for their
// own election timeout, so the failover winner is drawn by raft-rs's own randomness. A replayed
// seed must reach the same first leader and the same owner after election; for each run the
// failover must have the shape of a correct handoff (the new leader is one of the two followers,
// both leaders act while partitioned, only the new leader owns after heal). Gate-pass counts and
// the identity of the failover winner are not claimed.
t.test('the whole-system handoff is seed-determined up to the failover winner (same first ' +
  'leader and owner; handoff shape per run; gate-pass counts not claimed)', async (t) => {
  const a = await runControlPlaneMigration(5);
  const b = await runControlPlaneMigration(5);
  const firstElection = (m) => {
    const handoff = ownerHandoff(m);
    return {leaderA: handoff.leaderA, election: handoff.election};
  };
  t.same(firstElection(b), firstElection(a),
    'same seed -> same first leader and the same owner after election');
  for (const [name, m] of [['run a', a], ['run b', b]]) {
    const handoff = ownerHandoff(m);
    const followers = IDS.filter((id) => id !== m.leaderA);
    t.ok(followers.includes(m.leaderB),
      `${name}: the failover leader is one of the first leader's followers`);
    t.same(handoff.partition,
      IDS.filter((id) => id === m.leaderA || id === m.leaderB),
      `${name}: the dual-owner window: both leaders act while partitioned`);
    t.same(handoff.healed, [m.leaderB],
      `${name}: only the failover leader owns after heal`);
  }

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
