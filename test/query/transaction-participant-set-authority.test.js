import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';

const logger = {debug() {}, warn() {}, error() {}};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
};

function durableRow(id, decision = 'COMMIT') {
  const record = buildTransactionDecisionRecord({transactionId: id,
    participants: new Map([['p1', {partitionId: 'p1', preparedDigest: 'prepared-p1'}]])},
  decision);
  return {transaction_id: id, session_id: 'recover', transaction_epoch: 7,
    timeout_deadline: Date.now() + 60000, status: 'COMMITTING', transaction_mode: 'EXPLICIT',
    participant_set_state: 'FROZEN', participant_set_text: JSON.stringify([[`${id}:p1`, 'p1']]),
    commit_mode: 'TWO_PHASE_COMMIT', frozen_participant_count: 1,
    decision: record.decision, decision_text: record.decisionText,
    decision_digest: record.decisionDigest, created_at: 1, updated_at: 1};
}

function discover(coordinator, row, status = 'ACTIVE') {
  coordinator.recoverFromSystemTables({transactions: [{...row, status,
    participant_set_state: 'OPEN', participant_set_text: null,
    commit_mode: 'NOT_SELECTED', frozen_participant_count: 0,
    decision: null, decision_text: null, decision_digest: null}], participants: []});
}

test('R2 set authority: every possible participant is durable before BEGIN',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    const begun = await coordinator.begin('set');
    assert.equal(begun.success, true);
    assert.equal(gateway.rows('sql_transactions')[0].participant_set_text, '[]',
      'only a newly inserted transaction owns a known empty set');
    const beginCalls = [];
    coordinator.beginParticipant = async (_session, partition, identity) => {
      const row = gateway.rows('sql_transactions')[0];
      assert.deepEqual(JSON.parse(row.participant_set_text), [
        [`${begun.transactionId}:p1`, 'p1'], [`${begun.transactionId}:p2`, 'p2']]);
      assert.equal(identity.transactionId, begun.transactionId);
      beginCalls.push(partition);
    };
    assert.equal((await coordinator.enlistParticipants('set', ['p2', 'p1'])).success, true);
    assert.deepEqual(beginCalls.sort(), ['p1', 'p2']);
  });

test('R2 set authority: interrupted enlist retains the participant whose BEGIN failed',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    const begun = await coordinator.begin('partial');
    coordinator.beginParticipant = async () => {
      throw new Error('lost BEGIN answer');
    };
    await assert.rejects(coordinator.enlistParticipants('partial', ['p1']),
      /lost BEGIN answer/u);
    assert.equal(gateway.rows('sql_transactions')[0].participant_set_text,
      JSON.stringify([[`${begun.transactionId}:p1`, 'p1']]),
      'the admitted obligation survives without a participant progress row');
  });

test('R2 authority: every stale status redrives the exact decision with missing progress rows',
  async (t) => {
    for (const decision of ['COMMIT', 'ROLLBACK']) {
      for (const status of ['ACTIVE', 'PREPARING', 'PREPARED', 'COMMITTING',
        'ROLLING_BACK', 'FAILED', 'COMMITTED', 'ROLLED_BACK']) {
        const gateway = createTransactionPersistenceGateway();
        t.after(() => gateway.db.close());
        const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
        await engine.waitForDistributedTransactionRecoveryReplay();
        const row = durableRow('c'.repeat(32), decision);
        gateway.seed('sql_transactions', row);
        const coordinator = engine.transactionCoordinator;
        const current = await coordinator.begin('recover');
        const calls = [];
        coordinator.commitParticipant = coordinator.rollbackParticipant =
          async (_session, partition, request) => calls.push({partition, ...request});
        discover(coordinator, row, status);
        assert.equal((await coordinator.resumeRecoveredTransactions()).resumed, 1,
          `${status} cannot suppress ${decision}, even before the deadline`);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].transactionId, row.transaction_id);
        assert.equal(calls[0].decision, decision);
        assert.equal(calls[0].preparedDigest, 'prepared-p1');
        assert.equal(coordinator.getTransaction('recover').transactionId, current.transactionId);
        assert.equal(coordinator.recoveredTransactionIds.has(row.transaction_id), false);
      }
    }
  });

test('R2 authority: missing, unavailable and malformed rows retain debt until a fresh sweep',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    await engine.waitForDistributedTransactionRecoveryReplay();
    const coordinator = engine.transactionCoordinator;
    const row = durableRow('d'.repeat(32));
    const calls = [];
    coordinator.commitParticipant = async (_session, _partition, request) => calls.push(request);
    discover(coordinator, row, 'FAILED');
    const read = gateway.readAuthoritativeRows;
    for (const state of ['missing', 'unavailable', 'invalid']) {
      if (state === 'unavailable') gateway.readAuthoritativeRows = async () => ({success: false});
      if (state === 'invalid') {
        gateway.readAuthoritativeRows = read;
        gateway.seed('sql_transactions', {...row, participant_set_text: '[]'});
      }
      const result = await coordinator.resumeRecoveredTransactions();
      assert.equal(result.resumed, 0);
      assert.equal(result.results[0].decisionReadState, state);
      assert.equal(coordinator.recoveredTransactionIds.has(row.transaction_id), true);
      assert.equal(calls.length, 0);
    }
    gateway.seed('sql_transactions', row);
    coordinator.loadRecoveryStateForSweep = async () => {
      throw new Error('cache census unavailable');
    };
    assert.equal((await coordinator.runRecoverySweep()).resolved, 1,
      'a failed discovery census cannot starve retained authoritative retry');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].decisionText, row.decision_text);
  });

test('R2 authority: recovery waits for an undecided OPEN deadline, then freezes its complete set',
  async (t) => {
    let now = 100;
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    await engine.waitForDistributedTransactionRecoveryReplay();
    const row = {...durableRow('e'.repeat(32)), status: 'ACTIVE', timeout_deadline: 200,
      participant_set_state: 'OPEN', commit_mode: 'NOT_SELECTED', frozen_participant_count: 0,
      decision: null, decision_text: null, decision_digest: null};
    gateway.seed('sql_transactions', row);
    const coordinator = engine.transactionCoordinator;
    coordinator.now = () => now;
    const calls = [];
    coordinator.rollbackParticipant = async (_session, partition, request) =>
      calls.push({partition, ...request});
    discover(coordinator, row);
    assert.equal((await coordinator.resumeRecoveredTransactions()).resumed, 0);
    assert.equal(gateway.rows('sql_transactions')[0].participant_set_state, 'OPEN');
    now = 201;
    assert.equal((await coordinator.runRecoverySweep()).resolved, 1);
    const final = gateway.rows('sql_transactions')[0];
    assert.equal(final.participant_set_state, 'FROZEN');
    assert.equal(final.frozen_participant_count, 1);
    assert.equal(final.decision, 'ROLLBACK');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].decisionText, final.decision_text);
    assert.equal(calls[0].preparedDigest, null, 'missing evidence is never a fresh COMMIT');
  });

test('R2 CAS: recovery freezes before an admitted-set addition reaches the row', async (t) => {
  const entered = deferred();
  const release = deferred();
  let held = false;
  const gateway = createTransactionPersistenceGateway({beforeMutation: async (mutation) => {
    if (!held && mutation.data?.participant_set_state === 'OPEN' &&
        mutation.data.participant_set_text !== '[]') {
      held = true;
      entered.resolve();
      await release.promise;
    }
  }});
  t.after(() => gateway.db.close());
  const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
  const first = engine.transactionCoordinator;
  const begun = await first.begin('recover', {timeoutDeadline: 1});
  let begins = 0;
  first.beginParticipant = async () => begins += 1;
  const addition = first.enlistParticipants('recover', ['p1']);
  await entered.promise;
  const restart = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
  await restart.waitForDistributedTransactionRecoveryReplay();
  const recovery = restart.transactionCoordinator;
  discover(recovery, gateway.rows('sql_transactions')[0]);
  assert.equal((await recovery.resumeRecoveredTransactions()).resumed, 1);
  release.resolve();
  await assert.rejects(addition, /incomplete|incompatible/u);
  assert.equal(begins, 0, 'the losing admission reaches no participant');
  const row = gateway.rows('sql_transactions')[0];
  assert.equal(row.transaction_id, begun.transactionId);
  assert.equal(row.participant_set_text, '[]');
  assert.equal(row.decision, 'ROLLBACK');
  assert.equal(first.recoveredTransactionIds.has(begun.transactionId), true,
    'the losing live owner re-enters from exact authority');
});

test('R2 CAS: lost admission and freeze answers resolve only through exact owner readback',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const submit = gateway.submitMutation;
    const lost = [];
    gateway.submitMutation = async (mutation, options) => {
      const answer = await submit(mutation, options);
      const phase = mutation.data?.participant_set_state;
      if (phase && !lost.includes(phase)) {
        lost.push(phase);
        throw new Error('answer lost after committed set CAS');
      }
      return answer;
    };
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    await coordinator.begin('lost');
    let begins = 0;
    const rollbacks = [];
    coordinator.beginParticipant = async () => begins += 1;
    coordinator.rollbackParticipant = async (_session, _partition, request) => rollbacks.push(request);
    assert.equal((await coordinator.enlistParticipants('lost', ['p1'])).success, true);
    assert.equal((await coordinator.rollback('lost')).success, true);
    assert.deepEqual(lost, ['OPEN', 'FROZEN']);
    assert.equal(begins, 1);
    assert.equal(rollbacks.length, 1);
    assert.equal(gateway.rows('sql_transactions')[0].decision, 'ROLLBACK');
  });

test('R2 CAS: an exact competing immutable decision wins; late generic progress cannot reopen',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const submit = gateway.submitMutation;
    let winner = null;
    gateway.submitMutation = async (mutation, options) => {
      if (!winner && mutation.data?.decision === 'COMMIT') {
        const commit = JSON.parse(mutation.data.decision_text);
        winner = buildTransactionDecisionRecord({transactionId: commit.transactionId,
          participants: new Map([['p1', {partitionId: 'p1', preparedDigest: 'prepared-p1'}]])},
        'ROLLBACK');
        assert.equal((await submit({...mutation, data: {decision: winner.decision,
          decision_text: winner.decisionText, decision_digest: winner.decisionDigest}}, options))
          .affectedRows, 1);
      }
      return submit(mutation, options);
    };
    const engine = new SQLQueryEngine({logger, controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    const begun = await coordinator.begin('winner');
    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async () =>
      ({preparedDigest: 'prepared-p1', prepareIndex: 3, prepareTerm: 1});
    const decisions = [];
    coordinator.commitParticipant = coordinator.rollbackParticipant =
      async (_session, _partition, request) => decisions.push(request);
    await coordinator.enlistParticipants('winner', ['p1']);
    await coordinator.commit('winner');
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decisionText, winner.decisionText);
    assert.equal(decisions[0].decision, 'ROLLBACK');
    const before = gateway.rows('sql_transactions')[0];
    await engine.persistDistributedTransactionRow({transactionId: begun.transactionId,
      sessionId: 'wrong', transactionEpoch: 0, status: 'ACTIVE', updatedAt: 999,
      participantSetState: 'OPEN', participantSetText: '[]',
      commitMode: 'NOT_SELECTED', frozenParticipantCount: 0});
    const after = gateway.rows('sql_transactions')[0];
    for (const field of ['session_id', 'transaction_epoch', 'participant_set_state',
      'participant_set_text', 'commit_mode', 'frozen_participant_count', 'decision',
      'decision_text', 'decision_digest']) assert.equal(after[field], before[field], field);
  });
