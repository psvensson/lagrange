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
    });
  } finally {
    clearFixtureSingletons();
  }
});
