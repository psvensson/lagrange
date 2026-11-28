// Which failures of a pinned mirror replay's validation mean a malformed
// payload (src/raft/snapshot-application-content.js): every failure the
// payload's own bytes cause carries the mirror codec's BYTES code and refuses
// the payload; a failure that is not about the payload (an I/O error) is the
// host's and propagates instead of being read as a corrupt payload.
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
  committedStatementEntryKey, createCommittedStatementOutcomeTable,
  recordCommittedStatementOutcome,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {encodeTypedRowSet} from '../../src/query/sql-value-codec.js';
import {
  scrubRaftRsCheckpointPayload, validateRaftRsPayloadTables,
} from '../../src/raft/snapshot-application-content.js';

const DESCRIPTOR = Object.freeze({entity: Object.freeze({kind: ENTITY_TYPE.PARTITION})});
const BYTES = Object.freeze({code: MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES});
const REPLAY_JOIN_MARKER = 'LEFT JOIN';

// A partition payload holding one pinned, applied mirror effect.
function pinnedPayload() {
  const db = new Database(':memory:');
  const service = {db, tableName: 'orders'};
  const command = {entryId: 'delete-order', type: PARTITION_SERVICE_OPERATION.QUERY,
    sql: 'DELETE FROM orders WHERE id = ?', params: [1]};
  createCommittedStatementOutcomeTable(db);
  db.exec('CREATE TABLE raft_rs_peer_identity (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY); INSERT INTO orders VALUES (1)');
  const removed = db.prepare(command.sql + ' RETURNING id').raw().all(...command.params);
  recordCommittedStatementOutcome(service, {
    command, entryKey: committedStatementEntryKey(command), index: 2, term: 1,
    outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
    result: {changes: removed.length, lastInsertRowid: null,
      mutationKind: PARTITION_SERVICE_OPERATION.DELETE,
      typedEffects: encodeTypedRowSet(['id'], removed)},
  });
  db.prepare('INSERT INTO _partition_statement_outcome_effects VALUES (?, 0, ?, ?)').run(
    MIRROR_RETENTION_BARRIER_ENTRY_KEY, MIRROR_RETENTION_BARRIER_KIND,
    JSON.stringify({format: MIRROR_CUSTODY_FORMAT, family: 'split', barrierIndex: 1,
      workflowId: 'w', workflowAttempt: 1, workflowFenceToken: 1, targetPartitionVersion: 2}));
  assert.equal(validateRaftRsPayloadTables(db, DESCRIPTOR), true, 'the payload is valid');
  return db;
}

// The replay read fails with a SQLite result code, as better-sqlite3 raises it.
function failingReplayRead(db, code) {
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (String(sql).includes(REPLAY_JOIN_MARKER)) {
      throw Object.assign(new Error(`replay read failed: ${code}`), {code});
    }
    return prepare(sql);
  };
}

test('payload error: a pinned replay without its committed outcome table carries BYTES', () => {
  const db = pinnedPayload();
  try {
    db.exec('DROP TABLE _partition_statement_outcomes');
    assert.equal(validateRaftRsPayloadTables(db, DESCRIPTOR), false, 'the payload is refused');
    assert.throws(() => scrubRaftRsCheckpointPayload(db, ENTITY_TYPE.PARTITION), BYTES);
  } finally {
    db.close();
  }
});

test('payload error: an effects table without a replayed column is refused', () => {
  const db = pinnedPayload();
  try {
    db.exec('ALTER TABLE _partition_statement_outcome_effects DROP COLUMN mutation_kind');
    assert.equal(validateRaftRsPayloadTables(db, DESCRIPTOR), false);
  } finally {
    db.close();
  }
});

test('payload error: a corrupt page in the replay read carries BYTES', () => {
  const db = pinnedPayload();
  try {
    failingReplayRead(db, 'SQLITE_CORRUPT');
    assert.equal(validateRaftRsPayloadTables(db, DESCRIPTOR), false, 'the payload is refused');
    assert.throws(() => scrubRaftRsCheckpointPayload(db, ENTITY_TYPE.PARTITION), BYTES);
  } finally {
    db.close();
  }
});

test('host error: an I/O failure in the replay read propagates, never a corrupt payload', () => {
  const db = pinnedPayload();
  try {
    failingReplayRead(db, 'SQLITE_IOERR_READ');
    assert.throws(() => validateRaftRsPayloadTables(db, DESCRIPTOR),
      {code: 'SQLITE_IOERR_READ'});
  } finally {
    db.close();
  }
});
