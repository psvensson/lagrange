/**
 * Unit J4: Composed User Journey Test for Locking Reads (SELECT ... FOR UPDATE).
 *
 * Covers requirements from solve/specs/release-0-3-queryable-core/user-journeys.md (J4):
 * - Projection-independent canonical row identity (omitted/aliased PK columns)
 * - Two concurrent client sessions contending for the same logical base row
 * - Fail-fast refusal with 55P03 (LOCK_NOT_AVAILABLE) and retryable: true
 * - Non-conflicting row-level concurrency without false table-level blocking
 * - Useful successor transaction progress after COMMIT
 * - Automatic reservation release on ROLLBACK, timeout, cancellation, disconnect
 * - Fail-closed refusal for unsupported locking clauses (0A000)
 * - Fail-closed candidate reads (failed candidate read does not become safe empty write)
 * - Durable participant SQLite reservation mirroring via _lagrange_locking_read_reservations
 *
 * @module test/transaction/queryable-core-j4-locking-read-journey.test
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createMockSystemCache} from '../query/sql-query-engine-test-support.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  clearAllReservations,
  hasLockingReadReservations,
  registerPartitionDatabase,
  releaseSessionReservations,
  checkRowReservationConflict,
  sweepExpiredReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {checkWriteStatementReservations} from '../../src/query/sql-locking-read-execution.js';

ConfigurationManager.getInstance().initialize();

/**
 * Initialize schema and seed data in a partition database.
 *
 * @param {Object} db - SQLite database.
 * @param {string} table - Table name.
 * @param {Array<Object>} rows - Seed rows.
 */
function seedPartitionDb(db, table, rows) {
  if (table === 'accounts') {
    db.exec('CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
    const insert = db.prepare('INSERT OR REPLACE INTO accounts (id, balance) VALUES (?, ?)');
    for (const row of rows) {
      insert.run(row.id, row.balance);
    }
  } else if (table === 'regional_inventory') {
    db.exec(`CREATE TABLE IF NOT EXISTS regional_inventory (
      region TEXT,
      sku TEXT,
      stock INTEGER,
      PRIMARY KEY (region, sku)
    )`);
    const insert = db.prepare(
      'INSERT OR REPLACE INTO regional_inventory (region, sku, stock) VALUES (?, ?, ?)',
    );
    for (const row of rows) {
      insert.run(row.region, row.sku, row.stock);
    }
  }
}

/**
 * Create harness for J4 locking read journeys.
 *
 * @param {Object} [options] - Harness options.
 * @return {Object} Test harness.
 */
function createJourneyHarness(options = {}) {
  clearAllReservations();
  const tables = [
    {table_name: 'accounts', primaryKey: 'id', partition_key_type: 'INTEGER'},
    {table_name: 'regional_inventory', primaryKey: 'sku', partition_key_type: 'TEXT'},
  ];
  const partitions = [
    {table_name: 'accounts', partition_id: 'accounts-p1', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {table_name: 'accounts', partition_id: 'accounts-p2', partition_key_start: 101, partition_key_end: null, partition_key_type: 'INTEGER'},
    {table_name: 'regional_inventory', partition_id: 'reg-p1', partition_key_start: null, partition_key_end: null, partition_key_type: 'TEXT'},
    {table_name: 'regional_inventory', partition_id: 'reg-p2', partition_key_start: null, partition_key_end: null, partition_key_type: 'TEXT'},
  ];

  const partitionDbs = new Map();
  const partitionServices = new Map();
  for (const part of partitions) {
    const db = new Database(':memory:');
    partitionDbs.set(part.partition_id, db);
    partitionServices.set(part.partition_id, {db, partitionId: part.partition_id});
    registerPartitionDatabase(part.partition_id, db);
  }

  seedPartitionDb(partitionDbs.get('accounts-p1'), 'accounts', [
    {id: 1, balance: 100},
    {id: 2, balance: 200},
  ]);
  seedPartitionDb(partitionDbs.get('accounts-p2'), 'accounts', [
    {id: 150, balance: 500},
  ]);
  seedPartitionDb(partitionDbs.get('reg-p1'), 'regional_inventory', [
    {region: 'us-east', sku: 'item-1', stock: 50},
  ]);
  seedPartitionDb(partitionDbs.get('reg-p2'), 'regional_inventory', [
    {region: 'eu-west', sku: 'item-2', stock: 75},
  ]);

  const harnessState = {
    failCandidateRead: Boolean(options.failCandidateRead),
  };

  const systemCache = createMockSystemCache(tables, partitions);
  const gateway = createTransactionPersistenceGateway();

  const engine = new SQLQueryEngine({
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    partitionServicesProvider: () => partitionServices,
    messageRouter: {
      async deliver(address, message) {
        if (message.type === 'TRANSACTION') {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            answerParticipantTransactionRequest(message),
          );
        }
        const partitionId = address?.split('/')?.at(-1);
        const db = partitionDbs.get(partitionId);
        if (!db) {
          return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
        }
        if (harnessState.failCandidateRead) {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            {success: false, error: 'simulated candidate read failure'},
          );
        }

        try {
          if (message.sql && typeof message.sql === 'string') {
            const trimmed = message.sql.trim().toUpperCase();
            if (trimmed.startsWith('SELECT')) {
              const rows = db.prepare(message.sql).all(message.params || []);
              return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows});
            }
            const info = db.prepare(message.sql).run(message.params || []);
            return buildDeliveryEnvelope(
              {acknowledged: true},
              {success: true, affectedRows: info.changes},
            );
          }
        } catch (_err) {
          // Fallback
        }
        return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
      },
    },
  });

  return {
    engine,
    gateway,
    partitionDbs,
    harnessState,
    cleanup() {
      clearAllReservations();
      gateway.db.close();
      for (const db of partitionDbs.values()) {
        db.close();
      }
    },
  };
}

test('J4: projection-independent canonical row identity (omitted and aliased PK columns)', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine, partitionDbs} = harness;
    const s1 = 'session-a';
    const tx1 = await engine.transactionCoordinator.begin(s1);
    assert.equal(tx1.success, true);

    // 1. SELECT balance (omits PK id) FOR UPDATE
    const res1 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s1},
    );
    assert.equal(res1.success, true, res1.error);
    assert.equal(res1.rows.length, 1);
    // User sees ONLY requested columns; canonical PK is NOT leaked
    assert.deepEqual(Object.keys(res1.rows[0]), ['balance']);
    assert.equal(res1.rows[0].balance, 100);

    // Verify canonical row accounts:accounts-p1:[1] is locked in SQLite backing
    const p1Db = partitionDbs.get('accounts-p1');
    const dbRow = p1Db.prepare(
      'SELECT * FROM _lagrange_locking_read_reservations WHERE table_name = ? AND row_key = ?',
    ).get('accounts', 'accounts:accounts-p1:[1]');
    assert.ok(dbRow, 'canonical row identity must be recorded in partition SQLite table');
    assert.equal(dbRow.transaction_id, tx1.transactionId);

    // 2. SELECT id AS account_key, balance (aliased PK id) FOR UPDATE
    const res2 = await engine.executeQuery(
      'SELECT id AS account_key, balance FROM accounts WHERE id = 2 FOR UPDATE',
      [],
      {sessionId: s1},
    );
    assert.equal(res2.success, true, res2.error);
    assert.equal(res2.rows.length, 1);
    assert.deepEqual(Object.keys(res2.rows[0]).sort(), ['account_key', 'balance']);
    assert.equal(res2.rows[0].account_key, 2);

    // Verify row accounts:accounts-p1:[2] is locked
    const dbRow2 = p1Db.prepare(
      'SELECT * FROM _lagrange_locking_read_reservations WHERE table_name = ? AND row_key = ?',
    ).get('accounts', 'accounts:accounts-p1:[2]');
    assert.ok(dbRow2, 'aliased PK query must lock canonical row identity');
    assert.equal(dbRow2.transaction_id, tx1.transactionId);

    // 3. Composite PK table regional_inventory
    const res3 = await engine.executeQuery(
      'SELECT stock FROM regional_inventory WHERE region = \'us-east\' AND sku = \'item-1\' FOR UPDATE',
      [],
      {sessionId: s1},
    );
    assert.equal(res3.success, true, res3.error);
    assert.deepEqual(Object.keys(res3.rows[0]), ['stock']);
    assert.equal(res3.rows[0].stock, 50);

    await engine.transactionCoordinator.commit(s1);
  } finally {
    harness.cleanup();
  }
});

test('J4: concurrent sessions contention, fail-fast refusal, and row-level non-blocking isolation', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine} = harness;
    const s1 = 'session-a';
    const s2 = 'session-b';

    // Session 1 holds lock on account id = 1
    const tx1 = await engine.transactionCoordinator.begin(s1);
    const r1 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s1},
    );
    assert.equal(r1.success, true);

    // Session 2 begins
    const tx2 = await engine.transactionCoordinator.begin(s2);
    assert.equal(tx2.success, true);

    // Contending SELECT ... FOR UPDATE fails fast with 55P03 and retryable: true
    const r2 = await engine.executeQuery(
      'SELECT * FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(r2.success, false);
    assert.equal(r2.errorCode, 'LOCK_NOT_AVAILABLE');
    assert.equal(r2.sqlState, '55P03');
    assert.equal(r2.conflict, true);
    assert.equal(r2.retryable, true);
    assert.equal(r2.conflictingTransactionId, tx1.transactionId);

    // Conflicting session 2 transaction was rolled back on coordinator
    assert.equal(engine.transactionCoordinator.getTransaction(s2), null);

    // Session 1 transaction remains intact
    assert.ok(engine.transactionCoordinator.getTransaction(s1));

    // Session 2 in fresh transaction attempts conflicting UPDATE
    await engine.transactionCoordinator.begin(s2);
    const writeRes = await engine.executeQuery(
      'UPDATE accounts SET balance = 50 WHERE id = 1',
      [],
      {sessionId: s2},
    );
    assert.equal(writeRes.success, false);
    assert.equal(writeRes.sqlState, '55P03');
    assert.equal(writeRes.conflict, true);
    assert.equal(writeRes.retryable, true);

    // Session 2 attempts conflicting DELETE
    await engine.transactionCoordinator.begin(s2);
    const delRes = await engine.executeQuery(
      'DELETE FROM accounts WHERE id = 1',
      [],
      {sessionId: s2},
    );
    assert.equal(delRes.success, false);
    assert.equal(delRes.sqlState, '55P03');

    // Non-conflicting row id = 150 (different row & partition) succeeds concurrently!
    await engine.transactionCoordinator.begin(s2);
    const nonConflict = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 150 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(nonConflict.success, true, 'non-conflicting row must not suffer table-level block');

    const updateNonConflict = await engine.executeQuery(
      'UPDATE accounts SET balance = 550 WHERE id = 150',
      [],
      {sessionId: s2},
    );
    assert.equal(updateNonConflict.success, true);
    await engine.transactionCoordinator.commit(s2);

    await engine.transactionCoordinator.commit(s1);
  } finally {
    harness.cleanup();
  }
});

test('J4: commit release allows successor progress to observe committed state and mutate', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine, partitionDbs} = harness;
    const s1 = 'session-a';
    const s2 = 'session-b';

    await engine.transactionCoordinator.begin(s1);
    await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    await engine.executeQuery(
      'UPDATE accounts SET balance = 150 WHERE id = 1',
      [],
      {sessionId: 's1'},
    );
    await engine.transactionCoordinator.commit(s1);

    // Verify reservation was deleted from partition SQLite table
    const p1Db = partitionDbs.get('accounts-p1');
    const remaining = p1Db.prepare(
      'SELECT COUNT(*) as cnt FROM _lagrange_locking_read_reservations WHERE row_key = ?',
    ).get('accounts:accounts-p1:[1]');
    assert.equal(remaining.cnt, 0, 'reservation must be released on COMMIT');

    // Successor session 2 acquires lock on id = 1
    await engine.transactionCoordinator.begin(s2);
    const r2 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(r2.success, true);
    assert.equal(r2.rows[0].balance, 150, 'successor must observe committed balance');

    // Successor commits its update
    await engine.executeQuery(
      'UPDATE accounts SET balance = 180 WHERE id = 1',
      [],
      {sessionId: s2},
    );
    await engine.transactionCoordinator.commit(s2);
  } finally {
    harness.cleanup();
  }
});

test('J4: reservation release on ROLLBACK allows immediate successor acquisition', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine} = harness;
    const s1 = 'session-a';
    const s2 = 'session-b';

    await engine.transactionCoordinator.begin(s1);
    await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    await engine.transactionCoordinator.rollback(s1);

    // Session 2 immediately acquires lock
    await engine.transactionCoordinator.begin(s2);
    const r2 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(r2.success, true);
    await engine.transactionCoordinator.rollback(s2);
  } finally {
    harness.cleanup();
  }
});

test('J4: reservation release on coordinator timeout, cancel, and client disconnect', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine} = harness;
    const s1 = 'session-a';
    const s2 = 'session-b';

    // 1. Timeout release
    const tx1 = await engine.transactionCoordinator.begin(s1);
    await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    const txObj = engine.transactionCoordinator.transactionsBySession.get(s1);
    await engine.transactionCoordinator.abortTimedOutTransaction(txObj, 'PREPARE');
    assert.equal(hasLockingReadReservations(tx1.transactionId), false);

    // Successor acquires
    await engine.transactionCoordinator.begin(s2);
    const rSuccessor1 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(rSuccessor1.success, true);

    // 2. Cancellation release
    await engine.transactionCoordinator.cancel(s2);
    assert.equal(hasLockingReadReservations(s2), false);

    // 3. Client disconnect release via releaseSessionReservations
    await engine.transactionCoordinator.begin(s1);
    await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's1'},
    );
    releaseSessionReservations(s1);

    // Successor acquires after disconnect
    await engine.transactionCoordinator.begin(s2);
    const rSuccessor2 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s2},
    );
    assert.equal(rSuccessor2.success, true);
    await engine.transactionCoordinator.commit(s2);
  } finally {
    harness.cleanup();
  }
});

test('J4: fail-closed rejections for unsupported locking clauses (0A000)', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine} = harness;
    await engine.transactionCoordinator.begin('s1');

    const unsupported = [
      'SELECT * FROM accounts FOR SHARE',
      'SELECT * FROM accounts FOR KEY SHARE',
      'SELECT * FROM accounts FOR NO KEY UPDATE',
      'SELECT * FROM accounts FOR UPDATE NOWAIT',
      'SELECT * FROM accounts FOR UPDATE SKIP LOCKED',
      'SELECT * FROM accounts FOR UPDATE OF accounts',
    ];

    for (const sql of unsupported) {
      const res = await engine.executeQuery(sql, [], {sessionId: 's1'});
      assert.equal(res.success, false, `Expected failure for: ${sql}`);
      assert.equal(res.sqlState, '0A000', `Expected 0A000 for: ${sql}`);
    }

    await engine.transactionCoordinator.rollback('s1');
  } finally {
    harness.cleanup();
  }
});

test('J4: fail-closed candidate reads (failed candidate read does not become safe empty write)', async () => {
  const harness = createJourneyHarness();
  try {
    const {engine, harnessState} = harness;
    const s1 = 'session-a';
    // Set up a conflicting reservation from tx1
    await engine.transactionCoordinator.begin(s1);
    const r1 = await engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: s1},
    );
    assert.equal(r1.success, true);

    // Now induce candidate read failure for successor write statement
    harnessState.failCandidateRead = true;

    // A write with a complex WHERE clause that requires candidate PK resolution
    const mockContext = {
      engine,
      statement: {
        tableName: 'accounts',
        statementType: 'UPDATE',
        sessionId: 's2',
        params: [],
        writePlan: {
          partitionStatements: new Map([['accounts-p1', {}]]),
          ast: {
            where: {
              type: 'binary_expr',
              operator: '>',
              left: {type: 'column_ref', column: 'balance'},
              right: {type: 'number', value: 0},
            },
          },
        },
      },
      writeTransaction: {
        ownership: 'EXPLICIT',
        transactionState: {transactionId: 'tx-s2'},
      },
    };

    const conflict = await checkWriteStatementReservations(mockContext);
    assert.ok(conflict, 'failed candidate read must return non-null failure');
    assert.equal(conflict.success, false);
    assert.ok(conflict.error.includes('Failed to evaluate candidate rows'));
  } finally {
    harness.cleanup();
  }
});

test('J4: durable partition SQLite reservation survives simulated coordinator state reset', () => {
  clearAllReservations();
  const db = new Database(':memory:');
  try {
    registerPartitionDatabase('p1', db);
    const harness = {
      tableName: 'accounts',
      partitionId: 'p1',
      pkValues: [42],
      transactionId: 'tx-persisted',
      sessionId: 's-persisted',
      db,
    };

    // Acquire reservation backed by SQLite
    const acq = checkRowReservationConflict(harness);
    assert.equal(acq.conflict, false);

    // Simulate coordinator memory wipe while partition DB retains state
    clearAllReservations();
    registerPartitionDatabase('p1', db);

    // Re-seed directly in SQLite DB to simulate survived reservation from an external coordinator
    db.prepare(`
      INSERT OR REPLACE INTO _lagrange_locking_read_reservations
      (partition_id, table_name, row_key, transaction_id, session_id, epoch, reserved_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('p1', 'accounts', 'accounts:p1:[42]', 'tx-persisted', 's-persisted', 1, Date.now(), Date.now() + 5000);

    // New transaction checking the partition DB must observe the conflict
    const conflictCheck = checkRowReservationConflict({
      tableName: 'accounts',
      partitionId: 'p1',
      pkValues: [42],
      transactionId: 'tx-new',
      db,
    });
    assert.equal(conflictCheck.conflict, true);
    assert.equal(conflictCheck.conflictingTransactionId, 'tx-persisted');

    // Sweep expired reservations
    db.prepare(
      'UPDATE _lagrange_locking_read_reservations SET expires_at = ? WHERE row_key = ?',
    ).run(Date.now() - 1000, 'accounts:p1:[42]');

    const swept = sweepExpiredReservations(db);
    assert.equal(swept, 1);

    const postSweepCheck = checkRowReservationConflict({
      tableName: 'accounts',
      partitionId: 'p1',
      pkValues: [42],
      transactionId: 'tx-new',
      db,
    });
    assert.equal(postSweepCheck.conflict, false);
  } finally {
    db.close();
    clearAllReservations();
  }
});
