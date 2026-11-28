#!/usr/bin/env node
/**
 * Probe of quest transaction-redundant-progress-writes: the number of unmet
 * properties of the coordinator's write discipline, measured in process
 * (the real SQLQueryEngine and coordinator over the coordinator-table
 * gateway double and a participant ledger double; nothing is started, no
 * network or cluster is used).
 *
 * Removal properties (unmet while the two progress writes exist):
 *   1 no ACTIVE sql_transaction_participants row is written;
 *   2 no `status = PREPARED` write on sql_transactions;
 *   3 no participant row precedes the first PREPARE delivery;
 *   4 coordinator-table writes: 8 (one-table COMMIT), 11 (two-table COMMIT),
 *     7 (one-table ROLLBACK).
 * Preservation properties (met today; the removal may not take them away):
 *   5 every participant is in the manifest before its first request;
 *   6 PREPARE evidence of every participant precedes the decision, the
 *     decision precedes fanout, the transaction settles COMMITTED;
 *   7 restart before PREPARE (with and without participant rows) ends in
 *     one bound ROLLBACK for every manifest member;
 *   8 restart before the decision ends in COMMIT with complete evidence and
 *     in ROLLBACK with partial evidence;
 *   9 restart after the decision ends in the recorded COMMIT;
 *  10 a live in-doubt decision is adopted by the sweep through the commit
 *     path and reported completed.
 *
 * --metric prints the count (target 0); --json prints the failures.
 */
import assert from 'node:assert/strict';
import {
  countOf,
  isDecisionWrite,
  isManifestFreezeWrite,
  measureWriteTransaction,
  nthParticipantRowWrite,
  participantDeliveryOf,
  runCrashScenario,
  runLiveInDoubtSweepScenario,
  timelinePositionsOf,
} from '../../test/query/transaction-progress-write-witness-support.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayEvery = Function.call.bind(Array.prototype.every);

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
const ERROR_IN_DOUBT = 'TRANSACTION_DECISION_IN_DOUBT';
const LABEL_ACTIVE_ROW = 'participantRow:ACTIVE';
const LABEL_PREPARED_STATUS = 'status:PREPARED';
const ONE_TABLE = Object.freeze(['users']);
const TWO_TABLES = Object.freeze(['users', 'orders']);
const PROPERTY = Object.freeze({
  ACTIVE_ROW_ABSENT: 'active-participant-row-absent',
  PREPARED_STATUS_ABSENT: 'prepared-status-write-absent',
  ROWS_START_AT_PREPARE: 'participant-rows-start-at-prepare',
  WRITE_COUNTS: 'coordinator-write-counts',
  MANIFEST_FIRST: 'manifest-precedes-participant-requests',
  EVIDENCE_FIRST: 'prepare-evidence-precedes-decision',
  RECOVERY_BEFORE_PREPARE: 'recovery-before-prepare',
  RECOVERY_BEFORE_DECISION: 'recovery-before-decision',
  RECOVERY_AFTER_DECISION: 'recovery-after-decision',
  LIVE_IN_DOUBT_SWEEP: 'live-in-doubt-sweep-commit-path',
});
const TARGET_WRITES = Object.freeze({
  ONE_TABLE_COMMIT: 8,
  TWO_TABLE_COMMIT: 11,
  ONE_TABLE_ROLLBACK: 7,
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

function settled(recovery, decision) {
  const status = decision === DECISION_COMMIT ? STATUS_COMMITTED :
    STATUS_ROLLED_BACK;
  assert.equal(recovery.replay.failed, ZERO);
  assert.equal(recovery.decision, decision);
  assert.equal(recovery.status, status);
  assert.deepEqual(recovery.participantRowStatuses, [status, status]);
  assert.deepEqual(recovery.participantDecisions, [[decision], [decision]]);
  assert.deepEqual(recovery.orphanedSessions, []);
  assert.deepEqual(recovery.violations, []);
}

function checkActiveRowAbsent(cases) {
  assertAllSucceeded(cases);
  for (const facts of Object.values(cases)) {
    assert.equal(countOf(facts.labels, LABEL_ACTIVE_ROW), ZERO);
  }
}

function checkPreparedStatusAbsent(cases) {
  assertAllSucceeded(cases);
  assert.equal(countOf(cases.oneCommit.labels, LABEL_PREPARED_STATUS), ZERO);
  assert.equal(countOf(cases.twoCommit.labels, LABEL_PREPARED_STATUS), ZERO);
}

function checkParticipantRowsStartAtPrepare(cases) {
  const positions = timelinePositionsOf(cases.twoCommit.timeline);
  assert.equal(positions.prepares.length, TWO);
  const firstPrepare = Math.min(...positions.prepares);
  assert.deepEqual(arrayFilter(positions.participantRows,
    (index) => index < firstPrepare), []);
}

function checkCoordinatorWriteCounts(cases) {
  assert.equal(cases.oneCommit.mutationCount, TARGET_WRITES.ONE_TABLE_COMMIT);
  assert.equal(cases.twoCommit.mutationCount, TARGET_WRITES.TWO_TABLE_COMMIT);
  assert.equal(cases.oneRollback.mutationCount,
    TARGET_WRITES.ONE_TABLE_ROLLBACK);
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
  assert.ok(arrayEvery(facts.participantRows, (row) =>
    row.status === STATUS_COMMITTED));
  assert.deepEqual(facts.violations, []);
}

async function checkRecoveryBeforePrepare() {
  for (const withoutParticipantRows of [false, true]) {
    const facts = await runCrashScenario({tables: TWO_TABLES,
      mutationHold: isManifestFreezeWrite, pastDeadline: true,
      withoutParticipantRows});
    assert.equal(facts.stopped, true);
    assert.equal(facts.atStop.participantSetState, SET_STATE_OPEN);
    settled(facts.recovery, DECISION_ROLLBACK);
  }
}

async function checkRecoveryBeforeDecision() {
  const complete = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: isDecisionWrite, pastDeadline: true});
  assert.equal(complete.stopped, true);
  assert.equal(complete.atStop.participantSetState, SET_STATE_FROZEN);
  settled(complete.recovery, DECISION_COMMIT);
  const partial = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: nthParticipantRowWrite(STATUS_PREPARED, TWO),
    pastDeadline: true});
  assert.equal(partial.stopped, true);
  settled(partial.recovery, DECISION_ROLLBACK);
}

async function checkRecoveryAfterDecision() {
  const facts = await runCrashScenario({tables: TWO_TABLES,
    deliveryHold: participantDeliveryOf(DECISION_COMMIT)});
  assert.equal(facts.stopped, true);
  assert.equal(facts.atStop.decision, DECISION_COMMIT);
  settled(facts.recovery, DECISION_COMMIT);
}

async function checkLiveInDoubtSweep() {
  const facts = await runLiveInDoubtSweepScenario({tables: TWO_TABLES});
  assert.equal(facts.answer.errorCode, ERROR_IN_DOUBT);
  assert.equal(facts.answer.commitPointReached, true);
  assert.deepEqual(arrayMap(facts.sweep, (entry) =>
    [entry.path, entry.success, entry.statusAfter]),
  [[DECISION_COMMIT, true, STATUS_COMMITTED]]);
  assert.equal(facts.final.status, STATUS_COMMITTED);
  assert.deepEqual(facts.final.violations, []);
}

async function runAllChecks() {
  const cases = await measuredCases();
  const checks = [
    [PROPERTY.ACTIVE_ROW_ABSENT, () => checkActiveRowAbsent(cases)],
    [PROPERTY.PREPARED_STATUS_ABSENT, () => checkPreparedStatusAbsent(cases)],
    [PROPERTY.ROWS_START_AT_PREPARE,
      () => checkParticipantRowsStartAtPrepare(cases)],
    [PROPERTY.WRITE_COUNTS, () => checkCoordinatorWriteCounts(cases)],
    [PROPERTY.MANIFEST_FIRST, () => checkManifestPrecedesRequests(cases)],
    [PROPERTY.EVIDENCE_FIRST, () => checkEvidenceBeforeDecision(cases)],
    [PROPERTY.RECOVERY_BEFORE_PREPARE, checkRecoveryBeforePrepare],
    [PROPERTY.RECOVERY_BEFORE_DECISION, checkRecoveryBeforeDecision],
    [PROPERTY.RECOVERY_AFTER_DECISION, checkRecoveryAfterDecision],
    [PROPERTY.LIVE_IN_DOUBT_SWEEP, checkLiveInDoubtSweep],
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
