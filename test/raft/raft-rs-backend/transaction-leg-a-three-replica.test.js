/**
 * TX1 A1-A5 (quest replicated-transaction-decision-and-apply; design
 * revision 10, section 10.2 "The real three-replica witnesses", receipts 2,
 * 3 and 4): a partition transaction on a real three-replica rs-raft group,
 * driven end to end by the real SQLQueryEngine and its
 * DistributedTransactionCoordinator over the group's own transport - BEGIN,
 * session statements, PREPARE (a committed PARTICIPANT_PREPARE), the
 * coordinator's insert-once decision, and the bound PARTICIPANT_DECISION -
 * under leader change, replica restart, replayed decisions and coordinator
 * crashes.
 *
 * Fixture: test/test-helpers/transaction-coordinator-group-fixture.js. A
 * hold stops the coordinator at a named persistence write: released, the
 * coordinator continues; never released, that coordinator process stopped
 * there, and a new coordinator over the same durable rows recovers it.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {readCdcObligation} from
  '../../../src/partition/partition-cdc-obligation-ledger.js';
import {TABLES} from '../../../src/constants/index.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from
  '../../../src/constants/transactions.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../../src/partition/partition-service-constants.js';
import {TRANSACTION_STATUS} from
  '../../../src/query/distributed/distributed-transaction-coordinator.js';
import {QUERY_OPERATION} from '../../../src/query/query-constants.js';
import {
  createPersistenceHold,
  isDecisionWrite,
  participantWriteOf,
  statusWriteOf,
  withTransactionGroup,
} from '../../test-helpers/transaction-coordinator-group-fixture.js';

const TEST_TIMEOUT_MS = 240000;
const HOLD_WAIT_MS = 30000;
// Past the coordinator's 60 s transaction budget (TIMEOUT_BUDGET_DEFAULT).
const PAST_BUDGET_MS = 120000;
const PREPARED = 'PREPARED';
const COMMITTED = 'COMMITTED';
const ROLLED_BACK = 'ROLLED_BACK';

function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  })]).finally(() => clearTimeout(timer));
}

function track(promise) {
  const tracked = {settled: false, value: null};
  promise.then((value) => {
    tracked.settled = true;
    tracked.value = value;
  }, (error) => {
    tracked.settled = true;
    tracked.value = {thrown: error?.message ?? String(error)};
  });
  return tracked;
}

async function stage(engine, ctx, sessionId, rows) {
  const begun = await engine.executeQuery('BEGIN', [], {sessionId});
  assert.equal(begun.success, true, `real BEGIN refused: ${JSON.stringify(begun)}`);
  const staged = [];
  for (const [id, value] of rows) {
    staged.push((await engine.executeQuery(
      `INSERT INTO ${ctx.table} (id, value) VALUES (?, ?)`, [id, value],
      {sessionId})).success === true);
  }
  return {begun, staged, transactionId: begun.transactionId,
    participantId: `${begun.transactionId}:${ctx.partitionId}`};
}

// The transaction's row on each replica, and which of `ids` each holds.
function replicaViewOf(ctx, transactionId, ids) {
  return ctx.replicaStates().map((state) => {
    const row = state.participants.find((entry) =>
      entry.transaction_id === transactionId) ?? null;
    return {
      state: row?.state ?? null,
      participantId: row?.participant_id ?? null,
      preparedDigest: row?.prepared_digest ?? null,
      prepareIndex: row?.prepare_index ?? null,
      prepareTerm: row?.prepare_term ?? null,
      decisionDigest: row?.decision_digest ?? null,
      rows: state.rows.filter((entry) => ids.includes(entry.id))
        .map((entry) => entry.id),
    };
  });
}

function storeRowOf(ctx, transactionId) {
  const row = ctx.store.prepare(`SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
    'WHERE transaction_id = ?').get(transactionId);
  return row ? {status: row.status, decision: row.decision ?? null,
    decisionText: row.decision_text ?? null,
    decisionDigest: row.decision_digest ?? null} : null;
}

function storeParticipantOf(ctx, participantId) {
  const row = ctx.store.prepare('SELECT * FROM ' +
    `${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE participant_id = ?`)
    .get(participantId);
  return row ? {status: row.status,
    preparedDigest: row.prepared_digest ?? null,
    prepareIndex: row.prepare_index ?? null,
    prepareTerm: row.prepare_term ?? null} : null;
}

function distinct(values) {
  return new Set(values).size;
}

async function outcomesOf(ctx, identity) {
  const outcomes = [];
  for (const service of ctx.services()) {
    outcomes.push((await service.handleApplicationMessage({
      type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
      operation: PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME,
      ...identity,
    }))?.outcome ?? null);
  }
  return outcomes;
}

function identityOf(staged, sessionId) {
  return {sessionId, transactionId: staged.transactionId,
    participantId: staged.participantId,
    commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    transactionEpoch: staged.begun.transactionEpoch};
}

// A follower's position (not the current leader).
function followerIndexOf(ctx) {
  const leader = ctx.leader();
  return ctx.services().findIndex((service) => service !== leader);
}

test('TX1 A1: a PREPARE on a three-replica rs-raft group is PREPARED with ' +
  'the same identity and digest on every replica', {timeout: TEST_TIMEOUT_MS},
async () => {
  const facts = await withTransactionGroup('tx1-a1', async (ctx) => {
    // The coordinator is held at its decision record: every PREPARE answered.
    const hold = createPersistenceHold(isDecisionWrite);
    const engine = ctx.createCoordinator({hold});
    const staged = await stage(engine, ctx, 'a1', [['a1-1', 'one'],
      ['a1-2', 'two']]);
    track(engine.executeQuery('COMMIT', [], {sessionId: 'a1'}));
    const decisionHeld = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
    await ctx.settle();
    const replicas = replicaViewOf(ctx, staged.transactionId, ['a1-1', 'a1-2']);
    const retained = storeParticipantOf(ctx, staged.participantId);
    return {
      staged: staged.staged,
      decisionHeld,
      states: replicas.map((replica) => replica.state),
      participantIds: replicas.map((replica) => replica.participantId ===
        staged.participantId),
      distinctDigests: distinct(replicas.map((replica) =>
        replica.preparedDigest)),
      distinctPreparePositions: distinct(replicas.map((replica) =>
        `${replica.prepareIndex}/${replica.prepareTerm}`)),
      retainedBeforeDecision: retained !== null &&
        retained.status === PREPARED &&
        retained.preparedDigest === replicas[0].preparedDigest &&
        retained.prepareIndex === replicas[0].prepareIndex &&
        retained.prepareTerm === replicas[0].prepareTerm,
      decisionRecorded: storeRowOf(ctx, staged.transactionId)?.decision ??
        null,
      visibleRows: replicas.map((replica) => replica.rows.length),
    };
  });
  assert.deepEqual(facts, {
    staged: [true, true],
    decisionHeld: true,
    states: [PREPARED, PREPARED, PREPARED],
    participantIds: [true, true, true],
    distinctDigests: 1,
    distinctPreparePositions: 1,
    retainedBeforeDecision: true,
    decisionRecorded: null,
    visibleRows: [0, 0, 0],
  }, 'one committed PARTICIPANT_PREPARE: PREPARED with the same identity, ' +
    'digest and log position on every replica, retained by the coordinator ' +
    'before its decision, and no staged row visible before consensus');
});

test('TX1 A2: after a leader change following PREPARE the new leader ' +
  'applies the COMMIT and the rows appear exactly once on every replica',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const facts = await withTransactionGroup('tx1-a2', async (ctx) => {
    const hold = createPersistenceHold(
      statusWriteOf(TRANSACTION_STATUS.PREPARED));
    const engine = ctx.createCoordinator({hold});
    const staged = await stage(engine, ctx, 'a2', [['a2-1', 'one'],
      ['a2-2', 'two']]);
    const commit = track(engine.executeQuery('COMMIT', [], {sessionId: 'a2'}));
    const prepared = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
    await ctx.settle();
    const leaderBefore = ctx.leader().replicaId;
    const moved = await ctx.transferLeadershipTo(followerIndexOf(ctx));
    hold.release();
    await ctx.group.waitFor(() => commit.settled);
    await ctx.settle();
    const replicas = replicaViewOf(ctx, staged.transactionId, ['a2-1', 'a2-2']);
    return {
      prepared,
      moved: moved && ctx.leader().replicaId !== leaderBefore,
      commit: commit.value?.success ?? null,
      states: replicas.map((replica) => replica.state),
      rows: replicas.map((replica) => replica.rows),
      decision: storeRowOf(ctx, staged.transactionId)?.decision ?? null,
      txopOutcomes: ctx.replicaStates().map((state) => state.txopOutcomes),
    };
  });
  assert.deepEqual(facts, {
    prepared: true,
    moved: true,
    commit: true,
    states: [COMMITTED, COMMITTED, COMMITTED],
    rows: [['a2-1', 'a2-2'], ['a2-1', 'a2-2'], ['a2-1', 'a2-2']],
    decision: 'COMMIT',
    txopOutcomes: [2, 2, 2],
  }, 'the COMMIT decided after the leader change applies once on every ' +
    'replica through the new leader');
});

test('TX1 A3: a replica restarted after PREPARE reaches the decided ' +
  'terminal state for both a COMMIT and a ROLLBACK decision',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const facts = await withTransactionGroup('tx1-a3', async (ctx) => {
    const runOnce = async (sessionId, ids, decide) => {
      let offsetMs = 0;
      const hold = createPersistenceHold(participantWriteOf(PREPARED));
      const engine = ctx.createCoordinator({hold,
        nowFn: () => Date.now() + offsetMs});
      const staged = await stage(engine, ctx, sessionId,
        ids.map((id) => [id, 'v']));
      const commit = track(engine.executeQuery('COMMIT', [], {sessionId}));
      const prepared = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
      await ctx.settle();
      const stoppedIndex = followerIndexOf(ctx);
      const restart = await ctx.stopReplica(stoppedIndex);
      if (decide === 'ROLLBACK') {
        // The budget is spent before the decision: the coordinator records
        // a bound ROLLBACK (never a COMMIT without time to complete it).
        offsetMs = PAST_BUDGET_MS;
      }
      hold.release();
      assert.equal(await ctx.group.waitFor(() => commit.settled), true,
        'the coordinator must settle its original request');
      await ctx.settle();
      // Read on the stopped replica's own database: it missed the decision.
      const whileDown = replicaViewOf(ctx, staged.transactionId, ids)[
        stoppedIndex].state;
      await restart();
      await ctx.settle();
      const replicas = replicaViewOf(ctx, staged.transactionId, ids);
      return {
        prepared,
        decision: storeRowOf(ctx, staged.transactionId)?.decision ?? null,
        whileDown,
        restartedState: replicas[stoppedIndex].state,
        states: replicas.map((replica) => replica.state),
        rows: replicas.map((replica) => replica.rows),
      };
    };
    return {
      commit: await runOnce('a3-commit', ['a3-c1'], 'COMMIT'),
      rollback: await runOnce('a3-rollback', ['a3-r1'], 'ROLLBACK'),
    };
  });
  assert.deepEqual(facts, {
    commit: {prepared: true, decision: 'COMMIT', whileDown: PREPARED,
      restartedState: COMMITTED,
      states: [COMMITTED, COMMITTED, COMMITTED],
      rows: [['a3-c1'], ['a3-c1'], ['a3-c1']]},
    rollback: {prepared: true, decision: 'ROLLBACK', whileDown: PREPARED,
      restartedState: ROLLED_BACK,
      states: [ROLLED_BACK, ROLLED_BACK, ROLLED_BACK],
      rows: [[], [], []]},
  }, 'a replica stopped after PREPARE and restarted applies the decision ' +
    'recorded while it was down');
});

// A bound decision request of `staged` from the coordinator's durable record
// (the decision it recorded, or a reversing record built the same way).
function decisionRequestOf(ctx, staged, sessionId, record) {
  const evidence = storeParticipantOf(ctx, staged.participantId);
  return {...identityOf(staged, sessionId), decision: record?.decision,
    preparedDigest: evidence?.preparedDigest ?? null,
    decisionText: record?.decisionText, decisionDigest: record?.decisionDigest};
}

function reversedRecordOf(record, decision) {
  // A record that holds no decision text (none was recorded) reverses to an
  // empty one: the replay is then refused, and the assertion names it.
  const decisionText = String(record?.decisionText ?? '').replace(
    `"decision":"${record?.decision}"`, `"decision":"${decision}"`);
  return {decision, decisionText,
    decisionDigest: createHash('sha256').update(decisionText).digest('hex')};
}

test('TX1 A4: replayed COMMIT and ROLLBACK deliveries apply nothing twice, ' +
  'emit no duplicate CDC and never reverse the outcome',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const facts = await withTransactionGroup('tx1-a4', async (ctx) => {
    let offsetMs = 0;
    const engine = ctx.createCoordinator({nowFn: () => Date.now() + offsetMs});
    const deliver = (sessionId, operation, request) =>
      engine.deliverTransactionOperation(sessionId, ctx.partitionId,
        operation, request).then(
        (answer) => ({success: true, replayed: answer.replayed === true,
          outcome: answer.outcome}),
        (error) => ({success: false, failureCode: error.failureCode ?? null}));
    // A COMMITTED transaction, and a ROLLED_BACK one whose budget was spent
    // after its PREPARE (a bound ROLLBACK decision).
    const committed = await stage(engine, ctx, 'a4-c', [['a4-c1', 'one']]);
    const commitAnswer = await engine.executeQuery('COMMIT', [],
      {sessionId: 'a4-c'});
    const hold = createPersistenceHold(participantWriteOf(PREPARED));
    const rolling = ctx.createCoordinator({hold,
      nowFn: () => Date.now() + offsetMs});
    const rolledBack = await stage(rolling, ctx, 'a4-r', [['a4-r1', 'two']]);
    const rollbackAnswer = track(rolling.executeQuery('COMMIT', [],
      {sessionId: 'a4-r'}));
    assert.notEqual(await within(hold.reached, HOLD_WAIT_MS), null,
      'rollback must reach the actual post-PREPARE persistence boundary');
    offsetMs = PAST_BUDGET_MS;
    hold.release();
    assert.equal(await ctx.group.waitFor(() => rollbackAnswer.settled), true,
      'the original rollback decision request must finish');
    offsetMs = 0;
    await ctx.settle();
    const obligationKey = `txop:${committed.participantId}:0`;
    const obligationsBefore = ctx.services().map((service) =>
      readCdcObligation(service.db, obligationKey));
    const obligationCountsBefore = ctx.services().map((service) =>
      service.db.prepare('SELECT COUNT(*) AS count FROM _cdc_obligations').get().count);
    const generationBefore = ctx.replicaStates().map((state) =>
      state.generation);
    const committedRecord = storeRowOf(ctx, committed.transactionId);
    const rolledBackRecord = storeRowOf(ctx, rolledBack.transactionId);
    const replays = {
      commit: await deliver('a4-c', QUERY_OPERATION.COMMIT,
        decisionRequestOf(ctx, committed, 'a4-c', committedRecord)),
      reversingRollback: await deliver('a4-c', QUERY_OPERATION.ROLLBACK,
        decisionRequestOf(ctx, committed, 'a4-c',
          reversedRecordOf(committedRecord, 'ROLLBACK'))),
      rollback: await deliver('a4-r', QUERY_OPERATION.ROLLBACK,
        decisionRequestOf(ctx, rolledBack, 'a4-r', rolledBackRecord)),
      reversingCommit: await deliver('a4-r', QUERY_OPERATION.COMMIT,
        decisionRequestOf(ctx, rolledBack, 'a4-r',
          reversedRecordOf(rolledBackRecord, 'COMMIT'))),
    };
    await ctx.settle();
    const obligationsAfter = ctx.services().map((service) =>
      readCdcObligation(service.db, obligationKey));
    const obligationCountsAfter = ctx.services().map((service) =>
      service.db.prepare('SELECT COUNT(*) AS count FROM _cdc_obligations').get().count);
    const firstObligation = obligationsBefore[0];
    const event = firstObligation === null ? null : JSON.parse(firstObligation.eventJson);
    const view = (staged, ids) => replicaViewOf(ctx, staged.transactionId, ids);
    return {
      decided: {commit: commitAnswer.success === true,
        rollback: rollbackAnswer.value?.success ?? null,
        records: [committedRecord?.decision ?? null,
          rolledBackRecord?.decision ?? null]},
      replays,
      cdc: {
        exactCommittedObligation: obligationsBefore.every((row) =>
          row?.eventKey === obligationKey && row.ordinal === 0 &&
          row.entryId === firstObligation?.entryId &&
          row.logIndex === firstObligation?.logIndex &&
          row.eventJson === firstObligation?.eventJson),
        payload: event === null ? null : {operation: event.operation,
          id: event.data?.id, value: event.data?.value},
        obligationCountsBefore,
        unchangedByReplays: obligationsAfter.every((row) =>
          row?.eventKey === firstObligation?.eventKey &&
          row.entryId === firstObligation?.entryId &&
          row.logIndex === firstObligation?.logIndex && row.ordinal === 0 &&
          row.eventJson === firstObligation?.eventJson) &&
          JSON.stringify(obligationCountsAfter) === JSON.stringify(obligationCountsBefore),
      },
      generationUnchanged: ctx.replicaStates().map((state, index) =>
        state.generation === generationBefore[index]),
      committed: view(committed, ['a4-c1']).map((replica) =>
        [replica.state, replica.rows]),
      rolledBack: view(rolledBack, ['a4-r1']).map((replica) =>
        [replica.state, replica.rows]),
      txopOutcomes: ctx.replicaStates().map((state) => state.txopOutcomes),
      outcomes: {
        committed: await outcomesOf(ctx, identityOf(committed, 'a4-c')),
        rolledBack: await outcomesOf(ctx, identityOf(rolledBack, 'a4-r')),
      },
    };
  });
  const everywhere = (value) => [value, value, value];
  assert.deepEqual(facts, {
    decided: {commit: true, rollback: false, records: ['COMMIT', 'ROLLBACK']},
    replays: {
      commit: {success: true, replayed: true,
        outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED},
      reversingRollback: {success: false,
        failureCode: 'participant_transaction_decision_conflict'},
      rollback: {success: true, replayed: true,
        outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED},
      reversingCommit: {success: false,
        failureCode: 'participant_transaction_decision_conflict'},
    },
    cdc: {exactCommittedObligation: true,
      payload: {operation: 'INSERT', id: 'a4-c1', value: 'one'},
      obligationCountsBefore: everywhere(1), unchangedByReplays: true},
    generationUnchanged: everywhere(true),
    committed: everywhere([COMMITTED, ['a4-c1']]),
    rolledBack: everywhere([ROLLED_BACK, []]),
    txopOutcomes: everywhere(1),
    outcomes: {
      committed: everywhere(PARTICIPANT_COMMIT_OUTCOME.COMMITTED),
      rolledBack: everywhere(PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED),
    },
  }, 'a replayed decision is answered from the row and applies nothing; ' +
    'the opposite decision is refused and changes nothing');
});

test('TX1 A5: a crash and restart after the PREPARE commit, after the ' +
  'coordinator decision and during decision fanout reach one terminal state ' +
  'on every replica', {timeout: TEST_TIMEOUT_MS}, async () => {
  const facts = await withTransactionGroup('tx1-a5', async (ctx) => {
    // One suspended engine per simulated crash point; a new engine reads
    // the gateway double's retained rows. A real follower replica is also
    // stopped across the second recovery and restarted after it.
    const crashAt = async (sessionId, ids, predicate, {replicaDown} = {}) => {
      const hold = createPersistenceHold(predicate);
      const crashed = ctx.createCoordinator({hold});
      const staged = await stage(crashed, ctx, sessionId,
        ids.map((id) => [id, 'v']));
      const answered = track(crashed.executeQuery('COMMIT', [], {sessionId}));
      const stopped = (await within(hold.reached, HOLD_WAIT_MS)) !== null;
      await ctx.settle();
      const downIndex = replicaDown ? followerIndexOf(ctx) : null;
      const restart = replicaDown ? await ctx.stopReplica(downIndex) : null;
      const recovering = ctx.createCoordinator({recoverRows: true});
      const replay = await recovering.activateDistributedTransactionRecovery();
      await ctx.settle();
      const whileDown = replicaDown ?
        replicaViewOf(ctx, staged.transactionId, ids)[downIndex].state : null;
      if (restart) {
        await restart();
      }
      await ctx.settle();
      const replicas = replicaViewOf(ctx, staged.transactionId, ids);
      const row = storeRowOf(ctx, staged.transactionId);
      return {
        stopped,
        whileDown,
        crashedAnswered: answered.settled,
        recovered: replay.failed === 0,
        decision: row?.decision ?? null,
        status: row?.status ?? null,
        states: replicas.map((replica) => replica.state),
        rows: replicas.map((replica) => replica.rows),
      };
    };
    return {
      afterPrepare: await crashAt('a5-p', ['a5-p1'],
        statusWriteOf(TRANSACTION_STATUS.PREPARED)),
      afterDecision: await crashAt('a5-d', ['a5-d1'],
        statusWriteOf(TRANSACTION_STATUS.COMMITTING), {replicaDown: true}),
      duringFanout: await crashAt('a5-f', ['a5-f1'],
        participantWriteOf(COMMITTED)),
    };
  });
  assert.deepEqual(facts, {
    afterPrepare: {stopped: true, whileDown: null, crashedAnswered: false,
      recovered: true,
      decision: 'COMMIT', status: COMMITTED,
      states: [COMMITTED, COMMITTED, COMMITTED],
      rows: [['a5-p1'], ['a5-p1'], ['a5-p1']]},
    afterDecision: {stopped: true, whileDown: PREPARED,
      crashedAnswered: false, recovered: true,
      decision: 'COMMIT', status: COMMITTED,
      states: [COMMITTED, COMMITTED, COMMITTED],
      rows: [['a5-d1'], ['a5-d1'], ['a5-d1']]},
    duringFanout: {stopped: true, whileDown: null, crashedAnswered: false,
      recovered: true,
      decision: 'COMMIT', status: COMMITTED,
      states: [COMMITTED, COMMITTED, COMMITTED],
      rows: [['a5-f1'], ['a5-f1'], ['a5-f1']]},
  }, 'every crash point ends in the one terminal state its recorded decision ' +
    'names, on every replica');
});

// Compatibility is proved after a real replicated PREPARE, not by seeding a
// private session map or ignoring a refused legacy BEGIN. Historical admitted
// legacy work and its removal remain a separate migration obligation.
test('TX1 native L6: legacy controls and expiry cannot settle a durable ' +
  'PREPARED reservation, including after a replica restart',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withTransactionGroup('tx1-native-l6', async (ctx) => {
    const hold = createPersistenceHold(isDecisionWrite);
    const engine = ctx.createCoordinator({hold});
    const sessionId = 'native-l6-prepared';
    const staged = await stage(engine, ctx, sessionId, [['l6-row', 'durable']]);
    const commit = track(engine.executeQuery('COMMIT', [], {sessionId}));
    try {
      assert.notEqual(await within(hold.reached, HOLD_WAIT_MS), null,
        'the actual coordinator must reach its decision write after PREPARE');
      await ctx.settle();
      const before = ctx.replicaStates();
      assert.ok(before.every((state) => state.participants.length === 1 &&
        state.participants[0].state === PREPARED && state.rows.length === 0));
      assert.equal(storeRowOf(ctx, staged.transactionId).decision, null);
      const leader = ctx.leader();
      const legacy = (operation, routingSession = sessionId) =>
        leader.handleApplicationMessage({type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
          operation, sessionId: routingSession, transactionEpoch: staged.begun.transactionEpoch});
      const begun = await legacy(PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION, 'new-legacy');
      assert.equal(begun.failureCode, 'participant_transaction_already_active');
      for (const operation of [PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        PARTITION_SERVICE_OPERATION.COMMIT, PARTITION_SERVICE_OPERATION.ROLLBACK]) {
        const answer = await legacy(operation);
        assert.equal(answer.failureCode, 'participant_transaction_legacy_session_fenced');
      }
      const outcome = await legacy(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME);
      assert.equal(outcome.outcome, PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
        'a session-only absence is not evidence of a decided participant');
      const query = await leader.handleApplicationMessage({
        type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY, sessionId,
        sql: `INSERT INTO ${ctx.table} (id, value) VALUES (?, ?)`, params: ['intruder', 'no'],
      });
      assert.equal(query.failureCode, 'participant_transaction_legacy_session_fenced');
      for (const service of ctx.services()) {
        assert.equal(service.db.inTransaction, false,
          'no legacy request acquired the native connection');
        const now = service.timeSource.now();
        service.enforcePreparedStateHoldTimeouts(now);
        service.enforcePreparedStateHoldTimeouts(now + service.preparedStateHoldTimeoutMs * 2);
        assert.equal(service.preparedTransactions.size, 0,
          'legacy reconstruction is not the new reservation authority');
      }
      assert.deepEqual(ctx.replicaStates(), before,
        'legacy controls and expiry change no participant row, generation or effect');
      const index = followerIndexOf(ctx);
      const restart = await ctx.stopReplica(index);
      await restart();
      await ctx.settle();
      const restored = ctx.services()[index];
      restored.enforcePreparedStateHoldTimeouts(restored.timeSource.now() +
        restored.preparedStateHoldTimeoutMs * 2);
      assert.equal(restored.preparedTransactions.size, 0);
      assert.deepEqual(ctx.replicaStates(), before,
        'restart keeps the exact prepared identity, digest and position without legacy maps');
      hold.release();
      assert.equal(await ctx.group.waitFor(() => commit.settled), true);
      assert.equal(commit.value?.success, true, JSON.stringify(commit.value));
      await ctx.settle();
      assert.deepEqual(await outcomesOf(ctx, identityOf(staged, sessionId)),
        [COMMITTED, COMMITTED, COMMITTED]);
      assert.ok(ctx.replicaStates().every((state) => state.rows.length === 1 &&
        state.rows[0].id === 'l6-row' && state.txopOutcomes === 1));
      assert.equal((await legacy(PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        'after-decision')).failureCode, 'participant_transaction_legacy_session_fenced',
      'terminal settlement does not reactivate fresh legacy execution');
    } finally {
      hold.release();
    }
  });
});
