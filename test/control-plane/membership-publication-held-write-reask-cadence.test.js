// The cadence of a held publication write's re-ask, on a virtual clock: the
// real coordinator, its real owner queue (timers on the clock) and the real
// publications owner over a row store whose keyed confirmation reads do not
// answer. Planning's list observation remains available, so this witness
// reaches the write rather than failing before its admission.
//
// A write whose outcome the durable owner has not confirmed is still owed:
// the reconcile re-asks itself. On unchanged input the re-ask backs off (it
// doubles up to a bound); any wake from outside the held run supersedes the
// hold at once; a settled write ends it and resets the backoff; stopping the
// coordinator cancels the pending re-ask.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_PUBLICATION_WRITE_HOLD,
  PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS,
} from '../../src/control-plane/membership-publication-reconcile-write.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {createPublicationStore} from './publication-owner-test-support.js';

const START_MS = 100000;
const BASE_MS = 1000;
const MEMBERS = Object.freeze(['node-1', 'node-2', 'node-3']);
const QUIET = {debug() {}, info() {}, warn() {}, error() {},
  logConsoleOnly() {}};
const TURNS = 20;

async function turns() {
  for (let turn = 0; turn < TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The publications write leader over a store whose reads can be made
// unavailable. Only the candidate derivation (the planning evidence, not
// under test) is the witness's, as in the guarded-write witnesses.
function heldWriteOwner() {
  const clock = new VirtualTimeSource({startMs: START_MS});
  const store = createPublicationStore();
  let keyedReadsUnavailable = false;
  const readRows = store.gateway.readAuthoritativeRows.bind(store.gateway);
  store.gateway.readAuthoritativeRows = async (...args) =>
    keyedReadsUnavailable && args[2]?.length > 0 ?
      {success: false, error: 'keyed confirming read unavailable'} :
      readRows(...args);
  const runs = [];
  let coordinator = null;
  const reconcileQueue = new OwnerKeyReconcileQueue({
    name: 'membership-publication',
    reconcileFn: async (_ownerKey, _reasons, context) =>
      coordinator.reconcileClusterMembership(context || {}),
    now: () => clock.now(),
    setTimeoutFn: clock.setTimeout.bind(clock),
    clearTimeoutFn: clock.clearTimeout.bind(clock),
  });
  reconcileQueue.logger = QUIET;
  coordinator = new MembershipPublicationCoordinator({
    nodeId: 'node-1',
    controlPlanePublicationsOwner: store.owner,
    reconcileQueue,
    systemTableCache: {getAll: () => []},
    resolveIsControlPlanePublicationsWriteLeader: () => true,
    now: () => clock.now(),
    logger: QUIET,
  });
  let candidate = {
    publicationKind: 'cluster_membership',
    publicationEpoch: 8,
    publisherNodeId: 'node-1',
    publishedActiveNodeIds: [...MEMBERS],
    requiredAckNodeIds: [...MEMBERS],
    acknowledgedNodeIds: [],
    changed: true,
    reasonCode: 'witness',
  };
  coordinator.readClusterMembershipCandidate = async (options) => ({
    planningSnapshot: {
      latestPublicationRow: await coordinator.getLatestPublicationRow(options),
      latestPublishedPublicationRow: await coordinator.getLatestPublishedPublicationRow(options),
    },
    candidate,
  });
  const reconcile = coordinator.reconcileClusterMembership.bind(coordinator);
  coordinator.reconcileClusterMembership = async (options) => {
    const run = {atMs: clock.now() - START_MS};
    runs.push(run);
    const answer = await reconcile(options);
    run.hold = answer.publicationWriteHold ?? null;
    run.settled = Boolean(answer.publicationRow);
    return answer;
  };
  // Every write's answer is lost and its keyed confirming read is unavailable.
  const loseAnswers = () => {
    keyedReadsUnavailable = true;
    store.control.afterWrite = () => {
      throw new Error('write answer lost (witness)');
    };
  };
  const answerAgain = () => {
    keyedReadsUnavailable = false;
    store.control.afterWrite = null;
  };
  // Advance the clock in base steps, letting each released run finish.
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += BASE_MS) {
      clock.advance(BASE_MS);
      await turns();
    }
  };
  return {clock, store, coordinator, reconcileQueue, runs, loseAnswers,
    answerAgain, advance, setCandidate: (next) => {
      candidate = next;
    }};
}

function gaps(runs) {
  return runs.slice(1).map((run, index) => run.atMs - runs[index].atMs);
}

test('a held publication write re-asks with a growing, bounded delay while its confirming owner read is unavailable', async (t) => {
  const f = heldWriteOwner();
  t.after(() => f.coordinator.stopOwnerMembershipDriver());
  f.loseAnswers();
  f.coordinator.enqueueClusterMembershipReconcile('witness_first_ask');
  await turns();
  assert.equal(f.runs.length, 1);
  assert.equal(f.runs[0].hold,
    MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER);

  await f.advance(4 * 60 * 1000);
  assert.ok(f.runs.every((run) => run.hold ===
    MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER),
  'every re-ask is still held: the durable owner never answered');
  const observed = gaps(f.runs);
  const expectedGrowth = [];
  for (let delay = BASE_MS; delay < PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS;
    delay *= 2) {
    expectedGrowth.push(delay);
  }
  assert.deepEqual(observed.slice(0, expectedGrowth.length), expectedGrowth,
    'the re-ask delay doubles from the critical convergence bound');
  const bounded = observed.slice(expectedGrowth.length);
  assert.ok(bounded.length >= 3, 'the re-ask continues at the bound');
  assert.ok(bounded.every((gap) =>
    gap === PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS),
  `the delay is bounded at ${PUBLICATION_WRITE_UNSETTLED_MAX_REQUEUE_MS} ms`);
});

test('a wake from outside the held run supersedes the hold at once, and a settled write ends the re-ask and resets the backoff', async (t) => {
  const f = heldWriteOwner();
  t.after(() => f.coordinator.stopOwnerMembershipDriver());
  f.loseAnswers();
  f.coordinator.enqueueClusterMembershipReconcile('witness_first_ask');
  await turns();
  await f.advance(7 * BASE_MS);
  // Held runs at 0, +1 s, +3 s, +7 s: the next re-ask is 8 s away.
  assert.deepEqual(f.runs.map((run) => run.atMs), [0, 1000, 3000, 7000]);

  // An owner wake (any event: a READY node, recovery progress, an election
  // of the publications leader) runs the reconcile now, not at the backstop.
  f.coordinator.enqueueClusterMembershipReconcile('witness_owner_wake');
  await turns();
  assert.equal(f.runs.length, 5, 'the wake ran the held reconcile at once');
  assert.equal(f.runs[4].atMs, 7000);
  assert.equal(f.runs[4].hold,
    MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER);

  // The durable owner answers again: the next re-ask settles the write.
  f.answerAgain();
  f.coordinator.enqueueClusterMembershipReconcile('witness_owner_reachable');
  await turns();
  const settled = f.runs.at(-1);
  assert.equal(settled.settled, true, 'the write settled on the durable row');
  assert.equal(f.store.rows().length, 1, 'admitted exactly once');
  const runsAtSettle = f.runs.length;
  await f.advance(2 * 60 * 1000);
  assert.equal(f.runs.length, runsAtSettle,
    'a settled write re-asks nothing');
  assert.equal(f.reconcileQueue.heldRequeues.size, 0);

  // A later hold starts from the base delay again.
  f.setCandidate({
    publicationKind: 'cluster_membership',
    publicationEpoch: 9,
    publisherNodeId: 'node-1',
    publishedActiveNodeIds: ['node-1', 'node-2'],
    requiredAckNodeIds: ['node-1', 'node-2'],
    acknowledgedNodeIds: [],
    changed: true,
    reasonCode: 'witness',
  });
  f.loseAnswers();
  const before = f.runs.length;
  f.coordinator.enqueueClusterMembershipReconcile('witness_second_hold');
  await turns();
  await f.advance(3 * BASE_MS);
  assert.deepEqual(gaps(f.runs.slice(before)), [1000, 2000],
    'the backoff restarts after a settled write');
});

test('stopping the coordinator cancels a held write\'s pending re-ask', async () => {
  const f = heldWriteOwner();
  f.loseAnswers();
  f.coordinator.enqueueClusterMembershipReconcile('witness_first_ask');
  await turns();
  await f.advance(BASE_MS);
  assert.equal(f.runs.length, 2);
  assert.equal(f.reconcileQueue.heldRequeues.size, 1,
    'a re-ask is pending');
  assert.equal(f.clock._timers.size, 1, 'one timer holds the re-ask');

  f.coordinator.stopOwnerMembershipDriver();
  assert.equal(f.reconcileQueue.heldRequeues.size, 0);
  assert.equal(f.clock._timers.size, 0,
    'no timer of the held write survives the stop');
  await f.advance(2 * 60 * 1000);
  assert.equal(f.runs.length, 2, 'nothing re-asks after the stop');
});
