/**
 * Unit tests for QueryOptimizer.
 * Tests index-based query optimization.
 * Requirements: 12.4
 */

import {test, beforeEach, afterEach} from 'tap';
import {QueryOptimizer} from '../../src/index-management/query-optimizer.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock index service with predefined indices.
 */
function createMockIndexService(indices = []) {
  return {
    getIndicesForTable(tableId) {
      return indices.filter((idx) => idx.tableId === tableId);
    },
  };
}

/**
 * Parse a SQL query into AST.
 */
function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

test('QueryOptimizer - analyzes SELECT with WHERE clause', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users WHERE email = \'test@example.com\'');
  const result = optimizer.analyzeQuery(ast, 'users');

  t.equal(result.usableIndices.length, 1, 'Should find one usable index');
  t.equal(result.usableIndices[0].indexName, 'idx_users_email', 'Should use email index');
  t.equal(result.usableIndices[0].usage, 'where', 'Should be used for WHERE');
  t.equal(result.estimatedCost, 'index_scan', 'Should estimate index scan');
});

test('QueryOptimizer - suggests index when none available', async (t) => {
  const indexService = createMockIndexService([]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users WHERE email = \'test@example.com\'');
  const result = optimizer.analyzeQuery(ast, 'users');

  t.equal(result.usableIndices.length, 0, 'Should find no usable indices');
  t.ok(result.hints.length > 0, 'Should provide hints');
  t.match(result.hints[0], /email/, 'Hint should mention email column');
});

test('QueryOptimizer - analyzes SELECT with ORDER BY', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_created',
      columnNames: ['created_at'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users ORDER BY created_at DESC');
  const result = optimizer.analyzeQuery(ast, 'users');

  const orderByIndex = result.usableIndices.find((i) => i.usage === 'order_by');
  t.ok(orderByIndex, 'Should find index for ORDER BY');
  t.equal(orderByIndex.indexName, 'idx_users_created', 'Should use created_at index');
});

test('QueryOptimizer - analyzes compound index', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'orders',
      indexName: 'idx_orders_customer_date',
      columnNames: ['customer_id', 'order_date'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  // Query using first column of compound index
  const ast1 = parseSQL('SELECT * FROM orders WHERE customer_id = 123');
  const result1 = optimizer.analyzeQuery(ast1, 'orders');

  t.equal(result1.usableIndices.length, 1, 'Should use compound index for first column');

  // Query using both columns
  const ast2 = parseSQL(
    'SELECT * FROM orders WHERE customer_id = 123 AND order_date = \'2024-01-01\'',
  );
  const result2 = optimizer.analyzeQuery(ast2, 'orders');

  t.equal(result2.usableIndices.length, 1, 'Should use compound index for both columns');
});

test('QueryOptimizer - analyzes UPDATE query', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_id',
      columnNames: ['id'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('UPDATE users SET name = \'John\' WHERE id = 1');
  const result = optimizer.analyzeQuery(ast, 'users');

  t.equal(result.usableIndices.length, 1, 'Should find usable index for UPDATE');
  t.equal(result.usableIndices[0].usage, 'where', 'Should be used for WHERE');
});

test('QueryOptimizer - analyzes DELETE query', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_status',
      columnNames: ['status'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('DELETE FROM users WHERE status = \'inactive\'');
  const result = optimizer.analyzeQuery(ast, 'users');

  t.equal(result.usableIndices.length, 1, 'Should find usable index for DELETE');
});

test('QueryOptimizer - suggestIndices returns suggestions', async (t) => {
  const indexService = createMockIndexService([]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users WHERE email = \'test@example.com\' ORDER BY name');
  const suggestions = optimizer.suggestIndices(ast, 'users');

  t.ok(suggestions.length >= 1, 'Should suggest at least one index');

  const whereSuggestion = suggestions.find((s) => s.reason.includes('WHERE'));
  t.ok(whereSuggestion, 'Should suggest index for WHERE clause');
  t.ok(whereSuggestion.columns.includes('email'), 'Should suggest email column');
});

test('QueryOptimizer - getExecutionPlan returns complete plan', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users WHERE email = \'test@example.com\'');
  const plan = optimizer.getExecutionPlan(ast, 'users');

  t.equal(plan.queryType, 'SELECT', 'Should have correct query type');
  t.equal(plan.tableId, 'users', 'Should have correct table ID');
  t.equal(plan.estimatedCost, 'index_scan', 'Should estimate index scan');
  t.ok(plan.usedIndices.length > 0, 'Should have used indices');
  t.ok(Array.isArray(plan.hints), 'Should have hints array');
  t.ok(Array.isArray(plan.suggestions), 'Should have suggestions array');
});

test('QueryOptimizer - handles query without WHERE clause', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users');
  const result = optimizer.analyzeQuery(ast, 'users');

  // No WHERE clause means no index can be used for filtering
  const whereIndices = result.usableIndices.filter((i) => i.usage === 'where');
  t.equal(whereIndices.length, 0, 'Should not find index for WHERE when no WHERE clause');
  t.equal(result.estimatedCost, 'full_scan', 'Should estimate full scan');
});

test('QueryOptimizer - handles null/undefined inputs', async (t) => {
  const optimizer = new QueryOptimizer({});

  const result1 = optimizer.analyzeQuery(null, 'users');
  t.same(result1.usableIndices, [], 'Should return empty for null AST');

  const result2 = optimizer.analyzeQuery({type: 'SELECT'}, null);
  t.same(result2.usableIndices, [], 'Should return empty for null tableId');
});

test('QueryOptimizer - does not suggest existing indices', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL('SELECT * FROM users WHERE email = \'test@example.com\'');
  const suggestions = optimizer.suggestIndices(ast, 'users');

  // Should not suggest an index that already exists
  const emailSuggestion = suggestions.find((s) =>
    s.columns.length === 1 && s.columns[0] === 'email',
  );
  t.notOk(emailSuggestion, 'Should not suggest existing index');
});

test('QueryOptimizer - analyzes JOIN conditions', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'orders',
      indexName: 'idx_orders_user_id',
      columnNames: ['user_id'],
      indexType: 'btree',
    },
  ]);

  const optimizer = new QueryOptimizer({indexService});

  const ast = parseSQL(
    'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
  );
  const result = optimizer.analyzeQuery(ast, 'orders');

  const joinIndex = result.usableIndices.find((i) => i.usage === 'join');
  t.ok(joinIndex, 'Should find index for JOIN');
});
