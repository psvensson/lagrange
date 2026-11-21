// The persisted format of the native placement admission owner's settled
// outcome (partition-placement-admission.js; the row lives in the shared
// _partition_statement_outcomes table under the entry key `entry:<entryId>`,
// and carries the outcome owner's command identity in `command_digest`).
//
// 1. A current-format record WITHOUT the command's identity that another owner
//    wrote under the same entry key (an applied SQL statement; a deterministic
//    statement failure, which retains no result at all) never settles the
//    placement command: it is the same-entry collision, at request and at
//    apply, exactly like another placement command's record.
// 2. A store whose outcome table has another format - the one every released
//    build (v0.2.6..v0.4.0) and every development build before the identity
//    column created, including the pre-fingerprint placement rows of
//    73c06f635..0970ab012 - is decided once, at store open: refused typed,
//    read-only, never migrated, never given a column.
// 3. An owner result is recorded only with its identity: the outcome owner's
//    recorder and the table's CHECK refuse either without the other.
//
// REAL: the replica_operations-p1 PartitionService on a file-backed SQLite
// database, its initialization, committed apply path and statement outcome
// rows. DOUBLE: the consensus port (the test commits the leader's proposals).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
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
import {createCommittedStatementOutcomeTable, readCommittedStatementOutcome,
  recordCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_COLUMNS,
  PARTITION_COMMITTED_STATEMENT_ERROR_CODE as OUTCOME_ERROR} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {PLACEMENT_OUTCOME} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {applyCommitted, clearFixtureSingletons, durableAppliedIndex,
  resetFixtureSingletons, shutdownAll, startLeader, temporaryDbPath} from
  '../test-helpers/participant-transaction-fixture.js';
import {LEDGER_PARTITION_ID, NODE, admitOnLeader, commitLedgerStatement, ledgerRows,
  onLedgerLeader, placementStatement} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const OUTCOMES = '_partition_statement_outcomes';
const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];
const recordOf = (leader, entryId) =>
  readCommittedStatementOutcome(leader, leader.getCommittedEntryKey({entryId}));
const columnsOf = (db) => db.prepare(`PRAGMA table_info(${OUTCOMES})`).all()
  .map(({name}) => name);
// The table exactly as v0.2.6..v0.4.0 and every development build before the
// identity column created it (no command_digest).
const PRIOR_FORMAT_TABLE = `CREATE TABLE ${OUTCOMES} (entry_key TEXT PRIMARY KEY, ` +
  'outcome TEXT NOT NULL, log_index INTEGER NOT NULL, term INTEGER NOT NULL, ' +
  'failure_code TEXT, failure_message TEXT, changes INTEGER, last_insert_rowid INTEGER, ' +
  'owner_result_text TEXT)';
const PRIOR_COLUMNS = 'entry_key, outcome, log_index, term, failure_code, failure_message, ' +
  'changes, last_insert_rowid, owner_result_text';

// Request, then commit, a placement command under an entryId whose record
// another owner already settled: both must be the collision (BYTES), as for
// another placement command's record (placement-admission-apply.test.js F5/P4).
async function assertForeignRecordIsCollision(leader, proposed, entryId, body) {
  const record = recordOf(leader, entryId);
  assert.equal(record.state, 'settled');
  assert.equal(record.commandDigest, undefined, 'precondition: the record has no identity');
  assert.equal(record.ownerResultText, undefined, 'precondition: another owner wrote it');
  const rowsBefore = ledgerRows(leader);
  const proposals = proposed.length;
  const requested = await requestPlacementAdmission(leader, {entryId, body});
  const appliedBefore = durableAppliedIndex(leader);
  const committed = buildPlacementCommand(leader, {type: PLACEMENT_ADMIT_TYPE, entryId, body});
  const applied = applyCommitted(leader, committed);
  // Request and apply are observed together, so a red run names both.
  assert.deepEqual({request: requested.failureCode, apply: applied,
    appliedIndexAdvance: durableAppliedIndex(leader) - appliedBefore}, {
    request: PLACEMENT_ADMISSION_ERROR.BYTES, apply: PLACEMENT_ADMISSION_ERROR.BYTES,
    appliedIndexAdvance: 0}, `a current-format ${record.outcome} record of another owner ` +
    'must be the collision at request and at apply, never a settlement of this command');
  assert.equal(proposed.length, proposals);
  assert.deepEqual(recordOf(leader, entryId), record);
  assert.deepEqual(ledgerRows(leader), rowsBefore);
}

test('a current-format applied SQL record under the same entry key is the collision, ' +
  'never a settlement of the placement command', () =>
  onLedgerLeader(async (leader, proposed) => {
    const entryId = 'shared-key-applied';
    assert.equal(commitLedgerStatement(leader, entryId,
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?', [1, 'none']), null);
    assert.equal(recordOf(leader, entryId).outcome, APPLY.APPLIED);
    await assertForeignRecordIsCollision(leader, proposed, entryId,
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  }));

test('a current-format statement-failure record (no result) under the same entry key is ' +
  'the collision, never a settlement of the placement command', () =>
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

test('a store whose outcome table has the prior format (released builds, pre-identity ' +
  'development builds, pre-fingerprint placement rows) is refused typed at open, read-only',
async () => {
  const {directory, dbPath} = temporaryDbPath();
  const ledger = {tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    schema: REPLICA_OPERATIONS_SCHEMA, dbPath};
  const entryId = 'prior-format-e0';
  const body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
  try {
    await onLedgerLeader(async (leader, proposed) => {
      const admitted = await admitOnLeader(leader, proposed, entryId, body);
      assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    }, {dbPath});
    // Rewrite the outcome table into the prior format, its placement row as
    // 73c06f635..0970ab012 wrote it (owner result, no result, no identity).
    const prior = new Database(dbPath);
    try {
      prior.exec(`ALTER TABLE ${OUTCOMES} RENAME TO prior_outcomes_source`);
      prior.exec(PRIOR_FORMAT_TABLE);
      prior.exec(`INSERT INTO ${OUTCOMES} (${PRIOR_COLUMNS}) SELECT entry_key, outcome, ` +
        'log_index, term, failure_code, failure_message, NULL, NULL, owner_result_text ' +
        'FROM prior_outcomes_source');
      prior.exec('DROP TABLE prior_outcomes_source');
    } finally {
      prior.close();
    }
    let reopened = null;
    let refusal = null;
    try {
      reopened = await startLeader(ledger, LEDGER_PARTITION_ID);
    } catch (error) {
      refusal = error instanceof AggregateError ? error.errors[0] : error;
    }
    if (reopened !== null) {
      const answer = await requestPlacementAdmission(reopened.leader, {entryId, body});
      await shutdownAll(reopened.leader);
      assert.fail('the store opened with an outcome table of another format; the hot path ' +
        `then answers ${answer.failureCode ?? 'a receipt'}`);
    }
    assert.equal(refusal?.code, OUTCOME_ERROR.FORMAT_UNSUPPORTED, `refusal: ${refusal}`);
    const after = new Database(dbPath, {readonly: true});
    try {
      assert.deepEqual(columnsOf(after), PRIOR_COLUMNS.split(', '),
        'the refused table is never migrated or given a column');
      const row = after.prepare('SELECT changes, last_insert_rowid, owner_result_text FROM ' +
        `${OUTCOMES} WHERE entry_key = ?`).get(`entry:${entryId}`);
      assert.equal(row.last_insert_rowid, null);
      assert.equal(JSON.parse(row.owner_result_text).outcome, PLACEMENT_OUTCOME.ADMITTED);
    } finally {
      after.close();
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('an owner result is recorded only with its command identity, by the recorder and by ' +
  'the table CHECK', () => {
  const db = new Database(':memory:');
  try {
    createCommittedStatementOutcomeTable(db);
    assert.deepEqual(columnsOf(db), [...PARTITION_COMMITTED_STATEMENT_COLUMNS]);
    const service = {db};
    const base = {outcome: APPLY.APPLIED, index: 1, term: 1};
    for (const [entryKey, fields] of [
      ['entry:result-only', {ownerResultText: '{}'}],
      ['entry:digest-only', {commandDigest: 'a'.repeat(64)}],
      ['entry:empty-digest', {ownerResultText: '{}', commandDigest: ''}],
    ]) {
      assert.throws(() => recordCommittedStatementOutcome(service,
        {entryKey, ...base, ...fields}), {code: OUTCOME_ERROR.OWNER_IDENTITY_INVALID});
    }
    assert.throws(() => db.prepare(`INSERT INTO ${OUTCOMES} (entry_key, outcome, log_index, ` +
      'term, owner_result_text) VALUES (?, ?, 1, 1, ?)').run('entry:raw', APPLY.APPLIED, '{}'),
    {code: 'SQLITE_CONSTRAINT_CHECK'});
    recordCommittedStatementOutcome(service, {entryKey: 'entry:owner', ...base,
      ownerResultText: '{}', commandDigest: 'b'.repeat(64)});
    recordCommittedStatementOutcome(service, {entryKey: 'entry:sql', ...base,
      result: {changes: 1, lastInsertRowid: 7}});
    assert.equal(readCommittedStatementOutcome(service, 'entry:owner').commandDigest,
      'b'.repeat(64));
    assert.equal(readCommittedStatementOutcome(service, 'entry:sql').commandDigest, undefined);
    assert.equal(db.prepare(`SELECT count(*) AS count FROM ${OUTCOMES}`).get().count, 2);
  } finally {
    db.close();
  }
});
