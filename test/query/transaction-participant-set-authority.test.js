import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';
import {buildTransactionDecisionRecord} from
  '../../src/query/distributed/distributed-transaction-decision.js';
import {
  isSweepEligibleTransactionRow,
} from '../../src/query/distributed/distributed-transaction-recovery.js';
import {
  isFullyTerminalTransactionRow,
} from '../../src/query/distributed/distributed-transaction-recovery-authority.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
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
        const engine = new SQLQueryEngine({
          controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
          logger, controlPlaneSystemTableGateway: gateway});
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
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
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger, controlPlaneSystemTableGateway: gateway});
  const first = engine.transactionCoordinator;
  const begun = await first.begin('recover', {timeoutDeadline: 1});
  let begins = 0;
  first.beginParticipant = async () => begins += 1;
  const addition = first.enlistParticipants('recover', ['p1']);
  await entered.promise;
  const restart = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger, controlPlaneSystemTableGateway: gateway});
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
    const coordinator = engine.transactionCoordinator;
    await coordinator.begin('lost');
    let begins = 0;
    const rollbacks = [];
    coordinator.beginParticipant = async () => begins += 1;
    coordinator.rollbackParticipant = async (_session, _partition, request) =>
      rollbacks.push(request);
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
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger, controlPlaneSystemTableGateway: gateway});
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

test('R2 sweep discovery: live undecided waits for deadline while decided rows sweep immediately',
  async (t) => {
    const now = 1000;
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const liveUndecided = {
      ...durableRow('1'.repeat(32)),
      status: 'ACTIVE',
      timeout_deadline: now + 60000,
      participant_set_state: 'OPEN',
      commit_mode: 'NOT_SELECTED',
      frozen_participant_count: 0,
      decision: null,
      decision_text: null,
      decision_digest: null,
    };
    const decidedCommit = {
      ...durableRow('2'.repeat(32), 'COMMIT'),
      status: 'COMMITTING',
      timeout_deadline: now + 60000,
    };
    const decidedRollback = {
      ...durableRow('3'.repeat(32), 'ROLLBACK'),
      status: 'COMMITTING',
      timeout_deadline: now + 60000,
    };
    const terminalCommit = {
      ...durableRow('4'.repeat(32), 'COMMIT'),
      status: 'COMMITTED',
      timeout_deadline: now - 10,
    };
    const terminalRollback = {
      ...durableRow('5'.repeat(32), 'ROLLBACK'),
      status: 'ROLLED_BACK',
      timeout_deadline: now - 10,
    };
    const terminalCommitParticipant = {
      participant_id: `${terminalCommit.transaction_id}:p1`,
      transaction_id: terminalCommit.transaction_id,
      partition_id: 'p1',
      status: 'COMMITTED',
      created_at: 1,
      updated_at: 1,
    };
    const terminalRollbackParticipant = {
      participant_id: `${terminalRollback.transaction_id}:p1`,
      transaction_id: terminalRollback.transaction_id,
      partition_id: 'p1',
      status: 'ROLLED_BACK',
      created_at: 1,
      updated_at: 1,
    };
    for (const row of [
      liveUndecided,
      decidedCommit,
      decidedRollback,
      terminalCommit,
      terminalRollback,
    ]) {
      gateway.seed('sql_transactions', row);
    }
    gateway.seed('sql_transaction_participants', terminalCommitParticipant);
    gateway.seed('sql_transaction_participants', terminalRollbackParticipant);

    assert.equal(
      isFullyTerminalTransactionRow(terminalCommit, [terminalCommitParticipant]),
      true,
    );
    assert.equal(
      isFullyTerminalTransactionRow(terminalRollback, [terminalRollbackParticipant]),
      true,
    );
    assert.equal(isFullyTerminalTransactionRow(terminalCommit, []), false);
    assert.equal(isFullyTerminalTransactionRow(decidedCommit, []), false);
    assert.equal(isSweepEligibleTransactionRow(liveUndecided, now, []), false);
    assert.equal(isSweepEligibleTransactionRow(decidedCommit, now, []), true);
    assert.equal(isSweepEligibleTransactionRow(decidedRollback, now, []), true);
    assert.equal(isSweepEligibleTransactionRow(terminalCommit, now, []), true);
    assert.equal(
      isSweepEligibleTransactionRow(terminalCommit, now, [terminalCommitParticipant]),
      false,
    );
    assert.equal(
      isSweepEligibleTransactionRow(terminalRollback, now, [terminalRollbackParticipant]),
      false,
    );

    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      logger,
      controlPlaneSystemTableGateway: gateway,
    });
    await engine.waitForDistributedTransactionRecoveryReplay();
    engine.systemCache = {
      getAll: (tableName) => gateway.rows(tableName),
    };
    const coordinator = engine.transactionCoordinator;
    coordinator.now = () => now;
    coordinator.loadRecoveryStateForSweep = () =>
      engine.loadDistributedTransactionRecoveryState();

    const discovery = engine.loadDistributedTransactionRecoveryState();
    assert.deepEqual(
      discovery.transactions.map((row) => row.transaction_id).sort(),
      [decidedCommit.transaction_id, decidedRollback.transaction_id],
      'only decided non-terminal rows are sweep-eligible before timeout_deadline',
    );

    const calls = [];
    coordinator.commitParticipant = async (_session, partition, request) =>
      calls.push({op: 'COMMIT', partition, ...request});
    coordinator.rollbackParticipant = async (_session, partition, request) =>
      calls.push({op: 'ROLLBACK', partition, ...request});

    const sweep = await coordinator.runRecoverySweep();
    assert.equal(sweep.swept, 2);
    assert.equal(sweep.resolved, 2);
    assert.equal(calls.length, 2);
    const byTx = new Map(
      gateway.rows('sql_transactions').map((row) => [row.transaction_id, row]),
    );
    assert.equal(byTx.get(liveUndecided.transaction_id).status, 'ACTIVE');
    assert.equal(byTx.get(liveUndecided.transaction_id).participant_set_state, 'OPEN');
    assert.equal(byTx.get(decidedCommit.transaction_id).status, 'COMMITTED');
    assert.equal(byTx.get(decidedRollback.transaction_id).status, 'ROLLED_BACK');
    assert.deepEqual(
      engine.loadDistributedTransactionRecoveryState().transactions,
      [],
      'once decided rows reach terminal status, sweep discovery is empty until live deadline',
    );
  });

test('restart cache recovery filters already-terminal rows and authoritative recovery never downgrades terminal status',
  async (t) => {
    const now = 5000;
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const commitRow = {
      ...durableRow('6'.repeat(32), 'COMMIT'),
      status: 'COMMITTED',
      timeout_deadline: now - 10,
    };
    const rollbackRow = {
      ...durableRow('7'.repeat(32), 'ROLLBACK'),
      status: 'ROLLED_BACK',
      timeout_deadline: now - 10,
    };
    gateway.seed('sql_transactions', commitRow);
    gateway.seed('sql_transactions', rollbackRow);
    gateway.seed('sql_transaction_participants', {
      participant_id: `${commitRow.transaction_id}:p1`,
      transaction_id: commitRow.transaction_id,
      partition_id: 'p1',
      status: 'COMMITTED',
      created_at: 1,
      updated_at: 1,
    });
    gateway.seed('sql_transaction_participants', {
      participant_id: `${rollbackRow.transaction_id}:p1`,
      transaction_id: rollbackRow.transaction_id,
      partition_id: 'p1',
      status: 'ROLLED_BACK',
      created_at: 1,
      updated_at: 1,
    });

    const cacheTables = new Set([
      'sql_transactions',
      'sql_transaction_participants',
      'sql_write_operations',
    ]);
    const cache = {
      getAll: (tableName) => cacheTables.has(tableName) ? gateway.rows(tableName) : [],
      find: () => [],
    };
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      systemCache: cache,
      logger,
      now: () => now,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());

    // 1. Cache recovery filters by isSweepEligibleTransactionRow: terminal rows are never enrolled.
    engine.recoverDistributedTransactionStateFromCache();
    assert.equal(engine.transactionStateRecovered, true);
    assert.equal(engine.transactionCoordinator.recoveredTransactionIds.size, 0,
      'already-terminal rows in cache must never be enrolled as active recovery obligations');

    // 2. Direct recoverFromSystemTables also skips fully terminal rows when all participants match.
    engine.transactionCoordinator.recoverFromSystemTables({
      transactions: [commitRow, rollbackRow],
      participants: gateway.rows('sql_transaction_participants'),
      writeOperations: [],
    });
    assert.equal(engine.transactionCoordinator.recoveredTransactionIds.size, 0,
      'fully terminal rows with all participants terminal must not be enrolled');

    // 3. Even if an already-terminal obligation was discovered before participants became terminal,
    // authoritative recovery preserves terminal status and never downgrades to COMMITTING/ROLLING_BACK.
    const persistedStatuses = [];
    const originalPersist = engine.transactionCoordinator.persistTransaction;
    engine.transactionCoordinator.persistTransaction = async (record) => {
      persistedStatuses.push(`${record.transactionId}:${record.status}`);
      return originalPersist(record);
    };
    const rpcCalls = [];
    engine.transactionCoordinator.commitParticipant = async (_s, p) => rpcCalls.push(`COMMIT:${p}`);
    engine.transactionCoordinator.rollbackParticipant = async (_s, p) => rpcCalls.push(`ROLLBACK:${p}`);

    discover(engine.transactionCoordinator, commitRow, 'ACTIVE');
    discover(engine.transactionCoordinator, rollbackRow, 'ACTIVE');
    const replay = await engine.transactionCoordinator.resumeRecoveredTransactions();
    assert.equal(replay.resumed, 2);
    assert.deepEqual(persistedStatuses, [],
      'terminal durable rows must never be downgraded to COMMITTING/ROLLING_BACK or rewritten');
    assert.deepEqual(rpcCalls, [],
      'already-terminal participants must not receive redundant commit/rollback RPCs');
    const byTx = new Map(
      gateway.rows('sql_transactions').map((row) => [row.transaction_id, row]),
    );
    assert.equal(byTx.get(commitRow.transaction_id).status, 'COMMITTED');
    assert.equal(byTx.get(rollbackRow.transaction_id).status, 'ROLLED_BACK');
  });

test('abortTimedOutTransaction freezes and records ROLLBACK before status transitions to ROLLING_BACK',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const observedWrites = [];
    const baseSubmit = gateway.submitMutation;
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.tableName === 'sql_transactions') {
        observedWrites.push({
          type: mutation.type,
          status: mutation.data?.status ?? null,
          participantSetState: mutation.data?.participant_set_state ?? null,
          decision: mutation.data?.decision ?? null,
        });
      }
      return baseSubmit(mutation, options);
    };
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;
    coordinator.beginParticipant = async () => {};
    coordinator.rollbackParticipant = async () => ({
      success: true, durable: true, state: 'ROLLED_BACK', outcome: 'NOT_COMMITTED',
    });

    await coordinator.begin('timeout-session');
    await coordinator.enlistParticipants('timeout-session', ['p1']);
    const tx = coordinator.workflowCoordinator.getWorkflowByOwnerKey('timeout-session');
    observedWrites.length = 0;

    const aborted = await coordinator.abortTimedOutTransaction(tx, 'PREPARE');
    assert.equal(aborted.success, false);
    assert.equal(aborted.errorCode, 'TIMEOUT');
    const rollingBackIdx = observedWrites.findIndex((w) => w.status === 'ROLLING_BACK');
    const freezeIdx = observedWrites.findIndex((w) => w.participantSetState === 'FROZEN');
    const decisionIdx = observedWrites.findIndex((w) => w.decision === 'ROLLBACK');
    assert.ok(freezeIdx >= 0, 'abort must freeze participant_set_state');
    assert.ok(decisionIdx >= freezeIdx, 'abort must record ROLLBACK decision after freeze');
    assert.equal(
      rollingBackIdx !== -1 && rollingBackIdx < decisionIdx,
      false,
      'abort must never persist ROLLING_BACK while participant_set_state is OPEN and decision is null',
    );
    const finalRow = gateway.rows('sql_transactions')[0];
    assert.equal(finalRow.participant_set_state, 'FROZEN');
    assert.equal(finalRow.decision, 'ROLLBACK');
    assert.equal(finalRow.status, 'ROLLED_BACK');
  });

test('Optimization 5C: zero-participant COMMIT persists COMMITTED atomically with decision',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;
    const rollbacks = [];
    coordinator.beginParticipant = async () => {};
    coordinator.rollbackParticipant = async (_s, partitionId) => rollbacks.push(partitionId);

    const begun = await coordinator.begin('ro-atomic');
    assert.equal(begun.success, true);
    await coordinator.executeReadStatement(
      'ro-atomic',
      begun.transactionId,
      async ({enlist}) => enlist(['p-ro']),
    );
    const committed = await coordinator.commit('ro-atomic');
    assert.equal(committed.success, true);
    assert.deepEqual(rollbacks, ['p-ro']);

    const txMutations = gateway.mutations.filter((m) => m.tableName === 'sql_transactions');
    assert.equal(txMutations.length, 3,
      'zero-participant COMMIT performs INSERT + FREEZE + atomic DECIDE/COMMITTED (no 4th update)');
    assert.equal(txMutations[2].data.decision, 'COMMIT');
    assert.equal(txMutations[2].data.status, 'COMMITTED');
    const breakdown = coordinator.getLastTransactionBreakdown(begun.transactionId);
    assert.equal(breakdown.metadataSubmissionsByPurpose.decisionAndCommitting, 1);
    assert.equal(breakdown.metadataSubmissionsByPurpose.settlement, 0);
  });

test('Optimization 5C: executeWriteStatement overlaps participant ACTIVE upsert with executeWrite and COMMIT overlaps read-only release with COMMITTED status',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;

    const activePersistStarted = deferred();
    const releaseActivePersist = deferred();
    const baseSubmit = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.tableName === 'sql_transaction_participants' &&
          mutation.data?.status === undefined &&
          mutation.row?.status === 'ACTIVE') {
        activePersistStarted.resolve();
        await releaseActivePersist.promise;
      }
      return baseSubmit(mutation, options);
    };

    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => ({
      preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
      prepareIndex: 1,
      prepareTerm: 1,
    });
    coordinator.commitParticipant = async () => {};

    const roReleaseStarted = deferred();
    const releaseRoRollback = deferred();
    const roRollbacks = [];
    coordinator.rollbackParticipant = async (_s, partitionId) => {
      roRollbacks.push(partitionId);
      roReleaseStarted.resolve();
      await releaseRoRollback.promise;
    };

    const begun = await coordinator.begin('overlap-tx');
    await coordinator.executeReadStatement(
      'overlap-tx',
      begun.transactionId,
      async ({enlist}) => enlist(['p-ro']),
    );

    let sawActiveInFlightDuringWrite = false;
    let writeOutcomeBeforePersistReleased = 0;
    const writePromise = coordinator.executeWriteStatement(
      'overlap-tx',
      {operationId: 'op-overlap-1', sql: 'UPDATE t SET v = 1 WHERE id = 1', partitionIds: ['p-rw']},
      async () => {
        await activePersistStarted.promise;
        sawActiveInFlightDuringWrite = true;
        writeOutcomeBeforePersistReleased = gateway.rows('sql_write_operations').length;
        return {success: true, affectedRows: 1};
      },
    );
    await activePersistStarted.promise;
    releaseActivePersist.resolve();
    const written = await writePromise;
    assert.equal(written.success, true);
    assert.equal(sawActiveInFlightDuringWrite, true,
      'upsertParticipant(ACTIVE) must start concurrently with executeWrite');
    assert.equal(writeOutcomeBeforePersistReleased, 0,
      'sql_write_operations persistence waits until concurrent upsertParticipant(ACTIVE) and executeWrite settle');
    assert.equal(
      coordinator.getTransaction('overlap-tx').writeOperations[0].status,
      'SUCCEEDED',
    );

    // Mixed read+write COMMIT must persist status='COMMITTED' concurrently while p-ro rollback RPC is blocked.
    const commitPromise = coordinator.commit('overlap-tx');
    await roReleaseStarted.promise;
    assert.equal(gateway.rows('sql_write_operations')[0].status, 'SUCCEEDED');
    assert.equal(gateway.rows('sql_transactions')[0].status, 'COMMITTED',
      'COMMITTED status update must overlap with releaseReadOnlyParticipants without waiting for p-ro RPC');
    releaseRoRollback.resolve();
    const committed = await commitPromise;
    assert.equal(committed.success, true);
    assert.deepEqual(roRollbacks, ['p-ro']);
  });

test('Finding 1B: parallel ACTIVE persistence waits for all siblings before releasing session queue, CAS-guards upsertParticipant rollback against PREPARED state, and deduplicates overlapped read-only release on status persist failure',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;

    const p2ActiveStarted = deferred();
    const releaseP2Active = deferred();
    let failP1ActiveOnce = true;
    let blockP2ActiveOnce = true;
    let failCommittedStatusOnce = false;
    const baseSubmit = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.tableName === 'sql_transaction_participants' &&
          mutation.row?.status === 'ACTIVE') {
        if (mutation.row.partition_id === 'p1' && failP1ActiveOnce) {
          failP1ActiveOnce = false;
          throw new Error('p1 ACTIVE persistence failed');
        }
        if (mutation.row.partition_id === 'p2' && blockP2ActiveOnce) {
          blockP2ActiveOnce = false;
          p2ActiveStarted.resolve();
          await releaseP2Active.promise;
        }
      }
      if (failCommittedStatusOnce &&
          mutation.tableName === 'sql_transactions' &&
          mutation.data?.status === 'COMMITTED') {
        failCommittedStatusOnce = false;
        throw new Error('COMMITTED status persistence failed');
      }
      return baseSubmit(mutation, options);
    };

    const preparedPartitions = [];
    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => {
      preparedPartitions.push(partitionId);
      return {
        preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
        prepareIndex: 1,
        prepareTerm: 1,
      };
    };
    coordinator.commitParticipant = async () => {};

    const roReleaseStarted = deferred();
    const releaseRoRollback = deferred();
    const roRollbacks = [];
    coordinator.rollbackParticipant = async (_s, partitionId) => {
      roRollbacks.push(partitionId);
      roReleaseStarted.resolve();
      await releaseRoRollback.promise;
    };

    const begun = await coordinator.begin('f1b-tx');
    assert.equal(begun.success, true);
    await coordinator.executeReadStatement(
      'f1b-tx',
      begun.transactionId,
      async ({enlist}) => enlist(['p1', 'p2', 'p-ro']),
    );

    // 1. Write promotes p1 and p2 from readOnlyParticipants; p1 ACTIVE persist rejects immediately while p2 is delayed.
    let writeSettled = false;
    const writePromise = coordinator.executeWriteStatement(
      'f1b-tx',
      {
        operationId: 'op-f1b-1',
        sql: 'UPDATE t SET v = 1',
        partitionIds: ['p1', 'p2'],
      },
      async () => ({success: true, affectedRows: 2}),
    ).finally(() => {
      writeSettled = true;
    });

    await p2ActiveStarted.promise;
    let p2ActiveReleased = false;
    let queuedProbeRan = false;
    let commitStartedBeforeP2Settled = false;
    const queuedProbe = coordinator.runTransactionOperation('f1b-tx', async () => {
      commitStartedBeforeP2Settled = !p2ActiveReleased;
      queuedProbeRan = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      writeSettled,
      false,
      'executeWriteStatement must hold the session queue until delayed sibling p2 ACTIVE persistence settles',
    );
    assert.equal(
      queuedProbeRan,
      false,
      'next queued session operation must not start while p2 ACTIVE persistence is still in flight',
    );

    p2ActiveReleased = true;
    releaseP2Active.resolve();
    await assert.rejects(writePromise, /p1 ACTIVE persistence failed/u);
    await queuedProbe;
    assert.equal(queuedProbeRan, true);
    assert.equal(commitStartedBeforeP2Settled, false);

    // 2. Even if a delayed upsertParticipant(ACTIVE) rejects after a participant advanced to PREPARED,
    // upsertParticipant must not clobber PREPARED back to stale ACTIVE.
    const tx = coordinator.workflowCoordinator.getWorkflowByOwnerKey('f1b-tx');
    const staleActiveGate = deferred();
    const origPersistParticipant = coordinator.workflowCoordinator.persistParticipant;
    let interceptStaleP2 = true;
    coordinator.workflowCoordinator.persistParticipant = async (participant) => {
      if (interceptStaleP2 &&
          participant.partitionId === 'p2' &&
          participant.status === 'ACTIVE') {
        interceptStaleP2 = false;
        await staleActiveGate.promise;
        throw new Error('late stale ACTIVE persistence rejection');
      }
      return origPersistParticipant(participant);
    };
    const lateStaleActiveUpsert = coordinator.workflowCoordinator.upsertParticipant(
      tx.workflowId,
      {
        ...tx.participants.get('p2'),
        status: 'ACTIVE',
        lastError: null,
        updatedAt: coordinator.now(),
      },
    );

    // Advance p2 to PREPARED during commit, then reject the late stale ACTIVE upsert before decision recording:
    const origPrepare = coordinator.prepareParticipant;
    coordinator.prepareParticipant = async (s, partitionId, identity) => {
      const evidence = await origPrepare(s, partitionId, identity);
      if (partitionId === 'p2') {
        queueMicrotask(async () => {
          staleActiveGate.resolve();
        });
      }
      return evidence;
    };

    // 3. Also test overlapped read-only release when setTransactionStatus(COMMITTED) rejects:
    failCommittedStatusOnce = true;
    const failedStatusCommitPromise = coordinator.commit('f1b-tx');
    await assert.rejects(lateStaleActiveUpsert, /late stale ACTIVE persistence rejection/u);
    await roReleaseStarted.promise;
    // Allow in-flight p-ro rollback to complete after COMMITTED status update has already rejected:
    releaseRoRollback.resolve();
    await assert.rejects(failedStatusCommitPromise, /COMMITTED status persistence failed/u);
    assert.deepEqual(
      roRollbacks,
      ['p-ro'],
      'overlapped read-only release must settle before commitOwned catch and never duplicate p-ro rollback',
    );
    assert.equal(
      tx.participants.get('p2').status,
      'COMMITTED',
      'late stale ACTIVE rejection must not overwrite advanced participant state or cause TRANSACTION_RECOVERY_INCOMPLETE',
    );

    // Retrying commit completes cleanly to COMMITTED:
    const finalCommit = await coordinator.commit('f1b-tx');
    assert.equal(finalCommit.success, true);
    assert.deepEqual(roRollbacks, ['p-ro']);
  });

test('P2: concurrent PREPARE settles delayed sibling RPC and PREPARED write before releasing session queue to rollbackTransaction',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;

    const timeline = [];
    const p1PreparedFailed = deferred();
    const p2PrepareStarted = deferred();
    const releaseP2Prepare = deferred();
    const p2PreparedPersistStarted = deferred();
    const releaseP2PreparedPersist = deferred();
    let failP1PreparedOnce = true;
    let holdP2PreparedOnce = true;

    const baseSubmit = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.tableName === 'sql_transaction_participants' &&
          mutation.row?.status === 'PREPARED') {
        if (mutation.row.partition_id === 'p1' && failP1PreparedOnce) {
          failP1PreparedOnce = false;
          timeline.push('p1:persist_prepared:fail');
          p1PreparedFailed.resolve();
          throw new Error('p1 PREPARED metadata write failed');
        }
        if (mutation.row.partition_id === 'p2' && holdP2PreparedOnce) {
          holdP2PreparedOnce = false;
          timeline.push('p2:persist_prepared:start');
          p2PreparedPersistStarted.resolve();
          await releaseP2PreparedPersist.promise;
          timeline.push('p2:persist_prepared:done');
        }
      }
      return baseSubmit(mutation, options);
    };

    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => {
      timeline.push(`${partitionId}:prepare:start`);
      if (partitionId === 'p2') {
        p2PrepareStarted.resolve();
        await releaseP2Prepare.promise;
      }
      timeline.push(`${partitionId}:prepare:done`);
      return {
        preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
        prepareIndex: 1,
        prepareTerm: 1,
      };
    };
    coordinator.commitParticipant = async () => {};
    coordinator.rollbackParticipant = async (_s, partitionId) => {
      timeline.push(`rollback:${partitionId}`);
      return {
        success: true,
        durable: true,
        state: 'ROLLED_BACK',
        outcome: 'NOT_COMMITTED',
      };
    };

    const begun = await coordinator.begin('p2-prepare-settle');
    assert.equal(begun.success, true);
    assert.equal(
      (await coordinator.enlistParticipants('p2-prepare-settle', ['p1', 'p2'])).success,
      true,
    );

    let commitSettled = false;
    const commitPromise = coordinator.commit('p2-prepare-settle').finally(() => {
      commitSettled = true;
      timeline.push('commit:settled');
    });

    await Promise.all([p1PreparedFailed.promise, p2PrepareStarted.promise]);
    const rollbackPromise = coordinator.rollbackTransaction('p2-prepare-settle');

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      commitSettled,
      false,
      'commit must wait for delayed sibling p2 prepare RPC after p1 PREPARED write fails',
    );
    assert.equal(
      timeline.some((entry) => entry.startsWith('rollback:')),
      false,
      'queued rollbackTransaction must not begin while sibling p2 prepare RPC is still in flight',
    );

    releaseP2Prepare.resolve();
    await p2PreparedPersistStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      commitSettled,
      false,
      'commit must wait for delayed sibling p2 PREPARED metadata write before releasing session queue',
    );
    assert.equal(
      timeline.some((entry) => entry.startsWith('rollback:')),
      false,
      'queued rollbackTransaction must not begin while sibling p2 PREPARED write is in flight',
    );

    releaseP2PreparedPersist.resolve();
    await assert.rejects(commitPromise, /p1 PREPARED metadata write failed/u);
    const rollbackResult = await rollbackPromise;
    assert.equal(rollbackResult.success, true);

    const p1FailIdx = timeline.indexOf('p1:persist_prepared:fail');
    const p2PrepareDoneIdx = timeline.indexOf('p2:prepare:done');
    const p2PersistDoneIdx = timeline.indexOf('p2:persist_prepared:done');
    const commitSettledIdx = timeline.indexOf('commit:settled');
    const firstRollbackIdx = timeline.findIndex((entry) => entry.startsWith('rollback:'));

    assert.ok(p1FailIdx >= 0);
    assert.ok(p2PrepareDoneIdx > p1FailIdx);
    assert.ok(p2PersistDoneIdx > p2PrepareDoneIdx);
    assert.ok(commitSettledIdx > p2PersistDoneIdx);
    assert.ok(firstRollbackIdx > commitSettledIdx,
      `expected zero timeline overlap before rollback, got: ${JSON.stringify(timeline)}`);
    assert.deepEqual(
      timeline.slice(firstRollbackIdx).sort(),
      ['rollback:p1', 'rollback:p2'],
    );
    assert.equal(gateway.rows('sql_transactions')[0].status, 'ROLLED_BACK');
  });

test('P2: concurrent COMMIT settles delayed sibling before throwing and reverts failed COMMITTED participant status for retry',
  async (t) => {
    const gateway = createTransactionPersistenceGateway();
    t.after(() => gateway.db.close());
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: gateway,
      logger,
      autoStartDistributedTransactionRecovery: false,
    });
    t.after(() => engine.shutdown());
    const coordinator = engine.transactionCoordinator;

    const timeline = [];
    const p1CommittedFailed = deferred();
    const p2CommitStarted = deferred();
    const releaseP2Commit = deferred();
    let failP1CommittedOnce = true;

    const baseSubmit = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation, options) => {
      if (mutation.tableName === 'sql_transaction_participants' &&
          mutation.row?.status === 'COMMITTED' &&
          mutation.row.partition_id === 'p1' &&
          failP1CommittedOnce) {
        failP1CommittedOnce = false;
        timeline.push('p1:persist_committed:fail');
        p1CommittedFailed.resolve();
        throw new Error('p1 COMMITTED metadata write failed');
      }
      return baseSubmit(mutation, options);
    };

    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => ({
      preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
      prepareIndex: 1,
      prepareTerm: 1,
    });
    coordinator.commitParticipant = async (_s, partitionId) => {
      timeline.push(`${partitionId}:commit:start`);
      if (partitionId === 'p2') {
        p2CommitStarted.resolve();
        await releaseP2Commit.promise;
      }
      timeline.push(`${partitionId}:commit:done`);
    };

    const begun = await coordinator.begin('p2-commit-settle');
    assert.equal(begun.success, true);
    assert.equal(
      (await coordinator.enlistParticipants('p2-commit-settle', ['p1', 'p2'])).success,
      true,
    );

    const firstCommitPromise = coordinator.commit('p2-commit-settle');
    await Promise.all([p1CommittedFailed.promise, p2CommitStarted.promise]);

    let retryStartedBeforeP2Settled = false;
    let p2CommitReleased = false;
    const tx = coordinator.workflowCoordinator.getWorkflowByOwnerKey('p2-commit-settle');
    const origCommit = coordinator.commitParticipant;
    coordinator.commitParticipant = async (sessionId, partitionId, req) => {
      if (!p2CommitReleased) {
        retryStartedBeforeP2Settled = true;
      }
      return origCommit(sessionId, partitionId, req);
    };
    const retryCommitPromise = coordinator.commit('p2-commit-settle');

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(retryStartedBeforeP2Settled, false);

    p2CommitReleased = true;
    releaseP2Commit.resolve();
    await assert.rejects(firstCommitPromise, /p1 COMMITTED metadata write failed/u);
    const retryResult = await retryCommitPromise;
    assert.equal(retryResult.success, true);
    assert.equal(retryStartedBeforeP2Settled, false);
    assert.equal(
      timeline.filter((entry) => entry === 'p1:commit:start').length,
      2,
      'p1 whose COMMITTED persistence failed must revert to COMMITTING and re-drive COMMITTED on retry',
    );
    assert.equal(
      timeline.filter((entry) => entry === 'p2:commit:start').length,
      1,
      'p2 whose COMMITTED persistence succeeded must not be re-driven on retry',
    );
    assert.equal(tx.participants.get('p1').status, 'COMMITTED');
    assert.equal(gateway.rows('sql_transactions')[0].status, 'COMMITTED');
    assert.equal(
      gateway.rows('sql_transaction_participants').every((row) => row.status === 'COMMITTED'),
      true,
    );
  });
