import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {applyTransactionSettlement} from
  '../../src/query/distributed/distributed-transaction-settlement.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {readTransactionReleaseCensus} from
  '../../src/query/distributed/distributed-transaction-release-census.js';
import {settleTransactionReleaseRows, transactionReleaseProofOf} from
  '../../src/query/distributed/distributed-transaction-release-settlement.js';
import {transactionReleaseProofValid} from
  '../../src/partition/partition-participant-release-contract.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';

const TX = 'c'.repeat(32);
const PARTITION = 'application-p1';
const PARTICIPANT = `${TX}:${PARTITION}`;
const MANIFEST = participantSetTextOf(TX, [PARTITION]);
const NOW = 200;

function baseRow(fields = {}) {
  return {transaction_id: TX, session_id: 'release-session', status: 'ACTIVE',
    transaction_epoch: 7, timeout_deadline: 100, transaction_mode: 'EXPLICIT',
    participant_set_state: 'OPEN', participant_set_text: MANIFEST,
    commit_mode: 'NOT_SELECTED', frozen_participant_count: 0,
    decision: null, decision_text: null, decision_digest: null,
    created_at: 1, updated_at: 1, ...fields};
}

function fixture(t, row, answerOf) {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  gateway.seed('sql_transactions', row);
  const deliveries = [];
  const settlements = [];
  const engine = {
    async readDistributedTransactionRecoveryState(transactionId) {
      return {state: 'available',
        transaction: gateway.db.prepare(
          'SELECT * FROM sql_transactions WHERE transaction_id = ?').get(transactionId),
        participants: gateway.rows('sql_transaction_participants')};
    },
    async deliverTransactionOperation(sessionId, partitionId, operation, options) {
      deliveries.push({sessionId, partitionId, operation, options});
      return {acknowledged: true, operation, partitionId,
        transactionId: options.transactionId,
        participantId: options.participantId,
        ...answerOf(operation)};
    },
  };
  const service = {async handleApplicationMessage(request) {
    settlements.push(request.settlement);
    const result = gateway.db.transaction(() =>
      applyTransactionSettlement(gateway.db, request.settlement))();
    return {acknowledged: true, committed: true, settlementResult: result};
  }};
  return {gateway, engine, service, deliveries, settlements};
}

test('release settlement freezes an expired OPEN row, binds rollback and proves actual fanout',
  async (t) => {
    const f = fixture(t, baseRow(), () =>
      ({success: true, durable: true, state: 'ROLLED_BACK',
        outcome: 'NOT_COMMITTED'}));
    const before = readTransactionReleaseCensus(f.gateway.db);
    const transactions = await settleTransactionReleaseRows({
      engine: f.engine, service: f.service, census: before, now: NOW});
    assert.equal(transactions.length, 1);
    assert.deepEqual(transactions[0].participantIds, [PARTICIPANT]);
    assert.equal(transactions[0].decision, 'ROLLBACK');
    assert.equal(f.deliveries.length, 1);
    assert.equal(f.deliveries[0].partitionId, PARTITION);
    assert.equal(f.deliveries[0].options.preparedDigest, null);
    const stored = f.gateway.rows('sql_transactions')[0];
    assert.equal(stored.participant_set_state, 'FROZEN');
    assert.equal(stored.decision, 'ROLLBACK');
    assert.equal(stored.status, 'ROLLED_BACK');

    const census = readTransactionReleaseCensus(f.gateway.db);
    const release = {releaseId: 'release-id'};
    const attempt = {term: 4, leaderReplicaId: 'r1'};
    const proof = transactionReleaseProofOf({release, attempt, census, transactions});
    assert.equal(transactionReleaseProofValid(proof, {release, attempt, census}), true);
    assert.equal(transactionReleaseProofValid(proof,
      {release, attempt: {...attempt, term: 5}, census}), false);
  });

test('release settlement follows an existing COMMIT and never creates another decision',
  async (t) => {
    const decision = buildDecisionRecord(TX, 'COMMIT', [[PARTICIPANT, 'prepared']]);
    const f = fixture(t, baseRow({status: 'COMMITTING', participant_set_state: 'FROZEN',
      commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: 1,
      decision: decision.decision, decision_text: decision.decisionText,
      decision_digest: decision.decisionDigest}), () =>
      ({success: true, durable: true, state: 'COMMITTED',
        outcome: 'COMMITTED'}));
    const transactions = await settleTransactionReleaseRows({engine: f.engine,
      service: f.service, census: readTransactionReleaseCensus(f.gateway.db), now: NOW});
    assert.equal(transactions[0].decision, 'COMMIT');
    assert.equal(f.deliveries[0].options.decisionDigest, decision.decisionDigest);
    assert.equal(f.deliveries[0].options.preparedDigest, 'prepared');
    assert.equal(f.gateway.rows('sql_transactions')[0].status, 'COMMITTED');
  });

test('release settlement holds an unexpired OPEN row and legacy census', async (t) => {
  const f = fixture(t, baseRow({timeout_deadline: NOW + 1}), () =>
    ({success: true, state: 'ROLLED_BACK'}));
  assert.equal(await settleTransactionReleaseRows({engine: f.engine, service: f.service,
    census: readTransactionReleaseCensus(f.gateway.db), now: NOW}), null);
  assert.equal(f.deliveries.length, 0);
  f.gateway.db.prepare('UPDATE sql_transactions SET participant_set_text = NULL').run();
  const legacy = readTransactionReleaseCensus(f.gateway.db);
  assert.deepEqual(legacy.legacyTransactionIds, [TX]);
  assert.equal(await settleTransactionReleaseRows({engine: f.engine, service: f.service,
    census: legacy, now: NOW}), null);
});

test('release settlement keeps durable COMMIT pending across invalid bound and ' +
  'foreign evidence, then retries the same decision without another PREPARE',
async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'release-retry'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const gateway = createTransactionPersistenceGateway();
  const deliveries = [];
  let releaseReply = 'invalid';
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{partition_id: PARTITION, table_name: 'users',
      partition_key_start: null, partition_key_end: null}],
  );
  const router = {async deliver(address, message) {
    const partitionId = address.split('/')[2];
    if (message.type !== QUERY_OPERATION.TRANSACTION) {
      return {acknowledged: true, success: true, rows: [], changes: 1};
    }
    let answer = answerParticipantTransactionRequest(message, partitionId);
    if (message.operation === QUERY_OPERATION.COMMIT) {
      if (releaseReply === 'invalid') {
        answer = {...answer, durable: false, state: 'ACTIVE'};
      } else if (releaseReply === 'foreign') {
        const transactionId = 'e'.repeat(32);
        answer = {...answer, transactionId,
          participantId: `${transactionId}:${partitionId}`};
      }
    }
    deliveries.push({message: structuredClone(message), answer: structuredClone(answer)});
    return answer;
  }};
  const engine = new SQLQueryEngine({systemCache: cache, messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true});
  engine.transactionCoordinator.sleep = async () => {};
  t.after(async () => {
    await engine.shutdown();
    gateway.db.close();
  });
  const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'release-retry'});
  assert.equal((await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (?, ?)', ['id', 'name'],
    {sessionId: 'release-retry'})).success, true);
  const initial = await engine.executeQuery('COMMIT', [], {
    sessionId: 'release-retry', expectedTransactionId: begun.transactionId});
  assert.equal(initial.success, false);
  const row = () => gateway.db.prepare(
    'SELECT * FROM sql_transactions WHERE transaction_id = ?')
    .get(begun.transactionId);
  const before = row();
  assert.equal(before.status, 'COMMITTING');
  assert.equal(before.decision, 'COMMIT');
  const service = {async handleApplicationMessage(request) {
    const result = gateway.db.transaction(() =>
      applyTransactionSettlement(gateway.db, request.settlement))();
    return {acknowledged: true, committed: true, settlementResult: result};
  }};
  const census = () => readTransactionReleaseCensus(gateway.db);

  assert.equal(await settleTransactionReleaseRows({engine, service,
    census: census(), now: NOW}), null);
  assert.deepEqual(row(), before,
    'well-bound but volatile COMMIT evidence cannot discharge the decision');

  releaseReply = 'foreign';
  assert.equal(await settleTransactionReleaseRows({engine, service,
    census: census(), now: NOW}), null);
  assert.deepEqual(row(), before,
    'foreign terminal evidence cannot discharge the decision');

  releaseReply = 'valid';
  const recovered = await settleTransactionReleaseRows({engine, service,
    census: census(), now: NOW});
  const after = row();
  assert.equal(recovered[0].transactionId, begun.transactionId);
  assert.equal(after.status, 'COMMITTED');
  assert.equal(after.decision, before.decision);
  assert.equal(after.decision_text, before.decision_text);
  assert.equal(after.decision_digest, before.decision_digest);
  const prepares = deliveries.filter(({message}) =>
    message.operation === QUERY_OPERATION.PREPARE);
  const commits = deliveries.filter(({message}) =>
    message.operation === QUERY_OPERATION.COMMIT);
  assert.equal(prepares.length, 1, 'release retry must not PREPARE again');
  assert.equal(prepares[0].answer.prepareTerm, 1,
    'the retained decision came from the original older-term PREPARE');
  assert.equal(commits.length, 4);
  assert.ok(commits.every(({message}) =>
    message.transactionId === begun.transactionId &&
    message.decision === 'COMMIT' &&
    message.decisionDigest === before.decision_digest));
  assert.equal(deliveries.some(({message}) =>
    message.operation === QUERY_OPERATION.ROLLBACK), false);
});

test('release settlement applies the canonical terminal tuple classes for both decisions',
  async (t) => {
    const cases = [
      {name: 'invalid commit tuple', decision: 'COMMIT', status: 'COMMITTING',
        answer: {success: true, durable: false, state: 'ACTIVE',
          outcome: 'COMMITTED'}, terminal: false},
      {name: 'invalid rollback tuple', decision: 'ROLLBACK', status: 'ROLLING_BACK',
        answer: {success: true, durable: false, state: 'ROLLED_BACK',
          outcome: 'COMMITTED'}, terminal: false},
      {name: 'durable refused rollback', decision: 'ROLLBACK',
        status: 'ROLLING_BACK', answer: {success: true, durable: true,
          state: 'REFUSED', outcome: 'NOT_COMMITTED'}, terminal: true},
    ];
    for (const entry of cases) {
      await t.test(entry.name, async (st) => {
        const preparedDigest = entry.decision === 'COMMIT' ? 'prepared' : null;
        const decision = buildDecisionRecord(TX, entry.decision,
          [[PARTICIPANT, preparedDigest]]);
        const f = fixture(st, baseRow({status: entry.status,
          participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE_COMMIT',
          frozen_participant_count: 1, decision: decision.decision,
          decision_text: decision.decisionText,
          decision_digest: decision.decisionDigest}), () => entry.answer);
        const before = f.gateway.rows('sql_transactions')[0];
        const result = await settleTransactionReleaseRows({engine: f.engine,
          service: f.service, census: readTransactionReleaseCensus(f.gateway.db),
          now: NOW});
        const after = f.gateway.rows('sql_transactions')[0];
        assert.equal(result !== null, entry.terminal);
        assert.equal(after.status, entry.terminal ?
          (entry.decision === 'COMMIT' ? 'COMMITTED' : 'ROLLED_BACK') :
          entry.status);
        assert.equal(after.decision_text, before.decision_text);
        assert.equal(after.decision_digest, before.decision_digest);
        assert.equal(f.deliveries.length, 1);
        assert.equal(f.deliveries[0].operation, entry.decision);
        assert.equal(f.deliveries[0].options.transactionId, TX);
        assert.equal(f.deliveries[0].options.decisionDigest,
          decision.decisionDigest);
        assert.equal(f.settlements.some((settlement) =>
          settlement.kind === 'PROGRESS'), entry.terminal);
      });
    }
  });
