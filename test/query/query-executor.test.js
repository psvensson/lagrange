/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from 'tap';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition service
function createMockPartition(data = []) {
  return {
    data,
    executeQuery: async function(sql, _params) {
      // Simple mock that returns stored data for SELECT
      if (sql.toUpperCase().startsWith('SELECT')) {
        return {rows: this.data, changes: 0};
      }
      // For INSERT/UPDATE/DELETE, return changes count
      return {rows: [], changes: this.data.length || 1};
    },
  };
}

// Helper to parse SQL
function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

test('QueryExecutor - executes SELECT on single partition', async (t) => {
  const executor = new QueryExecutor();
  const partition = createMockPartition([
    {id: 1, name: 'Alice', age: 30},
    {id: 2, name: 'Bob', age: 25},
  ]);
  executor.setPartitionRegistry(new Map([['p1', partition]]));

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);
  t.equal(result.partitions.length, 1);
});

test('QueryExecutor - executes SELECT on multiple partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1, name: 'Alice'}]);
  const p2 = createMockPartition([{id: 2, name: 'Bob'}]);
  const p3 = createMockPartition([{id: 3, name: 'Charlie'}]);

  executor.setPartitionRegistry(new Map([
    ['p1', p1],
    ['p2', p2],
    ['p3', p3],
  ]));

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2', 'p3']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 3);
  t.equal(result.partitions.length, 3);
});

test('QueryExecutor - returns empty for no partitions', async (t) => {
  const executor = new QueryExecutor();

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, []);

  t.equal(result.success, true);
  t.equal(result.rows.length, 0);
});

test('QueryExecutor - handles missing partition gracefully', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1, name: 'Alice'}]);
  executor.setPartitionRegistry(new Map([['p1', p1]]));

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'missing']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 1); // Only p1 returns data
});

test('QueryExecutor - applies ORDER BY across partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([
    {id: 3, name: 'Charlie'},
    {id: 1, name: 'Alice'},
  ]);
  const p2 = createMockPartition([
    {id: 2, name: 'Bob'},
    {id: 4, name: 'Diana'},
  ]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT * FROM users ORDER BY name ASC');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 4);
  t.equal(result.rows[0].name, 'Alice');
  t.equal(result.rows[1].name, 'Bob');
  t.equal(result.rows[2].name, 'Charlie');
  t.equal(result.rows[3].name, 'Diana');
});

test('QueryExecutor - applies ORDER BY DESC', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1, age: 30}, {id: 2, age: 20}]);
  const p2 = createMockPartition([{id: 3, age: 25}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT * FROM users ORDER BY age DESC');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0].age, 30);
  t.equal(result.rows[1].age, 25);
  t.equal(result.rows[2].age, 20);
});

test('QueryExecutor - applies LIMIT across partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1}, {id: 2}]);
  const p2 = createMockPartition([{id: 3}, {id: 4}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT * FROM users LIMIT 2');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 2);
});

test('QueryExecutor - applies LIMIT with OFFSET', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1}, {id: 2}]);
  const p2 = createMockPartition([{id: 3}, {id: 4}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT * FROM users LIMIT 2 OFFSET 1');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 2);
  // Rows 2, 3 (skipping first row)
});

test('QueryExecutor - applies DISTINCT across partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{status: 'active'}, {status: 'inactive'}]);
  const p2 = createMockPartition([{status: 'active'}, {status: 'pending'}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT DISTINCT status FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 3); // active, inactive, pending
});

test('QueryExecutor - computes COUNT aggregate', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1}, {id: 2}]);
  const p2 = createMockPartition([{id: 3}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT COUNT(*) FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 1);
  t.equal(result.rows[0]['COUNT(*)'], 3);
});

test('QueryExecutor - computes SUM aggregate', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{amount: 100}, {amount: 200}]);
  const p2 = createMockPartition([{amount: 150}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT SUM(amount) FROM orders');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0]['SUM(amount)'], 450);
});

test('QueryExecutor - computes AVG aggregate', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{score: 80}, {score: 90}]);
  const p2 = createMockPartition([{score: 100}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT AVG(score) FROM tests');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0]['AVG(score)'], 90);
});

test('QueryExecutor - computes MIN/MAX aggregates', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{price: 50}, {price: 100}]);
  const p2 = createMockPartition([{price: 75}]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const minAst = parseSQL('SELECT MIN(price) FROM products');
  const minResult = await executor.executeSelect(minAst, ['p1', 'p2']);
  t.equal(minResult.rows[0]['MIN(price)'], 50);

  const maxAst = parseSQL('SELECT MAX(price) FROM products');
  const maxResult = await executor.executeSelect(maxAst, ['p1', 'p2']);
  t.equal(maxResult.rows[0]['MAX(price)'], 100);
});

test('QueryExecutor - applies GROUP BY across partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([
    {category: 'A', amount: 100},
    {category: 'B', amount: 50},
  ]);
  const p2 = createMockPartition([
    {category: 'A', amount: 150},
    {category: 'C', amount: 75},
  ]);

  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('SELECT category, SUM(amount) FROM sales GROUP BY category');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 3); // A, B, C

  const catA = result.rows.find((r) => r.category === 'A');
  t.equal(catA['SUM(amount)'], 250);
});

test('QueryExecutor - executes INSERT on partition', async (t) => {
  const executor = new QueryExecutor();
  const partition = createMockPartition([]);
  executor.setPartitionRegistry(new Map([['p1', partition]]));

  const ast = parseSQL('INSERT INTO users (id, name) VALUES (1, \'Alice\')');
  const result = await executor.executeInsert(ast, 'p1');

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.ok(result.affectedRows >= 1);
});

test('QueryExecutor - executes UPDATE on partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1}]);
  const p2 = createMockPartition([{id: 2}]);
  executor.setPartitionRegistry(new Map([['p1', p1], ['p2', p2]]));

  const ast = parseSQL('UPDATE users SET status = \'active\' WHERE id > 0');
  const result = await executor.executeUpdate(ast, ['p1', 'p2']);

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 2);
});

test('QueryExecutor - executes DELETE on partitions', async (t) => {
  const executor = new QueryExecutor();
  const p1 = createMockPartition([{id: 1}]);
  executor.setPartitionRegistry(new Map([['p1', p1]]));

  const ast = parseSQL('DELETE FROM users WHERE id = 1');
  const result = await executor.executeDelete(ast, ['p1']);

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');
});

test('QueryExecutor - throws for INSERT on missing partition', async (t) => {
  const executor = new QueryExecutor();
  executor.setPartitionRegistry(new Map());

  const ast = parseSQL('INSERT INTO users (id) VALUES (1)');

  await t.rejects(
    executor.executeInsert(ast, 'missing'),
    /Partition not found/,
  );
});

test('QueryExecutor - builds correct SELECT SQL', async (t) => {
  const executor = new QueryExecutor();

  // Test with a simple query
  const ast = parseSQL('SELECT id, name FROM users WHERE age > 18 ORDER BY name LIMIT 10');

  // Access private method for testing
  const sql = executor.buildSelectSQL(ast);

  t.ok(sql.includes('SELECT'));
  t.ok(sql.includes('id'));
  t.ok(sql.includes('name'));
  t.ok(sql.includes('FROM users'));
  t.ok(sql.includes('WHERE'));
  t.ok(sql.includes('ORDER BY'));
  t.ok(sql.includes('LIMIT 10'));
});

test('QueryExecutor - handles partition query errors', async (t) => {
  const executor = new QueryExecutor();
  const errorPartition = {
    executeQuery: async () => {
      throw new Error('Database error');
    },
  };
  executor.setPartitionRegistry(new Map([['p1', errorPartition]]));

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  // Should not throw, but return empty rows for failed partition
  t.equal(result.success, true);
  t.equal(result.rows.length, 0);
});

