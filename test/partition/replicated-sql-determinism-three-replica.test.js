/**
 * Three-replica integration proof for deterministic replicated SQL admission.
 *
 * Verifies on a real 3-replica PartitionService + RaftRsPartitionRuntime
 * group (r1, r2, r3) that:
 * 1. Wall-clock functions, SQL current-time value keywords, SQLite
 *    environment/connection functions, PRNG functions, and custom/UDF
 *    functions (e.g. app_clock_ms()) are refused before replication and at
 *    committed apply across all replicas.
 * 2. Non-literal column DEFAULT expressions in CREATE TABLE and ALTER TABLE
 *    are refused at both SQL parser / table-bootstrap and partition migration
 *    admission boundaries.
 * 3. Parameterized writes and allow-listed deterministic scalar/JSON functions
 *    replicate and converge to byte-for-byte identical rows and outcome
 *    records on r1, r2, and r3.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {PARTITION_STATEMENT_REFUSAL_LAYER} from
  '../../src/partition/partition-statement-admission-constants.js';
import {createPartitionServiceTable} from
  '../../src/partition/partition-service-table-bootstrap.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {V3, pick} from '../test-helpers/participant-transaction-fixture.js';

const EVENTS_TABLE = 'events';
const EVENTS_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'created_at', type: 'TEXT'},
    {name: 'payload', type: 'TEXT'},
  ],
});

const REFUSED_WRITE_SQL = Object.freeze([
  ['w-datetime-now', 'INSERT INTO events (id, created_at) VALUES (1, datetime(\'now\'))'],
  ['w-datetime-empty', 'INSERT INTO events (id, created_at) VALUES (2, datetime())'],
  ['w-date-now', 'INSERT INTO events (id, created_at) VALUES (3, date(\'now\'))'],
  ['w-time-now', 'INSERT INTO events (id, created_at) VALUES (4, time(\'now\'))'],
  ['w-julianday', 'INSERT INTO events (id, created_at) VALUES (5, CAST(julianday(\'now\') AS TEXT))'],
  ['w-unixepoch', 'INSERT INTO events (id, created_at) VALUES (6, CAST(unixepoch(\'now\') AS TEXT))'],
  ['w-strftime', 'INSERT INTO events (id, created_at) VALUES (7, strftime(\'%s\', \'now\'))'],
  ['w-timediff', 'INSERT INTO events (id, created_at) VALUES (8, timediff(\'now\', \'now\'))'],
  ['w-cur-ts', 'INSERT INTO events (id, created_at) VALUES (9, CURRENT_TIMESTAMP)'],
  ['w-cur-date', 'INSERT INTO events (id, created_at) VALUES (10, CURRENT_DATE)'],
  ['w-cur-time', 'INSERT INTO events (id, created_at) VALUES (11, CURRENT_TIME)'],
  ['w-version', 'INSERT INTO events (id, payload) VALUES (12, sqlite_version())'],
  ['w-source-id', 'INSERT INTO events (id, payload) VALUES (13, sqlite_source_id())'],
  ['w-compile-used',
    'INSERT INTO events (id, payload) VALUES (14, CAST(sqlite_compileoption_used(\'THREADSAFE\') AS TEXT))'],
  ['w-compile-get', 'INSERT INTO events (id, payload) VALUES (15, sqlite_compileoption_get(0))'],
  ['w-random', 'INSERT INTO events (id, payload) VALUES (16, CAST(random() AS TEXT))'],
  ['w-randomblob', 'INSERT INTO events (id, payload) VALUES (17, hex(randomblob(8)))'],
  ['w-changes', 'INSERT INTO events (id, payload) VALUES (18, CAST(changes() AS TEXT))'],
  ['w-last-rowid',
    'INSERT INTO events (id, payload) VALUES (19, CAST(last_insert_rowid() AS TEXT))'],
  ['w-total-changes',
    'INSERT INTO events (id, payload) VALUES (20, CAST(total_changes() AS TEXT))'],
  ['w-udf-clock', 'INSERT INTO events (id, created_at) VALUES (21, CAST(app_clock_ms() AS TEXT))'],
  ['w-update-cur-ts', 'UPDATE events SET created_at = CURRENT_TIMESTAMP WHERE id = 100'],
  ['w-delete-random', 'DELETE FROM events WHERE id = abs(random())'],
]);

const REFUSED_ALTER_SQL = Object.freeze([
  ['alt-cur-ts', 'ALTER TABLE events ADD COLUMN ts TEXT DEFAULT CURRENT_TIMESTAMP'],
  ['alt-datetime', 'ALTER TABLE events ADD COLUMN ts TEXT DEFAULT (datetime(\'now\'))'],
]);

const DETERMINISTIC_WRITES = Object.freeze([
  [
    'det-insert-1',
    'INSERT INTO events (id, created_at, payload) VALUES (?, coalesce(?, \'fallback\'), upper(trim(?)))',
    [101, '2026-10-27T00:00:00Z', '  alpha  '],
  ],
  [
    'det-insert-2',
    'INSERT INTO events (id, created_at, payload) VALUES (?, substr(?, 1, 10), json_object(\'k\', lower(?), \'n\', abs(?)))',
    [102, '2026-10-27T12:34:56Z', 'BETA', -42],
  ],
  [
    'det-update-1',
    'UPDATE events SET payload = replace(payload, \'ALPHA\', CAST(round(?, 1) AS TEXT)) WHERE id = ?',
    [3.14, 101],
  ],
]);

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'sql-determinism-group'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function readAppliedIndex(group, member, partitionId) {
  const db = new Database(group.dbFileOf(member), {readonly: true});
  try {
    return Number(RaftRsDurableStore.readAppliedIndexIn(db, partitionId));
  } finally {
    db.close();
  }
}

function readReplicaSnapshot(group, member) {
  const db = new Database(group.dbFileOf(member), {readonly: true});
  try {
    const rows = db.prepare(
      'SELECT id, created_at, payload FROM events ORDER BY id ASC',
    ).all();
    const outcomes = db.prepare(
      'SELECT * FROM _partition_statement_outcomes ORDER BY log_index ASC',
    ).safeIntegers(true).all().map((row) => Object.fromEntries(
      Object.entries(row).map(([col, val]) => [col, val === null ? null : String(val)]),
    ));
    return {rows, outcomes};
  } finally {
    db.close();
  }
}

test('3-replica group refuses nondeterministic SQL writes and non-literal defaults and ' +
  'converges identically on deterministic writes across r1, r2, and r3', {timeout: 120000}, async () => {
  const partitionId = 'det-3r';
  const members = [1, 2, 3].map((n) => [`${partitionId}-r${n}`, `node-${n}`]);
  const group = await formAdmittedGroup({
    partitionId,
    members,
    tempPrefix: 'sql-det-3r-',
    serviceOptions: {tableId: EVENTS_TABLE, tableName: EVENTS_TABLE, schema: EVENTS_SCHEMA},
    budgetMs: 8000,
  });
  let owners = null;
  try {
    for (const [idx, service] of group.services.entries()) {
      service.db.function('app_clock_ms', {deterministic: false}, () => 1700000000000 + idx);
    }
    owners = await attachPartitionReleaseOwners(group.services, {
      directory: path.dirname(group.dbFileOf(members[0])),
      budgetMs: 8000,
    });
    await owners.release(partitionId);
    const leader = group.services[0];
    const fields = ['success', 'failureCode', 'refusalLayer'];
    const expectedRefusal = {
      success: false,
      failureCode: V3.CODE.WRITE_STATEMENT_REFUSED,
      refusalLayer: PARTITION_STATEMENT_REFUSAL_LAYER.STATEMENT_FUNCTION,
    };

    const beforeWire = readAppliedIndex(group, members[0], partitionId);
    for (const [entryId, sql] of REFUSED_WRITE_SQL) {
      const res = await leader.executeQuery(sql, [], {entryId: `${entryId}-wire`});
      assert.deepEqual(pick(res, fields), expectedRefusal, entryId);
    }
    for (const [entryId, sql] of REFUSED_ALTER_SQL) {
      const res = await leader.handleRemoteQuery({
        migrationOperation: PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE,
        sql,
        params: [],
      });
      assert.deepEqual(pick(res, fields), expectedRefusal, entryId);
    }
    assert.equal(readAppliedIndex(group, members[0], partitionId) - beforeWire, 0,
      'refused wire writes and migration alters must not propose Raft entries');

    for (const [entryId, sql] of REFUSED_WRITE_SQL) {
      const res = await leader.applyWrite({
        type: PARTITION_SERVICE_OPERATION.QUERY,
        sql,
        params: [],
        entryId: `${entryId}-ingress`,
      });
      assert.deepEqual(pick(res, fields), expectedRefusal, `${entryId}-ingress`);
    }

    for (const [entryId, sql, params] of DETERMINISTIC_WRITES) {
      const res = await leader.executeQuery(sql, params, {entryId});
      assert.equal(res.success, true, entryId);
    }

    const targetIndex = readAppliedIndex(group, members[0], partitionId);
    const settled = await group.waitFor(() =>
      members.every((member) => readAppliedIndex(group, member, partitionId) >= targetIndex));
    assert.equal(settled, true, 'all 3 replicas must catch up to target Raft index');

    const [r1, r2, r3] = members.map((member) => readReplicaSnapshot(group, member));
    assert.deepEqual(r1, r2, 'r1 and r2 state must be identical');
    assert.deepEqual(r2, r3, 'r2 and r3 state must be identical');
    assert.deepEqual(r1.rows, [
      {id: 101, created_at: '2026-10-27T00:00:00Z', payload: '3.1'},
      {id: 102, created_at: '2026-10-27', payload: '{"k":"beta","n":42.0}'},
    ]);
    const refusedOutcomes = r1.outcomes.filter(
      (row) => row.failure_code === V3.CODE.WRITE_STATEMENT_REFUSED,
    );
    assert.equal(refusedOutcomes.length, REFUSED_WRITE_SQL.length);
  } finally {
    await owners?.dispose();
    await group.dispose();
  }
});

test('DDL parser and partition table bootstrap refuse non-literal column DEFAULT expressions', () => {
  for (const sql of [
    'CREATE TABLE events (id INT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE events (id INT PRIMARY KEY, created_at TEXT DEFAULT (datetime(\'now\')))',
    'ALTER TABLE events ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP',
  ]) {
    assert.throws(
      () => new SQLParser(sql).parse(),
      (err) => err.code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      sql,
    );
  }
  const db = new Database(':memory:');
  try {
    assert.throws(
      () => createPartitionServiceTable({
        db,
        tableName: 'events_bad_default',
        schema: {
          columns: [
            {name: 'id', type: 'INTEGER', primaryKey: true},
            {name: 'created_at', type: 'TEXT', defaultValue: 'CURRENT_TIMESTAMP'},
          ],
        },
        logger: {info() {}, error() {}},
      }),
      (err) => err.code === 'UNSUPPORTED_SQL_FEATURE',
    );
  } finally {
    db.close();
  }
});
