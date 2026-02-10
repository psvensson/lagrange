import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {WasmExecutor} from '../../src/wasm-service/wasm-executor.js';
import {
  WASM_SERVICE_EXECUTOR_TYPE,
  WASM_SERVICE_ERROR_MSG,
  DEFAULT_RESOURCE_BUDGET,
} from '../../src/wasm-service/wasm-service-constants.js';

/**
 * Creates a mock ModuleMirror with a configurable module map.
 * @param {Map<string, Object>} [modules] - Pre-populated modules.
 * @return {Object} Mock ModuleMirror.
 */
function createMockMirror(modules = new Map()) {
  return {
    getModule(functionId) {
      return modules.get(functionId) || null;
    },
  };
}

/**
 * Creates a mock FunctionRegistry that records registerExecutor
 * calls.
 * @return {Object} Mock FunctionRegistry with `calls` array.
 */
function createMockRegistry() {
  const calls = [];
  return {
    calls,
    registerExecutor(type, executor) {
      calls.push({type, executor});
    },
  };
}

describe('WasmExecutor', () => {
  let mirror;
  let executor;

  beforeEach(() => {
    const modules = new Map();
    modules.set('func-1', {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
    });
    mirror = createMockMirror(modules);
    executor = new WasmExecutor({
      resourceBudget: DEFAULT_RESOURCE_BUDGET,
      moduleMirror: mirror,
    });
  });

  describe('constructor', () => {
    it('should store resourceBudget from options', () => {
      assert.strictEqual(
        executor.resourceBudget,
        DEFAULT_RESOURCE_BUDGET,
      );
    });

    it('should store moduleMirror from options', () => {
      assert.strictEqual(executor.moduleMirror, mirror);
    });

    it('should default resourceBudget when not provided', () => {
      const ex = new WasmExecutor();
      assert.deepStrictEqual(
        ex.resourceBudget,
        DEFAULT_RESOURCE_BUDGET,
      );
    });

    it('should default moduleMirror to null when not provided',
      () => {
        const ex = new WasmExecutor();
        assert.strictEqual(ex.moduleMirror, null);
      });
  });

  describe('register', () => {
    it('should call registerExecutor with wasm_service type',
      () => {
        const registry = createMockRegistry();
        executor.register(registry);
        assert.equal(registry.calls.length, 1);
        assert.equal(
          registry.calls[0].type,
          WASM_SERVICE_EXECUTOR_TYPE,
        );
      });

    it('should pass itself as the executor', () => {
      const registry = createMockRegistry();
      executor.register(registry);
      assert.strictEqual(registry.calls[0].executor, executor);
    });
  });

  describe('execute', () => {
    it('should throw MODULE_NOT_AVAILABLE when module is missing',
      async () => {
        const func = {function_id: 'nonexistent'};
        await assert.rejects(
          () => executor.execute(func, {}, {}),
          (err) => {
            assert.equal(
              err.message,
              WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
            );
            return true;
          },
        );
      });

    it('should throw MODULE_NOT_AVAILABLE when mirror is null',
      async () => {
        const ex = new WasmExecutor({
          resourceBudget: DEFAULT_RESOURCE_BUDGET,
          moduleMirror: null,
        });
        await assert.rejects(
          () => ex.execute({function_id: 'func-1'}, {}, {}),
          (err) => {
            assert.equal(
              err.message,
              WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
            );
            return true;
          },
        );
      });

    it('should resolve function_id from func object', async () => {
      const func = {function_id: 'func-1'};
      const result = await executor.execute(func, {}, {a: 1});
      assert.deepStrictEqual(result.result, {a: 1});
    });

    it('should resolve handler_function_id as fallback',
      async () => {
        const func = {handler_function_id: 'func-1'};
        const result = await executor.execute(func, {}, {b: 2});
        assert.deepStrictEqual(result.result, {b: 2});
      });

    it('should return result and mutations on success',
      async () => {
        const func = {function_id: 'func-1'};
        const args = {key: 'value'};
        const result = await executor.execute(func, {}, args);
        assert.deepStrictEqual(result.result, args);
        assert.ok(Array.isArray(result.mutations));
      });

    it('should throw MEMORY_LIMIT_EXCEEDED for oversized module',
      async () => {
        const largeModules = new Map();
        const memLimit = 1024;
        largeModules.set('big-func', {
          version: '1.0',
          wasmBytes: Buffer.alloc(memLimit + 1),
        });
        const largeMirror = createMockMirror(largeModules);
        const ex = new WasmExecutor({
          resourceBudget: {memoryLimitBytes: memLimit},
          moduleMirror: largeMirror,
        });
        await assert.rejects(
          () => ex.execute(
            {function_id: 'big-func'}, {}, {},
          ),
          (err) => {
            assert.equal(
              err.message,
              WASM_SERVICE_ERROR_MSG.MEMORY_LIMIT_EXCEEDED,
            );
            return true;
          },
        );
      });
  });

  describe('CPU time limit enforcement', () => {
    it('should throw CPU_TIME_LIMIT_EXCEEDED on slow execution',
      async () => {
        const cpuLimit = 50;
        const ex = new WasmExecutor({
          resourceBudget: {cpuTimeLimitMs: cpuLimit},
          moduleMirror: mirror,
        });

        // Override _invokeHandler to simulate slow execution
        ex._invokeHandler = async () => {
          return new Promise((resolve) => {
            const id = setTimeout(
              () => resolve({result: {}, mutations: []}),
              cpuLimit * 4,
            );
            // Store handle so it can be cleaned up by GC
            ex._pendingTimeout = id;
          });
        };

        try {
          await assert.rejects(
            () => ex.execute(
              {function_id: 'func-1'}, {}, {},
            ),
            (err) => {
              assert.equal(
                err.message,
                WASM_SERVICE_ERROR_MSG.CPU_TIME_LIMIT_EXCEEDED,
              );
              return true;
            },
          );
        } finally {
          clearTimeout(ex._pendingTimeout);
        }
      });

    it('should succeed when execution completes within limit',
      async () => {
        const ex = new WasmExecutor({
          resourceBudget: {cpuTimeLimitMs: 5000},
          moduleMirror: mirror,
        });

        // Override _invokeHandler to resolve immediately
        ex._invokeHandler = async () => {
          return {result: {fast: true}, mutations: []};
        };

        const result = await ex.execute(
          {function_id: 'func-1'}, {}, {},
        );
        assert.deepStrictEqual(result.result, {fast: true});
      });
  });
});
