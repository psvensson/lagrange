/**
 * TX1 coordinator half of the participant transaction protocol (quest
 * replicated-transaction-decision-and-apply; design revision 10, sections
 * 2.1-2.4, 4 and 11.1; agreed seam items A, B/S, C, C', D, E, F, G and U):
 * the real SQLQueryEngine and its DistributedTransactionCoordinator against
 * a scripted participant, with the coordinator's durable rows in the SQLite
 * persistence double (test/test-helpers/transaction-persistence-gateway.js).
 * One log interleaves every coordinator persistence write and every request
 * delivered to a participant, so order is measured, not assumed.
 *
 * The participant's typed answers are its wire vocabulary (design 2.2 and
 * the participant owner's increment-4 constants); a script answers with them
 * literally where this branch's participant constants predate them.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {COMMIT_MODE} from '../../src/constants/transactions.js';
import {decisionBindingRefusalOf} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE, QUERY_LOG_MSG, QUERY_OPERATION} from
  '../../src/query/query-constants.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';

const TABLE = 'users';
const PARTITIONS = Object.freeze({
  p1: {partition_id: 'p1', table_name: TABLE, partition_key_start: null,
    partition_key_end: 'm'},
  p2: {partition_id: 'p2', table_name: TABLE, partition_key_start: 'm',
    partition_key_end: null},
});
const INSERT = `INSERT INTO ${TABLE} (id, name) VALUES (?, ?)`;
// The participant's answers this script names (design 2.2, 4 and 7).
const ANSWER = Object.freeze({
  OUTCOME_UNKNOWN: 'partition_write_outcome_unknown',
  RESERVED: 'participant_transaction_reserved',
  PREPARE_REFUSED: 'participant_transaction_prepare_refused',
  REPLAY_DIVERGED: 'participant_transaction_replay_diverged',
  STATEMENT_FAILED: 'participant_transaction_statement_failed',
  SESSION_WRITE_NONDETERMINISTIC:
    'participant_transaction_session_write_nondeterministic',
  REPLAY_BUDGET_EXCEEDED: 'participant_transaction_replay_budget_exceeded',
  DETERMINISM_SELF_CHECK_FAILED:
    'participant_transaction_determinism_self_check_failed',
  REMOVAL_FENCED: 'participant_transaction_removal_fenced',
  LEGACY_SESSION_FENCED: 'participant_transaction_legacy_session_fenced',
  GENERATION_ORIGIN_PENDING:
    'participant_transaction_generation_origin_pending',
  TERMINAL: 'participant_transaction_terminal',
});
// Past the coordinator's 60 s transaction budget, in three steps.
const BUDGET_STEP_MS = 25000;

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'tx1-protocol'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * The engine, its persistence double and the shared log. `answer` may answer
 * a TRANSACTION request (else the participant's success path does).
 * @param {Object} [options] - {answer, partitions, clock}.
 * @return {Object} {engine, gateway, log, clock}.
 */
function harness(options = {}) {
  resetEnvironment();
  const log = [];
  const clock = options.clock ?? {offsetMs: 0};
  const partitionIds = options.partitions ?? ['p1'];
  const cache = createMockSystemCache([{table_name: TABLE, primaryKey: 'id'}],
    partitionIds.map((partitionId) => PARTITIONS[partitionId]));
  const gateway = createTransactionPersistenceGateway({
    db: options.db,
    beforeMutation: async (mutation) => {
      log.push({kind: 'persist', tableName: mutation.tableName,
        operation: mutation.operation, row: mutation.row ?? null,
        whereClause: mutation.whereClause ?? null,
        data: mutation.data ?? null});
    },
  });
  for (const [tableName, rows] of Object.entries(options.seed ?? {})) {
    rows.forEach((row) => gateway.seed(tableName, row));
  }
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      const copy = JSON.parse(JSON.stringify(message));
      log.push({kind: 'deliver', partitionId, message: copy});
      if (message.type !== QUERY_OPERATION.TRANSACTION) {
        return {acknowledged: true, success: true, rows: [], changes: 1};
      }
      return options.answer?.(copy, partitionId, clock) ??
        answerParticipantTransactionRequest(message);
    },
  };
  if (options.seed) {
    for (const [tableName, rows] of Object.entries(options.seed)) {
      cache[tableName] = rows;
    }
    const getAll = cache.getAll.bind(cache);
    cache.getAll = (type) => options.seed[type] ?? getAll(type);
  }
  const engine = new SQLQueryEngine({systemCache: cache, messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
    nowFn: () => Date.now() + clock.offsetMs});
  // Participant retries back off on the coordinator's own hook.
  engine.transactionCoordinator.sleep = async () => {};
  return {engine, gateway, log, clock};
}

function transactionRequests(log, operation = null) {
  return log.filter((entry) => entry.kind === 'deliver' &&
    entry.message.type === QUERY_OPERATION.TRANSACTION &&
    (operation === null || entry.message.operation === operation))
    .map((entry) => ({partitionId: entry.partitionId, ...entry.message}));
}

function sessionStatements(log) {
  return log.filter((entry) => entry.kind === 'deliver' &&
    entry.message.type !== QUERY_OPERATION.TRANSACTION)
    .map((entry) => ({partitionId: entry.partitionId, ...entry.message}));
}

function decisionWrites(log) {
  return log.filter((entry) => entry.kind === 'persist' &&
    entry.tableName === TABLES.SQL_TRANSACTIONS &&
    typeof entry.data?.decision === 'string');
}

function storeRowOf(gateway, transactionId) {
  return gateway.db.prepare(`SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
    'WHERE transaction_id = ?').get(transactionId) ?? null;
}

async function runTransaction(engine, sessionId, rows) {
  const begun = await engine.executeQuery('BEGIN', [], {sessionId});
  const writes = [];
  for (const [id, name] of rows) {
    writes.push((await engine.executeQuery(INSERT, [id, name], {sessionId}))
      .success === true);
  }
  const commit = await engine.executeQuery('COMMIT', [], {sessionId});
  return {begun, writes, commit, transactionId: begun.transactionId};
}

function refusalOf(message, failureCode, extra = {}) {
  return {acknowledged: true, success: false,
    error: `Participant transaction request refused: ${failureCode}`,
    failureCode, operation: message.operation,
    transactionId: message.transactionId,
    participantId: message.participantId, ...extra};
}

test('TX1 protocol W-ID: one 128-bit identity, minted once, is carried by ' +
  'BEGIN, every session statement, PREPARE, the decision and its row',
async () => {
  const {engine, gateway, log} = harness({partitions: ['p1', 'p2']});
  const run = await runTransaction(engine, 'w-id', [['alice', 'A'],
    ['zack', 'Z']]);
  const inserted = log.filter((entry) => entry.kind === 'persist' &&
    entry.tableName === TABLES.SQL_TRANSACTIONS && entry.operation === 'insert');
  const requests = [...transactionRequests(log), ...sessionStatements(log)];
  const identityOf = (request) => ({
    transactionId: request.transactionId === run.transactionId,
    participantId: request.participantId ===
      `${run.transactionId}:${request.partitionId}`,
    epoch: request.transactionEpoch === run.begun.transactionEpoch,
    commitMode: request.commitMode,
  });
  const byOperation = (operation) => transactionRequests(log, operation)
    .map(identityOf);
  await engine.shutdown();
  assert.deepEqual({
    committed: run.commit.success === true,
    identity: /^[0-9a-f]{32}$/u.test(run.transactionId),
    insertedOnce: inserted.map((entry) => entry.row.transaction_id ===
      run.transactionId),
    rows: gateway.rows(TABLES.SQL_TRANSACTIONS).length,
    begin: byOperation(QUERY_OPERATION.BEGIN),
    statements: sessionStatements(log).map(identityOf),
    prepare: byOperation(QUERY_OPERATION.PREPARE),
    commit: byOperation(QUERY_OPERATION.COMMIT),
    everyRequestCarriesIt: requests.every((request) =>
      request.transactionId === run.transactionId),
  }, {
    committed: true,
    identity: true,
    insertedOnce: [true],
    rows: 1,
    begin: [1, 2].map(() => ({transactionId: true, participantId: true,
      epoch: true, commitMode: COMMIT_MODE.NOT_SELECTED})),
    statements: [1, 2].map(() => ({transactionId: true, participantId: true,
      epoch: true, commitMode: COMMIT_MODE.NOT_SELECTED})),
    prepare: [1, 2].map(() => ({transactionId: true, participantId: true,
      epoch: true, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT})),
    commit: [1, 2].map(() => ({transactionId: true, participantId: true,
      epoch: true, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT})),
    everyRequestCarriesIt: true,
  }, 'seam A and B/S: the identity is the selector on every request');
});

test('TX1 protocol W-ORDER: the decision is recorded insert-once after every ' +
  'PREPARE answer is retained and before any decision fanout, bound to each ' +
  'participant\'s prepared digest', async () => {
  const {engine, gateway, log} = harness({partitions: ['p1', 'p2']});
  const run = await runTransaction(engine, 'w-order', [['alice', 'A'],
    ['zack', 'Z']]);
  const indexOf = (predicate) => log.findIndex(predicate);
  const decisionAt = indexOf((entry) => decisionWrites([entry]).length === 1);
  const firstCommitAt = indexOf((entry) => entry.kind === 'deliver' &&
    entry.message.operation === QUERY_OPERATION.COMMIT);
  const retainedAt = ['p1', 'p2'].map((partitionId) => indexOf((entry) =>
    entry.kind === 'persist' &&
    entry.tableName === TABLES.SQL_TRANSACTION_PARTICIPANTS &&
    entry.row?.partition_id === partitionId &&
    entry.row?.status === TRANSACTION_STATUS.PREPARED &&
    typeof entry.row?.prepared_digest === 'string'));
  const decision = decisionWrites(log)[0];
  const row = storeRowOf(gateway, run.transactionId);
  const prepareAnswers = Object.fromEntries(
    transactionRequests(log, QUERY_OPERATION.PREPARE).map((request) => [
      request.participantId,
      answerParticipantTransactionRequest(request).preparedDigest]));
  const commits = transactionRequests(log, QUERY_OPERATION.COMMIT);
  await engine.shutdown();
  assert.deepEqual({
    committed: run.commit.success === true,
    decisionWrites: decisionWrites(log).length,
    insertOnceGuard: decision?.whereClause ?? null,
    retainedBeforeDecision: retainedAt.every((at) => at >= 0 &&
      at < decisionAt),
    decisionBeforeFanout: decisionAt >= 0 && decisionAt < firstCommitAt,
    recorded: {decision: row?.decision ?? null,
      digestOfText: typeof row?.decision_text === 'string' &&
        sha256(row.decision_text) === row.decision_digest,
      names: typeof row?.decision_text === 'string' ?
        JSON.parse(row.decision_text).participants : null},
    bindings: commits.map((request) => ({
      verified: decisionBindingRefusalOf(request),
      recordedDigest: request.decisionDigest === row.decision_digest,
      preparedDigest: request.preparedDigest ===
        prepareAnswers[request.participantId],
    })),
  }, {
    committed: true,
    decisionWrites: 1,
    insertOnceGuard: {transaction_id: run.transactionId, session_id: 'w-order',
      transaction_epoch: run.begun.transactionEpoch, participant_set_state: 'FROZEN',
      participant_set_text: row.participant_set_text, decision: null},
    retainedBeforeDecision: true,
    decisionBeforeFanout: true,
    recorded: {decision: 'COMMIT', digestOfText: true,
      names: Object.entries(prepareAnswers).sort(([left], [right]) =>
        (left < right ? -1 : 1))},
    bindings: [1, 2].map(() => ({verified: null, recordedDigest: true,
      preparedDigest: true})),
  }, 'seam C and E: evidence retained, then one decision, then its fanout');
});

test('TX1 protocol W-UNKNOWN: a COMMIT answered with an unknown outcome is ' +
  'never success - the transaction stays COMMITTING, the client learns the ' +
  'commit point was reached, and the re-drive re-sends the same decision ' +
  'without preparing again', async () => {
  let unknownAnswers = 0;
  const {engine, gateway, log} = harness({
    answer: (message) => {
      if (message.operation !== QUERY_OPERATION.COMMIT || unknownAnswers >= 4) {
        return null;
      }
      unknownAnswers += 1;
      return refusalOf(message, ANSWER.OUTCOME_UNKNOWN,
        {outcome: 'UNKNOWN'});
    },
  });
  const run = await runTransaction(engine, 'w-unknown', [['alice', 'A']]);
  const afterFirst = {
    success: run.commit.success,
    commitPointReached: run.commit.commitPointReached ?? null,
    status: engine.transactionCoordinator.getTransaction('w-unknown')?.status,
    stored: storeRowOf(gateway, run.transactionId).status,
  };
  const preparesBefore = transactionRequests(log, QUERY_OPERATION.PREPARE)
    .length;
  const redriven = await engine.executeQuery('COMMIT', [],
    {sessionId: 'w-unknown'});
  const commits = transactionRequests(log, QUERY_OPERATION.COMMIT);
  await engine.shutdown();
  assert.deepEqual({
    afterFirst,
    redriven: redriven.success,
    reprepared: transactionRequests(log, QUERY_OPERATION.PREPARE).length -
      preparesBefore,
    sameDecisionBytes: new Set(commits.map((request) =>
      request.decisionDigest)).size,
    stored: storeRowOf(gateway, run.transactionId).status,
  }, {
    afterFirst: {success: false, commitPointReached: true,
      status: TRANSACTION_STATUS.COMMITTING,
      stored: TRANSACTION_STATUS.COMMITTING},
    redriven: true,
    reprepared: 0,
    sameDecisionBytes: 1,
    stored: TRANSACTION_STATUS.COMMITTED,
  }, 'seams C\' and U, S1/S3: UNKNOWN is pending, never COMMITTED');
});

test('TX1 protocol W-RESERVED: a PREPARE answered RESERVED is asked again ' +
  'with the same bytes and is never prepared; a reservation that outlasts the ' +
  'budget ends in a recorded ROLLBACK and no COMMIT', async () => {
  let reservedAnswers = 0;
  const released = harness({answer: (message) => {
    if (message.operation !== QUERY_OPERATION.PREPARE || reservedAnswers >= 2) {
      return null;
    }
    reservedAnswers += 1;
    return refusalOf(message, ANSWER.RESERVED, {deferRetry: true,
      state: 'ACTIVE', outcome: 'UNKNOWN'});
  }});
  const retried = await runTransaction(released.engine, 'w-res-1',
    [['alice', 'A']]);
  const prepares = transactionRequests(released.log, QUERY_OPERATION.PREPARE);
  const decidedAfter = released.log.findIndex((entry) =>
    decisionWrites([entry]).length === 1) >
    released.log.findLastIndex((entry) => entry.kind === 'deliver' &&
      entry.message.operation === QUERY_OPERATION.PREPARE);
  await released.engine.shutdown();

  const held = harness({answer: (message, _partitionId, clock) => {
    if (message.operation !== QUERY_OPERATION.PREPARE) {
      return null;
    }
    clock.offsetMs += BUDGET_STEP_MS;
    return refusalOf(message, ANSWER.RESERVED, {deferRetry: true,
      state: 'ACTIVE', outcome: 'UNKNOWN'});
  }});
  const expired = await runTransaction(held.engine, 'w-res-2',
    [['alice', 'A']]);
  const rollbacks = transactionRequests(held.log, QUERY_OPERATION.ROLLBACK);
  await held.engine.shutdown();
  assert.deepEqual({
    retried: {committed: retried.commit.success === true,
      prepares: prepares.length,
      sameBytes: new Set(prepares.map((request) => JSON.stringify(request)))
        .size,
      decidedAfterTheLastPrepare: decidedAfter},
    expired: {success: expired.commit.success,
      errorCode: expired.commit.errorCode,
      commitPointReached: expired.commit.commitPointReached,
      decision: storeRowOf(held.gateway, expired.transactionId).decision,
      commits: transactionRequests(held.log, QUERY_OPERATION.COMMIT).length,
      boundRollback: rollbacks.map((request) =>
        typeof request.decisionDigest === 'string')},
  }, {
    retried: {committed: true, prepares: 3, sameBytes: 1,
      decidedAfterTheLastPrepare: true},
    expired: {success: false, errorCode: QUERY_ERROR_CODE.TIMEOUT,
      commitPointReached: false, decision: 'ROLLBACK', commits: 0,
      boundRollback: [true]},
  }, 'design 4: RESERVED is non-settling and deferRetry, never PREPARED');
});

test('TX1 protocol W-CONFLICT: a single participant refused for conflict is ' +
  'not prepared again; its ROLLBACK is recorded and fanned out bound, and the ' +
  'client receives the typed conflict before the commit point', async () => {
  const {engine, gateway, log} = harness({answer: (message) =>
    (message.operation === QUERY_OPERATION.PREPARE ?
      refusalOf(message, ANSWER.PREPARE_REFUSED, {refusalCause: 'conflict',
        state: 'REFUSED', outcome: 'NOT_COMMITTED'}) : null)});
  const run = await runTransaction(engine, 'w-conflict', [['alice', 'A']]);
  await engine.shutdown();
  assert.deepEqual({
    prepares: transactionRequests(log, QUERY_OPERATION.PREPARE).length,
    commitMode: transactionRequests(log, QUERY_OPERATION.PREPARE)[0]
      ?.commitMode,
    commits: transactionRequests(log, QUERY_OPERATION.COMMIT).length,
    decision: storeRowOf(gateway, run.transactionId).decision,
    boundRollback: transactionRequests(log, QUERY_OPERATION.ROLLBACK)
      .map((request) => decisionBindingRefusalOf(request)),
    answer: {success: run.commit.success, errorCode: run.commit.errorCode,
      commitPointReached: run.commit.commitPointReached},
  }, {
    prepares: 1,
    commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    commits: 0,
    decision: 'ROLLBACK',
    boundRollback: [null],
    answer: {success: false, errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT,
      commitPointReached: false},
  }, 'design 3.2 and 11.2: prepare-first for one participant, conservative ' +
    'partition conflict, never a silent re-prepare');
});

test('TX1 protocol W-RECOVER: recovery completes a recorded decision with ' +
  'that decision only - COMMIT by COMMIT, ROLLBACK by ROLLBACK - whatever the ' +
  'row\'s status', async () => {
  const record = (transactionId, decision, digest) => {
    const decisionText = JSON.stringify({transactionId, decision,
      participants: [[`${transactionId}:p1`, digest]]});
    return {decision, decision_text: decisionText,
      decision_digest: sha256(decisionText)};
  };
  const row = (transactionId, sessionId, status, decided) => ({
    transaction_id: transactionId, session_id: sessionId, status,
    transaction_epoch: 7, timeout_deadline: 1, transaction_mode: 'EXPLICIT',
    participant_set_state: 'FROZEN',
    participant_set_text: JSON.stringify([[`${transactionId}:p1`, 'p1']]),
    commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT,
    frozen_participant_count: 1, created_at: 1, updated_at: 1, ...decided});
  const participant = (transactionId, status, digest) => ({
    participant_id: `${transactionId}:p1`, transaction_id: transactionId,
    partition_id: 'p1', status, prepared_digest: digest, prepare_index: 3,
    prepare_term: 1, created_at: 1, updated_at: 1});
  const committing = record('a'.repeat(32), 'COMMIT', 'd-commit');
  const rollingBack = record('b'.repeat(32), 'ROLLBACK', 'd-rollback');
  const seed = {
    [TABLES.SQL_TRANSACTIONS]: [
      row('a'.repeat(32), 'rec-c', TRANSACTION_STATUS.PREPARED, committing),
      row('b'.repeat(32), 'rec-r', TRANSACTION_STATUS.PREPARED, rollingBack)],
    [TABLES.SQL_TRANSACTION_PARTICIPANTS]: [
      participant('a'.repeat(32), TRANSACTION_STATUS.PREPARED, 'd-commit'),
      participant('b'.repeat(32), TRANSACTION_STATUS.PREPARED, 'd-rollback')],
  };
  const {engine, gateway, log} = harness({seed});
  const replay = await engine.activateDistributedTransactionRecovery();
  const decisionsSent = transactionRequests(log).map((request) => [
    String(request.transactionId ?? '').slice(0, 1), request.operation,
    request.decisionDigest]);
  await engine.shutdown();
  assert.deepEqual({
    replay: {resumed: replay.resumed, failed: replay.failed},
    decisionsSent,
    stored: [storeRowOf(gateway, 'a'.repeat(32)).status,
      storeRowOf(gateway, 'b'.repeat(32)).status],
  }, {
    replay: {resumed: 2, failed: 0},
    decisionsSent: [['a', QUERY_OPERATION.COMMIT, committing.decision_digest],
      ['b', QUERY_OPERATION.ROLLBACK, rollingBack.decision_digest]],
    stored: [TRANSACTION_STATUS.COMMITTED, TRANSACTION_STATUS.ROLLED_BACK],
  }, 'seams G and U: the recorded decision is the only one ever fanned out');
});

test('TX1 protocol W-NO-REUSE: after a rolled-back transaction (its ' +
  'participants TOMBSTONEd or rolled back by a bound decision) the session\'s ' +
  'next transaction mints a fresh identity and its own insert-once row',
async () => {
  const {engine, gateway, log} = harness({partitions: ['p1', 'p2'],
    answer: (message, partitionId) =>
      (message.operation === QUERY_OPERATION.PREPARE && partitionId === 'p2' ?
        refusalOf(message, ANSWER.STATEMENT_FAILED) : null)});
  const first = await runTransaction(engine, 'w-reuse', [['alice', 'A'],
    ['zack', 'Z']]);
  const second = await runTransaction(engine, 'w-reuse', [['alice', 'A']]);
  const firstRollbacks = transactionRequests(log, QUERY_OPERATION.ROLLBACK)
    .filter((request) => request.transactionId === first.transactionId);
  await engine.shutdown();
  assert.deepEqual({
    firstRolledBack: storeRowOf(gateway, first.transactionId).decision,
    boundToBoth: firstRollbacks.map((request) => [request.partitionId,
      decisionBindingRefusalOf(request)]).sort(),
    fresh: second.transactionId !== first.transactionId &&
      /^[0-9a-f]{32}$/u.test(second.transactionId),
    rows: gateway.rows(TABLES.SQL_TRANSACTIONS).map((stored) =>
      stored.transaction_id).sort(),
    secondCommitted: second.commit.success === true,
  }, {
    firstRolledBack: 'ROLLBACK',
    boundToBoth: [['p1', null], ['p2', null]],
    fresh: true,
    rows: [first.transactionId, second.transactionId].sort(),
    secondCommitted: true,
  }, 'design 2.1: an identity is never reused');
});

test('TX1 protocol W-SELECTOR: delivery is bound to the transaction, never to ' +
  'the session: two transactions of one session carry their own identities ' +
  'and distinct delivery keys', async () => {
  resetEnvironment();
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], [], []),
    autoStartDistributedTransactionRecovery: false,
  });
  const delivered = [];
  engine.queryExecutor.executeOnPartition = async (...args) => {
    const options = args[6];
    delivered.push({request: options.buildRequest(),
      deliverySource: options.deliverySource ?? null});
    return {success: true};
  };
  for (const transactionId of ['c'.repeat(32), 'd'.repeat(32)]) {
    await engine.deliverTransactionOperation('one-session',
      'replica_operations-p1', QUERY_OPERATION.COMMIT, {transactionId,
        participantId: `${transactionId}:replica_operations-p1`,
        commitMode: COMMIT_MODE.TWO_PHASE_COMMIT, transactionEpoch: 1});
  }
  await engine.shutdown();
  assert.deepEqual(delivered.map((entry) => ({
    transactionId: String(entry.request.transactionId ?? '').slice(0, 1),
    sessionId: entry.request.sessionId,
    keyNamesTransaction: entry.deliverySource?.includes(
      entry.request.transactionId) ?? false,
    keyNamesSession: entry.deliverySource?.includes('one-session') ?? false,
  })), [
    {transactionId: 'c', sessionId: 'one-session', keyNamesTransaction: true,
      keyNamesSession: false},
    {transactionId: 'd', sessionId: 'one-session', keyNamesTransaction: true,
      keyNamesSession: false},
  ], 'seam A: the sessionId is routing context only');
});

test('TX1 protocol W-TYPED: every typed participant answer has one ' +
  'disposition - a definitive PREPARE refusal is not asked again and rolls ' +
  'back, a deferred one is asked again, an untyped success is never ' +
  'evidence, and a refused BEGIN fails the statement with its code',
async () => {
  const prepareAnswered = async (answerOfPrepare) => {
    let answered = 0;
    const {engine, gateway, log} = harness({answer: (message, _p, clock) => {
      if (message.operation !== QUERY_OPERATION.PREPARE) {
        return null;
      }
      answered += 1;
      clock.offsetMs += BUDGET_STEP_MS;
      return answerOfPrepare(message, answered);
    }});
    const run = await runTransaction(engine, `typed-${Math.random()}`,
      [['alice', 'A']]);
    await engine.shutdown();
    return {prepares: transactionRequests(log, QUERY_OPERATION.PREPARE).length,
      decision: storeRowOf(gateway, run.transactionId).decision,
      commits: transactionRequests(log, QUERY_OPERATION.COMMIT).length};
  };
  const definitive = {};
  for (const code of [ANSWER.REPLAY_DIVERGED, ANSWER.STATEMENT_FAILED,
    ANSWER.SESSION_WRITE_NONDETERMINISTIC, ANSWER.REPLAY_BUDGET_EXCEEDED,
    ANSWER.LEGACY_SESSION_FENCED, ANSWER.TERMINAL]) {
    definitive[code] = await prepareAnswered((message) =>
      refusalOf(message, code));
  }
  const deferred = await prepareAnswered((message, answered) =>
    (answered === 1 ? refusalOf(message, ANSWER.REMOVAL_FENCED,
      {deferRetry: true}) : null));
  const untyped = await prepareAnswered(() => ({acknowledged: true,
    success: true}));
  const beginRefused = {};
  for (const code of [ANSWER.GENERATION_ORIGIN_PENDING,
    ANSWER.DETERMINISM_SELF_CHECK_FAILED, ANSWER.LEGACY_SESSION_FENCED]) {
    const {engine, log} = harness({answer: (message) =>
      (message.operation === QUERY_OPERATION.BEGIN ?
        refusalOf(message, code) : null)});
    await engine.executeQuery('BEGIN', [], {sessionId: code});
    const write = await engine.executeQuery(INSERT, ['alice', 'A'],
      {sessionId: code});
    await engine.shutdown();
    beginRefused[code] = {success: write.success,
      failureCode: write.failureCode ?? null,
      prepares: transactionRequests(log, QUERY_OPERATION.PREPARE).length};
  }
  const rolledBack = {prepares: 1, decision: 'ROLLBACK', commits: 0};
  assert.deepEqual({definitive, deferred, untyped, beginRefused}, {
    definitive: Object.fromEntries(Object.keys(definitive).map((code) =>
      [code, rolledBack])),
    deferred: {prepares: 2, decision: 'COMMIT', commits: 1},
    untyped: rolledBack,
    beginRefused: Object.fromEntries(Object.keys(beginRefused).map((code) =>
      [code, {success: false, failureCode: code, prepares: 0}])),
  }, 'design 2.2 and 4: the participant wire owner types every answer');
});

test('TX1 protocol W-ABORT: a ROLLBACK is bound to a recorded decision ' +
  'for every retained manifest, including staging and restored PREPARING rows', async () => {
  const transactionId = 'e'.repeat(32);
  const seed = {
    [TABLES.SQL_TRANSACTIONS]: [{transaction_id: transactionId,
      session_id: 'abort-preparing', status: TRANSACTION_STATUS.PREPARING,
      transaction_epoch: 7, timeout_deadline: 1, transaction_mode: 'EXPLICIT',
      participant_set_state: 'FROZEN',
      participant_set_text: JSON.stringify([[`${transactionId}:p1`, 'p1']]),
      commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT, frozen_participant_count: 1,
      created_at: 1, updated_at: 1}],
    [TABLES.SQL_TRANSACTION_PARTICIPANTS]: [{
      participant_id: `${transactionId}:p1`, transaction_id: transactionId,
      partition_id: 'p1', status: TRANSACTION_STATUS.PREPARING,
      created_at: 1, updated_at: 1}],
  };
  const recovered = harness({seed});
  const replay =
    await recovered.engine.activateDistributedTransactionRecovery();
  const decisionAt = recovered.log.findIndex((entry) =>
    decisionWrites([entry]).length === 1);
  const firstRollbackAt = recovered.log.findIndex((entry) =>
    entry.kind === 'deliver' &&
    entry.message.operation === QUERY_OPERATION.ROLLBACK);
  const stored = storeRowOf(recovered.gateway, transactionId);
  await recovered.engine.shutdown();

  const staging = harness({});
  await staging.engine.executeQuery('BEGIN', [], {sessionId: 'abort-active'});
  await staging.engine.executeQuery(INSERT, ['alice', 'A'],
    {sessionId: 'abort-active'});
  const rolledBack = await staging.engine.executeQuery('ROLLBACK', [],
    {sessionId: 'abort-active'});
  await staging.engine.shutdown();
  assert.deepEqual({
    recovered: {
      replay: {resumed: replay.resumed, failed: replay.failed},
      decision: stored?.decision ?? null,
      status: stored?.status ?? null,
      recordedBeforeFanout: decisionAt >= 0 && decisionAt < firstRollbackAt,
      bound: transactionRequests(recovered.log, QUERY_OPERATION.ROLLBACK)
        .map((request) => decisionBindingRefusalOf(request)),
      commits: transactionRequests(recovered.log, QUERY_OPERATION.COMMIT)
        .length,
    },
    staging: {
      success: rolledBack.success,
      decisionWrites: decisionWrites(staging.log).length,
      bound: transactionRequests(staging.log, QUERY_OPERATION.ROLLBACK)
        .map((request) => decisionBindingRefusalOf(request)),
      prepares: transactionRequests(staging.log, QUERY_OPERATION.PREPARE)
        .length,
    },
  }, {
    recovered: {replay: {resumed: 1, failed: 0}, decision: 'ROLLBACK',
      status: TRANSACTION_STATUS.ROLLED_BACK, recordedBeforeFanout: true,
      bound: [null], commits: 0},
    staging: {success: true, decisionWrites: 1, bound: [null],
      prepares: 0},
  }, 'design 2.4 and seam C: an unbound ROLLBACK never reaches a ' +
    'participant a PREPARE may have reached');
});

// Seam V (owner decisions 2026-10-10; design 3.6): the statement-autocommit
// owner's whole-statement retry. One multi-partition INSERT is a
// STATEMENT_AUTOCOMMIT transaction over p1 and p2.
const MULTI_INSERT = `INSERT INTO ${TABLE} (id, name) VALUES (?, ?), (?, ?)`;
const conflictOf = (message) => refusalOf(message, ANSWER.PREPARE_REFUSED,
  {refusalCause: 'conflict', state: 'REFUSED', outcome: 'NOT_COMMITTED'});

async function runStatement(sessionId, answer) {
  const {engine, gateway, log} = harness({partitions: ['p1', 'p2'], answer});
  const backoff = [];
  engine.transactionCoordinator.sleep = async (delayMs) => {
    backoff.push(delayMs);
  };
  // The bound that stopped a conflicted statement's retry, as logged.
  const stopped = [];
  const warn = engine.logger.warn;
  engine.logger.warn = function recordStop(message, fields) {
    if (message === QUERY_LOG_MSG.STATEMENT_CONFLICT_RETRY_STOPPED) {
      stopped.push(fields?.bound ?? null);
    }
    return warn.call(this, message, fields);
  };
  const result = await engine.executeQuery(MULTI_INSERT,
    ['alice', 'A', 'zack', 'Z'], {sessionId});
  engine.logger.warn = warn;
  await engine.shutdown();
  const attempts = [...new Set(transactionRequests(log,
    QUERY_OPERATION.BEGIN).map((request) => request.transactionId))];
  return {result, gateway, log, backoff, attempts, stopped,
    stored: attempts.map((transactionId) =>
      storeRowOf(gateway, transactionId))};
}

function requestsOf(log, operation, transactionId) {
  return transactionRequests(log, operation)
    .filter((request) => request.transactionId === transactionId);
}

test('TX1 protocol W-RETRY: a statement-autocommit attempt refused by a ' +
  'participant conflict is retried whole - its bound ROLLBACK answered by ' +
  'every participant first, then a new BEGIN with a fresh identity, the ' +
  'write and the COMMIT again - inside the first attempt\'s deadline',
async () => {
  let conflicts = 0;
  const run = await runStatement('w-retry', (message, partitionId) => {
    if (message.operation !== QUERY_OPERATION.PREPARE || partitionId !== 'p2' ||
        conflicts >= 1) {
      return null;
    }
    conflicts += 1;
    return conflictOf(message);
  });
  const [first, second] = run.attempts;
  const lastFirstRollbackAt = run.log.findLastIndex((entry) =>
    entry.kind === 'deliver' &&
    entry.message.operation === QUERY_OPERATION.ROLLBACK &&
    entry.message.transactionId === first);
  const secondBeginAt = run.log.findIndex((entry) => entry.kind === 'deliver' &&
    entry.message.operation === QUERY_OPERATION.BEGIN &&
    entry.message.transactionId === second);
  const partitionsOf = (requests) => requests.map((request) =>
    request.partitionId).sort();
  assert.deepEqual({
    success: run.result.success,
    attempts: run.attempts.length,
    fresh: first !== second &&
      run.attempts.every((transactionId) =>
        /^[0-9a-f]{32}$/u.test(transactionId)),
    first: {decision: run.stored[0]?.decision,
      status: run.stored[0]?.status,
      boundRollbacks: requestsOf(run.log, QUERY_OPERATION.ROLLBACK, first)
        .map((request) => [request.partitionId,
          decisionBindingRefusalOf(request)]).sort()},
    abortedBeforeRetry: lastFirstRollbackAt >= 0 &&
      lastFirstRollbackAt < secondBeginAt,
    second: {decision: run.stored[1]?.decision,
      status: run.stored[1]?.status,
      statements: partitionsOf(sessionStatements(run.log).filter((request) =>
        request.transactionId === second)),
      commits: partitionsOf(requestsOf(run.log, QUERY_OPERATION.COMMIT,
        second))},
    commitsOfOtherAttempts: transactionRequests(run.log,
      QUERY_OPERATION.COMMIT).filter((request) =>
      request.transactionId !== second).length,
    oneDeadline: run.stored.length === 2 &&
      run.stored[0].timeout_deadline === run.stored[1].timeout_deadline,
    backoff: run.backoff,
    stopped: run.stopped,
  }, {
    success: true,
    attempts: 2,
    fresh: true,
    first: {decision: 'ROLLBACK', status: TRANSACTION_STATUS.ROLLED_BACK,
      boundRollbacks: [['p1', null], ['p2', null]]},
    abortedBeforeRetry: true,
    second: {decision: 'COMMIT', status: TRANSACTION_STATUS.COMMITTED,
      statements: ['p1', 'p2'], commits: ['p1', 'p2']},
    commitsOfOtherAttempts: 0,
    oneDeadline: true,
    backoff: [10],
    stopped: [],
  }, 'seam V: a definitive conflict, a complete abort, then the whole ' +
    'statement again under a new identity and base');
});

test('TX1 protocol W-RETRY-BOUND: the whole-statement retry is bounded by ' +
  'the coordinator\'s participant retry bound and backoff and by the first ' +
  'attempt\'s deadline, and then answers the typed conflict', async () => {
  const always = await runStatement('w-retry-attempts',
    (message, partitionId) => (message.operation === QUERY_OPERATION.PREPARE &&
      partitionId === 'p2' ? conflictOf(message) : null));
  const late = await runStatement('w-retry-deadline',
    (message, partitionId, clock) => {
      if (message.operation !== QUERY_OPERATION.PREPARE ||
          partitionId !== 'p2') {
        return null;
      }
      clock.offsetMs += BUDGET_STEP_MS;
      return conflictOf(message);
    });
  const summary = (run) => ({
    attempts: run.attempts.length,
    answer: {success: run.result.success, errorCode: run.result.errorCode,
      commitPointReached: run.result.commitPointReached},
    decisions: run.stored.map((row) => row?.decision),
    oneDeadline: new Set(run.stored.map((row) => row?.timeout_deadline))
      .size,
    commits: transactionRequests(run.log, QUERY_OPERATION.COMMIT).length,
    backoff: run.backoff,
    stopped: run.stopped,
  });
  const conflict = {success: false,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT, commitPointReached: false};
  assert.deepEqual({always: summary(always), late: summary(late)}, {
    always: {attempts: 4, answer: conflict,
      decisions: ['ROLLBACK', 'ROLLBACK', 'ROLLBACK', 'ROLLBACK'],
      oneDeadline: 1, commits: 0, backoff: [10, 20, 40],
      stopped: ['attempts_spent']},
    late: {attempts: 3, answer: conflict,
      decisions: ['ROLLBACK', 'ROLLBACK', 'ROLLBACK'],
      oneDeadline: 1, commits: 0, backoff: [10, 20],
      stopped: ['deadline_spent']},
  }, 'seam V: one end-to-end budget and a bounded attempt and backoff policy');
});

test('TX1 protocol W-RETRY-NEVER: no fresh transaction follows an explicit ' +
  'transaction\'s conflict, an unknown outcome after the COMMIT decision, a ' +
  'definitive refusal that is not a conflict, or a conflict whose ROLLBACK ' +
  'did not reach every participant', async () => {
  const explicit = harness({partitions: ['p1', 'p2'],
    answer: (message, partitionId) =>
      (message.operation === QUERY_OPERATION.PREPARE && partitionId === 'p2' ?
        conflictOf(message) : null)});
  const explicitRun = await runTransaction(explicit.engine, 'w-never-explicit',
    [['alice', 'A'], ['zack', 'Z']]);
  await explicit.engine.shutdown();
  const unknown = await runStatement('w-never-unknown',
    (message, partitionId) => (message.operation === QUERY_OPERATION.COMMIT &&
      partitionId === 'p2' ? refusalOf(message, ANSWER.OUTCOME_UNKNOWN,
        {outcome: 'UNKNOWN'}) : null));
  const refused = await runStatement('w-never-refused',
    (message, partitionId) => (message.operation === QUERY_OPERATION.PREPARE &&
      partitionId === 'p2' ? refusalOf(message, ANSWER.STATEMENT_FAILED) :
      null));
  const unaborted = await runStatement('w-never-unaborted',
    (message, partitionId) => {
      if (message.operation === QUERY_OPERATION.PREPARE &&
          partitionId === 'p2') {
        return conflictOf(message);
      }
      return message.operation === QUERY_OPERATION.ROLLBACK &&
        partitionId === 'p1' ? refusalOf(message, ANSWER.OUTCOME_UNKNOWN,
          {outcome: 'UNKNOWN'}) : null;
    });
  const summary = (run) => ({
    attempts: run.attempts.length,
    errorCode: run.result.errorCode ?? null,
    commitPointReached: run.result.commitPointReached ?? null,
    stored: run.stored.map((row) => [row?.decision, row?.status]),
    stopped: run.stopped,
  });
  assert.deepEqual({
    explicit: {
      attempts: new Set(transactionRequests(explicit.log,
        QUERY_OPERATION.BEGIN).map((request) => request.transactionId)).size,
      errorCode: explicitRun.commit.errorCode,
      commitPointReached: explicitRun.commit.commitPointReached,
      stored: [[storeRowOf(explicit.gateway, explicitRun.transactionId)
        ?.decision, storeRowOf(explicit.gateway, explicitRun.transactionId)
        ?.status]],
    },
    unknown: summary(unknown),
    refused: summary(refused),
    unaborted: {...summary(unaborted),
      rollbackFailed: (unaborted.result.rollbackFailedParticipants ?? [])
        .map((entry) => entry.partitionId)},
  }, {
    explicit: {attempts: 1, errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT,
      commitPointReached: false,
      stored: [['ROLLBACK', TRANSACTION_STATUS.ROLLED_BACK]]},
    unknown: {attempts: 1,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      commitPointReached: true,
      stored: [['COMMIT', TRANSACTION_STATUS.COMMITTING]], stopped: []},
    refused: {attempts: 1,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      commitPointReached: false,
      stored: [['ROLLBACK', TRANSACTION_STATUS.ROLLED_BACK]], stopped: []},
    unaborted: {attempts: 1, errorCode: QUERY_ERROR_CODE.TRANSACTION_CONFLICT,
      commitPointReached: false,
      stored: [['ROLLBACK', TRANSACTION_STATUS.ROLLING_BACK]], stopped: [],
      rollbackFailed: ['p1']},
  }, 'seam V: never from UNKNOWN, after COMMIT, for an explicit ' +
    'transaction, or before the prior attempt\'s abort completed');
});
