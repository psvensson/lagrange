// The write kernel below the placement owner's admission fence (record
// placement-owner-tenure-record.md section 4, stop item 1; lead ruling
// 2026-11-21: witness first, the kernel's writer repairs). The owner fences a
// proposal in the synchronous turn that reaches raft.propose; a write the
// consensus port DEFERS (TRANSFER_IN_PROGRESS) is proposed again by the
// kernel after an await (proposeWithinDeferralBudget). A role edge releases
// it (leadership lost); a tenure renewed WITHOUT a role edge does not. The
// property: a placement write decided under one tenure and still queued in
// the kernel when the ledger's tenure is renewed without a role edge is never
// proposed under the renewed tenure (released as on leadership loss, or
// refused typed).
//
// Schedule: the old tenure's admission is deferred once by the port; the
// deficit is then satisfied (the partition's replica count published down to
// its replicas), so the renewed tenure decides nothing for it; the tenure is
// renewed without a role edge; the kernel's retry window runs.
// Fixture: placement-owner-authority-fixture.js (fixture-owned ledger log,
// evidence ceiling stated there); the deferral is the port's typed answer
// (raft-operation-port-constants.js), returned once by the fixture.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {PLACEMENT_ADMIT_TYPE} from '../../src/partition/partition-placement-admission-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {RAFT_LEADERSHIP_TRANSFER_REASON, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  LEDGER, THREE_NODES, attemptOutcomeOf, deferred, holdNextAdmission, startThreeNodeLedger,
  transferReport, waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, holdKernelRetries, resetFixtureSingletons,
  resumeFixtureParticipantAdmission, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const DEFICIT = 'sql_transactions-p1';
const SPEC = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: DEFICIT, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});
// Beyond the kernel's retry delays (10 ms doubling to 100 ms) and well inside
// its 2 s deferral budget's reach: the retry has run by then if it runs.
const RETRY_WINDOW_MS = 1_500;
const DEFERRAL = Object.freeze({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
  recoveryRequired: false, reason: RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS});

// The port defers the node's first admission of the deficit once; every
// other proposal goes to the fixture's ledger log as before.
function deferFirstAdmission(node) {
  const port = node.ledger.controllablePort;
  const logHandler = port.proposeHandler;
  const gate = {reached: deferred(), deferredEntry: null};
  port.setProposeHandler(async (entry) => {
    if (gate.deferredEntry === null && entry.type === PLACEMENT_ADMIT_TYPE &&
        entry.body?.partitionId === DEFICIT) {
      gate.deferredEntry = {entryId: entry.entryId, portTerm: port.term};
      gate.body = entry.body;
      gate.reached.resolve(gate.deferredEntry);
      return DEFERRAL;
    }
    return logHandler(entry);
  });
  return gate;
}

test('kernel: a placement write the port deferred is not proposed under a tenure renewed ' +
  'without a role edge (released as on leadership loss, or refused typed)',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  const gate = deferFirstAdmission(a);
  await world.electLedger(a);
  const first = await gate.reached.promise;
  const decidedUnder = a.ledger.leadershipTenure;
  // The deficit is satisfied before the renewal: the renewed tenure plans
  // nothing for it, so a proposal of the entry under it is the kernel's.
  world.publishRow(TABLES.PARTITIONS, {[COLUMN.PARTITION_ID]: DEFICIT, replica_count: 2});
  world.announceTermWithoutRoleEdge(a);
  assert.notEqual(a.ledger.leadershipTenure, decidedUnder, 'the tenure was renewed');
  const renewedTerm = a.ledger.leadershipTenure.term;
  const attempt = a.probe.admissionAttempts.find((one) => one.entryId === first.entryId);
  try {
    await waitUntil(() => attempt?.answer !== undefined, 'the deferred write is answered',
      RETRY_WINDOW_MS);
  } catch {
    // Still pending after the window: reported below with the proposals.
  }
  await world.idle();
  const proposals = world.log.proposals.filter((proposal) =>
    proposal.entryId === first.entryId);
  const report = JSON.stringify({deferredAt: first, renewedTerm,
    attemptOutcome: attempt ? attemptOutcomeOf(attempt) : 'no-attempt',
    proposals: proposals.map((proposal) => ({portTerm: proposal.portTerm,
      disposition: proposal.stale ? 'stale' : `log[${proposal.logIndex}]`})),
    transfer: transferReport(world, DEFICIT)});
  t.diagnostic(report);
  assert.deepEqual(proposals.filter((proposal) => proposal.portTerm === renewedTerm)
    .map((proposal) => proposal.entryId), [],
  'the write decided under the previous tenure is not proposed under the renewed one ' +
    `(it was deferred at term ${first.portTerm}); ${report}`);
}));

// The status read between the owner's fence and the propose (record
// write-kernel-tenure-fence-record.md section 8): the owner's fence passes under
// the tenure that decided; the kernel's leadership check then reads the ledger
// port's status, and that read runs a consensus turn which announces a renewed
// term (TERM_CHANGE, no role edge). The kernel registers and proposes after the
// read, so a tenure taken at registration is already the renewed one.
// Schedule: the deciding pass is held between its last planning check and the
// admission boundary; the deficit is satisfied (the renewed tenure plans nothing
// for it); the renewal is armed for the kernel's leadership read of that
// admission; the admission is released.
// Executed before the kernel repair (lab kernel-red-0bb5c473): green, and not
// by the kernel. The placement admission checks the participant cutover pause
// AFTER the leadership read (partition-placement-admission.js proposePlacementCommand),
// and that pause's admission proof carries the term
// (partition-participant-transaction-pause.js admissionProofMatchesStatus), so it
// refuses CUTOVER_PAUSED. The kernel's own fence is witnessed where nothing
// else stands after the read: the ordinary write path checks the pause first
// (partition-write-kernel-tenure-fence.test.js, witness g).
test('kernel: a placement write is not proposed under a tenure renewed inside the kernel\'s ' +
  'own leadership read, between the owner\'s fence and the propose (refused, nothing proposed)',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  const held = holdNextAdmission(a);
  await world.electLedger(a);
  const attempt = await held.reached.promise;
  const decidedUnder = a.ledger.leadershipTenure;
  world.publishRow(TABLES.PARTITIONS, {[COLUMN.PARTITION_ID]: DEFICIT, replica_count: 2});
  const renewal = {term: null};
  a.renewInsideKernelLeadershipRead = () => {
    world.announceTermWithoutRoleEdge(a);
    renewal.term = a.ledger.leadershipTenure?.term ?? null;
  };
  held.release.resolve();
  try {
    await waitUntil(() => attempt.answer !== undefined, 'the held admission is answered',
      RETRY_WINDOW_MS);
  } catch {
    // Still pending after the window: reported below with the proposals.
  }
  await world.idle();
  const proposals = world.log.proposals.filter((proposal) =>
    proposal.entryId === attempt.entryId);
  const report = JSON.stringify({decidedUnderTerm: decidedUnder?.term ?? null,
    renewedTerm: renewal.term, attemptOutcome: attemptOutcomeOf(attempt),
    proposals: proposals.map((proposal) => ({portTerm: proposal.portTerm,
      disposition: proposal.stale ? 'stale' : `log[${proposal.logIndex}]`})),
    transfer: transferReport(world, DEFICIT)});
  t.diagnostic(report);
  assert.notEqual(renewal.term, null,
    `premise: the renewal ran inside the kernel's leadership read of the admission; ${report}`);
  assert.notEqual(a.ledger.leadershipTenure, decidedUnder, `premise: the tenure was renewed; ${report}`);
  assert.equal(a.ledger.isLeader, true, `premise: no role edge, the replica still leads; ${report}`);
  assert.deepEqual(proposals.filter((proposal) => proposal.portTerm === renewal.term)
    .map((proposal) => proposal.entryId), [],
  `the admission decided under term ${decidedUnder?.term} is not proposed under the term ` +
    `renewed inside the kernel's leadership read; ${report}`);
}));

// The join of a pending write is a hand-over of its answer (lead ruling
// 2026-11-21; record write-kernel-tenure-fence-record.md section 14). A placement
// admission under the current tenure that arrives while a write with the same
// entryId, registered under an earlier tenure and not yet handed to consensus,
// is still pending must not inherit that write's release: the old write is
// released at the join (LEADERSHIP_LOST, its caller answered once) and the new
// admission is registered and proposed in its own turn.
// Schedule: the old tenure's admission is deferred by the port and its kernel
// retry held, so it is still pending (QUEUED) when the new admission arrives;
// the deficit is satisfied (the new custody plans nothing of its own); the
// tenure is renewed without a role edge and the cutover pause lifted; the same
// admission (entryId and body) arrives at the ledger's admission entry (the
// PLACEMENT_ADMIT route) under the new tenure; then the held retry runs.
const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
test('kernel: a placement admission under the current tenure that would join a pending write ' +
  'of an earlier tenure gets its own proposal in its own turn; the old write\'s caller is ' +
  'released LEADERSHIP_LOST once',
(t) => withPlacementWorld(SPEC, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a] = nodes;
  const retries = holdKernelRetries(a.ledger);
  const gate = deferFirstAdmission(a);
  await world.electLedger(a);
  const first = await gate.reached.promise;
  const decidedUnder = a.ledger.leadershipTenure;
  await waitUntil(() => retries.held.length === 1,
    'premise: the deferred write waits on its held kernel retry');
  world.publishRow(TABLES.PARTITIONS, {[COLUMN.PARTITION_ID]: DEFICIT, replica_count: 2});
  world.announceTermWithoutRoleEdge(a);
  const renewedTerm = a.ledger.leadershipTenure.term;
  await resumeFixtureParticipantAdmission(a.ledger);
  const atRenewedTerm = () => world.log.proposals.filter((proposal) =>
    proposal.entryId === first.entryId && proposal.portTerm === renewedTerm).length;
  const before = atRenewedTerm();
  const joined = track(requestPlacementAdmission(a.ledger,
    {entryId: first.entryId, body: gate.body}));
  const ownProposalInItsTurn = atRenewedTerm() - before;
  try {
    await waitUntil(() => joined.settled, 'the new admission is answered', RETRY_WINDOW_MS);
  } catch {
    // Still pending: reported below.
  }
  const proposalsBeforeOldRetry = atRenewedTerm();
  retries.release();
  await world.idle();
  const oldAttempts = a.probe.admissionAttempts.filter((attempt) =>
    attempt.entryId === first.entryId && attempt.tenure === decidedUnder);
  const facts = {ownProposalInItsTurn, proposalsBeforeOldRetry,
    newAnswerInherited: joined.settled ? joined.value?.failureCode === NOT_LEADER : 'pending',
    oldCallerAnswers: oldAttempts.map((attempt) => attemptOutcomeOf(attempt)),
    queued: a.ledger.proposalQueue.size,
    pendingOutcome: a.ledger.getPendingCommittedWriteOutcome(first.entryId) !== null,
    heldRetries: retries.held.length};
  const report = JSON.stringify({deferredAt: first, renewedTerm, facts,
    newAnswer: joined.settled ? {failureCode: joined.value?.failureCode ?? null,
      outcome: joined.value?.placementResult?.outcome ?? null} : 'pending',
    proposals: world.log.proposals.filter((proposal) => proposal.entryId === first.entryId)
      .map((proposal) => ({portTerm: proposal.portTerm,
        disposition: proposal.stale ? 'stale' : `log[${proposal.logIndex}]`}))});
  t.diagnostic(report);
  assert.deepEqual(facts, {ownProposalInItsTurn: 1, proposalsBeforeOldRetry: 1,
    newAnswerInherited: false, oldCallerAnswers: [NOT_LEADER], queued: 0,
    pendingOutcome: false, heldRetries: 0},
  `the new-tenure admission is its own write; the obsolete one is released once; ${report}`);
}));
