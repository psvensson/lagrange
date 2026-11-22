import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  clearAllReservations,
  deriveRowLockKey,
  getTransactionReservations,
  hasLockingReadReservations,
  registerPartitionDatabase,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  acquireDbForUpdateReservation,
  releaseDbPartitionTransactionReservations,
} from '../../src/partition/partition-locking-read-store.js';
import {resolveFailureSqlState} from '../../src/runtime/pgwire-result-mapper.js';
import {
  canAdvanceRowKeySessionGeneration,
  checkAndRecordSessionRowKey,
  endParticipantSession,
  openParticipantSession,
  recordCommittedParticipantRowKeys,
  stagePreparedParticipantRowKeys,
  sweepParticipantTransactionHolds,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  getStagingReplayStats,
  runParticipantSessionStatement,
} from '../../src/partition/partition-participant-transaction-staging.js';
import {
  MAX_SCOPED_FOOTPRINT_TUPLES,
  encodeCanonicalPkTupleKey,
  extractStatementWriteFootprint,
} from '../../src/partition/partition-write-footprint-contract.js';
import Database from 'better-sqlite3';
import {
  openParticipantTransactionStore,
  recordPartitionWriteOrigin,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {runDeterminismSelfCheck} from '../../src/partition/partition-transaction-determinism.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
ConfigurationManager.getInstance().initialize();

function createTestHarness(options = {}) {
  clearAllReservations();
  const tables = options.tables || [
    {table_name: 'accounts', primaryKey: 'id', partition_key_type: 'INTEGER'},
    {table_name: 'orders', primaryKey: 'id', partition_key_type: 'INTEGER'},
    {table_name: 'no_pk_table', primaryKey: null},
  ];
  const partitions = options.partitions || [
    {table_name: 'accounts', partition_id: 'accounts-p1', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {table_name: 'accounts', partition_id: 'accounts-p2', partition_key_start: 101, partition_key_end: null, partition_key_type: 'INTEGER'},
    {table_name: 'orders', partition_id: 'orders-p1', partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
    {table_name: 'no_pk_table', partition_id: 'no-pk-p1', partition_key_start: null, partition_key_end: null},
  ];
  const systemCache = createMockSystemCache(tables, partitions);
  const gateway = createTransactionPersistenceGateway();
  const deliveredMessages = [];

  const mockRowsByTable = {
    accounts: [{id: 1, balance: 100}, {id: 150, balance: 500}],
    orders: [{id: 10, total: 50}],
    no_pk_table: [{val: 42}],
    ...(options.rowsByTable || {}),
  };

  const partitionServices = new Map();
  const partitionDbs = [];
  for (const part of partitions) {
    const db = new Database(':memory:');
    partitionDbs.push(db);
    partitionServices.set(part.partition_id, {db, partitionId: part.partition_id});
    registerPartitionDatabase(part.partition_id, db);
  }

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    partitionServicesProvider: () => partitionServices,
    messageRouter: {
      async deliver(address, message) {
        deliveredMessages.push({address, ...message});
        if (message.type === 'TRANSACTION') {
          const txPartitionId = address?.split('/')?.at(-1);
          if (
            (message.operation === 'COMMIT' || message.operation === 'ROLLBACK') &&
            txPartitionId &&
            message.transactionId
          ) {
            const svc = partitionServices.get(txPartitionId);
            if (svc?.db) {
              releaseDbPartitionTransactionReservations(
                svc.db,
                txPartitionId,
                message.transactionId,
              );
            }
          }
          return buildDeliveryEnvelope(
            {acknowledged: true},
            answerParticipantTransactionRequest(message),
          );
        }
        const partitionId = address?.split('/')?.at(-1);
        let rows = [{id: 1, balance: 100}];
        if (partitionId === 'accounts-p1') {
          rows = [{id: 1, balance: 100}];
        } else if (partitionId === 'accounts-p2') {
          rows = [{id: 150, balance: 500}];
        } else if (partitionId === 'orders-p1') {
          rows = [{id: 10, total: 50}];
        } else if (partitionId === 'no-pk-p1') {
          rows = [{val: 42}];
        }
        return buildDeliveryEnvelope(
          {acknowledged: true},
          {success: true, rows, affectedRows: 1},
        );
      },
    },
  });

  return {
    engine,
    gateway,
    deliveredMessages,
    mockRowsByTable,
    cleanup() {
      clearAllReservations();
      for (const db of partitionDbs) {
        db.close();
      }
      gateway.db.close();
    },
  };
}

test('B3: single-partition SELECT ... FOR UPDATE acquires durable row reservation', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx = await engine.transactionCoordinator.begin('s1');
    assert.equal(tx.success, true);

    const res = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(res.success, true, res.error);
    assert.equal(res.rows.length, 1);

    const reservations = getTransactionReservations(tx.transactionId);
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].tableName, 'orders');
    assert.equal(reservations[0].partitionId, 'orders-p1');
    assert.deepEqual(reservations[0].pkValues, [10]);
    assert.equal(reservations[0].kind, 'FOR_UPDATE');
    assert.equal(reservations[0].localExpiry, 'forbidden');
    assert.equal(hasLockingReadReservations(tx.transactionId), true);
  } finally {
    harness.cleanup();
  }
});

test('B3: multi-partition SELECT ... FOR UPDATE acquires reservations across partitions', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx = await engine.transactionCoordinator.begin('s1');
    assert.equal(tx.success, true);

    const res = await engine.executeQuery(
      'SELECT id, balance FROM accounts FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(res.success, true, res.error);
    assert.equal(res.rows.length, 2);

    const reservations = getTransactionReservations(tx.transactionId);
    assert.equal(reservations.length, 2);
    const partitionIds = reservations.map((r) => r.partitionId).sort();
    assert.deepEqual(partitionIds, ['accounts-p1', 'accounts-p2']);
  } finally {
    harness.cleanup();
  }
});

test('B3: same-transaction re-entrant SELECT ... FOR UPDATE and writes succeed', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx = await engine.transactionCoordinator.begin('s1');
    assert.equal(tx.success, true);

    const res1 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(res1.success, true);

    const res2 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(res2.success, true, 're-entrant locking read in same transaction must succeed');

    const updateRes = await engine.executeQuery(
      'UPDATE orders SET total = 75 WHERE id = 10',
      [],
      {sessionId: 's1'},
    );
    assert.equal(updateRes.success, true, 'mutation following FOR UPDATE in same transaction must succeed');

    const commitRes = await engine.transactionCoordinator.commit('s1');
    assert.equal(commitRes.success, true);
    assert.equal(hasLockingReadReservations(tx.transactionId), false);
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: concurrent SELECT ... FOR UPDATE fails fast with 55P03 and rolls back conflicting tx', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx1 = await engine.transactionCoordinator.begin('s1');
    const r1 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(r1.success, true);

    const tx2 = await engine.transactionCoordinator.begin('s2');
    const r2 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's2'},
    );
    assert.equal(r2.success, false);
    assert.equal(r2.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(r2.sqlState, '55P03');
    assert.equal(r2.conflict, true);
    assert.equal(r2.conflictingTransactionId, tx1.transactionId);

    const s2ActiveTx = engine.transactionCoordinator.getTransaction('s2');
    assert.equal(s2ActiveTx, null, 'conflicting transaction must be rolled back on coordinator');
    assert.equal(hasLockingReadReservations(tx2.transactionId), false);
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: concurrent write vs SELECT ... FOR UPDATE fails fast with 55P03', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s1');
    const r1 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(r1.success, true);

    await engine.transactionCoordinator.begin('s2');
    const writeRes = await engine.executeQuery(
      'UPDATE orders SET total = 99 WHERE id = 10',
      [],
      {sessionId: 's2'},
    );
    assert.equal(writeRes.success, false);
    assert.equal(writeRes.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(writeRes.sqlState, '55P03');
    assert.equal(writeRes.conflict, true);
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: concurrent INSERT with same PK vs SELECT ... FOR UPDATE fails fast with 55P03', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s1');
    const r1 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(r1.success, true);

    await engine.transactionCoordinator.begin('s2');
    const insertRes = await engine.executeQuery(
      'INSERT INTO orders (id, total) VALUES (10, 200)',
      [],
      {sessionId: 's2'},
    );
    assert.equal(insertRes.success, false);
    assert.equal(insertRes.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(insertRes.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: staged write vs concurrent SELECT ... FOR UPDATE fails fast with 55P03', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s1');
    const updateRes = await engine.executeQuery(
      'UPDATE orders SET total = 500 WHERE id = 10',
      [],
      {sessionId: 's1'},
    );
    assert.equal(updateRes.success, true);

    await engine.transactionCoordinator.begin('s2');
    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's2'},
    );
    assert.equal(lockRes.success, false);
    assert.equal(lockRes.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(lockRes.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: staged write (WRITE_STAGED) does NOT cause checkWriteStatementReservations to reject concurrent write with 55P03', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx1 = await engine.transactionCoordinator.begin('s1');
    const updateRes1 = await engine.executeQuery(
      'UPDATE orders SET total = 500 WHERE id = 10',
      [],
      {sessionId: 's1'},
    );
    assert.equal(updateRes1.success, true);
    assert.equal(hasLockingReadReservations(tx1.transactionId), false);
    const tx1Reservations = getTransactionReservations(tx1.transactionId);
    assert.equal(tx1Reservations.length, 1);
    assert.equal(tx1Reservations[0].kind, 'WRITE_STAGED');

    await engine.transactionCoordinator.begin('s2');
    const updateRes2 = await engine.executeQuery(
      'UPDATE orders SET total = 600 WHERE id = 10',
      [],
      {sessionId: 's2'},
    );
    assert.notEqual(
      updateRes2.sqlState,
      '55P03',
      'WRITE_STAGED reservation must not reject a concurrent write with 55P03',
    );
    assert.equal(updateRes2.success, true);
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: re-entrant SELECT ... FOR UPDATE upgrades same-transaction WRITE_STAGED reservation to FOR_UPDATE and blocks concurrent write with 55P03', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const tx1 = await engine.transactionCoordinator.begin('s1');
    const stagedUpdate = await engine.executeQuery(
      'UPDATE orders SET total = 500 WHERE id = 10',
      [],
      {sessionId: 's1'},
    );
    assert.equal(stagedUpdate.success, true);
    assert.equal(hasLockingReadReservations(tx1.transactionId), false);

    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(lockRes.success, true);
    assert.equal(
      hasLockingReadReservations(tx1.transactionId),
      true,
      're-entrant FOR UPDATE must upgrade WRITE_STAGED reservation to FOR_UPDATE',
    );
    const upgraded = getTransactionReservations(tx1.transactionId);
    assert.equal(upgraded.length, 1);
    assert.equal(upgraded[0].kind, 'FOR_UPDATE');

    await engine.transactionCoordinator.begin('s2');
    const concurrentWrite = await engine.executeQuery(
      'UPDATE orders SET total = 700 WHERE id = 10',
      [],
      {sessionId: 's2'},
    );
    assert.equal(concurrentWrite.success, false);
    assert.equal(concurrentWrite.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(concurrentWrite.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('B3/B5: unscoped column-to-column WHERE id = id runs checkQueriedCandidatesConflict and fails fast with 55P03 when row is locked FOR UPDATE', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s1');
    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(lockRes.success, true);

    await engine.transactionCoordinator.begin('s2');
    const colToColUpdate = await engine.executeQuery(
      'UPDATE orders SET total = 99 WHERE id = id',
      [],
      {sessionId: 's2'},
    );
    assert.equal(colToColUpdate.success, false);
    assert.equal(colToColUpdate.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(colToColUpdate.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('B4: reservation release on COMMIT allows subsequent transactions to lock and mutate rows', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const t1 = await engine.transactionCoordinator.begin('s1');
    await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(hasLockingReadReservations(t1.transactionId), true);

    await engine.transactionCoordinator.commit('s1');
    assert.equal(hasLockingReadReservations(t1.transactionId), false);

    const t2 = await engine.transactionCoordinator.begin('s2');
    const r2 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's2'},
    );
    assert.equal(r2.success, true);
    assert.equal(hasLockingReadReservations(t2.transactionId), true);

    await engine.transactionCoordinator.commit('s2');
    assert.equal(hasLockingReadReservations(t2.transactionId), false);
  } finally {
    harness.cleanup();
  }
});

test('B4: reservation release on ROLLBACK allows subsequent transactions to lock and mutate rows', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const t1 = await engine.transactionCoordinator.begin('s1');
    await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(hasLockingReadReservations(t1.transactionId), true);

    await engine.transactionCoordinator.rollback('s1');
    assert.equal(hasLockingReadReservations(t1.transactionId), false);

    await engine.transactionCoordinator.begin('s2');
    const r2 = await engine.executeQuery(
      'UPDATE orders SET total = 300 WHERE id = 10',
      [],
      {sessionId: 's2'},
    );
    assert.equal(r2.success, true);
    await engine.transactionCoordinator.commit('s2');
  } finally {
    harness.cleanup();
  }
});

test('B4: reservation release on cancel(sessionId)', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const t1 = await engine.transactionCoordinator.begin('s1');
    await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(hasLockingReadReservations(t1.transactionId), true);

    const cancelRes = await engine.transactionCoordinator.cancel('s1');
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.outcome, 'typed_transaction_cancelled');
    assert.equal(hasLockingReadReservations(t1.transactionId), false);

    await engine.transactionCoordinator.begin('s2');
    const r2 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's2'},
    );
    assert.equal(r2.success, true);
  } finally {
    harness.cleanup();
  }
});

test('B4: reservation release on transaction coordinator timeout (abortTimedOutTransaction)', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;
    const t1 = await engine.transactionCoordinator.begin('s1');
    await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    assert.equal(hasLockingReadReservations(t1.transactionId), true);

    const txObj = engine.transactionCoordinator.transactionsBySession.get('s1');
    await engine.transactionCoordinator.abortTimedOutTransaction(txObj, 'PREPARE');
    assert.equal(hasLockingReadReservations(t1.transactionId), false);

    await engine.transactionCoordinator.begin('s2');
    const r2 = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's2'},
    );
    assert.equal(r2.success, true);
  } finally {
    harness.cleanup();
  }
});

test('B4: participant session sweep respects localExpiry: "forbidden" for locking reads', () => {
  clearAllReservations();
  const mockService = {
    partitionId: 'orders-p1',
    logger: {info() {}, warn() {}},
    timeSource: {
      now() {
        return 1000;
      },
    },
  };

  openParticipantSession(
    mockService,
    {
      sessionId: 's1',
      transactionId: 'tx-with-lock',
      participantId: 'tx-with-lock:orders-p1',
      commitMode: 'DISTRIBUTED',
      transactionEpoch: 1000,
    },
    {generationBase: 1, originIndex: 1},
  );

  const db = new Database(':memory:');
  acquireDbForUpdateReservation(db, {
    tableName: 'orders',
    partitionId: 'orders-p1',
    rowKey: deriveRowLockKey('orders', 'orders-p1', [1]),
    transactionId: 'tx-with-lock',
    sessionId: 's1',
    epoch: 0,
    acquiredAt: 1000,
    expiresAt: null,
  });

  assert.equal(hasLockingReadReservations('tx-with-lock', db), true);

  // Sweep after holdTimeoutMs has elapsed
  const discarded = sweepParticipantTransactionHolds(mockService, 100000, 1000);
  assert.equal(discarded, 0, 'session with locking read reservations must not be expired');
  assert.equal(hasLockingReadReservations('tx-with-lock', db), true);
  clearAllReservations();
  db.close();
});

test('B3: prohibited query shapes fail closed with 0A000 or 25P01', async () => {
  const harness = createTestHarness();
  try {
    const {engine} = harness;

    // Autocommit / no transaction: must fail with 25P01 (NO_ACTIVE_SQL_TRANSACTION)
    const autocommitRes = await engine.executeQuery('SELECT id, total FROM orders FOR UPDATE');
    assert.equal(autocommitRes.success, false);
    assert.equal(autocommitRes.errorCode, 'NO_TRANSACTION');
    assert.equal(autocommitRes.sqlState, '25P01');

    await engine.transactionCoordinator.begin('s-prohibited');

    // Table without primary key must fail closed with 0A000
    const noPkRes = await engine.executeQuery(
      'SELECT val FROM no_pk_table FOR UPDATE',
      [],
      {sessionId: 's-prohibited'},
    );
    assert.equal(noPkRes.success, false);
    assert.equal(noPkRes.sqlState, '0A000');

    // Prohibited shapes tested against parser / statement admission
    const prohibitedQueries = [
      'SELECT DISTINCT id FROM orders FOR UPDATE',
      'SELECT id FROM orders GROUP BY id FOR UPDATE',
      'SELECT COUNT(*) FROM orders FOR UPDATE',
      'SELECT o.id FROM orders o JOIN accounts a ON o.id = a.id FOR UPDATE',
    ];

    for (const sql of prohibitedQueries) {
      const res = await engine.executeQuery(sql, [], {sessionId: 's-prohibited'});
      assert.equal(res.success, false, `Query should fail: ${sql}`);
      assert.equal(res.sqlState, '0A000', `Expected 0A000 for: ${sql}`);
    }
  } finally {
    harness.cleanup();
  }
});

test('B5: pgwire result mapper maps LOCK_NOT_AVAILABLE to 55P03 and NO_TRANSACTION to 25P01', () => {
  assert.equal(resolveFailureSqlState({errorCode: 'LOCK_NOT_AVAILABLE'}), '55P03');
  assert.equal(resolveFailureSqlState({code: 'LOCK_NOT_AVAILABLE'}), '55P03');
  assert.equal(resolveFailureSqlState({errorCode: 'NO_TRANSACTION'}), '25P01');
  assert.equal(resolveFailureSqlState({errorCode: 'UNSUPPORTED_SQL_FEATURE'}), '0A000');
});

test('P1 composite PK tuple key encoding avoids separator collision and detects matching lock conflict', async () => {
  assert.equal(encodeCanonicalPkTupleKey(['a|b', 'c']), '["a|b","c"]');
  assert.equal(encodeCanonicalPkTupleKey(['a', 'b|c']), '["a","b|c"]');
  assert.notEqual(
    encodeCanonicalPkTupleKey(['a|b', 'c']),
    encodeCanonicalPkTupleKey(['a', 'b|c']),
  );
  assert.equal(encodeCanonicalPkTupleKey([10]), '10');
  assert.equal(encodeCanonicalPkTupleKey(['10']), '10');

  const fp1 = extractStatementWriteFootprint({
    sql: 'UPDATE composite_items SET val = 2 WHERE k1 = ? AND k2 = ?',
    params: ['a|b', 'c'],
    pkCols: ['k1', 'k2'],
  });
  const fp2 = extractStatementWriteFootprint({
    sql: 'UPDATE composite_items SET val = 2 WHERE k1 = ? AND k2 = ?',
    params: ['a', 'b|c'],
    pkCols: ['k1', 'k2'],
  });
  assert.equal(fp1.scoped, true);
  assert.equal(fp2.scoped, true);
  assert.deepEqual(fp1.rowKeys, ['["a|b","c"]']);
  assert.deepEqual(fp2.rowKeys, ['["a","b|c"]']);

  const harness = createTestHarness({
    tables: [
      {
        table_name: 'composite_items',
        primaryKey: ['k1', 'k2'],
        partition_key_type: 'COMPOSITE',
      },
    ],
    partitions: [
      {
        table_name: 'composite_items',
        partition_id: 'composite-p1',
        partition_key_start: null,
        partition_key_end: null,
        partition_key_type: 'COMPOSITE',
      },
    ],
  });
  try {
    const {engine} = harness;
    engine.messageRouter.deliver = async (_address, message) => {
      if (message.type === 'TRANSACTION') {
        return buildDeliveryEnvelope(
          {acknowledged: true},
          answerParticipantTransactionRequest(message),
        );
      }
      return buildDeliveryEnvelope(
        {acknowledged: true},
        {
          success: true,
          rows: [{k1: 'a|b', k2: 'c', val: 1}],
          affectedRows: 1,
        },
      );
    };

    const tx1 = await engine.transactionCoordinator.begin('s-comp-1');
    const lockRes = await engine.executeQuery(
      'SELECT k1, k2, val FROM composite_items WHERE k1 = ? AND k2 = ? FOR UPDATE',
      ['a|b', 'c'],
      {sessionId: 's-comp-1'},
    );
    assert.equal(lockRes.success, true, lockRes.error);
    const reservations = getTransactionReservations(tx1.transactionId);
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].rowKey, 'composite_items:composite-p1:["a|b","c"]');

    // Disjoint composite key ["a", "b|c"] must NOT collide with ["a|b", "c"]
    await engine.transactionCoordinator.begin('s-comp-2');
    const disjointUpdate = await engine.executeQuery(
      'UPDATE composite_items SET val = 20 WHERE k1 = ? AND k2 = ?',
      ['a', 'b|c'],
      {sessionId: 's-comp-2'},
    );
    assert.equal(disjointUpdate.success, true, disjointUpdate.error);

    // Matching composite key ["a|b", "c"] must conflict with 55P03
    await engine.transactionCoordinator.begin('s-comp-3');
    const conflictingUpdate = await engine.executeQuery(
      'UPDATE composite_items SET val = 30 WHERE k1 = ? AND k2 = ?',
      ['a|b', 'c'],
      {sessionId: 's-comp-3'},
    );
    assert.equal(conflictingUpdate.success, false);
    assert.equal(conflictingUpdate.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(conflictingUpdate.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('P1 INSERT OR REPLACE is unscoped and conflicts with active FOR UPDATE reservation on table', async () => {
  const replaceFootprint = extractStatementWriteFootprint({
    sql: 'INSERT OR REPLACE INTO orders (id, total) VALUES (20, 999)',
    pkCols: ['id'],
  });
  assert.equal(replaceFootprint.scoped, false);
  assert.deepEqual(replaceFootprint.rowKeys, []);

  const astWithOrReplace = extractStatementWriteFootprint({
    ast: {
      type: 'INSERT',
      orReplace: true,
      columns: ['id', 'total'],
      values: [[{type: 'literal', value: 20}, {type: 'literal', value: 999}]],
    },
    pkCols: ['id'],
  });
  assert.equal(astWithOrReplace.scoped, false);

  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s-lock-holder');
    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's-lock-holder'},
    );
    assert.equal(lockRes.success, true);

    // Secondary-UNIQUE conflict scenario: INSERT OR REPLACE with PK 20 while PK 10 is locked FOR UPDATE
    await engine.transactionCoordinator.begin('s-replace-writer');
    const replaceRes = await engine.executeQuery(
      'INSERT OR REPLACE INTO orders (id, total) VALUES (20, 999)',
      [],
      {sessionId: 's-replace-writer'},
    );
    assert.equal(replaceRes.success, false);
    assert.equal(replaceRes.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(replaceRes.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('P2 Cartesian bound enforces MAX_SCOPED_FOOTPRINT_TUPLES (64) before allocation', () => {
  assert.equal(MAX_SCOPED_FOOTPRINT_TUPLES, 64);

  const eightVals = Array.from({length: 8}, (_, i) => i + 1).join(', ');
  const scoped64 = extractStatementWriteFootprint({
    sql: `UPDATE items SET val = 1 WHERE k1 IN (${eightVals}) AND k2 IN (${eightVals})`,
    pkCols: ['k1', 'k2'],
  });
  assert.equal(scoped64.scoped, true);
  assert.equal(scoped64.rowKeys.length, 64);

  const nineVals = Array.from({length: 9}, (_, i) => i + 1).join(', ');
  const unscoped81 = extractStatementWriteFootprint({
    sql: `UPDATE items SET val = 1 WHERE k1 IN (${nineVals}) AND k2 IN (${nineVals})`,
    pkCols: ['k1', 'k2'],
  });
  assert.equal(unscoped81.scoped, false);
  assert.deepEqual(unscoped81.rowKeys, []);

  const vals32A = Array.from({length: 32}, (_, i) => i + 1).join(', ');
  const vals32B = Array.from({length: 32}, (_, i) => i + 33).join(', ');
  const vals33B = Array.from({length: 33}, (_, i) => i + 33).join(', ');
  const orScoped64 = extractStatementWriteFootprint({
    sql: `DELETE FROM items WHERE id IN (${vals32A}) OR id IN (${vals32B})`,
    pkCols: ['id'],
  });
  assert.equal(orScoped64.scoped, true);
  assert.equal(orScoped64.rowKeys.length, 64);

  const orUnscoped65 = extractStatementWriteFootprint({
    sql: `DELETE FROM items WHERE id IN (${vals32A}) OR id IN (${vals33B})`,
    pkCols: ['id'],
  });
  assert.equal(orUnscoped65.scoped, false);
  assert.deepEqual(orUnscoped65.rowKeys, []);
});

test('inherited SQL key equivalence: non-canonical numeric text is unscoped and conflicts with FOR UPDATE', async () => {
  for (const canonical of [1, -42, '1', '-42', 'alpha']) {
    const fp = extractStatementWriteFootprint({
      sql: 'UPDATE orders SET total = 1 WHERE id = ?',
      params: [canonical],
      pkCols: ['id'],
    });
    assert.equal(fp.scoped, true, `expected canonical PK scalar ${String(canonical)} to be scoped`);
  }

  for (const nonCanonical of ['01', '+1', '1.0', ' 1 ', '1e2', '-0', '9007199254740993', 1.5]) {
    const fp = extractStatementWriteFootprint({
      sql: 'UPDATE orders SET total = 1 WHERE id = ?',
      params: [nonCanonical],
      pkCols: ['id'],
    });
    assert.equal(
      fp.scoped,
      false,
      `expected non-canonical PK scalar ${String(nonCanonical)} to be unscoped`,
    );
  }

  const harness = createTestHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s-eq-1');
    const lockRes = await engine.executeQuery(
      'SELECT id, total FROM orders WHERE id = 10 FOR UPDATE',
      [],
      {sessionId: 's-eq-1'},
    );
    assert.equal(lockRes.success, true);

    await engine.transactionCoordinator.begin('s-eq-2');
    const updateRes = await engine.executeQuery(
      'UPDATE orders SET total = 99 WHERE id = ?',
      ['010'],
      {sessionId: 's-eq-2'},
    );
    assert.equal(updateRes.success, false);
    assert.equal(updateRes.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(updateRes.sqlState, '55P03');
  } finally {
    harness.cleanup();
  }
});

test('hasUnscopedWrite disables direct-validation shortcut and 0-write ROW_KEY session refuses generation advance', () => {
  const db = new Database(':memory:');
  try {
    openParticipantTransactionStore(db);
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, val INTEGER NOT NULL)');
    recordPartitionWriteOrigin(db, {index: 1, term: 1});
    runDeterminismSelfCheck(db, 'items');
    db.prepare('INSERT INTO items (id, val) VALUES (?, ?)').run('row-1', 10);

    const service = {
      partitionId: 'items-p1',
      replicaId: 'items-p1-r1',
      tableName: 'items',
      concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
      db,
      logger: {info() {}, warn() {}, debug() {}, error() {}},
      timeSource: {now: () => 1000},
    };

    // 1) 0-write ROW_KEY session must NOT advance past concurrent scoped commit,
    // whereas a disjoint 1-write ROW_KEY session CAN advance.
    const lockOnlySession = openParticipantSession(
      service,
      {
        sessionId: 's-lock-only',
        transactionId: 'tx-lock-only',
        participantId: 'tx-lock-only:items-p1',
        commitMode: 'TWO_PHASE_COMMIT',
        transactionEpoch: 1,
      },
      {generationBase: 0, originIndex: 1},
    );
    const disjointWriterSession = openParticipantSession(
      service,
      {
        sessionId: 's-disjoint',
        transactionId: 'tx-disjoint',
        participantId: 'tx-disjoint:items-p1',
        commitMode: 'TWO_PHASE_COMMIT',
        transactionEpoch: 1,
      },
      {generationBase: 0, originIndex: 1},
    );
    checkAndRecordSessionRowKey(
      service,
      disjointWriterSession,
      ['row-2'],
      'UPDATE items SET val = 30 WHERE id = ?',
    );
    const writerSession = openParticipantSession(
      service,
      {
        sessionId: 's-writer',
        transactionId: 'tx-writer',
        participantId: 'tx-writer:items-p1',
        commitMode: 'TWO_PHASE_COMMIT',
        transactionEpoch: 1,
      },
      {generationBase: 0, originIndex: 1},
    );
    checkAndRecordSessionRowKey(
      service,
      writerSession,
      ['row-1'],
      'UPDATE items SET val = 20 WHERE id = ?',
    );
    stagePreparedParticipantRowKeys(
      service,
      'tx-writer:items-p1',
      writerSession.touchedRowKeys,
      false,
    );
    recordCommittedParticipantRowKeys(service, 'tx-writer:items-p1', 1);
    endParticipantSession(service, writerSession);

    assert.equal(
      canAdvanceRowKeySessionGeneration(service, disjointWriterSession, 1),
      true,
      'disjoint 1-write ROW_KEY session can advance past concurrent scoped commit',
    );
    assert.equal(
      canAdvanceRowKeySessionGeneration(service, lockOnlySession, 1),
      false,
      '0-write ROW_KEY session must not advance past concurrent commit',
    );
    endParticipantSession(service, disjointWriterSession);
    endParticipantSession(service, lockOnlySession);

    // 2) Once a session stages an unscoped write, subsequent scoped writes must replay rather than direct-validate
    const mixedSession = openParticipantSession(
      service,
      {
        sessionId: 's-mixed',
        transactionId: 'tx-mixed',
        participantId: 'tx-mixed:items-p1',
        commitMode: 'TWO_PHASE_COMMIT',
        transactionEpoch: 1,
      },
      {generationBase: 0, originIndex: 1},
    );
    const firstWrite = runParticipantSessionStatement(service, mixedSession, {
      sql: 'DELETE FROM items WHERE val > 0',
      params: [],
    });
    assert.equal(firstWrite.success, true);
    assert.equal(mixedSession.hasUnscopedWrite, true);

    // Re-inserting id = 'row-1' succeeds ONLY if the prior unscoped DELETE is replayed during validation;
    // direct validation against committed state (where 'row-1' still exists) would fail with UNIQUE constraint!
    const secondWrite = runParticipantSessionStatement(service, mixedSession, {
      sql: 'INSERT INTO items (id, val) VALUES (?, ?)',
      params: ['row-1', 50],
    });
    assert.equal(secondWrite.success, true, JSON.stringify(secondWrite));
    const stats = getStagingReplayStats(service);
    assert.equal(
      stats.disjointDirectValidations,
      0,
      'direct validation shortcut must be disabled when session.hasUnscopedWrite === true',
    );
  } finally {
    db.close();
  }
});
