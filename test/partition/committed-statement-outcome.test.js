// What a failed statement in a committed entry means (quest
// raft-rs-single-path-partition-cutover, verification round 1: B2 and F-i).
//
// A write on a single-replica partition is one propose() through the rs-raft
// port; its committed entry is applied inside the transaction that advances
// the durable applied index. When the statement fails, exactly one of three
// things is true, and the acknowledgement must say which:
//
// - the entry key was already settled (a client retry, in process or after a
//   restart): the statement is not executed again and the retry reports the
//   recorded outcome - an idempotent replay for an applied statement, the
//   ORIGINAL failure for a failed one (R14: a retried mutation returns the
//   same result);
// - the statement failed deterministically (a constraint violation under a
//   different entry identity, a schema error): the entry is consumed and the
//   write is reported as the failure it is, exactly as the deleted direct
//   path reported it;
// - the failure is environmental (busy, I/O, full, out of memory...): it is
//   not the statement's outcome, so the entry is NOT consumed - the apply
//   rolls back and the committed entry is applied when the host recovers.
//
// The outcome of each settled entry key is a durable row the application
// owner writes in the same transaction as the statement and the applied
// state, so every replica of a group holds the same rows.
//
// Every partition is built by production construction on a file database;
// the durable record is read on an independent read-only connection through
// the store owner's own readers, the outcome rows through the application
// owner's own table (named from its DDL), and rows through a SELECT of the
// test's own.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_CONSENSUS_STARTUP_OUTCOME,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import * as partitionConstants from
  '../../src/partition/partition-service-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_PHASE} from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import {PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
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
const COUNT_ROWS_SQL = `SELECT COUNT(*) AS count FROM ${TABLE_NAME}`;
// The application owner exports its DDL, not its table name.
const OUTCOME_TABLE = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];
// Well under the pending-request timeout a proposed write would wait for.
const PROMPT_ANSWER_MS = 1000;
const GROUP_BUDGET_MS = 5000;

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

// The whole durable record of a group (hard state, applied state and every
// log entry with its bytes) through the store owner's own reader, on a read
// view of an independent connection that runs no DDL, plus the outcome rows.
function wholeDurableRecord(dbPath, partitionId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const view = Object.create(RaftRsDurableStore.prototype);
    view.db = independent;
    return view.readDurableRecord(partitionId);
  } finally {
    independent.close();
  }
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

function rowCount(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(COUNT_ROWS_SQL).get().count;
  } finally {
    independent.close();
  }
}

// Every outcome row, on a connection of the test's own.
function outcomeRows(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(
      'SELECT entry_key, outcome, log_index, term, failure_code, ' +
      `failure_message FROM ${OUTCOME_TABLE} ORDER BY log_index`).all();
  } finally {
    independent.close();
  }
}

// The outcome row of one write, keyed as the partition keys it.
function outcomeOf(dbPath, partition, entryId) {
  const entryKey = partition.getCommittedEntryKey({sql: INSERT_SQL, entryId});
  return outcomeRows(dbPath).filter((row) => row.entry_key === entryKey);
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
    const recordedApplied = outcomeOf(dbPath, partition, 'entry-retried');
    assert.deepEqual(recordedApplied.map((row) => [row.outcome, row.log_index]),
      [[PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED, acknowledged.logIndex]],
      'one APPLIED outcome row at the index the write committed at');
    await partition.shutdown();

    // After a restart the recorded outcome of the entry key - not the
    // statement, and no in-memory state - answers the retry.
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
    assert.equal(retriedAfterRestart.replayOfLogIndex, acknowledged.logIndex,
      'the replay names the index the write was applied at');
    assert.deepEqual(outcomeOf(dbPath, restarted, 'entry-retried'),
      recordedApplied, 'the retry left the recorded outcome unchanged');
    assert.equal(instances.length, 1,
      'the retry is answered from the durable outcome row: nothing is ' +
      `proposed again (${JSON.stringify(record)})`);
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'first'},
      'the replay wrote no second row and changed no value');

    const duplicateAfterRestart = await insert(restarted, 'row-1', 'other',
      'entry-other');
    assert.equal(duplicateAfterRestart.success, false,
      'after a restart a different entry identity is still a failed ' +
      `statement (${JSON.stringify(duplicateAfterRestart)})`);
  });
});

test('B2: a retry of a FAILED statement under the same entry identity ' +
  'reports the original failure again, in process and after a restart',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('b2-failed-retry', async ({dbPath, open}) => {
    const partition = await open();
    const first = await insert(partition, 'row-1', 'first', 'entry-first');
    assert.equal(first.success, true, 'setup: the first insert is acknowledged');
    const failed = await insert(partition, 'row-1', 'second', 'entry-failed');
    assert.equal(failed.success, false, 'setup: the duplicate fails');
    const recorded = outcomeOf(dbPath, partition, 'entry-failed');
    assert.equal(recorded.length, 1, 'one outcome row for the failed entry');
    assert.equal(recorded[0].outcome,
      PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
      'the failure is recorded as a failed statement');
    assert.equal(recorded[0].log_index, failed.logIndex,
      'at the index the failed entry was consumed at');
    assert.equal(recorded[0].failure_message, failed.error,
      'with the failure the proposer was told');
    assert.equal(recorded[0].failure_code, failed.failureCode,
      'and its code');

    const retriedInProcess = await insert(partition, 'row-1', 'second',
      'entry-failed');
    assert.equal(retriedInProcess.success, false,
      'an in-process retry of the failed entry reports the failure ' +
      `(${JSON.stringify(retriedInProcess)})`);
    assert.equal(retriedInProcess.error, failed.error,
      'with the original failure');
    assert.equal(retriedInProcess.failureCode, failed.failureCode,
      'and its original code');
    assert.equal(retriedInProcess.replayOfLogIndex, failed.logIndex,
      'naming the index the failure was recorded at');
    assert.equal(retriedInProcess.idempotentReplay, undefined,
      'a failure is never answered as a replayed success');
    assert.equal(rowCount(dbPath), 1, 'the retry wrote no row');
    assert.deepEqual(outcomeOf(dbPath, partition, 'entry-failed'), recorded,
      'the retry left the recorded outcome unchanged');
    await partition.shutdown();

    const restarted = await open();
    const retriedAfterRestart = await insert(restarted, 'row-1', 'second',
      'entry-failed');
    assert.equal(retriedAfterRestart.success, false,
      'a retry after restart reports the failure ' +
      `(${JSON.stringify(retriedAfterRestart)})`);
    assert.equal(retriedAfterRestart.error, failed.error,
      'with the original failure');
    assert.equal(retriedAfterRestart.replayOfLogIndex, failed.logIndex,
      'naming the index the failure was recorded at');
    assert.equal(rowCount(dbPath), 1, 'the retry wrote no row');
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'first'},
      'the row keeps the first entry\'s value');
    assert.deepEqual(outcomeOf(dbPath, restarted, 'entry-failed'), recorded,
      'the recorded outcome survived the restart unchanged');
  });
});

test('B2: the replicas of a three-replica group hold identical outcome rows ' +
  'for the same entries', {timeout: TEST_TIMEOUT_MS}, async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'statement-outcome-group'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
  const partitionId = 'b2-group';
  const members = [['b2-group-r1', 'node-1'], ['b2-group-r2', 'node-2'],
    ['b2-group-r3', 'node-3']];
  // The group forms through the production admission path: a lone leader,
  // then each replica admitted when its services row becomes visible.
  const group = await formAdmittedGroup({
    partitionId,
    members,
    tempPrefix: TEMP_PREFIX,
    serviceOptions: partitionOptions(partitionId, null),
    budgetMs: GROUP_BUDGET_MS,
  });
  const {dbFileOf, waitFor} = group;
  const leader = group.services[0];
  try {
    const applied = await insert(leader, 'row-1', 'first', 'entry-first');
    const failed = await insert(leader, 'row-1', 'second', 'entry-failed');
    const retriedFailure = await insert(leader, 'row-1', 'second',
      'entry-failed');
    const retriedSuccess = await insert(leader, 'row-2', 'x', 'entry-second');
    assert.equal(applied.success, true, 'setup: the first write is applied');
    assert.equal(failed.success, false, 'setup: the duplicate fails');
    assert.equal(retriedFailure.success, false,
      'the retried failure reports the failure on the group\'s leader');
    assert.equal(retriedSuccess.success, true, 'setup: a second write');

    const leaderApplied = durableRecord(dbFileOf(members[0]), partitionId)
      .appliedIndex;
    assert.equal(await waitFor(() => members.every((member) =>
      durableRecord(dbFileOf(member), partitionId).appliedIndex >=
        leaderApplied)), true, 'every replica applied the leader\'s prefix');
    const rowsByReplica = members.map((member) =>
      outcomeRows(dbFileOf(member)));
    assert.deepEqual(rowsByReplica[0].map((row) => row.outcome), [
      PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
      PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
      PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
    ], 'the leader recorded one outcome per settled entry key');
    assert.equal(rowsByReplica[0].filter((row) => row.outcome ===
      PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED).length, 1,
    'the leader holds exactly one failed outcome (the retry added none)');
    for (let replica = 1; replica < members.length; replica += 1) {
      assert.deepEqual(rowsByReplica[replica], rowsByReplica[0],
        `replica ${members[replica][0]} holds the leader's outcome rows`);
    }
  } finally {
    await group.dispose();
    resetEnvironment();
  }
});

test('F-o: a retry is answered from the durable outcome row, the same ' +
  'answer in process and after a restart, for an applied and a failed ' +
  'statement', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('fo-retry-shape', async ({dbPath, open}) => {
    // The acknowledgement time is when this answer was given; every other
    // field is the settled outcome's.
    const settled = ({acknowledgedAtMs, ...answer}) => {
      assert.equal(typeof acknowledgedAtMs === 'number' ||
        acknowledgedAtMs === undefined, true, 'a time, when present');
      return answer;
    };
    const partition = await open();
    const applied = await insert(partition, 'row-1', 'first', 'entry-applied');
    const failed = await insert(partition, 'row-1', 'second', 'entry-failed');
    assert.equal(applied.success, true, 'setup: the insert is acknowledged');
    assert.equal(failed.success, false, 'setup: the duplicate fails');
    const entriesBefore = durableRecord(dbPath, 'fo-retry-shape').applied
      .length;
    const inProcess = {
      applied: await insert(partition, 'row-1', 'first', 'entry-applied'),
      failed: await insert(partition, 'row-1', 'second', 'entry-failed'),
    };
    await partition.shutdown();
    const restarted = await open();
    const afterRestart = {
      applied: await insert(restarted, 'row-1', 'first', 'entry-applied'),
      failed: await insert(restarted, 'row-1', 'second', 'entry-failed'),
    };
    assert.deepEqual(settled(inProcess.applied),
      settled(afterRestart.applied),
      'the applied retry has one answer in process and after a restart');
    assert.deepEqual(settled(inProcess.failed), settled(afterRestart.failed),
      'the failed retry has one answer in process and after a restart');
    assert.equal(inProcess.applied.replayOfLogIndex, applied.logIndex,
      'the applied answer names the index the write was applied at');
    assert.equal(inProcess.failed.replayOfLogIndex, failed.logIndex,
      'the failed answer names the index the failure was recorded at');
    assert.equal(durableRecord(dbPath, 'fo-retry-shape').applied.length,
      entriesBefore, 'a retry of a settled entry proposes nothing');
  });
});

test('F-p: a write of an SQL command type without its statement is refused ' +
  'before it is proposed', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('fp-no-statement', async ({dbPath, open}) => {
    const partition = await open();
    const before = durableRecord(dbPath, 'fp-no-statement');
    const answer = await Promise.race([
      partition.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT,
        entryId: 'entry-without-statement',
      }),
      new Promise((resolve) => setTimeout(() => resolve('pending'),
        PROMPT_ANSWER_MS)),
    ]);
    assert.notEqual(answer, 'pending', 'the write is answered at once, not ' +
      'left to the pending-request timeout');
    assert.equal(answer.success, false, 'the write is refused');
    assert.equal(answer.failureCode,
      PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_MISSING,
      'with the typed refusal');
    const after = durableRecord(dbPath, 'fp-no-statement');
    assert.deepEqual(after, before, 'nothing entered consensus');
  });
});

// B5: every malformed command shape the verifier drove through the write path
// (applyWrite, and a FORWARD_WRITE through the production transport handler)
// is refused by the admission owner before it is proposed.
const INADMISSIBLE_SQL = `INSERT INTO ${TABLE_NAME} (id, value) ` +
  'VALUES (\'inadmissible\', \'v\')';
const B5_SHAPES = Object.freeze([
  {name: 'unknown-type', code: 'COMMAND_TYPE_UNKNOWN',
    command: {type: 'BOGUS', sql: INADMISSIBLE_SQL, entryId: 'e-unknown'}},
  {name: 'empty-type', code: 'COMMAND_TYPE_UNKNOWN',
    command: {type: '', sql: INADMISSIBLE_SQL, entryId: 'e-empty'}},
  {name: 'undefined-type', code: 'COMMAND_TYPE_UNKNOWN',
    command: {sql: INADMISSIBLE_SQL, entryId: 'e-undefined'}},
  {name: 'forward-write-replicate-rows', code: 'COMMAND_TYPE_UNKNOWN',
    viaTransport: true,
    command: {type: 'REPLICATE_ROWS', sql: INADMISSIBLE_SQL,
      entryId: 'e-poison'}},
  {name: 'prepare-marker', code: 'MARKER_NOT_ADMISSIBLE',
    command: {type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      sessionId: 'session-x', entryId: 'e-prepare'}},
  {name: 'rollback-marker', code: 'MARKER_NOT_ADMISSIBLE',
    command: {type: PARTITION_SERVICE_OPERATION.ROLLBACK,
      sessionId: 'session-x', entryId: 'e-rollback'}},
  {name: 'transaction-commit-without-session', code: 'SESSION_MISSING',
    command: {type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
      entryId: 'e-commit'}},
]);

for (const shape of B5_SHAPES) {
  test(`B5 (${shape.name}): refused before it is proposed, answered at once ` +
    'with its typed code, and the partition keeps serving',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const partitionId = `b5-${shape.name}`;
    await withPartition(partitionId, async ({dbPath, open}) => {
      const partition = await open();
      assert.equal((await insert(partition, 'row-0', 'setup', 'e-setup'))
        .success, true, 'setup: the partition serves a write');
      const before = wholeDurableRecord(dbPath, partitionId);
      const outcomesBefore = outcomeRows(dbPath);
      const asked = shape.viaTransport ?
        partition.handleTransportMessage({payload: {
          type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
          operation: {...shape.command},
        }}) :
        partition.applyWrite({...shape.command});
      const answer = await Promise.race([asked, new Promise((resolve) =>
        setTimeout(() => resolve('pending'), PROMPT_ANSWER_MS))]);
      assert.notEqual(answer, 'pending', 'the write is answered at once, ' +
        'not left to the pending-request timeout');
      assert.deepEqual(wholeDurableRecord(dbPath, partitionId), before,
        'nothing entered consensus: the durable record is identical ' +
        '(entriesAdded 0)');
      assert.deepEqual(outcomeRows(dbPath), outcomesBefore,
        'no outcome row was written');
      assert.equal(answer.success, false,
        `the write is refused (${JSON.stringify(answer)})`);
      assert.equal(answer.failureCode,
        PARTITION_COMMITTED_COMMAND_ERROR_CODE[shape.code],
        `with the typed refusal ${shape.code}`);
      assert.equal((await insert(partition, 'row-1', 'after', 'e-after'))
        .success, true, 'the partition still serves a write afterwards');
    });
  });
}

// F-ad: a write's entryId keys its outcome row and its answer. A supplied
// entryId that is not a non-empty string is refused before consensus (a
// minted replacement would turn the client's retry into a new write); an
// absent one is minted; a supplied string is kept end to end, so a retry
// with it is answered from its outcome row.
const INVALID_ENTRY_IDS = Object.freeze([
  ['number', 42],
  ['empty', ''],
  ['object', {id: 'not-a-string'}],
]);

function forwardWrite(partition, id, entryId) {
  const operation = {
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, 'v'],
    ...(entryId === undefined ? {} : {entryId}),
  };
  return Promise.race([
    partition.handleTransportMessage({payload: {
      type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE, operation}}),
    new Promise((resolve) => setTimeout(() => resolve('pending'),
      PROMPT_ANSWER_MS)),
  ]);
}

test('F-ad: a present-but-invalid entryId is refused before consensus; a ' +
  'supplied entryId keys the durable outcome end to end; an absent one is ' +
  'minted', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withPartition('fad-entry-id', async ({dbPath, open}) => {
    const partition = await open();
    assert.equal((await insert(partition, 'row-0', 'setup', 'e-setup'))
      .success, true, 'setup: the partition serves a write');
    for (const [name, entryId] of INVALID_ENTRY_IDS) {
      const before = wholeDurableRecord(dbPath, 'fad-entry-id');
      const outcomesBefore = outcomeRows(dbPath);
      const answer = await forwardWrite(partition, `row-${name}`, entryId);
      assert.equal(answer?.success, false, `a wire entryId (${name}) is ` +
        `refused (${JSON.stringify(answer)})`);
      assert.ok(typeof PARTITION_COMMITTED_COMMAND_ERROR_CODE
        .ENTRY_ID_INVALID === 'string' && answer.failureCode ===
        PARTITION_COMMITTED_COMMAND_ERROR_CODE.ENTRY_ID_INVALID,
      `with the typed refusal (${answer.failureCode})`);
      assert.deepEqual(wholeDurableRecord(dbPath, 'fad-entry-id'), before,
        'nothing entered consensus');
      assert.deepEqual(outcomeRows(dbPath), outcomesBefore,
        'no outcome row was written');
    }
    const kept = await forwardWrite(partition, 'row-kept', 'client-entry-7');
    assert.equal(kept.success, true, 'a supplied entryId is admitted');
    assert.equal(durableRecord(dbPath, 'fad-entry-id').applied.filter(
      (entry) => entry.entryId === 'client-entry-7').length, 1,
    'the committed entry carries the client\'s entryId');
    assert.equal(outcomeOf(dbPath, partition, 'client-entry-7').length, 1,
      'its outcome row is keyed by it');
    const retry = await forwardWrite(partition, 'row-kept', 'client-entry-7');
    assert.equal(retry.idempotentReplay, true,
      `a retry with it is answered from its outcome row (${
        JSON.stringify(retry)})`);
    const minted = await forwardWrite(partition, 'row-minted', undefined);
    assert.equal(minted.success, true, 'an absent entryId is minted');
    assert.equal(rowOf(dbPath, 'row-minted')?.id, 'row-minted',
      'and the write applied');
  });
});

test('B5: a committed entry with an unknown type (proposed straight through ' +
  'the port) fails closed with a typed, named host failure on readStatus ' +
  'and on the restart\'s initialize(), and its sibling is untouched',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const unknownReason = partitionConstants
    .PARTITION_COMMITTED_COMMAND_HOST_FAILURE_REASON?.COMMAND_UNKNOWN;
  await withPartition('b5-sibling', async ({dbPath: siblingPath, open:
    openSibling}) => {
    const sibling = await openSibling();
    assert.equal((await insert(sibling, 's-0', 'setup', 's-setup')).success,
      true, 'setup: the sibling serves a write');
    const siblingBefore = {
      record: wholeDurableRecord(siblingPath, 'b5-sibling'),
      generation: sibling.raft.readStatus().runtimeGeneration,
    };
    await withPartition('b5-apply-unknown', async ({open}) => {
      const partition = await open();
      assert.equal((await insert(partition, 'row-0', 'setup', 'e-setup'))
        .success, true, 'setup: the partition serves a write');
      await partition.raft.propose({
        type: 'BOGUS', sql: INADMISSIBLE_SQL, entryId: 'e-direct'});
      const status = partition.raft.readStatus();
      assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
        `readStatus is the group's host failure (${JSON.stringify(status)})`);
      assert.equal(status.failure?.detail?.commandType, 'BOGUS',
        'readStatus names the committed type the application does not ' +
        'recognise');
      assert.equal(status.failure.reason, unknownReason,
        'with the typed reason');
      assert.ok(Number.isInteger(status.failure?.detail?.index) &&
        status.failure.detail.index > 0, 'and the entry\'s index');
      assert.deepEqual({
        record: wholeDurableRecord(siblingPath, 'b5-sibling'),
        generation: sibling.raft.readStatus().runtimeGeneration,
      }, siblingBefore, 'the sibling is untouched');
      await partition.shutdown();
      let refusal = null;
      try {
        await open();
      } catch (error) {
        refusal = error;
      }
      assert.equal(refusal?.code,
        PARTITION_CONSENSUS_STARTUP_OUTCOME.SINGLE_REPLICA_CAMPAIGN_REFUSED,
        `the restart fails closed (${refusal?.message})`);
      assert.ok(String(refusal.message).includes(unknownReason) &&
        String(refusal.message).includes('BOGUS'),
      `initialize() names the unknown committed command (${refusal.message})`);
    });
    assert.equal((await insert(sibling, 's-1', 'after', 's-after')).success,
      true, 'the sibling still serves a write');
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
    // F-ae: the environmental answer carries its typed code and the port's
    // consensus fields, as every other refused write does.
    assert.equal(busy.failureCode,
      PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED,
      `F-ae: the answer carries the environmental failure code (${
        JSON.stringify(busy)})`);
    assert.deepEqual({phase: busy.consensus?.phase,
      retryable: busy.consensus?.retryable}, {
      phase: RUNTIME_PHASE.APPLICATION,
      retryable: true,
    }, 'F-ae: with the phase and retryability the port answered');
    assert.equal(during.appliedIndex, before.appliedIndex,
      'the entry is not consumed: the applied index did not advance ' +
      `(${JSON.stringify({before, during})})`);
    assert.equal(during.applied.some((entry) =>
      entry.entryId === 'entry-busy'), false,
    'the environmentally failed entry is not among the applied proposals');
    assert.equal(rowOf(dbPath, 'row-1'), null, 'no row was written');
    assert.deepEqual(outcomeOf(dbPath, partition, 'entry-busy'), [],
      'an environmental failure records no outcome (the apply rolled back)');
    await partition.shutdown();

    // The host recovers (a fresh connection, no lock): the committed entry is
    // delivered again and applied exactly once.
    const recovered = await open();
    const after = durableRecord(dbPath, 'fi-environmental');
    assert.equal(after.applied.filter((entry) =>
      entry.entryId === 'entry-busy').length, 1,
    `the committed entry is applied once after recovery (${JSON.stringify(after)})`);
    assert.deepEqual(rowOf(dbPath, 'row-1'), {id: 'row-1', value: 'busy'},
      'the committed write is not lost');
    assert.deepEqual(outcomeOf(dbPath, recovered, 'entry-busy')
      .map((row) => row.outcome), [PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED],
    'the recovered apply recorded its outcome once');
  });
});
