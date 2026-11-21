// The persisted format of the native placement admission owner's settled
// outcome (partition-placement-admission.js; the row lives in the shared
// _partition_statement_outcomes table under the entry key `entry:<entryId>`).
//
// 1. A current-format record WITHOUT a command fingerprint that another owner
//    wrote under the same entry key (an applied SQL statement whose result
//    retains no insert rowid; a deterministic statement failure, which
//    retains no result at all) is never classified as an old placement
//    format: it is the same-entry/different-command collision, answered and
//    applied exactly like a fingerprint mismatch.
// 2. An old-format placement row (outcome text, no command fingerprint, as
//    written by 73c06f635..0970ab012) is decided once, at the persisted-format
//    boundary: opening the store refuses it typed, and the hot replay path
//    never classifies it per request.
//
// REAL: the replica_operations-p1 PartitionService on a file-backed SQLite
// database, its initialization, committed apply path and statement outcome
// rows. DOUBLE: the consensus port (the test commits the leader's proposals).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY} from
  '../../src/partition/partition-service-constants.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_ADMIT_TYPE, PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {buildPlacementCommand} from
  '../../src/partition/partition-placement-admission-command.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_OUTCOME} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {applyCommitted, clearFixtureSingletons, durableAppliedIndex,
  resetFixtureSingletons, shutdownAll, startLeader, temporaryDbPath} from
  '../test-helpers/participant-transaction-fixture.js';
import {LEDGER_PARTITION_ID, NODE, admitOnLeader, commitLedgerStatement, ledgerRows,
  onLedgerLeader, placementStatement} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];
const recordOf = (leader, entryId) =>
  readCommittedStatementOutcome(leader, leader.getCommittedEntryKey({entryId}));
// The exact pre-fingerprint representation 73c06f635..0970ab012 wrote: the
// owner result text, no retained result and no command fingerprint.
const PRE_FINGERPRINT_SQL = 'UPDATE _partition_statement_outcomes ' +
  'SET changes = NULL, last_insert_rowid = NULL WHERE entry_key = ?';

// Request, then commit, a placement command under an entryId whose record
// another owner already settled: both must be the collision (BYTES), as for
// a fingerprint mismatch (placement-admission-apply.test.js F5/P4).
async function assertForeignRecordIsCollision(leader, proposed, entryId, body) {
  const record = recordOf(leader, entryId);
  assert.equal(record.state, 'settled');
  assert.equal(record.lastInsertRowid, null, 'precondition: the record has no fingerprint');
  assert.equal(record.ownerResultText, undefined, 'precondition: another owner wrote it');
  const rowsBefore = ledgerRows(leader);
  const proposals = proposed.length;
  const requested = await requestPlacementAdmission(leader, {entryId, body});
  assert.equal(proposed.length, proposals);
  assert.notEqual(requested.failureCode, PLACEMENT_ADMISSION_ERROR.OUTCOME_IDENTITY_UNAVAILABLE,
    `a current-format ${record.outcome} record of another owner is classified as an old ` +
    'placement outcome format');
  assert.equal(requested.failureCode, PLACEMENT_ADMISSION_ERROR.BYTES);
  const appliedBefore = durableAppliedIndex(leader);
  const committed = buildPlacementCommand(leader, {type: PLACEMENT_ADMIT_TYPE, entryId, body});
  assert.equal(applyCommitted(leader, committed), PLACEMENT_ADMISSION_ERROR.BYTES,
    'a committed placement command is never consumed as an old-format identity debt');
  assert.equal(durableAppliedIndex(leader), appliedBefore);
  assert.deepEqual(recordOf(leader, entryId), record);
  assert.deepEqual(ledgerRows(leader), rowsBefore);
}

test('a current-format applied SQL record without an insert rowid under the same entry ' +
  'key is the collision, never an old placement format', () =>
  onLedgerLeader(async (leader, proposed) => {
    const entryId = 'shared-key-applied';
    assert.equal(commitLedgerStatement(leader, entryId,
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?', [1, 'none']), null);
    assert.equal(recordOf(leader, entryId).outcome, APPLY.APPLIED);
    await assertForeignRecordIsCollision(leader, proposed, entryId,
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  }));

test('a current-format statement-failure record (no result) under the same entry key is ' +
  'the collision, never an old placement format', () =>
  onLedgerLeader(async (leader, proposed) => {
    const seed = await admitOnLeader(leader, proposed, 'shared-key-seed',
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
    const [operationId] = resultOf(seed.answer).operationIds;
    const entryId = 'shared-key-failed';
    assert.equal(commitLedgerStatement(leader, entryId,
      'UPDATE replica_operations SET type = NULL WHERE operation_id = ?', [operationId]), null);
    const failed = recordOf(leader, entryId);
    assert.equal(failed.outcome, APPLY.STATEMENT_FAILED);
    assert.equal(failed.changes, null);
    await assertForeignRecordIsCollision(leader, proposed, entryId,
      placementStatement({partitionId: 'indices-p1', target: NODE.C}));
  }));

test('an old-format placement outcome row is refused typed when its store opens; the hot ' +
  'replay path never classifies it per request', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const ledger = {tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    schema: REPLICA_OPERATIONS_SCHEMA, dbPath};
  const entryId = 'old-format-e0';
  const body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
  try {
    await onLedgerLeader(async (leader, proposed) => {
      const admitted = await admitOnLeader(leader, proposed, entryId, body);
      assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
      leader.db.prepare(PRE_FINGERPRINT_SQL).run(leader.getCommittedEntryKey({entryId}));
      assert.equal(recordOf(leader, entryId).lastInsertRowid, null);
      assert.equal(typeof recordOf(leader, entryId).ownerResultText, 'string');
    }, {dbPath});
    let reopened = null;
    let refusal = null;
    try {
      reopened = await startLeader(ledger, LEDGER_PARTITION_ID);
    } catch (error) {
      refusal = error;
    }
    try {
      if (reopened !== null) {
        const answer = await requestPlacementAdmission(reopened.leader, {entryId, body});
        assert.fail('the store opened with a placement outcome row that carries no command ' +
          `identity; the hot path then answers ${answer.failureCode ?? 'a receipt'} ` +
          `(clearing-trigger row: ${Object.hasOwn(PLACEMENT_CLEARING_TRIGGER,
            answer.failureCode)})`);
      }
      assert.equal(typeof refusal?.code, 'string', `untyped open refusal: ${refusal}`);
      assert.notEqual(refusal.code.length, 0);
    } finally {
      if (reopened !== null) await shutdownAll(reopened.leader);
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
