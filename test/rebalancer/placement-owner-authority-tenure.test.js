// P4/P5 (placement-owner proof transfer, priority group 2): ledger leadership
// transfer with an old placement pass in flight, measured against the owner's
// binding tenure contract (2026-11-21):
//  1. no fresh placement decision is authorized by an expired tenure;
//  2. no duplicate admitted operation, capacity allocation or placement effect;
//  3. obsolete planning work and outstanding tasks are bounded, also over N
//     transfers in a row;
//  4. the successor makes progress without waiting for obsolete work.
// Mechanism the contract names (no src here): a tenure token captured by each
// pass and retained by its continuations (A->B->A must find an old token
// expired), checked after asynchronous waits and enforced at the admission
// boundary; the new leader's first pass waits until its term start is
// committed AND locally applied, a barrier that depends on the ledger's own
// consensus progress only. Inherited work (admitted before the transfer, or
// committed before the successor's barrier) keeps its existing identity.
//
// The tenure observed here is the ledger PartitionService's own
// leadershipTenure object (replica-leadership-state.js: minted per leadership
// edge and per term while leading, ended on demotion). The owner does not
// capture it; the fixture records it at the start of each pass and at every
// counted call, so "decision tenure" (pass start) and "boundary tenure"
// (at requestPlacementAdmission) are compared by identity.
//
// Await points of ReplicaPlacementOwner.runPass (replica-placement-owner.js),
// enumerated from the code:
//  A1 reconcileUnresolvedAttemptsOnLeadershipStart -> cdcDelivery
//     .driveCdcObligations(LEADERSHIP_START): since stage 2 (lead ruling 4)
//     REQUESTED and not awaited, so no pass is suspended there; its late
//     answer is witnessed below
//  A2 submitReleaseIfCopyIdle -> submitHoldRelease (only with an engaged
//     ledger dispatch hold)
//  A3 isCandidateAdmissibleNow (a microtask for ADD/REPLACE; canAdmitRemove's
//     three workflow-owner awaits for REMOVE)
//  A4 submitCandidateAdmission -> admitPlacement (the proposal and its commit)
//     and A4' its retained-REFUSED fresh re-admission
//  A5 submitHoldRelease after a ledger-class admission
// Covered here: A3 (the admissibility read, held; re-staged 2026-11-21 from
// A1, lead ruling), the A3/A4 boundary (held between the last per-candidate
// check and requestPlacementAdmission) and A1's late answer. A2, A4->A5 and
// the REMOVE awaits of A3: placement-owner-authority-await-points.test.js.
//
// Fixture: placement-owner-authority-fixture.js (production construction per
// node; controllable consensus with a fixture-owned ledger log; evidence
// ceiling stated there). Leader identity: follower SERVICES rows plus
// PARTITIONS leader_node_id.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {
  LEDGER, THREE_NODES, admittedOperations, attemptOutcomeOf, boundaryTenureOf, decisionTenureOf,
  holdLeadershipStartDrives, holdNextAdmissibilityCheck, holdNextAdmission,
  holdNextLeadershipStartDrive, ownerOf, startThreeNodeLedger, transferReport, waitUntil,
  withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {
  PLACEMENT_ADMIT_TYPE, PLACEMENT_RESULT_FIELD,
} from '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {
  clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const DEFICIT = 'sql_transactions-p1';
const SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: DEFICIT, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});
const PROGRESS_BOUND_MS = 2_000;
// The re-staged witnesses (3, 4, 5, 13) add a second deficit, ordered after
// DEFICIT (a user partition after a priority one), so that work an obsolete
// continuation might still do after its wait is observable.
const SECOND = 'tbl-second-p1';
const SPEC_TWO = Object.freeze({nodes: THREE_NODES, partitions: [...SPEC.partitions,
  {partitionId: SECOND, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']}]});
const STALE_AT_ADMISSIBILITY = 'A3_AFTER_ADMISSIBILITY';

const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
const attemptsOf = (node) => node.probe.admissionAttempts.filter((attempt) =>
  attempt.partitionId === DEFICIT);

// Property 1 at the admission boundary: an attempt whose pass started under
// one tenure and reached requestPlacementAdmission under another.
const expiredTenureAdmissions = (nodes) => nodes.flatMap((node) => attemptsOf(node)
  .filter((attempt) => decisionTenureOf(attempt) !== boundaryTenureOf(attempt) &&
    attemptOutcomeOf(attempt) === 'ADMITTED')
  .map((attempt) => `${node.nodeId}:${attempt.entryId}`));

// Work a pass did after the tenure it started under had ended or changed.
const workAfterTenureEnded = (records) => records.filter((record) =>
  record.pass && record.pass.startTenure !== record.tenure).length;

// The owner creates its local attempt table on first use.
function unresolvedAttemptCount(node) {
  const exists = node.ledger.db.prepare('SELECT COUNT(*) AS c FROM sqlite_master ' +
    'WHERE type = \'table\' AND name = \'_placement_owner_unresolved_attempts\'').get().c;
  return exists === 0 ? 0 : node.ledger.db.prepare(
    'SELECT COUNT(*) AS c FROM _placement_owner_unresolved_attempts').get().c;
}

function reportOf(t, world) {
  const report = transferReport(world, DEFICIT);
  t.diagnostic(JSON.stringify(report));
  return JSON.stringify(report);
}

// Property 2 on every replica: one admitted operation for the deficit, and
// the same one everywhere.
function assertOneAdmitted(world, nodes, report, proposerNodeId) {
  const admitted = nodes.map((node) => admittedOperations(world, node, DEFICIT));
  for (const operations of admitted) {
    assert.equal(operations.length, 1, `exactly one admitted operation per replica; ${report}`);
  }
  assert.equal(new Set(admitted.map((operations) => operations[0].operationId)).size, 1,
    `every replica admitted the same operation; ${report}`);
  if (proposerNodeId) {
    assert.equal(admitted[0][0].proposerNodeId, proposerNodeId,
      `the admitting entry was proposed by ${proposerNodeId}; ${report}`);
  }
  return admitted[0][0];
}

test('P4 delayed notification, deposed leader learns late: the old leader\'s held admission ' +
  'is proposed at its expired term and never admitted; the successor admits without waiting',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const held = holdNextAdmission(a);
  await world.electLedger(a);
  await held.reached.promise;
  const aConstructionsAtTransfer = a.probe.constructions.length;
  await world.electLedger(b, {notifyDeposed: false});
  await world.idle({except: [a]});
  const admittedBeforeRelease = admittedOperations(world, b, DEFICIT);
  held.release.resolve();
  await waitUntil(() => world.log.proposals.some((proposal) => proposal.nodeId === 'n1'),
    'the deposed leader\'s core still proposes');
  world.notifyDeposed(a);
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(admittedBeforeRelease.length, 1,
    `property 4: the successor admitted while the obsolete attempt was outstanding; ${report}`);
  assertOneAdmitted(world, nodes, report, 'n2');
  assert.deepEqual(expiredTenureAdmissions(nodes), [], `property 1; ${report}`);
  const staleProposals = world.log.proposals.filter((proposal) => proposal.stale);
  assert.deepEqual(staleProposals.map((proposal) => proposal.nodeId), ['n1'],
    `rejected work counted apart: the one stale-term proposal of the deposed leader; ${report}`);
  assert.equal(a.probe.constructions.length - aConstructionsAtTransfer, 0,
    `property 3: the deposed leader constructed no move after the group term moved; ${report}`);
  assert.equal(attemptsOf(a).length, 1,
    `property 3 bound: only the admission already past its last check; ${report}`);
}));

test('P4 delayed role event of the new leader: nobody schedules while no owner leads, the old ' +
  'held admission is refused at the boundary, the successor admits once its event arrives',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const held = holdNextAdmission(a);
  await world.electLedger(a);
  await held.reached.promise;
  await world.electLedger(b, {deliverLeaderEvent: false});
  held.release.resolve();
  await world.idle();
  const proposalsWithoutLeader = world.log.proposals.filter((proposal) =>
    proposal.partitionId === DEFICIT).length;
  assert.equal(ownerOf(b).isLeader, false, 'the new leader\'s event has not arrived');
  await world.deliverLeaderEvent(b);
  const started = Date.now();
  await waitUntil(() => admittedOperations(world, b, DEFICIT).length === 1,
    'the successor admits after its role event', PROGRESS_BOUND_MS);
  const elapsedMs = Date.now() - started;
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(proposalsWithoutLeader, 0, `no proposal while no owner leads; ${report}`);
  assert.equal(attemptOutcomeOf(attemptsOf(a)[0]), NOT_LEADER,
    `the old held admission is refused at the boundary (rejected, counted apart); ${report}`);
  assertOneAdmitted(world, nodes, report, 'n2');
  assert.deepEqual(expiredTenureAdmissions(nodes), [], `property 1; ${report}`);
  assert.ok(elapsedMs < PROGRESS_BOUND_MS, `property 4: ${elapsedMs} ms; ${report}`);
}));

test('P4 pass suspended at A3 (its admissibility read) across a graceful transfer: the ' +
  'successor admits while it is suspended; the obsolete pass checks its tenure after the wait',
(t) => withPlacementWorld(SPEC_TWO, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const held = holdNextAdmissibilityCheck(a);
  await world.electLedger(a);
  const reached = await held.reached.promise;
  await world.electLedger(b);
  await world.idle({except: [a]});
  const admittedWhileSuspended = admittedOperations(world, b, DEFICIT).length;
  const suspendedWhileMeasured = reached.pass.done === false;
  held.release.resolve();
  await world.idle();
  const report = reportOf(t, world);
  assert.ok(suspendedWhileMeasured, `premise: the obsolete pass was outstanding; ${report}`);
  assert.equal(a.probe.admissionAttempts.filter((attempt) => attempt.pass === reached.pass)
    .length, 0, `no admission attempt of any candidate by the obsolete pass; ${report}`);
  assert.equal(admittedWhileSuspended, 1, `property 4; ${report}`);
  assertOneAdmitted(world, nodes, report, 'n2');
  assert.deepEqual(expiredTenureAdmissions(nodes), [], `property 1; ${report}`);
  assert.equal(attemptsOf(a).length, 0, `no admission attempt by the obsolete pass; ${report}`);
  // The contract: the captured tenure is checked after asynchronous waits.
  // Held at A3, the pass constructed and read capacity under its live tenure
  // before the wait; nothing of either may follow the wait.
  assert.equal(workAfterTenureEnded(a.probe.constructions), 0,
    `property 3: no move construction after the tenure ended during A3; ${report}`);
  assert.equal(workAfterTenureEnded(a.probe.capacityChecks), 0,
    `property 3: no capacity reads after the tenure ended during A3; ${report}`);
}));

async function heldAcrossABA(world, holdAt) {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const gate = holdAt === 'A3' ? holdNextAdmissibilityCheck(a) : holdNextAdmission(a);
  await world.electLedger(a);
  const reached = await gate.reached.promise;
  const firstTenure = a.ledger.leadershipTenure;
  // B is elected and deposed again before its activation holdoff ends: B's
  // owner never leads, so the deficit is still open when A leads again.
  await world.electLedger(b, {awaitOwner: false});
  await world.electLedger(a);
  assert.equal(b.probe.passes.length, 0, 'B\'s owner never ran a pass');
  assert.notEqual(a.ledger.leadershipTenure, firstTenure,
    'A leads again under a new tenure (a new leadershipTenure object)');
  return {nodes, a, b, gate, firstTenure, heldPass: reached.pass};
}

test('P5 A->B->A with an old continuation held at A3 across both changes: the old pass ' +
  'must find its tenure expired and admit nothing', (t) => withPlacementWorld(SPEC_TWO,
  async (world) => {
    const {nodes, a, gate, firstTenure, heldPass} = await heldAcrossABA(world, 'A3');
    await waitUntil(() => admittedOperations(world, a, DEFICIT).length === 1,
      'the later tenure admits', PROGRESS_BOUND_MS);
    const suspendedWhileMeasured = heldPass.done === false;
    const staleStops = () => ownerOf(a).observation.totals.staleStops[STALE_AT_ADMISSIBILITY] ?? 0;
    const staleBefore = staleStops();
    gate.release.resolve();
    await world.idle();
    const report = reportOf(t, world);
    assert.ok(suspendedWhileMeasured, `premise: the first tenure's pass was outstanding; ${report}`);
    assertOneAdmitted(world, nodes, report, 'n1');
    const admitting = attemptsOf(a).find((attempt) => attemptOutcomeOf(attempt) === 'ADMITTED');
    assert.equal(decisionTenureOf(admitting), a.ledger.leadershipTenure,
      `the admission's deciding tenure is the current one; ${report}`);
    assert.equal(staleStops() - staleBefore, 1,
      `the old pass is refused by tenure identity on the same node; ${report}`);
    assert.equal(a.probe.admissionAttempts.filter((attempt) => attempt.pass === heldPass)
      .length, 0, `the old pass attempts no candidate; ${report}`);
    const oldPassAttempts = attemptsOf(a).filter((attempt) =>
      decisionTenureOf(attempt) === firstTenure);
    assert.deepEqual(expiredTenureAdmissions(nodes), [],
      'property 1: the pass started under the first tenure admits nothing under the second ' +
      `(old-pass attempts: ${oldPassAttempts.length}); ${report}`);
  }));

test('P5 A->B->A: the successor tenure progresses while the obsolete continuation is still ' +
  'suspended at A3', (t) => withPlacementWorld(SPEC_TWO, async (world) => {
  const {nodes, a, gate, heldPass} = await heldAcrossABA(world, 'A3');
  const currentTenure = a.ledger.leadershipTenure;
  let progressed = false;
  try {
    await waitUntil(() => admittedOperations(world, a, DEFICIT).length === 1 &&
      heldPass.done === false,
    'the current tenure admits while the obsolete pass is suspended', PROGRESS_BOUND_MS);
    progressed = true;
  } catch {
    progressed = false;
  }
  const currentTenurePasses = a.probe.passes.filter((pass) => pass.startTenure === currentTenure);
  gate.release.resolve();
  await world.idle();
  const report = reportOf(t, world);
  assertOneAdmitted(world, nodes, report, 'n1');
  assert.ok(progressed, `property 4: the current tenure admitted within ${PROGRESS_BOUND_MS} ms ` +
    'while the obsolete continuation stayed suspended (passes started under the current ' +
    `tenure meanwhile: ${currentTenurePasses.length}); ${report}`);
}));

test('P5 admission boundary fence: tenure lost and regained (A->B->A) between the last ' +
  'planning check and requestPlacementAdmission => not admitted', (t) => withPlacementWorld(SPEC,
  async (world) => {
    const {nodes, a, gate} = await heldAcrossABA(world, 'boundary');
    gate.release.resolve();
    await world.idle();
    const report = reportOf(t, world);
    assertOneAdmitted(world, nodes, report);
    const held = attemptsOf(a).find((attempt) => attempt.held);
    assert.ok(held, `the held attempt reached the boundary; ${report}`);
    assert.notEqual(attemptOutcomeOf(held), 'ADMITTED',
      'property 1 at the admission boundary: decided under the first tenure, it must not be ' +
      `admitted under the second; ${report}`);
  }));

test('P4 admission boundary fence, graceful transfer: the held admission of a deposed leader ' +
  'is refused NOT_LEADER and counted apart; the successor admits', (t) => withPlacementWorld(SPEC,
  async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [a, b] = nodes;
    const held = holdNextAdmission(a);
    await world.electLedger(a);
    await held.reached.promise;
    await world.electLedger(b);
    held.release.resolve();
    await world.idle();
    const report = reportOf(t, world);
    assertOneAdmitted(world, nodes, report, 'n2');
    assert.equal(attemptOutcomeOf(attemptsOf(a)[0]), NOT_LEADER, report);
    assert.equal(world.log.proposals.filter((proposal) => proposal.nodeId === 'n1').length, 0,
      `the refused attempt never reached consensus; ${report}`);
    assert.deepEqual(expiredTenureAdmissions(nodes), [], `property 1; ${report}`);
  }));

test('P4 term-start barrier: a predecessor entry committed but not yet applied on the new ' +
  'leader is inherited under its identity; the new leader must not plan before applying it',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  world.log.hold(b);
  await world.electLedger(a);
  await world.idle();
  const inherited = admittedOperations(world, a, DEFICIT);
  assert.equal(inherited.length, 1, 'the predecessor\'s entry committed (applied on n1, n3)');
  assert.equal(admittedOperations(world, b, DEFICIT).length, 0, 'not yet applied on n2');
  await world.electLedger(b);
  await world.idle({except: [b]});
  const appliedOnBBeforeItsProposals = world.log.applied.get(b);
  world.log.release(b);
  await world.idle();
  const report = reportOf(t, world);
  const admitted = assertOneAdmitted(world, nodes, report, 'n1');
  assert.equal(admitted.entryId, inherited[0].entryId,
    `the inherited operation keeps its admitting entry, never recreated; ${report}`);
  const refused = attemptsOf(b).filter((attempt) => attemptOutcomeOf(attempt) !== 'ADMITTED');
  assert.equal(attemptsOf(b).length, 0,
    'barrier: the new leader planned and proposed for a deficit already admitted by a ' +
    `committed entry it had not applied (applied ${appliedOnBBeforeItsProposals} of ` +
    `${world.log.entries.length} log entries; refused attempts counted apart: ` +
    `${refused.length}); ${report}`);
}));

test('P4/P8 term-start barrier does not depend on publication: the ledger leader\'s ' +
  'publication never reaches the other nodes, the new leader still admits', (t) =>
  withPlacementWorld(SPEC, async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [, b, c] = nodes;
    world.publicationHeld = true;
    await world.electLedger(b);
    await world.idle();
    const report = reportOf(t, world);
    for (const node of [nodes[0], c]) {
      assert.equal(node.cache.get('partitions', LEDGER)?.leader_node_id ?? null, null,
        `${node.nodeId}'s cache names no ledger leader (publication stalled)`);
    }
    assertOneAdmitted(world, nodes, report, 'n2');
  }));

test('P5 A->B->A with a lost response: the committed entry is recovered under its existing ' +
  'identity, never re-proposed or recreated', (t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  world.log.hold(a);
  await world.electLedger(a);
  await waitUntil(() => world.log.proposals.some((proposal) => proposal.nodeId === 'n1'),
    'A proposed');
  await world.electLedger(b);
  await world.idle({except: [a]});
  world.log.release(a);
  await world.electLedger(a);
  await world.idle();
  const report = reportOf(t, world);
  const admitted = assertOneAdmitted(world, nodes, report, 'n1');
  const aProposals = world.log.proposals.filter((proposal) => proposal.nodeId === 'n1' &&
    proposal.partitionId === DEFICIT);
  assert.equal(aProposals.length, 1, `no re-proposal after the lost response; ${report}`);
  assert.equal(admitted.entryId, aProposals[0].entryId, `inherited identity; ${report}`);
  assert.equal(attemptsOf(b).length, 0, `the interim leader saw the committed row; ${report}`);
  assert.equal(unresolvedAttemptCount(a), 0, `the retained attempt was reconciled away; ${report}`);
}));

test('P5 new term without a role edge: a pass decided under the previous tenure must not be ' +
  'admitted under the new one; the new tenure gets its own leadership start',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  const held = holdNextAdmission(a);
  await world.electLedger(a);
  await held.reached.promise;
  const firstTenure = a.ledger.leadershipTenure;
  world.announceTermWithoutRoleEdge(a);
  assert.notEqual(a.ledger.leadershipTenure, firstTenure,
    'the ledger service minted a new tenure for the new term (production behaviour)');
  assert.equal(ownerOf(a).isLeader, true, 'no role edge reached the owner');
  // The new term raises the participant cutover pause (lab run 1 at 79391996:
  // the held attempt was answered partition_write_cutover_paused). The
  // release recovery resumes it, as the replica handler's recovery queue does,
  // before the held continuation reaches the boundary: the adversarial order.
  await resumeFixtureParticipantAdmission(a.ledger);
  held.release.resolve();
  await world.idle();
  const report = reportOf(t, world);
  assertOneAdmitted(world, nodes, report, 'n1');
  const leadershipStarts = a.probe.passes.filter((pass) =>
    pass.triggers.includes('LEADERSHIP_START'));
  assert.deepEqual(expiredTenureAdmissions(nodes), [],
    `property 1: decided under term ${firstTenure.term}, admitted under ` +
    `term ${a.ledger.leadershipTenure.term}; ${report}`);
  assert.equal(leadershipStarts.length, 2,
    `one leadership start (reconciliation, barrier) per tenure; ${report}`);
}));

// Found in lab run 1 at 79391996b (barrier and lost-response schedules): an
// idle leader's demotion clears its own local leader projection in its cache
// (clearReplicaLeaderUpdateState -> clearLocalCanonicalLeaderNodeIdIfOwned)
// before the rebalancer sink lowers the owner's boolean; the apply event
// starts a PARTITIONS_CHANGED pass on the deposed owner with no tenure.
test('P4 graceful transfer of an idle leader: its demotion starts no placement pass on the ' +
  'deposed owner', (t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  await world.electLedger(a);
  await world.idle();
  const passesBefore = a.probe.passes.length;
  await world.electLedger(b);
  await world.idle();
  const report = reportOf(t, world);
  assertOneAdmitted(world, nodes, report, 'n1');
  const afterDemotion = a.probe.passes.slice(passesBefore).map((pass) => ({
    triggers: pass.triggers.join('+'), startTenure: pass.startTenure?.term ?? null,
    ownerIsLeaderAtStart: pass.ownerIsLeader}));
  const staleWork = {constructions: workAfterTenureEnded(a.probe.constructions) +
    a.probe.constructions.filter((record) => record.pass?.startTenure === null).length,
  capacityChecks: workAfterTenureEnded(a.probe.capacityChecks) +
    a.probe.capacityChecks.filter((record) => record.pass?.startTenure === null).length};
  assert.deepEqual(afterDemotion, [], 'properties 1 and 3: no pass starts on the deposed owner ' +
    `after its tenure ended (stale work counted: ${JSON.stringify(staleWork)}); ${report}`);
}));

function outstandingWork(nodes) {
  return {
    inFlightPasses: nodes.reduce((sum, node) => sum + node.probe.inFlight, 0),
    pendingTriggers: nodes.reduce((sum, node) => sum + ownerOf(node).pendingTriggers.size, 0),
    pendingWrites: nodes.reduce((sum, node) => sum + node.ledger.pendingWriteOutcomes.size, 0),
    unresolvedAttempts: nodes.reduce((sum, node) => sum + unresolvedAttemptCount(node), 0),
    timers: process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length,
  };
}

// Re-staged 2026-11-21 (lead ruling, verifier): A1 is no longer awaited, so a
// pass is suspended at every transfer at an await that exists: the leader's
// admission of DEFICIT is proposed and never committed (the fixture's log
// drops it), so the pass waits at A4 until the role edge releases the write
// (LEADERSHIP_LOST). The bound at head, asserted: after each role-edge
// transfer exactly one pass and one write are outstanding (the current
// custody's); every obsolete pass has ended (released at the edge).
test('P4 bound over repeated transfers: N transfers, each leaving the leader\'s pass ' +
  'suspended, do not accumulate obsolete passes, triggers, writes, attempts or timers',
(t) => withPlacementWorld(SPEC_TWO, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const gates = [holdLeadershipStartDrives(a), holdLeadershipStartDrives(b)];
  const samples = [];
  const timerCensus = [];
  const suspended = [];
  try {
    for (let transfer = 1; transfer <= 6; transfer += 1) {
      const next = transfer % 2 === 1 ? a : b;
      world.log.dropNext = (node, entry) => node === next &&
        entry.type === PLACEMENT_ADMIT_TYPE && entry.body?.partitionId === DEFICIT;
      await world.electLedger(next);
      await waitUntil(() => world.log.proposals.some((proposal) => proposal.dropped &&
        proposal.nodeId === next.nodeId && proposal.groupTerm === world.log.term),
      `transfer ${transfer}: the leader's pass is suspended at its admission answer`);
      await world.idle({except: nodes});
      suspended.push({transfer, leaderPassOutstanding: next.probe.passes.some((pass) =>
        pass.startTenure === next.ledger.leadershipTenure && pass.done === false),
      obsoleteOutstanding: nodes.filter((node) => node !== next).reduce((sum, node) =>
        sum + node.probe.inFlight, 0)});
      samples.push({transfer, ...outstandingWork(nodes),
        heldDrives: gates.reduce((sum, gate) => sum + gate.calls, 0),
        admitted: admittedOperations(world, a, DEFICIT).length});
      timerCensus.push({transfer, timers: world.timers.aliveCreators()});
    }
  } finally {
    world.log.dropNext = null;
    for (const gate of gates) gate.releaseAll();
  }
  // One more transfer, not dropped: the deficit is admitted.
  await world.electLedger(a);
  await waitUntil(() => admittedOperations(world, a, DEFICIT).length === 1, 'admitted at last');
  await world.idle();
  t.diagnostic(JSON.stringify(suspended));
  const atEveryTransfer = 'premise and bound at every transfer: the leader\'s pass is ' +
    'suspended, no obsolete pass is outstanding; ';
  assert.ok(suspended.every((sample) => sample.leaderPassOutstanding &&
    sample.obsoleteOutstanding === 0), `${atEveryTransfer}${JSON.stringify(suspended)}`);
  const oneEach = 'bound: one outstanding pass and one outstanding write at every transfer; ';
  assert.ok(samples.every((sample) => sample.inFlightPasses === 1 &&
    sample.pendingWrites === 1), `${oneEach}${JSON.stringify(samples)}`);
  const report = reportOf(t, world);
  t.diagnostic(JSON.stringify(samples));
  t.diagnostic(`timer census (src creators of the ref'd timers alive after each transfer): ${
    JSON.stringify(timerCensus)}`);
  // Steady state from transfer 3 on (each owner then holds one suspended pass
  // and, while it leads, one queued LEADERSHIP_START): compare equal parity,
  // transfer k with k + 2.
  for (const [earlier, later] of [[samples[2], samples[4]], [samples[3], samples[5]]]) {
    for (const field of ['inFlightPasses', 'pendingTriggers', 'pendingWrites',
      'unresolvedAttempts', 'heldDrives']) {
      assert.ok(later[field] <= earlier[field],
        `property 3: ${field} does not grow with N (after ${earlier.transfer}: ` +
        `${earlier[field]}, after ${later.transfer}: ${later[field]}); samples ` +
        `${JSON.stringify(samples)}; ${report}`);
    }
  }
  // Timers (re-staged 2026-11-21, lead ruling): attributed by creation site.
  // A timer is the placement owner's when a frame of a
  // src/rebalancer/replica-placement-owner* module is on its synchronous
  // creation stack (fixture aliveCreators, 64 frames). Not seen: a timer a
  // collaborator arms later, after an await, on the owner's behalf (its stack
  // starts at the collaborator's continuation), and unref'd timers.
  // (a) the placement owner's live timers are the same number after every
  // transfer;
  const ownerTimers = timerCensus.map(({transfer, timers}) => ({transfer,
    count: timers.filter((timer) => timer.placementOwner).length}));
  assert.ok(ownerTimers.every(({count}) => count === ownerTimers[0].count),
    `property 3: the placement owner's timers do not grow with N; ${
      JSON.stringify(ownerTimers)}; ${JSON.stringify(timerCensus)}; ${report}`);
  // (b) the whole live timer set is constant from the transfer after the
  // deficit was admitted (its operation's own workflow timers start there)
  // through the last transfer, so nothing else grows with N either.
  const firstAdmitted = samples.findIndex((sample) => sample.admitted > 0);
  const window = timerCensus.slice(firstAdmitted < 0 ? 2 : firstAdmitted + 1);
  assert.ok(window.length >= 2, `property 3: at least two transfers follow the admission; ${
    JSON.stringify(samples)}; ${report}`);
  assert.ok(window.every(({timers}) => timers.length === window[0].timers.length),
    `property 3: the live timer set does not grow with N after the admission (from transfer ${
      window[0].transfer}); ${JSON.stringify(timerCensus)}; ${report}`);
  assertOneAdmitted(world, nodes, report);
}));

// A1 since stage 2: the leadership-start pass requests the ledger's CDC drive
// and does not wait for it. Its answer may arrive after the custody ended; it
// must act on nothing (no pass, no attempt on the deposed owner).
test('A1 request answered late: a leadership-start CDC drive answered after the custody ' +
  'ended starts nothing on the deposed owner', (t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const drive = holdNextLeadershipStartDrive(a);
  await world.electLedger(a);
  await drive.reached.promise;
  await world.idle();
  await world.electLedger(b);
  await world.idle();
  const passesBefore = a.probe.passes.length;
  const attemptsBefore = a.probe.admissionAttempts.length;
  drive.release.resolve();
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(a.probe.passes.length, passesBefore,
    `the late drive answer starts no pass on the deposed owner; ${report}`);
  assert.equal(a.probe.admissionAttempts.length, attemptsBefore,
    `the late drive answer makes no admission attempt; ${report}`);
  assertOneAdmitted(world, nodes, report);
}));

// Corrective round 2, item 4 (verifier N5): record row 2c (the retained-
// REFUSED re-admission, A4') has a schedule. A's admission E of the deficit
// is dropped (proposed, never committed); B is elected and deposed inside its
// holdoff, so E's write is released and E stays retained; A leads again and
// its pass is held at A3 while an admission of the same partition commits
// through the entry that carries no tenure (requestPlacementAdmission on A's
// ledger); released, the pass re-proposes E, the applier answers REFUSED
// PARTITION_BUSY, and the pass proposes a fresh attempt F (A4'); F is dropped
// and A transfers to B: F's write is released and the pass, its tenure ended
// across A4', stops at A4R_AFTER_READMISSION and admits nothing.
test('A4\' retained-REFUSED re-admission across a transfer: the pass whose tenure ended ' +
  'across the fresh proposal stops at A4R_AFTER_READMISSION and admits nothing; one ' +
  'admission of the deficit in total', (t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  const owner = ownerOf(a);
  const attemptKey = `admit:${DEFICIT}`;
  const dropped = [];
  const dropFromA = (except = null) => {
    world.log.dropNext = (node, entry) => {
      const drop = node === a && entry.body?.partitionId === DEFICIT && entry.entryId !== except;
      if (drop) dropped.push(entry.entryId);
      return drop;
    };
  };
  dropFromA();
  await world.electLedger(a);
  await waitUntil(() => dropped.length === 1, 'A proposed E and it was dropped');
  const retainedE = owner.uncertainEntryIds.get(attemptKey);
  const gate = holdNextAdmissibilityCheck(a);
  await world.electLedger(b, {awaitOwner: false});
  await world.electLedger(a);
  await gate.reached.promise;
  assert.equal(b.probe.passes.length, 0, 'premise: B\'s owner never ran a pass');
  assert.equal(owner.uncertainEntryIds.get(attemptKey)?.entryId, retainedE?.entryId,
    'premise: E stays retained across A->B->A (never committed)');
  // The competing admission through the tenure-less entry, committed while
  // A's pass is held at A3.
  const competing = await requestPlacementAdmission(a.ledger, {
    entryId: `fixture:competing:${DEFICIT}`, body: retainedE.body});
  assert.equal(competing?.[PLACEMENT_RESULT_FIELD]?.outcome, 'ADMITTED',
    `premise: the competing admission committed; ${JSON.stringify(competing)}`);
  dropFromA(retainedE.entryId);
  const staleBefore = owner.observation.totals.staleStops.A4R_AFTER_READMISSION ?? 0;
  gate.release.resolve();
  await waitUntil(() => dropped.length === 2, 'A proposed the fresh attempt F and it was dropped');
  const reproposedE = world.log.proposals.filter((proposal) =>
    proposal.entryId === retainedE.entryId);
  await world.electLedger(b);
  await world.idle();
  const report = JSON.stringify({dropped, reproposedE: reproposedE.length,
    staleStops: owner.observation.totals.staleStops, transfer: transferReport(world, DEFICIT)});
  t.diagnostic(report);
  assert.equal(reproposedE.length, 2, `premise: E was proposed again after A3; ${report}`);
  const outcomeOfE = attemptsOf(a).filter((attempt) => attempt.entryId === retainedE.entryId)
    .map(attemptOutcomeOf);
  assert.ok(outcomeOfE.includes('REFUSED'),
    `premise: E's re-proposal was answered REFUSED (the partition is busy); ${report}`);
  assert.notEqual(dropped[1], retainedE.entryId, `premise: F is a fresh entry; ${report}`);
  assert.equal((owner.observation.totals.staleStops.A4R_AFTER_READMISSION ?? 0) - staleBefore, 1,
    `the pass stops at the A4' checkpoint (its tenure ended across F); ${report}`);
  for (const node of nodes) {
    assert.equal(admittedOperations(world, node, DEFICIT).length, 1,
      `${node.nodeId}: one admission of the deficit (the competing one); ${report}`);
  }
}));
