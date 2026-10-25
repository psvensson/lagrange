import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
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
  const engine = {
    async readDistributedTransactionRecoveryState(transactionId) {
      return {state: 'available',
        transaction: gateway.db.prepare(
          'SELECT * FROM sql_transactions WHERE transaction_id = ?').get(transactionId),
        participants: gateway.rows('sql_transaction_participants')};
    },
    async deliverTransactionOperation(sessionId, partitionId, operation, options) {
      deliveries.push({sessionId, partitionId, operation, options});
      return {operation, partitionId,
        transactionId: options.transactionId,
        participantId: options.participantId,
        ...answerOf(operation)};
    },
  };
  const service = {async handleApplicationMessage(request) {
    const result = gateway.db.transaction(() =>
      applyTransactionSettlement(gateway.db, request.settlement))();
    return {committed: true, settlementResult: result};
  }};
  return {gateway, engine, service, deliveries};
}

test('release settlement freezes an expired OPEN row, binds rollback and proves actual fanout',
  async (t) => {
    const f = fixture(t, baseRow(), () =>
      ({success: true, state: 'ROLLED_BACK', outcome: 'NOT_COMMITTED'}));
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
      ({success: true, state: 'COMMITTED', outcome: 'COMMITTED'}));
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
