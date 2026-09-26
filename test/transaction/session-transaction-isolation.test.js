// A user session transaction never contains consensus persistence, and a
// session's ROLLBACK can never erase consensus rows (quest
// raft-rs-single-path-partition-cutover, F6 layer 1, witnesses W1, W2 and W6
// of the session-transaction isolation design).
//
// Every partition here is built the way production builds one, on a
// file-backed database, so the durable rs-raft record can be read on an
// independent read-only connection. Expectations come from the partition's
// own operation port (readStatus), from that independent read of the durable
// record and of the rows a SELECT returns, and from the owners' own typed
// vocabulary - never from the path under test.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import * as partitionVocabulary from
  '../../src/partition/partition-service-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const {PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_SQL} =
  partitionVocabulary;
const TEMP_PREFIX = 'session-transaction-isolation-';
const DB_FILE = 'partition.sqlite';
const PAYLOAD_ENCODING = 'base64';
const TABLE_NAME = 'isolation_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_ALL_SQL = `SELECT id, value FROM ${TABLE_NAME} ORDER BY id`;
const SELECT_ONE_SQL = `SELECT id, value FROM ${TABLE_NAME} WHERE id = ?`;
const TEST_TIMEOUT_MS = 30000;
// Inputs: the rows a client writes and the sessions it names.
const SESSIONLESS_FIRST = Object.freeze({id: 'row-a', value: 'first'});
const SESSIONLESS_SECOND = Object.freeze({id: 'row-b', value: 'second'});
const SESSION_ROW = Object.freeze({id: 'row-s', value: 'in-session'});
const DURING_SESSION = Object.freeze({id: 'row-d', value: 'during-session'});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'isolation-node'}});
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
    nodeId: 'isolation-node',
    dbPath,
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
  };
}

function withIndependent(dbPath, read) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

/**
 * The partition's durable rs-raft record, on an independent connection.
 * @param {string} dbPath - The partition database.
 * @param {string} groupId - The partition id (the group).
 * @return {Object} Commit, applied and the payload entries, decoded.
 */
function durableRecordOf(dbPath, groupId) {
  return withIndependent(dbPath, (independent) => {
    const hard = independent.prepare(
      'SELECT commit_index FROM _raft_rs_hard_state WHERE group_id = ?')
      .get(groupId);
    const applied = independent.prepare(
      'SELECT applied_index FROM _raft_rs_applied_state WHERE group_id = ?')
      .get(groupId);
    const entries = independent.prepare(
      'SELECT log_index, term, entry_type, data FROM _raft_rs_log ' +
      'WHERE group_id = ? ORDER BY log_index').all(groupId);
    return {
      commitIndex: hard === undefined ? null : Number(hard.commit_index),
      appliedIndex: applied === undefined ? null :
        Number(applied.applied_index),
      entries: entries.map((row) => ({
        index: Number(row.log_index),
        term: Number(row.term),
        entryType: Number(row.entry_type),
        data: row.data,
      })),
    };
  });
}

function lastProposal(record) {
  const last = record.entries.filter((entry) =>
    entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL && entry.data !== null)
    .at(-1);
  return last === undefined ? null : decodeCommittedProposal(
    Buffer.from(last.data, PAYLOAD_ENCODING));
}

function rowsOf(dbPath, sql, params = []) {
  return withIndependent(dbPath, (independent) =>
    independent.prepare(sql).all(...params)
      .map(({id, value}) => ({id, value})));
}

function sessionlessWrite(service, row, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [row.id, row.value],
    entryId,
  });
}

async function shutdownQuietly(service) {
  try {
    await service?.shutdown?.();
  } catch {
    // The assertion under test already recorded what mattered.
  }
}

function tempDbPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  return {directory, dbPath: path.join(directory, DB_FILE)};
}

test('W1 a session rollback never erases consensus rows, and the partition ' +
  'restarts from its rs-raft record (PartitionService rollbackTransaction)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  const options = partitionOptions('w1-rollback', dbPath);
  let restarted = null;
  try {
    const first = new PartitionService(withFoundingStamp(options));
    let beforeSession;
    let afterSession;
    let status;
    try {
      await first.initialize();
      const written = await sessionlessWrite(first, SESSIONLESS_FIRST, 'w1-a');
      assert.equal(written.success, true, JSON.stringify(written));
      beforeSession = durableRecordOf(dbPath, first.partitionId);
      await first.beginTransaction('s1');
      await first.executeQuery(INSERT_SQL,
        [SESSION_ROW.id, SESSION_ROW.value], {sessionId: 's1'});
      await first.rollbackTransaction('s1');
      afterSession = durableRecordOf(dbPath, first.partitionId);
      status = first.raft.readStatus();
      const second = await sessionlessWrite(first, SESSIONLESS_SECOND,
        'w1-b');
      assert.equal(second.success, true, JSON.stringify(second));
    } finally {
      await first.shutdown();
    }
    const beforeRestart = durableRecordOf(dbPath, options.partitionId);
    let restartOutcome = null;
    restarted = new PartitionService(withFoundingStamp(options));
    try {
      await restarted.initialize();
    } catch (error) {
      restartOutcome = error;
    }
    // Every fact is measured before any is asserted, so a red names them all.
    const kept = beforeSession.entries.filter((entry) =>
      afterSession.entries.some((later) =>
        later.index === entry.index && later.term === entry.term &&
        later.data === entry.data));
    const indices = beforeRestart.entries.map((entry) => entry.index);
    assert.deepEqual({
      preSessionEntriesKept: kept.length,
      durableCommit: afterSession.commitIndex,
      durableApplied: afterSession.appliedIndex,
      durableLogContiguous: indices.every((index, position) =>
        position === 0 || index === indices[position - 1] + 1),
      restartOutcome: restartOutcome === null ? null :
        String(restartOutcome.message),
      servedRows: rowsOf(dbPath, SELECT_ALL_SQL),
    }, {
      preSessionEntriesKept: beforeSession.entries.length,
      durableCommit: status.commitIndex,
      durableApplied: status.commitIndex,
      durableLogContiguous: true,
      restartOutcome: null,
      servedRows: [SESSIONLESS_FIRST, SESSIONLESS_SECOND].map(({id, value}) =>
        ({id, value})),
    }, 'after the session rolled back, the durable record holds everything ' +
      'the core committed and applied, and the partition restarts from it ' +
      `(core ${JSON.stringify(status)}; durable log indices ` +
      `${JSON.stringify(indices)} commit ${beforeRestart.commitIndex}; ` +
      `restart ${restartOutcome?.stack})`);
  } finally {
    await shutdownQuietly(restarted);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('W2 an acknowledged sessionless write is never erased by a named ' +
  'session\'s rollback (partition write path under an open session)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  const service = new PartitionService(withFoundingStamp(partitionOptions('w2-ack', dbPath)));
  try {
    await service.initialize();
    await service.beginTransaction('s1');
    // Named session, so the sessionless write is not absorbed into it.
    const during = await service.executeQuery(INSERT_SQL,
      [DURING_SESSION.id, DURING_SESSION.value]);
    await service.rollbackTransaction('s1');
    const present = rowsOf(dbPath, SELECT_ONE_SQL, [DURING_SESSION.id]);
    const deferral =
      partitionVocabulary.PARTITION_SERVICE_ERROR_MSG
        ?.WRITE_DEFERRED_USER_TRANSACTION_OPEN;
    if (during?.success === true) {
      assert.deepEqual(present, [{...DURING_SESSION}],
        'an acknowledged write is present after the rollback: ' +
        JSON.stringify(during));
    } else {
      assert.deepEqual({
        success: during?.success,
        deferRetry: during?.deferRetry,
        error: during?.error,
        present,
      }, {
        success: false,
        deferRetry: true,
        error: deferral ?? 'a named deferral message',
        present: [],
      }, 'an unacknowledged write is the typed deferral: ' +
        JSON.stringify(during));
    }

    // The same write issued while the session is open and awaited after it
    // ends is acknowledged and durable.
    await service.beginTransaction('s2');
    const pending = service.executeQuery(INSERT_SQL,
      [SESSIONLESS_FIRST.id, SESSIONLESS_FIRST.value]);
    await service.rollbackTransaction('s2');
    const settled = await pending;
    assert.equal(settled.success, true,
      'a write deferred by an open session lands once it ends: ' +
      JSON.stringify(settled));
    assert.deepEqual(rowsOf(dbPath, SELECT_ONE_SQL, [SESSIONLESS_FIRST.id]),
      [{...SESSIONLESS_FIRST}], 'the acknowledged deferred write is present');
    const record = durableRecordOf(dbPath, service.partitionId);
    assert.equal(record.commitIndex, service.raft.readStatus().commitIndex,
      'the durable commit equals the core commit');
  } finally {
    await shutdownQuietly(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('W6 a session\'s commit and rollback markers are proposed only after ' +
  'its terminal SQLite statement (transaction owner marker order)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  const service = new PartitionService(withFoundingStamp(partitionOptions('w6-order', dbPath)));
  try {
    await service.initialize();
    const written = await sessionlessWrite(service, SESSIONLESS_FIRST,
      'w6-a');
    assert.equal(written.success, true, JSON.stringify(written));
    // Observe the partition's own connection: at the moment the session's
    // terminal statement runs, what has consensus already committed?
    const terminal = [];
    const exec = service.db.exec.bind(service.db);
    service.db.exec = (sql) => {
      if (sql === PARTITION_SERVICE_SQL.COMMIT ||
          sql === PARTITION_SERVICE_SQL.ROLLBACK) {
        terminal.push({sql, coreCommit: service.raft.readStatus().commitIndex});
      }
      return exec(sql);
    };

    const begunCommit = await service.beginTransaction('s1');
    const commitBefore = service.raft.readStatus().commitIndex;
    await service.executeQuery(INSERT_SQL,
      [SESSION_ROW.id, SESSION_ROW.value], {sessionId: 's1'});
    await service.commitTransaction('s1');
    const afterCommit = durableRecordOf(dbPath, service.partitionId);
    const outcome = withIndependent(dbPath, (independent) => independent
      .prepare(PARTITION_SERVICE_SQL.SELECT_TRANSACTION_OUTCOME)
      .get('s1', Number.isFinite(begunCommit.transactionEpoch) ?
        Math.floor(begunCommit.transactionEpoch) : 0));
    const commitMarker = lastProposal(afterCommit);

    await service.beginTransaction('s2');
    const rollbackBefore = service.raft.readStatus().commitIndex;
    await service.executeQuery(INSERT_SQL,
      [SESSIONLESS_SECOND.id, SESSIONLESS_SECOND.value], {sessionId: 's2'});
    await service.rollbackTransaction('s2');
    const afterRollback = durableRecordOf(dbPath, service.partitionId);
    const rollbackMarker = lastProposal(afterRollback);
    const status = service.raft.readStatus();

    assert.deepEqual({
      commitMarker: {type: commitMarker?.type,
        sessionId: commitMarker?.sessionId},
      commitOutcome: outcome?.outcome ?? null,
      rollbackMarker: {type: rollbackMarker?.type,
        sessionId: rollbackMarker?.sessionId},
      durableCommit: afterRollback.commitIndex,
      terminalStatements: terminal,
    }, {
      commitMarker: {type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
        sessionId: 's1'},
      commitOutcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      rollbackMarker: {type: PARTITION_SERVICE_OPERATION.ROLLBACK,
        sessionId: 's2'},
      durableCommit: status.commitIndex,
      terminalStatements: [
        {sql: PARTITION_SERVICE_SQL.COMMIT, coreCommit: commitBefore},
        {sql: PARTITION_SERVICE_SQL.ROLLBACK, coreCommit: rollbackBefore},
      ],
    }, 'each marker is proposed after its session ended and is durable');
  } finally {
    await shutdownQuietly(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});
