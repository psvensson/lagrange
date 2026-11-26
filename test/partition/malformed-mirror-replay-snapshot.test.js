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
    const command = {entryId: 'insert-order', type: PARTITION_SERVICE_OPERATION.QUERY,
      sql: 'INSERT INTO orders (id) VALUES (?)', params: [1]};
    const entryKey = committedStatementEntryKey(command);
    const outcome = PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED;
    createCommittedStatementOutcomeTable(db);
    db.exec('CREATE TABLE raft_rs_peer_identity (id TEXT PRIMARY KEY)');
    recordCommittedStatementOutcome(service, {
      command, entryKey, index: 2, term: 1, outcome,
      result: {changes: 1, lastInsertRowid: 1, mutationKind: PARTITION_SERVICE_OPERATION.INSERT,
        typedEffects: encodeTypedRowSet(['id'], [[1]])},
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
      change('$.command.type', 'UNKNOWN'),
      change('$.command.entryId', 'wrong-key'),
      change('$.command.sql', 'SELECT id FROM orders'),
      () => db.exec('DELETE FROM _partition_statement_outcomes'),
      () => db.exec("UPDATE _partition_statement_outcomes SET outcome = 'STATEMENT_FAILED'"),
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
  } finally {
    db.close();
  }
});
