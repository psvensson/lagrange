import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftCluster, driveNetworkFine} from
  '../distributed/harness/raft-network-host.js';
import {PctScheduler} from '../../src/time/pct-scheduler.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// DT6 item 7 — harness fidelity for MID-CHURN sampling. DT6 is faithful for converged-OUTCOME
// assertions but driveNetwork's stepMs-batched run() drains a whole co-due batch before flushing
// microtasks, so a mid-churn observation can land between a batch's deliveries and their async
// continuations — a drive-granularity artifact that makes raw mid-churn safety sampling unreliable
// (see the raft-safety-sweep finding). This adds a MAX-FIDELITY drive (net.runStep + driveNetworkFine):
// deliver ONE event, flush microtasks to quiescence, observe — so every sample is a SETTLED protocol
// state and a safety invariant can be sampled mid-churn faithfully.
//
// This guard exercises the new drive on a real contested election: it samples the raft ELECTION-SAFETY
// invariant (at most one LEADER per term) at EVERY settled step and asserts it never violates; it
// confirms that for a FIXED delivery order (no scheduler) the fine and coarse drives reach the same
// converged outcome (only the observation granularity differs); and it shows the coarse drive batches
// >=2 events per drain (unobservable intermediate states) that the fine drive separates into
// individual settled samples.
//
// HONEST FINDING (recorded): under the PctScheduler the fine and coarse drives are NOT equivalent in
// general — the batching changes which events are co-due when the scheduler picks, so coarse and fine
// can elect different leaders on some seeds. That is itself a drive-granularity artifact, and exactly
// why faithful mid-churn sampling needs the single-event fine drive rather than coarse batches.
//
// Unlocks the verdict-load-bearing PCT safety search item 3 noted as a follow-up: with faithful
// mid-churn sampling, a search can assert safety invariants DURING churn, not just the final outcome.

const IDS = Object.freeze(['C1', 'C2', 'F']);

// Dormant election/heartbeat timers so candidacy is driven explicitly and deterministically
// (election min==max => no election RNG); the contested promote() is the churn we sample through.
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

// Election safety: no two distinct nodes are LEADER in the same term at the same instant.
function electionSafetyViolation(rafts) {
  const leaderByTerm = new Map();
  for (const id of IDS) {
    const raft = rafts.get(id);
    if (raft.state === LifeRaft.LEADER) {
      const existing = leaderByTerm.get(raft.term);
      if (existing && existing !== id) {
        return {term: raft.term, leaders: [existing, id]};
      }
      leaderByTerm.set(raft.term, id);
    }
  }
  return null;
}

function makeScheduler(seed) {
  const random = new SeededRandomSource({seed});
  const scheduler = new PctScheduler({
    randomSource: random,
    depth: 2,
    stepBudget: 12,
    keyOf: (event) =>
      (event.payload && event.payload.packet && event.payload.packet.address) ||
      event.from ||
      event.type,
  });
  return {random, scheduler};
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

// seed === null => no scheduler: the fixed (dueAt, seq) delivery order (granularity-invariant).
// A numeric seed => the PctScheduler permutes co-due order (used for the mid-churn safety search).
function makeContestedNet(seed) {
  if (seed === null) {
    return createVirtualNetwork();
  }
  const {random, scheduler} = makeScheduler(seed);
  return createVirtualNetwork({scheduler, random});
}

// Run a contested election under the MAX-FIDELITY drive, sampling election-safety at every settled step.
async function runFineContested(seed) {
  const net = makeContestedNet(seed);
  const rafts = connectRaftCluster(net, IDS, () => ({...DORMANT}));
  rafts.get('C1').promote();
  rafts.get('C2').promote();

  let violation = null;
  let samples = 0;
  const settled = await driveNetworkFine(net, {
    untilMs: 200,
    onSettled: () => {
      samples += 1;
      const v = electionSafetyViolation(rafts);
      if (v && !violation) {
        violation = v;
      }
    },
  });

  const winner = leaderOf(rafts);
  rafts.forEach((raft) => raft.end());
  return {settled, samples, violation, winner, fVotedFor: rafts.get('F').votes.for};
}

// Run the same contested election under the COARSE drive, for equivalence + granularity contrast.
async function runCoarseContested(seed) {
  const net = makeContestedNet(seed);
  const rafts = connectRaftCluster(net, IDS, () => ({...DORMANT}));
  rafts.get('C1').promote();
  rafts.get('C2').promote();
  let maxBatch = 0; // largest number of events one run() drained synchronously before a flush
  let totalEvents = 0;
  for (let tEnd = 2; tEnd <= 200; tEnd += 2) {
    const r = net.run({untilMs: tEnd});
    maxBatch = Math.max(maxBatch, r.steps);
    totalEvents += r.steps;
    await Promise.resolve();
  }
  const winner = leaderOf(rafts);
  rafts.forEach((raft) => raft.end());
  return {maxBatch, totalEvents, winner, fVotedFor: rafts.get('F').votes.for};
}

t.test('election-safety holds at EVERY settled step under the max-fidelity drive (mid-churn sampling)',
  async (t) => {
    let totalSamples = 0;
    for (let seed = 0; seed < 12; seed += 1) {
      const m = await runFineContested(seed);
      t.equal(m.violation, null,
        `seed ${seed}: no two leaders shared a term at any settled mid-churn observation`);
      t.ok(m.samples > 0, `seed ${seed}: mid-churn was actually sampled (settled=${m.settled})`);
      t.ok(m.winner === 'C1' || m.winner === 'C2',
        `seed ${seed}: exactly one real candidate won (converged outcome)`);
      totalSamples += m.samples;
    }
    t.ok(totalSamples > 50,
      `the max-fidelity drive produced many settled mid-churn samples (total=${totalSamples})`);
  });

t.test('for a FIXED delivery order, granularity does not change the outcome (fine == coarse)',
  async (t) => {
    // No scheduler => the fixed (dueAt, seq) order. The fine and coarse drives then deliver the same
    // events in the same order; only the observation granularity differs, so the converged outcome
    // is identical. (Under the PctScheduler this equivalence does NOT hold in general: the batching
    // changes which events are co-due when the scheduler picks, so coarse and fine can elect
    // different leaders on some seeds — itself a drive-granularity artifact, and exactly why faithful
    // mid-churn sampling needs the single-event fine drive rather than coarse batches.)
    const fine = await runFineContested(null);
    const coarse = await runCoarseContested(null);
    t.ok(fine.winner === 'C1' || fine.winner === 'C2', 'the fine drive elected a real leader');
    t.equal(fine.winner, coarse.winner,
      'fine and coarse drives elect the same leader for the fixed (dueAt, seq) order');
    t.equal(fine.fVotedFor, coarse.fVotedFor, 'F grants its decisive vote identically under both');
    t.equal(fine.violation, null,
      'election-safety held at every settled fine-drive step for the fixed order too');
  });

t.test('the coarse drive batches multiple events per drain (unobservable intermediate states) that ' +
  'the fine drive separates into individual settled samples', async (t) => {
  const fine = await runFineContested(3);
  const coarse = await runCoarseContested(3);
  // The fidelity gap: a single coarse run() drains >=2 events synchronously before any flush, so the
  // state BETWEEN those events (e.g. after C1's vote reaches F but before C2's) is never observable.
  t.ok(coarse.maxBatch >= 2,
    `the coarse drive drained >=2 events in one un-flushed batch (maxBatch=${coarse.maxBatch}) — ` +
    'intermediate states are unobservable');
  // The fine drive delivers exactly one event per step, so every such intermediate state IS a
  // settled, observable sample.
  t.ok(fine.settled >= coarse.maxBatch,
    'the fine drive exposed each batched event as its own settled sample ' +
    `(settled=${fine.settled} >= coarse maxBatch=${coarse.maxBatch})`);
});

t.test('the max-fidelity drive is deterministic across runs', async (t) => {
  const a = await runFineContested(5);
  const b = await runFineContested(5);
  t.same(
    {settled: a.settled, samples: a.samples, winner: a.winner, fVotedFor: a.fVotedFor,
      violation: a.violation},
    {settled: b.settled, samples: b.samples, winner: b.winner, fVotedFor: b.fVotedFor,
      violation: b.violation},
    'same seed -> identical settled-step sequence and outcome',
  );
});
