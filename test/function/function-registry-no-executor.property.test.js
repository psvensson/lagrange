/**
 * Property-based test for Function Registry No Executor Error.
 * **Property 37: Function Registry No Executor Error**
 * **Validates: Requirements 34.13**
 *
 * Property: For any function invocation where no executor is registered
 * for the function's executor_type, the system returns an error indicating
 * no executor available.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {FunctionRegistry} from '../../src/function/function-registry.js';
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
 * Create a mock system table cache with code table.
 * @return {Object} Mock cache with helper methods.
 */
function createMockCache() {
  const functions = new Map();
  return {
    get: (tableName, key) => {
      if (tableName !== 'code') return undefined;
      return functions.get(key);
    },
    find: (tableName, predicate) => {
      if (tableName !== 'code') return undefined;
      return Array.from(functions.values()).find(predicate);
    },
    _addFunction: (func) => functions.set(func.function_id, func),
    _clear: () => functions.clear(),
  };
}

/**
 * Create a mock executor.
 * @param {string} name - Executor name.
 * @return {Object} Mock executor.
 */
function createMockExecutor(name = 'mock-executor') {
  return {
    name,
    execute: async (func, _context, _args) => {
      return {result: 'success', funcId: func.function_id};
    },
  };
}

/**
 * Arbitrary for valid executor types (strings that could be executor types).
 */
const executorTypeArbitrary = fc.string({minLength: 1, maxLength: 30})
  .filter((s) => s.trim().length > 0 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s));

/**
 * Arbitrary for function IDs.
 */
const functionIdArbitrary = fc.uuid();

/**
 * Arbitrary for function names.
 */
const functionNameArbitrary = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for a function definition.
 */
const functionDefinitionArbitrary = fc.record({
  function_id: functionIdArbitrary,
  function_name: functionNameArbitrary,
  executor_type: executorTypeArbitrary,
  code_blob: fc.string({maxLength: 100}),
  signature: fc.constant('{}'),
});

/**
 * Feature: distributed-database-system
 * Property 37: Function Registry No Executor Error
 *
 * For any function invocation where no executor is registered for the
 * function's executor_type, the system returns an error indicating no
 * executor available.
 */
test('Property 37: invoke returns error when no executor registered', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      functionDefinitionArbitrary,
      async (funcDef) => {
        const cache = createMockCache();
        const registry = new FunctionRegistry({systemTableCache: cache});

        // Add function to cache but do NOT register any executor
        cache._addFunction(funcDef);

        // Attempt to invoke the function
        try {
          await registry.invoke(funcDef.function_id);
          // Should not reach here - invoke should throw
          return false;
        } catch (error) {
          // Verify error message indicates no executor available
          const hasNoExecutorMessage =
            error.message.includes('No executor registered') ||
            error.message.includes('no executor');

          const mentionsExecutorType =
            error.message.includes(funcDef.executor_type);

          // Error should indicate no executor and mention the type
          return hasNoExecutorMessage && mentionsExecutorType;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('invoke returns error when no executor registered');
});

/**
 * Property: Error message lists available executor types when none match.
 */
test('Property 37: error message lists available executor types', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      functionDefinitionArbitrary,
      fc.array(executorTypeArbitrary, {minLength: 1, maxLength: 5}),
      async (funcDef, registeredTypes) => {
        // Ensure the function's executor_type is NOT in registeredTypes
        const uniqueRegisteredTypes = [...new Set(registeredTypes)]
          .filter((t) => t !== funcDef.executor_type);

        if (uniqueRegisteredTypes.length === 0) {
          // Skip if we can't create a mismatch scenario
          return true;
        }

        const cache = createMockCache();
        const registry = new FunctionRegistry({systemTableCache: cache});

        // Register executors for types that don't match the function
        for (const execType of uniqueRegisteredTypes) {
          registry.registerExecutor(execType, createMockExecutor(execType));
        }

        // Add function with a different executor_type
        cache._addFunction(funcDef);

        try {
          await registry.invoke(funcDef.function_id);
          return false;
        } catch (error) {
          // Error should mention available types
          const mentionsAvailable = error.message.includes('Available types');
          const hasNoExecutorMessage =
            error.message.includes('No executor registered');

          return hasNoExecutorMessage && mentionsAvailable;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('error message lists available executor types');
});

/**
 * Property: invokeByName also returns error when no executor registered.
 */
test('Property 37: invokeByName returns error when no executor', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      functionDefinitionArbitrary,
      async (funcDef) => {
        const cache = createMockCache();
        const registry = new FunctionRegistry({systemTableCache: cache});

        // Add function to cache but do NOT register any executor
        cache._addFunction(funcDef);

        try {
          await registry.invokeByName(funcDef.function_name);
          return false;
        } catch (error) {
          const hasNoExecutorMessage =
            error.message.includes('No executor registered') ||
            error.message.includes('no executor');

          return hasNoExecutorMessage;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('invokeByName returns error when no executor registered');
});

/**
 * Property: Unregistering an executor causes subsequent invokes to fail.
 */
test('Property 37: unregister executor causes invoke to fail', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      functionDefinitionArbitrary,
      async (funcDef) => {
        const cache = createMockCache();
        const registry = new FunctionRegistry({systemTableCache: cache});

        // Add function and register matching executor
        cache._addFunction(funcDef);
        registry.registerExecutor(
          funcDef.executor_type,
          createMockExecutor(funcDef.executor_type),
        );

        // First invoke should succeed
        try {
          await registry.invoke(funcDef.function_id);
        } catch {
          return false; // Should not fail
        }

        // Unregister the executor
        registry.unregisterExecutor(funcDef.executor_type);

        // Second invoke should fail with no executor error
        try {
          await registry.invoke(funcDef.function_id);
          return false;
        } catch (error) {
          return error.message.includes('No executor registered');
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('unregister executor causes invoke to fail');
});

/**
 * Property: Error indicates 'none' when no executors are registered at all.
 */
test('Property 37: error shows none when no executors registered', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      functionDefinitionArbitrary,
      async (funcDef) => {
        const cache = createMockCache();
        const registry = new FunctionRegistry({systemTableCache: cache});

        // Add function but register NO executors at all
        cache._addFunction(funcDef);

        try {
          await registry.invoke(funcDef.function_id);
          return false;
        } catch (error) {
          // When no executors are registered, message should indicate 'none'
          const hasNoExecutorMessage =
            error.message.includes('No executor registered');
          const indicatesNone = error.message.includes('none');

          return hasNoExecutorMessage && indicatesNone;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('error shows none when no executors registered');
});
