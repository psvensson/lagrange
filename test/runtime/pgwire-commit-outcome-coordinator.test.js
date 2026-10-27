/**
 * The real DistributedTransactionCoordinator answers every failed COMMIT
 * with the typed commit-point fact, and the real PG-wire outcome rule says
 * "no changes were committed" only when that fact establishes it. Fake
 * partitions and an injected clock drive the budget.
 *
 * The verifier's reproducer: in a two-phase commit the COMMITTING stage
 * commits participants one at a time and checks the budget before each, so
 * a budget that lapses after participant 1 committed aborts the rest. The
 * wire must answer that COMMIT 08007 (outcome unknown), never 25P04
 * "no changes were committed".
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {resolveFailedStatementOutcome} from
  '../../src/runtime/pgwire-transaction-outcome.js';
import {AST_TYPE} from '../../src/query/parser-constants.js';
import {PG_TRANSACTION_STATE} from
  '../../src/runtime/pgwire-protocol-constants.js';

const BUDGET_MS = 1000;
const LAPSE_MS = 2000;
const SESSION = 'session-under-test';

function coordinatorUnderTest({onCommit = () => {}, onPrepare} = {}) {
  const clock = {now: 1_000_000};
  const committed = [];
  const coordinator = new DistributedTransactionCoordinator({
    now: () => clock.now,
    transactionBudgetMs: BUDGET_MS,
    beginParticipant: async () => ({success: true}),
    prepareParticipant: async (_session, partitionId) =>
      (onPrepare ? onPrepare(partitionId) : {success: true}),
    commitParticipant: async (_session, partitionId) => {
      committed.push(partitionId);
      onCommit(clock, partitionId);
      return {success: true};
    },
    rollbackParticipant: async () => ({success: true}),
    persistTransaction: async () => {},
    persistParticipant: async () => {},
    persistWriteOperation: async () => {},
    participantRetryMaxRetries: 0,
    sleep: async () => {},
  });
  return {clock, committed, coordinator};
}

function wireOutcome(coordinator, result) {
  return resolveFailedStatementOutcome({
    stateBefore: PG_TRANSACTION_STATE.IN_TRANSACTION,
    statementType: AST_TYPE.COMMIT,
    failure: result,
    engineHoldsTransaction: () => coordinator.hasActiveTransaction(SESSION),
  });
}

async function openTwoParticipants(coordinator) {
  await coordinator.begin(SESSION);
  const enlisted = await coordinator.enlistParticipants(SESSION,
    ['p1', 'p2']);
  assert.equal(enlisted.success, true);
}

describe('COMMIT outcome: real coordinator + real wire rule', () => {
  it('the budget lapses between 2PC participant commits: the engine ' +
    'reports the commit point reached; the wire answers 08007, never ' +
    '"no changes were committed"', async () => {
    const {committed, coordinator} = coordinatorUnderTest({
      onCommit: (clock) => {
        clock.now += LAPSE_MS;
      },
    });
    await openTwoParticipants(coordinator);
    const result = await coordinator.commit(SESSION);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'TIMEOUT');
    assert.equal(result.stage, 'COMMITTING');
    assert.deepEqual(committed, ['p1'], 'participant 1 committed');
    assert.equal(result.commitPointReached, true);
    const outcome = wireOutcome(coordinator, result);
    assert.equal(outcome.sqlState, '08007');
    assert.doesNotMatch(outcome.message, /no changes were committed/u);
    assert.equal(outcome.detail.engine_error_code, 'TIMEOUT');
    assert.equal(outcome.detail.engine_stage, 'COMMITTING');
    assert.equal(outcome.state, PG_TRANSACTION_STATE.IDLE,
      'the engine no longer holds the transaction');
  });

  it('the budget expired before COMMIT: the engine reports the commit ' +
    'point not reached; the wire answers 25P04 nothing committed',
  async () => {
    const {clock, committed, coordinator} = coordinatorUnderTest();
    await openTwoParticipants(coordinator);
    clock.now += LAPSE_MS;
    const result = await coordinator.commit(SESSION);
    assert.equal(result.errorCode, 'TIMEOUT');
    assert.equal(result.commitPointReached, false);
    assert.deepEqual(committed, []);
    const outcome = wireOutcome(coordinator, result);
    assert.equal(outcome.sqlState, '25P04');
    assert.match(outcome.message, /no changes were committed/u);
    assert.equal(outcome.state, PG_TRANSACTION_STATE.IDLE);
  });

  it('the budget lapses during PREPARE: commit point not reached, 25P04',
    async () => {
      const {clock, committed, coordinator} = coordinatorUnderTest({
        onPrepare: () => {
          clock.now += LAPSE_MS;
          return {success: true};
        },
      });
      await openTwoParticipants(coordinator);
      const result = await coordinator.commit(SESSION);
      assert.equal(result.errorCode, 'TIMEOUT');
      assert.notEqual(result.stage, 'COMMITTING');
      assert.equal(result.commitPointReached, false);
      assert.deepEqual(committed, []);
      assert.equal(wireOutcome(coordinator, result).sqlState, '25P04');
    });

  it('a participant refuses PREPARE: commit point not reached, the engine ' +
    'error is answered as is', async () => {
    const {committed, coordinator} = coordinatorUnderTest({
      onPrepare: () => {
        throw new Error('prepare refused');
      },
    });
    await openTwoParticipants(coordinator);
    const result = await coordinator.commit(SESSION);
    assert.equal(result.stage, 'PREPARING');
    assert.equal(result.commitPointReached, false);
    assert.deepEqual(committed, []);
    assert.equal(wireOutcome(coordinator, result).kind, 'engine_error');
  });

  it('the sweep rolled the transaction back before COMMIT: NO_TRANSACTION ' +
    'carries the ended transaction\'s commit point (not reached), 25P04',
  async () => {
    const {clock, coordinator} = coordinatorUnderTest();
    await openTwoParticipants(coordinator);
    clock.now += LAPSE_MS;
    await coordinator.runRecoverySweep();
    assert.equal(coordinator.hasActiveTransaction(SESSION), false);
    const result = await coordinator.commit(SESSION);
    assert.equal(result.errorCode, 'NO_TRANSACTION');
    assert.equal(result.commitPointReached, false);
    assert.equal(wireOutcome(coordinator, result).sqlState, '25P04');
  });

  it('a COMMIT with no ended-transaction record says nothing: outcome ' +
    'unknown', async () => {
    const {coordinator} = coordinatorUnderTest();
    const result = await coordinator.commit(SESSION);
    assert.equal(result.errorCode, 'NO_TRANSACTION');
    assert.equal(result.commitPointReached, undefined);
    assert.equal(wireOutcome(coordinator, result).sqlState, '08007');
  });

  it('two transactions of one session begun within one clock tick get ' +
    'distinct ids', async () => {
    const {coordinator} = coordinatorUnderTest();
    const first = await coordinator.begin(SESSION);
    await coordinator.rollback(SESSION);
    const second = await coordinator.begin(SESSION);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(typeof first.transactionId, 'string');
    assert.notEqual(second.transactionId, first.transactionId,
      'the fixed clock does not repeat an id');
  });

  it('another transaction\'s ended record never answers for a COMMIT ' +
    'whose own transaction is known: outcome unknown', async () => {
    const {clock, coordinator} = coordinatorUnderTest();
    await openTwoParticipants(coordinator);
    const ownId = coordinator.getTransaction(SESSION).transactionId;
    clock.now += LAPSE_MS;
    await coordinator.runRecoverySweep();
    const foreign = await coordinator.commit(SESSION,
      {expectedTransactionId: `${ownId}-another`});
    assert.equal(foreign.errorCode, 'NO_TRANSACTION');
    assert.equal(foreign.commitPointReached, undefined,
      'no "not committed" from another transaction\'s record');
    assert.equal(wireOutcome(coordinator, foreign).sqlState, '08007');
    const own = await coordinator.commit(SESSION,
      {expectedTransactionId: ownId});
    assert.equal(own.commitPointReached, false, 'its own record answers');
    assert.equal(own.transactionId, ownId);
    assert.equal(wireOutcome(coordinator, own).sqlState, '25P04');
  });
});
