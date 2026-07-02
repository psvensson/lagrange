import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {PctScheduler} from '../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {TABLES} from '../../src/constants/index.js';

// DT6 item 3 — turn the hosted control plane into a FALSIFIER over the DELIVERY-ORDER space: drive
// the real CL-039 publication fail-back (step 7's real owner driver + real quorum-gated raft.command
// commit) under a seeded PctScheduler that PERMUTES co-due delivery order, and CENSUS the convergence
// invariant across the searched schedules instead of replaying one fixed (dueAt, seq) order.
//
// Step 7 ran a single delivery order; this searches the co-due delivery-order space (PCT depth 2 =
// one priority-change point, grouped by sender so different nodes' co-due raft packets race) over
// many seeds, performing thousands of genuine co-due reorderings (asserted via an instrumented
// reorder count), and asserts the invariant holds for EVERY searched schedule — or surfaces a
// counterexample seed (a real CL-039-class divergence).
//
// HONEST RESULT (important, per adversarial review): in THIS scenario the converged outcome is
// ROBUST to delivery reordering — the invariant holds across all searched schedules, and the search
// finds no schedule that flips it. So the search's value here is EXHAUSTIVE NEGATIVE EVIDENCE over
// the delivery-order space (which step 7 did not cover), not a verdict the reordering changes. The
// leaderA/leaderB variety reported in the census comes from the per-node election RNG (the seed),
// NOT from the delivery reordering; the search-load-bearing assertion is the reorder COUNT (the
// scheduler genuinely permuted co-due deliveries), and the invariant held regardless.
//
// INVARIANT (asserted on the FINAL, fully-healed, fully-settled state — the coarse converged-outcome
// regime DT6 is faithful for; this deliberately does NOT sample mid-churn safety, which is item 7's
// fidelity concern): after partition(leader) + a required v2 bump + heal, every node converges to a
// committed published version of 2, and committed raft log entries agree at every index (no
// same-index/different-term divergence — the CL-040 check).

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
    'Log': InMemoryLogAdapter,
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// The real owner-membership driver committing the publication via the real raft log (step 7).
function hostQuorumPublisher(net, raft, nodeId, required) {
  const state = {committedVersion: 0, committedRow: null, lastCommandKey: null, commands: 0};
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
        // NOTLEADER if leadership was lost between the gate and the write; the next tick re-evaluates.
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

// Run the real fail-back under a seeded PCT scheduler permuting co-due delivery order.
async function runFailbackUnderPct(seed) {
  const required = {version: 1};
  const random = new SeededRandomSource({seed});
  const basePctScheduler = new PctScheduler({
    randomSource: random,
    depth: 2, // one priority-change point: can delay one sender's chain across another's
    stepBudget: 16,
    // Group co-due events by their SENDER so different nodes' co-due raft packets are distinct PCT
    // tasks the search can reorder (generalises step 3's contested-vote race to the full fail-back).
    keyOf: (event) =>
      (event.payload && event.payload.packet && event.payload.packet.address) ||
      event.from ||
      event.type,
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
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  const pubs = new Map(
    IDS.map((id) => [id, hostQuorumPublisher(net, rafts.get(id), id, required)]),
  );

  // Phase A — elect + commit membership v1 cluster-wide.
  await driveNetwork(net, {untilMs: 600, stepMs: 5});
  const leaderA = leaderOf(rafts);
  if (!leaderA) {
    IDS.forEach((id) => pubs.get(id).coordinator.stopOwnerMembershipDriver());
    IDS.forEach((id) => rafts.get(id).end());
    return {leaderA: null, leaderB: null, converged: false,
      divergentCommittedIndexes: [], reorders, reason: 'no-leaderA'};
  }

  // Phase B — require v2 and partition the old leader; the new leader must re-commit v2 via quorum.
  required.version = 2;
  const followers = IDS.filter((id) => id !== leaderA);
  for (const other of followers) {
    net.partition(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 1600, stepMs: 5});
  const leaderB = followers.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;

  // Phase C — heal and settle generously, then read the FINAL converged state.
  for (const other of followers) {
    net.heal(leaderA, other);
  }
  await driveNetwork(net, {untilMs: 3000, stepMs: 5});

  const versions = Object.fromEntries(IDS.map((id) => [id, pubs.get(id).state.committedVersion]));
  const converged = IDS.every((id) => versions[id] === 2);

  // Committed-log agreement: any index with >1 distinct {term, command} across nodes is a violation.
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

  IDS.forEach((id) => pubs.get(id).coordinator.stopOwnerMembershipDriver());
  IDS.forEach((id) => rafts.get(id).end());
  return {leaderA, leaderB, versions, converged, divergentCommittedIndexes, reorders, reason: null};
}

t.test('PCT search over the control-plane fail-back: convergence holds across searched interleavings',
  async (t) => {
    const SEEDS = 24;
    const census = {converged: 0, diverged: 0, noLeader: 0};
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
      `totalReorders=${totalReorders}; leadersA=${[...leadersA]} (election-RNG variety), ` +
      `leadersB=${[...leadersB]} (election-RNG variety)`);

    t.equal(counterexamples.length, 0,
      'no searched delivery-order schedule violated convergence/agreement ' +
      `(counterexamples: ${JSON.stringify(counterexamples)})`);
    t.equal(census.converged, SEEDS,
      'every searched delivery-order schedule converged to committed v2 cluster-wide');
    // Search-load-bearing assertion: the PctScheduler genuinely permuted co-due delivery order
    // (picked != lowest-seq) many times across the census — this is a real delivery-order search,
    // not an inert scheduler. (The invariant proved ROBUST to all of it; see HONEST RESULT above.)
    t.ok(totalReorders > 100,
      'the PCT scheduler performed real co-due delivery reorderings across the search ' +
      `(totalReorders=${totalReorders})`);
  });

t.test('a PCT-searched fail-back seed replays identically (determinism)', async (t) => {
  const a = await runFailbackUnderPct(5);
  const b = await runFailbackUnderPct(5);
  t.same(
    {leaderA: a.leaderA, leaderB: a.leaderB, versions: a.versions,
      divergent: a.divergentCommittedIndexes, reorders: a.reorders},
    {leaderA: b.leaderA, leaderB: b.leaderB, versions: b.versions,
      divergent: b.divergentCommittedIndexes, reorders: b.reorders},
    'same seed -> identical searched schedule (incl. reorder count) and converged outcome',
  );
});
