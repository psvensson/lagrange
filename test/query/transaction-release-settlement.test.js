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
import {
  MAX_SETTLED_RELEASE_TRANSACTIONS,
  settleTransactionReleaseRows,
  transactionReleaseProofOf,
} from '../../src/query/distributed/distributed-transaction-release-settlement.js';
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
  const service = {
    db: gateway.db,
    async handleApplicationMessage(request) {
      const result = gateway.db.transaction(() =>
        applyTransactionSettlement(gateway.db, request.settlement))();
      return {committed: true, settlementResult: result};
    },
  };
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

test('release settlement memo reuses verified durable row and re-drives when durable row changes',
  async (t) => {
    const decision = buildDecisionRecord(TX, 'COMMIT', [[PARTICIPANT, 'prepared']]);
    const f = fixture(t, baseRow({
      status: 'COMMITTING',
      participant_set_state: 'FROZEN',
      commit_mode: 'TWO_PHASE_COMMIT',
      frozen_participant_count: 1,
      decision: decision.decision,
      decision_text: decision.decisionText,
      decision_digest: decision.decisionDigest,
    }), () => ({success: true, state: 'COMMITTED', outcome: 'COMMITTED'}));

    const firstCensus = readTransactionReleaseCensus(f.gateway.db);
    const first = await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: firstCensus,
      now: NOW,
    });
    assert.equal(first.length, 1);
    assert.equal(f.deliveries.length, 1);

    // Unchanged durable terminal row reuses the memo without duplicate participant RPCs.
    const secondCensus = readTransactionReleaseCensus(f.gateway.db);
    const second = await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: secondCensus,
      now: NOW,
    });
    assert.deepEqual(second, first);
    assert.equal(f.deliveries.length, 1);

    // If the durable row reverts to non-terminal COMMITTING, memo is invalidated and re-driven.
    f.gateway.db.prepare(
      'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ).run('COMMITTING', TX);
    const thirdCensus = readTransactionReleaseCensus(f.gateway.db);
    const third = await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: thirdCensus,
      now: NOW,
    });
    assert.deepEqual(third, first);
    assert.equal(f.deliveries.length, 2);
    assert.equal(f.gateway.rows('sql_transactions')[0].status, 'COMMITTED');
  });

test('release settlement memo is bounded by MAX_SETTLED_RELEASE_TRANSACTIONS and prunes absent IDs',
  async (t) => {
    const f = fixture(t, baseRow(), () =>
      ({success: true, state: 'ROLLED_BACK', outcome: 'NOT_COMMITTED'}));
    f.gateway.db.prepare('DELETE FROM sql_transactions').run();

    const total = MAX_SETTLED_RELEASE_TRANSACTIONS + 2;
    const txIds = Array.from({length: total}, (_, index) =>
      (index + 1).toString(16).padStart(32, '0'));
    const insertStmt = f.gateway.db.prepare(
      'INSERT INTO sql_transactions (transaction_id, session_id, status, transaction_epoch, ' +
      'timeout_deadline, transaction_mode, participant_set_state, participant_set_text, ' +
      'commit_mode, frozen_participant_count, decision, decision_text, decision_digest, ' +
      'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    f.gateway.db.transaction(() => {
      for (const txId of txIds) {
        const record = buildDecisionRecord(txId, 'ROLLBACK', []);
        insertStmt.run(
          txId,
          'bulk-session',
          'ROLLED_BACK',
          1,
          100,
          'EXPLICIT',
          'FROZEN',
          '[]',
          'TWO_PHASE_COMMIT',
          0,
          record.decision,
          record.decisionText,
          record.decisionDigest,
          1,
          1,
        );
      }
    })();

    let readCalls = 0;
    const baseRead = f.engine.readDistributedTransactionRecoveryState;
    f.engine.readDistributedTransactionRecoveryState = async (transactionId) => {
      readCalls += 1;
      return baseRead(transactionId);
    };

    const fullCensus = readTransactionReleaseCensus(f.gateway.db);
    assert.equal(fullCensus.recoverableTransactionIds.length, total);
    const settled = await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: fullCensus,
      now: NOW,
    });
    assert.equal(settled.length, total);
    const readsAfterFirstPass = readCalls;

    // Because the first 2 entries were evicted when capacity (1024) was exceeded,
    // a subset census containing only the last entry hits the memo (0 authority reads),
    // and also prunes all other keys from the memo map.
    const lastId = txIds[txIds.length - 1];
    const firstId = txIds[0];
    const subsetLastCensus = {
      ...fullCensus,
      recoverableTransactionIds: Object.freeze([lastId]),
    };
    await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: subsetLastCensus,
      now: NOW,
    });
    assert.equal(readCalls, readsAfterFirstPass, 'retained entry within cap hits memo');

    // Pruned entry (e.g. txIds[2], which was in the map before subsetLastCensus pruned it)
    // and evicted entry (firstId) must now re-read authority when requested again.
    const thirdId = txIds[2];
    const recheckCensus = {
      ...fullCensus,
      recoverableTransactionIds: Object.freeze([firstId, thirdId, lastId]),
    };
    await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census: recheckCensus,
      now: NOW,
    });
    assert.equal(
      readCalls > readsAfterFirstPass,
      true,
      'evicted and pruned entries re-drive settlement from authority',
    );
  });

test('release settlement holds an unexpired FROZEN+ABSENT (PREPARING) row and settles once expired',
  async (t) => {
    const f = fixture(t, baseRow({
      status: 'PREPARING',
      participant_set_state: 'FROZEN',
      commit_mode: 'TWO_PHASE_COMMIT',
      frozen_participant_count: 1,
      timeout_deadline: NOW + 1,
    }), () => ({success: true, state: 'ROLLED_BACK', outcome: 'NOT_COMMITTED'}));
    const census = readTransactionReleaseCensus(f.gateway.db);
    assert.deepEqual(census.recoverableTransactionIds, [TX]);
    assert.equal(await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census,
      now: NOW,
    }), null);
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.gateway.rows('sql_transactions')[0].decision, null);

    const settled = await settleTransactionReleaseRows({
      engine: f.engine,
      service: f.service,
      census,
      now: NOW + 1,
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].decision, 'ROLLBACK');
    assert.equal(settled[0].terminalStatus, 'ROLLED_BACK');
    assert.equal(f.deliveries.length, 1);
  });
