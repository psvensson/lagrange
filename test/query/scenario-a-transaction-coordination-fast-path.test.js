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
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  classifyTransactionStatement, getDeterminismClassifierStats,
} from '../../src/partition/partition-transaction-determinism.js';
import {
  discardParticipantSessions, inspectRetainedPreparedObligations, resetParticipantRowKeyHistory,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {cruise} from 'dependency-cruiser';
import depcruiseConfig from '../../dependency-cruiser.config.cjs';
import {
  buildDecisionCommand, buildDecisionRecord, buildPrepareCommand, operationsOf,
} from '../../src/partition/partition-participant-transaction-bytes.js';
import {
  readPartitionWriteGeneration, resolveRetainedPreparedContradictionDisposition,
} from '../../src/partition/partition-participant-transaction-store.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL, ROW, ROW_2, TABLE, V3, applyProposal, awaitProposal, beginMessage,
  clearFixtureSingletons, commitDecision, commitMessage, commitOrdinaryWrite, durableAppliedIndex,
  generationOf, identityOf, isDecisionCommand, isPrepareCommand, onFixtureLeader, operationOf,
  plantAppliedStateFailure, prepareCommandOf, prepareMessage, queryMessage,
  removeAppliedStateFailure, resetFixtureSingletons, resumeFixtureParticipantAdmission,
  resumeFixtureParticipantGroupAdmission, rowCount, send, shutdownAll, startLeader, startReplica,
  temporaryDbPath,
} from '../test-helpers/participant-transaction-fixture.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function buildPrepareEvidence(partitionId) {
  return {preparedDigest: `digest-${partitionId}`.padEnd(64, '0'), prepareIndex: 1, prepareTerm: 1};
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
    0,
    'interactive write statements buffer sql_write_operations outcomes for batch flush at freeze',
  );
  assert.equal(secondMutations.length <= 2, true);
  assert.equal(authoritativeReadCount - readsBeforeSecond, 0);

  const committed = await coordinator.commit('payment-session');
  assert.equal(committed.success, true);

  const writeOpMutations = gateway.mutations.filter(
    (m) => m.tableName === 'sql_write_operations',
  );
  assert.equal(
    writeOpMutations.length,
    1,
    'buffered write operations flush in one UPSERT_BATCH submission at manifest freeze',
  );
  assert.equal(writeOpMutations[0].operation, 'upsert_batch');
  assert.equal(writeOpMutations[0].rows?.length, 2);

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

  const selectSql = 'SELECT 1 AS ok WHERE 1 = $1';
  const descResult = await engine.describeSqlRequest({
    executionMode: 'describe',
    statement: selectSql,
    parameters: [],
    dialect: 'postgresql',
    sessionId: 'payment-session',
  });
  assert.equal(descResult.success, true);
  const cachedReadOnlyAst = engine.parseCache.peekReadOnly(selectSql, 'postgresql');
  assert.equal(Boolean(cachedReadOnlyAst), true);
  const tableSelectSql = 'SELECT id, ytd_cents FROM warehouse WHERE id = $1';
  engine.parseCache.set(
    tableSelectSql,
    'postgresql',
    new SQLParser(tableSelectSql, {dialect: 'postgresql'}).parse(),
  );
  const selectAst = engine.parseCache.get(tableSelectSql, 'postgresql');
  const template1 = engine.distributedQueryPlanner.resolveStructuralTemplate(selectAst);
  const template2 = engine.distributedQueryPlanner.resolveStructuralTemplate(selectAst);
  assert.equal(Boolean(template1), true);
  assert.equal(template1, template2);
  assert.equal(engine.distributedQueryPlanner.structuralTemplates.size >= 1, true);
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

    // Finding 6b: Generate > 1,024 history pressure through actual committed writes on leader3
    // while txRecB remains durably PREPARED, then close and reopen from disk with fresh owners
    // (leader4) before committing txRecB:
    const genBeforePressure = readPartitionWriteGeneration(leader3.db);
    const evictWriteCmds = [];
    for (let i = 0; i < 1030; i += 1) {
      const txEvict = identityOf(
        (i + 100).toString(16).padStart(32, '0'),
        {sessionId: `evict-sess-${i}`},
      );
      const prepEvict = prepareCommandOf(
        txEvict,
        [operationOf({id: `evict-k-${i}`, value: 'v'})],
        genBeforePressure + i,
      );
      evictWriteCmds.push(prepEvict, commitDecision(txEvict, prepEvict));
    }
    leader3.controllablePort.commitBatches(evictWriteCmds, [evictWriteCmds.length]);
    assert.equal(readPartitionWriteGeneration(leader3.db), genBeforePressure + 1030);
    await shutdownAll(leader3);
    leader3 = null;

    const started4 = await startLeader({dbPath, releaseAdmission: false});
    leader3 = started4.leader;
    leader3.concurrencyGranularity = 'row-key';
    leader3.conflictSettleWaitMs = 50;
    discardParticipantSessions(leader3);
    resetParticipantRowKeyHistory(leader3);

    // 5. Commit txRecB on reopened leader4 after > 1,024 committed writes and disk reopen:
    leader3.controllablePort.commitBatches([commitBCmd], [1]);
    assert.equal(rowCount(leader3, 'rec-k1'), 1);
    assert.equal(rowCount(leader3, 'rec-k2'), 1);
    const finalDecisions = readDurablePartitionSnapshot(leader3.db).decisions.filter((d) =>
      [txRecA.participantId, txRecB.participantId].includes(d.participant_id));
    assert.deepEqual(
      finalDecisions.map((d) => d.state),
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
  const gateway = createTransactionPersistenceGateway();
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger: QUIET_LOGGER,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
  });
  try {
    for (const service of group.services) {
      service.concurrencyGranularity = 'row-key';
      service.conflictSettleWaitMs = 50;
      service.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${TABLE}_val_uq ON ${TABLE}(value)`);
    }
    await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
    const [leader, follower2, follower3] = group.services;

    // Finding 6a: Connect the real SQLQueryEngine + DistributedTransactionCoordinator
    // (via deliverTransactionOperation) to the 3-replica native rs-raft participant leader:
    engine.queryExecutor.executeOnPartition = async (
      _pid,
      _sql,
      _params,
      _isWrite,
      _isRead,
      _useCache,
      executionOptions,
    ) => {
      const req = executionOptions.buildRequest();
      const res = await send(leader, req);
      if (executionOptions.isSuccessfulResponse({payload: res})) {
        return {success: true, ...executionOptions.buildSuccessResult()};
      }
      return res;
    };
    const coordinator = engine.transactionCoordinator;
    const origPrepare = coordinator.prepareParticipant.bind(coordinator);
    let preparedCount = 0;
    const bothPreparedGate = Promise.withResolvers();
    const releaseCommitPhase = Promise.withResolvers();
    coordinator.prepareParticipant = async (sessionId, pid, identity) => {
      const evidence = await origPrepare(sessionId, pid, identity);
      preparedCount += 1;
      if (preparedCount === 2) {
        bothPreparedGate.resolve();
      }
      await releaseCommitPhase.promise;
      return evidence;
    };

    const sess1 = '3r-coord-sess-1';
    const sess2 = '3r-coord-sess-2';
    const begun1 = await coordinator.begin(sess1);
    const begun2 = await coordinator.begin(sess2);
    assert.equal(begun1.success, true);
    assert.equal(begun2.success, true);

    await coordinator.executeWriteStatement(
      sess1,
      {operationId: '3r-op-1', sql: INSERT_SQL, partitionIds: [partitionId]},
      async () => {
        const tx1 = identityOf(begun1.transactionId, {
          partitionId,
          sessionId: sess1,
          transactionEpoch: coordinator.getTransaction(sess1).transactionEpoch,
        });
        const staged = await send(leader, queryMessage(tx1, INSERT_SQL, ['3r-k1', 'uq-1@example.test']));
        assert.equal(staged.success, true);
        return {success: true, affectedRows: 1};
      },
    );
    await coordinator.executeWriteStatement(
      sess2,
      {operationId: '3r-op-2', sql: INSERT_SQL, partitionIds: [partitionId]},
      async () => {
        const tx2 = identityOf(begun2.transactionId, {
          partitionId,
          sessionId: sess2,
          transactionEpoch: coordinator.getTransaction(sess2).transactionEpoch,
        });
        const staged = await send(leader, queryMessage(tx2, INSERT_SQL, ['3r-k2', 'uq-2@example.test']));
        assert.equal(staged.success, true);
        return {success: true, affectedRows: 1};
      },
    );

    // Drive both concurrent transactions through real DistributedTransactionCoordinator.commit():
    const commit1Promise = coordinator.commit(sess1);
    const commit2Promise = coordinator.commit(sess2);
    await bothPreparedGate.promise;

    // Wait for all 3 replicas to durably hold both PREPARED obligations before either decision:
    const bothPreparedOnAll = await group.waitFor(() =>
      group.services.every((svc) => {
        const states = readDurablePartitionSnapshot(svc.db).decisions.map((d) => d.state);
        return states.length === 2 && states.every((s) => s === 'PREPARED');
      }));
    assert.equal(bothPreparedOnAll, true);

    // Give the 3 replicas different disposable local state (wipe follower3's volatile history):
    resetParticipantRowKeyHistory(follower3);

    // Release both coordinator commit phases to persist decisions and commit on the 3-replica group:
    releaseCommitPhase.resolve();
    const [commit1, commit2] = await Promise.all([commit1Promise, commit2Promise]);
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

    // Secondary UNIQUE conflict on the 3-replica group driven through the coordinator
    // cannot obtain two PREPARE acks:
    coordinator.prepareParticipant = origPrepare;
    const sess3 = '3r-coord-sess-3';
    const sess4 = '3r-coord-sess-4';
    const begun3 = await coordinator.begin(sess3);
    const begun4 = await coordinator.begin(sess4);
    await coordinator.executeWriteStatement(
      sess3,
      {operationId: '3r-op-3', sql: INSERT_SQL, partitionIds: [partitionId]},
      async () => {
        const tx3 = identityOf(begun3.transactionId, {
          partitionId,
          sessionId: sess3,
          transactionEpoch: coordinator.getTransaction(sess3).transactionEpoch,
        });
        const staged = await send(leader, queryMessage(tx3, INSERT_SQL, ['3r-k3', 'shared-3r@example.test']));
        assert.equal(staged.success, true);
        return {success: true, affectedRows: 1};
      },
    );
    await assert.rejects(
      () =>
        coordinator.executeWriteStatement(
          sess4,
          {operationId: '3r-op-4', sql: INSERT_SQL, partitionIds: [partitionId]},
          async () => {
            const tx4 = identityOf(begun4.transactionId, {
              partitionId,
              sessionId: sess4,
              transactionEpoch: coordinator.getTransaction(sess4).transactionEpoch,
            });
            const dupStage = await send(
              leader,
              queryMessage(tx4, INSERT_SQL, ['3r-k4', 'shared-3r@example.test']),
            );
            assert.equal(dupStage.success, false);
            assert.equal(dupStage.failureCode, 'participant_transaction_already_active');
            throw new Error(dupStage.failureCode);
          },
        ),
      /participant_transaction_already_active/u,
    );
    const commit3 = await coordinator.commit(sess3);
    assert.equal(commit3.success, true);
  } finally {
    await engine.shutdown();
    gateway.db.close();
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

    // 1. Finding 5: Contradictory historical PREPARED rows remain retained in STATE.PREPARED
    // and are surfaced through inspectRetainedPreparedObligations; COMMIT on either contradicted
    // row is refused with HISTORICAL_PREPARED_CONTRADICTION while retaining STATE.PREPARED
    // until an explicit ROLLBACK resolves one of the conflicting obligations:
    const initialInspection = inspectRetainedPreparedObligations(leader2);
    assert.equal(initialInspection.healthy, false);
    assert.deepEqual(
      [...initialInspection.contradictoryParticipantIds].sort(),
      [txHist1.participantId, txHist2.participantId].sort(),
    );

    const refusedCommitPromise = send(
      leader2,
      commitMessage(txHist1, prepHist1.preparedDigest),
    );
    await awaitProposal(
      started2.proposed,
      (entry) => entry.transactionId === txHist1.transactionId && isDecisionCommand(entry),
    );
    const decisions = [
      commitDecision(txHist1, prepHist1),
      commitDecision(txHist2, prepHist2),
    ];
    leader2.controllablePort.commitBatches(decisions, [2]);
    const refusedAfterApply = await refusedCommitPromise;
    assert.equal(refusedAfterApply.success, false);
    assert.equal(
      refusedAfterApply.failureCode,
      PARTICIPANT_TRANSACTION_FAILURE_CODE.HISTORICAL_PREPARED_CONTRADICTION,
    );

    const snapWhileContradicted = readDurablePartitionSnapshot(leader2.db);
    assert.deepEqual(
      snapWhileContradicted.decisions.map((d) => ({
        state: d.state,
        refusalCause: d.refusal_cause,
      })),
      [
        {state: 'PREPARED', refusalCause: null},
        {state: 'PREPARED', refusalCause: null},
      ],
    );
    assert.deepEqual(snapWhileContradicted.userRows, []);

    // Explicit incident disposition against three independent immutable coordinator decision
    // histories (validating decision, decision_text, and decision_digest via canonicalDecisionRecord
    // without ever mutating an already-seeded transaction_id row):
    const createImmutableCoordinatorHistory = (rows) => {
      const gateway = createTransactionPersistenceGateway();
      const seenTxIds = new Set();
      for (const row of rows) {
        assert.equal(seenTxIds.has(row.transaction_id), false);
        seenTxIds.add(row.transaction_id);
        gateway.seed('sql_transactions', row);
      }
      const lookup = (txId) =>
        gateway.db
          .prepare('SELECT * FROM sql_transactions WHERE transaction_id = ?')
          .get(txId) ?? null;
      return {gateway, lookup};
    };
    const remoteSibling1 = `${txHist1.transactionId}:p-remote-2`;
    const remoteSibling2 = `${txHist2.transactionId}:p-remote-2`;
    const canonicalCommitHist1 = buildDecisionRecord(
      txHist1.transactionId, V3.DECISION.COMMIT,
      [[txHist1.participantId, prepHist1.preparedDigest], [remoteSibling1, '9'.repeat(64)]],
    );
    const canonicalCommitHist2 = buildDecisionRecord(
      txHist2.transactionId, V3.DECISION.COMMIT,
      [[txHist2.participantId, prepHist2.preparedDigest]],
    );
    const canonicalRollbackHist2 = buildDecisionRecord(
      txHist2.transactionId, V3.DECISION.ROLLBACK,
      [[txHist2.participantId, prepHist2.preparedDigest], [remoteSibling2, null]],
    );
    const txHist1CommittedRow = {
      transaction_id: txHist1.transactionId, session_id: 'hist-sess-1', status: 'COMMITTED',
      transaction_mode: 'DISTRIBUTED', participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE',
      frozen_participant_count: 2, decision: canonicalCommitHist1.decision,
      decision_text: canonicalCommitHist1.decisionText,
      decision_digest: canonicalCommitHist1.decisionDigest,
      created_at: 1000, updated_at: 1000,
    };

    // History (a): Authoritative evidence is unavailable or incomplete (txHist2 record absent)
    // -> emit no disposition:
    const historyUnavailable = createImmutableCoordinatorHistory([txHist1CommittedRow]);
    const unavailableDisposition = resolveRetainedPreparedContradictionDisposition(
      initialInspection, historyUnavailable.lookup,
    );
    assert.deepEqual(unavailableDisposition, {
      resolvable: false, reason: 'decision_evidence_unavailable', orderedDecisions: [],
    });

    // History (b): Independent immutable coordinator history where both canonical decisions
    // are genuine COMMIT records from the outset -> retain and report the contradiction:
    const historyBothCommitted = createImmutableCoordinatorHistory([
      txHist1CommittedRow,
      {
        transaction_id: txHist2.transactionId, session_id: 'hist-sess-2', status: 'COMMITTED',
        transaction_mode: 'DISTRIBUTED', participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE',
        frozen_participant_count: 1, decision: canonicalCommitHist2.decision,
        decision_text: canonicalCommitHist2.decisionText,
        decision_digest: canonicalCommitHist2.decisionDigest,
        created_at: 1000, updated_at: 1000,
      },
    ]);
    const conflictingCommitDisposition = resolveRetainedPreparedContradictionDisposition(
      initialInspection, historyBothCommitted.lookup,
    );
    assert.deepEqual(conflictingCommitDisposition, {
      resolvable: false, reason: 'conflicting_committed_decisions', orderedDecisions: [],
    });

    // History (c): Independent immutable coordinator history with a genuine multiparticipant
    // ROLLBACK decision record (txHist2) and a genuine multiparticipant COMMIT decision record
    // (txHist1) from the outset -> replay the recorded canonical decision bytes ordered
    // ROLLBACK first, then COMMIT:
    const historyCommitAndRollback = createImmutableCoordinatorHistory([
      txHist1CommittedRow,
      {
        transaction_id: txHist2.transactionId, session_id: 'hist-sess-2', status: 'ABORTED',
        transaction_mode: 'DISTRIBUTED', participant_set_state: 'FROZEN', commit_mode: 'TWO_PHASE',
        frozen_participant_count: 2, decision: canonicalRollbackHist2.decision,
        decision_text: canonicalRollbackHist2.decisionText,
        decision_digest: canonicalRollbackHist2.decisionDigest,
        created_at: 1000, updated_at: 1000,
      },
    ]);
    const disposition = resolveRetainedPreparedContradictionDisposition(
      initialInspection, historyCommitAndRollback.lookup,
    );
    assert.equal(disposition.resolvable, true);
    assert.equal(disposition.reason, null);
    assert.deepEqual(disposition.orderedDecisions, [
      {
        participantId: txHist2.participantId, transactionId: txHist2.transactionId,
        decision: 'ROLLBACK', preparedDigest: prepHist2.preparedDigest,
        decisionText: canonicalRollbackHist2.decisionText,
        decisionDigest: canonicalRollbackHist2.decisionDigest,
      },
      {
        participantId: txHist1.participantId, transactionId: txHist1.transactionId,
        decision: 'COMMIT', preparedDigest: prepHist1.preparedDigest,
        decisionText: canonicalCommitHist1.decisionText,
        decisionDigest: canonicalCommitHist1.decisionDigest,
      },
    ]);
    const preparedByParticipantId = new Map([
      [txHist1.participantId, {identity: txHist1, prep: prepHist1}],
      [txHist2.participantId, {identity: txHist2, prep: prepHist2}],
    ]);
    const dispositionCommands = disposition.orderedDecisions.map((item) => {
      const target = preparedByParticipantId.get(item.participantId);
      return buildDecisionCommand(target.identity, item, {
        executionEnvelope: target.prep.executionEnvelope,
        timestamp: '',
        proposedBy: leader2.replicaId,
        proposedAt: 0,
      });
    });
    leader2.controllablePort.commitBatches(
      dispositionCommands,
      dispositionCommands.map(() => 1),
    );
    const postRollbackInspection = inspectRetainedPreparedObligations(leader2);
    assert.equal(postRollbackInspection.healthy, true);
    assert.deepEqual(postRollbackInspection.contradictoryParticipantIds, []);

    const snap = readDurablePartitionSnapshot(leader2.db);
    const recordedDecisionRows = leader2.db
      .prepare(
        'SELECT state, refusal_cause AS refusalCause, decision_digest AS decisionDigest ' +
        'FROM _participant_transactions ORDER BY participant_id',
      )
      .all();
    assert.deepEqual(recordedDecisionRows, [
      {
        state: 'COMMITTED',
        refusalCause: null,
        decisionDigest: canonicalCommitHist1.decisionDigest,
      },
      {
        state: 'ROLLED_BACK',
        refusalCause: null,
        decisionDigest: canonicalRollbackHist2.decisionDigest,
      },
    ]);
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
    const prodModules = [
      'src/partition/partition-participant-transaction-apply.js',
      'src/partition/partition-participant-transaction-store.js',
      'src/partition/partition-placement-admission-decision.js',
      'src/query/sql-statement-renderer.js', 'src/query/sql-table-definition.js',
      'src/query/sql-value-codec.js', 'src/rebalancer/replica-placement-owner-deficits.js',
      'src/rebalancer/replica-placement-owner-order.js', 'src/rebalancer/placement-owner-decision.js',
      'src/rebalancer/operation-lifecycle.js',
    ];
    const prodResult = await cruise(prodModules, {ruleSet: depcruiseConfig, validate: true});
    const prodErrors = prodResult.output.summary.violations.filter((v) => v.rule.severity === 'error');
    assert.deepEqual(prodErrors, []);

    const writeSynth = (rel, code) => {
      const full = `${directory}/${rel}`;
      fs.mkdirSync(full.slice(0, full.lastIndexOf('/')), {recursive: true});
      fs.writeFileSync(full, code, 'utf8');
    };
    writeSynth('src/transport/transport-semantic-outcome.js', 'export const x = 1;\n');
    writeSynth('src/time/time-source.js', 'export const now = () => 0;\n');
    writeSynth('src/query/distributed/coordinator-merge-process.js', 'export const pool = 1;\n');
    writeSynth('src/partition/indirect-bridge.js', 'import "../time/time-source.js";\nexport const bridge = 1;\n');
    writeSynth('src/partition/partition-participant-transaction-apply.js',
      'import "../transport/transport-semantic-outcome.js";\nexport const apply = 1;\n');
    writeSynth('src/partition/partition-placement-admission-decision.js',
      'import "./indirect-bridge.js";\nexport const decide = 1;\n');
    writeSynth('src/query/sql-statement-renderer.js',
      'import "./distributed/coordinator-merge-process.js";\nexport const render = 1;\n');
    const negResult = await cruise(['src'], {
      ...depcruiseConfig.options, baseDir: directory, validate: true,
      ruleSet: {forbidden: depcruiseConfig.forbidden},
    });
    const negRules = negResult.output.summary.violations.map((v) => v.rule.name).sort();
    assert.deepEqual(negRules, [
      'partition-apply-no-transport-cache-or-planner',
      'partition-decision-and-store-no-indirect-nondeterministic-capabilities',
      'pure-sql-render-and-placement-decision-no-nondeterministic-capabilities',
    ]);
  } finally {
    await shutdownAll(leader1, leader2);
    clearFixtureSingletons();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('P2 (Finding 1): staging leader, session-less followers ([1, 1] and [2]), and reopened replica agree on PREPARE outcome after an ordinary write advances generation following an earlier participant commit', async () => {
  resetFixtureSingletons();
  const {directory, dbPath} = temporaryDbPath();
  let leader = null;
  let followerSep = null;
  let followerBatch = null;
  let reopened = null;
  try {
    const started = await startLeader({dbPath});
    leader = started.leader;
    const proposed = started.proposed;
    followerSep = await startReplica('tx1-v3-r2');
    followerBatch = await startReplica('tx1-v3-r3');
    for (const svc of [leader, followerSep, followerBatch]) {
      svc.concurrencyGranularity = 'row-key';
      svc.conflictSettleWaitMs = 50;
    }

    // 1. Seed row y ('row-y') and commit an earlier participant transaction C on key x ('row-x'):
    const seedWriteY = {
      type: PARTITION_SERVICE_OPERATION.QUERY,
      entryId: 'f1-seed-y',
      sql: INSERT_SQL,
      params: ['row-y', 'v-initial'],
      timestamp: '1000:0:node-1',
      proposedBy: leader.replicaId,
      proposedAt: 1000,
    };
    const txC = identityOf('1'.repeat(32), {sessionId: 'f1-sess-c'});
    const prepC = prepareCommandOf(txC, [operationOf({id: 'row-x', value: 'v-c'})], 1);
    const commitC = commitDecision(txC, prepC);
    for (const svc of [leader, followerSep, followerBatch]) {
      svc.controllablePort.commitBatches([seedWriteY, prepC, commitC], [1, 1, 1]);
    }
    const genN = generationOf(leader);
    assert.equal(genN, 2);

    // 2. On the leader, transaction A stages an UPDATE on row-y:
    const updateSql = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
    const txA = identityOf('2'.repeat(32), {sessionId: 'f1-sess-a'});
    assert.equal((await send(leader, beginMessage(txA))).success, true);
    assert.equal(
      (await send(leader, queryMessage(txA, updateSql, ['v-from-A', 'row-y']))).success,
      true,
    );

    // 3. Ordinary write W(y) is proposed, and PREPARE(A) seals at generation N before W(y) applies:
    const prepAPromise = send(leader, prepareMessage(txA));
    const prepACmd = await awaitProposal(
      proposed,
      (entry) => entry.transactionId === txA.transactionId && isPrepareCommand(entry),
    );
    assert.equal(
      prepACmd.validationText,
      prepareCommandOf(txA, [operationOf({id: 'row-y', value: 'v-from-A'})], genN).validationText,
    );
    const ordinaryWriteY = {
      type: PARTITION_SERVICE_OPERATION.QUERY,
      entryId: 'f1-ordinary-w-y',
      sql: updateSql,
      params: ['v-from-W', 'row-y'],
      timestamp: '1010:0:node-1',
      proposedBy: leader.replicaId,
      proposedAt: 1010,
    };

    // 4. Apply [W(y), PREPARE(A)] on the staging leader (which retains A's local session),
    // on followerSep ([1, 1] with volatile history cleared between W(y) and PREPARE(A)),
    // and on followerBatch ([2] with no local session and cleared volatile history):
    leader.controllablePort.commitBatches([ordinaryWriteY], [1]);
    // Checkpoint WAL and copy disk image after W(y) applied at N+1, before PREPARE(A) applies:
    leader.db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbPath, `${dbPath}.reopen`);
    leader.controllablePort.commitBatches([prepACmd], [1]);
    const prepAResult = await prepAPromise;
    assert.equal(prepAResult.success, false);
    assert.equal(prepAResult.failureCode, 'participant_transaction_prepare_refused');

    followerSep.controllablePort.commitBatches([ordinaryWriteY], [1]);
    discardParticipantSessions(followerSep);
    resetParticipantRowKeyHistory(followerSep);
    followerSep.controllablePort.commitBatches([prepACmd], [1]);

    discardParticipantSessions(followerBatch);
    resetParticipantRowKeyHistory(followerBatch);
    followerBatch.controllablePort.commitBatches([ordinaryWriteY, prepACmd], [2]);

    const startedReopen = await startLeader({
      dbPath: `${dbPath}.reopen`,
      generationOrigin: false,
      releaseAdmission: false,
    });
    reopened = startedReopen.leader;
    reopened.concurrencyGranularity = 'row-key';
    reopened.conflictSettleWaitMs = 50;
    discardParticipantSessions(reopened);
    resetParticipantRowKeyHistory(reopened);
    reopened.controllablePort.commitBatches([prepACmd], [1]);

    const snapLeader = readDurablePartitionSnapshot(leader.db);
    const snapFollowerSep = readDurablePartitionSnapshot(followerSep.db);
    const snapFollowerBatch = readDurablePartitionSnapshot(followerBatch.db);
    const snapReopened = readDurablePartitionSnapshot(reopened.db);
    assert.deepEqual(snapFollowerSep, snapLeader);
    assert.deepEqual(snapFollowerBatch, snapLeader);
    assert.deepEqual(snapReopened, snapLeader);
    assert.deepEqual(
      snapLeader.decisions.map((d) => ({
        participantId: d.participant_id,
        state: d.state,
        refusalCause: d.refusal_cause,
      })),
      [
        {participantId: txC.participantId, state: 'COMMITTED', refusalCause: null},
        {participantId: txA.participantId, state: 'REFUSED', refusalCause: 'conflict'},
      ],
    );
  } finally {
    await shutdownAll(leader, followerSep, followerBatch, reopened);
    clearFixtureSingletons();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('P2 (Review 2 Finding 3): pre-_partition_write_generation_history storage representation (modeled by dropping the history table before reopen) reconstructs exact generation history for retained PREPARED transactions across disjoint participant commits and fail-closes across ordinary writes', async () => {
  resetFixtureSingletons();
  const {directory, dbPath} = temporaryDbPath();
  let leader1 = null;
  let leader2 = null;
  let leader3 = null;
  try {
    const started1 = await startLeader({dbPath});
    leader1 = started1.leader;
    leader1.concurrencyGranularity = 'row-key';
    leader1.conflictSettleWaitMs = 50;

    // 1. Disjoint transactions A (key-a) and B (key-b) both prepare at base generation N:
    const baseGen = generationOf(leader1);
    const txA = identityOf('a'.repeat(32), {sessionId: 'up-sess-a'});
    const txB = identityOf('b'.repeat(32), {sessionId: 'up-sess-b'});
    const prepA = prepareCommandOf(txA, [operationOf({id: 'up-key-a', value: 'val-a'})], baseGen);
    const prepB = prepareCommandOf(txB, [operationOf({id: 'up-key-b', value: 'val-b'})], baseGen);
    const commitA = commitDecision(txA, prepA);
    leader1.controllablePort.commitBatches([prepA, prepB, commitA], [1, 1, 1]);
    assert.equal(generationOf(leader1), baseGen + 1);

    // Convert the database to the exact 114bd420 representation (where
    // _partition_write_generation_history did not exist when A committed at N+1):
    leader1.db.exec('DROP TABLE _partition_write_generation_history');
    await shutdownAll(leader1);
    leader1 = null;

    // 2. Reopen under the current implementation (which creates an empty
    // _partition_write_generation_history table) and deliver B's bound COMMIT decision:
    const started2 = await startLeader({dbPath, generationOrigin: false, releaseAdmission: false});
    leader2 = started2.leader;
    leader2.concurrencyGranularity = 'row-key';
    leader2.conflictSettleWaitMs = 50;
    discardParticipantSessions(leader2);
    resetParticipantRowKeyHistory(leader2);
    const commitB = commitDecision(txB, prepB);
    leader2.controllablePort.commitBatches([commitB], [1]);

    const snapAfterUpgrade = readDurablePartitionSnapshot(leader2.db);
    assert.deepEqual(
      snapAfterUpgrade.decisions.map((d) => ({
        participantId: d.participant_id, state: d.state, refusalCause: d.refusal_cause,
      })),
      [
        {participantId: txA.participantId, state: 'COMMITTED', refusalCause: null},
        {participantId: txB.participantId, state: 'COMMITTED', refusalCause: null},
      ],
    );
    assert.deepEqual(snapAfterUpgrade.userRows, [{id: 'up-key-a', value: 'val-a'}, {id: 'up-key-b', value: 'val-b'}]);

    // 3. Negative control on 114bd420 representation: if generation N+2 was an ordinary
    // write W under 114bd420 (with _partition_write_generation_history empty/missing for N+2),
    // a PREPARE sealed at N+1 before W must fail closed (REFUSED) after reopen:
    const genBeforeW = generationOf(leader2);
    const txD = identityOf('d'.repeat(32), {sessionId: 'up-sess-d'});
    const prepD = prepareCommandOf(txD, [operationOf({id: 'up-key-d', value: 'val-d'})], genBeforeW);
    const ordinaryW = {
      type: PARTITION_SERVICE_OPERATION.QUERY, entryId: 'up-ordinary-w',
      sql: INSERT_SQL, params: ['up-key-w', 'val-w'],
      timestamp: '2000:0:node-1', proposedBy: leader2.replicaId, proposedAt: 2000,
    };
    leader2.controllablePort.commitBatches([ordinaryW], [1]);
    leader2.db.exec('DROP TABLE _partition_write_generation_history');
    await shutdownAll(leader2);
    leader2 = null;

    const started3 = await startLeader({dbPath, generationOrigin: false, releaseAdmission: false});
    leader3 = started3.leader;
    leader3.concurrencyGranularity = 'row-key';
    leader3.conflictSettleWaitMs = 50;
    discardParticipantSessions(leader3);
    resetParticipantRowKeyHistory(leader3);

    leader3.controllablePort.commitBatches([prepD], [1]);
    const snapAfterW = readDurablePartitionSnapshot(leader3.db);
    const dRow = snapAfterW.decisions.find((d) => d.participant_id === txD.participantId);
    assert.deepEqual(
      {state: dRow?.state, refusalCause: dRow?.refusal_cause},
      {state: 'REFUSED', refusalCause: 'conflict'},
    );
  } finally {
    await shutdownAll(leader1, leader2, leader3);
    clearFixtureSingletons();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('Finding 1B: promoted read-only ACTIVE persistence waits for all siblings and CAS-guards against clobbering PREPARED state', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger: QUIET_LOGGER,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
  });
  t.after(() => engine.shutdown());
  const coordinator = engine.transactionCoordinator;
  coordinator.beginParticipant = async () => {};
  coordinator.prepareParticipant = async (_s, pid) => buildPrepareEvidence(pid);
  coordinator.commitParticipant = async () => {};
  coordinator.rollbackParticipant = async () => {};

  const p2Started = Promise.withResolvers();
  const releaseP2 = Promise.withResolvers();
  let failP1 = true;
  let holdP2 = true;
  const origSubmit = gateway.submitMutation.bind(gateway);
  gateway.submitMutation = async (m, opts) => {
    if (m.tableName === 'sql_transaction_participants' && m.row?.status === 'ACTIVE') {
      if (m.row.partition_id === 'p1' && failP1) {
        failP1 = false;
        throw new Error('p1 ACTIVE failed');
      }
      if (m.row.partition_id === 'p2' && holdP2) {
        holdP2 = false;
        p2Started.resolve();
        await releaseP2.promise;
      }
    }
    return origSubmit(m, opts);
  };

  const begun = await coordinator.begin('f1b-fast');
  await coordinator.executeReadStatement('f1b-fast', begun.transactionId, ({enlist}) => enlist(['p1', 'p2']));
  let settled = false;
  const writeP = coordinator.executeWriteStatement(
    'f1b-fast',
    {operationId: 'w-f1b', sql: 'UPDATE t SET v = 1', partitionIds: ['p1', 'p2']},
    async () => ({success: true, affectedRows: 2}),
  ).finally(() => {
    settled = true;
  });
  await p2Started.promise;
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  releaseP2.resolve();
  await assert.rejects(writeP, /p1 ACTIVE failed/u);
  const committed = await coordinator.commit('f1b-fast');
  assert.equal(committed.success, true);
});

test('Review Witness 1: structural plan cache isolates cached templates from caller mutation of returned diagnostics and plan metadata across multi-partition parameter routing', async (t) => {
  const cache = createMockSystemCache(
    [
      {
        table_id: 'warehouse',
        table_name: 'warehouse',
        primaryKey: 'id',
        partition_key_type: 'INTEGER',
        active_partition_version: 1,
        schema_json: JSON.stringify({
          tableName: 'warehouse',
          primaryKey: 'id',
          columns: [
            {name: 'id', type: 'INTEGER', primaryKey: true},
            {name: 'ytd_cents', type: 'INTEGER'},
          ],
        }),
      },
    ],
    [
      {
        partition_id: 'warehouse-p1',
        table_id: 'warehouse',
        table_name: 'warehouse',
        partition_version: 1,
        partition_key_start: null,
        partition_key_end: '50',
        status: 'active',
      },
      {
        partition_id: 'warehouse-p2',
        table_id: 'warehouse',
        table_name: 'warehouse',
        partition_version: 1,
        partition_key_start: '50',
        partition_key_end: null,
        status: 'active',
      },
    ],
  );
  const resolver = new PartitionResolver(cache, QUIET_LOGGER);
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    partitionResolver: resolver,
    logger: QUIET_LOGGER,
    autoStartDistributedTransactionRecovery: false,
  });
  t.after(() => engine.shutdown());
  const routedPartitions = [];
  engine.queryExecutor.executeSelect = async (_ast, partitionIds, params) => {
    routedPartitions.push({partitionIds: [...partitionIds], params: [...params]});
    const id = Number(params[0]);
    return {
      success: true,
      rows: [{id, ytd_cents: id * 100}],
    };
  };

  const sql = 'SELECT id, ytd_cents FROM warehouse WHERE id = $1 LIMIT 5';
  const firstResult = await engine.executeQuery(sql, [10], {
    dialect: 'postgresql',
    sessionId: 'plan-isolation-sess',
  });
  assert.equal(firstResult.success, true);
  assert.deepEqual(firstResult.rows, [{id: 10, ytd_cents: 1000}]);
  assert.deepEqual(firstResult.distributedDiagnostics?.tablePlans?.[0]?.partitions, ['warehouse-p1']);

  // Mutate every exposed structure on firstResult.distributedDiagnostics and firstResult.distributedPlan:
  firstResult.distributedDiagnostics.tableGraph[0].tableName = 'corrupted_table';
  firstResult.distributedDiagnostics.tableGraph.length = 0;
  firstResult.distributedDiagnostics.tablePlans[0].projectedColumns.push('corrupted_col');
  firstResult.distributedDiagnostics.tablePlans[0].projectedColumns.length = 0;
  if (firstResult.distributedDiagnostics.tablePlans[0].localPredicate) {
    firstResult.distributedDiagnostics.tablePlans[0].localPredicate.operator = '!=';
    if (firstResult.distributedDiagnostics.tablePlans[0].localPredicate.right) {
      firstResult.distributedDiagnostics.tablePlans[0].localPredicate.right.index = 99;
    }
  }
  if (firstResult.distributedPlan?.mergePlan) {
    firstResult.distributedPlan.mergePlan.limit = 0;
  }

  // Second execution with the same parameter ($1 = 10 -> warehouse-p1):
  const secondResult = await engine.executeQuery(sql, [10], {
    dialect: 'postgresql',
    sessionId: 'plan-isolation-sess',
  });
  assert.equal(secondResult.success, true);
  assert.deepEqual(secondResult.rows, [{id: 10, ytd_cents: 1000}]);
  assert.equal(secondResult.distributedDiagnostics.tableGraph.length, 1);
  assert.equal(secondResult.distributedDiagnostics.tableGraph[0].tableName, 'warehouse');
  assert.deepEqual(
    secondResult.distributedDiagnostics.tablePlans[0].projectedColumns,
    ['id', 'ytd_cents'],
  );
  assert.deepEqual(secondResult.distributedDiagnostics.tablePlans[0].partitions, ['warehouse-p1']);

  // Third execution with a parameter routing to the second partition ($1 = 75 -> warehouse-p2):
  const thirdResult = await engine.executeQuery(sql, [75], {
    dialect: 'postgresql',
    sessionId: 'plan-isolation-sess',
  });
  assert.equal(thirdResult.success, true);
  assert.deepEqual(thirdResult.rows, [{id: 75, ytd_cents: 7500}]);
  assert.deepEqual(thirdResult.distributedDiagnostics.tablePlans[0].partitions, ['warehouse-p2']);
  assert.deepEqual(
    routedPartitions.map((entry) => entry.partitionIds),
    [['warehouse-p1'], ['warehouse-p1'], ['warehouse-p2']],
  );
});

test('Review Witness 2: write-operation batching flushes intermediate UPSERT_BATCH at MAX_BUFFERED_WRITE_OPERATION_ROWS = 32 and flushes remaining rows at manifest freeze', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger: QUIET_LOGGER,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
  });
  t.after(() => engine.shutdown());
  const coordinator = engine.transactionCoordinator;
  coordinator.beginParticipant = async () => {};
  coordinator.prepareParticipant = async (_s, pid) => buildPrepareEvidence(pid);
  coordinator.commitParticipant = async () => {};

  const begun = await coordinator.begin('batch-threshold-session');
  assert.equal(begun.success, true);

  for (let i = 1; i <= 35; i += 1) {
    const res = await coordinator.executeWriteStatement(
      'batch-threshold-session',
      {
        operationId: `batch-op-${i}`,
        sql: 'UPDATE stock SET quantity = quantity - 1 WHERE item_id = ?',
        partitionIds: ['stock-p1'],
      },
      async () => ({success: true, affectedRows: 1}),
    );
    assert.equal(res.success, true);
  }

  const midWriteBatches = gateway.mutations.filter(
    (m) => m.tableName === 'sql_write_operations' && m.operation === 'upsert_batch',
  );
  assert.equal(
    midWriteBatches.length,
    1,
    'reaching 32 buffered write operations must flush one intermediate upsert_batch during interactive writes',
  );
  assert.equal(midWriteBatches[0].rows.length, 32);

  const committed = await coordinator.commit('batch-threshold-session');
  assert.equal(committed.success, true);

  const allWriteBatches = gateway.mutations.filter(
    (m) => m.tableName === 'sql_write_operations' && m.operation === 'upsert_batch',
  );
  assert.equal(allWriteBatches.length, 2);
  assert.equal(allWriteBatches[0].rows.length, 32);
  assert.equal(allWriteBatches[1].rows.length, 3);
  assert.equal(gateway.rows('sql_write_operations').length, 35);
});

test('Review Witness 3: production-default shorter conflict wait (600 ms with staged writes) expires boundedly, rolls back cleanly, and lets subsequent transactions progress', async () => {
  resetFixtureSingletons();
  try {
    await onFixtureLeader(async (leader, proposed) => {
      leader.concurrencyGranularity = 'row-key';
      leader.cdcIntegrationService = {};
      // Leave conflictSettleWaitMs unset so production defaults (600 ms with staged writes) govern:
      delete leader.conflictSettleWaitMs;

      const txHolder = identityOf('1'.repeat(32), {sessionId: 'holder-sess'});
      const txContender = identityOf('2'.repeat(32), {sessionId: 'contender-sess'});

      assert.equal((await send(leader, beginMessage(txHolder))).success, true);
      assert.equal((await send(leader, beginMessage(txContender))).success, true);

      // txHolder locks key 'shared-k'; txContender stages a write on 'own-k' first (so stagedWriteCount > 0):
      assert.equal((await send(leader, queryMessage(txHolder, INSERT_SQL, ['shared-k', 'v-holder']))).success, true);
      assert.equal((await send(leader, queryMessage(txContender, INSERT_SQL, ['own-k', 'v-own']))).success, true);

      const t0 = performance.now();
      const conflictReply = await send(leader, queryMessage(txContender, INSERT_SQL, ['shared-k', 'v-contend']));
      const elapsedMs = performance.now() - t0;

      assert.equal(conflictReply.success, false);
      assert.equal(
        conflictReply.failureCode,
        PARTICIPANT_TRANSACTION_FAILURE_CODE.ALREADY_ACTIVE,
      );
      assert.equal(
        elapsedMs >= 500 && elapsedMs < 1800,
        true,
        `expected staged-write production default conflict wait (~600 ms), observed ${Math.round(elapsedMs)} ms`,
      );

      // Roll back txContender cleanly, commit txHolder, and verify a subsequent transaction on contender-sess commits:
      const rbContender = await send(leader, {
        ...beginMessage(txContender),
        operation: 'ROLLBACK',
      });
      assert.equal(rbContender.success, true);

      const prepHolderP = send(leader, prepareMessage(txHolder));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === txHolder.transactionId && isPrepareCommand(entry));
      const prepHolder = await prepHolderP;
      assert.equal(prepHolder.success, true);

      const commitHolderP = send(leader, commitMessage(txHolder, prepHolder.preparedDigest));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === txHolder.transactionId && isDecisionCommand(entry));
      assert.equal((await commitHolderP).success, true);

      const txRetry = identityOf('3'.repeat(32), {sessionId: 'contender-sess'});
      assert.equal((await send(leader, beginMessage(txRetry))).success, true);
      assert.equal((await send(leader, queryMessage(txRetry, INSERT_SQL, ['own-k', 'v-retry']))).success, true);
      const prepRetryP = send(leader, prepareMessage(txRetry));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === txRetry.transactionId && isPrepareCommand(entry));
      const prepRetry = await prepRetryP;
      assert.equal(prepRetry.success, true);
      const commitRetryP = send(leader, commitMessage(txRetry, prepRetry.preparedDigest));
      await applyProposal(leader, proposed,
        (entry) => entry.transactionId === txRetry.transactionId && isDecisionCommand(entry));
      assert.equal((await commitRetryP).success, true);
    });
  } finally {
    clearFixtureSingletons();
  }
});

test('Review Witness 4: BEGIN retries CUTOVER_PAUSED deferral and same-connection ROLLBACK recovers after transient sql_transactions freeze failure', async (t) => {
  const gateway = createTransactionPersistenceGateway();
  t.after(() => gateway.db.close());
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    logger: QUIET_LOGGER,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
  });
  t.after(() => engine.shutdown());
  const coordinator = engine.transactionCoordinator;
  coordinator.participantRetryBaseDelayMs = 5;
  coordinator.participantRetryMaxDelayMs = 20;

  // 1. Cutover-paused BEGIN (deferRetry: true) is retried during enlistment:
  let itemBeginAttempts = 0;
  const rolledBackParticipants = [];
  coordinator.beginParticipant = async (_s, partitionId, identity) => {
    if (partitionId === 'item-p1') {
      itemBeginAttempts += 1;
      if (itemBeginAttempts === 1) {
        const cutoverErr = new Error('Participant transaction cutover is paused');
        cutoverErr.failureCode = PARTICIPANT_TRANSACTION_FAILURE_CODE.CUTOVER_PAUSED;
        cutoverErr.deferRetry = true;
        throw cutoverErr;
      }
    }
    return {success: true, transactionId: identity.transactionId};
  };
  coordinator.prepareParticipant = async (_s, pid) => buildPrepareEvidence(pid);
  coordinator.commitParticipant = async () => ({success: true});
  coordinator.rollbackParticipant = async (_s, partitionId, request) => {
    rolledBackParticipants.push({
      partitionId,
      transactionId: request.transactionId,
      participantId: request.participantId,
    });
    return {success: true, state: 'ROLLED_BACK', outcome: 'NOT_COMMITTED'};
  };

  const sessionId = 'pgwire-worker-conn-1';
  const tx1 = await coordinator.begin(sessionId);
  assert.equal(tx1.success, true);

  const readRes = await coordinator.executeReadStatement(
    sessionId,
    tx1.transactionId,
    async ({enlist}) => enlist(['item-p1']),
  );
  assert.equal(readRes.success, true);
  assert.equal(itemBeginAttempts, 2, 'read-only BEGIN must retry transient CUTOVER_PAUSED deferral');

  const writeRes = await coordinator.executeWriteStatement(
    sessionId,
    {
      operationId: 'w-stock-1',
      sql: 'UPDATE stock SET quantity = quantity - 1 WHERE id = 1',
      partitionIds: ['stock-p1'],
    },
    async () => ({success: true, affectedRows: 1}),
  );
  assert.equal(writeRes.success, true);

  // 2. Simulate transient sql_transactions freeze failure during ROLLBACK (e.g. sql_transactions-p1 in cutover):
  let failFreezeOnce = true;
  const origPersistSet = coordinator.persistTransactionParticipantSet.bind(coordinator);
  coordinator.persistTransactionParticipantSet = async (record, previousText) => {
    if (failFreezeOnce && record.participantSetState === 'FROZEN') {
      failFreezeOnce = false;
      throw new Error('Control-plane mutation timed out after 30000ms (table=sql_transactions)');
    }
    return origPersistSet(record, previousText);
  };

  await assert.rejects(
    coordinator.rollback(sessionId),
    /timed out after 30000ms/u,
  );
  assert.equal(
    coordinator.recoveredTransactionIds.has(tx1.transactionId),
    true,
    'failed freeze enrolls transactionId in authoritative recovery',
  );

  // 3. While sql_transactions authoritative read is unavailable, same-connection ROLLBACK fails closed (in doubt):
  const origReadAuth = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async () => ({success: false, error: 'cutover paused'});
  const heldRollback = await coordinator.rollback(sessionId);
  assert.equal(heldRollback.success, false);
  assert.equal(heldRollback.errorCode, 'TRANSACTION_DECISION_IN_DOUBT');
  assert.equal(rolledBackParticipants.length, 0, 'no participant ROLLBACK before authoritative read succeeds');

  // 4. Once sql_transactions-p1 cutover completes, retrying ROLLBACK on the same connection
  // validates authority, freezes, records ROLLBACK, rolls back stock-p1 with exact identity, and releases the session:
  gateway.readAuthoritativeRows = origReadAuth;
  const recoveredRollback = await coordinator.rollback(sessionId);
  assert.equal(recoveredRollback.success, true);
  assert.equal(recoveredRollback.transactionId, tx1.transactionId);
  assert.equal(
    rolledBackParticipants.some(
      (p) =>
        p.partitionId === 'stock-p1' &&
        p.transactionId === tx1.transactionId &&
        p.participantId === `${tx1.transactionId}:stock-p1`,
    ),
    true,
    'participant ROLLBACK preserves exact transaction and participant identities',
  );
  assert.equal(coordinator.hasActiveTransaction(sessionId), false);

  // 5. Useful work (BEGIN -> Write -> COMMIT) immediately succeeds on the same session/connection:
  const tx2 = await coordinator.begin(sessionId);
  assert.equal(tx2.success, true);
  assert.notEqual(tx2.transactionId, tx1.transactionId);
  const write2 = await coordinator.executeWriteStatement(
    sessionId,
    {
      operationId: 'w-stock-2',
      sql: 'UPDATE stock SET quantity = quantity - 1 WHERE id = 2',
      partitionIds: ['stock-p1'],
    },
    async () => ({success: true, affectedRows: 1}),
  );
  assert.equal(write2.success, true);
  const commit2 = await coordinator.commit(sessionId);
  assert.equal(commit2.success, true);
  assert.equal(commit2.transactionId, tx2.transactionId);
});
