// A user session transaction never contains consensus persistence, and a
// session's ROLLBACK can never erase consensus rows (quest
// raft-rs-single-path-partition-cutover, F6 layer 1, witnesses W1, W2 and W6
// of the session-transaction isolation design). Superseded by TX1 design
// revision 10, section 9.2 (quest replicated-transaction-decision-and-apply):
// a participant session stages under F6 c' and never holds a SQLite
// transaction on the partition's connection, so W1 and W2 now witness that a
// session never touches the connection and never defers or erases a
// sessionless write, and W6 that a transaction ends through its committed
// PARTICIPANT_PREPARE and PARTICIPANT_DECISION with its outcome row in
// `_participant_transactions`. The store's refusal of a consensus write
// inside a transaction it did not open stays as enforcement
// (persistence-admission.test.js).
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
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import * as partitionVocabulary from
  '../../src/partition/partition-service-constants.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_STATE as STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  beginMessage,
  bindingOf,
  identityOf,
  prepareMessage,
  queryMessage,
  send,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

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

// Participant transactions on this partition: enabled once (the generation
// origin committed through its own lone leader), each named by its
// transactionId and routed under a sessionId.
async function enableTransactions(service) {
  const enabled = await enableParticipantTransactionAdmission(service);
  assert.equal(enabled.success, true, JSON.stringify(enabled));
}

function transactionOf(service, transactionId, sessionId) {
  return identityOf(transactionId, {partitionId: service.partitionId, sessionId});
}

test('W1 a participant session never touches the partition\'s connection, so ' +
  'unbinding it can never erase consensus rows, and the partition restarts ' +
  'from its rs-raft record (design 9.2: W1 superseded by F6 c\')',
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
    const connectionHeld = [];
    try {
      await first.initialize();
      const written = await sessionlessWrite(first, SESSIONLESS_FIRST, 'w1-a');
      assert.equal(written.success, true, JSON.stringify(written));
      await enableTransactions(first);
      beforeSession = durableRecordOf(dbPath, first.partitionId);
      const tx = transactionOf(first, 'w1-tx', 's1');
      assert.equal((await send(first, beginMessage(tx))).success, true);
      connectionHeld.push(first.db.inTransaction);
      const staged = await send(first, queryMessage(tx, INSERT_SQL,
        [SESSION_ROW.id, SESSION_ROW.value]));
      assert.equal(staged.provisional, true, JSON.stringify(staged));
      connectionHeld.push(first.db.inTransaction);
      const unbound = await send(first,
        txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx));
      assert.equal(unbound.success, true, JSON.stringify(unbound));
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
      connectionHeld,
      preSessionEntriesKept: kept.length,
      durableCommit: afterSession.commitIndex,
      durableApplied: afterSession.appliedIndex,
      durableLogContiguous: indices.every((index, position) =>
        position === 0 || index === indices[position - 1] + 1),
      restartOutcome: restartOutcome === null ? null :
        String(restartOutcome.message),
      servedRows: rowsOf(dbPath, SELECT_ALL_SQL),
    }, {
      connectionHeld: [false, false],
      preSessionEntriesKept: beforeSession.entries.length,
      durableCommit: status.commitIndex,
      durableApplied: status.commitIndex,
      durableLogContiguous: true,
      restartOutcome: null,
      servedRows: [SESSIONLESS_FIRST, SESSIONLESS_SECOND].map(({id, value}) =>
        ({id, value})),
    }, 'the session held no SQLite transaction; the durable record holds ' +
      'everything the core committed and applied, and the partition restarts ' +
      `from it (core ${JSON.stringify(status)}; durable log indices ` +
      `${JSON.stringify(indices)} commit ${beforeRestart.commitIndex}; ` +
      `restart ${restartOutcome?.stack})`);
  } finally {
    await shutdownQuietly(restarted);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('W2 a sessionless write under an open participant session is always ' +
  'acknowledged and applied, never deferred, and no session ending erases ' +
  'it (design 9.2: W2 superseded by F6 c\')',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  const service = new PartitionService(withFoundingStamp(partitionOptions('w2-ack', dbPath)));
  try {
    await service.initialize();
    await enableTransactions(service);
    const first = transactionOf(service, 'w2-tx1', 's1');
    await send(service, beginMessage(first));
    const during = await service.executeQuery(INSERT_SQL,
      [DURING_SESSION.id, DURING_SESSION.value]);
    await send(service, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, first));
    // The same write issued while a session is open and awaited after it
    // ends.
    const second = transactionOf(service, 'w2-tx2', 's2');
    await send(service, beginMessage(second));
    const pending = service.executeQuery(INSERT_SQL,
      [SESSIONLESS_FIRST.id, SESSIONLESS_FIRST.value]);
    await send(service, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, second));
    const settled = await pending;
    const record = durableRecordOf(dbPath, service.partitionId);
    assert.deepEqual({
      during: {success: during?.success, deferRetry: during?.deferRetry ?? null},
      settled: settled?.success,
      present: [...rowsOf(dbPath, SELECT_ONE_SQL, [DURING_SESSION.id]),
        ...rowsOf(dbPath, SELECT_ONE_SQL, [SESSIONLESS_FIRST.id])],
      durableCommit: record.commitIndex,
    }, {
      during: {success: true, deferRetry: null},
      settled: true,
      present: [{...DURING_SESSION}, {...SESSIONLESS_FIRST}],
      durableCommit: service.raft.readStatus().commitIndex,
    }, 'no session defers or erases a sessionless write: ' +
      JSON.stringify({during, settled}));
  } finally {
    await shutdownQuietly(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

// One participant transaction through PREPARE and a bound decision; the
// commands it proposed, read back from the durable log, and its row.
async function decideThroughConsensus(service, dbPath, tx, row, decision) {
  await send(service, beginMessage(tx));
  await send(service, queryMessage(tx, INSERT_SQL, [row.id, row.value]));
  const prepared = await send(service, prepareMessage(tx));
  const decided = await send(service, txMessage(decision === DECISION.COMMIT ?
    PARTITION_SERVICE_OPERATION.COMMIT : PARTITION_SERVICE_OPERATION.ROLLBACK,
  tx, bindingOf(tx, decision, prepared?.preparedDigest)));
  const record = durableRecordOf(dbPath, service.partitionId);
  return {
    prepared: prepared?.state ?? null,
    decided: decided?.state ?? null,
    commands: record.entries.filter((entry) => entry.data !== null)
      .map((entry) => decodeCommittedProposal(Buffer.from(entry.data,
        PAYLOAD_ENCODING)))
      .filter((command) => command.participantId === tx.participantId)
      .map((command) => ({type: command.type, decision: command.decision ?? null})),
    row: withIndependent(dbPath, (independent) => independent
      .prepare('SELECT state FROM _participant_transactions ' +
        'WHERE transaction_id = ?').get(tx.transactionId)?.state ?? null),
  };
}

test('W6 a participant transaction ends through its committed PARTICIPANT_PREPARE ' +
  'and PARTICIPANT_DECISION, with no terminal SQLite statement, and its outcome ' +
  'row is _participant_transactions (design 9.2: W6 superseded)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  const service = new PartitionService(withFoundingStamp(partitionOptions('w6-order', dbPath)));
  try {
    await service.initialize();
    const written = await sessionlessWrite(service, SESSIONLESS_FIRST,
      'w6-a');
    assert.equal(written.success, true, JSON.stringify(written));
    await enableTransactions(service);
    // Observe the partition's own connection: no session statement ever
    // ends a SQLite transaction on it.
    const terminal = [];
    const exec = service.db.exec.bind(service.db);
    service.db.exec = (sql) => {
      if (sql === PARTITION_SERVICE_SQL.COMMIT ||
          sql === PARTITION_SERVICE_SQL.ROLLBACK) {
        terminal.push(sql);
      }
      return exec(sql);
    };
    const committed = await decideThroughConsensus(service, dbPath,
      transactionOf(service, 'w6-tx1', 's1'), SESSION_ROW, DECISION.COMMIT);
    const rolledBack = await decideThroughConsensus(service, dbPath,
      transactionOf(service, 'w6-tx2', 's2'), SESSIONLESS_SECOND,
      DECISION.ROLLBACK);
    const record = durableRecordOf(dbPath, service.partitionId);
    const prepareThen = (decision) => [
      {type: PARTICIPANT_TRANSACTION_COMMAND.PREPARE, decision: null},
      {type: PARTICIPANT_TRANSACTION_COMMAND.DECISION, decision}];
    assert.deepEqual({committed, rolledBack, terminalStatements: terminal,
      durableCommit: record.commitIndex,
      rows: rowsOf(dbPath, SELECT_ALL_SQL)}, {
      committed: {prepared: STATE.PREPARED, decided: STATE.COMMITTED,
        commands: prepareThen(DECISION.COMMIT), row: STATE.COMMITTED},
      rolledBack: {prepared: STATE.PREPARED, decided: STATE.ROLLED_BACK,
        commands: prepareThen(DECISION.ROLLBACK), row: STATE.ROLLED_BACK},
      terminalStatements: [],
      durableCommit: service.raft.readStatus().commitIndex,
      rows: [SESSIONLESS_FIRST, SESSION_ROW].map(({id, value}) => ({id, value})),
    }, 'each decision is a committed command over a PREPARED row');
  } finally {
    await shutdownQuietly(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});
