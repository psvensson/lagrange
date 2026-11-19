import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DurableWorkflowCoordinator,
} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  classifyTransactionStatement,
  getDeterminismClassifierStats,
} from '../../src/partition/partition-transaction-determinism.js';
import {
  discardParticipantSessions,
  recordCommittedAutocommitRowKeys,
  resetParticipantRowKeyHistory,
} from '../../src/partition/partition-participant-transaction-session.js';
import {cruise} from 'dependency-cruiser';
import depcruiseConfig from '../../dependency-cruiser.config.cjs';
import {
  buildPrepareCommand,
  operationsOf,
} from '../../src/partition/partition-participant-transaction-bytes.js';
import {
  advancePartitionWriteGeneration,
  readPartitionWriteGeneration,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  RaftRsDurableStore,
} from '../../src/raft/raft-rs-durable-store.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL,
  ROW,
  ROW_2,
  TABLE,
  applyProposal,
  awaitProposal,
  beginMessage,
  clearFixtureSingletons,
  commitDecision,
  commitMessage,
  commitOrdinaryWrite,
  durableAppliedIndex,
  generationOf,
  identityOf,
  isDecisionCommand,
  isPrepareCommand,
  onFixtureLeader,
  operationOf,
  plantAppliedStateFailure,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  removeAppliedStateFailure,
  resetFixtureSingletons,
  resumeFixtureParticipantAdmission,
  resumeFixtureParticipantGroupAdmission,
  rowCount,
  send,
  shutdownAll,
  startLeader,
  temporaryDbPath,
} from '../test-helpers/participant-transaction-fixture.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function buildPrepareEvidence(partitionId) {
  return {
    preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
    prepareIndex: 1,
    prepareTerm: 1,
  };
}

test('Scenario A fast path: payment transaction breakdown tracer and Priority 1 bookkeeping reduction', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());

  let authoritativeReadCount = 0;
  const origRead = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (...args) => {
    authoritativeReadCount += 1;
    return origRead(...args);
  };

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger: QUIET_LOGGER,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
  });
  t.after(() => engine.shutdown());

  const coordinator = engine.transactionCoordinator;
  coordinator.beginParticipant = async () => {};
  coordinator.prepareParticipant = async (_s, partitionId) => buildPrepareEvidence(partitionId);
  coordinator.commitParticipant = async () => {};

  const begun = await coordinator.begin('payment-session');
  assert.equal(begun.success, true);

  const mutationsBeforeFirst = gateway.mutations.length;
  const readsBeforeFirst = authoritativeReadCount;
  await coordinator.executeWriteStatement(
    'payment-session',
    {
      operationId: 'payment-w1',
      sql: 'UPDATE warehouse SET ytd_cents = ytd_cents + 100 WHERE id = 1',
      partitionIds: ['p-warehouse'],
    },
    async () => ({success: true, affectedRows: 1}),
  );
  const firstMutations = gateway.mutations.slice(mutationsBeforeFirst);
  assert.equal(
    firstMutations.filter((m) => m.tableName === 'sql_transaction_participants').length,
    1,
    'newly enlisted participant persisted once',
  );
  assert.equal(
    authoritativeReadCount - readsBeforeFirst,
    0,
    '1-row CAS skips post-mutation authoritative readback',
  );

  const mutationsBeforeSecond = gateway.mutations.length;
  const readsBeforeSecond = authoritativeReadCount;
  await coordinator.executeWriteStatement(
    'payment-session',
    {
      operationId: 'payment-w2',
      sql: 'UPDATE warehouse SET ytd_cents = ytd_cents + 200 WHERE id = 1',
      partitionIds: ['p-warehouse'],
    },
    async () => ({success: true, affectedRows: 1}),
  );
  const secondMutations = gateway.mutations.slice(mutationsBeforeSecond);
  assert.equal(
    secondMutations.filter(
      (m) => m.tableName === 'sql_transactions' && m.data?.participant_set_state === undefined,
    ).length,
    0,
    'no redundant ACTIVE status progress mutations',
  );
  assert.equal(
    secondMutations.filter((m) => m.tableName === 'sql_write_operations').length,
    1,
    'sql_write_operations persisted once with final outcome',
  );
  assert.equal(secondMutations.length <= 2, true);
  assert.equal(authoritativeReadCount - readsBeforeSecond, 0);

  const committed = await coordinator.commit('payment-session');
  assert.equal(committed.success, true);

  const breakdown = coordinator.getLastTransactionBreakdown(begun.transactionId);
  assert.equal(Boolean(breakdown), true);
  assert.equal(breakdown.transactionId, begun.transactionId);
  assert.equal(breakdown.statementCount, 2);
  assert.equal(breakdown.participantCount, 1);
  assert.equal(typeof breakdown.beginMs, 'number');
  assert.equal(typeof breakdown.statementsMs, 'number');
  assert.equal(typeof breakdown.preparePhaseMs, 'number');
  assert.equal(typeof breakdown.decisionPersistMs, 'number');
  assert.equal(typeof breakdown.commitPhaseMs, 'number');
  assert.equal(typeof breakdown.totalMs, 'number');

  const summary = coordinator.getTransactionTelemetrySummary();
  assert.equal(summary.transactionCount, 1);
});

test('Scenario A fast path: Priority 2 concurrent participant phases while DurableWorkflowCoordinator stays sequential', async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const coordinator = new DistributedTransactionCoordinator({
    logger: QUIET_LOGGER,
    beginParticipant: async () => sleep(30),
    prepareParticipant: async (_s, partitionId) => {
      await sleep(30);
      return buildPrepareEvidence(partitionId);
    },
    commitParticipant: async () => sleep(30),
  });

  await coordinator.begin('concurrent-tx');
  const t0 = performance.now();
  await coordinator.enlistParticipants('concurrent-tx', ['p1', 'p2', 'p3', 'p4']);
  const enlistMs = performance.now() - t0;
  assert.equal(enlistMs < 95, true);

  const t1 = performance.now();
  const committed = await coordinator.commit('concurrent-tx');
  const commitMs = performance.now() - t1;
  assert.equal(committed.success, true);
  assert.equal(commitMs < 190, true);

  const wfOrder = [];
  const wf = new DurableWorkflowCoordinator();
  await wf.registerWorkflow({workflowId: 'wf-1', ownerKey: 's-1', status: 'PREPARING'});
  await wf.upsertParticipant('wf-1', {participantId: 'p1', participantKey: 'p1', partitionId: 'p1', status: 'PREPARING'});
  await wf.upsertParticipant('wf-1', {participantId: 'p2', participantKey: 'p2', partitionId: 'p2', status: 'PREPARING'});
  await wf.executeParticipantStage('wf-1', 'PREPARING', 'PREPARED', async (key) => {
    wfOrder.push(`start:${key}`);
    await sleep(10);
    wfOrder.push(`end:${key}`);
  }, {participantKeys: ['p1', 'p2']});
  assert.deepEqual(wfOrder, ['start:p1', 'end:p1', 'start:p2', 'end:p2']);
});

test('Scenario A fast path: Priorities 3, 4, and 6 on partition staging, determinism cache, and Raft sync telemetry', async () => {
  resetFixtureSingletons();
  try {
    await onFixtureLeader(async (leader, proposed) => {
      leader.concurrencyGranularity = 'row-key';
      leader.conflictSettleWaitMs = 50;
      const txA = identityOf('b'.repeat(32), {sessionId: 'sess-a'});
      const txB = identityOf('c'.repeat(32), {sessionId: 'sess-b'});
      assert.equal((await send(leader, beginMessage(txA))).success, true);
      assert.equal((await send(leader, beginMessage(txB))).success, true);

      const readEmpty = await send(leader, queryMessage(txA, `SELECT id, value FROM ${TABLE} WHERE id = ?`, [ROW.id]));
      assert.equal(readEmpty.success, true);

      assert.equal((await send(leader, queryMessage(txA, INSERT_SQL, ['k-a', 'v1']))).success, true);
      assert.equal((await send(leader, queryMessage(txB, INSERT_SQL, ['k-b', 'v2']))).success, true);
      assert.equal((await send(leader, queryMessage(txA, INSERT_SQL, ['k-shared', 'v3']))).success, true);
      const conflictWrite = await send(leader, queryMessage(txB, INSERT_SQL, ['k-shared', 'v4']));
      assert.equal(conflictWrite.success, false);
      assert.equal(conflictWrite.failureCode, 'participant_transaction_already_active');

      const replayStats = leader.getStagingReplayStats();
      assert.equal(replayStats.emptyReadDirectExecutions >= 1, true);
      assert.equal(replayStats.fastReplayedOperations >= 1, true);

      const statsBefore = getDeterminismClassifierStats(leader.db);
      classifyTransactionStatement(leader.db, {
        tableName: TABLE,
        sql: INSERT_SQL,
        params: [ROW.id, ROW.value],
      });
      classifyTransactionStatement(leader.db, {
        tableName: TABLE,
        sql: INSERT_SQL,
        params: [ROW_2.id, ROW_2.value],
      });
      const statsAfter = getDeterminismClassifierStats(leader.db);
      assert.equal(statsAfter.compiledHitCount > statsBefore.compiledHitCount, true);

      const tx1 = identityOf('d'.repeat(32), {sessionId: 'sess-d1'});
      const tx2 = identityOf('e'.repeat(32), {sessionId: 'sess-d2'});
      const tx3 = identityOf('f'.repeat(32), {sessionId: 'sess-d3'});
      assert.equal((await send(leader, beginMessage(tx1))).success, true);
      assert.equal((await send(leader, beginMessage(tx2))).success, true);
      assert.equal((await send(leader, queryMessage(tx1, INSERT_SQL, ['disjoint-1', 'v1']))).success, true);
      assert.equal((await send(leader, queryMessage(tx2, INSERT_SQL, ['disjoint-2', 'v2']))).success, true);

      const prep1Promise = send(leader, prepareMessage(tx1));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx1.transactionId && isPrepareCommand(entry));
      const prep1 = await prep1Promise;
      assert.equal(prep1.success, true);

      // Disjoint tx2 prepares while tx1 is STATE.PREPARED on the same partition:
      const prep2Promise = send(leader, prepareMessage(tx2));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx2.transactionId && isPrepareCommand(entry));
      const prep2 = await prep2Promise;
      assert.equal(prep2.success, true);

      // Disjoint tx3 begins and stages while tx1 and tx2 are STATE.PREPARED:
      assert.equal((await send(leader, beginMessage(tx3))).success, true);
      assert.equal((await send(leader, queryMessage(tx3, INSERT_SQL, ['disjoint-3', 'v3']))).success, true);

      // Both prepared transactions commit even though tx1 advances generation before tx2 commits:
      const commit1Promise = send(leader, commitMessage(tx1, prep1.preparedDigest));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx1.transactionId && isDecisionCommand(entry));
      assert.equal((await commit1Promise).success, true);

      const commit2Promise = send(leader, commitMessage(tx2, prep2.preparedDigest));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx2.transactionId && isDecisionCommand(entry));
      assert.equal((await commit2Promise).success, true);

      const prep3Promise = send(leader, prepareMessage(tx3));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx3.transactionId && isPrepareCommand(entry));
      const prep3 = await prep3Promise;
      assert.equal(prep3.success, true);

      const commit3Promise = send(leader, commitMessage(tx3, prep3.preparedDigest));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === tx3.transactionId && isDecisionCommand(entry));
      assert.equal((await commit3Promise).success, true);

      assert.equal(rowCount(leader, 'disjoint-1'), 1);
      assert.equal(rowCount(leader, 'disjoint-2'), 1);
      assert.equal(rowCount(leader, 'disjoint-3'), 1);
    });
  } finally {
    clearFixtureSingletons();
  }

  const raftDb = new Database(':memory:');
  const store = new RaftRsDurableStore(raftDb);
  try {
    store.persistReady('p-1', {
      entries: [{index: '1', term: '1', entryType: 0, data: null}],
      mustSync: true,
    });
    const syncStats = store.getDurableSyncStats();
    assert.equal(syncStats.syncCommitCount >= 1, true);
    assert.equal(typeof syncStats.totalSyncMs, 'number');
  } finally {
    store.close();
  }
});

test('Scenario A fast path: Priority 5 composite prefix and range partition pruning via PartitionResolver', () => {
  const resolver = new PartitionResolver();
  const partitions = [
    {partition_id: 'ol-p1', partition_key_start: null, partition_key_end: '[1,1,100]'},
    {partition_id: 'ol-p2', partition_key_start: '[1,1,100]', partition_key_end: '[1,2,1]'},
    {partition_id: 'ol-p3', partition_key_start: '[1,2,1]', partition_key_end: '[2,1,1]'},
    {partition_id: 'ol-p4', partition_key_start: '[2,1,1]', partition_key_end: null},
  ];
  const keyColumns = ['warehouse_id', 'district_id', 'order_id'];

  const prefixAst = new SQLParser(
    'SELECT * FROM order_line WHERE warehouse_id = 1 AND district_id = 1',
  ).parse();
  const prunedPrefix = resolver.resolvePartitions(
    'order_line',
    prefixAst.where,
    partitions,
    {keyColumns},
  );
  assert.deepEqual(prunedPrefix, ['ol-p1', 'ol-p2']);

  const rangeAst = new SQLParser(
    'SELECT * FROM order_line WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 120 AND order_id < 180',
  ).parse();
  const prunedRange = resolver.resolvePartitions(
    'order_line',
    rangeAst.where,
    partitions,
    {keyColumns},
  );
  assert.deepEqual(prunedRange, ['ol-p2']);
});

function readDurablePartitionSnapshot(db) {
  return {
    userRows: db.prepare(`SELECT id, value FROM ${TABLE} ORDER BY id`).all(),
    decisions: db.prepare(
      'SELECT participant_id, state, decision, refusal_cause ' +
      'FROM _participant_transactions ORDER BY participant_id',
    ).all(),
    outcomes: db.prepare(
      'SELECT entry_key, outcome, changes ' +
      'FROM _partition_statement_outcomes ORDER BY entry_key',
    ).all(),
    generation: db.prepare(
      'SELECT generation, origin_index FROM _partition_write_generation WHERE singleton = 1',
    ).get(),
  };
}

test('Disjoint PREPARED transactions commit identically in [1, 1] or [2] native Raft apply batches', async () => {
  async function runWithCommitBatches(batchSizes) {
    resetFixtureSingletons();
    try {
      return await onFixtureLeader(async (leader, proposed) => {
        leader.concurrencyGranularity = 'row-key';
        leader.conflictSettleWaitMs = 50;
        const txBatchA = identityOf('1'.repeat(32), {sessionId: 'sess-batch-a'});
        const txBatchB = identityOf('2'.repeat(32), {sessionId: 'sess-batch-b'});
        assert.equal((await send(leader, beginMessage(txBatchA))).success, true);
        assert.equal((await send(leader, beginMessage(txBatchB))).success, true);
        assert.equal((await send(leader, queryMessage(txBatchA, INSERT_SQL, ['batch-k1', 'v1']))).success, true);
        assert.equal((await send(leader, queryMessage(txBatchB, INSERT_SQL, ['batch-k2', 'v2']))).success, true);

        const prepAPromise = send(leader, prepareMessage(txBatchA));
        const prepBPromise = send(leader, prepareMessage(txBatchB));
        const prepACmd = await awaitProposal(
          proposed,
          (entry) => entry.transactionId === txBatchA.transactionId && isPrepareCommand(entry),
        );
        const prepBCmd = await awaitProposal(
          proposed,
          (entry) => entry.transactionId === txBatchB.transactionId && isPrepareCommand(entry),
        );
        leader.controllablePort.commitBatches([prepACmd, prepBCmd], batchSizes);
        const [prepA, prepB] = await Promise.all([prepAPromise, prepBPromise]);
        assert.equal(prepA.success, true);
        assert.equal(prepB.success, true);

        const commitAPromise = send(leader, commitMessage(txBatchA, prepA.preparedDigest));
        const commitBPromise = send(leader, commitMessage(txBatchB, prepB.preparedDigest));
        const commitACmd = await awaitProposal(
          proposed,
          (entry) => entry.transactionId === txBatchA.transactionId && isDecisionCommand(entry),
        );
        const commitBCmd = await awaitProposal(
          proposed,
          (entry) => entry.transactionId === txBatchB.transactionId && isDecisionCommand(entry),
        );
        leader.controllablePort.commitBatches([commitACmd, commitBCmd], batchSizes);
        const [commitA, commitB] = await Promise.all([commitAPromise, commitBPromise]);
        assert.equal(commitA.success, true);
        assert.equal(commitB.success, true);
        return readDurablePartitionSnapshot(leader.db);
      });
    } finally {
      clearFixtureSingletons();
    }
  }

  const snapshotSeparate = await runWithCommitBatches([1, 1]);
  const snapshotBatched = await runWithCommitBatches([2]);
  assert.deepEqual(snapshotBatched, snapshotSeparate);
  assert.equal(snapshotBatched.userRows.length, 2);
  assert.deepEqual(
    snapshotBatched.decisions.map((d) => d.state),
    ['COMMITTED', 'COMMITTED'],
  );
});

test('Durable PREPARED transactions survive file-backed SQLite reopen with fresh owners, rollback at real transaction boundary, leadership change, and history eviction', async () => {
  resetFixtureSingletons();
  const {directory, dbPath} = temporaryDbPath();
  let leader1 = null;
  let leader2 = null;
  let leader3 = null;
  try {
    const started1 = await startLeader({dbPath});
    leader1 = started1.leader;
    const proposed1 = started1.proposed;
    leader1.concurrencyGranularity = 'row-key';
    leader1.conflictSettleWaitMs = 50;

    // 1. Apply an ordinary autocommit write before PREPARE so generation > 0:
    const ord = await commitOrdinaryWrite(leader1, proposed1, 'ord-pre-prepare', {
      id: 'ord-k0',
      value: 'v0',
    });
    assert.equal(ord.apply, null);
    assert.equal(ord.answer, true);
    assert.equal(readPartitionWriteGeneration(leader1.db), 1);

    const txRecA = identityOf('3'.repeat(32), {sessionId: 'sess-rec-a'});
    const txRecB = identityOf('4'.repeat(32), {sessionId: 'sess-rec-b'});
    assert.equal((await send(leader1, beginMessage(txRecA))).success, true);
    assert.equal((await send(leader1, beginMessage(txRecB))).success, true);
    assert.equal((await send(leader1, queryMessage(txRecA, INSERT_SQL, ['rec-k1', 'v1']))).success, true);
    assert.equal((await send(leader1, queryMessage(txRecB, INSERT_SQL, ['rec-k2', 'v2']))).success, true);

    const prepAPromise = send(leader1, prepareMessage(txRecA));
    await applyProposal(
      leader1,
      proposed1,
      (entry) => entry.transactionId === txRecA.transactionId && isPrepareCommand(entry),
    );
    const prepA = await prepAPromise;
    assert.equal(prepA.success, true);

    const prepBPromise = send(leader1, prepareMessage(txRecB));
    await applyProposal(
      leader1,
      proposed1,
      (entry) => entry.transactionId === txRecB.transactionId && isPrepareCommand(entry),
    );
    const prepB = await prepBPromise;
    assert.equal(prepB.success, true);

    // Build both COMMIT commands before shutting down leader1:
    void send(leader1, commitMessage(txRecA, prepA.preparedDigest));
    void send(leader1, commitMessage(txRecB, prepB.preparedDigest));
    const commitACmd = await awaitProposal(
      proposed1,
      (entry) => entry.transactionId === txRecA.transactionId && isDecisionCommand(entry),
    );
    const commitBCmd = await awaitProposal(
      proposed1,
      (entry) => entry.transactionId === txRecB.transactionId && isDecisionCommand(entry),
    );
    const appliedBeforeReopen = durableAppliedIndex(leader1);

    // 2. Shut down leader1 and reopen the file-backed SQLite database with a fresh PartitionService owner:
    await shutdownAll(leader1);
    leader1 = null;

    // While durable PREPARED obligations remain unsettled on disk, cutover release fences new admission:
    await assert.rejects(
      () => startLeader({dbPath}),
      /release_drain_pending/u,
    );

    const started2 = await startLeader({dbPath, releaseAdmission: false});
    leader2 = started2.leader;
    leader2.concurrencyGranularity = 'row-key';
    leader2.conflictSettleWaitMs = 50;

    // 3. Inject an application failure at the real SQLite transaction boundary and verify full rollback:
    const committedEvents = [];
    leader2.on('entry:committed', (evt) => committedEvents.push(evt));
    plantAppliedStateFailure(leader2.db);
    assert.throws(() => {
      leader2.controllablePort.commitBatches([commitACmd, commitBCmd], [2]);
    }, /tx1-v3 planted/u);
    removeAppliedStateFailure(leader2.db);

    assert.equal(committedEvents.length, 0);
    assert.equal(durableAppliedIndex(leader2), appliedBeforeReopen);
    assert.equal(readPartitionWriteGeneration(leader2.db), 1);
    assert.equal(rowCount(leader2, 'rec-k1'), 0);
    assert.equal(rowCount(leader2, 'rec-k2'), 0);
    assert.equal(
      readDurablePartitionSnapshot(leader2.db).outcomes.filter((o) => o.entry_key.startsWith('txop:')).length,
      0,
    );
    assert.deepEqual(
      readDurablePartitionSnapshot(leader2.db).decisions.map((d) => d.state),
      ['PREPARED', 'PREPARED'],
    );

    // 4. Commit txRecA on reopened leader2, then reopen a third fresh owner leader3 between commitA and commitB:
    leader2.controllablePort.commitBatches([commitACmd], [1]);
    assert.equal(rowCount(leader2, 'rec-k1'), 1);
    await shutdownAll(leader2);
    leader2 = null;

    const started3 = await startLeader({dbPath, releaseAdmission: false});
    leader3 = started3.leader;
    leader3.concurrencyGranularity = 'row-key';
    leader3.conflictSettleWaitMs = 50;

    discardParticipantSessions(leader3);
    resetParticipantRowKeyHistory(leader3);

    for (let i = 0; i < 1100; i += 1) {
      advancePartitionWriteGeneration(leader3.db);
      const gen = readPartitionWriteGeneration(leader3.db);
      recordCommittedAutocommitRowKeys(
        leader3,
        {sql: INSERT_SQL, params: [`evict-k-${i}`, 'v']},
        gen,
      );
    }

    // 5. Commit txRecB on leader3 after second reopen, rollback recovery, leadership change, and history eviction:
    leader3.controllablePort.commitBatches([commitBCmd], [1]);
    assert.equal(rowCount(leader3, 'rec-k1'), 1);
    assert.equal(rowCount(leader3, 'rec-k2'), 1);
    assert.deepEqual(
      readDurablePartitionSnapshot(leader3.db).decisions.map((d) => d.state),
      ['COMMITTED', 'COMMITTED'],
    );
    // Once all retained PREPARED obligations have settled, cutover admission resumes cleanly:
    await resumeFixtureParticipantAdmission(leader3);
  } finally {
    await shutdownAll(leader1, leader2, leader3);
    fs.rmSync(directory, {recursive: true, force: true});
    clearFixtureSingletons();
  }
});

test('Different primary keys competing for the same secondary UNIQUE value conflict before both receive PREPARE acks', async () => {
  resetFixtureSingletons();
  try {
    await onFixtureLeader(async (leader, proposed) => {
      leader.concurrencyGranularity = 'row-key';
      leader.conflictSettleWaitMs = 50;
      leader.db.exec(`CREATE UNIQUE INDEX idx_${TABLE}_value_unique ON ${TABLE}(value)`);

      const txUqA = identityOf('5'.repeat(32), {sessionId: 'sess-uq-a'});
      const txUqB = identityOf('6'.repeat(32), {sessionId: 'sess-uq-b'});
      assert.equal((await send(leader, beginMessage(txUqA))).success, true);
      assert.equal((await send(leader, beginMessage(txUqB))).success, true);

      assert.equal(
        (await send(leader, queryMessage(txUqA, INSERT_SQL, ['pk-a', 'shared@example.test']))).success,
        true,
      );
      // Competing insert with different PK ('pk-b') but identical secondary UNIQUE value ('shared@example.test')
      // is rejected during staging/prepare before both transactions can acknowledge PREPARE:
      const competingStage = await send(
        leader,
        queryMessage(txUqB, INSERT_SQL, ['pk-b', 'shared@example.test']),
      );
      assert.equal(competingStage.success, false);
      assert.equal(competingStage.failureCode, 'participant_transaction_already_active');

      const prepAPromise = send(leader, prepareMessage(txUqA));
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txUqA.transactionId && isPrepareCommand(entry),
      );
      const prepA = await prepAPromise;
      assert.equal(prepA.success, true);

      // Even after volatile sessions are cleared while txUqA is durably PREPARED,
      // a new transaction attempting to stage/prepare the same secondary UNIQUE value is refused:
      discardParticipantSessions(leader);
      const txUqD = identityOf('8'.repeat(32), {sessionId: 'sess-uq-d'});
      assert.equal((await send(leader, beginMessage(txUqD))).success, true);
      const competingAfterPrepare = await send(
        leader,
        queryMessage(txUqD, INSERT_SQL, ['pk-d', 'shared@example.test']),
      );
      assert.equal(competingAfterPrepare.success, false);
      assert.equal(competingAfterPrepare.failureCode, 'participant_transaction_already_active');

      // Meanwhile, a transaction with a distinct secondary UNIQUE value stages, prepares, and commits concurrently:
      const txUqC = identityOf('7'.repeat(32), {sessionId: 'sess-uq-c'});
      assert.equal((await send(leader, beginMessage(txUqC))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txUqC, INSERT_SQL, ['pk-c', 'distinct@example.test']))).success,
        true,
      );

      const prepCPromise = send(leader, prepareMessage(txUqC));
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txUqC.transactionId && isPrepareCommand(entry),
      );
      const prepC = await prepCPromise;
      assert.equal(prepC.success, true);

      const commitAPromise = send(leader, commitMessage(txUqA, prepA.preparedDigest));
      const commitCPromise = send(leader, commitMessage(txUqC, prepC.preparedDigest));
      const commitACmd = await awaitProposal(
        proposed,
        (entry) => entry.transactionId === txUqA.transactionId && isDecisionCommand(entry),
      );
      const commitCCmd = await awaitProposal(
        proposed,
        (entry) => entry.transactionId === txUqC.transactionId && isDecisionCommand(entry),
      );
      leader.controllablePort.commitBatch([commitACmd, commitCCmd]);
      const [commitA, commitC] = await Promise.all([commitAPromise, commitCPromise]);
      assert.equal(commitA.success, true);
      assert.equal(commitC.success, true);
      assert.equal(rowCount(leader, 'pk-a'), 1);
      assert.equal(rowCount(leader, 'pk-c'), 1);

      // UPDATE on secondary UNIQUE column and DELETE on secondary UNIQUE table reserve the table:
      const txDel = identityOf('9'.repeat(32), {sessionId: 'sess-uq-del'});
      const txIns = identityOf('0'.repeat(32), {sessionId: 'sess-uq-ins'});
      assert.equal((await send(leader, beginMessage(txDel))).success, true);
      assert.equal((await send(leader, beginMessage(txIns))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txDel, `DELETE FROM ${TABLE} WHERE id = ?`, ['pk-a']))).success,
        true,
      );
      const insertDuringUqDelete = await send(
        leader,
        queryMessage(txIns, INSERT_SQL, ['pk-e', 'shared@example.test']),
      );
      assert.equal(insertDuringUqDelete.success, false);
      assert.equal(insertDuringUqDelete.failureCode, 'participant_transaction_already_active');
    });
  } finally {
    clearFixtureSingletons();
  }
});

test('Native three-replica rs-raft participant group converges on disjoint PREPARED commits across differing local state and refuses secondary UNIQUE conflicts', async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'p2-raft-group-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
  const partitionId = 'p2-raft-group';
  const members = [
    ['p2-raft-group-r1', 'node-1'],
    ['p2-raft-group-r2', 'node-2'],
    ['p2-raft-group-r3', 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId,
    members,
    tempPrefix: 'p2-three-replica-',
    serviceOptions: {
      partitionId,
      tableId: TABLE,
      tableName: TABLE,
      replicaId: `${partitionId}-r1`,
      replicaIds: [`${partitionId}-r1`],
      nodeId: 'p2-raft-group-node',
      systemTableCache: new SystemTableCache(),
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'value', type: 'TEXT', unique: true},
        ],
      },
    },
    budgetMs: 8000,
  });
  try {
    for (const service of group.services) {
      service.concurrencyGranularity = 'row-key';
      service.conflictSettleWaitMs = 50;
      service.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${TABLE}_val_uq ON ${TABLE}(value)`);
    }
    await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
    const [leader, follower2, follower3] = group.services;

    const tx1 = identityOf('a'.repeat(32), {partitionId, sessionId: '3r-sess-1'});
    const tx2 = identityOf('b'.repeat(32), {partitionId, sessionId: '3r-sess-2'});
    assert.equal((await send(leader, beginMessage(tx1))).success, true);
    assert.equal((await send(leader, beginMessage(tx2))).success, true);
    assert.equal(
      (await send(leader, queryMessage(tx1, INSERT_SQL, ['3r-k1', 'uq-1@example.test']))).success,
      true,
    );
    assert.equal(
      (await send(leader, queryMessage(tx2, INSERT_SQL, ['3r-k2', 'uq-2@example.test']))).success,
      true,
    );

    const [prep1, prep2] = await Promise.all([
      send(leader, prepareMessage(tx1)),
      send(leader, prepareMessage(tx2)),
    ]);
    assert.equal(prep1.success, true);
    assert.equal(prep2.success, true);

    // Wait for all 3 replicas to durably hold both PREPARED obligations before either decision:
    const bothPreparedOnAll = await group.waitFor(() =>
      group.services.every((svc) => {
        const states = readDurablePartitionSnapshot(svc.db).decisions.map((d) => d.state);
        return states.length === 2 && states.every((s) => s === 'PREPARED');
      }));
    assert.equal(bothPreparedOnAll, true);

    // Give the 3 replicas different disposable local state (wipe follower3's volatile history):
    resetParticipantRowKeyHistory(follower3);

    // Concurrently commit both prepared transactions through real 3-replica rs-raft consensus:
    const [commit1, commit2] = await Promise.all([
      send(leader, commitMessage(tx1, prep1.preparedDigest)),
      send(leader, commitMessage(tx2, prep2.preparedDigest)),
    ]);
    assert.equal(commit1.success, true);
    assert.equal(commit2.success, true);

    const bothCommittedOnAll = await group.waitFor(() =>
      group.services.every((svc) => {
        const states = readDurablePartitionSnapshot(svc.db).decisions.map((d) => d.state);
        return states.length === 2 && states.every((s) => s === 'COMMITTED');
      }));
    assert.equal(bothCommittedOnAll, true);

    const snapLeader = readDurablePartitionSnapshot(leader.db);
    const snapFollower2 = readDurablePartitionSnapshot(follower2.db);
    const snapFollower3 = readDurablePartitionSnapshot(follower3.db);
    assert.deepEqual(snapFollower2, snapLeader);
    assert.deepEqual(snapFollower3, snapLeader);
    assert.equal(snapLeader.userRows.length, 2);

    // Secondary UNIQUE conflict on the 3-replica group cannot obtain two PREPARE acks:
    const tx3 = identityOf('c'.repeat(32), {partitionId, sessionId: '3r-sess-3'});
    const tx4 = identityOf('d'.repeat(32), {partitionId, sessionId: '3r-sess-4'});
    assert.equal((await send(leader, beginMessage(tx3))).success, true);
    assert.equal((await send(leader, beginMessage(tx4))).success, true);
    assert.equal(
      (await send(leader, queryMessage(tx3, INSERT_SQL, ['3r-k3', 'shared-3r@example.test']))).success,
      true,
    );
    const dupStage = await send(
      leader,
      queryMessage(tx4, INSERT_SQL, ['3r-k4', 'shared-3r@example.test']),
    );
    assert.equal(dupStage.success, false);
    assert.equal(dupStage.failureCode, 'participant_transaction_already_active');
  } finally {
    await group.dispose();
    clearFixtureSingletons();
  }
});

test('P2 & P5: contradictory historical PREPARED rows on reopen fence conflicting work and refuse the second COMMIT, caller-input mutation is isolated, and depcruise enforces direct/transitive apply boundaries', async () => {
  resetFixtureSingletons();
  const {directory, dbPath} = temporaryDbPath();
  let leader1 = null;
  let leader2 = null;
  try {
    const started1 = await startLeader({dbPath});
    leader1 = started1.leader;
    leader1.concurrencyGranularity = 'row-key';
    leader1.conflictSettleWaitMs = 50;
    const txHist1 = identityOf('7'.repeat(32), {sessionId: 'hist-sess-1'});
    const txHist2 = identityOf('8'.repeat(32), {sessionId: 'hist-sess-2'});
    const base = generationOf(leader1);
    const prepHist1 = prepareCommandOf(
      txHist1,
      [operationOf({id: 'hist-k1', value: 'contradictory@example.test'})],
      base,
    );
    const prepHist2 = prepareCommandOf(
      txHist2,
      [operationOf({id: 'hist-k2', value: 'contradictory@example.test'})],
      base,
    );
    // Plant two historical PREPARED rows that both claim the same value, then add the
    // secondary UNIQUE index before reopening:
    leader1.controllablePort.commitBatches([prepHist1, prepHist2], [1, 1]);
    leader1.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${TABLE}_val_uq ON ${TABLE}(value)`);
    await shutdownAll(leader1);
    leader1 = null;

    const started2 = await startLeader({
      dbPath,
      generationOrigin: false,
      releaseAdmission: false,
    });
    leader2 = started2.leader;
    leader2.concurrencyGranularity = 'row-key';
    leader2.conflictSettleWaitMs = 50;

    // 1. Committing the first historical PREPARED transaction succeeds, while
    // the contradictory second historical PREPARED transaction is deterministically
    // settled as STATE.REFUSED with commit_base_moved:
    const decisions = [
      commitDecision(txHist1, prepHist1),
      commitDecision(txHist2, prepHist2),
    ];
    leader2.controllablePort.commitBatches(decisions, [2]);
    const snap = readDurablePartitionSnapshot(leader2.db);
    assert.deepEqual(
      snap.decisions.map((d) => ({
        state: d.state,
        refusalCause: d.refusal_cause,
      })),
      [
        {state: 'COMMITTED', refusalCause: null},
        {state: 'REFUSED', refusalCause: 'commit_base_moved'},
      ],
    );
    assert.deepEqual(snap.userRows, [
      {id: 'hist-k1', value: 'contradictory@example.test'},
    ]);

    // 2. P5 caller-owned nested input mutation isolation on buildPrepareCommand:
    const mutableEnvelope = {
      sqliteVersion: '3.45.0',
      sqliteSourceId: 'src-1',
      compileOptionsDigest: 'a'.repeat(64),
      classifierListVersion: 1,
    };
    const builtPrepare = buildPrepareCommand(
      identityOf('e'.repeat(32), {sessionId: 'mut-sess'}),
      {
        operationsText: JSON.stringify([
          {
            sql: INSERT_SQL,
            params: ['mut-k1', 'mut-v1'],
          },
        ]),
        validationText: prepHist1.validationText,
      },
      {
        timestamp: '1000:0:node-1',
        proposedBy: leader2.replicaId,
        proposedAt: 1000,
        executionEnvelope: mutableEnvelope,
      },
    );
    const parsedOps = operationsOf(builtPrepare.operationsText);
    mutableEnvelope.sqliteVersion = 'tampered';
    assert.equal(Object.isFrozen(parsedOps), true);
    assert.equal(Object.isFrozen(parsedOps[0].params), true);
    assert.equal(parsedOps[0].params[0], 'mut-k1');
    assert.equal(builtPrepare.executionEnvelope.sqliteVersion, '3.45.0');

    // 3. P5 dependency-cruiser witness: production apply/decision/store modules pass,
    // and synthetic direct + indirect (reachable: true) forbidden imports fail:
    const prodResult = await cruise(
      [
        'src/partition/partition-participant-transaction-apply.js',
        'src/partition/partition-participant-transaction-store.js',
        'src/partition/partition-placement-admission-decision.js',
      ],
      {ruleSet: depcruiseConfig, validate: true},
    );
    const prodErrors = prodResult.output.summary.violations.filter(
      (v) => v.rule.severity === 'error',
    );
    assert.deepEqual(prodErrors, []);

    const writeSynth = (rel, code) => {
      const full = `${directory}/${rel}`;
      fs.mkdirSync(full.slice(0, full.lastIndexOf('/')), {recursive: true});
      fs.writeFileSync(full, code, 'utf8');
    };
    writeSynth('src/transport/transport-semantic-outcome.js', 'export const x = 1;\n');
    writeSynth('src/time/time-source.js', 'export const now = () => 0;\n');
    writeSynth(
      'src/partition/indirect-bridge.js',
      'import "../time/time-source.js";\nexport const bridge = 1;\n',
    );
    writeSynth(
      'src/partition/partition-participant-transaction-apply.js',
      'import "../transport/transport-semantic-outcome.js";\nexport const apply = 1;\n',
    );
    writeSynth(
      'src/partition/partition-placement-admission-decision.js',
      'import "./indirect-bridge.js";\nexport const decide = 1;\n',
    );
    const negResult = await cruise(['src'], {
      ...depcruiseConfig.options,
      baseDir: directory,
      validate: true,
      ruleSet: {forbidden: depcruiseConfig.forbidden},
    });
    const negRules = negResult.output.summary.violations.map((v) => v.rule.name).sort();
    assert.deepEqual(negRules, [
      'partition-apply-no-transport-cache-or-planner',
      'partition-decision-and-store-no-indirect-nondeterministic-capabilities',
    ]);
  } finally {
    await shutdownAll(leader1, leader2);
    clearFixtureSingletons();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
