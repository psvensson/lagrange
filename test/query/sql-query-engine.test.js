/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from 'tap';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition service
function createMockPartition(tableName, keyStart, keyEnd, data = []) {
  return {
    tableName,
    keyRange: {start: keyStart, end: keyEnd},
    data,
    executeQuery: async function(sql, _params) {
      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: this.data, changes: 0};
      }
      return {rows: [], changes: this.data.length || 1};
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

test('SQLQueryEngine - executes SELECT query', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', [{id: 1, name: 'Alice'}]);
  const p2 = createMockPartition('users', 'm', null, [{id: 2, name: 'Bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);
});

test('SQLQueryEngine - routes SELECT with key filter to single partition', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', [{id: 'alice', name: 'Alice'}]);
  const p2 = createMockPartition('users', 'm', null, [{id: 'bob', name: 'Bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery('SELECT * FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');
});

test('SQLQueryEngine - executes INSERT and routes to correct partition', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', []);
  const p2 = createMockPartition('users', 'm', null, []);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1'); // 'alice' < 'm'
});

test('SQLQueryEngine - routes INSERT to multiple partitions', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', []);
  const p2 = createMockPartition('users', 'm', null, []);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);
});

test('SQLQueryEngine - executes UPDATE with key filter', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', [{id: 'alice'}]);
  const p2 = createMockPartition('users', 'm', null, [{id: 'bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');
});

test('SQLQueryEngine - executes UPDATE on all partitions without key filter', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', [{id: 'alice'}]);
  const p2 = createMockPartition('users', 'm', null, [{id: 'bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);
});

test('SQLQueryEngine - executes DELETE with key filter', async (t) => {
  const engine = new SQLQueryEngine();

  const p1 = createMockPartition('users', null, 'm', [{id: 'alice'}]);
  const p2 = createMockPartition('users', 'm', null, [{id: 'bob'}]);

  engine.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const result = await engine.executeQuery('DELETE FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');
  t.equal(result.partitions.length, 1);
});

test('SQLQueryEngine - returns error for non-existent table', async (t) => {
  const engine = new SQLQueryEngine();
  engine.setPartitionRegistry(new Map());

  const cache = createMockSystemCache([], []);
  engine.setSystemCache(cache);

  const result = await engine.executeQuery('SELECT * FROM nonexistent');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - handles transaction statements', async (t) => {
  const engine = new SQLQueryEngine();

  const beginResult = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult.success, true);
  t.equal(beginResult.operation, 'BEGIN_TRANSACTION');

  const commitResult = await engine.executeQuery('COMMIT');
  t.equal(commitResult.success, true);
  t.equal(commitResult.operation, 'COMMIT');

  // Start a new transaction before testing ROLLBACK
  const beginResult2 = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult2.success, true);
  t.equal(beginResult2.operation, 'BEGIN_TRANSACTION');

  const rollbackResult = await engine.executeQuery('ROLLBACK');
  t.equal(rollbackResult.success, true);
  t.equal(rollbackResult.operation, 'ROLLBACK');
});

test('SQLQueryEngine - returns syntax error for invalid SQL', async (t) => {
  const engine = new SQLQueryEngine();

  const result = await engine.executeQuery('INVALID SQL STATEMENT');

  t.equal(result.success, false);
  t.ok(result.errorCode);
});

test('SQLQueryEngine - parse method returns AST', async (t) => {
  const engine = new SQLQueryEngine();

  const ast = engine.parse('SELECT id, name FROM users WHERE age > 18');

  t.equal(ast.type, 'SELECT');
  t.ok(ast.columns);
  t.ok(ast.from);
  t.ok(ast.where);
});

test('SQLQueryEngine - resolvePartitions method works', async (t) => {
  const engine = new SQLQueryEngine();

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  engine.setSystemCache(cache);

  const partitions = engine.resolvePartitions('users', null);

  t.equal(partitions.length, 2);
});

