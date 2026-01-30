/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data for routing
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions, services) {
  return {
    tables,
    partitions,
    services: services || partitions.map((p) => ({
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    })),
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
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

test('SQLQueryEngine - executes SELECT query', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - routes SELECT with key filter to single partition', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 'bob', name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes INSERT and routes to correct partition', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', []);
  mockPartitionData.set('p2', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1'); // 'alice' < 'm'

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - routes INSERT to multiple partitions', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', []);
  mockPartitionData.set('p2', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes UPDATE with key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes UPDATE on all partitions without key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes DELETE with key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('DELETE FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');
  t.equal(result.partitions.length, 1);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - returns error for non-existent table', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM nonexistent');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - handles transaction statements', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

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
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('INVALID SQL STATEMENT');

  t.equal(result.success, false);
  t.ok(result.errorCode);
});

test('SQLQueryEngine - parse method returns AST', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const ast = engine.parse('SELECT id, name FROM users WHERE age > 18');

  t.equal(ast.type, 'SELECT');
  t.ok(ast.columns);
  t.ok(ast.from);
  t.ok(ast.where);
});

test('SQLQueryEngine - resolvePartitions method works', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const partitions = engine.resolvePartitions('users', null);

  t.equal(partitions.length, 2);
});

test('SQLQueryEngine - throws error when system cache not available', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: null,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('System cache not available'));
});

test('SQLQueryEngine - returns empty array when no partitions found in cache', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});
