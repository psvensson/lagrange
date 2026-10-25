/**
 * A recovered transaction obligation is owned by the recovery owner under
 * its own key, never by a live session (TX1 r1 finding (c)).
 *
 * Discovery used to bind a recovered row to `ownerKey = session_id`, so
 * after a restart the DEFAULT session, or any client reusing an old row's
 * session id, held a transaction it never began: hasActiveTransaction and
 * getTransaction reported it, BEGIN answered TRANSACTION_ACTIVE, every write
 * on that session was held in doubt until the sweep ended the obligation,
 * and a COMMIT without an ID adopted it. These witnesses drive the real
 * engine and coordinator: the obligation is visible only through the
 * recovery owner (getRecoveryObligation by transaction ID), a session that
 * began nothing holds nothing, a COMMIT or ROLLBACK naming the exact
 * recovered ID gets the recovery owner's typed in-doubt answer (never
 * adoption), and the sweep still ends the obligation.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {QUERY_ERROR_CODE, QUERY_SESSION} from '../../src/query/query-constants.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {recoveryDecisionColumns, recoveryRowsOf} from
  '../test-helpers/transaction-recovery-rows-fixture.js';

const RECOVERED_ID = 'a'.repeat(32);
const logger = {warn() {}, error() {}, debug() {}, info() {}};

// A recorded COMMIT whose fanout a dead process never finished.
function recordedCommitRows(sessionId = QUERY_SESSION.DEFAULT) {
  return recoveryRowsOf({transactionId: RECOVERED_ID, sessionId,
    overrides: {status: 'COMMITTING',
      ...recoveryDecisionColumns(RECOVERED_ID, ['p1'])}});
}

// A restarted engine whose discovery found the recorded COMMIT while its
// authoritative row is not yet readable (held: no re-drive can finish it).
function restartedEngine(t, sessionId = QUERY_SESSION.DEFAULT) {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const deliveries = [];
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{partition_id: 'p1', table_name: 'users', partition_key_start: null,
      partition_key_end: null}],
  );
  const router = {async deliver(address, message) {
    deliveries.push({operation: message.operation,
      transactionId: message.transactionId});
    return buildDeliveryEnvelope({acknowledged: true},
      answerParticipantTransactionRequest(message, address.split('/')[2]));
  }};
  const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
    systemCache: cache, messageRouter: router, logger,
    autoStartDistributedTransactionRecovery: false});
  t.after(() => engine.shutdown());
  const rows = recordedCommitRows(sessionId);
  engine.transactionCoordinator.recoverFromSystemTables(rows);
  const makeAuthoritative = () => {
    rows.transactions.forEach((row) => gateway.seed('sql_transactions', row));
    rows.participants.forEach((row) =>
      gateway.seed('sql_transaction_participants', row));
  };
  return {engine, deliveries, makeAuthoritative};
}

// A coordinator holding the discovered obligation, recording every mutation.
function restartedCoordinator(sessionId = QUERY_SESSION.DEFAULT) {
  const mutations = [];
  const record = (name) => async (value) => {
    mutations.push(`${name}:${value?.transactionId ?? ''}`);
  };
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => 100, participantRetryMaxRetries: 0,
    persistTransaction: record('transaction'),
    persistParticipant: record('participant'),
    persistTransactionDecision: record('decision'),
    persistTransactionParticipantSet: record('participant-set'),
    commitParticipant: async (_session, partitionId, request) => {
      mutations.push(`COMMIT:${request.transactionId}`);
      return {success: true, outcome: 'COMMITTED'};
    },
    rollbackParticipant: async (_session, _partition, request) => {
      mutations.push(`ROLLBACK:${request.transactionId}`);
      return {success: true};
    }});
  coordinator.readTransactionRecoveryState = async () => ({state: 'unavailable'});
  coordinator.recoverFromSystemTables(recordedCommitRows(sessionId));
  return {coordinator, mutations};
}

test('W-R1: after a restart with an in-doubt row the DEFAULT session holds ' +
  'no transaction and BEGIN on it succeeds', async (t) => {
  const {engine} = restartedEngine(t);
  const replay = await engine.transactionCoordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 0, 'the obligation is still held in doubt');
  const sessionBefore = {
    active: engine.hasActiveTransaction(),
    held: engine.transactionCoordinator.getTransaction(QUERY_SESSION.DEFAULT)
      ?.transactionId ?? null,
  };
  const begun = await engine.executeQuery('BEGIN', [], {});
  assert.deepEqual({sessionBefore, begin: [begun.success, begun.errorCode]},
    {sessionBefore: {active: false, held: null}, begin: [true, undefined]});
  assert.notEqual(begun.transactionId, RECOVERED_ID);
  assert.equal(engine.transactionCoordinator.getTransaction(QUERY_SESSION.DEFAULT)
    .transactionId, begun.transactionId);
  assert.equal(engine.transactionCoordinator.getRecoveryObligation(RECOVERED_ID)
    ?.transactionId, RECOVERED_ID, 'only the recovery owner reports it');
});

test('W-R2: a write on that session is not held in doubt, and the sweep ' +
  'still ends the recovered obligation', async (t) => {
  const {engine, deliveries, makeAuthoritative} = restartedEngine(t);
  const writePlan = {partitionStatements: new Map([['p1', {}]]),
    operationId: 'op-w-r2'};
  const opened = await engine.openWriteTransaction(QUERY_SESSION.DEFAULT,
    writePlan, {});
  let executed = 0;
  const written = await engine.executeWriteTransaction(opened,
    () => ({operationId: 'op-w-r2', statementType: 'INSERT', partitionIds: ['p1']}),
    async () => {
      executed += 1;
      return {success: true};
    });
  assert.deepEqual({ownership: opened.ownership, success: written.success,
    errorCode: written.errorCode, executed},
  {ownership: 'DIRECT_AUTOCOMMIT', success: true, errorCode: undefined,
    executed: 1}, 'the session has no transaction to hold the write in');

  makeAuthoritative();
  const sweep = await engine.transactionCoordinator.runRecoverySweep();
  assert.equal(sweep.resolved, 1);
  assert.deepEqual(deliveries, [{operation: 'COMMIT', transactionId: RECOVERED_ID}],
    'the recorded COMMIT is completed by recovery, exactly once');
  assert.equal(engine.transactionCoordinator.getRecoveryObligation(RECOVERED_ID),
    null, 'the obligation is ended');
  assert.equal(engine.transactionCoordinator.recoveredTransactionIds
    .has(RECOVERED_ID), false);
  assert.equal(engine.hasActiveTransaction(), false);
});

test('W-R3: COMMIT or ROLLBACK naming the exact recovered ID answers the ' +
  'recovery owner\'s in-doubt refusal; without an ID it answers no ' +
  'transaction (never adoption)', async () => {
  const {coordinator, mutations} = restartedCoordinator();
  const exact = {expectedTransactionId: RECOVERED_ID};
  const answers = {
    commitExact: await coordinator.commit(QUERY_SESSION.DEFAULT, exact),
    rollbackExact: await coordinator.rollback(QUERY_SESSION.DEFAULT, exact),
    commitExactOtherSession: await coordinator.commit('another-client', exact),
    commitBare: await coordinator.commit(QUERY_SESSION.DEFAULT),
    rollbackBare: await coordinator.rollback(QUERY_SESSION.DEFAULT),
  };
  const codes = Object.fromEntries(Object.entries(answers).map(([name, answer]) =>
    [name, [answer.success, answer.errorCode]]));
  assert.deepEqual(codes, {
    commitExact: [false, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT],
    rollbackExact: [false, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT],
    commitExactOtherSession: [false, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT],
    commitBare: [false, QUERY_ERROR_CODE.NO_TRANSACTION],
    rollbackBare: [false, QUERY_ERROR_CODE.NO_TRANSACTION],
  });
  assert.equal(answers.commitExact.transactionId, RECOVERED_ID);
  assert.equal(answers.commitExact.decisionReadState, 'not_read');
  assert.equal(Object.hasOwn(answers.commitExact, 'commitPointReached'), false,
    'the held answer never claims nothing was committed');
  assert.deepEqual(mutations, [], 'no client stage mutates the obligation');
  assert.equal(coordinator.recoveredTransactionIds.has(RECOVERED_ID), true);
});

test('W-R4: a new client reusing an old row\'s session id sees no ' +
  'transaction, and its own block never touches the obligation', async () => {
  const {coordinator, mutations} = restartedCoordinator('client-7');
  const before = {active: coordinator.hasActiveTransaction('client-7'),
    held: coordinator.getTransaction('client-7')?.transactionId ?? null};
  const begun = await coordinator.begin('client-7');
  const committed = await coordinator.commit('client-7');
  assert.deepEqual({before, begin: [begun.success, begun.errorCode],
    commit: [committed.success, committed.transactionId === begun.transactionId]},
  {before: {active: false, held: null}, begin: [true, undefined],
    commit: [true, true]});
  assert.equal(mutations.some((entry) => entry.endsWith(RECOVERED_ID)), false,
    'the client\'s block never reaches the recovered obligation');
  assert.equal(coordinator.getRecoveryObligation(RECOVERED_ID)?.sessionId,
    'client-7', 'recovery still holds the obligation under its row identity');
});

for (const malformed of [
  {name: 'null epoch', fields: {transaction_epoch: null}, dimension: 'transaction_epoch'},
  {name: 'missing transaction ID', fields: {transaction_id: null}, dimension: undefined},
]) {
  test(`discovery ${malformed.name} cannot starve an independently retained COMMIT`, async (t) => {
    const {engine, deliveries, makeAuthoritative} = restartedEngine(t);
    const coordinator = engine.transactionCoordinator;
    const badId = 'b'.repeat(32);
    const badRows = recoveryRowsOf({transactionId: badId, sessionId: 'malformed-discovery',
      overrides: malformed.fields});
    assert.throws(() => coordinator.recoverFromSystemTables(badRows),
      {errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE},
      'direct discovery still refuses malformed identity without installing it');
    coordinator.loadRecoveryStateForSweep = async () => badRows;
    const warnings = [];
    coordinator.logger = {...logger, warn(_message, fields) {
      warnings.push(fields);
    }};
    const read = coordinator.readTransactionRecoveryState.bind(coordinator);
    const reads = [];
    coordinator.readTransactionRecoveryState = async (id) => {
      reads.push(id);
      return read(id);
    };

    const held = await coordinator.runRecoverySweep();
    assert.equal(held.resolved, 0, 'missing authority remains held, never guessed');
    assert.deepEqual(reads, [RECOVERED_ID]);
    assert.deepEqual(deliveries, []);
    makeAuthoritative();
    const completed = await coordinator.runRecoverySweep();
    assert.equal(completed.resolved, 1);
    assert.deepEqual(reads, [RECOVERED_ID, RECOVERED_ID]);
    assert.deepEqual(deliveries, [{operation: 'COMMIT', transactionId: RECOVERED_ID}]);
    assert.equal(coordinator.getRecoveryObligation(RECOVERED_ID), null);
    assert.equal(coordinator.getRecoveryObligation(badId), null);
    assert.equal(engine.hasActiveTransaction(), false);
    assert.equal(warnings.length, 2, 'each refused discovery remains visible');
    for (const refusal of warnings) {
      assert.equal(refusal.errorCode, QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE);
      assert.equal(refusal.sessionId, 'malformed-discovery');
      assert.equal(refusal.transactionId, malformed.fields.transaction_id === null ?
        undefined : badId);
      assert.equal(refusal.decisionDimension, malformed.dimension);
    }
  });
}
