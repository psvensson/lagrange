import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  executeLockingReadReservations,
} from '../../src/query/sql-locking-read-execution.js';
import {
  clearAllReservations,
  getTransactionReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  RaftRsDurableStore,
} from '../../src/raft/raft-rs-durable-store.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL,
  TABLE,
  V3,
  beginMessage,
  bindingOf,
  clearFixtureSingletons,
  commitMessage,
  identityOf,
  onFixtureLeader,
  prepareMessage,
  queryMessage,
  resetFixtureSingletons,
  send,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  findParticipantSession,
  getRetainedRowKeyHistoryStats,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  extractStatementWriteFootprint,
} from '../../src/partition/partition-write-footprint-contract.js';

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

test('Scenario A deep-stack: Workstream 1 locking-read parameter propagation and split-PK tuple resolution', async (t) => {
  clearAllReservations();
  t.after(() => clearAllReservations());

  let fallbackSelectCalls = 0;
  let lastFallbackAst = null;
  let lastFallbackParams = null;

  const mockEngine = {
    getTableInfo(tableName) {
      if (tableName === 'stock') {
        return {
          table_name: 'stock',
          primary_key: 'warehouse_id,item_id',
          schema_json: JSON.stringify({
            primaryKey: ['warehouse_id', 'item_id'],
          }),
        };
      }
      if (tableName === 'new_order') {
        return {
          table_name: 'new_order',
          primary_key: 'warehouse_id,district_id,order_id',
          schema_json: JSON.stringify({
            primaryKey: ['warehouse_id', 'district_id', 'order_id'],
          }),
        };
      }
      if (tableName === 'order_line') {
        return {
          table_name: 'order_line',
          primary_key: 'warehouse_id,district_id,order_id,line_number',
          schema_json: JSON.stringify({
            primaryKey: ['warehouse_id', 'district_id', 'order_id', 'line_number'],
          }),
        };
      }
      return null;
    },
    getTablePartitions(tableName) {
      return [{partition_id: `${tableName}-p1`}];
    },
    queryExecutor: {
      async executeSelect(ast, _partitions, params) {
        fallbackSelectCalls += 1;
        lastFallbackAst = ast;
        lastFallbackParams = params;
        return {
          success: true,
          rows: [{warehouse_id: 1, district_id: 2, order_id: 3001, line_number: 1}],
        };
      },
    },
  };

  // 1. Full PK in WHERE, non-PK in SELECT projection (STOCK_QUANTITY_FOR_UPDATE)
  const stockAst = {
    type: 'SELECT',
    locking: {strength: 'UPDATE'},
    columns: [{type: 'column_ref', column: 'quantity'}],
    from: {type: 'table', name: 'stock'},
    where: {
      type: 'binary',
      operator: 'AND',
      left: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'warehouse_id'},
        right: {type: 'parameter', index: 0},
      },
      right: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'item_id'},
        right: {type: 'parameter', index: 1},
      },
    },
  };
  const txStock = 'a'.repeat(32);
  const stockRes = await executeLockingReadReservations({
    engine: mockEngine,
    ast: stockAst,
    params: [1, 42],
    sessionId: 'sess-stock',
    transactionRead: {identity: {transactionId: txStock}},
    selectResult: {
      success: true,
      rows: [{quantity: 99}],
      partitions: ['stock-p1'],
    },
  });
  assert.equal(stockRes.success, true);
  assert.equal(fallbackSelectCalls, 0);
  assert.equal(getTransactionReservations(txStock).length, 1);

  // 2. Split PK across WHERE (warehouse_id, district_id) and SELECT row (order_id)
  const newOrderAst = {
    type: 'SELECT',
    locking: {strength: 'UPDATE'},
    columns: [{type: 'column_ref', column: 'order_id'}],
    from: {type: 'table', name: 'new_order'},
    where: {
      type: 'binary',
      operator: 'AND',
      left: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'warehouse_id'},
        right: {type: 'parameter', index: 0},
      },
      right: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'district_id'},
        right: {type: 'parameter', index: 1},
      },
    },
    orderBy: [{column: 'order_id', direction: 'ASC'}],
    limit: 1,
  };
  const txNewOrder = 'b'.repeat(32);
  const newOrderRes = await executeLockingReadReservations({
    engine: mockEngine,
    ast: newOrderAst,
    params: [1, 2],
    sessionId: 'sess-no',
    transactionRead: {identity: {transactionId: txNewOrder}},
    selectResult: {
      success: true,
      rows: [{order_id: 3001}],
      partitions: ['new_order-p1'],
    },
  });
  assert.equal(newOrderRes.success, true);
  assert.equal(fallbackSelectCalls, 0);
  assert.equal(getTransactionReservations(txNewOrder).length, 1);

  // 3. Fallback query when a PK column (line_number) is neither in WHERE nor in SELECT
  const orderLineAst = {
    type: 'SELECT',
    locking: {strength: 'UPDATE'},
    columns: [{type: 'column_ref', column: 'amount_cents'}],
    from: {type: 'table', name: 'order_line'},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'order_id'},
      right: {type: 'parameter', index: 0},
    },
    orderBy: [{column: 'line_number', direction: 'ASC'}],
    limit: 5,
  };
  const txOrderLine = 'c'.repeat(32);
  const orderLineRes = await executeLockingReadReservations({
    engine: mockEngine,
    ast: orderLineAst,
    params: [3001],
    sessionId: 'sess-ol',
    transactionRead: {identity: {transactionId: txOrderLine}},
    selectResult: {
      success: true,
      rows: [{amount_cents: 500}],
      partitions: ['order_line-p1'],
    },
  });
  assert.equal(orderLineRes.success, true);
  assert.equal(fallbackSelectCalls, 1);
  assert.deepEqual(lastFallbackParams, [3001]);
  assert.deepEqual(lastFallbackAst.orderBy, [{column: 'line_number', direction: 'ASC'}]);
  assert.equal(lastFallbackAst.limit, 5);
});

test('Scenario A deep-stack: Workstream 2 coordinator participant-set deduplication and transient participant status skip', async (t) => {
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
  coordinator.prepareParticipant = async (_s, partitionId) => buildPrepareEvidence(partitionId);
  coordinator.commitParticipant = async () => {};

  const begun = await coordinator.begin('ws2-tx');
  assert.equal(begun.success, true);

  await coordinator.enlistParticipants('ws2-tx', ['p1', 'p2']);
  const beforeRepeat = gateway.mutations.length;
  await coordinator.enlistParticipants('ws2-tx', ['p1']);
  await coordinator.enlistParticipants('ws2-tx', ['p2']);
  await coordinator.enlistParticipants('ws2-tx', ['p1', 'p2']);
  assert.equal(gateway.mutations.length - beforeRepeat, 0);

  const beforeCommit = gateway.mutations.length;
  const committed = await coordinator.commit('ws2-tx');
  assert.equal(committed.success, true);

  const commitMutations = gateway.mutations.slice(beforeCommit);
  const transientParticipantWrites = commitMutations.filter(
    (m) =>
      m.tableName === 'sql_transaction_participants' &&
      (m.row?.status === 'PREPARING' ||
        m.row?.status === 'COMMITTING' ||
        m.row?.status === 'ROLLING_BACK'),
  );
  assert.equal(transientParticipantWrites.length, 0);

  const breakdown = coordinator.getLastTransactionBreakdown(begun.transactionId);
  assert.equal(breakdown.skippedParticipantSetMutations >= 3, true);
});

test('Scenario A deep-stack: Workstreams 3, 4, and 5 Raft batch telemetry, canonical UPDATE row-key concurrency, and O(1) disjoint staging', async () => {
  const db = new Database(':memory:');
  const store = new RaftRsDurableStore(db);
  try {
    store.persistReady('g-1', {
      entries: [
        {index: '1', term: '1', entryType: 0, data: null},
        {index: '2', term: '1', entryType: 0, data: null},
      ],
      mustSync: true,
    });
    const stats = store.getDurableSyncStats();
    assert.equal(stats.batchedEntryCount >= 2, true);
    assert.equal(stats.multiEntryReadyCount >= 1, true);
  } finally {
    store.close();
  }

  resetFixtureSingletons();
  try {
    await onFixtureLeader(async (leader) => {
      leader.concurrencyGranularity = 'row-key';
      leader.controllablePort.setProposeHandler(async (entry) => {
        leader.controllablePort.commit(entry);
      });
      const seedTx = identityOf('d'.repeat(32), {sessionId: 'seed-sess'});
      assert.equal((await send(leader, beginMessage(seedTx))).success, true);
      for (let i = 1; i <= 4; i += 1) {
        assert.equal(
          (await send(leader, queryMessage(seedTx, INSERT_SQL, [`k-${i}`, `v-${i}`]))).success,
          true,
        );
      }
      const replayStats = leader.getStagingReplayStats();
      assert.equal(replayStats.disjointDirectValidations >= 3, true);

      const seedPrep = await send(leader, prepareMessage(seedTx));
      assert.equal(seedPrep.success, true);
      const seedCommit = await send(
        leader,
        commitMessage(seedTx, seedPrep.preparedDigest),
      );
      assert.equal(seedCommit.success, true);

      const tx1 = identityOf('e'.repeat(32), {sessionId: 'u-sess-1'});
      const tx2 = identityOf('f'.repeat(32), {sessionId: 'u-sess-2'});
      assert.equal((await send(leader, beginMessage(tx1))).success, true);
      assert.equal((await send(leader, beginMessage(tx2))).success, true);

      const updateSql = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
      const stage1 = await send(
        leader,
        queryMessage(tx1, updateSql, ['shared-val', 'k-1']),
      );
      const stage2 = await send(
        leader,
        queryMessage(tx2, updateSql, ['shared-val', 'k-2']),
      );
      assert.equal(stage1.success, true);
      assert.equal(stage2.success, true);

      const prep1 = await send(leader, prepareMessage(tx1));
      assert.equal(prep1.success, true);
      const commit1 = await send(
        leader,
        commitMessage(tx1, prep1.preparedDigest),
      );
      assert.equal(commit1.success, true);

      const prep2 = await send(leader, prepareMessage(tx2));
      assert.equal(prep2.success, true);
      const commit2 = await send(
        leader,
        commitMessage(tx2, prep2.preparedDigest),
      );
      assert.equal(commit2.success, true);

      // Prepared rollback cleans up PREPARED_PARTICIPANT_ROW_KEYS so a subsequent
      // transaction on k-1 can still advance generationBase across a disjoint k-2 commit.
      const txRb = identityOf('1'.repeat(32), {sessionId: 'rb-sess'});
      assert.equal((await send(leader, beginMessage(txRb))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txRb, updateSql, ['rb-val', 'k-1']))).success,
        true,
      );
      const prepRb = await send(leader, prepareMessage(txRb));
      assert.equal(prepRb.success, true);
      const rbDecision = txMessage(
        PARTITION_SERVICE_OPERATION.ROLLBACK,
        txRb,
        bindingOf(txRb, V3.DECISION.ROLLBACK, prepRb.preparedDigest),
      );
      assert.equal((await send(leader, rbDecision)).success, true);

      const txAfter1 = identityOf('2'.repeat(32), {sessionId: 'after-sess-1'});
      const txAfter2 = identityOf('3'.repeat(32), {sessionId: 'after-sess-2'});
      assert.equal((await send(leader, beginMessage(txAfter1))).success, true);
      assert.equal((await send(leader, beginMessage(txAfter2))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txAfter1, updateSql, ['after-k2', 'k-2']))).success,
        true,
      );
      assert.equal(
        (await send(leader, queryMessage(txAfter2, updateSql, ['after-k1', 'k-1']))).success,
        true,
      );
      const prepAfter1 = await send(leader, prepareMessage(txAfter1));
      assert.equal(prepAfter1.success, true);
      assert.equal(
        (await send(leader, commitMessage(txAfter1, prepAfter1.preparedDigest))).success,
        true,
      );
      const prepAfter2 = await send(leader, prepareMessage(txAfter2));
      assert.equal(prepAfter2.success, true);
      assert.equal(
        (await send(leader, commitMessage(txAfter2, prepAfter2.preparedDigest))).success,
        true,
      );

      // Overlapping row-key conflict refusal and same-row / SELECT replay (Constraint 3)
      const txC1 = identityOf('4'.repeat(32), {sessionId: 'c-sess-1'});
      const txC2 = identityOf('5'.repeat(32), {sessionId: 'c-sess-2'});
      assert.equal((await send(leader, beginMessage(txC1))).success, true);
      assert.equal((await send(leader, beginMessage(txC2))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txC1, updateSql, ['c1-v1', 'k-1']))).success,
        true,
      );
      const conflictStage = await send(
        leader,
        queryMessage(txC2, updateSql, ['c2-v1', 'k-1']),
      );
      assert.equal(conflictStage.success, false);
      await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, txC2));

      const statsBeforeSameRow = leader.getStagingReplayStats();
      assert.equal(
        (await send(leader, queryMessage(txC1, updateSql, ['c1-v2', 'k-1']))).success,
        true,
      );
      const selectSql = `SELECT value FROM ${TABLE} WHERE id = ?`;
      const selectRes = await send(leader, queryMessage(txC1, selectSql, ['k-1']));
      assert.equal(selectRes.success, true);
      assert.equal(selectRes.rows?.[0]?.value, 'c1-v2');
      const statsAfterSameRow = leader.getStagingReplayStats();
      assert.equal(
        statsAfterSameRow.disjointDirectValidations,
        statsBeforeSameRow.disjointDirectValidations,
      );
      assert.equal(
        statsAfterSameRow.fastReplayedOperations >= statsBeforeSameRow.fastReplayedOperations + 3,
        true,
      );
      const prepC1 = await send(leader, prepareMessage(txC1));
      assert.equal(prepC1.success, true);
      assert.equal(
        (await send(leader, commitMessage(txC1, prepC1.preparedDigest))).success,
        true,
      );

      // 4. OR update (WHERE id = ? OR id = ?) records BOTH k-1 and k-2, refuses a concurrent
      // transaction touching k-1, and prevents generation advancement across an overlapping OR commit!
      const txOr1 = identityOf('6'.repeat(32), {sessionId: 'or-sess-1'});
      const txOr2 = identityOf('7'.repeat(32), {sessionId: 'or-sess-2'});
      assert.equal((await send(leader, beginMessage(txOr1))).success, true);
      assert.equal((await send(leader, beginMessage(txOr2))).success, true);

      const orUpdateSql = `UPDATE ${TABLE} SET value = ? WHERE id = ? OR id = ?`;
      assert.equal(
        (await send(leader, queryMessage(txOr1, orUpdateSql, ['or-val-1', 'k-1', 'k-2']))).success,
        true,
      );
      // Concurrent write to k-1 while txOr1 holds both k-1 and k-2 must be refused!
      const conflictOnK1 = await send(
        leader,
        queryMessage(txOr2, updateSql, ['try-k1', 'k-1']),
      );
      assert.equal(conflictOnK1.success, false);
      // Concurrent write to k-3 (disjoint from {k-1, k-2}) succeeds!
      assert.equal(
        (await send(leader, queryMessage(txOr2, updateSql, ['ok-k3', 'k-3']))).success,
        true,
      );

      // Now open txOrOverlap BEFORE txOr1 commits, touching k-4 first, or open txOr3 before
      // another OR commit on (k-2, k-3) so txOr2 (which touched k-3 at earlier generationBase)
      // cannot advance generationBase across an overlapping OR commit!
      const prepOr1 = await send(leader, prepareMessage(txOr1));
      assert.equal(prepOr1.success, true);
      assert.equal(
        (await send(leader, commitMessage(txOr1, prepOr1.preparedDigest))).success,
        true,
      );
      // While txOr2 is still active at an older generationBase, retained history holds txOr1's commit:
      const statsWhileActive = getRetainedRowKeyHistoryStats(leader);
      assert.equal(statsWhileActive.scopedGenerationCount > 0, true);
      assert.equal(statsWhileActive.committedRowKeyCount >= 2, true);

      // txOr2 touched k-3, which is disjoint from txOr1's {k-1, k-2}, so txOr2 can prepare & commit:
      const prepOr2 = await send(leader, prepareMessage(txOr2));
      assert.equal(prepOr2.success, true);
      assert.equal(
        (await send(leader, commitMessage(txOr2, prepOr2.preparedDigest))).success,
        true,
      );

      // Once all live sessions and prepared obligations complete, retained row-key state is pruned!
      const statsAfterIdle = getRetainedRowKeyHistoryStats(leader);
      assert.equal(statsAfterIdle.scopedGenerationCount, 0);
      assert.equal(statsAfterIdle.committedRowKeyCount, 0);
      assert.equal(statsAfterIdle.preparedParticipantCount, 0);

      // Verify overlapping OR commit prevents sealSession / canAdvanceRowKeySessionGeneration:
      // txStale begins and stages a write on k-2; then txStale loses the key or another tx commits
      // an OR write on (k-1, k-2) after txStale's base. Specifically:
      // txA stages on k-2, txB begins at same base; txA commits on (k-1 OR k-2);
      // if a session had generationBase before txA's OR commit and touched k-1, PREPARE must refuse!
      const txFastOr = identityOf('8'.repeat(32), {sessionId: 'fast-or-1'});
      const txLateK1 = identityOf('9'.repeat(32), {sessionId: 'late-k1-1'});
      assert.equal((await send(leader, beginMessage(txFastOr))).success, true);
      assert.equal((await send(leader, beginMessage(txLateK1))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txFastOr, orUpdateSql, ['or-v2', 'k-1', 'k-2']))).success,
        true,
      );
      const prepFastOr = await send(leader, prepareMessage(txFastOr));
      assert.equal(prepFastOr.success, true);
      assert.equal(
        (await send(leader, commitMessage(txFastOr, prepFastOr.preparedDigest))).success,
        true,
      );
      // Now txLateK1 (opened before txFastOr committed) stages a write on k-1 (now free) and tries to PREPARE:
      assert.equal(
        (await send(leader, queryMessage(txLateK1, updateSql, ['late-v1', 'k-1']))).success,
        true,
      );
      const prepLateK1 = await send(leader, prepareMessage(txLateK1));
      assert.equal(prepLateK1.success, false, 'PREPARE must refuse advancing across overlapping OR commit on k-1');
      assert.equal(prepLateK1.refusalCause, 'conflict');

      // After txLateK1 ends on refusal, retained row-key history is pruned again:
      assert.deepEqual(getRetainedRowKeyHistoryStats(leader), {
        scopedGenerationCount: 0,
        committedRowKeyCount: 0,
        preparedParticipantCount: 0,
      });

      // 5. Unscoped OR branch (WHERE id = ? OR value = ?), parameterless literal write,
      // and multi-row INSERT classification:
      const unscopedOrFootprint = extractStatementWriteFootprint({
        sql: `UPDATE ${TABLE} SET value = ? WHERE id = ? OR value = ?`,
        params: ['x', 'k-1', 'old'],
        pkCols: ['id'],
        allCols: ['id', 'value'],
      });
      assert.equal(unscopedOrFootprint.scoped, false);
      assert.deepEqual(unscopedOrFootprint.rowKeys, []);

      const literalUpdateFootprint = extractStatementWriteFootprint({
        sql: `UPDATE ${TABLE} SET value = 'lit-val' WHERE id = 'k-1'`,
        params: [],
        pkCols: ['id'],
        allCols: ['id', 'value'],
      });
      assert.equal(literalUpdateFootprint.scoped, true);
      assert.deepEqual(literalUpdateFootprint.rowKeys, ['k-1']);

      const multiInsertFootprint = extractStatementWriteFootprint({
        sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?), ('k-lit', 'v-lit')`,
        params: ['k-param', 'v-param'],
        pkCols: ['id'],
        allCols: ['id', 'value'],
      });
      assert.equal(multiInsertFootprint.scoped, true);
      assert.deepEqual(multiInsertFootprint.rowKeys, ['k-param', 'k-lit']);
      assert.deepEqual(multiInsertFootprint.pkTuples, [['k-param'], ['k-lit']]);

      // 6a. Refused unscoped DELETE in tx2 does not set tx2.hasUnscopedWrite = true
      // or block tx1's subsequent writes.
      const txU1 = identityOf('a'.repeat(32), {sessionId: 'u-unscoped-1'});
      const txU2 = identityOf('b'.repeat(32), {sessionId: 'u-unscoped-2'});
      assert.equal((await send(leader, beginMessage(txU1))).success, true);
      assert.equal((await send(leader, beginMessage(txU2))).success, true);
      assert.equal(
        (await send(leader, queryMessage(txU1, updateSql, ['u1-v1', 'k-1']))).success,
        true,
      );
      const refusedUnscopedDelete = await send(
        leader,
        queryMessage(txU2, `DELETE FROM ${TABLE}`, []),
      );
      assert.equal(refusedUnscopedDelete.success, false);
      const sessionU2 = findParticipantSession(leader, txU2);
      assert.equal(
        sessionU2?.hasUnscopedWrite,
        false,
        'refused unscoped DELETE in tx2 must not set tx2.hasUnscopedWrite = true',
      );
      // tx1's subsequent write on k-2 must not be blocked by tx2's refused unscoped DELETE!
      assert.equal(
        (await send(leader, queryMessage(txU1, updateSql, ['u1-v2', 'k-2']))).success,
        true,
      );
      await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, txU2));
      const prepU1 = await send(leader, prepareMessage(txU1));
      assert.equal(prepU1.success, true);
      assert.equal(
        (await send(leader, commitMessage(txU1, prepU1.preparedDigest))).success,
        true,
      );

      // 6b. Failed duplicate INSERT in tx1 does not retain the row key in tx1.touchedRowKeys
      // or block tx2 from mutating that row key.
      const txDup1 = identityOf('c'.repeat(32), {sessionId: 'dup-sess-1'});
      const txDup2 = identityOf('0'.repeat(32), {sessionId: 'dup-sess-2'});
      assert.equal((await send(leader, beginMessage(txDup1))).success, true);
      assert.equal((await send(leader, beginMessage(txDup2))).success, true);
      // k-1 already exists, so INSERT INTO items (id, value) VALUES ('k-1', 'dup') fails SQLite UNIQUE constraint:
      const failedDupInsert = await send(
        leader,
        queryMessage(txDup1, INSERT_SQL, ['k-1', 'dup']),
      );
      assert.equal(failedDupInsert.success, false);
      const sessionDup1 = findParticipantSession(leader, txDup1);
      assert.equal(
        sessionDup1?.touchedRowKeys?.has('k-1'),
        false,
        'failed duplicate INSERT must not retain k-1 in txDup1.touchedRowKeys',
      );
      // txDup2 can still stage a write on k-1 without conflict!
      assert.equal(
        (await send(leader, queryMessage(txDup2, updateSql, ['dup2-ok', 'k-1']))).success,
        true,
      );
      await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, txDup1));
      await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, txDup2));
    });
  } finally {
    clearFixtureSingletons();
  }
});
