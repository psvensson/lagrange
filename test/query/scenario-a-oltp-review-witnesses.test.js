import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL, applyProposal, beginMessage, clearFixtureSingletons,
  commitMessage, identityOf, isDecisionCommand, isPrepareCommand,
  onFixtureLeader, prepareMessage, queryMessage, resetFixtureSingletons, send,
} from '../test-helpers/participant-transaction-fixture.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';

const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function buildPrepareEvidence(partitionId) {
  return {
    preparedDigest: `digest-${partitionId}`.padEnd(64, '0'),
    prepareIndex: 1,
    prepareTerm: 1,
  };
}

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
  assert.deepEqual(
    firstResult.distributedDiagnostics?.tablePlans?.[0]?.partitions,
    ['warehouse-p1'],
  );

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
  assert.deepEqual(
    secondResult.distributedDiagnostics.tablePlans[0].partitions,
    ['warehouse-p1'],
  );

  // Third execution with a parameter routing to the second partition ($1 = 75 -> warehouse-p2):
  const thirdResult = await engine.executeQuery(sql, [75], {
    dialect: 'postgresql',
    sessionId: 'plan-isolation-sess',
  });
  assert.equal(thirdResult.success, true);
  assert.deepEqual(thirdResult.rows, [{id: 75, ytd_cents: 7500}]);
  assert.deepEqual(
    thirdResult.distributedDiagnostics.tablePlans[0].partitions,
    ['warehouse-p2'],
  );
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
      assert.equal(
        (await send(leader, queryMessage(txHolder, INSERT_SQL, ['shared-k', 'v-holder']))).success,
        true,
      );
      assert.equal(
        (await send(leader, queryMessage(txContender, INSERT_SQL, ['own-k', 'v-own']))).success,
        true,
      );

      const t0 = performance.now();
      const conflictReply = await send(
        leader,
        queryMessage(txContender, INSERT_SQL, ['shared-k', 'v-contend']),
      );
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
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txHolder.transactionId && isPrepareCommand(entry),
      );
      const prepHolder = await prepHolderP;
      assert.equal(prepHolder.success, true);

      const commitHolderP = send(leader, commitMessage(txHolder, prepHolder.preparedDigest));
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txHolder.transactionId && isDecisionCommand(entry),
      );
      assert.equal((await commitHolderP).success, true);

      const txRetry = identityOf('3'.repeat(32), {sessionId: 'contender-sess'});
      assert.equal((await send(leader, beginMessage(txRetry))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txRetry, INSERT_SQL, ['own-k', 'v-retry']))).success,
        true,
      );
      const prepRetryP = send(leader, prepareMessage(txRetry));
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txRetry.transactionId && isPrepareCommand(entry),
      );
      const prepRetry = await prepRetryP;
      assert.equal(prepRetry.success, true);
      const commitRetryP = send(leader, commitMessage(txRetry, prepRetry.preparedDigest));
      await applyProposal(
        leader,
        proposed,
        (entry) => entry.transactionId === txRetry.transactionId && isDecisionCommand(entry),
      );
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
  assert.equal(
    itemBeginAttempts,
    2,
    'read-only BEGIN must retry transient CUTOVER_PAUSED deferral',
  );

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
  assert.equal(
    rolledBackParticipants.length,
    0,
    'no participant ROLLBACK before authoritative read succeeds',
  );

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
