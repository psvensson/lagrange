// The term-start barrier of the placement owner (record sections 5 and 22):
// its wake, its negative, the production definition of the fact it reads, and
// the drain that the barrier's status read must not double.
//
// The fact read: the ledger port's status `currentTermApplied`, read while the
// custody's term start is PENDING and latched on the first true read. The
// fixture's port models the production definition
// (raft-rs-status-observation.js: leader and appliedTerm === term), so a
// configuration change the leader applied at its own term satisfies the
// barrier on a quiet ledger (placement-owner-authority-fixture.js, LedgerLog).
// Fixture evidence ceiling: the ledger log is the fixture's, not rs-raft.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RAFT_EVENT} from '../../src/raft/constants.js';
import {PLACEMENT_TRIGGER} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  LEDGER, THREE_NODES, admittedOperations, ownerOf, startThreeNodeLedger, transferReport,
  waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const DEFICIT = 'sql_transactions-p1';
const SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: DEFICIT, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});
const PROGRESS_BOUND_MS = 3_000;
const QUIET_MS = 500;
const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

function reportOf(t, world, node) {
  const report = JSON.stringify({transfer: transferReport(world, DEFICIT),
    snapshot: ownerOf(node)?.lastPassSnapshot ?? null});
  t.diagnostic(report);
  return report;
}

test('barrier wake: a custody whose term start is not applied plans nothing and names the ' +
  'wait; applied progress alone starts its first planning pass, which admits',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [, b] = nodes;
  b.termStartWithheld = true;
  await world.electLedger(b);
  await world.idle();
  await quiet();
  await world.idle();
  const waiting = ownerOf(b).lastPassSnapshot;
  const constructionsWhileWaiting = b.probe.constructions.length;
  const passesWhileWaiting = b.probe.passes.length;
  b.termStartWithheld = false;
  b.ledger.controllablePort.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
  let admitted = true;
  try {
    await waitUntil(() => admittedOperations(world, b, DEFICIT).length === 1,
      'admitted after the barrier opened', PROGRESS_BOUND_MS);
  } catch {
    admitted = false;
  }
  await world.idle();
  const report = reportOf(t, world, b);
  assert.ok(passesWhileWaiting >= 1, `the custody's passes ran and stopped; ${report}`);
  assert.equal(constructionsWhileWaiting, 0, `no planning before the barrier; ${report}`);
  assert.equal(waiting?.stoppedAt, 'TERM_START_BARRIER',
    `the snapshot names the barrier wait; ${report}`);
  const firstPlanning = b.probe.passes.find((pass) =>
    b.probe.constructions.some((record) => record.pass === pass));
  assert.ok(firstPlanning?.triggers.includes(PLACEMENT_TRIGGER.TERM_START_APPLIED),
    `the first planning pass was woken by applied progress; ${report}`);
  assert.equal(b.probe.constructions.filter((record) => record.pass === firstPlanning).length, 1,
    `demand and admission share one partition input read in the first planning pass; ${report}`);
  assert.ok(admitted, `the successor admitted after the barrier opened; ${report}`);
}));

test('barrier and the production definition: a custody that begins while the last applied ' +
  'ledger entry is the leader\'s configuration change on a quiet ledger must still start ' +
  'its first planning pass', (t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  // The configuration change applies inside the activation holdoff, before
  // the owner's custody begins (verifier finding 1, interleaving b).
  await world.electLedger(a, {awaitOwner: false});
  world.log.appendConfigurationChange(a);
  await waitUntil(() => ownerOf(a)?.isLeader === true, 'the owner activated');
  let admitted = true;
  try {
    await waitUntil(() => admittedOperations(world, a, DEFICIT).length === 1,
      'the first planning pass admits', PROGRESS_BOUND_MS);
  } catch {
    admitted = false;
  }
  await world.idle();
  const report = reportOf(t, world, a);
  assert.ok(admitted, 'the custody started planning on a quiet ledger whose last applied ' +
    'entry is its configuration change (currentTermApplied is appliedTerm === term, so the ' +
    `barrier opens without waiting for another entry); ${report}`);
}));

test('drain start: a status read that announces applied progress inside the first pass\'s ' +
  'barrier does not start a second drain of the same custody',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  a.statusWakeAtNextPass = true;
  await world.electLedger(a);
  await world.idle();
  const report = reportOf(t, world, a);
  assert.equal(a.statusReadWake, false, `the barrier read announced the wake; ${report}`);
  assert.equal(a.probe.maxInFlight, 1,
    `one pass of the custody at a time (max in flight ${a.probe.maxInFlight}); ${report}`);
  assert.equal(admittedOperations(world, a, DEFICIT).length, 1, report);
}));

// Corrective round 2, item 5: the barrier's status read is foreign code (it
// may run a consensus turn). A custody that ends inside that read (here the
// leadership sink re-driven false then true inside it: the old custody ends,
// a new custody of the same tenure begins) must not be used past the barrier
// by the pass that latched it: that pass stops stale at the barrier, before
// its census read, its leadership-start CDC drive request and its attempt
// reconciliation. Fails if the re-check after the latch is removed (the
// obsolete pass then reads its census and reconciles under the ended custody
// and stops at AFTER_CENSUS). Reachability in production stays INFERRED
// (record section 23 and the verifier: near-unreachable); the schedule is the
// fixture's.
test('barrier re-check: a custody that ended inside the barrier\'s status read is not used ' +
  'past the barrier; the new custody admits once', (t) => withPlacementWorld(SPEC,
  async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [a] = nodes;
    const owner = ownerOf(a);
    const censusReads = [];
    const readPassCensus = owner.readPassCensus;
    owner.readPassCensus = function recordedCensusRead(pass) {
      censusReads.push({current: this.isPassCurrent(pass), sequence: pass.sequence});
      return readPassCensus.call(this, pass);
    };
    let endedCustody = null;
    a.statusHookAtNextPass = () => {
      endedCustody = owner.custody;
      owner.setLeader(false);
      owner.setLeader(true);
    };
    await world.electLedger(a);
    await waitUntil(() => admittedOperations(world, a, DEFICIT).length === 1,
      'the new custody admits', PROGRESS_BOUND_MS);
    await world.idle();
    const report = JSON.stringify({censusReads, staleStops: owner.observation.totals.staleStops,
      endedReconciled: endedCustody?.reconciled ?? null, snapshot: owner.lastPassSnapshot});
    t.diagnostic(report);
    assert.ok(endedCustody !== null && endedCustody !== owner.custody,
      `premise: the custody ended inside the barrier's status read; ${report}`);
    assert.equal(owner.observation.totals.staleStops.TERM_START_BARRIER, 1,
      `the pass that latched the barrier stops stale at its re-check; ${report}`);
    assert.deepEqual(censusReads.filter((read) => !read.current), [],
      `no census read by a pass whose custody ended; ${report}`);
    assert.equal(endedCustody.reconciled, false,
      `no attempt reconciliation under the ended custody; ${report}`);
    assert.equal(admittedOperations(world, a, DEFICIT).length, 1, report);
  }));
