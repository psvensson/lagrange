// P4/P5 at the await points of ReplicaPlacementOwner.runPass the tenure file
// does not cover (placement-owner-authority-tenure.test.js header): A2 (the
// hold release of an engaged ledger move at pass start), A4->A5 (the answer of
// a ledger-class admission, followed by its hold release) and the REMOVE awaits
// of A3 (canAdmitRemove's workflow-owner reads). The owner's binding tenure
// contract (2026-11-21): the captured tenure is checked after every
// asynchronous wait and before every authoritative action, the hold-release
// proposal included; an obsolete continuation does no planning work and
// proposes nothing; the successor progresses without waiting for it.
//
// Fixture: placement-owner-authority-fixture.js (production construction per
// node; fixture-owned ledger log; evidence ceiling stated there). Leader
// identity: follower SERVICES rows plus PARTITIONS leader_node_id. The REMOVE
// witness substitutes the authoritative SERVICES read of the first await
// (the fixture's control-plane read is inert) with the partition's committed
// rows, so the continuation has something to evaluate.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {
  LEDGER, THREE_NODES, admittedOperations, attemptOutcomeOf, boundaryTenureOf, decisionTenureOf,
  holdNextAdmissionAnswer, holdNextCensusRead, holdNextHoldRelease, holdNextRemoveSafetyRows,
  recordRemoveSafetyReads,
  startThreeNodeLedger, transferReport, waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PROGRESS_BOUND_MS = 2_000;
const RELEASED = 'RELEASED';
// The ledger itself under-replicated: a ledger-class ADD (admitted with the
// LEDGER_AWAITING_COPY_IDLE dispatch hold the owner then releases).
const LEDGER_DEFICIT_SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});
const SURPLUS = 'sql_transactions-p1';
// One partition with a voter more than its replication factor: a REMOVE.
const SURPLUS_SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: SURPLUS, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2', 'n3'], replicaCount: 2},
]});

const workAfterTenureEnded = (records, pass) => records.filter((record) =>
  record.pass === pass && record.tenure !== pass.startTenure).length;

function releaseOutcomes(world, node) {
  return world.statementOutcomes(node).filter((outcome) => outcome.entryKey.includes(':release:'))
    .map((outcome) => outcome.result?.outcome ?? null);
}

function releaseReport(nodes) {
  return nodes.map((node) => ({nodeId: node.nodeId,
    releaseAttempts: node.probe.releaseAttempts.map((attempt) => ({
      decisionTenure: decisionTenureOf(attempt)?.term ?? null,
      boundaryTenure: boundaryTenureOf(attempt)?.term ?? null,
      outcome: attemptOutcomeOf(attempt)})),
    passes: node.probe.passes.map((pass) => `${pass.triggers.join('+')}@` +
      `${pass.startTenure?.term ?? 'none'}${pass.done ? '' : ':outstanding'}`),
    snapshot: node.ledger.replicaPlacementOwnerAttachment?.owner?.lastPassSnapshot ?? null}));
}

function reportOf(t, world, nodes, partitionId) {
  const report = {transfer: transferReport(world, partitionId), releases: releaseReport(nodes),
    releaseOutcomes: releaseOutcomes(world, nodes[0])};
  t.diagnostic(JSON.stringify(report));
  return JSON.stringify(report);
}

async function progressedWithin(predicate, label) {
  try {
    await waitUntil(predicate, label, PROGRESS_BOUND_MS);
    return true;
  } catch {
    return false;
  }
}

test('A4->A5: a ledger-class admission answered across A->B->A: the obsolete continuation ' +
  'proposes no hold release; the current tenure releases the hold once, without waiting',
(t) => withPlacementWorld(LEDGER_DEFICIT_SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const answer = holdNextAdmissionAnswer(a);
  await world.electLedger(a);
  const held = await answer.reached.promise;
  assert.equal(attemptOutcomeOf(held), 'ADMITTED', 'the ledger-class move was admitted');
  const firstTenure = held.pass.startTenure;
  await world.electLedger(b, {awaitOwner: false});
  await world.electLedger(a);
  const progressed = await progressedWithin(() =>
    releaseOutcomes(world, a).includes(RELEASED), 'the current tenure releases the hold');
  answer.release.resolve();
  await world.idle();
  const report = reportOf(t, world, nodes, LEDGER);
  assert.equal(admittedOperations(world, b, LEDGER).length, 1, `one admitted move; ${report}`);
  assert.deepEqual(releaseOutcomes(world, a).filter((outcome) => outcome === RELEASED),
    [RELEASED], `the hold is released exactly once; ${report}`);
  const obsolete = a.probe.releaseAttempts.filter((attempt) =>
    decisionTenureOf(attempt) === firstTenure && boundaryTenureOf(attempt) !== firstTenure);
  assert.deepEqual(obsolete.map(attemptOutcomeOf), [],
    'property 1 before A5: no hold-release attempt of the pass decided under the first ' +
    `tenure reaches the boundary under another; ${report}`);
  assert.ok(progressed, 'property 4: the current tenure released the hold within ' +
    `${PROGRESS_BOUND_MS} ms while the obsolete continuation was suspended at A4; ${report}`);
}));

test('A2: a pass suspended in its hold release across a graceful transfer constructs no move ' +
  'and reads no capacity after its tenure ended; the successor releases the hold',
(t) => withPlacementWorld(LEDGER_DEFICIT_SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b, c] = nodes;
  const aRelease = holdNextHoldRelease(a);
  await world.electLedger(a);
  await aRelease.reached.promise;
  const bRelease = holdNextHoldRelease(b);
  await world.electLedger(b);
  const suspended = await bRelease.reached.promise;
  assert.ok(suspended.pass, 'B\'s pass reached its A2 hold release');
  await world.electLedger(c);
  const progressed = await progressedWithin(() =>
    releaseOutcomes(world, c).includes(RELEASED), 'the successor releases the hold');
  bRelease.release.resolve();
  aRelease.release.resolve();
  await world.idle();
  const report = reportOf(t, world, nodes, LEDGER);
  assert.deepEqual(releaseOutcomes(world, c).filter((outcome) => outcome === RELEASED),
    [RELEASED], `the hold is released exactly once; ${report}`);
  assert.notEqual(attemptOutcomeOf(suspended), RELEASED,
    `the obsolete release is not committed; ${report}`);
  assert.equal(workAfterTenureEnded(b.probe.constructions, suspended.pass), 0,
    `property 3: no move construction after the tenure ended during A2; ${report}`);
  assert.equal(workAfterTenureEnded(b.probe.capacityChecks, suspended.pass), 0,
    `property 3: no capacity reads after the tenure ended during A2; ${report}`);
  assert.ok(progressed, `property 4: the successor released the hold; ${report}`);
}));

test('A3 REMOVE: a pass suspended in its first REMOVE admissibility read across a graceful ' +
  'transfer makes no further remove-safety read and no admission attempt after its tenure ended',
(t) => withPlacementWorld(SURPLUS_SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const rows = [...world.durable.get(TABLES.SERVICES).values()]
    .filter((row) => row.partition_id === SURPLUS);
  const reads = recordRemoveSafetyReads(a);
  const held = holdNextRemoveSafetyRows(a, rows);
  await world.electLedger(a);
  await waitUntil(() => held.calls > 0, 'A reached the first await of its REMOVE admissibility');
  const reached = await held.reached.promise;
  assert.ok(reached.pass, 'the read belongs to A\'s pass');
  await world.electLedger(b);
  await world.idle({except: [a]});
  held.release.resolve();
  await world.idle();
  const report = reportOf(t, world, nodes, SURPLUS);
  const stale = reads.filter((read) => read.pass === reached.pass &&
    read.tenure !== reached.pass.startTenure).map((read) => read.read);
  assert.deepEqual(stale, [], 'property 3: no remove-safety read after the tenure ended during ' +
    `the first REMOVE await; ${report}`);
  const obsoleteAttempts = a.probe.admissionAttempts.filter((attempt) =>
    attempt.pass === reached.pass);
  assert.deepEqual(obsoleteAttempts.map(attemptOutcomeOf), [],
    `property 1: the obsolete pass makes no admission attempt; ${report}`);
}));

const DEFICIT_SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: SURPLUS, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});

test('census read: a pass suspended in its census read across a graceful transfer constructs ' +
  'no move and reads no capacity after its tenure ended; the successor admits meanwhile',
(t) => withPlacementWorld(DEFICIT_SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const held = holdNextCensusRead(a);
  await world.electLedger(a);
  const reached = await held.reached.promise;
  await world.electLedger(b);
  await waitUntil(() => admittedOperations(world, b, SURPLUS).length === 1,
    'the successor admits', PROGRESS_BOUND_MS);
  const suspendedWhileMeasured = reached.pass.done === false;
  held.release.resolve();
  await world.idle();
  const report = reportOf(t, world, nodes, SURPLUS);
  assert.ok(suspendedWhileMeasured, `premise: the obsolete pass was outstanding; ${report}`);
  assert.equal(workAfterTenureEnded(a.probe.constructions, reached.pass), 0,
    `no move construction after the tenure ended during the census read; ${report}`);
  assert.equal(workAfterTenureEnded(a.probe.capacityChecks, reached.pass), 0,
    `no capacity reads after the tenure ended during the census read; ${report}`);
}));

test('A3 REMOVE, third read: a pass suspended in its floor read (the policy minimum) across ' +
  'a graceful transfer makes no admission attempt after its tenure ended',
(t) => withPlacementWorld(SURPLUS_SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const rows = [...world.durable.get(TABLES.SERVICES).values()]
    .filter((row) => row.partition_id === SURPLUS);
  const workflowOwner = a.coordinator.workflowOwner;
  const readRows = workflowOwner.getCriticalReplicaRowsForSafety;
  const readMinimum = workflowOwner.getCriticalMinReplicaCount;
  const gate = {reached: null, release: null};
  let releaseFloor;
  const floorReleased = new Promise((resolve) => {
    releaseFloor = resolve;
  });
  let reachedFloor;
  const floorReached = new Promise((resolve) => {
    reachedFloor = resolve;
  });
  workflowOwner.getCriticalReplicaRowsForSafety = async function substitutedRows() {
    workflowOwner.getCriticalReplicaRowsForSafety = readRows;
    return rows.map((row) => ({...row}));
  };
  workflowOwner.getCriticalMinReplicaCount = async function heldMinimum() {
    workflowOwner.getCriticalMinReplicaCount = readMinimum;
    reachedFloor(a.probe.context());
    await floorReleased;
    return 2;
  };
  gate.release = releaseFloor;
  await world.electLedger(a);
  const reached = await floorReached;
  await world.electLedger(b);
  await world.idle({except: [a]});
  const suspendedWhileMeasured = reached.pass?.done === false;
  gate.release();
  await world.idle();
  const report = reportOf(t, world, nodes, SURPLUS);
  assert.ok(suspendedWhileMeasured, `premise: the pass was suspended in its floor read; ${report}`);
  assert.deepEqual(a.probe.admissionAttempts.filter((attempt) => attempt.pass === reached.pass)
    .map(attemptOutcomeOf), [], `no admission attempt after the third REMOVE read; ${report}`);
}));
