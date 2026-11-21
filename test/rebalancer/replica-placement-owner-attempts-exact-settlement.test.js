// Exact settlement of the placement owner's durable unresolved attempts
// (replica-placement-owner-attempts.js reconcilePlacementAttempts): an
// outcome record under an attempt's entry settles (discharges) that attempt
// only when it carries the attempt's own command identity (its kind's command
// type and its canonical body). A record of an SQL statement, of another
// placement command, or of another command type under the same entry key is a
// near miss and settles nothing: the attempt stays durable and unresolved.
//
// REAL: the outcome owner's table and recorder, the placement command's
// canonical identity, the attempt store. No services (no census rows).
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {test} from 'node:test';
import {createCommittedStatementOutcomeTable, recordCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {committedCommandDigest} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY} from
  '../../src/partition/partition-service-constants.js';
import {placementBodyDigestOf} from
  '../../src/partition/partition-placement-admission-command.js';
import {PLACEMENT_ADMIT_TYPE, PLACEMENT_RELEASE_HOLD_TYPE} from
  '../../src/partition/partition-placement-admission-constants.js';
import {PLACEMENT_ATTEMPT_STATE, createBlockedPlacementAttempts,
  persistUnresolvedPlacementAttempt, reconcilePlacementAttempts} from
  '../../src/rebalancer/replica-placement-owner-attempts.js';
import {PARTITION_COMMITTED_RECORD_CLASS as RECORD_CLASS} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {NODE, placementStatement} from '../partition/placement-admission-fixture.js';

const ATTEMPTS_SQL = 'SELECT attempt_key FROM _placement_owner_unresolved_attempts ' +
  'ORDER BY attempt_key';
const SILENT_LOGGER = Object.freeze({warn() {}});
const blockedOf = (blocked) => Object.fromEntries(blocked.list().map((state) =>
  [state.attemptKey, `${state.state}:${state.recordClass}`]));
const blockedAs = (recordClass) =>
  `${PLACEMENT_ATTEMPT_STATE.BLOCKED_ON_KEY_COLLISION}:${recordClass}`;

function attemptOf(attemptKey, entryId, body) {
  return {attemptKey, intentKey: attemptKey, entryId, body, bodyText: JSON.stringify(body)};
}

function recordAt(db, entryId, index, fields) {
  recordCommittedStatementOutcome({db}, {entryKey: `entry:${entryId}`,
    outcome: APPLY.APPLIED, index, term: 1, ...fields});
}

function ownerRecordAt(db, entryId, index, commandDigest) {
  recordAt(db, entryId, index, {result: {changes: 1, lastInsertRowid: null},
    ownerResultText: '{"outcome":"ADMITTED","operationIds":[]}', commandDigest});
}

test('an unresolved attempt is discharged only by the record of its exact command', () => {
  const db = new Database(':memory:');
  try {
    createCommittedStatementOutcomeTable(db);
    const admitBody = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const otherBody = placementStatement({partitionId: 'tables-p1', target: NODE.C});
    const releaseBody = Object.freeze({operationId: 'pl-tables-p1-3-0'});
    const attempts = [
      attemptOf('admit:tables-p1', 'e-sql', admitBody),
      attemptOf('admit:indices-p1', 'e-other-body', admitBody),
      attemptOf('release:pl-tables-p1-3-0', 'e-other-type', releaseBody),
      attemptOf('admit:config-p1', 'e-exact-admit', admitBody),
      attemptOf('release:pl-config-p1-4-0', 'e-exact-release', releaseBody),
      attemptOf('admit:services-p1', 'e-unsettled', admitBody),
    ];
    for (const attempt of attempts) persistUnresolvedPlacementAttempt(db, attempt);
    // Near misses under the attempts' own entry keys.
    recordAt(db, 'e-sql', 1, {result: {changes: 0, lastInsertRowid: null}});
    ownerRecordAt(db, 'e-other-body', 2, placementBodyDigestOf(PLACEMENT_ADMIT_TYPE, otherBody));
    ownerRecordAt(db, 'e-other-type', 3,
      committedCommandDigest(PLACEMENT_ADMIT_TYPE, JSON.stringify(releaseBody)));
    // The exact commands' records.
    ownerRecordAt(db, 'e-exact-admit', 4, placementBodyDigestOf(PLACEMENT_ADMIT_TYPE, admitBody));
    ownerRecordAt(db, 'e-exact-release', 5,
      placementBodyDigestOf(PLACEMENT_RELEASE_HOLD_TYPE, releaseBody));

    const uncertain = new Map();
    const blocked = createBlockedPlacementAttempts(SILENT_LOGGER);
    reconcilePlacementAttempts(db, uncertain, blocked);
    const remaining = ['admit:indices-p1', 'admit:services-p1', 'admit:tables-p1',
      'release:pl-tables-p1-3-0'];
    assert.deepEqual([...uncertain.keys()].sort(), remaining,
      'near-miss records settle nothing; the exact records discharge their attempts');
    assert.deepEqual(db.prepare(ATTEMPTS_SQL).all().map(({attempt_key: key}) => key),
      remaining);
    assert.deepEqual(blockedOf(blocked), {
      'admit:tables-p1': blockedAs(RECORD_CLASS.STATEMENT),
      'admit:indices-p1': blockedAs(RECORD_CLASS.OWNER_COMMAND),
      'release:pl-tables-p1-3-0': blockedAs(RECORD_CLASS.OWNER_COMMAND),
    }, 'every kept near miss is visible blocked work; the unsettled one is not');
  } finally {
    db.close();
  }
});

// The ledger census carries no command identity: a replica_operations row
// names only the entryId its admission ran under, and a hold's state says
// nothing about which release command (if any) settled. A census row is
// therefore never a settlement of an attempt; only the attempt's exact
// outcome record is.
test('the ledger census never discharges an attempt: a row under its entry id from ' +
  'another command, or a released hold, is not its exact record', () => {
  const db = new Database(':memory:');
  try {
    createCommittedStatementOutcomeTable(db);
    const admitBody = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const otherBody = placementStatement({partitionId: 'tables-p1', target: NODE.C});
    const releaseBody = Object.freeze({operationId: 'pl-tables-p1-3-0'});
    persistUnresolvedPlacementAttempt(db, attemptOf('admit:tables-p1', 'e-census-admit',
      admitBody));
    persistUnresolvedPlacementAttempt(db, attemptOf('release:pl-tables-p1-3-0',
      'e-census-release', releaseBody));
    // Another placement command committed under the admit attempt's entry and
    // its ledger row names that entry id; the release attempt never settled.
    ownerRecordAt(db, 'e-census-admit', 1,
      placementBodyDigestOf(PLACEMENT_ADMIT_TYPE, otherBody));
    // The ledger census (a row naming 'e-census-admit', the release's hold no
    // longer engaged) is no input to settlement at all: only the exact record.
    const uncertain = new Map();
    const blocked = createBlockedPlacementAttempts(SILENT_LOGGER);
    reconcilePlacementAttempts(db, uncertain, blocked);
    assert.deepEqual([...uncertain.keys()].sort(),
      ['admit:tables-p1', 'release:pl-tables-p1-3-0'],
      'a census row is never the exact record of an attempt');
    assert.equal(db.prepare(ATTEMPTS_SQL).all().length, 2);
    assert.deepEqual(blockedOf(blocked),
      {'admit:tables-p1': blockedAs(RECORD_CLASS.OWNER_COMMAND)},
      'the colliding admit is blocked work; the unsettled release is not');
  } finally {
    db.close();
  }
});
