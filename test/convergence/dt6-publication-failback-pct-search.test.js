import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftRsNetwork} from '../test-helpers/raft-rs-network-host.js';
import {PctScheduler} from '../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {TABLES} from '../../src/constants/index.js';
import {
  assertMembershipPublicationOwnerDriverHostsHealthy,
  createMembershipPublicationOwnerDriverHost,
} from './membership-publication-owner-driver-host.js';

// DT6 item 3 — turn the hosted control plane into a FALSIFIER over the DELIVERY-ORDER space: drive
// the real CL-039 publication fail-back (step 7's real owner driver + a real quorum-gated proposal
// committed through a real raft-rs operation port per node, each on its own SQLite file) under a seeded PctScheduler that PERMUTES co-due delivery order, and CENSUS the convergence
// invariant across the searched schedules instead of replaying one fixed (dueAt, seq) order.
//
// Step 7 ran a single delivery order; this searches the co-due delivery-order space (PCT depth 2 =
// one priority-change point, grouped by sender so different nodes' co-due raft envelopes race) over
// many seeds, performing thousands of genuine co-due reorderings (asserted via an instrumented
// reorder count), and asserts the invariant holds for EVERY searched schedule — or surfaces a
// counterexample seed (a real CL-039-class divergence).
//
// HONEST RESULT (important, per adversarial review): in THIS scenario the converged outcome is
// ROBUST to delivery reordering — the invariant holds across all searched schedules, and the search
// finds no schedule that flips it. So the search's value here is EXHAUSTIVE NEGATIVE EVIDENCE over
// the delivery-order space (which step 7 did not cover), not a verdict the reordering changes. The
// leaderA/leaderB variety reported in the census comes from the seeded per-replica election
// windows (the seed), NOT from the delivery reordering; the search-load-bearing assertion is the reorder COUNT (the
// scheduler genuinely permuted co-due deliveries), and the invariant held regardless.
//
// NEGATIVE-EVIDENCE SCOPE (drive granularity): this search drives the coarse `host.runUntil`, whose
// stepMs-batched run() delivers a whole co-due batch before flushing microtasks, so the not-found
// result is bounded negative evidence over the schedule space reachable at THAT granularity — coarse
// batching hides microtask-spawned co-due orderings, and coarse vs fine drive granularity are NOT
// equivalent under a PctScheduler. Together with the seed budget and PCT
// depth, this bounds the claim: "no schedule found" here is not a proof over all interleavings.
//
// INVARIANT (asserted on the FINAL, fully-healed, fully-settled state — the coarse converged-outcome
// regime DT6 is faithful for; this deliberately does NOT sample mid-churn safety, which is item 7's
// fidelity concern): after partition(leader) + a required v2 bump + heal, every node converges to a
// committed published version of 2, and committed raft log entries agree at every index (no
// same-index/different-term divergence — the CL-040 check).
//
// DETERMINISM IS NARROWED TO THE SEMANTIC OUTCOME (owner decision, the consensus cutover quest
// Phase J): raft-rs draws its randomized election timeout from the platform RNG, which no seed can
// choose (owner decision O2, closed 2026-10-04: the binding is not seeded and no fork of the
// consensus crate is carried, so exact replay is not a property to restore). The seed fixes
// every owned timing input (each replica's election window, the PCT priorities), so a replayed seed
// must reach the same terminal leaders, versions and verdicts with zero divergence - but this test
// does NOT claim exact schedule replay: event counts such as the reorder count may differ by the few
// co-due ticks the platform draw shifts. It is not equivalent to byte-identical replay.

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const EXPECTED = Object.freeze([...IDS]);
const PUBLICATION_COMMAND_MARKER = '__membershipPublication';

const PARTITION_ID = 'dt6-publication-pct';
// Phase A ends at 600 ms; the slowest seeded follower window is [600, 1200) ms (rank 2 of the
// seeded windows), so a follower's lease plus a split vote resolve within two such windows.
const PHASE_A_END_MS = 600;
const WORST_ELECTION_WINDOW_MS = 1200;
const PHASE_B_MARGIN_MS = 400;
const PHASE_B_DEADLINE_MS = PHASE_A_END_MS + 2 * WORST_ELECTION_WINDOW_MS + PHASE_B_MARGIN_MS;
const HEAL_WINDOW_MS = 1400;

function leaderOf(host) {
  return IDS.find((id) => host.isLeader(id)) || null;
}

// The real owner-membership driver committing the publication via the real raft log (step 7).
function hostQuorumPublisher(net, host, nodeId, required) {
  const state = {committedVersion: 0, committedRow: null, lastCommandKey: null, commands: 0};
  host.onCommitted(nodeId, ({command}) => {
    if (command && command[PUBLICATION_COMMAND_MARKER]) {
      state.committedVersion = command.requiredVersion;
      state.committedRow = command.row;
    }
  });
  const coordinator = createMembershipPublicationOwnerDriverHost({
    nodeId,
    systemTableCache: {get: () => null, find: () => null, getAll: () => []},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS && host.isLeader(nodeId),
    },
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
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
    reconcileActiveGateMembershipPublication: async () => {
      const key = `${host.term(nodeId)}:${required.version}`;
      if (state.lastCommandKey === key) {
        return;
      }
      state.lastCommandKey = key;
      const row = buildMembershipPublicationRow({
        candidate: {
          publicationEpoch: required.version,
          publishedActiveNodeIds: EXPECTED,
          publisherNodeId: nodeId,
          requiredAckNodeIds: EXPECTED,
          acknowledgedNodeIds: EXPECTED,
        },
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        nowMs: net.now(),
      });
      state.commands += 1;
      // A refused proposal (leadership lost between the gate and the write) is not fatal: the next
      // tick re-evaluates.
      host.propose(nodeId, {
        [PUBLICATION_COMMAND_MARKER]: true,
        requiredVersion: required.version,
        row,
      });
    },
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    logger: {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}},
  });
  coordinator.startOwnerMembershipDriver({
    enabled: true,
    intervalMs: 20,
    timeSource: net.networkTimeSource(nodeId),
  });
  return {coordinator, state};
}

// Run the real fail-back under a seeded PCT scheduler permuting co-due delivery order.
async function runFailbackUnderPct(seed) {
  const required = {version: 1};
  const random = new SeededRandomSource({seed});
  const basePctScheduler = new PctScheduler({
    randomSource: random,
    depth: 2, // one priority-change point: can delay one sender's chain across another's
    stepBudget: 16,
    // Group co-due events by their SENDER so different nodes' co-due raft envelopes are distinct PCT
    // tasks the search can reorder (generalises step 3's contested-vote race to the full fail-back).
    keyOf: (event) => event.from || event.type,
  });
  // Instrument pick() to count GENUINE reorderings (picked != lowest-seq among a co-due set > 1) so
  // the test can assert the search actually permuted delivery order rather than running an inert
  // scheduler whose variety is really just election RNG.
  let reorders = 0;
  const scheduler = {
    pick: (coDue) => {
      const picked = basePctScheduler.pick(coDue);
      if (coDue.length > 1) {
        const lowestSeq = [...coDue].sort((a, b) => a.seq - b.seq)[0];
        if (picked !== lowestSeq) {
          reorders += 1;
        }
      }
      return picked;
    },
  };
  const net = createVirtualNetwork({scheduler, random});
  const host = connectRaftRsNetwork(net, IDS, {partitionId: PARTITION_ID, seed});
  const pubs = new Map(
    IDS.map((id) => [id, hostQuorumPublisher(net, host, id, required)]),
  );
  host.start();

  // Phase A — elect + commit membership v1 cluster-wide.
  await host.runUntil(PHASE_A_END_MS);
  const leaderA = leaderOf(host);
  if (!leaderA) {
    assertMembershipPublicationOwnerDriverHostsHealthy(
      [...pubs.values()].map(({coordinator}) => coordinator),
    );
    IDS.forEach((id) => pubs.get(id).coordinator.stopOwnerMembershipDriver());
    host.dispose();
    return {leaderA: null, leaderB: null, converged: false,
      divergentCommittedIndexes: [], reorders, reason: 'no-leaderA'};
  }

  // Phase B — require v2 and partition the old leader; the new leader must re-commit v2 via quorum.
  required.version = 2;
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  // Under check_quorum each follower ignores pre-votes for its own election timeout after A's last
  // heartbeat (its leader lease): the fail-back is awaited as an OBSERVED event - a follower leads
  // while A is cut off - within phase A's end + two worst-case election windows + margin. It is
  // not a fixed instant, so a run where no follower ever leads during the partition has no
  // leaderB (and fails below) instead of being rescued by the healed old cluster.
  await host.runUntilTrue(() => followers.some((id) => host.isLeader(id)),
    {deadlineMs: PHASE_B_DEADLINE_MS});
  const leaderB = followers.find((id) => host.isLeader(id)) || null;

  // Phase C — heal and settle generously, then read the FINAL converged state.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await host.runUntil(net.now() + HEAL_WINDOW_MS);

  const versions = Object.fromEntries(IDS.map((id) => [id, pubs.get(id).state.committedVersion]));
  const converged = IDS.every((id) => versions[id] === 2);

  // Committed-log agreement: any index with >1 distinct {term, command} across nodes is a violation.
  const committedByIndex = new Map();
  for (const id of IDS) {
    for (const entry of host.committedEntries(id)) {
      const {index} = entry;
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

  assertMembershipPublicationOwnerDriverHostsHealthy(
    [...pubs.values()].map(({coordinator}) => coordinator),
  );
  IDS.forEach((id) => pubs.get(id).coordinator.stopOwnerMembershipDriver());
  host.dispose();
  return {leaderA, leaderB, versions, converged, divergentCommittedIndexes, reorders, reason: null};
}

t.test('PCT search over the control-plane fail-back: convergence holds across searched interleavings',
  async (t) => {
    const SEEDS = 24;
    const census = {converged: 0, diverged: 0, noLeader: 0, noLeaderB: 0};
    const leadersA = new Set();
    const leadersB = new Set();
    const counterexamples = [];
    let totalReorders = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const m = await runFailbackUnderPct(seed);
      totalReorders += m.reorders;
      if (m.reason === 'no-leaderA') {
        census.noLeader += 1;
        counterexamples.push({seed, reason: 'no-leaderA'});
        continue;
      }
      leadersA.add(m.leaderA);
      if (m.leaderB) {
        leadersB.add(m.leaderB);
      } else {
        // A failover during the partition is part of the scenario, not optional: no follower led
        // while A was cut off is a liveness counterexample even if the heal converges.
        census.noLeaderB += 1;
        counterexamples.push({seed, reason: 'no-leaderB'});
        continue;
      }
      if (m.divergentCommittedIndexes.length > 0) {
        census.diverged += 1;
        counterexamples.push({seed, divergentCommittedIndexes: m.divergentCommittedIndexes,
          versions: m.versions});
      } else if (m.converged) {
        census.converged += 1;
      } else {
        census.diverged += 1;
        counterexamples.push({seed, versions: m.versions, reason: 'unconverged'});
      }
    }
    t.comment(`PCT census over ${SEEDS} seeds: ${JSON.stringify(census)}; ` +
      `totalReorders=${totalReorders}; leadersA=${[...leadersA]} (seeded election-window variety), ` +
      `leadersB=${[...leadersB]} (seeded election-window variety)`);

    t.equal(counterexamples.length, 0,
      'no searched delivery-order schedule violated convergence/agreement ' +
      `(counterexamples: ${JSON.stringify(counterexamples)})`);
    t.equal(census.noLeaderB, 0,
      'a follower of leaderA led during the partition in every searched schedule');
    t.equal(census.converged, SEEDS,
      'every searched delivery-order schedule converged to committed v2 cluster-wide');
    // Search-load-bearing assertion: the PctScheduler genuinely permuted co-due delivery order
    // (picked != lowest-seq) many times across the census — this is a real delivery-order search,
    // not an inert scheduler. (The invariant proved ROBUST to all of it; see HONEST RESULT above.)
    t.ok(totalReorders > 100,
      'the PCT scheduler performed real co-due delivery reorderings across the search ' +
      `(totalReorders=${totalReorders})`);
  });

// NARROWED (see DETERMINISM above): semantic outcome determinism, not exact schedule replay.
t.test('a PCT-searched fail-back seed replays to the same semantic outcome ' +
  '(outcome determinism; exact schedule replay not claimed)', async (t) => {
  const a = await runFailbackUnderPct(5);
  const b = await runFailbackUnderPct(5);
  // Under native check_quorum the fail-back winner after a lease is drawn by raft-rs's own
  // randomized election timeout, not by the seed (owner ruling 2026-10-05: narrow the tests,
  // no crate fork): leaderB's identity is compared per run as a shape, not across runs.
  const outcome = (m) => ({leaderA: m.leaderA, versions: m.versions,
    converged: m.converged, divergent: m.divergentCommittedIndexes, reason: m.reason});
  t.same(outcome(b), outcome(a),
    'same seed -> same first leader, versions and convergence/agreement verdicts');
  // Phase B waits for the fail-back as an observed event, so every run names a leaderB, and it is
  // one of leaderA's followers (the old leader, cut off, cannot lead the majority side).
  for (const m of [a, b]) {
    t.ok(m.leaderB !== null && m.leaderB !== m.leaderA && IDS.includes(m.leaderB),
      `a follower of leaderA led during the partition (${m.leaderB})`);
  }
  t.same(a.divergentCommittedIndexes, [], 'the replayed seed has zero committed-log divergence');
  t.equal(a.converged, true, 'the replayed seed converged to committed v2 cluster-wide');
  t.ok(a.reorders > 0 && b.reorders > 0,
    `both replays genuinely permuted co-due delivery (reorders ${a.reorders}, ${b.reorders})`);
});
