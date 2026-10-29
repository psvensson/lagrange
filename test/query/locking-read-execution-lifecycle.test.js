import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  acquireRowReservation,
  clearAllReservations,
  getTransactionReservations,
  hasLockingReadReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {resolveFailureSqlState} from '../../src/runtime/pgwire-result-mapper.js';
import {
  openParticipantSession,
  sweepParticipantTransactionHolds,
} from '../../src/partition/partition-participant-transaction-session.js';

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

  const engine = new SQLQueryEngine({
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    messageRouter: {
      async deliver(address, message) {
        deliveredMessages.push({address, ...message});
        if (message.type === 'TRANSACTION') {
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

  acquireRowReservation({
    tableName: 'orders',
    partitionId: 'orders-p1',
    pkValues: [1],
    transactionId: 'tx-with-lock',
    sessionId: 's1',
    kind: 'FOR_UPDATE',
  });

  assert.equal(hasLockingReadReservations('tx-with-lock'), true);

  // Sweep after holdTimeoutMs has elapsed
  const discarded = sweepParticipantTransactionHolds(mockService, 100000, 1000);
  assert.equal(discarded, 0, 'session with locking read reservations must not be expired');
  assert.equal(hasLockingReadReservations('tx-with-lock'), true);
  clearAllReservations();
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
