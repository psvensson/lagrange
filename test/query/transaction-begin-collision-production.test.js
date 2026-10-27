import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

const FIRST_ID = '1'.repeat(32);
const SECOND_ID = '2'.repeat(32);
const SESSION_ID = 'begin-collision-production';

function rowOf(gateway, transactionId) {
  return gateway.db.prepare('SELECT * FROM sql_transactions WHERE transaction_id = ?')
    .get(transactionId) ?? null;
}

function cloneRow(gateway, transactionId) {
  const row = rowOf(gateway, transactionId);
  return row === null ? null : structuredClone(row);
}

function createHarness(gateway, mintedIds) {
  const deliveries = [];
  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: {
      async deliver(_address, message) {
        deliveries.push(structuredClone(message));
        return buildDeliveryEnvelope({acknowledged: false});
      },
    },
  });
  engine.transactionCoordinator.createTransactionId = () => mintedIds.shift();
  return {deliveries, engine};
}

function decisionFields(transactionId) {
  const decision = buildTransactionDecisionRecord({
    participants: new Map(),
    transactionId,
  }, 'COMMIT');
  return {
    decision: decision.decision,
    decision_text: decision.decisionText,
    decision_digest: decision.decisionDigest,
  };
}

test('BEGIN insert owner adopts an exact lost-answer row without reminting or ' +
  'participant fanout', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  const submit = gateway.submitMutation.bind(gateway);
  const read = gateway.readAuthoritativeRows.bind(gateway);
  const beforeReadback = [];
  let candidateInsertAttempts = 0;
  gateway.submitMutation = async (mutation, options) => {
    const result = await submit(mutation, options);
    if (mutation.operation === 'insert' &&
        mutation.tableName === TABLES.SQL_TRANSACTIONS) {
      candidateInsertAttempts += 1;
      return {success: false, error: 'simulated lost INSERT answer'};
    }
    return result;
  };
  gateway.readAuthoritativeRows = async (tableName, sql, params) => {
    if (tableName === TABLES.SQL_TRANSACTIONS && params?.[0] === FIRST_ID) {
      beforeReadback.push(cloneRow(gateway, FIRST_ID));
    }
    return read(tableName, sql, params);
  };
  const {deliveries, engine} = createHarness(gateway, [FIRST_ID, SECOND_ID]);
  t.after(async () => {
    await engine.shutdown();
    gateway.db.close();
  });

  const begun = await engine.executeQuery('BEGIN', [], {sessionId: SESSION_ID});
  const afterBegin = cloneRow(gateway, FIRST_ID);

  assert.equal(begun.success, true,
    'the exact durable row resolves the lost answer as the original BEGIN');
  assert.equal(begun.transactionId, FIRST_ID);
  assert.equal(candidateInsertAttempts, 1,
    'an exact authoritative readback does not mint another candidate');
  assert.equal(engine.transactionCoordinator.getTransaction(SESSION_ID)?.transactionId,
    FIRST_ID);
  assert.equal(beforeReadback.length, 1);
  assert.deepEqual(beforeReadback[0], afterBegin,
    'BEGIN preserves every durable initial-row byte across lost-answer readback');
  assert.equal(afterBegin.status, 'ACTIVE');
  assert.equal(afterBegin.decision, null);
  assert.deepEqual(deliveries, [],
    'BEGIN collision resolution cannot send participant operations');
});

test('BEGIN insert owner preserves a conflicting durable COMMIT and remints only ' +
  'the new candidate', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  const submit = gateway.submitMutation.bind(gateway);
  const read = gateway.readAuthoritativeRows.bind(gateway);
  const beforeReadback = [];
  let firstCandidate = null;
  let candidateInsertAttempts = 0;
  let foreignInsertCount = 0;
  let foreignAdvanceCount = 0;
  gateway.submitMutation = async (mutation, options) => {
    if (mutation.operation === 'insert' &&
        mutation.tableName === TABLES.SQL_TRANSACTIONS) {
      candidateInsertAttempts += 1;
    }
    if (mutation.operation === 'insert' &&
        mutation.tableName === TABLES.SQL_TRANSACTIONS &&
        mutation.row.transaction_id === FIRST_ID) {
      firstCandidate = structuredClone(mutation.row);
      const foreignInitial = {
        ...firstCandidate,
        session_id: 'foreign-session',
        transaction_epoch: firstCandidate.transaction_epoch + 1,
        timeout_deadline: firstCandidate.timeout_deadline + 1,
        transaction_mode: 'AUTOCOMMIT',
        created_at: firstCandidate.created_at + 1,
        updated_at: firstCandidate.updated_at + 1,
      };
      const inserted = await submit({
        operation: 'insert',
        tableName: TABLES.SQL_TRANSACTIONS,
        row: foreignInitial,
      }, options);
      assert.equal(inserted.success, true);
      foreignInsertCount += 1;
      const advanced = await submit({
        operation: 'update',
        tableName: TABLES.SQL_TRANSACTIONS,
        whereClause: {transaction_id: FIRST_ID},
        data: {
          status: 'COMMITTED',
          participant_set_state: 'FROZEN',
          participant_set_text: '[]',
          commit_mode: 'TWO_PHASE_COMMIT',
          frozen_participant_count: 0,
          ...decisionFields(FIRST_ID),
          updated_at: firstCandidate.updated_at + 2,
        },
      }, options);
      assert.deepEqual(advanced, {success: true, affectedRows: 1, changes: 1});
      foreignAdvanceCount += 1;
      const collision = await submit(mutation, options);
      assert.equal(collision.success, false,
        'the candidate INSERT executes and loses to the durable primary key');
      assert.equal(collision.errorCode, 'SQLITE_CONSTRAINT_PRIMARYKEY');
      return {success: false, error: 'simulated lost INSERT answer'};
    }
    return submit(mutation, options);
  };
  gateway.readAuthoritativeRows = async (tableName, sql, params) => {
    if (tableName === TABLES.SQL_TRANSACTIONS && params?.[0] === FIRST_ID) {
      beforeReadback.push(cloneRow(gateway, FIRST_ID));
    }
    return read(tableName, sql, params);
  };
  const {deliveries, engine} = createHarness(gateway, [FIRST_ID, SECOND_ID]);
  t.after(async () => {
    await engine.shutdown();
    gateway.db.close();
  });

  const begun = await engine.executeQuery('BEGIN', [], {sessionId: SESSION_ID});
  const afterBegin = cloneRow(gateway, FIRST_ID);
  const allRows = gateway.rows(TABLES.SQL_TRANSACTIONS)
    .sort((left, right) => left.transaction_id.localeCompare(right.transaction_id));

  assert.equal(begun.success, true,
    'a conflicting durable identity must remain a collision so BEGIN remints');
  assert.equal(begun.transactionId, SECOND_ID,
    'only the new BEGIN candidate is reminted after the conflicting identity');
  assert.equal(candidateInsertAttempts, 2);
  assert.equal(foreignInsertCount, 1);
  assert.equal(foreignAdvanceCount, 1);
  assert.equal(beforeReadback.length, 1);
  assert.deepEqual(beforeReadback[0], afterBegin,
    'the complete foreign row is byte-exact before readback and after BEGIN');
  assert.equal(afterBegin.session_id, 'foreign-session');
  assert.equal(afterBegin.status, 'COMMITTED');
  assert.equal(afterBegin.decision, 'COMMIT');
  assert.equal(engine.transactionCoordinator.getTransaction(SESSION_ID)?.transactionId,
    SECOND_ID, 'the conflicting row is neither adopted nor installed in the session');
  assert.deepEqual(allRows.map((row) => [row.transaction_id, row.status, row.decision]), [
    [FIRST_ID, 'COMMITTED', 'COMMIT'],
    [SECOND_ID, 'ACTIVE', null],
  ]);
  assert.equal(deliveries.filter((message) =>
    message.operation === 'COMMIT' || message.operation === 'ROLLBACK').length, 0,
  'collision resolution cannot fan out a decision for the conflicting identity');
  assert.deepEqual(deliveries, []);

  // The distinct same-creation advanced-row control remains owned by
  // transaction-review-adversarial.test.js: BEGIN keeps its FIFO lane while
  // normal recovery advances COMMITTING/COMMIT to COMMITTED/COMMIT.
});
