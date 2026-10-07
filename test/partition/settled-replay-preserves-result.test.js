// A replay of an already committed write never tells its caller the write
// did not happen (owner ruling on the raft-rs cutover: the raft-rs
// reset/replay case in which an applied write came back "success, zero rows
// affected" is a cutover correctness defect).
//
// A write whose entry key is already settled is never executed again: its
// durable outcome row answers it - before it is proposed (a client retry, a
// router's redelivery of the same entryId, a retry on another replica or
// after a restart) or when a retry that was proposed anyway is applied. That
// answer is the APPLIED statement's own result: the outcome row retains the
// statement's affected-row count and last insert rowid, written in the SAME
// transaction as the statement and the applied state, and the answer names
// itself a replay with a named state (PARTITION_SETTLED_REPLAY). A row that
// retains no result (written before the outcome was retained) answers the
// named not-retained state and never a count: an absent count is never
// reported as zero rows.
//
// The witnesses run production construction on file databases with the real
// rs-raft WASM core. The runtime replacement is the real one: the core traps
// (the runtime owner's setCoreFaultInjector test seam, as a trapped WASM
// instance throws) after the write's entry is durable and before it commits,
// so the write is in flight across the replacement and commits in the
// replaced runtime. Rows and outcome rows are read on independent read-only
// connections.

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
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import * as outcomeConstants from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {setCoreFaultInjector} from
  '../../src/raft/raft-rs-runtime-owner.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const {PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL} = outcomeConstants;
// The named replay state (undefined before the repair: every assertion on it
// is then red, never an import failure).
const REPLAY = outcomeConstants.PARTITION_SETTLED_REPLAY ?? {};

const TEMP_PREFIX = 'settled-replay-preserves-result-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'replay_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const COUNT_SQL = `SELECT COUNT(*) AS count FROM ${TABLE_NAME}`;
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const POLL_MS = 10;
const SETTLE_BUDGET_MS = 5000;
// The core primitive the trap is injected on: the light Ready advance that
// follows the persistence of a proposal's entry and precedes its commit (the
// binding's own name).
const ADVANCE_APPEND = 'advance_append';
const TRAP_MESSAGE = 'unreachable';
// The store's encoding of a proposal's bytes.
const PAYLOAD_ENCODING = 'base64';
const OUTCOME_TABLE = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'settled-replay-node'}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, budgetMs = SETTLE_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

function readOnly(dbPath, read) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

function rowCount(dbPath) {
  return readOnly(dbPath, (db) => db.prepare(COUNT_SQL).get().count);
}

function valuesOf(dbPath) {
  return readOnly(dbPath, (db) => db.prepare(
    `SELECT id, value FROM ${TABLE_NAME} ORDER BY id`).all());
}

function outcomeRowOf(dbPath, entryKey) {
  return readOnly(dbPath, (db) => db.prepare(
    `SELECT * FROM ${OUTCOME_TABLE} WHERE entry_key = ?`).get(entryKey) ??
    null);
}

// The entry ids of the proposals a group's durable log holds, decoded by the
// proposal codec, through the store owner's own reader.
function durableEntryIds(dbPath, groupId) {
  return readOnly(dbPath, (db) => {
    const view = Object.create(RaftRsDurableStore.prototype);
    view.db = db;
    return view.readDurableRecord(groupId).entries;
  }).filter((entry) => entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL &&
    typeof entry.data === 'string' && entry.data.length > 0)
    .map((entry) => decodeCommittedProposal(
      Buffer.from(entry.data, PAYLOAD_ENCODING)).entryId);
}

function write(service, sql, params, entryId,
  type = PARTITION_SERVICE_OPERATION.INSERT) {
  return service.applyWrite({type, sql, params, entryId});
}

// Lone leaders on file databases, opened (and reopened) on one path each.
async function withLonePartitions(body, raft = {}) {
  quietEnvironment(raft);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const services = [];
  const open = async (partitionId) => {
    const dbPath = path.join(directory, `${partitionId}-${DB_FILE}`);
    const partition = new PartitionService(withFoundingStamp({
      ...tableOptions(),
      partitionId,
      replicaId: `${partitionId}-r1`,
      replicaIds: [`${partitionId}-r1`],
      nodeId: 'settled-replay-node',
      dbPath,
    }));
    services.push(partition);
    await partition.initialize();
    partition.startElection();
    return {partition, dbPath};
  };
  try {
    await body(open);
  } finally {
    setCoreFaultInjector(null);
    for (const service of services) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

// Arm a one-shot trap of the shared core: the next light-Ready advance of
// `groupId` throws as a trapped WASM instance does. The write proposed next
// is then durable in the group's log and not committed when the runtime is
// replaced.
function armTrapAfterPersistence(groupId) {
  const fired = {count: 0};
  setCoreFaultInjector((stepGroupId, operation) => {
    if (stepGroupId === groupId && operation === ADVANCE_APPEND) {
      setCoreFaultInjector(null);
      fired.count += 1;
      throw new globalThis.WebAssembly.RuntimeError(TRAP_MESSAGE);
    }
  });
  return fired;
}

async function withMutedConsoleError(body) {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await body();
  } finally {
    console.error = original;
  }
}

// The answer a settled replay must give: the APPLIED statement's own result,
// named as a retained replay.
function assertRetainedReplay(answer, original, label) {
  assert.equal(answer.success, true,
    `${label}: the replay is acknowledged (${JSON.stringify(answer)})`);
  assert.equal(answer.settledReplay, REPLAY.OUTCOME_RETAINED,
    `${label}: it names itself a replay whose outcome was retained ` +
    `(${JSON.stringify(answer)})`);
  assert.equal(answer.changes, original.changes,
    `${label}: with the applied statement's affected-row count, never a ` +
    `fabricated zero (${JSON.stringify(answer)})`);
  assert.equal(answer.lastInsertRowid, original.lastInsertRowid,
    `${label}: and its last insert rowid`);
  assert.equal(answer.idempotentReplay, undefined,
    `${label}: no unread boolean flag stands in for the named state`);
}

// W1: the owner's witness - an INSERT in flight across a forced runtime
// replacement, the caller-visible result, and the retry.
test('W1: an INSERT in flight across a forced runtime replacement commits ' +
  'once, and its retry is answered applied with its row count - never ' +
  'success with zero rows, never a UNIQUE failure',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions(async (open) => {
    const {partition, dbPath} = await open('w1-reset');
    const setup = await write(partition, INSERT_SQL, ['row-0', 'setup'],
      'w1-setup');
    assert.equal(setup.success, true, 'setup: the lone leader serves a write');
    const generationBefore = partition.raft.readStatus().runtimeGeneration;

    const fired = armTrapAfterPersistence('w1-reset');
    const inFlight = await withMutedConsoleError(() => write(partition,
      INSERT_SQL, ['row-1', 'in-flight'], 'w1-in-flight'));
    assert.equal(fired.count, 1, 'setup: the core trapped mid-flight');
    assert.equal(inFlight.success, false, 'the in-flight write is not ' +
      `acknowledged by the failed runtime (${JSON.stringify(inFlight)})`);

    // The replaced runtime restores the group and commits the durable entry.
    assert.equal(await waitFor(() => {
      partition.raft.readStatus();
      return rowCount(dbPath) === 2;
    }), true, 'the in-flight entry commits and applies in the replaced ' +
      'runtime');
    assert.equal(partition.raft.readStatus().runtimeGeneration,
      generationBefore + 1, 'setup: the runtime was replaced once');

    const retry = await write(partition, INSERT_SQL, ['row-1', 'in-flight'],
      'w1-in-flight');
    assertRetainedReplay(retry, {changes: 1, lastInsertRowid: 2},
      'W1 retry after the replacement');
    assert.equal(rowCount(dbPath), 2, 'the retry did not apply twice');
    assert.deepEqual(valuesOf(dbPath).map((row) => row.id), ['row-0', 'row-1'],
      'exactly the two rows');

    const other = await write(partition, INSERT_SQL, ['row-1', 'other'],
      'w1-other');
    assert.equal(other.success, false, 'control: a different entry identity ' +
      'with the same key is still the failure it is');
  });
});

test('W1: a retry sent while the runtime is still being replaced is ' +
  'proposed, and the application answers it applied with its row count', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withLonePartitions(async (open) => {
    const {partition, dbPath} = await open('w1-race');
    assert.equal((await write(partition, INSERT_SQL, ['row-0', 'setup'],
      'w1r-setup')).success, true, 'setup');
    armTrapAfterPersistence('w1-race');
    await withMutedConsoleError(() => write(partition, INSERT_SQL,
      ['row-1', 'in-flight'], 'w1r-in-flight'));
    // No wait: the retry itself drives the replacement.
    const retry = await write(partition, INSERT_SQL, ['row-1', 'in-flight'],
      'w1r-in-flight');
    assertRetainedReplay(retry, {changes: 1, lastInsertRowid: 2},
      'W1 immediate retry');
    assert.deepEqual(durableEntryIds(dbPath, 'w1-race').filter((entryId) =>
      entryId === 'w1r-in-flight').length, 2, 'the retry was proposed before ' +
      'its original applied, so the application answered it from the ' +
      'outcome row (the second replay producer)');
    assert.equal(rowCount(dbPath), 2, 'applied once');
  });
});

// W3 (restart replaying the log tail): the entry is durable and uncommitted
// when the process stops; the restart commits it with no proposer waiting;
// the client's retry is answered from the outcome row.
test('W3: an entry committed by the restart that replays the log tail ' +
  'answers its retry applied with its row count', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withLonePartitions(async (open) => {
    const first = await open('w3-restart');
    assert.equal((await write(first.partition, INSERT_SQL,
      ['row-0', 'setup'], 'w3-setup')).success, true, 'setup');
    armTrapAfterPersistence('w3-restart');
    await withMutedConsoleError(() => write(first.partition, INSERT_SQL,
      ['row-1', 'tail'], 'w3-tail'));
    setCoreFaultInjector(null);
    await first.partition.shutdown();
    const restarted = await open('w3-restart');
    assert.equal(await waitFor(() => {
      restarted.partition.raft.readStatus();
      return rowCount(restarted.dbPath) === 2;
    }), true, 'setup: the restart commits the log tail');
    const retry = await write(restarted.partition, INSERT_SQL,
      ['row-1', 'tail'], 'w3-tail');
    assertRetainedReplay(retry, {changes: 1, lastInsertRowid: 2},
      'W3 retry after the restart');
    assert.equal(rowCount(restarted.dbPath), 2, 'applied once');
  });
});

// W2: every statement kind - the replay answers the applied statement's own
// result, and a genuine zero stays zero, distinguishable from a replay.
const UPDATE_SQL = `UPDATE ${TABLE_NAME} SET value = ? WHERE id IN (?, ?)`;
const DELETE_SQL = `DELETE FROM ${TABLE_NAME} WHERE id = ?`;
const MULTI_INSERT_SQL =
  `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?), (?, ?)`;
const RETURNING_SQL =
  `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?) RETURNING id`;
const ZERO_UPDATE_SQL = `UPDATE ${TABLE_NAME} SET value = ? WHERE 0`;

test('W2: the replay of an UPDATE of n rows, a DELETE, a multi-row INSERT, ' +
  'an INSERT ... RETURNING and a genuine zero-row UPDATE answers each ' +
  'statement\'s own result, in process and after a restart',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions(async (open) => {
    const first = await open('w2-kinds');
    for (const id of ['a', 'b', 'c']) {
      assert.equal((await write(first.partition, INSERT_SQL, [id, 'v'],
        `w2-setup-${id}`)).success, true, `setup ${id}`);
    }
    const {UPDATE, DELETE, INSERT} = PARTITION_SERVICE_OPERATION;
    const kinds = [
      {name: 'UPDATE n rows', sql: UPDATE_SQL, params: ['u', 'a', 'b'],
        type: UPDATE, entryId: 'w2-update', changes: 2},
      {name: 'DELETE', sql: DELETE_SQL, params: ['c'], type: DELETE,
        entryId: 'w2-delete', changes: 1},
      {name: 'multi-row INSERT', sql: MULTI_INSERT_SQL,
        params: ['m1', 'v', 'm2', 'v'], type: INSERT, entryId: 'w2-multi',
        changes: 2},
      {name: 'INSERT RETURNING', sql: RETURNING_SQL, params: ['r1', 'v'],
        type: INSERT, entryId: 'w2-returning', changes: 1},
      {name: 'genuine zero-row UPDATE', sql: ZERO_UPDATE_SQL, params: ['z'],
        type: UPDATE, entryId: 'w2-zero', changes: 0},
    ];
    const originals = new Map();
    for (const kind of kinds) {
      const answer = await write(first.partition, kind.sql, kind.params,
        kind.entryId, kind.type);
      assert.equal(answer.success, true, `setup: ${kind.name} applies`);
      assert.equal(answer.changes, kind.changes,
        `setup: ${kind.name} affects ${kind.changes} rows`);
      assert.equal(answer.settledReplay, undefined, `${kind.name}: the ` +
        'first answer is not a replay (a genuine zero is distinguishable ' +
        'from a replayed one)');
      originals.set(kind.entryId, answer);
    }
    const rowsBefore = valuesOf(first.dbPath);
    for (const kind of kinds) {
      assertRetainedReplay(await write(first.partition, kind.sql,
        kind.params, kind.entryId, kind.type), originals.get(kind.entryId),
      `${kind.name} (in process)`);
    }
    await first.partition.shutdown();
    const restarted = await open('w2-kinds');
    for (const kind of kinds) {
      assertRetainedReplay(await write(restarted.partition, kind.sql,
        kind.params, kind.entryId, kind.type), originals.get(kind.entryId),
      `${kind.name} (after a restart)`);
    }
    assert.deepEqual(valuesOf(restarted.dbPath), rowsBefore,
      'no replay executed its statement again');
  });
});

// W5: a settled row that retains no result (an outcome row written before the
// outcome was retained) answers the named not-retained state: applied, no
// count - never zero rows.
test('W5: an applied outcome row that retains no result answers the named ' +
  'not-retained state, acknowledged and without a count, never zero rows',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions(async (open) => {
    const first = await open('w5-unretained');
    const original = await write(first.partition, INSERT_SQL,
      ['row-1', 'v'], 'w5-entry');
    assert.equal(original.success, true, 'setup');
    const entryKey = first.partition.getCommittedEntryKey({
      sql: INSERT_SQL, entryId: 'w5-entry'});
    await first.partition.shutdown();
    // The row as a build that retained no result wrote it: only the outcome
    // columns that build had.
    const legacy = new Database(first.dbPath);
    try {
      const columns = legacy.prepare(`PRAGMA table_info(${OUTCOME_TABLE})`)
        .all().map((column) => column.name);
      const legacyColumns = ['entry_key', 'outcome', 'log_index', 'term',
        'failure_code', 'failure_message'];
      for (const column of columns) {
        if (!legacyColumns.includes(column)) {
          legacy.exec(`ALTER TABLE ${OUTCOME_TABLE} DROP COLUMN ${column}`);
        }
      }
    } finally {
      legacy.close();
    }
    const reopened = await open('w5-unretained');
    const retained = outcomeRowOf(reopened.dbPath, entryKey);
    assert.ok(retained !== null, 'setup: the legacy outcome row is kept');
    const answer = await write(reopened.partition, INSERT_SQL,
      ['row-1', 'v'], 'w5-entry');
    assert.equal(answer.success, true, 'the replay is acknowledged ' +
      `(${JSON.stringify(answer)})`);
    assert.ok(typeof REPLAY.OUTCOME_NOT_RETAINED === 'string' &&
      answer.settledReplay === REPLAY.OUTCOME_NOT_RETAINED,
    `it names the not-retained state (${JSON.stringify(answer)})`);
    assert.equal(Object.hasOwn(answer, 'changes'), false,
      'it carries no count: an unknown count is never reported as zero rows');
    assert.equal(Object.hasOwn(answer, 'lastInsertRowid'), false,
      'nor a rowid');
    assert.equal(rowCount(reopened.dbPath), 1, 'nothing executed again');
    const fresh = await write(reopened.partition, INSERT_SQL,
      ['row-2', 'v'], 'w5-fresh');
    assert.equal(fresh.changes, 1, 'a write after the migration applies');
    assertRetainedReplay(await write(reopened.partition, INSERT_SQL,
      ['row-2', 'v'], 'w5-fresh'), fresh,
    'a write after the migration retains its outcome');
  });
});

// W3: the other replay situations on a real admitted three-replica group -
// a retry on another replica (leader change: a retry reaching the replica
// that leads next), a follower's forwarded retry, and an entry committed by a
// new leader after its proposer lost leadership.
test('W3: on a three-replica group a retry answered by another replica, a ' +
  'forwarded retry, and a retry after a leader change all answer applied ' +
  'with the row count', {timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'w3-group';
  const members = [['w3-g-r1', 'node-1'], ['w3-g-r2', 'node-2'],
    ['w3-g-r3', 'node-3']];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const {services, dbFileOf} = group;
  const [leader, follower] = services;
  try {
    for (const id of ['a', 'b']) {
      assert.equal((await write(leader, INSERT_SQL, [id, 'v'],
        `w3-setup-${id}`)).success, true, `setup ${id}`);
    }
    const update = await write(leader, UPDATE_SQL, ['u', 'a', 'b'],
      'w3-update', PARTITION_SERVICE_OPERATION.UPDATE);
    assert.equal(update.changes, 2, 'setup: the UPDATE affects two rows');
    const entryKey = leader.getCommittedEntryKey({sql: UPDATE_SQL,
      entryId: 'w3-update'});
    assert.equal(await waitFor(() => members.every((member) =>
      outcomeRowOf(dbFileOf(member), entryKey) !== null)), true,
    'setup: every replica holds the outcome row');
    const leaderRow = outcomeRowOf(dbFileOf(members[0]), entryKey);
    for (const member of members.slice(1)) {
      assert.deepEqual(outcomeRowOf(dbFileOf(member), entryKey), leaderRow,
        `${member[0]} holds the leader's outcome row, its retained result ` +
        'included');
    }

    assertRetainedReplay(await write(follower, UPDATE_SQL, ['u', 'a', 'b'],
      'w3-update', PARTITION_SERVICE_OPERATION.UPDATE), update,
    'a retry answered by a follower replica');
    const forwarded = await leader.handleTransportMessage({payload: {
      type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
      operation: {type: PARTITION_SERVICE_OPERATION.UPDATE, sql: UPDATE_SQL,
        params: ['u', 'a', 'b'], entryId: 'w3-update'}}});
    assertRetainedReplay(forwarded, update, 'a follower\'s forwarded retry');

    await follower.raft.campaign();
    assert.equal(await waitFor(() => follower.raft.readStatus().role ===
      RAFT_ROLE.LEADER, GROUP_BUDGET_MS), true, 'setup: the follower leads');
    assertRetainedReplay(await write(follower, UPDATE_SQL, ['u', 'a', 'b'],
      'w3-update', PARTITION_SERVICE_OPERATION.UPDATE), update,
    'a retry at the new leader');
    assert.deepEqual(valuesOf(dbFileOf(members[1])).map((row) => row.value),
      ['u', 'u'], 'the UPDATE applied once');
  } finally {
    await group.dispose();
    resetEnvironment();
  }
});
