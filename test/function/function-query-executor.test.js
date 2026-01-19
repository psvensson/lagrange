/**
 * Tests for FunctionQueryExecutor.
 * Requirements: 34.6, 34.7, 34.8, 34.9
 */

import {test} from 'tap';
import {FunctionQueryExecutor} from '../../src/function/function-query-executor.js';

// Mock SQL query engine
function createMockSqlEngine(results = []) {
  return {
    executeQuery: async (sql, _params) => {
      if (sql.includes('ERROR')) {
        throw new Error('Query error');
      }
      if (sql.includes('SLOW')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        results,
        affectedRows: results.length,
        partitions: ['p1', 'p2'],
      };
    },
    executeStreaming: async (sql, _params, callback, options) => {
      const batchSize = options?.batchSize || 100;
      for (let i = 0; i < results.length; i += batchSize) {
        await callback(results.slice(i, i + batchSize));
      }
    },
  };
}

// Mock function registry
function createMockFunctionRegistry() {
  const invocations = [];
  return {
    invoke: async (functionId, context) => {
      invocations.push({functionId, context});
      if (functionId === 'error-func') {
        throw new Error('Function error');
      }
      return {success: true};
    },
    getInvocations: () => invocations,
  };
}

test('FunctionQueryExecutor - constructor', async (t) => {
  const executor = new FunctionQueryExecutor();

  t.equal(executor.isInitialized(), false, 'Should not be initialized');
  t.equal(executor.sqlQueryEngine, null, 'Should have no engine');
});

test('FunctionQueryExecutor - initialize', async (t) => {
  const engine = createMockSqlEngine();
  const registry = createMockFunctionRegistry();
  const executor = new FunctionQueryExecutor();

  executor.initialize({
    sqlQueryEngine: engine,
    functionRegistry: registry,
  });

  t.equal(executor.isInitialized(), true, 'Should be initialized');
  t.ok(executor.sqlQueryEngine, 'Should have engine');
  t.ok(executor.functionRegistry, 'Should have registry');
});

test('FunctionQueryExecutor - executeQuery returns results', async (t) => {
  const testData = [{id: 1, name: 'test'}];
  const engine = createMockSqlEngine(testData);
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  const result = await executor.executeQuery('SELECT * FROM test');

  t.equal(result.success, true, 'Should succeed');
  t.same(result.rows, testData, 'Should return rows');
  t.ok(result.partitions, 'Should have partitions');
});

test('FunctionQueryExecutor - executeQuery with params', async (t) => {
  const engine = createMockSqlEngine([{id: 1}]);
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  const result = await executor.executeQuery(
    'SELECT * FROM test WHERE id = ?',
    [1],
  );

  t.equal(result.success, true, 'Should succeed');
  t.equal(result.rows.length, 1, 'Should return 1 row');
});

test('FunctionQueryExecutor - executeQuery throws on error', async (t) => {
  const engine = createMockSqlEngine();
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  await t.rejects(
    executor.executeQuery('SELECT ERROR'),
    /Query error/,
    'Should throw on error',
  );
});

test('FunctionQueryExecutor - executeQuery throws without engine', async (t) => {
  const executor = new FunctionQueryExecutor();

  await t.rejects(
    executor.executeQuery('SELECT 1'),
    /SQL query engine not available/,
    'Should throw without engine',
  );
});

test('FunctionQueryExecutor - executeQueryWithCallback streams batches', async (t) => {
  const testData = [
    {id: 1}, {id: 2}, {id: 3}, {id: 4}, {id: 5},
  ];
  const engine = createMockSqlEngine(testData);
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  const batches = [];
  const result = await executor.executeQueryWithCallback(
    'SELECT * FROM test',
    [],
    async (rows) => batches.push(rows),
    {batchSize: 2},
  );

  t.equal(result.success, true, 'Should succeed');
  t.equal(result.totalRows, 5, 'Should count all rows');
  t.ok(batches.length >= 1, 'Should have batches');
});

test('FunctionQueryExecutor - executeQueryWithCallback requires callback', async (t) => {
  const engine = createMockSqlEngine();
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  await t.rejects(
    executor.executeQueryWithCallback('SELECT 1', [], 'not-a-function'),
    /Callback must be a function/,
    'Should require function callback',
  );
});

test('FunctionQueryExecutor - executeQueryThenInvoke calls function', async (t) => {
  const testData = [{id: 1}];
  const engine = createMockSqlEngine(testData);
  const registry = createMockFunctionRegistry();
  const executor = new FunctionQueryExecutor({
    sqlQueryEngine: engine,
    functionRegistry: registry,
  });

  const result = await executor.executeQueryThenInvoke(
    'SELECT * FROM test',
    [],
    'my-function',
    {extra: 'context'},
  );

  t.equal(result.success, true, 'Should succeed');
  t.ok(result.invocationId, 'Should have invocation ID');
  t.equal(result.functionInvoked, true, 'Should invoke function');

  const invocations = registry.getInvocations();
  t.equal(invocations.length, 1, 'Should have 1 invocation');
  t.equal(invocations[0].functionId, 'my-function', 'Should call correct function');
  t.ok(invocations[0].context.queryResult, 'Should pass query result');
  t.equal(invocations[0].context.extra, 'context', 'Should pass extra context');
});

test('FunctionQueryExecutor - executeQueryThenInvoke handles function error', async (t) => {
  const engine = createMockSqlEngine([{id: 1}]);
  const registry = createMockFunctionRegistry();
  const executor = new FunctionQueryExecutor({
    sqlQueryEngine: engine,
    functionRegistry: registry,
  });

  const result = await executor.executeQueryThenInvoke(
    'SELECT * FROM test',
    [],
    'error-func',
    {},
  );

  t.equal(result.success, false, 'Should not succeed');
  t.equal(result.functionInvoked, false, 'Should not mark as invoked');
  t.ok(result.error, 'Should have error message');
  t.ok(result.queryResult, 'Should still have query result');
});

test('FunctionQueryExecutor - executeQueryThenInvoke throws without registry', async (t) => {
  const engine = createMockSqlEngine();
  const executor = new FunctionQueryExecutor({sqlQueryEngine: engine});

  await t.rejects(
    executor.executeQueryThenInvoke('SELECT 1', [], 'func'),
    /Function registry not available/,
    'Should throw without registry',
  );
});
