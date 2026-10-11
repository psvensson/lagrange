import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DistributedTransactionCoordinator} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {buildTransactionDecisionRecord} from '../../src/query/distributed/distributed-transaction-decision.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
const logger = {debug() {}, warn() {}, error() {}};
const evidence = {preparedDigest: 'b'.repeat(64), prepareIndex: 3, prepareTerm: 1};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => resolve = r);
  return {promise, resolve};
};
const ticks = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

test('review R2-A: exact old COMMIT cannot commit newer session transaction', async ()=>{
  const writes=[];
  const c = new DistributedTransactionCoordinator({logger,
    prepareParticipant: async () => evidence,
    persistTransactionDecision: async (record) => writes.push(record)});
  const old=await c.begin('reused');
  await c.rollback('reused');
  writes.length = 0;
  const current=await c.begin('reused');
  await c.enlistParticipants('reused', ['p1']);
  const result=await c.commit('reused', {expectedTransactionId: old.transactionId});
  assert.equal(result.errorCode, 'NO_TRANSACTION');
  assert.equal(writes.length, 0);
  assert.equal(c.getTransaction('reused')?.transactionId, current.transactionId);
});

test('review R2-B: exact old ROLLBACK cannot roll back newer engine transaction', async (t)=>{
  const gateway=createTransactionPersistenceGateway();
  t.after(()=>gateway.db.close());
  const e=new SQLQueryEngine({controlPlaneSystemTableGateway: gateway});
  const old=await e.executeQuery('BEGIN', [], {sessionId: 'reused'});
  await e.executeQuery('ROLLBACK', [], {sessionId: 'reused', expectedTransactionId: old.transactionId});
  const current=await e.executeQuery('BEGIN', [], {sessionId: 'reused'});
  const result=await e.executeQuery('ROLLBACK', [], {sessionId: 'reused', expectedTransactionId: old.transactionId});
  assert.equal(result.errorCode, 'NO_TRANSACTION');
  assert.equal(e.transactionCoordinator.getTransaction('reused')?.transactionId, current.transactionId);
});

test('review R2-C: BEGIN expectation is checked again after its FIFO wait', async (t)=>{
  const gateway=createTransactionPersistenceGateway();
  t.after(()=>gateway.db.close());
  const e=new SQLQueryEngine({controlPlaneSystemTableGateway: gateway});
  const old=await e.executeQuery('BEGIN', [], {sessionId: 'reused'});
  const entered=deferred();
  const release=deferred();
  const read=e.transactionCoordinator.executeReadStatement('reused', old.transactionId, async ()=>{
    entered.resolve();
    await release.promise;
    return {success: true};
  });
  await entered.promise;
  const rollback=e.transactionCoordinator.rollback('reused');
  const begin=e.handleAdmittedBegin('reused', {expectedTransactionId: old.transactionId});
  await ticks();
  release.resolve();
  await read;
  await rollback;
  const result=await begin;
  assert.equal(result.errorCode, 'NO_TRANSACTION');
  assert.equal(e.transactionCoordinator.getTransaction('reused'), null);
});

test('R2-F: controls without a caller token retain their enqueue identity ' +
  'while an old read overlaps completion and a fresh BEGIN', async () => {
  const coordinator = new DistributedTransactionCoordinator({logger});
  const old = await coordinator.begin('overlap');
  const entered = deferred();
  const release = deferred();
  const read = coordinator.executeReadStatement('overlap', old.transactionId,
    async () => {
      entered.resolve();
      await release.promise;
      return {success: true};
    });
  await entered.promise;
  const rollback = coordinator.rollback('overlap');
  const lateCommit = coordinator.commit('overlap');
  const lateBegin = coordinator.begin('overlap');
  release.resolve();
  await read;
  assert.equal((await rollback).success, true);
  assert.equal((await lateCommit).errorCode, 'NO_TRANSACTION');
  assert.equal((await lateBegin).errorCode, 'NO_TRANSACTION');
  const fresh = await coordinator.begin('overlap');
  assert.equal(fresh.success, true);
  assert.notEqual(fresh.transactionId, old.transactionId);
  assert.equal((await coordinator.rollback('overlap', {
    expectedTransactionId: old.transactionId})).errorCode, 'NO_TRANSACTION');
  assert.equal(coordinator.getTransaction('overlap').transactionId,
    fresh.transactionId);
  assert.equal((await coordinator.commit('overlap', {
    expectedTransactionId: fresh.transactionId})).success, true);
});

test('review R2-D: stale ACTIVE projection cannot erase durable COMMIT debt', async ()=>{
  const id='a'.repeat(32);
  const canonical=buildTransactionDecisionRecord({transactionId: id, participants: new Map([['p1', {partitionId: 'p1', ...evidence}]])}, 'COMMIT');
  const persisted=[];
  const calls=[];
  const c = new DistributedTransactionCoordinator({logger, now: () => 100,
    readTransactionDecision: async () => canonical,
    persistTransaction: async (row) => persisted.push({...row}),
    commitParticipant: async () => calls.push('commit'),
    rollbackParticipant: async () => calls.push('rollback')});
  c.recoverFromSystemTables({transactions: [{transaction_id: id, session_id: 'stale', transaction_epoch: 7, status: 'ACTIVE', timeout_deadline: 1, transaction_mode: 'EXPLICIT', participant_set_state: 'OPEN', commit_mode: 'NOT_SELECTED', frozen_participant_count: 0, created_at: 1, updated_at: 1}], participants: []});
  const result=await c.resumeRecoveredTransactions();
  const tx=c.workflowCoordinator.getWorkflowById(id);
  assert.deepEqual(calls, [], 'incomplete authority cannot fan out');
  assert.equal(persisted.length, 0, 'incomplete authority cannot terminalize');
  assert.notEqual(tx.status, 'ROLLED_BACK');
  assert.equal(result.resumed, 0);
  assert.ok(c.recoveredTransactionIds.has(id));
});

test('review R2-E: stale restart persists false terminal over canonical COMMIT row', async (t)=>{
  const gateway=createTransactionPersistenceGateway();
  t.after(()=>gateway.db.close());
  const id='b'.repeat(32);
  const canonical=buildTransactionDecisionRecord({transactionId: id, participants: new Map([['p1', {partitionId: 'p1', ...evidence}]])}, 'COMMIT');
  const stale={transaction_id: id, session_id: 'persisted-stale', transaction_epoch: 7, status: 'ACTIVE', timeout_deadline: 1, transaction_mode: 'EXPLICIT', participant_set_state: 'OPEN', commit_mode: 'NOT_SELECTED', frozen_participant_count: 0, created_at: 1, updated_at: 1};
  gateway.seed('sql_transactions', {...stale, status: 'COMMITTING', participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: 1, decision: canonical.decision, decision_text: canonical.decisionText, decision_digest: canonical.decisionDigest});
  gateway.seed('sql_transaction_participants', {participant_id: `${id}:p1`, transaction_id: id, partition_id: 'p1', status: 'PREPARED', prepared_digest: evidence.preparedDigest, prepare_index: 3, prepare_term: 1, created_at: 1, updated_at: 2});
  let reads=0;
  const ownerRead=gateway.readAuthoritativeRows;
  gateway.readAuthoritativeRows=async (...args)=>{
    reads++;
    return ownerRead(...args);
  };
  const e=new SQLQueryEngine({controlPlaneSystemTableGateway: gateway});
  await e.waitForDistributedTransactionRecoveryReplay();
  e.transactionCoordinator.recoverFromSystemTables({transactions: [stale], participants: []});
  const result=await e.resumeRecoveredDistributedTransactions();
  const row=gateway.rows('sql_transactions')[0];
  const restarted=new DistributedTransactionCoordinator({logger});
  restarted.recoverFromSystemTables({transactions: [row], participants: gateway.rows('sql_transaction_participants')});
  assert.ok(reads > 0, 'recovery consults authoritative state');
  assert.equal(result.resumed, 0, 'missing complete authority retains the debt');
  assert.ok(restarted.recoveredTransactionIds.has(id));
  assert.notEqual(row.status, 'ROLLED_BACK');
  assert.equal(row.frozen_participant_count, 1);
});
