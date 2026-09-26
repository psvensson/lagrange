// A durable record that cannot be read is its group's own typed host failure,
// never an escaping throw (quest raft-rs-single-path-partition-cutover, F-ah
// after verification round 5).
//
// A group's durable record is read where the group is opened and wherever it
// is reconstructed from. When that read fails - a record table is missing,
// the file is unreadable (SQLITE_IOERR) or corrupt (SQLITE_CORRUPT) - the
// runtime owner holds the group by a typed host failure of phase
// durable-record-read: its retry window engages as for any persisting
// failure, every port operation (the port's own scheduled ticks included)
// answers typed and synchronously, its status names the failure and the
// durable progress it could not read, a write is refused with the write
// kernel's typed code, and no other group is touched. Restoring the table
// heals the group without a restart. A replica restarted while the table is
// still missing - lone or a follower (F-ap) - is refused at initialization,
// typed and naming the phase and the table, and releases its database; a
// follower whose record becomes unreadable never stops its leader serving.
// The record's tables are created whole or not at all (F-ao), so a partial
// schema only ever comes from outside and stays a typed refusal.
//
// The failure is real: the partition's own connection drops the record's
// applied-state table (the verifier's r5-ag shape); a real SQLITE_IOERR or
// SQLITE_CORRUPT on read takes the same read. Every observation is the
// port's (readStatus), the write kernel's answer, or the durable record read
// on an independent read-only connection through the store owner's own
// reader; the retry window is the tuning owner's; an escaping exception is
// counted where the process reports one.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {answerOf, countEscapes} from
  '../raft/raft-rs-backend/process-escape-counter.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_CONSENSUS_STARTUP_OUTCOME,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RAFT_RS_RECORD_TABLES,
  RAFT_RS_SCHEMA_SQL,
  RAFT_RS_SQL,
} from '../../src/raft/raft-rs-durable-store-constants.js';
import * as runtimeConstants from
  '../../src/raft/raft-rs-runtime-owner-constants.js';
import * as runtimeTuning from '../../src/raft/raft-rs-runtime-tuning.js';

const TEMP_PREFIX = 'unreadable-durable-record-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'unreadable_record_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_IDS_SQL = `SELECT id FROM ${TABLE_NAME} ORDER BY id`;
const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
// The record table the injection drops: the store owner's applied-state
// table (its DDL names it), so both the record and its progress are
// unreadable.
const LOST_TABLE = RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];
// The verifier's r5-ag span: two seconds of the port's own scheduled ticks.
const SCHEDULED_SPAN_MS = 2000;
const WINDOW_MARGIN_MS = 50;
const LEADER_WRITE_INTERVAL_MS = 25;
// An inbound heartbeat whose commit lies far beyond any log: raft-rs traps on
// it (the seam the runtime's own recovery tests use for a CORE_FATAL).
const TRAPPING_COMMIT = '999999';
const HEARTBEAT_MESSAGE_TYPE = 8;
const FOREIGN_PEER_OFFSET = 1000;
// A test clock of the configuration's own (the verifier's group timing).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'unreadable-record-node'}, raft});
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

function loneOptions(partitionId, dbPath) {
  return {
    ...tableOptions(),
    partitionId,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'unreadable-record-node',
    dbPath,
  };
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The whole durable record of a group, through the store owner's own reader
// on a read view of an independent connection (no DDL, nothing written).
// A lost applied-state row restored whole through the store owner's own
// writers: its participation gate (bootstrap and admission index, written
// with the index-0 applied state) and then its applied progress. A row
// restored without its gate restores closed (owner decision O1).
function restoreAppliedRecord(store, groupId, saved) {
  store.putBootstrapAppliedState(groupId, saved.confState, {
    bootstrapIndex: saved.bootstrapIndex,
    admissionIndex: saved.admissionIndex,
  });
  store.putAppliedState(groupId, saved.appliedIndex, saved.confState);
}

function durableRecordOf(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const view = Object.create(RaftRsDurableStore.prototype);
    view.db = independent;
    return view.readDurableRecord(groupId);
  } finally {
    independent.close();
  }
}

// How many log entries a group's durable log holds, by the store owner's own
// log statement (the log table stays readable when another table is lost).
function logEntryCount(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(groupId)
      .length;
  } finally {
    independent.close();
  }
}

function rowIds(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(SELECT_IDS_SQL).all().map((row) => row.id);
  } finally {
    independent.close();
  }
}

function recordTablesOf(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const present = independent.prepare(
      RAFT_RS_SCHEMA_SQL.SELECT_TABLE_PRESENT);
    return RAFT_RS_RECORD_TABLES.filter((table) =>
      present.get(table) !== undefined);
  } finally {
    independent.close();
  }
}

// The facts a failure of another group would move: its durable record (term,
// hard state, every log entry) and the runtime generation it runs under.
function untouchedFacts(service, dbPath) {
  const record = durableRecordOf(dbPath, service.partitionId);
  return {
    hardState: record.hardState,
    logEntries: record.entries.length,
    runtimeGeneration: service.raft.readStatus().runtimeGeneration,
  };
}

// Asserts one status is the group's typed hold on its unreadable record.
function assertHeldOnUnreadableRecord(answer, label) {
  const phase = runtimeConstants.RUNTIME_PHASE.DURABLE_RECORD_READ;
  assert.equal(answer.threw, null,
    `${label}: readStatus answers, never throws (${answer.threw})`);
  const status = answer.value;
  assert.equal(typeof status?.then, 'undefined',
    `${label}: readStatus answers synchronously`);
  assert.equal(status?.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    `${label}: a typed host failure (${JSON.stringify(status)})`);
  assert.equal(status.recoveryRequired, true,
    `${label}: the group is held for recovery`);
  assert.ok(typeof phase === 'string' && status.phase === phase,
    `${label}: it names the durable-record-read phase (${status.phase})`);
  assert.equal(status.failure?.detail?.table, LOST_TABLE,
    `${label}: the failure names the table it could not read`);
  assert.equal(status.durableProgress?.state,
    runtimeConstants.DURABLE_PROGRESS_OBSERVATION.UNREADABLE,
    `${label}: its durable progress is observed as unreadable`);
  return status;
}

// Asserts one initialization refusal is the typed refusal of a replica whose
// durable record could not be read at open.
function assertInitRefusedOnUnreadableRecord(error) {
  const phase = runtimeConstants.RUNTIME_PHASE.DURABLE_RECORD_READ;
  assert.ok(error !== null,
    'initialization does not report a partition that cannot read its ' +
    'durable record');
  assert.equal(error.code,
    PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
    `the refusal is the typed startup outcome (${error?.message})`);
  assert.ok(typeof phase === 'string' && error.phase === phase &&
    error.consensus?.phase === phase, 'the refusal and the port\'s answer ' +
    `name the durable-record-read phase (${JSON.stringify(error?.consensus)})`);
  assert.ok(String(error.message).includes(phase),
    `the refusal's text names the phase (${error.message})`);
  assert.equal(error.consensus?.failure?.detail?.table, LOST_TABLE,
    'it names the table it could not read');
  assert.equal(typeof error.consensus?.failure?.detail?.code, 'string',
    'and SQLite\'s own code');
  assert.ok(String(error.message).includes(LOST_TABLE),
    `the refusal's text names the table (${error.message})`);
}

async function withLonePartitions(body) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const services = [];
  const open = async (partitionId, extra = {}) => {
    const dbPath = path.join(directory, `${partitionId}-${DB_FILE}`);
    const partition = new PartitionService({
      ...loneOptions(partitionId, dbPath), ...extra});
    services.push(partition);
    await partition.initialize();
    partition.startElection();
    return {partition, dbPath};
  };
  try {
    await body({open, directory});
  } finally {
    for (const service of services) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

test('F-ah: a lone leader whose durable record becomes unreadable is held ' +
  'typed - no escaping exception across its scheduled ticks, a bounded ' +
  'reconstruction per window, a typed write refusal, its sibling untouched ' +
  '- and serves again once the table is restored', {timeout: TEST_TIMEOUT_MS},
async () => {
  const escapes = countEscapes();
  try {
    await loneLeaderUnreadableCase(escapes);
  } finally {
    escapes.stop();
  }
});

async function loneLeaderUnreadableCase(escapes) {
  await withLonePartitions(async ({open}) => {
    const {partition, dbPath} = await open('fah-lone');
    const sibling = await open('fah-lone-sibling');
    const REFUSAL = partitionWriteKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL;
    assert.equal((await insert(partition, 'row-0', 'setup', 'e-setup'))
      .success, true, 'setup: the lone leader serves a write');
    assert.equal((await insert(sibling.partition, 's-0', 'setup', 's-setup'))
      .success, true, 'setup: the sibling serves a write');
    const siblingBefore = untouchedFacts(sibling.partition, sibling.dbPath);
    const saved = durableRecordOf(dbPath, partition.partitionId);
    const window = runtimeTuning.recoveryRetryWindowMsOf(
      partition.raftTimingConfig);
    partition.db.exec(`DROP TABLE ${LOST_TABLE}`);
    const failedAt = Date.now();
    const failed = await insert(partition, 'row-1', 'lost', 'e-lost');
    assert.equal(failed.success, false,
      'the write whose application met the lost table is not ' +
      `acknowledged (${JSON.stringify(failed)})`);
    assert.equal(typeof failed.failureCode, 'string',
      'it is answered with a typed code');

    await sleep(SCHEDULED_SPAN_MS);
    assert.deepEqual(escapes.escaped, [],
      'no exception or rejection escaped the port or its scheduled ticks');
    const held = assertHeldOnUnreadableRecord(
      answerOf(() => partition.raft.readStatus()), 'after the span');
    const spanMs = Date.now() - failedAt;
    const bound = Math.ceil(spanMs / window) + 1;
    assert.ok(Number.isInteger(held.attempts) && held.attempts >= 1 &&
      held.attempts <= bound, 'reconstruction was attempted at most once ' +
      `per window (${held.attempts} over ${spanMs} ms, bound ${bound})`);

    const entriesBefore = logEntryCount(dbPath, partition.partitionId);
    const refused = await insert(partition, 'row-x', 'held', 'e-held');
    assert.ok(typeof REFUSAL?.CONSENSUS_RECOVERY_REQUIRED === 'string' &&
      refused.failureCode === REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
    'a write to the held group is refused with the kernel\'s typed code ' +
      `(${JSON.stringify(refused)})`);
    assert.equal(refused.consensus?.phase,
      runtimeConstants.RUNTIME_PHASE.DURABLE_RECORD_READ,
      'the refusal carries the durable-record-read phase');
    assert.equal(logEntryCount(dbPath, partition.partitionId), entriesBefore,
      'nothing was proposed');
    assert.deepEqual(untouchedFacts(sibling.partition, sibling.dbPath),
      siblingBefore, 'the sibling was never touched (same hard state, ' +
      'log and runtime generation)');
    assert.equal((await insert(sibling.partition, 's-1', 'during',
      's-during')).success, true, 'the sibling keeps serving');

    // The table restored from the store owner's own DDL, its row through
    // the store owner's own writer.
    partition.db.exec(RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE);
    restoreAppliedRecord(new RaftRsDurableStore(partition.db),
      partition.partitionId, saved);
    await sleep(window + WINDOW_MARGIN_MS);
    const healed = await insert(partition, 'row-2', 'healed', 'e-healed');
    assert.equal(healed.success, true, 'the restored group serves a ' +
      `write without a restart (${JSON.stringify(healed)})`);
    assert.equal(partition.raft.readStatus().role, RAFT_ROLE.LEADER,
      'the sole voter leads its group again');
    assert.deepEqual(rowIds(dbPath), ['row-0', 'row-1', 'row-2'],
      'the committed entry the lost table held back is applied once, ' +
      'then the next write');
    assert.deepEqual(escapes.escaped, [],
      'nothing escaped while the group healed');
  });
}

test('F-ah: a lone partition restarted while its record table is still ' +
  'missing is refused at initialization, typed and naming the phase, and ' +
  'releases its database', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions(async ({open}) => {
    const {partition, dbPath} = await open('fah-restart');
    assert.equal((await insert(partition, 'row-0', 'setup', 'e-setup'))
      .success, true, 'setup: the lone leader serves a write');
    await partition.shutdown();
    const damage = new Database(dbPath);
    try {
      damage.exec(`DROP TABLE ${LOST_TABLE}`);
    } finally {
      damage.close();
    }
    const restarted = new PartitionService(
      loneOptions(partition.partitionId, dbPath));
    const escapes = countEscapes();
    let error = null;
    try {
      await restarted.initialize();
    } catch (refusal) {
      error = refusal;
    } finally {
      escapes.stop();
    }
    try {
      assertInitRefusedOnUnreadableRecord(error);
      assert.equal(restarted.raft, null, 'the port was released');
      assert.equal(restarted.db, null, 'the database handle was released');
      assert.equal(recordTablesOf(dbPath).includes(LOST_TABLE), false,
        'the restart did not recreate the lost table empty in place of the ' +
        'record it held');
      assert.deepEqual(escapes.escaped, [], 'nothing escaped');
    } finally {
      await restarted.shutdown();
    }
  });
});

test('F-ah: a follower whose durable record becomes unreadable is held ' +
  'typed while its leader keeps serving; nothing escapes',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'fah-follower';
  const members = [
    [`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'],
    [`${partitionId}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const {services, dbFileOf, waitFor} = group;
  const [leader, follower] = services;
  const escapes = countEscapes();
  try {
    assert.equal((await insert(leader, 'row-0', 'setup', 'f-setup')).success,
      true, 'setup: the group serves a write');
    const termBefore = durableRecordOf(dbFileOf(members[0]), partitionId)
      .hardState.term;
    const generationBefore = leader.raft.readStatus().runtimeGeneration;

    follower.db.exec(`DROP TABLE ${LOST_TABLE}`);
    const answers = [];
    const startedAt = Date.now();
    let sequence = 0;
    while (Date.now() - startedAt < SCHEDULED_SPAN_MS) {
      sequence += 1;
      answers.push(await insert(leader, `row-l${sequence}`, 'load',
        `f-load-${sequence}`));
      await sleep(LEADER_WRITE_INTERVAL_MS);
    }
    assert.ok(answers.length > 0 && answers.every((answer) =>
      answer.success === true), 'the leader served every write while its ' +
      `follower was held (${JSON.stringify(answers.find((answer) =>
        answer.success !== true) ?? null)})`);
    assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER,
      'the leader keeps leading');
    assert.equal(durableRecordOf(dbFileOf(members[0]), partitionId)
      .hardState.term, termBefore, 'the leader\'s term is unchanged');
    assert.equal(leader.raft.readStatus().runtimeGeneration,
      generationBefore, 'the shared runtime was not replaced');
    assert.deepEqual(escapes.escaped, [],
      'no exception or rejection escaped any replica');
    const phase = runtimeConstants.RUNTIME_PHASE.DURABLE_RECORD_READ;
    assert.equal(typeof phase === 'string' && await waitFor(() => answerOf(
      () => follower.raft.readStatus()).value?.phase === phase), true,
    'the follower comes to be held on its unreadable record');
    assertHeldOnUnreadableRecord(
      answerOf(() => follower.raft.readStatus()), 'the follower');
    assert.deepEqual(escapes.escaped, [],
      'nothing escaped while the follower was held');
  } finally {
    await group.dispose();
    escapes.stop();
    resetEnvironment();
  }
});

// F-ap (verification round 6): one rule for every replica count. A replica
// whose durable record cannot be read at open is refused at initialization,
// typed as the lone replica is, and releases its database; its leader keeps
// serving; once the table is restored a fresh initialization serves and
// catches up. Healing in place is for a group that fails while it runs.
test('F-ap: a follower restarted while its record table is missing is ' +
  'refused at initialization, typed and naming the phase and the table; its ' +
  'leader keeps serving, and once the table is restored it initializes and ' +
  'catches up', {timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'fap-follower-restart';
  const members = [
    [`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'],
    [`${partitionId}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId, members, tempPrefix: TEMP_PREFIX,
    serviceOptions: tableOptions(), budgetMs: GROUP_BUDGET_MS,
  });
  const {services, dbFileOf, waitFor} = group;
  const [leader, follower] = services;
  const dbPath = dbFileOf(members[1]);
  const restartOptions = {
    ...tableOptions(),
    partitionId,
    replicaId: follower.replicaId,
    replicaIds: follower.replicaIds,
    peerAddresses: follower.peerAddresses,
    nodeId: follower.nodeId,
    dbPath,
    transport: follower.transport,
    systemTableCache: follower.systemTableCache,
    deferElection: true,
  };
  const restarts = [];
  const escapes = countEscapes();
  try {
    assert.equal((await insert(leader, 'row-0', 'setup', 'fap-setup'))
      .success, true, 'setup: the group serves a write');
    assert.equal(await waitFor(() => rowIds(dbPath).length === 1), true,
      'setup: the follower applied it');
    const saved = durableRecordOf(dbPath, partitionId);
    await follower.shutdown();
    const damage = new Database(dbPath);
    try {
      damage.exec(`DROP TABLE ${LOST_TABLE}`);
    } finally {
      damage.close();
    }

    const refused = new PartitionService(restartOptions);
    restarts.push(refused);
    let error = null;
    try {
      await refused.initialize();
    } catch (refusal) {
      error = refusal;
    }
    assertInitRefusedOnUnreadableRecord(error);
    assert.equal(refused.initialized, false, 'the follower is not initialized');
    assert.equal(refused.raft, null, 'the port was released');
    assert.equal(refused.db, null, 'the database handle was released');
    assert.equal((await insert(leader, 'row-1', 'during', 'fap-during'))
      .success, true, 'the leader keeps serving');
    assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER,
      'the leader keeps leading');

    // The table restored from the store owner's own DDL, its row through
    // the store owner's own writer.
    const repair = new Database(dbPath);
    try {
      repair.exec(RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE);
      restoreAppliedRecord(new RaftRsDurableStore(repair), partitionId,
        saved);
    } finally {
      repair.close();
    }
    const restored = new PartitionService(restartOptions);
    restarts.push(restored);
    await restored.initialize();
    restored.startElection();
    assert.equal(await waitFor(() => rowIds(dbPath).length === 2), true,
      'the restored follower catches up on the write it missed ' +
      `(${JSON.stringify(rowIds(dbPath))})`);
    assert.equal((await insert(leader, 'row-2', 'after', 'fap-after'))
      .success, true, 'the group serves a write');
    assert.equal(await waitFor(() => rowIds(dbPath).length === 3), true,
      'the restored follower applies it');
    assert.deepEqual(rowIds(dbPath), ['row-0', 'row-1', 'row-2'],
      'each write applied once');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    escapes.stop();
    for (const restart of restarts) {
      await restart.shutdown();
    }
    await group.dispose();
    resetEnvironment();
  }
});

// Traps the shared core through one partition's port: a heartbeat whose
// commit lies beyond its log, driven by a tick.
async function trapCoreThrough(partition) {
  const before = partition.raft.readStatus();
  const accepted = await partition.raft.step({
    groupId: partition.partitionId,
    to: before.peerId,
    message: {
      from: String(Number(before.peerId) + FOREIGN_PEER_OFFSET),
      to: before.peerId,
      msgType: HEARTBEAT_MESSAGE_TYPE,
      term: String(Number(before.term) + 1),
      logTerm: '0',
      index: '0',
      commit: TRAPPING_COMMIT,
    },
  });
  assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the trapping envelope is admitted');
  const originalConsoleError = console.error;
  try {
    console.error = () => undefined;
    return await partition.raft.tick();
  } finally {
    console.error = originalConsoleError;
  }
}

test('F-ah: a core failure restores every readable group; a group whose ' +
  'record is unreadable is held by its own failure and touches no other ' +
  'group', {timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  try {
    await withLonePartitions(async ({open}) => {
      const deferred = {deferElection: true};
      const victim = await open('fah-trapped', deferred);
      const sibling = await open('fah-restored', deferred);
      const damaged = await open('fah-unreadable', deferred);
      for (const [service, id] of [[victim, 'v'], [sibling, 's'],
        [damaged, 'd']]) {
        assert.equal((await insert(service.partition, `${id}-0`, 'setup',
          `${id}-setup`)).success, true, `setup: ${id} serves a write`);
      }
      const generationBefore = sibling.partition.raft.readStatus()
        .runtimeGeneration;
      damaged.partition.db.exec(`DROP TABLE ${LOST_TABLE}`);
      const trapped = await trapCoreThrough(victim.partition);
      assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL,
        `setup: the core trapped (${JSON.stringify(trapped)})`);

      // The sibling's next operation replaces the runtime.
      const siblingStatus = answerOf(() => sibling.partition.raft
        .readStatus());
      assert.equal(siblingStatus.threw, null, 'the replacement answers the ' +
        `sibling's operation, never throws (${siblingStatus.threw})`);
      assert.equal(siblingStatus.value.runtimeGeneration,
        generationBefore + 1, 'the shared runtime was replaced once');
      assert.equal(siblingStatus.value.role, RAFT_ROLE.LEADER,
        'the sibling was restored and leads');
      assertHeldOnUnreadableRecord(
        answerOf(() => damaged.partition.raft.readStatus()), 'the damaged ' +
        'group');
      assert.equal((await insert(sibling.partition, 's-1', 'after',
        's-after')).success, true, 'the sibling serves a write');
      assert.equal((await insert(victim.partition, 'v-1', 'after',
        'v-after')).success, true, 'the trapped group was restored and ' +
        'serves a write');
      assert.equal((await insert(damaged.partition, 'd-1', 'after',
        'd-after')).success, false, 'the damaged group is refused');
      assert.deepEqual(escapes.escaped, [], 'nothing escaped');
    });
  } finally {
    escapes.stop();
  }
});

// F-ao (verification round 6): the record's four tables are created in one
// transaction of the store's own. A creation that fails part way - here the
// database reaches its page limit at the third table, a real SQLITE_FULL -
// leaves no table, so the next open creates the whole record and the
// partition serves; a partial schema can then only come from outside, and it
// stays a typed refusal naming the missing table, with nothing created in
// its place.
test('F-ao: the durable record\'s tables are created whole or not at all, ' +
  'and a partial schema made outside is refused typed',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLonePartitions(async ({open, directory}) => {
    // The pages the first two tables take, by the store owner's own DDL on
    // a scratch database.
    const scratch = new Database(path.join(directory, `scratch-${DB_FILE}`));
    let pagesForTwoTables = 0;
    try {
      scratch.exec(RAFT_RS_SQL.CREATE_LOG_TABLE);
      scratch.exec(RAFT_RS_SQL.CREATE_HARD_STATE_TABLE);
      pagesForTwoTables = scratch.pragma('page_count', {simple: true});
    } finally {
      scratch.close();
    }
    const wholePath = path.join(directory, `fao-whole-${DB_FILE}`);
    const capped = new Database(wholePath);
    let failure = null;
    try {
      capped.pragma(`max_page_count = ${pagesForTwoTables}`);
      try {
        new RaftRsDurableStore(capped);
      } catch (error) {
        failure = error;
      }
    } finally {
      capped.close();
    }
    assert.equal(failure?.code, 'SQLITE_FULL', 'setup: the creation failed ' +
      `when the database reached its page limit (${failure?.message})`);
    assert.deepEqual(recordTablesOf(wholePath), [],
      'the failed creation left no record table');
    // The page limit was that connection's own; the partition opens the
    // file afresh.
    const {partition} = await open('fao-whole');
    assert.equal((await insert(partition, 'row-0', 'whole', 'fao-whole'))
      .success, true, 'a partition initializes on that database and serves ' +
      'a write');
    assert.deepEqual(recordTablesOf(wholePath), [...RAFT_RS_RECORD_TABLES],
      'with the whole record');

    const partialPath = path.join(directory, `fao-partial-${DB_FILE}`);
    const byHand = new Database(partialPath);
    try {
      byHand.exec(RAFT_RS_SQL.CREATE_LOG_TABLE);
      byHand.exec(RAFT_RS_SQL.CREATE_HARD_STATE_TABLE);
    } finally {
      byHand.close();
    }
    const partialTables = recordTablesOf(partialPath);
    const partial = new PartitionService(
      loneOptions('fao-partial', partialPath));
    let error = null;
    try {
      await partial.initialize();
    } catch (refusal) {
      error = refusal;
    }
    try {
      assertInitRefusedOnUnreadableRecord(error);
      assert.equal(partial.db, null, 'the database handle was released');
      assert.deepEqual(recordTablesOf(partialPath), partialTables,
        'nothing was created in place of the missing tables');
    } finally {
      await partial.shutdown();
    }
  });
});
