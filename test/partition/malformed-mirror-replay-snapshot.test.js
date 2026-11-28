import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {MIRROR_CUSTODY_FORMAT} from '../../src/partition/partition-mirror-custody-codec.js';
import {
  MIRROR_RETENTION_BARRIER_ENTRY_KEY, MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
} from '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  committedStatementEntryKey, createCommittedStatementOutcomeTable, recordCommittedStatementOutcome,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {loadDurableDeltasBehindWatermark} from '../../src/partition/partition-mirror-replay-cursor.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {
  scrubRaftRsCheckpointPayload, validateRaftRsPayloadTables,
} from '../../src/raft/snapshot-application-content.js';

test('pinned snapshot and source replay reject a malformed retained statement effect', () => {
  const db = new Database(':memory:');
  try {
    const service = {db, tableName: 'orders'};
    const descriptor = {entity: {kind: ENTITY_TYPE.PARTITION}};
    const command = {entryId: 'delete-order', type: PARTITION_SERVICE_OPERATION.QUERY,
      sql: 'DELETE FROM orders WHERE id = ?', params: [1]};
    const entryKey = committedStatementEntryKey(command);
    const outcome = PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED;
    createCommittedStatementOutcomeTable(db);
    db.exec('CREATE TABLE raft_rs_peer_identity (id TEXT PRIMARY KEY)');
    db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY); INSERT INTO orders VALUES (1)');
    const removed = db.prepare(command.sql + ' RETURNING id').raw().all(...command.params);
    recordCommittedStatementOutcome(service, {
      command, entryKey, index: 2, term: 1, outcome,
      result: {changes: removed.length, lastInsertRowid: null,
        mutationKind: PARTITION_SERVICE_OPERATION.DELETE,
        typedEffects: encodeTypedRowSet(['id'], removed)},
    });
    db.prepare('INSERT INTO _partition_statement_outcome_effects VALUES (?, 0, ?, ?)').run(
      MIRROR_RETENTION_BARRIER_ENTRY_KEY, MIRROR_RETENTION_BARRIER_KIND,
      JSON.stringify({format: MIRROR_CUSTODY_FORMAT, family: 'split', barrierIndex: 1,
        workflowId: 'w', workflowAttempt: 1, workflowFenceToken: 1, targetPartitionVersion: 2}));
    assert.equal(validateRaftRsPayloadTables(db, descriptor), true);
    assert.equal(loadDurableDeltasBehindWatermark(service, 1)[0].entryId, command.entryId);

    const change = (field, value) => () => db.prepare(
      'UPDATE _partition_statement_outcome_effects SET typed_effects_json = ' +
      'json_set(typed_effects_json, ?, ?) WHERE entry_key = ?',
    ).run(field, value, entryKey);
    const malformed = [
      () => db.prepare('DELETE FROM _partition_statement_outcome_effects WHERE entry_key = ?').run(entryKey),
      () => {
        const injected = {...command, entryId: 'unmirrored-change'};
        const key = committedStatementEntryKey(injected);
        db.prepare('INSERT INTO orders VALUES (?)').run(1);
        const result = db.prepare(injected.sql).run(...injected.params);
        recordCommittedStatementOutcome(service, {entryKey: key, index: 3, term: 1, outcome,
          result: {changes: result.changes, lastInsertRowid: null}});
        assert.deepEqual(db.prepare('SELECT changes, mirror_effect_required ' +
          'FROM _partition_statement_outcomes WHERE entry_key = ?').get(key),
        {changes: 1, mirror_effect_required: 0});
        db.prepare('INSERT INTO _partition_statement_outcome_effects VALUES (?, ?, ?, ?)').run(
          key, 3, PARTITION_SERVICE_OPERATION.DELETE,
          JSON.stringify({command: injected, typedEffects: encodeTypedRowSet(['id'], removed)}));
      },
      change('$.command.mirrorRetentionBarrierIndex', 1),
      change('$.command.type', 'UNKNOWN'),
      change('$.command.entryId', 'wrong-key'),
      change('$.command.sql', 'SELECT id FROM orders'),
      () => db.exec('DELETE FROM _partition_statement_outcomes'),
      () => db.exec('UPDATE _partition_statement_outcomes SET outcome = \'STATEMENT_FAILED\''),
      () => db.exec('UPDATE _partition_statement_outcomes SET log_index = 3'),
      () => db.exec('UPDATE _partition_statement_outcomes SET changes = 2'),
    ];
    for (const corrupt of malformed) {
      db.exec('SAVEPOINT malformed');
      corrupt();
      assert.equal(validateRaftRsPayloadTables(db, descriptor), false);
      const expected = {code: MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES};
      assert.throws(() => scrubRaftRsCheckpointPayload(db, ENTITY_TYPE.PARTITION), expected);
      assert.throws(() => loadDurableDeltasBehindWatermark(service, 1), expected);
      db.exec('ROLLBACK TO malformed; RELEASE malformed');
    }

    // An already backfilled delete can be pruned. Later unrelated outcomes
    // need no delta, even when an internal operation reports a change.
    db.prepare('DELETE FROM _partition_statement_outcome_effects WHERE entry_key = ?').run(entryKey);
    db.prepare('UPDATE _partition_statement_outcome_effects SET typed_effects_json = ' +
      'json_set(typed_effects_json, \'$.barrierIndex\', 2) WHERE entry_key = ?')
      .run(MIRROR_RETENTION_BARRIER_ENTRY_KEY);
    const settled = {term: 1, outcome};
    recordCommittedStatementOutcome(service, {...settled, entryKey: 'entry:failed', index: 3,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED});
    recordCommittedStatementOutcome(service, {...settled, entryKey: 'entry:read', index: 4});
    recordCommittedStatementOutcome(service, {...settled, entryKey: 'entry:owner', index: 5,
      ownerResultText: '{}', commandDigest: 'a'.repeat(64),
      result: {changes: 1, lastInsertRowid: null}});
    recordCommittedStatementOutcome(service, {...settled, entryKey: 'entry:empty', index: 6,
      result: {changes: 0, lastInsertRowid: null}});
    assert.deepEqual(loadDurableDeltasBehindWatermark(service, 2), []);
    const empty = {...command, entryId: 'empty-delete'};
    const noRows = db.prepare(empty.sql + ' RETURNING id').raw().all(...empty.params);
    recordCommittedStatementOutcome(service, {...settled, command: empty,
      entryKey: committedStatementEntryKey(empty), index: 7,
      result: {changes: noRows.length, lastInsertRowid: null,
        mutationKind: PARTITION_SERVICE_OPERATION.DELETE,
        typedEffects: encodeTypedRowSet(['id'], noRows)}});
    assert.deepEqual(loadDurableDeltasBehindWatermark(service, 2)[0].affectedRows, []);
    scrubRaftRsCheckpointPayload(db, ENTITY_TYPE.PARTITION);
    assert.equal(validateRaftRsPayloadTables(db, descriptor), true);
  } finally {
    db.close();
  }
});

test('an unpinned partition image requires the current format for a present outcome table', () => {
  const db = new Database(':memory:');
  try {
    const descriptor = {entity: {kind: ENTITY_TYPE.PARTITION}};
    db.exec('CREATE TABLE raft_rs_peer_identity (id TEXT PRIMARY KEY)');
    assert.equal(validateRaftRsPayloadTables(db, descriptor), true);
    createCommittedStatementOutcomeTable(db);
    assert.equal(validateRaftRsPayloadTables(db, descriptor), true);
    db.exec('ALTER TABLE _partition_statement_outcomes DROP COLUMN mirror_effect_required');
    assert.equal(validateRaftRsPayloadTables(db, descriptor), false);
  } finally {
    db.close();
  }
});
