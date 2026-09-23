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

import {
  createLoopbackTransport,
} from './partition-service-test-support.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
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
const GROUP_BUDGET_MS = 5000;
const POLL_MS = 10;

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

    // After a restart the partition's in-memory replay cache is empty: the
    // retry is proposed again, and the recorded outcome of its entry key -
    // not the statement - answers it.
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dbFileOf = ([replicaId]) => path.join(directory, `${replicaId}.db`);
  const addressOf = ([replicaId, nodeId]) =>
    `${nodeId}/partition/${replicaId}`;
  const serviceRow = ([replicaId, nodeId]) => ({
    service_id: replicaId, replica_id: replicaId, partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION, node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
  });
  const cacheOf = (visible) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT,
      {partition_id: partitionId, replica_count: members.length});
    for (const member of visible) {
      cache.applySystemTableChange(
        TABLES.SERVICES, CDCOperation.INSERT, serviceRow(member));
    }
    return cache;
  };
  const network = createLoopbackTransport();
  const services = [];
  const caches = [];
  const build = (member, visible, extra = {}) => {
    const cache = cacheOf(visible);
    const service = new PartitionService({
      ...partitionOptions(partitionId, dbFileOf(member)),
      replicaId: member[0],
      replicaIds: visible.map(([replicaId]) => replicaId),
      peerAddresses: visible.map(addressOf),
      nodeId: member[1],
      transport: network,
      systemTableCache: cache,
      ...extra,
    });
    services.push(service);
    caches.push(cache);
    return service;
  };
  const waitFor = async (predicate) => {
    const deadline = Date.now() + GROUP_BUDGET_MS;
    while (Date.now() < deadline) {
      if (predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return false;
  };
  try {
    // The group forms through the production admission path: a lone leader,
    // then each replica admitted when its services row becomes visible.
    const leader = build(members[0], [members[0]]);
    await leader.initialize();
    assert.equal(await waitFor(() =>
      leader.raft.readStatus().role === 'leader'), true,
    'setup: the first replica leads');
    for (let joined = 1; joined < members.length; joined += 1) {
      const visible = members.slice(0, joined + 1);
      const replica = build(members[joined], visible, {deferElection: true});
      await replica.initialize();
      for (const cache of caches.slice(0, joined)) {
        cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
          serviceRow(members[joined]));
      }
      replica.startElection();
      assert.equal(await waitFor(() => {
        const status = leader.raft.readStatus();
        return status.followerProgress[addressOf(members[joined])] ===
          status.commitIndex;
      }), true, `setup: replica ${members[joined][0]} is admitted`);
    }

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
    network.deliver = async () => undefined;
    await Promise.all(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
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
