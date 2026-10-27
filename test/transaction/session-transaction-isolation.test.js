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
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_DECISION as DECISION,
  PARTICIPANT_TRANSACTION_STATE as STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {hasParticipantSession} from
  '../../src/partition/partition-participant-transaction-session.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  applyCommitted,
  awaitProposal,
  beginMessage,
  bindingOf,
  commitOrdinaryWrite,
  identityOf,
  isDecisionCommand,
  isPrepareCommand,
  prepareMessage,
  queryMessage,
  send,
  shutdownAll,
  startLeader,
  track,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

const TEMP_PREFIX = 'session-transaction-isolation-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'test_table';
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
 * @return {Object} The durable applied index.
 */
function durableRecordOf(dbPath, groupId) {
  return withIndependent(dbPath, (independent) => {
    return {
      appliedIndex: Number(RaftRsDurableStore.readAppliedIndexIn(
        independent, groupId)),
    };
  });
}

function rowsOf(dbPath, sql, params = []) {
  return withIndependent(dbPath, (independent) =>
    independent.prepare(sql).all(...params)
      .map(({id, value}) => ({id, value})));
}

function tempDbPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  return {directory, dbPath: path.join(directory, DB_FILE)};
}

function transactionOf(service, transactionId, sessionId) {
  return identityOf(transactionId, {partitionId: service.partitionId, sessionId});
}

test('W1 a participant session never touches the partition\'s connection, so ' +
  'unbinding it can never erase applied consensus rows ' +
  '(design 9.2: W1 superseded by F6 c\')',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  let first = null;
  const startedAt = performance.now();
  const diagnose = (phase, state) => t.diagnostic(
    `W1 ${phase} ${state} elapsedMs=${Math.round(performance.now() - startedAt)}`);
  try {
    diagnose('startLeader', 'start');
    const started = await startLeader({dbPath});
    diagnose('startLeader', 'end');
    first = started.leader;
    const proposed = started.proposed;
    const connectionHeld = [];
    diagnose('firstWrite', 'start');
    const written = await commitOrdinaryWrite(first, proposed, 'w1-a',
      SESSIONLESS_FIRST);
    diagnose('firstWrite', 'end');
    assert.deepEqual(written, {apply: null, answer: true});
    const beforeSession = durableRecordOf(dbPath, first.partitionId);
    const tx = transactionOf(first, 'w1-tx', 's1');
    diagnose('begin', 'start');
    const begun = await send(first, beginMessage(tx));
    diagnose('begin', 'end');
    assert.equal(begun.success, true);
    connectionHeld.push(first.db.inTransaction);
    diagnose('stagedQuery', 'start');
    const staged = await send(first, queryMessage(tx, INSERT_SQL,
      [SESSION_ROW.id, SESSION_ROW.value]));
    diagnose('stagedQuery', 'end');
    assert.equal(staged.provisional, true, JSON.stringify(staged));
    connectionHeld.push(first.db.inTransaction);
    diagnose('rollback', 'start');
    const unbound = await send(first,
      txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx));
    diagnose('rollback', 'end');
    assert.equal(unbound.success, true, JSON.stringify(unbound));
    const afterSession = durableRecordOf(dbPath, first.partitionId);
    const status = first.raft.readStatus();
    const rowsAfterRollback = rowsOf(dbPath, SELECT_ALL_SQL);
    diagnose('secondWrite', 'start');
    const second = await commitOrdinaryWrite(first, proposed, 'w1-b',
      SESSIONLESS_SECOND);
    diagnose('secondWrite', 'end');
    assert.deepEqual(second, {apply: null, answer: true});
    const finalRecord = durableRecordOf(dbPath, first.partitionId);
    // Every fact is measured before any is asserted, so a red names them all.
    assert.deepEqual({
      connectionHeld,
      durableAppliedBeforeSession: beforeSession.appliedIndex,
      durableAppliedAfterRollback: afterSession.appliedIndex,
      durableAppliedAfterSecond: finalRecord.appliedIndex,
      rowsAfterRollback,
      servedRows: rowsOf(dbPath, SELECT_ALL_SQL),
    }, {
      connectionHeld: [false, false],
      durableAppliedBeforeSession: status.appliedIndex,
      durableAppliedAfterRollback: status.appliedIndex,
      durableAppliedAfterSecond: status.appliedIndex + 1,
      rowsAfterRollback: [SESSIONLESS_FIRST].map(({id, value}) => ({id, value})),
      servedRows: [SESSIONLESS_FIRST, SESSIONLESS_SECOND].map(({id, value}) =>
        ({id, value})),
    }, 'the session held no SQLite transaction; the durable record holds ' +
      'everything the core applied ' +
      `(core ${JSON.stringify(status)}; applied ${finalRecord.appliedIndex})`);
  } finally {
    diagnose('shutdown', 'start');
    await shutdownAll(first);
    diagnose('shutdown', 'end');
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
  let service = null;
  try {
    const started = await startLeader({dbPath});
    service = started.leader;
    const proposed = started.proposed;
    const first = transactionOf(service, 'w2-tx1', 's1');
    const firstBegin = await send(service, beginMessage(first));
    const firstBeforeWrite = hasParticipantSession(service);
    const during = await commitOrdinaryWrite(service, proposed, 'w2-during',
      DURING_SESSION);
    const firstAfterWrite = hasParticipantSession(service);
    const firstRollback = await send(service,
      txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, first));
    const firstAfterRollback = hasParticipantSession(service);
    const second = transactionOf(service, 'w2-tx2', 's2');
    const secondBegin = await send(service, beginMessage(second));
    const secondBeforeWrite = hasParticipantSession(service);
    const settled = await commitOrdinaryWrite(service, proposed, 'w2-second',
      SESSIONLESS_FIRST);
    const secondAfterWrite = hasParticipantSession(service);
    const secondRollback = await send(service,
      txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, second));
    const secondAfterRollback = hasParticipantSession(service);
    const record = durableRecordOf(dbPath, service.partitionId);
    assert.deepEqual({
      sessions: {firstBegin: firstBegin?.success,
        firstBeforeWrite, firstAfterWrite,
        firstRollback: firstRollback?.success, firstAfterRollback,
        secondBegin: secondBegin?.success,
        secondBeforeWrite, secondAfterWrite,
        secondRollback: secondRollback?.success, secondAfterRollback},
      during,
      settled,
      present: [...rowsOf(dbPath, SELECT_ONE_SQL, [DURING_SESSION.id]),
        ...rowsOf(dbPath, SELECT_ONE_SQL, [SESSIONLESS_FIRST.id])],
      durableApplied: record.appliedIndex,
    }, {
      sessions: {firstBegin: true,
        firstBeforeWrite: true, firstAfterWrite: true,
        firstRollback: true, firstAfterRollback: false,
        secondBegin: true,
        secondBeforeWrite: true, secondAfterWrite: true,
        secondRollback: true, secondAfterRollback: false},
      during: {apply: null, answer: true},
      settled: {apply: null, answer: true},
      present: [{...DURING_SESSION}, {...SESSIONLESS_FIRST}],
      durableApplied: service.raft.readStatus().appliedIndex,
    }, 'no session defers or erases a sessionless write: ' +
      JSON.stringify({during, settled}));
  } finally {
    await shutdownAll(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

// One participant transaction through PREPARE and a bound decision; the
// current consensus seam's proposals and its durable outcome row.
async function decideThroughConsensus(service, proposed, dbPath, tx, row, decision) {
  const begun = await send(service, beginMessage(tx));
  const staged = await send(service, queryMessage(tx, INSERT_SQL, [row.id, row.value]));
  const connectionHeld = [service.db.inTransaction];
  const prepare = track(send(service, prepareMessage(tx)));
  const prepareCommand = await awaitProposal(proposed,
    (entry) => isPrepareCommand(entry) && entry.transactionId === tx.transactionId);
  assert.ok(prepareCommand, 'PREPARE must be proposed');
  connectionHeld.push(service.db.inTransaction);
  const prepareSettledBeforeApply = prepare.settled;
  const prepareApply = applyCommitted(service, prepareCommand);
  const prepared = await prepare.promise;
  connectionHeld.push(service.db.inTransaction);
  const decisionRequest = track(send(service, txMessage(decision === DECISION.COMMIT ?
    PARTITION_SERVICE_OPERATION.COMMIT : PARTITION_SERVICE_OPERATION.ROLLBACK,
  tx, bindingOf(tx, decision, prepared?.preparedDigest))));
  const decisionCommand = await awaitProposal(proposed,
    (entry) => isDecisionCommand(entry) && entry.transactionId === tx.transactionId);
  assert.ok(decisionCommand, 'decision must be proposed');
  connectionHeld.push(service.db.inTransaction);
  const decisionSettledBeforeApply = decisionRequest.settled;
  const decisionApply = applyCommitted(service, decisionCommand);
  const decided = await decisionRequest.promise;
  connectionHeld.push(service.db.inTransaction);
  return {
    begun: begun?.success ?? false,
    staged: staged?.provisional ?? false,
    connectionHeld,
    prepareSettledBeforeApply,
    prepareApply,
    prepared: prepared?.state ?? null,
    decisionSettledBeforeApply,
    decisionApply,
    decided: decided?.state ?? null,
    commands: proposed
      .filter((command) => command.participantId === tx.participantId)
      .map((command) => ({type: command.type, decision: command.decision ?? null})),
    row: withIndependent(dbPath, (independent) => independent
      .prepare('SELECT state FROM _participant_transactions ' +
        'WHERE transaction_id = ?').get(tx.transactionId)?.state ?? null),
  };
}

test('W6 a participant transaction ends through its committed PARTICIPANT_PREPARE ' +
  'and PARTICIPANT_DECISION without holding the SQLite connection, and its outcome ' +
  'row is _participant_transactions (design 9.2: W6 superseded)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  quietEnvironment();
  const {directory, dbPath} = tempDbPath();
  let service = null;
  try {
    const started = await startLeader({dbPath});
    service = started.leader;
    const proposed = started.proposed;
    const written = await commitOrdinaryWrite(service, proposed, 'w6-a',
      SESSIONLESS_FIRST);
    assert.deepEqual(written, {apply: null, answer: true});
    const committed = await decideThroughConsensus(service, proposed, dbPath,
      transactionOf(service, 'w6-tx1', 's1'), SESSION_ROW, DECISION.COMMIT);
    const rolledBack = await decideThroughConsensus(service, proposed, dbPath,
      transactionOf(service, 'w6-tx2', 's2'), SESSIONLESS_SECOND,
      DECISION.ROLLBACK);
    const record = durableRecordOf(dbPath, service.partitionId);
    const prepareThen = (decision) => [
      {type: PARTICIPANT_TRANSACTION_COMMAND.PREPARE, decision: null},
      {type: PARTICIPANT_TRANSACTION_COMMAND.DECISION, decision}];
    assert.deepEqual({committed, rolledBack,
      durableApplied: record.appliedIndex,
      rows: rowsOf(dbPath, SELECT_ALL_SQL)}, {
      committed: {begun: true, staged: true,
        connectionHeld: [false, false, false, false, false],
        prepareSettledBeforeApply: false, prepareApply: null,
        prepared: STATE.PREPARED,
        decisionSettledBeforeApply: false, decisionApply: null,
        decided: STATE.COMMITTED,
        commands: prepareThen(DECISION.COMMIT), row: STATE.COMMITTED},
      rolledBack: {begun: true, staged: true,
        connectionHeld: [false, false, false, false, false],
        prepareSettledBeforeApply: false, prepareApply: null,
        prepared: STATE.PREPARED,
        decisionSettledBeforeApply: false, decisionApply: null,
        decided: STATE.ROLLED_BACK,
        commands: prepareThen(DECISION.ROLLBACK), row: STATE.ROLLED_BACK},
      durableApplied: service.raft.readStatus().appliedIndex,
      rows: [SESSIONLESS_FIRST, SESSION_ROW].map(({id, value}) => ({id, value})),
    }, 'each decision is a committed command over a PREPARED row');
  } finally {
    await shutdownAll(service);
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});
