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
import {persistUnresolvedPlacementAttempt, reconcilePlacementAttempts} from
  '../../src/rebalancer/replica-placement-owner-attempts.js';
import {NODE, placementStatement} from '../partition/placement-admission-fixture.js';

const ATTEMPTS_SQL = 'SELECT attempt_key FROM _placement_owner_unresolved_attempts ' +
  'ORDER BY attempt_key';

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
    reconcilePlacementAttempts(db, uncertain, []);
    const remaining = ['admit:indices-p1', 'admit:services-p1', 'admit:tables-p1',
      'release:pl-tables-p1-3-0'];
    assert.deepEqual([...uncertain.keys()].sort(), remaining,
      'near-miss records settle nothing; the exact records discharge their attempts');
    assert.deepEqual(db.prepare(ATTEMPTS_SQL).all().map(({attempt_key: key}) => key),
      remaining);
  } finally {
    db.close();
  }
});
