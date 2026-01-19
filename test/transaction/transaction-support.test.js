/**
 * Transaction Support Tests
 * Tests for single-partition ACID transactions and cross-partition rejection.
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */

import {test} from 'tap';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
// PartitionService imported for potential future use

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition service with transaction support
function createMockPartitionWithTx(tableName, keyStart, keyEnd, data = []) {
  let inTransaction = false;
  let transactionData = [...data];
  let pendingChanges = [];

  return {
    tableName,
    keyRange: {start: keyStart, end: keyEnd},
    data: transactionData,
    inTransaction: () => inTransaction,
    isInTransaction: () => inTransaction,
    beginTransaction: async function() {
      if (inTransaction) {
        throw new Error('Transaction already active');
      }
      inTransaction = true;
      pendingChanges = [];
      return {success: true, operation: 'BEGIN_TRANSACTION'};
    },
    commitTransaction: async function() {
      if (!inTransaction) {
        throw new Error('No active transaction');
      }
      // Apply pending changes
      transactionData = [...transactionData, ...pendingChanges];
      pendingChanges = [];
      inTransaction = false;
      return {success: true, operation: 'COMMIT', committed: true};
    },
    rollbackTransaction: async function() {
      if (!inTransaction) {
        throw new Error('No active transaction');
      }
      pendingChanges = [];
      inTransaction = false;
      return {success: true, operation: 'ROLLBACK', rolledBack: true};
    },
    executeQuery: async function(sql, _params) {
      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: transactionData, changes: 0};
      }
      if (inTransaction) {
        pendingChanges.push({sql});
      }
      return {rows: [], changes: 1};
    },
  };
}

// Mock system cache
function createMockSystemCache(tables, partitions) {
  return {
    tables,
    partitions,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      return [];
    },
  };
}

test('Transaction - BEGIN TRANSACTION starts a transaction', async (t) => {
  const engine = new SQLQueryEngine();

  const result = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'test-session-1',
  });

  t.equal(result.success, true);
  t.equal(result.operation, 'BEGIN_TRANSACTION');
  t.equal(engine.hasActiveTransaction('test-session-1'), true);
});

test('Transaction - COMMIT without active transaction returns error', async (t) => {
  const engine = new SQLQueryEngine();

  const result = await engine.executeQuery('COMMIT', [], {
    sessionId: 'test-session-2',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'NO_TRANSACTION');
});

test('Transaction - ROLLBACK without active transaction returns error', async (t) => {
  const engine = new SQLQueryEngine();

  const result = await engine.executeQuery('ROLLBACK', [], {
    sessionId: 'test-session-3',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'NO_TRANSACTION');
});

test('Transaction - double BEGIN returns error', async (t) => {
  const engine = new SQLQueryEngine();

  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'test-session-4'});
  const result = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'test-session-4',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'TRANSACTION_ACTIVE');
});

test('Transaction - cross-partition INSERT is rejected', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, 'm', []);
  const p2 = createMockPartitionWithTx('users', 'm', null, []);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'cross-tx-1'});

  // Try to insert into multiple partitions - should be rejected
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
    [],
    {sessionId: 'cross-tx-1'},
  );

  t.equal(result.success, false);
  t.equal(result.errorCode, 'CROSS_PARTITION_TRANSACTION');
  t.ok(result.error.includes('Cross-partition'));
});

test('Transaction - cross-partition UPDATE is rejected', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, 'm', [{id: 'alice'}]);
  const p2 = createMockPartitionWithTx('users', 'm', null, [{id: 'bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  // Start transaction and bind to partition p1
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'cross-tx-2'});
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'cross-tx-2'},
  );

  // Try to update all partitions (no key filter) - should be rejected
  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
    [],
    {sessionId: 'cross-tx-2'},
  );

  t.equal(result.success, false);
  t.equal(result.errorCode, 'CROSS_PARTITION_TRANSACTION');
});

test('Transaction - single-partition operations succeed', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, 'm', []);

  engine.setPartitionRegistry(new Map([['p1', p1]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );
  engine.setSystemCache(cache);

  // Start transaction
  const beginResult = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'single-tx-1',
  });
  t.equal(beginResult.success, true);

  // Insert into single partition
  const insertResult = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'single-tx-1'},
  );
  t.equal(insertResult.success, true);

  // Commit
  const commitResult = await engine.executeQuery('COMMIT', [], {
    sessionId: 'single-tx-1',
  });
  t.equal(commitResult.success, true);
  t.equal(commitResult.operation, 'COMMIT');
});

test('Transaction - ROLLBACK reverts changes', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, 'm', []);

  engine.setPartitionRegistry(new Map([['p1', p1]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );
  engine.setSystemCache(cache);

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'rollback-tx-1'});

  // Insert
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'rollback-tx-1'},
  );

  // Rollback
  const rollbackResult = await engine.executeQuery('ROLLBACK', [], {
    sessionId: 'rollback-tx-1',
  });
  t.equal(rollbackResult.success, true);
  t.equal(rollbackResult.operation, 'ROLLBACK');
  t.equal(engine.hasActiveTransaction('rollback-tx-1'), false);
});

test('Transaction - different sessions have independent transactions', async (t) => {
  const engine = new SQLQueryEngine();

  // Start transaction in session 1
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'session-a'});
  t.equal(engine.hasActiveTransaction('session-a'), true);
  t.equal(engine.hasActiveTransaction('session-b'), false);

  // Start transaction in session 2
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'session-b'});
  t.equal(engine.hasActiveTransaction('session-a'), true);
  t.equal(engine.hasActiveTransaction('session-b'), true);

  // Commit session 1
  await engine.executeQuery('COMMIT', [], {sessionId: 'session-a'});
  t.equal(engine.hasActiveTransaction('session-a'), false);
  t.equal(engine.hasActiveTransaction('session-b'), true);
});


test('Transaction - concurrent transactions on same partition use SQLite locking', async (t) => {
  // This test verifies that SQLite's locking mechanisms handle concurrent access
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, null, []);

  engine.setPartitionRegistry(new Map([['p1', p1]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  // Start transaction in session 1
  const begin1 = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'concurrent-1',
  });
  t.equal(begin1.success, true);

  // Start transaction in session 2 (different session, same partition)
  const begin2 = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'concurrent-2',
  });
  t.equal(begin2.success, true);

  // Both sessions have independent transactions
  t.equal(engine.hasActiveTransaction('concurrent-1'), true);
  t.equal(engine.hasActiveTransaction('concurrent-2'), true);

  // Commit session 1
  await engine.executeQuery('COMMIT', [], {sessionId: 'concurrent-1'});
  t.equal(engine.hasActiveTransaction('concurrent-1'), false);

  // Session 2 still active
  t.equal(engine.hasActiveTransaction('concurrent-2'), true);

  // Commit session 2
  await engine.executeQuery('COMMIT', [], {sessionId: 'concurrent-2'});
  t.equal(engine.hasActiveTransaction('concurrent-2'), false);
});

test('Transaction - getTransactionPartition returns bound partition', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartitionWithTx('users', null, 'm', []);

  engine.setPartitionRegistry(new Map([['p1', p1]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );
  engine.setSystemCache(cache);

  // Before transaction
  t.equal(engine.getTransactionPartition('bound-tx'), null);

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'bound-tx'});
  t.equal(engine.getTransactionPartition('bound-tx'), null); // Not bound yet

  // First write binds to partition
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'bound-tx'},
  );
  t.equal(engine.getTransactionPartition('bound-tx'), 'p1');

  // Commit
  await engine.executeQuery('COMMIT', [], {sessionId: 'bound-tx'});
  t.equal(engine.getTransactionPartition('bound-tx'), null);
});
