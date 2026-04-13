// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeStartupWiring} from '../../src/runtime/runtime-startup-wiring.js';
import {
  CALLBACK_RUNTIME_KIND,
} from '../../src/query/sql-adapter-constants.js';
import {
  CallbackExecutionHost,
} from '../../src/query/callback/callback-execution-host.js';
import {
  createCallbackDriverRegistry,
} from '../../src/query/callback/callback-runtime-driver-registry.js';
import {WasmExecutor} from '../../src/wasm-service/wasm-executor.js';
import {
  InProcessWasmRuntimeAdapter,
} from '../../src/debug-runtime/wasm-runtime-adapter.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';

const FUNCTION_ID = 'callback-module';
const RUN_EXPORT = 'run_batch';

function defaultRunExport(_ctx, args) {
  return args.rows.map((row) => ({
    id: row.id,
    doubled: row.id * 2,
  }));
}

function createWasmExecutor(runExportHandler = defaultRunExport) {
  const mirror = {
    getModule(functionId) {
      if (functionId !== FUNCTION_ID) {
        return null;
      }
      return {
        version: '1.0',
        wasmBytes: Buffer.alloc(0),
        manifest: {runExport: RUN_EXPORT},
        exports: {
          [RUN_EXPORT]: runExportHandler,
        },
      };
    },
  };
  return new WasmExecutor({
    moduleMirror: mirror,
    runtimeAdapter: new InProcessWasmRuntimeAdapter(),
  });
}

function createHost(options = {}) {
  const runtimeWiring = createRuntimeStartupWiring();
  const registry = createCallbackDriverRegistry({
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    wasmExecutor: options.wasmExecutor ||
      createWasmExecutor(options.runExportHandler),
  });
  return new CallbackExecutionHost({
    runtimeDriverRegistry: registry,
    stageIndex: options.stageIndex ?? 2,
    lineageTracker: options.lineageTracker || null,
    executionContext: options.executionContext || null,
  });
}

describe('CallbackExecutionHost runtime parity with runtime adapter', () => {
  it('returns same callback rows with and without optional execution options',
    async () => {
      const host = createHost();
      const batches = [
        {partitionId: 'p1', rows: [{id: 1}, {id: 3}]},
      ];
      const descriptor = {
        callbackModuleRef: FUNCTION_ID,
        callbackExport: RUN_EXPORT,
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      };

      const base = await host.execute(batches, descriptor, {});
      const withOptions = await host.execute(batches, descriptor, {
        runtimeOptions: {debugMode: false},
      });

      assert.equal(base.state, 'completed');
      assert.equal(withOptions.state, 'completed');
      assert.deepStrictEqual(
        base.partitionResults[0].rows,
        withOptions.partitionResults[0].rows,
      );
      assert.deepStrictEqual(
        base.partitionResults[0].rows,
        [{id: 1, doubled: 2}, {id: 3, doubled: 6}],
      );
    });

  it('keeps callback context primitive compatibility in wasm callback path',
    async () => {
      const callLog = [];
      const budgetEnforcer = {
        recordNestedCall() {
          callLog.push('recordNestedCall');
        },
        incrementInflight() {
          callLog.push('incrementInflight');
        },
        decrementInflight() {
          callLog.push('decrementInflight');
        },
      };
      const executionContext = {
        getBudgetEnforcer() {
          return budgetEnforcer;
        },
        async emit(_key, _value, _meta) {
          callLog.push('emit');
        },
        async out(_value, _meta) {
          callLog.push('out');
        },
        async lookup(_table, _keys) {
          callLog.push('lookup');
          return [{id: 10}];
        },
        async broadcast(_ref, _dataset) {
          callLog.push('broadcast');
        },
        useBroadcast(_ref) {
          callLog.push('useBroadcast');
          return [];
        },
        async call(_query, _params, _handler, _opts) {
          callLog.push('call');
          return {rows: [{id: 20}]};
        },
        isCancelled() {
          return false;
        },
        throwIfCancelled() {},
      };

      const host = createHost({
        executionContext,
        runExportHandler: async (ctx, args) => {
          const callbackContext = ctx.callbackContext;
          await callbackContext.lookup('users', [1]);
          await callbackContext.emit('topic', {id: 1});
          await callbackContext.broadcast('group-a', args.rows);
          callbackContext.useBroadcast('group-a');
          await callbackContext.call(
            'SELECT * FROM t WHERE id = ?',
            [1],
          );
          await callbackContext.out({ok: true});
          return args.rows;
        },
      });
      const descriptor = {
        callbackModuleRef: FUNCTION_ID,
        callbackExport: RUN_EXPORT,
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      };

      const result = await host.execute(
        [{partitionId: 'p1', rows: [{id: 4}]}],
        descriptor,
        {},
      );

      assert.equal(result.state, 'completed');
      assert.deepStrictEqual(result.partitionResults[0].rows, [{id: 4}]);
      assert.deepStrictEqual(callLog, [
        'lookup',
        'emit',
        'broadcast',
        'useBroadcast',
        'recordNestedCall',
        'incrementInflight',
        'call',
        'decrementInflight',
        'out',
      ]);
    });

  it('preserves stage-aware debug metadata across multi-batch retries',
    async () => {
      const observedScopes = [];
      const wasmExecutor = {
        async execute(_func, context, args, _options) {
          observedScopes.push(context.debugScope);
          return {result: args.rows, mutations: []};
        },
      };
      const host = createHost({
        wasmExecutor,
        stageIndex: 7,
        lineageTracker: new LineageTracker('retry-query'),
      });
      const descriptor = {
        callbackModuleRef: FUNCTION_ID,
        callbackExport: RUN_EXPORT,
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      };
      const batches = [
        {partitionId: 'p1', rows: [{id: 1}]},
        {partitionId: 'p2', rows: [{id: 2}]},
        {partitionId: 'p3', rows: [{id: 3}]},
      ];

      await host.execute(batches, descriptor, {
        runtimeOptions: {attempt: 1},
      });
      await host.execute(batches, descriptor, {
        runtimeOptions: {attempt: 2},
      });

      assert.equal(observedScopes.length, 6);
      for (let i = 0; i < batches.length; i++) {
        const firstAttemptScope = observedScopes[i];
        const secondAttemptScope = observedScopes[i + batches.length];
        assert.deepStrictEqual(firstAttemptScope, secondAttemptScope);
        assert.equal(firstAttemptScope.stageId, 7);
        assert.equal(
          firstAttemptScope.partitionId,
          batches[i].partitionId,
        );
        assert.equal(firstAttemptScope.callbackExport, RUN_EXPORT);
        assert.ok(firstAttemptScope.lineageId.startsWith('retry-query:7:'));
      }
    });
});
