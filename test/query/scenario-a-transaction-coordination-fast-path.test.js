import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
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
  beginMessage,
  clearFixtureSingletons,
  identityOf,
  onFixtureLeader,
  queryMessage,
  resetFixtureSingletons,
  send,
} from '../test-helpers/participant-transaction-fixture.js';

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
    await onFixtureLeader(async (leader) => {
      leader.concurrencyGranularity = 'row-key';
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
