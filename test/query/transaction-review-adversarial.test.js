import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DistributedTransactionCoordinator} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {buildTransactionDecisionRecord} from '../../src/query/distributed/distributed-transaction-decision.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {transactionRecoveryAuthorityCandidate} from
  '../../src/query/distributed/distributed-transaction-recovery-authority.js';
import {
  isParticipantTransactionAnswer,
  preparedEvidenceOf,
} from '../../src/query/sql-query-engine-participant-wire.js';
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

function isInitialTransactionInsert(mutation) {
  return mutation.operation === 'insert' &&
    mutation.tableName === 'sql_transactions';
}

function advancedWithoutProgressRow(mutation, recordedCommit) {
  const transactionId = mutation.row.transaction_id;
  const participantSetText = participantSetTextOf(transactionId, ['p1']);
  const decision = recordedCommit ? buildTransactionDecisionRecord({
    transactionId,
    participants: new Map([['p1', {partitionId: 'p1', ...evidence}]]),
  }, 'COMMIT') : null;
  return {...mutation.row,
    status: recordedCommit ? 'COMMITTING' : 'ACTIVE',
    participant_set_state: recordedCommit ? 'FROZEN' : 'OPEN',
    participant_set_text: participantSetText,
    commit_mode: recordedCommit ? 'TWO_PHASE_COMMIT' : 'NOT_SELECTED',
    frozen_participant_count: recordedCommit ? 1 : 0,
    decision: decision?.decision ?? null,
    decision_text: decision?.decisionText ?? null,
    decision_digest: decision?.decisionDigest ?? null,
    updated_at: mutation.row.updated_at + 1};
}

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

test('C56-1: incomplete PREPARE coordinates cannot authorize COMMIT',
  async () => {
    const decisions = [];
    const commits = [];
    const rollbacks = [];
    const coordinator = new DistributedTransactionCoordinator({logger,
      prepareParticipant: async () => ({preparedDigest: 'a'.repeat(64),
        prepareIndex: null, prepareTerm: 0}),
      commitParticipant: async (...args) => commits.push(args),
      rollbackParticipant: async (...args) => rollbacks.push(args),
      persistTransactionDecision: async (record) => decisions.push(record)});
    const begun = await coordinator.begin('incomplete-evidence');
    await coordinator.enlistParticipants('incomplete-evidence', ['p1']);
    const result = await coordinator.commit('incomplete-evidence', {
      expectedTransactionId: begun.transactionId});
    assert.deepEqual({decision: decisions[0]?.decision,
      resultSuccess: result.success, commits: commits.length,
      rollbacks: rollbacks.length},
    {decision: 'ROLLBACK', resultSuccess: false, commits: 0, rollbacks: 1});

    const validDecisions = [];
    const validCommits = [];
    const valid = new DistributedTransactionCoordinator({logger,
      prepareParticipant: async () => ({preparedDigest: 'b'.repeat(64),
        prepareIndex: 8, prepareTerm: 3}),
      commitParticipant: async (...args) => validCommits.push(args),
      persistTransactionDecision: async (record) => validDecisions.push(record)});
    const validBegin = await valid.begin('complete-evidence');
    await valid.enlistParticipants('complete-evidence', ['p1']);
    const validResult = await valid.commit('complete-evidence', {
      expectedTransactionId: validBegin.transactionId});
    assert.deepEqual({decision: validDecisions[0]?.decision,
      resultSuccess: validResult.success, commits: validCommits.length},
    {decision: 'COMMIT', resultSuccess: true, commits: 1});
  });

test('C56-4: participant answers reject noHandler, inherited fields, and ' +
  'accessors without invoking them', () => {
  assert.equal(isParticipantTransactionAnswer({acknowledged: true,
    success: true, noHandler: true}), false);
  assert.throws(() => preparedEvidenceOf(Object.create({acknowledged: true,
    success: true, state: 'PREPARED', preparedDigest: 'a'.repeat(64),
    prepareIndex: 2, prepareTerm: 1})));
  let digestReads = 0;
  assert.throws(() => preparedEvidenceOf({acknowledged: true, success: true,
    state: 'PREPARED', get preparedDigest() {
      digestReads += 1;
      return 'a'.repeat(64);
    }, prepareIndex: 2, prepareTerm: 1}));
  assert.equal(digestReads, 0,
    'the strict own-data boundary refuses an accessor without reading it');
});

test('C56-4: live delivery binds the processed response to the exact request',
  async (t) => {
    const engine = new SQLQueryEngine({
      controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(async () => {
      const gateway = engine.controlPlaneSystemTableGateway;
      await engine.shutdown();
      gateway.db.close();
    });
    const transactionId = 'e'.repeat(32);
    const participantId = `${transactionId}:p1`;
    let answer = null;
    engine.queryExecutor.executeOnPartition = async (...args) => {
      const options = args[6];
      if (!options.isSuccessfulResponse(answer)) {
        return {success: false, error: 'participant response rejected'};
      }
      return options.buildSuccessResult(answer);
    };
    const exact = {acknowledged: true, success: true, operation: 'BEGIN',
      partitionId: 'p1', transactionId, participantId, state: 'ACTIVE'};
    for (const divergent of [
      {...exact, noHandler: true},
      {...exact, operation: 'ROLLBACK'},
      {...exact, partitionId: 'p2'},
      {...exact, transactionId: 'f'.repeat(32)},
      {...exact, participantId: `${transactionId}:p2`},
    ]) {
      answer = divergent;
      await assert.rejects(engine.deliverTransactionOperation('session', 'p1',
        'BEGIN', {transactionId, participantId}));
    }
    answer = exact;
    assert.equal((await engine.deliverTransactionOperation('session', 'p1',
      'BEGIN', {transactionId, participantId})).state, 'ACTIVE');
  });

test('C56-6: uncertain BEGIN accepts an exact lost INSERT answer',
  async (t) => {
    let submitted = null;
    let inserts = 0;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        submitted = mutation.row;
        inserts += 1;
        return {success: false, error: 'simulated lost mutation answer'};
      },
      async readAuthoritativeRows() {
        return {success: true, rows: [{...submitted}]};
      },
    };
    const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false});
    t.after(() => engine.shutdown());
    const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'exact'});
    assert.deepEqual({success: begun.success, inserts,
      heldId: engine.transactionCoordinator.getTransaction('exact')?.transactionId,
      begunId: begun.transactionId},
    {success: true, inserts: 1, heldId: begun.transactionId,
      begunId: begun.transactionId});
  });

test('C56-6: uncertain BEGIN refuses conflicting immutable creation content',
  async (t) => {
    let submitted = null;
    const gateway = {
      supportsMutationSubmission: () => true,
      async submitMutation(mutation) {
        submitted = mutation.row;
        return {success: false, error: 'simulated lost mutation answer'};
      },
      async readAuthoritativeRows() {
        return {success: true, rows: [{...submitted,
          timeout_deadline: submitted.timeout_deadline + 1,
          transaction_mode: 'AUTOCOMMIT_STATEMENT'}]};
      },
    };
    const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false});
    t.after(() => engine.shutdown());
    const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'readback'});
    assert.deepEqual({success: begun.success,
      held: engine.transactionCoordinator.getTransaction('readback')},
    {success: false, held: null});
  });

test('C56-6: matching advanced readback is left to durable recovery without ' +
  'reminting or resetting it to ACTIVE', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const submit = gateway.submitMutation.bind(gateway);
  let intercepted = false;
  let insertedId = null;
  gateway.submitMutation = async (mutation, options) => {
    const result = await submit(mutation, options);
    if (!intercepted && mutation.operation === 'insert' &&
        mutation.tableName === 'sql_transactions') {
      intercepted = true;
      insertedId = mutation.row.transaction_id;
      const participantId = `${insertedId}:p1`;
      const decision = buildTransactionDecisionRecord({transactionId: insertedId,
        participants: new Map([['p1', {partitionId: 'p1', ...evidence}]])},
      'COMMIT');
      gateway.db.prepare('UPDATE sql_transactions SET status = ?, ' +
        'participant_set_state = ?, participant_set_text = ?, commit_mode = ?, ' +
        'frozen_participant_count = ?, decision = ?, decision_text = ?, ' +
        'decision_digest = ?, updated_at = updated_at + 1 ' +
        'WHERE transaction_id = ?').run('ROLLING_BACK', 'FROZEN', '[]',
        'TWO_PHASE_COMMIT', 1, decision.decision, decision.decisionText,
        decision.decisionDigest, insertedId);
      gateway.seed('sql_transactions', {...gateway.rows('sql_transactions')[0],
        participant_set_text: participantSetTextOf(insertedId, ['p1'])});
      gateway.seed('sql_transaction_participants', {participant_id: participantId,
        transaction_id: insertedId, partition_id: 'p1', status: 'PREPARED',
        prepared_digest: evidence.preparedDigest, prepare_index: 3,
        prepare_term: 2, created_at: mutation.row.created_at,
        updated_at: mutation.row.updated_at + 1});
      return {success: false, error: 'simulated lost INSERT answer'};
    }
    return result;
  };
  const deliveries = [];
  const commitEntered = deferred();
  const releaseCommit = deferred();
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{partition_id: 'p1', table_name: 'users', partition_key_start: null,
      partition_key_end: null}],
  );
  const router = {async deliver(address, message) {
    const partitionId = address.split('/')[2];
    deliveries.push(structuredClone(message));
    if (message.operation === 'COMMIT') {
      commitEntered.resolve();
      await releaseCommit.promise;
    }
    return {...answerParticipantTransactionRequest(message, partitionId),
      decisionIndex: 12, decisionTerm: 9};
  }};
  const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
    systemCache: cache, messageRouter: router});
  t.after(() => engine.shutdown());
  await engine.waitForDistributedTransactionRecoveryReplay();
  const begun = await engine.executeQuery('BEGIN', [], {sessionId: 'advanced'});
  await commitEntered.promise;
  const before = gateway.rows('sql_transactions');
  const held = engine.transactionCoordinator.workflowCoordinator
    .getWorkflowById(insertedId);
  const heldAfterBegin = held && [held.transactionId, held.status];
  releaseCommit.resolve();
  const replay = await engine.waitForDistributedTransactionRecoveryReplay();
  const after = gateway.rows('sql_transactions');
  const participantAfter = gateway.rows('sql_transaction_participants')[0];
  assert.deepEqual({beginSuccess: begun.success,
    beginError: begun.errorCode, insertedId,
    heldAfterBegin,
    rowsBefore: before.map((row) => [row.transaction_id, row.status, row.decision,
      row.frozen_participant_count]),
    replay: {resumed: replay.resumed, failed: replay.failed},
    rowsAfter: after.map((row) => [row.transaction_id, row.status, row.decision,
      row.frozen_participant_count]),
    operations: deliveries.map((message) => [message.operation,
      message.transactionId, message.decision]),
    prepareCoordinates: [participantAfter.prepare_index,
      participantAfter.prepare_term],
    inserts: gateway.mutations.filter((entry) =>
      entry.tableName === 'sql_transactions' && entry.operation === 'insert').length},
  {beginSuccess: false, beginError: 'TRANSACTION_RECOVERY_INCOMPLETE', insertedId,
    heldAfterBegin: [insertedId, 'COMMITTING'],
    rowsBefore: [[insertedId, 'COMMITTING', 'COMMIT', 1]],
    replay: {resumed: 1, failed: 0},
    rowsAfter: [[insertedId, 'COMMITTED', 'COMMIT', 1]],
    operations: [['COMMIT', insertedId, 'COMMIT']],
    prepareCoordinates: [3, 2], inserts: 1});
});

test('advanced BEGIN handoff preserves admitted participants without progress',
  async (_t) => {
    async function runScenario(recordedCommit) {
      let advancedRow = null;
      const deliveries = [];
      const gateway = {
        supportsMutationSubmission: () => true,
        async submitMutation(mutation) {
          if (isInitialTransactionInsert(mutation)) {
            advancedRow = advancedWithoutProgressRow(mutation, recordedCommit);
            return {success: false, error: 'simulated lost INSERT answer'};
          }
          return {success: true, completionState: 'applied'};
        },
        async readAuthoritativeRows(tableName) {
          if (tableName === 'sql_transactions') {
            return {success: true, rows: advancedRow ? [{...advancedRow}] : []};
          }
          if (tableName === 'sql_transaction_participants') {
            return {success: true, rows: []};
          }
          return {success: true, rows: []};
        },
      };
      const cache = createMockSystemCache(
        [{table_name: 'users', primaryKey: 'id'}],
        [{partition_id: 'p1', table_name: 'users', partition_key_start: null,
          partition_key_end: null}],
      );
      const router = {async deliver(address, message) {
        const partitionId = address.split('/')[2];
        deliveries.push(structuredClone(message));
        return {...answerParticipantTransactionRequest(message, partitionId),
          decisionIndex: 12, decisionTerm: 9};
      }};
      const engine = new SQLQueryEngine({
        controlPlaneSystemTableGateway: gateway,
        systemCache: cache,
        messageRouter: router,
      });
      await engine.waitForDistributedTransactionRecoveryReplay();
      const begun = await engine.executeQuery('BEGIN', [], {
        sessionId: recordedCommit ? 'missing-progress-commit' :
          'missing-progress-open',
      });
      await ticks();
      await engine.waitForDistributedTransactionRecoveryReplay();
      const restored = engine.transactionCoordinator.workflowCoordinator
        .getWorkflowById(advancedRow.transaction_id);
      await engine.shutdown();
      return {advancedRow, begun, deliveries, restored};
    }

    const open = await runScenario(false);
    assert.equal(open.begun.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    assert.deepEqual([...open.restored.participants.entries()].map(
      ([partitionId, participant]) => [partitionId, participant.status]),
    [['p1', 'FAILED']]);
    assert.deepEqual(open.deliveries, []);

    const openId = open.advancedRow.transaction_id;
    const openTx = {transactionId: openId,
      sessionId: open.advancedRow.session_id,
      workflowId: openId,
      createdAt: open.advancedRow.created_at,
      updatedAt: open.advancedRow.updated_at};
    const participantId = `${openId}:p1`;
    const basePayload = {state: 'available', transaction: open.advancedRow};
    assert.equal(transactionRecoveryAuthorityCandidate(openTx, basePayload), null,
      'an unavailable participant page cannot certify the recovery census');
    assert.equal(transactionRecoveryAuthorityCandidate(openTx, {...basePayload,
      participants: [{transaction_id: 'f'.repeat(32), participant_id: participantId,
        partition_id: 'p1'}]}), null, 'a foreign progress row is refused');
    assert.equal(transactionRecoveryAuthorityCandidate(openTx, {...basePayload,
      participants: [
        {transaction_id: openId, participant_id: participantId,
          partition_id: 'p1'},
        {transaction_id: openId, participant_id: participantId,
          partition_id: 'p1'},
      ]}), null, 'duplicate progress rows are refused');
    assert.equal(transactionRecoveryAuthorityCandidate(openTx, {...basePayload,
      participants: [{transaction_id: openId, participant_id: participantId,
        partition_id: 'p2'}]}), null, 'manifest-mismatched progress is refused');

    const committed = await runScenario(true);
    assert.equal(committed.begun.errorCode, 'TRANSACTION_RECOVERY_INCOMPLETE');
    assert.deepEqual(committed.deliveries.map((message) => [message.operation,
      message.transactionId, message.decision]),
    [['COMMIT', committed.advancedRow.transaction_id, 'COMMIT']]);
  });

test('C56-6: BEGIN admits only the canonical recovery epoch domain before ' +
  'the first durable row write', async (t) => {
  const invalid = [Number.NaN, Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY, -1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1];
  for (const epoch of invalid) {
    const gateway = createTransactionPersistenceGateway();
    const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false,
      transactionEpochSource: () => epoch});
    const begun = await engine.executeQuery('BEGIN', [],
      {sessionId: `bad-epoch-${invalid.indexOf(epoch)}`});
    assert.equal(begun.success, false);
    assert.equal(gateway.rows('sql_transactions').length, 0);
    await engine.shutdown();
    gateway.db.close();
    const recovery = new DistributedTransactionCoordinator({logger});
    assert.throws(() => recovery.recoverFromSystemTables({transactions: [{
      transaction_id: 'c'.repeat(32), session_id: 'bad-recovery-epoch',
      transaction_epoch: epoch, status: 'ACTIVE', timeout_deadline: 10,
      transaction_mode: 'EXPLICIT', participant_set_state: 'OPEN',
      participant_set_text: '[]', commit_mode: 'NOT_SELECTED',
      frozen_participant_count: 0, created_at: 1, updated_at: 1,
    }], participants: [], writeOperations: []}),
    {errorCode: 'TRANSACTION_RECOVERY_INCOMPLETE',
      decisionDimension: 'transaction_epoch'});
  }
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const engine = new SQLQueryEngine({controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    transactionEpochSource: () => Number.MAX_SAFE_INTEGER});
  t.after(() => engine.shutdown());
  const begun = await engine.executeQuery('BEGIN', [],
    {sessionId: 'max-safe-epoch'});
  assert.equal(begun.success, true);
  assert.equal(gateway.rows('sql_transactions')[0].transaction_epoch,
    Number.MAX_SAFE_INTEGER);
  const recovery = new DistributedTransactionCoordinator({logger});
  assert.doesNotThrow(() => recovery.recoverFromSystemTables({transactions: [{
    transaction_id: 'd'.repeat(32), session_id: 'max-safe-recovery',
    transaction_epoch: Number.MAX_SAFE_INTEGER, status: 'ACTIVE',
    timeout_deadline: 10, transaction_mode: 'EXPLICIT',
    participant_set_state: 'OPEN', participant_set_text: '[]',
    commit_mode: 'NOT_SELECTED', frozen_participant_count: 0,
    created_at: 1, updated_at: 1,
  }], participants: [], writeOperations: []}));
});
