// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {WasmExecutor} from '../../src/wasm-service/wasm-executor.js';
import {
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  InProcessWasmRuntimeAdapter,
} from '../../src/debug-runtime/wasm-runtime-adapter.js';

const FUNCTION_ID = 'f-parity';
const RUN_EXPORT = 'run';

function createMirror(moduleEntry) {
  return {
    getModule(functionId) {
      if (functionId === FUNCTION_ID) {
        return moduleEntry;
      }
      return null;
    },
  };
}

function createExecutor(moduleEntry, runtimeAdapter) {
  return new WasmExecutor({
    resourceBudget: DEFAULT_RESOURCE_BUDGET,
    moduleMirror: createMirror(moduleEntry),
    runtimeAdapter,
  });
}

describe('WasmExecutor runtime-adapter parity', () => {
  it('returns same result shape with default and explicit adapters',
    async () => {
      const moduleEntry = {
        version: '1.0',
        wasmBytes: Buffer.alloc(0),
        manifest: {runExport: RUN_EXPORT},
        exports: {
          [RUN_EXPORT]: (ctx, args) => {
            return {ctxSeen: Boolean(ctx.user), value: args.value};
          },
        },
      };

      const defaultExecutor = createExecutor(moduleEntry, undefined);
      const explicitExecutor = createExecutor(
        moduleEntry,
        new InProcessWasmRuntimeAdapter(),
      );
      const func = {function_id: FUNCTION_ID};
      const context = {user: 'alice'};
      const args = {value: 7};

      const a = await defaultExecutor.execute(func, context, args);
      const b = await explicitExecutor.execute(func, context, args);

      assert.deepStrictEqual(a, b);
      assert.deepStrictEqual(a.mutations, []);
      assert.deepStrictEqual(a.result, {ctxSeen: true, value: 7});
    });

  it('preserves handler invocation failure semantics', async () => {
    const moduleEntry = {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
      manifest: {runExport: RUN_EXPORT},
      exports: {
        [RUN_EXPORT]: (_ctx, _args) => {
          throw new Error('boom');
        },
      },
    };
    const executor = createExecutor(moduleEntry, new InProcessWasmRuntimeAdapter());

    await assert.rejects(
      () => executor.execute({function_id: FUNCTION_ID}, {}, {}),
      (err) => {
        assert.equal(
          err.message,
          WASM_SERVICE_ERROR_MSG.HANDLER_INVOCATION_FAILED,
        );
        return true;
      },
    );
  });

  it('preserves CPU timeout behavior with runtime adapter path', async () => {
    let pendingTimer;
    const moduleEntry = {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
      manifest: {runExport: RUN_EXPORT},
      exports: {
        [RUN_EXPORT]: async (_ctx, _args) => {
          return await new Promise((resolve) => {
            pendingTimer = setTimeout(() => resolve('late'), 40);
          });
        },
      },
    };

    const executor = new WasmExecutor({
      resourceBudget: {cpuTimeLimitMs: 10},
      moduleMirror: createMirror(moduleEntry),
      runtimeAdapter: new InProcessWasmRuntimeAdapter(),
    });

    try {
      await assert.rejects(
        () => executor.execute({function_id: FUNCTION_ID}, {}, {}),
        (err) => {
          assert.equal(
            err.message,
            WASM_SERVICE_ERROR_MSG.CPU_TIME_LIMIT_EXCEEDED,
          );
          return true;
        },
      );
    } finally {
      // Let the in-flight handler settle naturally; cancelling its timer
      // would leave the invocation promise unresolved.
      assert.ok(pendingTimer);
    }
  });

  it('does not directly invoke module exports outside runtime adapter', async () => {
    let directInvokeCount = 0;
    const moduleEntry = {
      version: '1.0',
      wasmBytes: Buffer.alloc(0),
      manifest: {runExport: RUN_EXPORT},
      exports: {
        [RUN_EXPORT]: (_ctx, _args) => {
          directInvokeCount++;
          throw new Error('legacy direct invocation path used');
        },
      },
    };

    let executeCalls = 0;
    const runtimeAdapter = {
      async createInstance(request) {
        return {
          instanceHandle: {
            instanceId: 'adapter-instance',
            moduleRef: request.moduleRef,
          },
          createdAt: Date.now(),
        };
      },
      async inspect() {
        return {exportNames: [RUN_EXPORT]};
      },
      async execute() {
        executeCalls++;
        return {
          result: {ownedByAdapter: true},
          mutations: [],
          durationMs: 0,
          instanceHandle: {
            instanceId: 'adapter-instance',
            moduleRef: FUNCTION_ID,
          },
        };
      },
      async destroyInstance(_instanceHandle) {
        return {destroyed: true, instanceHandle: _instanceHandle};
      },
    };

    const executor = createExecutor(moduleEntry, runtimeAdapter);
    const result = await executor.execute(
      {function_id: FUNCTION_ID},
      {user: 'alice'},
      {value: 1},
    );

    assert.deepStrictEqual(result, {
      result: {ownedByAdapter: true},
      mutations: [],
    });
    assert.equal(executeCalls, 1);
    assert.equal(directInvokeCount, 0);
  });
});
