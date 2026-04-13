/**
 * Property-based test for Query Then Invoke Continuation.
 * **Property 38: Query Then Invoke Continuation**
 * **Validates: Requirements 34.9**
 *
 * Property: For any executeQueryThenInvoke call with valid SQL and function ID,
 * the query executes and the specified function is invoked with query results
 * in context.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FunctionQueryExecutor} from '../../src/function/function-query-executor.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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
 * Create a mock SQL query engine that returns specified results.
 * @param {Array} results - Results to return from queries.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlEngine(results = []) {
  return {
    executeQuery: async (_sql, _params) => {
      return {
        results,
        affectedRows: results.length,
        partitions: ['p1', 'p2'],
      };
    },
  };
}

/**
 * Create a mock function registry that tracks invocations.
 * @return {Object} Mock function registry with invocation tracking.
 */
function createMockFunctionRegistry() {
  const invocations = [];
  return {
    invoke: async (functionId, context) => {
      invocations.push({functionId, context, timestamp: Date.now()});
      return {success: true};
    },
    getInvocations: () => invocations,
    clearInvocations: () => invocations.length = 0,
  };
}

/**
 * Arbitrary for valid function IDs.
 */
const functionIdArbitrary = fc.uuid();

/**
 * Arbitrary for simple SQL SELECT statements.
 */
const sqlSelectArbitrary = fc.record({
  tableName: fc.string({minLength: 1, maxLength: 20})
    .filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
  columns: fc.constantFrom('*', 'id', 'name', 'value'),
}).map(({tableName, columns}) => `SELECT ${columns} FROM ${tableName}`);

/**
 * Arbitrary for query parameters.
 */
const queryParamsArbitrary = fc.array(
  fc.oneof(
    fc.string({maxLength: 50}),
    fc.integer(),
    fc.boolean(),
  ),
  {minLength: 0, maxLength: 5},
);

/**
 * Arbitrary for query result rows.
 */
const queryResultRowArbitrary = fc.record({
  id: fc.integer({min: 1, max: 10000}),
  name: fc.string({minLength: 1, maxLength: 30}),
  value: fc.oneof(fc.integer(), fc.string({maxLength: 20})),
});

/**
 * Arbitrary for query results (array of rows).
 */
const queryResultsArbitrary = fc.array(queryResultRowArbitrary, {
  minLength: 0,
  maxLength: 20,
});

/**
 * Arbitrary for additional context to pass to the function.
 */
const additionalContextArbitrary = fc.record({
  requestId: fc.option(fc.uuid(), {nil: undefined}),
  userId: fc.option(fc.string({minLength: 1, maxLength: 20}), {nil: undefined}),
  metadata: fc.option(fc.record({
    source: fc.string({maxLength: 20}),
    priority: fc.integer({min: 1, max: 10}),
  }), {nil: undefined}),
});

/**
 * Feature: distributed-database-system
 * Property 38: Query Then Invoke Continuation
 *
 * For any executeQueryThenInvoke call with valid SQL and function ID,
 * the query executes and the specified function is invoked with query
 * results in context.
 */
test('Property 38: executeQueryThenInvoke invokes function with results', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sqlSelectArbitrary,
      queryParamsArbitrary,
      functionIdArbitrary,
      queryResultsArbitrary,
      additionalContextArbitrary,
      async (sql, params, functionId, queryResults, additionalContext) => {
        const engine = createMockSqlEngine(queryResults);
        const registry = createMockFunctionRegistry();
        const executor = new FunctionQueryExecutor({
          sqlQueryEngine: engine,
          functionRegistry: registry,
        });

        const result = await executor.executeQueryThenInvoke(
          sql,
          params,
          functionId,
          additionalContext,
        );

        // Verify the result structure
        if (!result.invocationId) {
          return false;
        }
        if (result.success !== true) {
          return false;
        }
        if (result.functionInvoked !== true) {
          return false;
        }

        // Verify the function was invoked exactly once
        const invocations = registry.getInvocations();
        if (invocations.length !== 1) {
          return false;
        }

        // Verify the correct function was invoked
        const invocation = invocations[0];
        if (invocation.functionId !== functionId) {
          return false;
        }

        // Verify query results are in context
        if (!invocation.context.queryResult) {
          return false;
        }

        // Verify query result contains the expected rows
        const contextRows = invocation.context.queryResult.rows;
        if (contextRows.length !== queryResults.length) {
          return false;
        }

        // Verify invocation ID is passed to function
        if (invocation.context.invocationId !== result.invocationId) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('executeQueryThenInvoke invokes function with query results');
});

/**
 * Property: Additional context is passed through to the invoked function.
 */
test('Property 38: additional context passed to invoked function', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sqlSelectArbitrary,
      functionIdArbitrary,
      queryResultsArbitrary,
      fc.record({
        customField: fc.string({minLength: 1, maxLength: 30}),
        numericValue: fc.integer(),
        nested: fc.record({
          inner: fc.string({maxLength: 20}),
        }),
      }),
      async (sql, functionId, queryResults, additionalContext) => {
        const engine = createMockSqlEngine(queryResults);
        const registry = createMockFunctionRegistry();
        const executor = new FunctionQueryExecutor({
          sqlQueryEngine: engine,
          functionRegistry: registry,
        });

        await executor.executeQueryThenInvoke(
          sql,
          [],
          functionId,
          additionalContext,
        );

        const invocations = registry.getInvocations();
        if (invocations.length !== 1) {
          return false;
        }

        const context = invocations[0].context;

        // Verify all additional context fields are present
        if (context.customField !== additionalContext.customField) {
          return false;
        }
        if (context.numericValue !== additionalContext.numericValue) {
          return false;
        }
        if (context.nested?.inner !== additionalContext.nested?.inner) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('additional context passed to invoked function');
});

/**
 * Property: Query result structure is preserved in function context.
 */
test('Property 38: query result structure preserved in context', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sqlSelectArbitrary,
      functionIdArbitrary,
      queryResultsArbitrary,
      async (sql, functionId, queryResults) => {
        const engine = createMockSqlEngine(queryResults);
        const registry = createMockFunctionRegistry();
        const executor = new FunctionQueryExecutor({
          sqlQueryEngine: engine,
          functionRegistry: registry,
        });

        const result = await executor.executeQueryThenInvoke(
          sql,
          [],
          functionId,
          {},
        );

        const invocations = registry.getInvocations();
        const queryResult = invocations[0].context.queryResult;

        // Verify query result has expected structure
        if (!Array.isArray(queryResult.rows)) {
          return false;
        }
        if (typeof queryResult.affectedRows !== 'number') {
          return false;
        }
        if (!Array.isArray(queryResult.partitions)) {
          return false;
        }
        if (queryResult.success !== true) {
          return false;
        }

        // Verify returned result also contains query result
        if (!result.queryResult) {
          return false;
        }
        if (result.queryResult.rows.length !== queryResults.length) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('query result structure preserved in context');
});

/**
 * Property: Each invocation gets a unique invocation ID.
 */
test('Property 38: unique invocation IDs for each call', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 2, max: 5}),
      sqlSelectArbitrary,
      functionIdArbitrary,
      async (numCalls, sql, functionId) => {
        const engine = createMockSqlEngine([{id: 1}]);
        const registry = createMockFunctionRegistry();
        const executor = new FunctionQueryExecutor({
          sqlQueryEngine: engine,
          functionRegistry: registry,
        });

        const invocationIds = new Set();

        for (let i = 0; i < numCalls; i++) {
          const result = await executor.executeQueryThenInvoke(
            sql,
            [],
            functionId,
            {},
          );
          invocationIds.add(result.invocationId);
        }

        // All invocation IDs should be unique
        return invocationIds.size === numCalls;
      },
    ),
    {numRuns: 10},
  );

  t.pass('unique invocation IDs for each call');
});

/**
 * Property: Function invocation failure returns error but preserves query result.
 */
test('Property 38: function failure preserves query result', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      sqlSelectArbitrary,
      queryResultsArbitrary,
      fc.string({minLength: 1, maxLength: 50}),
      async (sql, queryResults, errorMessage) => {
        const engine = createMockSqlEngine(queryResults);
        const registry = {
          invoke: async () => {
            throw new Error(errorMessage);
          },
        };
        const executor = new FunctionQueryExecutor({
          sqlQueryEngine: engine,
          functionRegistry: registry,
        });

        const result = await executor.executeQueryThenInvoke(
          sql,
          [],
          'failing-function',
          {},
        );

        // Should not throw, but return error info
        if (result.success !== false) {
          return false;
        }
        if (result.functionInvoked !== false) {
          return false;
        }
        if (!result.error) {
          return false;
        }

        // Query result should still be present
        if (!result.queryResult) {
          return false;
        }
        if (result.queryResult.rows.length !== queryResults.length) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('function failure preserves query result');
});
