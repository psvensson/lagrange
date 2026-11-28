#!/usr/bin/env node
/**
 * Probe of quest transaction-redundant-progress-writes (removal of the ACTIVE
 * participant row written at the first write to each table): the number of
 * unmet properties, measured in process. The real SQLQueryEngine and
 * coordinator run over the coordinator-table gateway double, with the
 * participant ledger double and, for property 5, a real participant
 * PartitionService of the TX1 participant fixture on its controllable
 * consensus port. Nothing is started; no network or cluster is used.
 *
 * Removal properties (unmet while the ACTIVE row is written); counted on
 * purposes, never on absolute write totals:
 *   1 no sql_transaction_participants write precedes the first PREPARE;
 *   2 participant-admission submissions equal the manifest changes;
 *   3 each participant's rows are its PREPARE evidence and its settlement.
 * Preservation properties (met today; the removal may not take them away):
 *   4 one BEGIN per participant across repeated writes, a read promoted to
 *     a write, and an AUTHORITATIVE enlistment followed by writes;
 *   5 a participant that lost its session is not begun again: the write is
 *     refused, the transaction rolls back with nothing applied;
 *   6 every participant is in the manifest before its first request;
 *   7 PREPARE evidence precedes the decision, which precedes fanout;
 *   8 restart after the manifest append, BEGIN not delivered: tombstone;
 *   9 restart before PREPARE (with and without participant rows): ROLLBACK;
 *  10 restart before the decision: COMMIT with complete evidence, ROLLBACK
 *     with partial evidence;
 *  11 restart after the decision: the recorded COMMIT.
 *
 * --metric prints the count (target 0); --json prints the failures.
 */
import assert from 'node:assert/strict';
import {
  BEGIN_GATE_SCENARIO,
  isDecisionWrite,
  isManifestFreezeWrite,
  measureBeginGate,
  measureWriteTransaction,
  nthParticipantRowWrite,
  participantDeliveryOf,
  runBeginNotDeliveredCrashScenario,
  runCrashScenario,
  runParticipantSessionLossScenario,
  timelinePositionsOf,
} from '../../test/query/transaction-progress-write-witness-support.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const ARGV_OFFSET = 2;
const JSON_INDENT = 2;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const NEWLINE = '\n';
const FAIL_PREFIX = 'FAIL ';
const COLON_SPACE = ': ';
const PASS_LINE = 'transaction-redundant-progress-writes-guard: PASS\n';

const FINISH_COMMIT = 'COMMIT';
const FINISH_ROLLBACK = 'ROLLBACK';
const DECISION_COMMIT = 'COMMIT';
const DECISION_ROLLBACK = 'ROLLBACK';
const STATUS_COMMITTED = 'COMMITTED';
const STATUS_ROLLED_BACK = 'ROLLED_BACK';
const STATUS_PREPARED = 'PREPARED';
const SET_STATE_OPEN = 'OPEN';
const SET_STATE_FROZEN = 'FROZEN';
const REFUSAL_NOT_ACTIVE = 'participant_transaction_not_active';
const PARTITION_ONE = 'p1';
const PARTITION_TWO = 'p2';
const ONE_TABLE = Object.freeze(['users']);
const TWO_TABLES = Object.freeze(['users', 'orders']);
const COMMIT_ROWS = Object.freeze([STATUS_PREPARED, STATUS_COMMITTED]);
const ROLLBACK_ROWS = Object.freeze([STATUS_ROLLED_BACK]);
const PROPERTY = Object.freeze({
  ROWS_START_AT_PREPARE: 'participant-rows-start-at-prepare',
  ADMISSION_EQUALS_MANIFEST: 'admission-submissions-equal-manifest-changes',
  ROWS_ARE_EVIDENCE_AND_SETTLEMENT: 'participant-rows-are-evidence-and-settlement',
  ONE_BEGIN_PER_PARTICIPANT: 'one-begin-per-participant',
  SESSION_LOSS_NOT_REOPENED: 'lost-session-not-reopened-by-begin',
  MANIFEST_FIRST: 'manifest-precedes-participant-requests',
  EVIDENCE_FIRST: 'prepare-evidence-precedes-decision',
  RECOVERY_BEGIN_NOT_DELIVERED: 'recovery-begin-not-delivered',
  RECOVERY_BEFORE_PREPARE: 'recovery-before-prepare',
  RECOVERY_BEFORE_DECISION: 'recovery-before-decision',
  RECOVERY_AFTER_DECISION: 'recovery-after-decision',
});

async function measuredCases() {
  return {
    oneCommit: await measureWriteTransaction({tables: ONE_TABLE,
      finish: FINISH_COMMIT}),
    twoCommit: await measureWriteTransaction({tables: TWO_TABLES,
      finish: FINISH_COMMIT}),
    oneRollback: await measureWriteTransaction({tables: ONE_TABLE,
      finish: FINISH_ROLLBACK}),
  };
}

function assertAllSucceeded(cases) {
  for (const facts of Object.values(cases)) {
    assert.equal(facts.success, true);
  }
}

function settled(recovery, decision, participants) {
  const status = decision === DECISION_COMMIT ? STATUS_COMMITTED :
    STATUS_ROLLED_BACK;
  assert.equal(recovery.replay.failed, ZERO);
  assert.equal(recovery.decision, decision);
  assert.equal(recovery.status, status);
  assert.deepEqual(recovery.participantRowStatuses,
    Array.from({length: participants}, () => status));
  assert.deepEqual(recovery.participantDecisions,
    Array.from({length: participants}, () => [decision]));
  assert.deepEqual(recovery.orphanedSessions, []);
  assert.deepEqual(recovery.violations, []);
}

function checkRowsStartAtPrepare(cases) {
  const positions = timelinePositionsOf(cases.twoCommit.timeline);
  assert.equal(positions.prepares.length, TWO);
  const firstPrepare = Math.min(...positions.prepares);
  assert.deepEqual(arrayFilter(positions.participantRows,
    (index) => index < firstPrepare), []);
}

function checkAdmissionEqualsManifestChanges(cases) {
  assertAllSucceeded(cases);
  for (const facts of [cases.oneCommit, cases.twoCommit, cases.oneRollback]) {
    assert.ok(facts.admission.manifestChanges > ZERO);
    assert.equal(facts.admission.submissions, facts.admission.manifestChanges);
  }
}

function checkRowsAreEvidenceAndSettlement(cases) {
  assertAllSucceeded(cases);
  assert.deepEqual(cases.oneCommit.participantRowsByPartition,
    {[PARTITION_ONE]: COMMIT_ROWS});
  assert.deepEqual(cases.twoCommit.participantRowsByPartition,
    {[PARTITION_ONE]: COMMIT_ROWS, [PARTITION_TWO]: COMMIT_ROWS});
  assert.deepEqual(cases.oneRollback.participantRowsByPartition,
    {[PARTITION_ONE]: ROLLBACK_ROWS});
}

async function checkOneBeginPerParticipant() {
  for (const scenario of Object.values(BEGIN_GATE_SCENARIO)) {
    const facts = await measureBeginGate(scenario);
    assert.deepEqual(facts.beginsByPartition, {[PARTITION_ONE]: ONE},
      scenario);
    assert.equal(facts.committed, true, scenario);
  }
}

async function checkLostSessionNotReopened() {
  const facts = await runParticipantSessionLossScenario();
  assert.equal(facts.begins, ONE);
  assert.equal(facts.beginsAfterLoss, ZERO);
  assert.deepEqual(facts.statements, [true, true, false]);
  assert.equal(facts.refusalAfterLoss, REFUSAL_NOT_ACTIVE);
  assert.equal(facts.rolledBack, true);
  assert.equal(facts.appliedRows, ZERO);
  assert.equal(facts.row.decision, DECISION_ROLLBACK);
}

function checkManifestPrecedesRequests(cases) {
  const positions = timelinePositionsOf(cases.twoCommit.timeline);
  assert.equal(positions.begins.length, TWO);
  assert.equal(positions.manifestAppends.length, TWO);
  for (const [index, beginAt] of positions.begins.entries()) {
    assert.ok(positions.manifestAppends[index] < beginAt);
  }
}

function checkEvidenceBeforeDecision(cases) {
  const facts = cases.twoCommit;
  const positions = timelinePositionsOf(facts.timeline);
  assert.equal(positions.preparedRows.length, TWO);
  assert.equal(positions.decisions.length, ONE);
  assert.ok(Math.max(...positions.preparedRows) < positions.decisions[ZERO]);
  assert.ok(positions.decisions[ZERO] < Math.min(...positions.commits));
  assert.equal(facts.row?.status, STATUS_COMMITTED);
  assert.deepEqual(facts.violations, []);
}

async function checkRecoveryBeginNotDelivered() {
  const facts = await runBeginNotDeliveredCrashScenario({tables: TWO_TABLES});
  assert.equal(facts.stopped, true);
  assert.equal(facts.atStop.participantSetState, SET_STATE_OPEN);
  assert.deepEqual(facts.begins, [ZERO]);
  settled(facts.recovery, DECISION_ROLLBACK, ONE);
}

async function checkRecoveryBeforePrepare() {
  for (const withoutParticipantRows of [false, true]) {
    const facts = await runCrashScenario({tables: TWO_TABLES,
      mutationHold: isManifestFreezeWrite, pastDeadline: true,
      withoutParticipantRows});
    assert.equal(facts.stopped, true);
    assert.equal(facts.atStop.participantSetState, SET_STATE_OPEN);
    settled(facts.recovery, DECISION_ROLLBACK, TWO);
  }
}

async function checkRecoveryBeforeDecision() {
  const complete = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: isDecisionWrite, pastDeadline: true});
  assert.equal(complete.stopped, true);
  assert.equal(complete.atStop.participantSetState, SET_STATE_FROZEN);
  settled(complete.recovery, DECISION_COMMIT, TWO);
  const partial = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: nthParticipantRowWrite(STATUS_PREPARED, TWO),
    pastDeadline: true});
  assert.equal(partial.stopped, true);
  settled(partial.recovery, DECISION_ROLLBACK, TWO);
}

async function checkRecoveryAfterDecision() {
  const facts = await runCrashScenario({tables: TWO_TABLES,
    deliveryHold: participantDeliveryOf(DECISION_COMMIT)});
  assert.equal(facts.stopped, true);
  assert.equal(facts.atStop.decision, DECISION_COMMIT);
  settled(facts.recovery, DECISION_COMMIT, TWO);
}

async function runAllChecks() {
  const cases = await measuredCases();
  const checks = [
    [PROPERTY.ROWS_START_AT_PREPARE, () => checkRowsStartAtPrepare(cases)],
    [PROPERTY.ADMISSION_EQUALS_MANIFEST,
      () => checkAdmissionEqualsManifestChanges(cases)],
    [PROPERTY.ROWS_ARE_EVIDENCE_AND_SETTLEMENT,
      () => checkRowsAreEvidenceAndSettlement(cases)],
    [PROPERTY.ONE_BEGIN_PER_PARTICIPANT, checkOneBeginPerParticipant],
    [PROPERTY.SESSION_LOSS_NOT_REOPENED, checkLostSessionNotReopened],
    [PROPERTY.MANIFEST_FIRST, () => checkManifestPrecedesRequests(cases)],
    [PROPERTY.EVIDENCE_FIRST, () => checkEvidenceBeforeDecision(cases)],
    [PROPERTY.RECOVERY_BEGIN_NOT_DELIVERED, checkRecoveryBeginNotDelivered],
    [PROPERTY.RECOVERY_BEFORE_PREPARE, checkRecoveryBeforePrepare],
    [PROPERTY.RECOVERY_BEFORE_DECISION, checkRecoveryBeforeDecision],
    [PROPERTY.RECOVERY_AFTER_DECISION, checkRecoveryAfterDecision],
  ];
  const failedChecks = [];
  for (const [name, check] of checks) {
    try {
      await check();
    } catch (error) {
      failedChecks.push({name, error: error?.message || String(error)});
    }
  }
  return {failures: failedChecks, metric: failedChecks.length};
}

const args = process.argv.slice(ARGV_OFFSET);
const outcome = await runAllChecks();
const exitCode = outcome.metric === ZERO ? ZERO : ONE;
if (arrayIncludes(args, METRIC_FLAG)) {
  process.stdout.write(`${outcome.metric}${NEWLINE}`);
  process.exit(exitCode);
}
if (arrayIncludes(args, JSON_FLAG)) {
  process.stdout.write(`${JSON.stringify(outcome, null, JSON_INDENT)}${NEWLINE}`);
  process.exit(exitCode);
}
for (const failure of outcome.failures) {
  process.stderr.write(`${FAIL_PREFIX}${failure.name}${COLON_SPACE}` +
    `${failure.error}${NEWLINE}`);
}
if (exitCode === ZERO) {
  process.stdout.write(PASS_LINE);
}
process.exit(exitCode);
