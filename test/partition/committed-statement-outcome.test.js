// What a failed statement in a committed entry means (quest
// raft-rs-single-path-partition-cutover, verification round 1: B2 and F-i).
//
// A write on a single-replica partition is one propose() through the rs-raft
// port; its committed entry is applied inside the transaction that advances
// the durable applied index. When the statement fails, exactly one of three
// things is true, and the acknowledgement must say which:
//
// - the entry is a replay of the SAME entry identity the partition already
//   applied (a client retry after an acknowledgement, even across a restart):
//   an idempotent replay, acknowledged as success with no change;
// - the statement failed deterministically (a constraint violation under a
//   different entry identity, a schema error): the entry is consumed and the
//   write is reported as the failure it is, exactly as the deleted direct
//   path reported it;
// - the failure is environmental (busy, I/O, full, out of memory...): it is
//   not the statement's outcome, so the entry is NOT consumed - the apply
//   rolls back and the committed entry is applied when the host recovers.
//
// Every partition is built by production construction on a file database;
// the durable record is read on an independent read-only connection through
// the store owner's own readers, and rows through a SELECT of the test's own.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';

const TEMP_PREFIX = 'committed-statement-outcome-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'statement_outcome_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_ROW_SQL = `SELECT id, value FROM ${TABLE_NAME} WHERE id = ?`;
const MISSING_TABLE_INSERT_SQL =
  'INSERT INTO statement_outcome_missing_table (id) VALUES (?)';
const TEST_TIMEOUT_MS = 30000;
// Inputs: the SQLite result codes an environmental failure carries (the
// SQLite library's own names; better-sqlite3 reports extended codes).
const ENVIRONMENTAL_SQLITE_CODE = 'SQLITE_BUSY';
const ENVIRONMENTAL_SQLITE_MESSAGE = 'database is locked';

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'statement-outcome-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function partitionOptions(partitionId, dbPath) {
  return {
    partitionId,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'statement-outcome-node',
    dbPath,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

// The durable record on a connection of the test's own, through the store
// owner's readers: the applied index and the applied proposals.
function durableRecord(dbPath, partitionId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return {
      appliedIndex: Number(
        RaftRsDurableStore.readAppliedIndexIn(independent, partitionId)),
      applied: RaftRsDurableStore.readCommittedEntriesIn(
        independent, partitionId).map((record) => ({
        index: Number(record.index),
        entryId: record.command.entryId,
      })),
    };
  } finally {
    independent.close();
  }
}

function rowOf(dbPath, id) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(SELECT_ROW_SQL).get(id) ?? null;
  } finally {
    independent.close();
  }
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

async function withPartition(partitionId, body) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dbPath = path.join(directory, DB_FILE);
  const services = [];
  const open = async () => {
    const service = new PartitionService(partitionOptions(partitionId, dbPath));
    services.push(service);
    await service.initialize();
    return service;
  };
  try {
    await body({dbPath, open});
  } finally {
    for (const service of services) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

test('B2: a duplicate primary key under a different entry identity is a ' +
  'failed statement, consumed and reported, never an acknowledged replay',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('b2-duplicate-key', async ({dbPath, open}) => {
    const partition = await open();
    const first = await insert(partition, 'row-1', 'first', 'entry-first');
    assert.equal(first.success, true, 'setup: the first insert is acknowledged');

    const duplicate = await insert(partition, 'row-1', 'second',
      'entry-duplicate');
    const record = durableRecord(dbPath, 'b2-duplicate-key');
    const consumed = record.applied.find((entry) =>
      entry.entryId === 'entry-duplicate');

    assert.equal(duplicate.success, false,
      'the constraint failure is reported, not acknowledged as success ' +
      `(${JSON.stringify(duplicate)})`);
    assert.match(String(duplicate.error), /UNIQUE constraint failed/u,
      'the reported error is the statement\'s own');
    assert.ok(consumed !== undefined && consumed.index <= record.appliedIndex,
      'the failed statement\'s entry is consumed by the applied index ' +
      `(${JSON.stringify(record)})`);
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'first'},
      'the row keeps the value the first entry wrote');

    const after = await insert(partition, 'row-2', 'after', 'entry-after');
    assert.equal(after.success, true,
      'the partition keeps serving writes after a failed statement');
  });
});

test('B2: the same entry identity retried after its acknowledgement is an ' +
  'idempotent replay, in process and across a restart',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('b2-retry', async ({dbPath, open}) => {
    const partition = await open();
    const acknowledged = await insert(partition, 'row-1', 'first',
      'entry-retried');
    assert.equal(acknowledged.success, true, 'setup: the insert is acknowledged');

    const retriedInProcess = await insert(partition, 'row-1', 'first',
      'entry-retried');
    assert.equal(retriedInProcess.success, true,
      'an in-process retry of the acknowledged entry is acknowledged');
    assert.equal(retriedInProcess.idempotentReplay, true,
      'an in-process retry is answered as an idempotent replay');
    await partition.shutdown();

    // After a restart the partition's in-memory replay set is empty: the
    // retry is proposed again, and its constraint failure is recognised as a
    // replay of the entry identity the durable log already applied.
    const restarted = await open();
    const retriedAfterRestart = await insert(restarted, 'row-1', 'first',
      'entry-retried');
    const record = durableRecord(dbPath, 'b2-retry');
    const instances = record.applied.filter((entry) =>
      entry.entryId === 'entry-retried');

    assert.equal(retriedAfterRestart.success, true,
      'a retry after restart is acknowledged ' +
      `(${JSON.stringify(retriedAfterRestart)})`);
    assert.equal(retriedAfterRestart.changes, 0,
      'the replay changed nothing');
    assert.equal(retriedAfterRestart.idempotentReplay, true,
      'the retry after restart is answered as an idempotent replay');
    assert.equal(instances.length, 2,
      'the retry was proposed again and consumed by the applied index ' +
      `(${JSON.stringify(record)})`);
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'first'},
      'the replay wrote no second row and changed no value');

    const duplicateAfterRestart = await insert(restarted, 'row-1', 'other',
      'entry-other');
    assert.equal(duplicateAfterRestart.success, false,
      'after a restart a different entry identity is still a failed ' +
      `statement (${JSON.stringify(duplicateAfterRestart)})`);
  });
});

test('F-i: a schema error is a deterministic statement failure: consumed ' +
  'and reported', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('fi-deterministic', async ({dbPath, open}) => {
    const partition = await open();
    const failed = await partition.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: MISSING_TABLE_INSERT_SQL,
      params: ['z'],
      entryId: 'entry-missing-table',
    });
    const record = durableRecord(dbPath, 'fi-deterministic');
    const consumed = record.applied.find((entry) =>
      entry.entryId === 'entry-missing-table');
    assert.equal(failed.success, false, 'the schema error is reported');
    assert.match(String(failed.error), /no such table/u,
      'the reported error is the statement\'s own');
    assert.ok(consumed !== undefined && consumed.index <= record.appliedIndex,
      'the entry is consumed');
  });
});

test('F-i: an environmental SQLite failure is never consumed as a failed ' +
  'statement: the apply rolls back and the entry is applied once the host ' +
  'recovers', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('fi-environmental', async ({dbPath, open}) => {
    const partition = await open();
    const setup = await insert(partition, 'row-0', 'setup', 'entry-setup');
    assert.equal(setup.success, true, 'setup: a write is acknowledged');
    const before = durableRecord(dbPath, 'fi-environmental');

    // The host's database answers the statement with an environmental
    // failure (a lock another connection holds), as better-sqlite3 raises it.
    const prepare = partition.db.prepare.bind(partition.db);
    partition.db.prepare = (sql) => {
      if (sql === INSERT_SQL) {
        throw new Database.SqliteError(
          ENVIRONMENTAL_SQLITE_MESSAGE, ENVIRONMENTAL_SQLITE_CODE);
      }
      return prepare(sql);
    };
    const busy = await insert(partition, 'row-1', 'busy', 'entry-busy');
    const during = durableRecord(dbPath, 'fi-environmental');

    assert.equal(busy.success, false,
      `the write is not acknowledged (${JSON.stringify(busy)})`);
    assert.equal(busy.deferRetry === true, false,
      'an environmental failure is not a user-transaction deferral');
    assert.ok(String(busy.error).startsWith(
      PARTITION_SERVICE_ERROR_MSG.COMMITTED_STATEMENT_ENVIRONMENT_FAILED),
    `the failure names the environmental statement outcome (${busy.error})`);
    assert.ok(String(busy.error).includes(ENVIRONMENTAL_SQLITE_CODE),
      'the failure carries the SQLite code the host raised');
    assert.equal(during.appliedIndex, before.appliedIndex,
      'the entry is not consumed: the applied index did not advance ' +
      `(${JSON.stringify({before, during})})`);
    assert.equal(during.applied.some((entry) =>
      entry.entryId === 'entry-busy'), false,
    'the environmentally failed entry is not among the applied proposals');
    assert.equal(rowOf(dbPath, 'row-1'), null, 'no row was written');
    await partition.shutdown();

    // The host recovers (a fresh connection, no lock): the committed entry is
    // delivered again and applied exactly once.
    await open();
    const after = durableRecord(dbPath, 'fi-environmental');
    assert.equal(after.applied.filter((entry) =>
      entry.entryId === 'entry-busy').length, 1,
    `the committed entry is applied once after recovery (${JSON.stringify(after)})`);
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'busy'},
      'the committed write is not lost');
  });
});
