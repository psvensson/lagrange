/**
 * TX1 (quest replicated-transaction-decision-and-apply) increment 4,
 * corrective round: the legacy sessionId-only session path in the L6 window.
 * Every legacy session statement is admitted by the statement-admission owner
 * before anything is prepared on the shared connection, as a sessionless one
 * is (owner condition 4's session half, design 3.3): a PRAGMA or TEMP DDL set
 * there would outlive the session, survive the enable of participant
 * admission and change what later committed participant statements do on
 * that replica only. That is prevention; cleanup is the cutover's (owner
 * ruling 2026-10-11, boundary A): admission is enabled only on a connection
 * that served no legacy session since its open, and the cutover reopens the
 * others through the lifecycle owner. The L6 fence also refuses a
 * sessionId-only request that names a PREPARED participant row (a store
 * read), never running it as an ordinary write (design revision 10, 0.0.14).
 * Fixture: test/test-helpers/participant-transaction-fixture.js.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_STATEMENT_REFUSAL_CODE,
  PARTITION_STATEMENT_REFUSAL_LAYER,
} from '../../src/partition/partition-statement-admission-constants.js';
import {PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {participantConnectionStampOf} from
  '../../src/partition/partition-participant-transaction-connection.js';
import {
  INSERT_SQL, OTHER_ROW, REPLICAS, ROW, TABLE, V3, applyCommitted, awaitProposal,
  beginMessage, clearFixtureSingletons, decisionCommandOf, durableAppliedIndex, identityOf,
  isPrepareCommand, ordinaryWriteOf, originOf, outcomeOf, pick, prepareMessage, queryMessage,
  resetFixtureSingletons, send, settleTicks, shutdownAll, startLeader, startReplica,
  temporaryDbPath, track,
} from '../test-helpers/participant-transaction-fixture.js';

const LEGACY_SESSION = 'legacy-session';
const LEGACY_EPOCH = 1;
// A legacy (sessionId-only) TRANSACTION request and session QUERY.
const legacyMessage = (operation, sessionId, extra = {}) => ({type: 'TRANSACTION',
  operation, sessionId, ...extra});
const legacyQuery = (sql, params = [], sessionId = LEGACY_SESSION) => ({type: 'QUERY', sql,
  params, sessionId});
const refusedAt = (refusalLayer) => ({success: false,
  failureCode: PARTITION_STATEMENT_REFUSAL_CODE, refusalLayer});
const answerOf = (answer) => pick(answer, ['success', 'failureCode', 'refusalLayer']);
// What a statement prepared on the connection could have left on it.
const connectionStateOf = (partition) => ({
  reverseUnorderedSelects: partition.db.pragma('reverse_unordered_selects', {simple: true}),
  queryOnly: partition.db.pragma('query_only', {simple: true}),
  tempObjects: partition.db.prepare('SELECT COUNT(*) AS count FROM temp.sqlite_master')
    .get().count,
});
const CLEAN_CONNECTION = Object.freeze({reverseUnorderedSelects: 0, queryOnly: 0,
  tempObjects: 0});
const TEMP_SHADOW = `CREATE TEMP TABLE ${TABLE} (id TEXT PRIMARY KEY, value TEXT)`;
const TEMP_TRIGGER = `CREATE TEMP TRIGGER legacy_trigger AFTER INSERT ON main.${TABLE} ` +
  `BEGIN UPDATE ${TABLE} SET value = 'leader-only' WHERE id = new.id; END`;
const UNORDERED_SELECTS = 'PRAGMA reverse_unordered_selects = 1';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// Run legacy session statements on a leader whose participant admission is
// not yet enabled (no generation origin: the legacy BEGIN is admitted): each
// of `statements` through the query wire, each of `direct` through the
// session's write entry point itself (executeTransactionWrite).
async function inLegacySession(partition, statements, direct = []) {
  const begin = answerOf(await send(partition, legacyMessage(
    PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
    LEGACY_SESSION, {transactionEpoch: LEGACY_EPOCH})));
  const answers = [];
  for (const [sql, params] of statements) {
    answers.push(answerOf(await send(partition, legacyQuery(sql, params))));
  }
  const directAnswers = [];
  for (const sql of direct) {
    // A statement that throws is recorded by its code, never lost.
    directAnswers.push(answerOf(await partition.executeTransactionWrite(
      {type: PARTITION_SERVICE_OPERATION.QUERY, sql, params: []}, LEGACY_SESSION)
      .catch((thrown) => ({success: false, failureCode: thrown?.code ?? null}))));
  }
  const committed = (await send(partition, legacyMessage(PARTITION_SERVICE_OPERATION.COMMIT,
    LEGACY_SESSION, {transactionEpoch: LEGACY_EPOCH})))?.success;
  return {begin, answers, ...(direct.length > 0 ? {direct: directAnswers} : {}), committed};
}

test('TX1 current cutover: a refused legacy BEGIN does not admit its unsafe ' +
  'session operations or contaminate the connection; a read remains admitted ' +
  'but ordinary writes remain paused until owner release', async () => {
  const {leader, proposed} = await startLeader({generationOrigin: false});
  try {
    const session = await inLegacySession(leader, [[UNORDERED_SELECTS, []],
      ['PRAGMA query_only = 1', []], [TEMP_SHADOW, []], [TEMP_TRIGGER, []],
      [`SELECT name FROM pragma_table_info('${TABLE}')`, []],
      [`SELECT COUNT(*) AS count FROM ${TABLE}`, []], [INSERT_SQL, [ROW.id, ROW.value]]],
    [UNORDERED_SELECTS, TEMP_SHADOW, TEMP_TRIGGER]);
    const kind = refusedAt(PARTITION_STATEMENT_REFUSAL_LAYER.STATEMENT_KIND);
    const admittedRead = {success: true, failureCode: null, refusalLayer: null};
    const paused = {success: false, failureCode: 'partition_write_cutover_paused',
      refusalLayer: null};
    const noSession = {success: false, failureCode: null, refusalLayer: null};
    assert.deepEqual({...session, connection: connectionStateOf(leader),
      rows: leader.db.prepare(`SELECT id, value FROM ${TABLE}`).all(),
      legacyActive: leader.isInTransaction(), proposed: proposed.length}, {
      begin: {success: false, failureCode: CODE.CUTOVER_PAUSED, refusalLayer: null},
      answers: [kind, kind, kind, kind,
        refusedAt(PARTITION_STATEMENT_REFUSAL_LAYER.STATEMENT_FUNCTION),
        admittedRead, paused],
      direct: [noSession, noSession, noSession], committed: false,
      connection: CLEAN_CONNECTION, rows: [], legacyActive: false, proposed: 0},
    'the refused BEGIN is observed; no unsafe statement opens a legacy transaction');
  } finally {
    await shutdownAll(leader);
  }
});

// The connection state an unguarded legacy path left on a connection (an
// earlier build's; this build refuses each channel at the legacy entry
// point): a TEMP trigger, a TEMP table shadowing the own table, the reversed
// scan order and query_only, set directly on the connection.
function plantUnguardedLegacyState(partition, statements) {
  for (const sql of statements) {
    partition.db.exec(sql);
  }
}
const UNGUARDED_STATE = Object.freeze([TEMP_TRIGGER, TEMP_SHADOW, UNORDERED_SELECTS,
  'PRAGMA query_only = 1']);
const SEED_ROWS = Object.freeze([['a', 'first'], ['b', 'second'], ['c', 'third']]);
const rowsOf = (replica) => replica.db.prepare(`SELECT id, value FROM main.${TABLE} ORDER BY id`)
  .all().map((row) => `${row.id}=${row.value}`);
// A replica reopened through the lifecycle owner resumes its port at the
// database's durable applied index.
function resumed(replica) {
  replica.controllablePort.committedIndex = durableAppliedIndex(replica);
  return replica;
}

test('TX1 cutover lifecycle: retained connection-only contamination is removed ' +
  'by reopening, but reopening alone never releases new transaction admission',
async () => {
  const paths = [temporaryDbPath(), temporaryDbPath(), temporaryDbPath()];
  const legacyEra = {generationOrigin: false};
  let {leader, proposed} = await startLeader({...legacyEra, dbPath: paths[0].dbPath});
  let follower = await startReplica(REPLICAS[1], {...legacyEra, dbPath: paths[1].dbPath});
  const unreopened = await startReplica(REPLICAS[2], {...legacyEra,
    dbPath: paths[2].dbPath});
  try {
    for (const replica of [leader, follower, unreopened]) {
      for (const [id, value] of SEED_ROWS) {
        assert.equal(applyCommitted(replica, ordinaryWriteOf(`seed-${id}`,
          {id, value})), null);
      }
    }
    const first = await inLegacySession(leader, [[UNORDERED_SELECTS, []],
      ['PRAGMA query_only = 1', []], [TEMP_TRIGGER, []], [TEMP_SHADOW, []]]);
    assert.equal(first.begin.failureCode, CODE.CUTOVER_PAUSED);
    assert.equal(first.committed, false);
    assert.deepEqual(first.answers, Array(4).fill(refusedAt(
      PARTITION_STATEMENT_REFUSAL_LAYER.STATEMENT_KIND)));
    assert.deepEqual(connectionStateOf(leader), CLEAN_CONNECTION);

    // These deliberately direct SQL changes represent a pre-L6 connection.
    // Current code never admits their entry point; this models what only an
    // older in-process connection could hold, NOT an admitted legacy session.
    for (const replica of [leader, follower]) {
      plantUnguardedLegacyState(replica, UNGUARDED_STATE);
      assert.deepEqual(connectionStateOf(replica),
        {reverseUnorderedSelects: 1, queryOnly: 1, tempObjects: 3});
    }
    plantUnguardedLegacyState(unreopened, [UNORDERED_SELECTS]);
    const oldRows = [leader, follower, unreopened].map(rowsOf);
    await shutdownAll(leader, follower);
    ({leader, proposed} = await startLeader({...legacyEra, dbPath: paths[0].dbPath}));
    resumed(leader);
    follower = resumed(await startReplica(REPLICAS[1], {...legacyEra,
      dbPath: paths[1].dbPath}));
    assert.deepEqual([connectionStateOf(leader), connectionStateOf(follower)],
      [CLEAN_CONNECTION, CLEAN_CONNECTION],
      'exact lifecycle reopen clears TEMP/PRAGMA connection residue');
    assert.equal(connectionStateOf(unreopened).reverseUnorderedSelects, 1,
      'the unreopened connection remains contaminated, not implicitly healed');
    assert.deepEqual([leader, follower, unreopened].map(rowsOf), oldRows,
      'reopening never changes preexisting committed user data');
    assert.equal(originOf(leader), null);
    assert.equal(originOf(follower), null);
    const begin = await send(leader, beginMessage(identityOf('i4-cutover-held')));
    assert.equal(begin.success, false);
    assert.equal(begin.failureCode, CODE.CUTOVER_PAUSED,
      'only the release owner—not connection reopen—grants participant BEGIN');
    assert.equal(proposed.length, 0, 'no origin or transaction is proposed');
  } finally {
    await shutdownAll(leader, follower, unreopened);
    for (const {directory} of paths) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
});

test('TX1 connection stamp: an unknown connection is unsafe, but refused ' +
  'legacy BEGIN cannot mark a clean opened generation as served', async () => {
  const unstamped = new Database(':memory:');
  const {leader} = await startLeader({generationOrigin: false});
  const follower = await startReplica(REPLICAS[1], {generationOrigin: false});
  try {
    const stampOf = (replica) => participantConnectionStampOf(replica.db);
    const facts = {unstamped: participantConnectionStampOf(unstamped),
      opened: [stampOf(leader).servedLegacy, stampOf(follower).servedLegacy],
      newGeneration: stampOf(follower).generation > stampOf(leader).generation};
    facts.refusedBegin = answerOf(await send(leader,
      legacyMessage(PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        LEGACY_SESSION, {transactionEpoch: LEGACY_EPOCH})));
    facts.afterLegacy = [stampOf(leader).servedLegacy,
      stampOf(follower).servedLegacy];
    assert.deepEqual(facts, {
      unstamped: {generation: null, servedLegacy: true},
      opened: [false, false], newGeneration: true,
      refusedBegin: {success: false, failureCode: CODE.CUTOVER_PAUSED,
        refusalLayer: null}, afterLegacy: [false, false]},
    'a rejected session never becomes a history/contamination fact');
  } finally {
    unstamped.close();
    await shutdownAll(leader, follower);
  }
});

// --- the L6 fence and a PREPARED participant row ---

test('TX1 inc4 L6 fence (O5): once a participant transaction is PREPARED (its staging ' +
  'session ended), a sessionId-only QUERY, PREPARE, COMMIT or ROLLBACK naming its sessionId ' +
  'is refused legacy_session_fenced from its durable row and never runs as an ordinary ' +
  'write; once it is decided, that sessionId is the legacy path\'s again', async () => {
  const sessionId = 's-prepared';
  const tx = identityOf('i4-prepared-fence', {sessionId});
  const {leader, proposed} = await startLeader();
  const isLegacyWrite = (entry) => entry.sql === INSERT_SQL && entry.params?.[0] === OTHER_ROW.id;
  const fenced = (answer) => answer.settled ? pick(answer.value, ['success', 'failureCode']) :
    'pending';
  try {
    await send(leader, beginMessage(tx));
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    const prepare = track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed, isPrepareCommand);
    const facts = {prepareApply: command ? applyCommitted(leader, command) : 'not proposed'};
    await settleTicks();
    facts.prepared = prepare.settled ? pick(prepare.value, ['success', 'state']) : 'pending';
    const whilePrepared = [track(send(leader, legacyQuery(INSERT_SQL,
      [OTHER_ROW.id, OTHER_ROW.value], sessionId)))];
    for (const operation of [PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      PARTITION_SERVICE_OPERATION.COMMIT, PARTITION_SERVICE_OPERATION.ROLLBACK]) {
      whilePrepared.push(track(send(leader, legacyMessage(operation, sessionId))));
    }
    await settleTicks();
    facts.whilePrepared = whilePrepared.map(fenced);
    facts.legacyWritesProposed = proposed.filter(isLegacyWrite).length;
    facts.decision = applyCommitted(leader, decisionCommandOf(tx, V3.DECISION.ROLLBACK,
      command?.preparedDigest));
    track(send(leader, legacyQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value], sessionId)));
    facts.afterDecision = (await awaitProposal(proposed, isLegacyWrite)) === null ?
      'not proposed' : 'proposed';
    facts.outcome = await outcomeOf(leader, tx);
    const legacyFenced = {success: false, failureCode: CODE.LEGACY_SESSION_FENCED};
    assert.deepEqual(facts, {prepareApply: null,
      prepared: {success: true, state: V3.STATE.PREPARED},
      whilePrepared: [legacyFenced, legacyFenced, legacyFenced, legacyFenced],
      legacyWritesProposed: 0, decision: null, afterDecision: 'proposed',
      outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
        state: V3.STATE.ROLLED_BACK}},
    'a PREPARED transaction\'s sessionId never reaches the legacy maps or the write path');
  } finally {
    await shutdownAll(leader);
  }
});
