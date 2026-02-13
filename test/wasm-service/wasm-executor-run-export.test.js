import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {WasmExecutor} from
  '../../src/wasm-service/wasm-executor.js';
import {
  WASM_SERVICE_ERROR_MSG,
  DEFAULT_RESOURCE_BUDGET,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  RUN_EXPORT_MIN_PARAMS,
  RUN_EXPORT_MAX_PARAMS,
} from '../../src/wasm-service/module-manifest-constants.js';

const RUN_EXPORT_NAME = 'handle';

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
 * Creates a mock module with manifest, exports, and optional
 * wasmBytes.
 * @param {Function} handler - The run_export handler function.
 * @param {Object} [opts] - Additional module properties.
 * @return {Object} Mock module object.
 */
function createMockModule(handler, opts = {}) {
  return {
    version: '1.0',
    wasmBytes: opts.wasmBytes || Buffer.alloc(0),
    manifest: {runExport: RUN_EXPORT_NAME},
    exports: {[RUN_EXPORT_NAME]: handler},
    ...opts,
  };
}

/**
 * Builds a WasmExecutor with a single module registered
 * under the given function ID.
 * @param {string} funcId - Function ID for the module.
 * @param {Object} mod - Module object from createMockModule.
 * @param {Object} [budget] - Optional resource budget override.
 * @return {WasmExecutor} Configured executor.
 */
function buildExecutor(funcId, mod, budget) {
  const modules = new Map();
  modules.set(funcId, mod);
  return new WasmExecutor({
    resourceBudget: budget || DEFAULT_RESOURCE_BUDGET,
    moduleMirror: createMockMirror(modules),
  });
}

const FUNC_ID = 'test-func';

describe('WasmExecutor run_export invocation', () => {
  it('invokes the actual run_export function from module exports',
    async () => {
      let called = false;
      const handler = (_ctx, _args) => {
        called = true;
        return 'invoked';
      };
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      await executor.execute(
        {function_id: FUNC_ID}, {}, {},
      );
      assert.equal(called, true);
    });

  it('passes context and args to the run_export function',
    async () => {
      let receivedCtx;
      let receivedArgs;
      const handler = (ctx, args) => {
        receivedCtx = ctx;
        receivedArgs = args;
        return null;
      };
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);
      const ctx = {session: 's1'};
      const args = {key: 'value'};

      await executor.execute(
        {function_id: FUNC_ID}, ctx, args,
      );
      assert.deepStrictEqual(receivedCtx, ctx);
      assert.deepStrictEqual(receivedArgs, args);
    });

  it('returns run_export result wrapped in {result, mutations}',
    async () => {
      const handler = (_ctx, _args) => ({answer: 42});
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      const out = await executor.execute(
        {function_id: FUNC_ID}, {}, {},
      );
      assert.deepStrictEqual(out.result, {answer: 42});
      assert.deepStrictEqual(out.mutations, []);
    });

  it('throws RUN_EXPORT_NOT_FOUND when module has no matching' +
    ' export', async () => {
    const mod = {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
      manifest: {runExport: 'missing_fn'},
      exports: {},
    };
    const executor = buildExecutor(FUNC_ID, mod);

    await assert.rejects(
      () => executor.execute(
        {function_id: FUNC_ID}, {}, {},
      ),
      (err) => {
        assert.equal(
          err.message,
          WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_FOUND,
        );
        return true;
      },
    );
  });

  it('throws RUN_EXPORT_NOT_CALLABLE when export is not a' +
    ' function', async () => {
    const mod = {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
      manifest: {runExport: RUN_EXPORT_NAME},
      exports: {[RUN_EXPORT_NAME]: 'not-a-function'},
    };
    const executor = buildExecutor(FUNC_ID, mod);

    await assert.rejects(
      () => executor.execute(
        {function_id: FUNC_ID}, {}, {},
      ),
      (err) => {
        assert.equal(
          err.message,
          WASM_SERVICE_ERROR_MSG.RUN_EXPORT_NOT_CALLABLE,
        );
        return true;
      },
    );
  });

  it('throws MODULE_NOT_AVAILABLE when module is not in mirror',
    async () => {
      const executor = new WasmExecutor({
        resourceBudget: DEFAULT_RESOURCE_BUDGET,
        moduleMirror: createMockMirror(new Map()),
      });

      await assert.rejects(
        () => executor.execute(
          {function_id: 'no-such-module'}, {}, {},
        ),
        (err) => {
          assert.equal(
            err.message,
            WASM_SERVICE_ERROR_MSG.MODULE_NOT_AVAILABLE,
          );
          return true;
        },
      );
    });

  it('enforces memory limit before invocation', async () => {
    const memLimit = 512;
    const handler = (_ctx, _args) => 'should not reach';
    const mod = createMockModule(handler, {
      wasmBytes: Buffer.alloc(memLimit + 1),
    });
    const executor = buildExecutor(
      FUNC_ID, mod, {memoryLimitBytes: memLimit},
    );

    await assert.rejects(
      () => executor.execute(
        {function_id: FUNC_ID}, {}, {},
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

  it('enforces CPU time limit during invocation', async () => {
    const cpuLimit = 50;
    let pendingId;
    const handler = (_ctx, _args) => {
      return new Promise((resolve) => {
        pendingId = setTimeout(
          () => resolve('late'), cpuLimit * 4,
        );
      });
    };
    const mod = createMockModule(handler);
    const executor = buildExecutor(
      FUNC_ID, mod, {cpuTimeLimitMs: cpuLimit},
    );

    try {
      await assert.rejects(
        () => executor.execute(
          {function_id: FUNC_ID}, {}, {},
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
      clearTimeout(pendingId);
    }
  });

  it('accepts handler with 3 params (context, args, options)',
    async () => {
      const handler = (_ctx, _args, _opts) => 'three-params';
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      const out = await executor.execute(
        {function_id: FUNC_ID}, {}, {},
      );
      assert.equal(out.result, 'three-params');
    });

  it('throws RUN_EXPORT_SIGNATURE_MISMATCH for 0-param handler',
    async () => {
      // eslint needs the function to report .length === 0
      const handler = Object.defineProperty(
        () => 'zero', 'length', {value: 0},
      );
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      await assert.rejects(
        () => executor.execute(
          {function_id: FUNC_ID}, {}, {},
        ),
        (err) => {
          assert.equal(
            err.message,
            WASM_SERVICE_ERROR_MSG
              .RUN_EXPORT_SIGNATURE_MISMATCH,
          );
          return true;
        },
      );
    });

  it('throws RUN_EXPORT_SIGNATURE_MISMATCH for 1-param handler',
    async () => {
      const handler = (_ctx) => 'one';
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      await assert.rejects(
        () => executor.execute(
          {function_id: FUNC_ID}, {}, {},
        ),
        (err) => {
          assert.equal(
            err.message,
            WASM_SERVICE_ERROR_MSG
              .RUN_EXPORT_SIGNATURE_MISMATCH,
          );
          return true;
        },
      );
    });

  it('throws RUN_EXPORT_SIGNATURE_MISMATCH for 4-param handler',
    async () => {
      const handler = (_a, _b, _c, _d) => 'four';
      const mod = createMockModule(handler);
      const executor = buildExecutor(FUNC_ID, mod);

      await assert.rejects(
        () => executor.execute(
          {function_id: FUNC_ID}, {}, {},
        ),
        (err) => {
          assert.equal(
            err.message,
            WASM_SERVICE_ERROR_MSG
              .RUN_EXPORT_SIGNATURE_MISMATCH,
          );
          return true;
        },
      );
    });

  it('validates param count against manifest constants',
    () => {
      assert.equal(RUN_EXPORT_MIN_PARAMS, 2);
      assert.equal(RUN_EXPORT_MAX_PARAMS, 3);
    });
});
