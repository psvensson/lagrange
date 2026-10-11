/**
 * TX1 restart milestone (quest replicated-transaction-decision-and-apply;
 * design revision 10, sections 2.1-2.4, 4 and 11.1; agreed seam items A,
 * B/S, C, C', E, G and U): the coordinator and the participant meet at a
 * restart.
 *
 * Through the real SQLQueryEngine and the participant group's own transport,
 * one transaction stages two rows on a real three-replica rs-raft participant
 * group and is prepared there; its COMMIT decision is recorded insert-once in
 * the coordinator's durable row; the coordinator process stops at its very
 * next write, before any decision fanout. The group's leadership then moves.
 * A new coordinator - a new engine over the same durable rows, recovering
 * them through the engine's production startup path - drives the SAME
 * transaction identity forward to COMMITTED: every replica holds exactly one
 * committed effect (each row once, one operation outcome per staged
 * statement, one generation step), the decision is the one recorded first,
 * and a further recovery changes nothing.
 *
 * Fixture: test/test-helpers/transaction-coordinator-group-fixture.js (its
 * header states the fidelity limit of the coordinator's durable store).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from
  '../../src/constants/transactions.js';
import {PARTITION_SERVICE_MESSAGE_TYPE, PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  createPersistenceHold,
  statusWriteOf,
  withTransactionGroup,
} from '../test-helpers/transaction-coordinator-group-fixture.js';

const SESSION = 'tx1-restart-session';
const STAGED = Object.freeze([['r-1', 'one'], ['r-2', 'two']]);
const STOP_WAIT_MS = 30000;
const TEST_TIMEOUT_MS = 240000;

function insertOf(table) {
  return `INSERT INTO ${table} (id, value) VALUES (?, ?)`;
}

// The coordinator's durable rows of one transaction (every column the
// schema has: a column the schema lacks reads as absent, never as a value).
function storeRowOf(ctx, transactionId) {
  const row = ctx.store.prepare(`SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
    'WHERE transaction_id = ?').get(transactionId);
  return row ? {status: row.status, decision: row.decision ?? null,
    decision_text: row.decision_text ?? null,
    decision_digest: row.decision_digest ?? null} : null;
}

function storeParticipantsOf(ctx, transactionId) {
  const rows = ctx.store.prepare('SELECT * FROM ' +
    `${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`)
    .all(transactionId);
  return rows.map((row) => ({participant_id: row.participant_id,
    status: row.status, prepared_digest: row.prepared_digest ?? null}));
}

function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  })]).finally(() => clearTimeout(timer));
}

function track(promise) {
  const tracked = {settled: false};
  promise.then(() => {
    tracked.settled = true;
  }, () => {
    tracked.settled = true;
  });
  return tracked;
}

// What each replica holds of the transaction: its row state, its prepared
// and decision digests, and its staged rows.
function replicaFactsOf(ctx, transactionId) {
  return ctx.replicaStates().map((state) => ({
    rows: state.rows.map((row) => `${row.id}=${row.value}`),
    transactions: state.participants.filter((row) =>
      row.transaction_id === transactionId).map((row) => ({
      participantId: row.participant_id,
      state: row.state,
      preparedDigest: row.prepared_digest,
      decisionDigest: row.decision_digest,
    })),
    txopOutcomes: state.txopOutcomes,
    generation: state.generation,
  }));
}

async function outcomesOf(ctx, identity) {
  const answers = [];
  for (const service of ctx.services()) {
    const answer = await service.handleApplicationMessage({
      type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
      operation: PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME,
      ...identity,
    });
    answers.push(answer?.outcome ?? null);
  }
  return answers;
}

test('TX1 restart milestone: a COMMIT decision recorded before an ' +
  'interrupted fanout is driven forward by a recovered coordinator after the ' +
  'participant group changes leader, to one committed effect on every ' +
  'replica under the same transaction identity', {timeout: TEST_TIMEOUT_MS},
async () => {
  const facts = await withTransactionGroup('tx1-restart', async (ctx) => {
    const insert = insertOf(ctx.table);
    // The first coordinator stops at the write that follows its decision
    // record: the commit point's status, before any decision fanout.
    const hold = createPersistenceHold(
      statusWriteOf(TRANSACTION_STATUS.COMMITTING));
    const first = ctx.createCoordinator({hold});
    const begun = await first.executeQuery('BEGIN', [], {sessionId: SESSION});
    const transactionId = begun.transactionId;
    const participantId = `${transactionId}:${ctx.partitionId}`;
    const staged = [];
    for (const params of STAGED) {
      staged.push((await first.executeQuery(insert, [...params],
        {sessionId: SESSION})).success === true);
    }
    const generationBefore = ctx.replicaStates().map((state) =>
      state.generation);
    const interruptedCommit = track(first.executeQuery('COMMIT', [],
      {sessionId: SESSION}));
    const stopped = await within(hold.reached, STOP_WAIT_MS);
    await ctx.settle();
    const recorded = storeRowOf(ctx, transactionId);
    const atInterruption = {
      stoppedBeforeFanout: stopped !== null,
      row: recorded && {status: recorded.status,
        decision: recorded.decision},
      decisionNames: recorded?.decision_text ?
        JSON.parse(recorded.decision_text).participants : null,
      retained: storeParticipantsOf(ctx, transactionId).map((row) =>
        row.prepared_digest),
      replicas: replicaFactsOf(ctx, transactionId),
    };

    const leaderBefore = ctx.leader()?.replicaId ?? null;
    const successorIndex = ctx.services().findIndex((service) =>
      service.replicaId !== leaderBefore);
    const leadershipMoved = await ctx.transferLeadershipTo(successorIndex);

    const recovering = ctx.createCoordinator({recoverRows: true});
    const replay = await recovering.activateDistributedTransactionRecovery();
    await ctx.settle();
    const final = storeRowOf(ctx, transactionId);
    const afterRecovery = {
      replay: {totalRecovered: replay.totalRecovered,
        resumed: replay.resumed, failed: replay.failed},
      row: final && {status: final.status, decision: final.decision,
        sameDecisionRecord: final.decision_digest === recorded?.decision_digest},
      replicas: replicaFactsOf(ctx, transactionId),
      outcomes: await outcomesOf(ctx, {sessionId: SESSION, transactionId,
        participantId, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
        transactionEpoch: begun.transactionEpoch}),
      interruptedCommitAnswered: interruptedCommit.settled,
    };

    const again = ctx.createCoordinator({recoverRows: true});
    const secondReplay = await again.activateDistributedTransactionRecovery();
    await ctx.settle();
    return {
      begun: begun.success === true,
      identity: /^[0-9a-f]{32}$/u.test(transactionId),
      staged,
      atInterruption,
      leadershipMoved: leadershipMoved && ctx.leader()?.replicaId !==
        leaderBefore,
      afterRecovery,
      generationStep: afterRecovery.replicas.map((replica, index) =>
        replica.generation - generationBefore[index]),
      secondRecovery: {resumed: secondReplay.resumed,
        failed: secondReplay.failed,
        replicas: replicaFactsOf(ctx, transactionId)},
      digests: {
        preparedOnEveryReplica: new Set(atInterruption.replicas.flatMap(
          (replica) => replica.transactions.map((row) => row.preparedDigest)))
          .size,
        retainedIsPrepared: atInterruption.retained[0] ===
          atInterruption.replicas[0].transactions[0]?.preparedDigest,
        decisionNamesPrepared: atInterruption.decisionNames?.[0]?.[1] ===
          atInterruption.retained[0],
        decisionAppliedIsRecorded: afterRecovery.replicas.every((replica) =>
          replica.transactions[0]?.decisionDigest ===
            recorded?.decision_digest),
      },
    };
  });

  const prepared = (replica) => ({
    rows: [],
    transactions: [{
      participantId: replica.transactions[0]?.participantId,
      state: 'PREPARED',
      preparedDigest: replica.transactions[0]?.preparedDigest,
      decisionDigest: null,
    }],
    txopOutcomes: 0,
    generation: replica.generation,
  });
  const committed = (replica) => ({
    rows: STAGED.map(([id, value]) => `${id}=${value}`),
    transactions: [{
      participantId: replica.transactions[0]?.participantId,
      state: 'COMMITTED',
      preparedDigest: replica.transactions[0]?.preparedDigest,
      decisionDigest: replica.transactions[0]?.decisionDigest,
    }],
    txopOutcomes: STAGED.length,
    generation: replica.generation,
  });
  assert.deepEqual({
    begun: facts.begun,
    identity: facts.identity,
    staged: facts.staged,
    atInterruption: {...facts.atInterruption,
      decisionNames: facts.atInterruption.decisionNames?.length ?? null,
      retained: facts.atInterruption.retained.length},
    leadershipMoved: facts.leadershipMoved,
    afterRecovery: facts.afterRecovery,
    generationStep: facts.generationStep,
    secondRecovery: facts.secondRecovery,
    digests: facts.digests,
  }, {
    begun: true,
    identity: true,
    staged: [true, true],
    atInterruption: {
      stoppedBeforeFanout: true,
      row: {status: 'PREPARED', decision: 'COMMIT'},
      decisionNames: 1,
      retained: 1,
      replicas: facts.atInterruption.replicas.map(prepared),
    },
    leadershipMoved: true,
    afterRecovery: {
      replay: {totalRecovered: 1, resumed: 1, failed: 0},
      row: {status: 'COMMITTED', decision: 'COMMIT', sameDecisionRecord: true},
      replicas: facts.afterRecovery.replicas.map(committed),
      outcomes: [PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
        PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
        PARTICIPANT_COMMIT_OUTCOME.COMMITTED],
      interruptedCommitAnswered: false,
    },
    generationStep: [1, 1, 1],
    secondRecovery: {resumed: 1, failed: 0,
      replicas: facts.afterRecovery.replicas},
    digests: {preparedOnEveryReplica: 1, retainedIsPrepared: true,
      decisionNamesPrepared: true, decisionAppliedIsRecorded: true},
  }, 'the recovered coordinator completes the recorded COMMIT under the ' +
    'same identity on every replica, exactly once');
});
