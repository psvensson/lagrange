/**
 * Unit tests for QueryOptimizer.
 * Tests index-based query optimization.
 * Requirements: 12.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {QueryOptimizer} from '../../src/index-management/query-optimizer.js';
import {DistributedQueryPlanner} from '../../src/query/distributed/distributed-query-planner.js';
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

test('QueryOptimizer - compound index matching follows strict left-prefix rules', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-compound',
      tableId: 'metrics',
      indexName: 'idx_metrics_a_b_c',
      columnNames: ['a', 'b', 'c'],
      indexType: 'btree',
      state: 'READABLE',
    },
  ]);
  const optimizer = new QueryOptimizer({indexService});

  // 1. leading column equality
  const q1 = optimizer.analyzeQuery(parseSQL('SELECT * FROM metrics WHERE a = 1'), 'metrics');
  t.ok(q1.selectedIndex, 'Should match leading column a');
  t.equal(q1.selectedIndex.indexName, 'idx_metrics_a_b_c');
  t.same(q1.selectedIndex.matchedColumns, ['a']);
  t.same(q1.selectedIndex.equalityPrefixColumns, ['a']);
  t.equal(q1.selectedIndex.rangeColumn, null);

  // 2. equality on a and b
  const q2 = optimizer.analyzeQuery(parseSQL('SELECT * FROM metrics WHERE a = 1 AND b = 2'), 'metrics');
  t.same(q2.selectedIndex.matchedColumns, ['a', 'b']);
  t.same(q2.selectedIndex.equalityPrefixColumns, ['a', 'b']);
  t.equal(q2.selectedIndex.rangeColumn, null);

  // 3. equality on a and range on b
  const q3 = optimizer.analyzeQuery(parseSQL('SELECT * FROM metrics WHERE a = 1 AND b > 5'), 'metrics');
  t.same(q3.selectedIndex.matchedColumns, ['a', 'b']);
  t.same(q3.selectedIndex.equalityPrefixColumns, ['a']);
  t.equal(q3.selectedIndex.rangeColumn, 'b');

  // 4. equality on a, range on b, condition on c (c cannot narrow index scan)
  const q4 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM metrics WHERE a = 1 AND b > 5 AND c = 3'),
    'metrics',
  );
  t.same(q4.selectedIndex.matchedColumns, ['a', 'b']);
  t.same(q4.selectedIndex.equalityPrefixColumns, ['a']);
  t.equal(q4.selectedIndex.rangeColumn, 'b');

  // 5. single-value IN treated as equality prefix
  const q5 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM metrics WHERE a IN (1) AND b = 2'),
    'metrics',
  );
  t.same(q5.selectedIndex.matchedColumns, ['a', 'b']);
  t.same(q5.selectedIndex.equalityPrefixColumns, ['a', 'b']);

  // 6. missing leading column: WHERE b = 2
  const q6 = optimizer.analyzeQuery(parseSQL('SELECT * FROM metrics WHERE b = 2'), 'metrics');
  t.equal(q6.selectedIndex, null);
  t.ok(q6.rejectedIndexes.some(
    (r) => r.indexName === 'idx_metrics_a_b_c' && r.reason === 'MISSING_LEADING_COLUMN',
  ));

  // 7. missing leading column: WHERE c = 3
  const q7 = optimizer.analyzeQuery(parseSQL('SELECT * FROM metrics WHERE c = 3'), 'metrics');
  t.equal(q7.selectedIndex, null);
  t.ok(q7.rejectedIndexes.some(
    (r) => r.indexName === 'idx_metrics_a_b_c' && r.reason === 'MISSING_LEADING_COLUMN',
  ));

  // 8. missing leading column: WHERE b = 2 AND c = 3
  const q8 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM metrics WHERE b = 2 AND c = 3'),
    'metrics',
  );
  t.equal(q8.selectedIndex, null);
  t.ok(q8.rejectedIndexes.some(
    (r) => r.indexName === 'idx_metrics_a_b_c' && r.reason === 'MISSING_LEADING_COLUMN',
  ));

  // 9. top-level OR disjunction: WHERE a = 1 OR b = 2
  const q9 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM metrics WHERE a = 1 OR b = 2'),
    'metrics',
  );
  t.equal(q9.selectedIndex, null);
  t.ok(q9.rejectedIndexes.some(
    (r) => r.indexName === 'idx_metrics_a_b_c' && r.reason === 'MISSING_LEADING_COLUMN',
  ));
});

test('QueryOptimizer - compound index ORDER BY ordering checks remaining columns', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-compound',
      tableId: 'items',
      indexName: 'idx_items_a_b_c',
      columnNames: ['a', 'b', 'c'],
      indexType: 'btree',
      state: 'READABLE',
    },
  ]);
  const optimizer = new QueryOptimizer({indexService});

  // a = 1 ORDER BY b -> b matches next column
  const q1 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM items WHERE a = 1 ORDER BY b'),
    'items',
  );
  t.equal(q1.selectedIndex?.orderBySatisfied, true, 'ORDER BY b should be satisfied');

  // a = 1 AND b = 2 ORDER BY c -> c matches next column
  const q2 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM items WHERE a = 1 AND b = 2 ORDER BY c'),
    'items',
  );
  t.equal(q2.selectedIndex?.orderBySatisfied, true, 'ORDER BY c should be satisfied');

  // a = 1 ORDER BY c -> c does not match next column (b skipped)
  const q3 = optimizer.analyzeQuery(
    parseSQL('SELECT * FROM items WHERE a = 1 ORDER BY c'),
    'items',
  );
  t.equal(
    q3.selectedIndex?.orderBySatisfied,
    false,
    'ORDER BY c should NOT be satisfied when b skipped',
  );
});

test('DistributedQueryPlanner - surfaces indexAccess, selectedIndex, and rejectedIndexes in plans and EXPLAIN', async (t) => {
  const indexService = createMockIndexService([
    {
      indexId: 'idx-1',
      tableId: 'users',
      indexName: 'idx_users_tenant_created',
      columnNames: ['tenant_id', 'created_at'],
      indexType: 'btree',
      state: 'READABLE',
    },
    {
      indexId: 'idx-2',
      tableId: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
      state: 'BUILDING',
    },
  ]);
  const optimizer = new QueryOptimizer({indexService});
  const planner = new DistributedQueryPlanner({
    queryOptimizer: optimizer,
    getTablePartitions: () => [{partition_id: 'p1'}],
  });

  const ast1 = parseSQL(
    'SELECT * FROM users WHERE tenant_id = \'org-1\' ORDER BY created_at',
  );
  const plan1 = planner.planSelect(ast1);

  t.equal(plan1.selectedIndex?.name, 'idx_users_tenant_created');
  t.equal(plan1.selectedIndex?.scanType, 'INDEX_SCAN');
  t.same(plan1.selectedIndex?.matchedColumns, ['tenant_id']);
  t.equal(plan1.indexAccess?.scanType, 'INDEX_SCAN');
  t.ok(plan1.rejectedIndexes.some(
    (r) => r.name === 'idx_users_email' && r.reason === 'NON_READABLE_INDEX_STATE',
  ));

  // Test deterministic methods
  const readPlan = planner.createReadExecutionPlan(ast1);
  t.equal(readPlan.selectedIndex?.name, 'idx_users_tenant_created');

  const explainPlan = planner.buildExplainPlan(ast1);
  t.equal(explainPlan.diagnostics.explain, true);
  t.equal(explainPlan.diagnostics.selectedIndex?.name, 'idx_users_tenant_created');
  t.equal(explainPlan.diagnostics.indexAccess?.scanType, 'INDEX_SCAN');

  // Unindexed query falls back to FULL_SCAN
  const ast2 = parseSQL('SELECT * FROM users WHERE status = \'active\'');
  const plan2 = planner.planSelect(ast2);
  t.equal(plan2.selectedIndex, null);
  t.equal(plan2.indexAccess?.scanType, 'FULL_SCAN');
  t.ok(plan2.rejectedIndexes.some(
    (r) => r.name === 'idx_users_tenant_created' && r.reason === 'MISSING_LEADING_COLUMN',
  ));
});
