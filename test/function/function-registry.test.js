/**
 * Tests for FunctionRegistry.
 * Requirements: 34.10, 34.11, 34.12, 34.13
 */

import {test} from '../../src/test-helpers/tap.js';
import {FunctionRegistry} from '../../src/function/function-registry.js';

// Mock system table cache with code table
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
    // For testing - add functions directly
    _addFunction: (func) => functions.set(func.function_id, func),
    _clear: () => functions.clear(),
  };
}

// Mock executor
function createMockExecutor(name = 'mock-executor') {
  const invocations = [];
  return {
    name,
    execute: async (func, context, args) => {
      invocations.push({func, context, args});
      if (func.function_name === 'error-func') {
        throw new Error('Execution error');
      }
      return {result: 'success', funcId: func.function_id};
    },
    getInvocations: () => invocations,
  };
}

test('FunctionRegistry - constructor', async (t) => {
  const registry = new FunctionRegistry();

  t.equal(registry.isInitialized(), false, 'Should not be initialized');
  t.equal(registry.getExecutorCount(), 0, 'Should have no executors');
});

test('FunctionRegistry - initialize', async (t) => {
  const cache = createMockCache();
  const registry = new FunctionRegistry();

  registry.initialize({systemTableCache: cache});

  t.equal(registry.isInitialized(), true, 'Should be initialized');
  t.ok(registry.systemTableCache, 'Should have cache');
});

test('FunctionRegistry - registerExecutor adds executor', async (t) => {
  const registry = new FunctionRegistry();
  const executor = createMockExecutor();

  registry.registerExecutor('wasm', executor);

  t.equal(registry.getExecutorCount(), 1, 'Should have 1 executor');
  t.equal(registry.hasExecutor('wasm'), true, 'Should have wasm executor');
  t.same(registry.getRegisteredExecutorTypes(), ['wasm'], 'Should list wasm');
});

test('FunctionRegistry - registerExecutor validates type', async (t) => {
  const registry = new FunctionRegistry();
  const executor = createMockExecutor();

  t.throws(
    () => registry.registerExecutor('', executor),
    /Executor type must be a non-empty string/,
    'Should reject empty type',
  );

  t.throws(
    () => registry.registerExecutor(null, executor),
    /Executor type must be a non-empty string/,
    'Should reject null type',
  );
});

test('FunctionRegistry - registerExecutor validates executor', async (t) => {
  const registry = new FunctionRegistry();

  t.throws(
    () => registry.registerExecutor('test', null),
    /Executor must have an execute/,
    'Should reject null executor',
  );

  t.throws(
    () => registry.registerExecutor('test', {}),
    /Executor must have an execute/,
    'Should reject executor without execute',
  );

  t.throws(
    () => registry.registerExecutor('test', {execute: 'not-a-function'}),
    /Executor must have an execute/,
    'Should reject non-function execute',
  );
});

test('FunctionRegistry - registerExecutor overwrites existing', async (t) => {
  const registry = new FunctionRegistry();
  const executor1 = createMockExecutor('exec1');
  const executor2 = createMockExecutor('exec2');

  registry.registerExecutor('wasm', executor1);
  registry.registerExecutor('wasm', executor2);

  t.equal(registry.getExecutorCount(), 1, 'Should still have 1 executor');
});

test('FunctionRegistry - unregisterExecutor removes executor', async (t) => {
  const registry = new FunctionRegistry();
  const executor = createMockExecutor();

  registry.registerExecutor('wasm', executor);
  const removed = registry.unregisterExecutor('wasm');

  t.equal(removed, true, 'Should return true');
  t.equal(registry.hasExecutor('wasm'), false, 'Should not have wasm');
  t.equal(registry.getExecutorCount(), 0, 'Should have 0 executors');
});

test('FunctionRegistry - unregisterExecutor returns false for nonexistent', async (t) => {
  const registry = new FunctionRegistry();

  const removed = registry.unregisterExecutor('nonexistent');

  t.equal(removed, false, 'Should return false');
});

test('FunctionRegistry - invoke executes function', async (t) => {
  const cache = createMockCache();
  const executor = createMockExecutor();
  const registry = new FunctionRegistry({systemTableCache: cache});

  // Add function to cache
  cache._addFunction({
    function_id: 'func-1',
    function_name: 'my-function',
    executor_type: 'wasm',
    code_blob: 'code',
    signature: '{}',
  });

  registry.registerExecutor('wasm', executor);

  const result = await registry.invoke('func-1', {ctx: 'value'}, {arg: 1});

  t.ok(result, 'Should return result');
  t.equal(result.funcId, 'func-1', 'Should execute correct function');

  const invocations = executor.getInvocations();
  t.equal(invocations.length, 1, 'Should have 1 invocation');
  t.equal(invocations[0].context.ctx, 'value', 'Should pass context');
  t.equal(invocations[0].args.arg, 1, 'Should pass args');
});

test('FunctionRegistry - invoke throws for unknown function', async (t) => {
  const cache = createMockCache();
  const registry = new FunctionRegistry({systemTableCache: cache});

  await t.rejects(
    registry.invoke('unknown-func'),
    /Function not found: unknown-func/,
    'Should throw for unknown function',
  );
});

test('FunctionRegistry - invoke throws for unregistered executor', async (t) => {
  const cache = createMockCache();
  const registry = new FunctionRegistry({systemTableCache: cache});

  cache._addFunction({
    function_id: 'func-1',
    function_name: 'my-function',
    executor_type: 'python',
    code_blob: 'code',
    signature: '{}',
  });

  await t.rejects(
    registry.invoke('func-1'),
    /No executor registered for type 'python'/,
    'Should throw for unregistered executor',
  );
});

test('FunctionRegistry - invokeByName finds and executes function', async (t) => {
  const cache = createMockCache();
  const executor = createMockExecutor();
  const registry = new FunctionRegistry({systemTableCache: cache});

  cache._addFunction({
    function_id: 'func-1',
    function_name: 'my-function',
    executor_type: 'wasm',
    code_blob: 'code',
    signature: '{}',
  });

  registry.registerExecutor('wasm', executor);

  const result = await registry.invokeByName('my-function');

  t.ok(result, 'Should return result');
  t.equal(result.funcId, 'func-1', 'Should execute correct function');
});

test('FunctionRegistry - invokeByName throws for unknown function', async (t) => {
  const cache = createMockCache();
  const registry = new FunctionRegistry({systemTableCache: cache});

  await t.rejects(
    registry.invokeByName('unknown'),
    /Function not found: unknown/,
    'Should throw for unknown function',
  );
});

test('FunctionRegistry - getFunction returns function from cache', async (t) => {
  const cache = createMockCache();
  const registry = new FunctionRegistry({systemTableCache: cache});

  cache._addFunction({
    function_id: 'func-1',
    function_name: 'test',
    executor_type: 'wasm',
  });

  const func = await registry.getFunction('func-1');

  t.ok(func, 'Should return function');
  t.equal(func.function_id, 'func-1', 'Should have correct ID');
});

test('FunctionRegistry - getFunction throws without cache', async (t) => {
  const registry = new FunctionRegistry();

  await t.rejects(
    registry.getFunction('func-1'),
    /System table cache not available/,
    'Should throw when cache is missing',
  );
});

test('FunctionRegistry - multiple executors', async (t) => {
  const cache = createMockCache();
  const wasmExecutor = createMockExecutor('wasm');
  const jsExecutor = createMockExecutor('js');
  const registry = new FunctionRegistry({systemTableCache: cache});

  registry.registerExecutor('wasm', wasmExecutor);
  registry.registerExecutor('javascript', jsExecutor);

  cache._addFunction({
    function_id: 'wasm-func',
    function_name: 'wasm-function',
    executor_type: 'wasm',
    code_blob: 'wasm-code',
    signature: '{}',
  });

  cache._addFunction({
    function_id: 'js-func',
    function_name: 'js-function',
    executor_type: 'javascript',
    code_blob: 'js-code',
    signature: '{}',
  });

  await registry.invoke('wasm-func');
  await registry.invoke('js-func');

  t.equal(wasmExecutor.getInvocations().length, 1, 'WASM executor called once');
  t.equal(jsExecutor.getInvocations().length, 1, 'JS executor called once');
});
