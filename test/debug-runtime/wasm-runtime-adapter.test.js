import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {
  WasmRuntimeAdapter,
  InProcessWasmRuntimeAdapter,
} from '../../src/debug-runtime/wasm-runtime-adapter.js';
import {
  WASM_RUNTIME_ADAPTER_ERROR_MSG as ERR,
} from '../../src/debug-runtime/debug-runtime-constants.js';

const MODULE_REF = 'module-a';
const RUN_EXPORT = 'run';

function makeModuleEntry(handler) {
  return {
    manifest: {runExport: RUN_EXPORT},
    exports: {[RUN_EXPORT]: handler},
    wasmBytes: Buffer.alloc(0),
  };
}

describe('WasmRuntimeAdapter contract', () => {
  it('rejects direct instantiation of abstract class', () => {
    assert.throws(
      () => new WasmRuntimeAdapter('x'),
      (err) => err.message === ERR.ABSTRACT_CLASS,
    );
  });

  it('throws not-implemented errors for unimplemented methods',
    async () => {
      class IncompleteAdapter extends WasmRuntimeAdapter {
        constructor() {
          super('incomplete');
        }
      }
      const adapter = new IncompleteAdapter();

      await assert.rejects(
        () => adapter.createInstance({}),
        (err) => err.message.includes('createInstance'),
      );
      await assert.rejects(
        () => adapter.execute({}),
        (err) => err.message.includes('execute'),
      );
      await assert.rejects(
        () => adapter.destroyInstance({instanceId: 'i'}),
        (err) => err.message.includes('destroyInstance'),
      );
    });
});

describe('InProcessWasmRuntimeAdapter', () => {
  it('validates createInstance request shape', async () => {
    const adapter = new InProcessWasmRuntimeAdapter();
    await assert.rejects(
      () => adapter.createInstance(null),
      (err) => err.message === ERR.REQUEST_REQUIRED,
    );
    await assert.rejects(
      () => adapter.createInstance({moduleRef: '', moduleEntry: {}}),
      (err) => err.message === ERR.MODULE_REF_REQUIRED,
    );
    await assert.rejects(
      () => adapter.createInstance({moduleRef: MODULE_REF}),
      (err) => err.message === ERR.MODULE_ENTRY_REQUIRED,
    );
  });

  it('supports create execute inspect suspend resume destroy lifecycle',
    async () => {
      const adapter = new InProcessWasmRuntimeAdapter();
      const moduleEntry = makeModuleEntry((_ctx, args) => {
        return {answer: args.value};
      });

      const createResult = await adapter.createInstance({
        moduleRef: MODULE_REF,
        moduleEntry,
      });
      const instanceHandle = createResult.instanceHandle;
      assert.ok(instanceHandle.instanceId);
      assert.equal(adapter.getInstanceCount(), 1);

      const execResult = await adapter.execute({
        instanceHandle,
        manifest: moduleEntry.manifest,
        context: {},
        args: {value: 42},
      });
      assert.deepStrictEqual(execResult.result, {answer: 42});
      assert.deepStrictEqual(execResult.mutations, []);

      const inspectBefore = await adapter.inspect({instanceHandle});
      assert.equal(inspectBefore.state, 'running');
      assert.equal(inspectBefore.moduleRef, MODULE_REF);

      const suspended = await adapter.suspend({
        instanceHandle,
        reason: 'debug-stop',
      });
      assert.equal(suspended.status, 'paused');
      const inspectPaused = await adapter.inspect({instanceHandle});
      assert.equal(inspectPaused.state, 'paused');
      assert.equal(inspectPaused.suspendReason, 'debug-stop');

      const resumed = await adapter.resume({instanceHandle});
      assert.equal(resumed.status, 'running');
      const inspectResumed = await adapter.inspect({instanceHandle});
      assert.equal(inspectResumed.state, 'running');
      assert.equal(inspectResumed.suspendReason, null);

      const destroyResult = await adapter.destroyInstance(instanceHandle);
      assert.equal(destroyResult.destroyed, true);
      assert.equal(adapter.getInstanceCount(), 0);
      await assert.rejects(
        () => adapter.inspect({instanceHandle}),
        (err) => err.message.includes(ERR.INSTANCE_NOT_FOUND),
      );
    });

  it('enforces execution timeout from request options', async () => {
    let pendingTimer;
    const adapter = new InProcessWasmRuntimeAdapter();
    const moduleEntry = makeModuleEntry(async () => {
      return await new Promise((resolve) => {
        pendingTimer = setTimeout(() => resolve('late'), 40);
      });
    });
    const createResult = await adapter.createInstance({
      moduleRef: MODULE_REF,
      moduleEntry,
    });
    try {
      await assert.rejects(
        () => adapter.execute({
          instanceHandle: createResult.instanceHandle,
          manifest: moduleEntry.manifest,
          context: {},
          args: {},
          options: {timeoutMs: 5},
        }),
        (err) => err.message === ERR.EXECUTION_TIMEOUT,
      );
    } finally {
      clearTimeout(pendingTimer);
      await adapter.destroyInstance(createResult.instanceHandle);
    }
  });

  it('supports cancellation token in execution options', async () => {
    let pendingTimer;
    let cancelTimer;
    const token = new CancellationToken();
    const adapter = new InProcessWasmRuntimeAdapter();
    const moduleEntry = makeModuleEntry(async () => {
      return await new Promise((resolve) => {
        pendingTimer = setTimeout(() => resolve('late'), 40);
      });
    });
    const createResult = await adapter.createInstance({
      moduleRef: MODULE_REF,
      moduleEntry,
    });

    try {
      cancelTimer = setTimeout(() => token.cancel('cancelled-for-test'), 5);
      await assert.rejects(
        () => adapter.execute({
          instanceHandle: createResult.instanceHandle,
          manifest: moduleEntry.manifest,
          context: {},
          args: {},
          options: {
            timeoutMs: 100,
            cancellationToken: token,
          },
        }),
        (err) => err.message === 'cancelled-for-test',
      );
    } finally {
      clearTimeout(cancelTimer);
      clearTimeout(pendingTimer);
      await adapter.destroyInstance(createResult.instanceHandle);
    }
  });
});
