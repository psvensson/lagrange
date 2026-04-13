/**
 * Tests for CallbackRuntimeDriverRegistry and drivers.
 *
 * Validates: Requirements 14.3
 *
 * Verifies that runtime-kind selection for callback
 * invocation reuses the single driver registry with
 * native_js, wasm_component, and gated oci_container.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  CallbackRuntimeDriverRegistry,
  NativeJsCallbackDriver,
  WasmComponentCallbackDriver,
  OciContainerCallbackDriver,
  createCallbackDriverRegistry,
} from '../../src/query/callback/callback-runtime-driver-registry.js';
import {
  ADAPTER_ERROR_MSG,
  CALLBACK_RUNTIME_KIND,
} from '../../src/query/sql-adapter-constants.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

// --- Helpers ---

function makeBatch(partitionId, rows) {
  return {partitionId: partitionId || 'p0', rows: rows || []};
}

function makeDescriptor(overrides = {}) {
  return {
    callbackModuleRef: overrides.callbackModuleRef || 'mod-1',
    callbackExport: overrides.callbackExport || 'run_batch',
    runtimeKind: overrides.runtimeKind ||
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
  };
}

function makeRuntimeRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return runtimeWiring.runtimeDriverRegistry;
}

// --- Registry core ---

test('registry - getDriver returns registered driver',
  async (t) => {
    const registry = new CallbackRuntimeDriverRegistry();
    const driver = {invokeCallback: async () => []};
    registry.registerDriver('test_kind', driver);
    t.equal(registry.getDriver('test_kind'), driver);
  });

test('registry - getDriver fails closed for unknown kind',
  async (t) => {
    const registry = new CallbackRuntimeDriverRegistry();
    try {
      registry.getDriver('unknown_kind');
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.startsWith(
        ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND));
      t.ok(err.message.includes('unknown_kind'));
    }
  });

test('registry - hasDriver returns true for registered kind',
  async (t) => {
    const registry = new CallbackRuntimeDriverRegistry();
    const driver = {invokeCallback: async () => []};
    registry.registerDriver('test_kind', driver);
    t.ok(registry.hasDriver('test_kind'));
    t.ok(!registry.hasDriver('other_kind'));
  });

test('registry - registerDriver rejects missing invokeCallback',
  async (t) => {
    const registry = new CallbackRuntimeDriverRegistry();
    try {
      registry.registerDriver('bad', {});
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE);
    }
  });

test('registry - registerDriver rejects null driver',
  async (t) => {
    const registry = new CallbackRuntimeDriverRegistry();
    try {
      registry.registerDriver('bad', null);
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE);
    }
  });

// --- NativeJsCallbackDriver ---

test('native_js driver - invokes handler from options',
  async (t) => {
    const driver = new NativeJsCallbackDriver();
    const batch = makeBatch('p0', [{id: 1}]);
    const desc = makeDescriptor();
    const handler = (b, _d) => [{id: b.rows[0].id * 10}];

    const result = await driver.invokeCallback(
      batch, desc, {handler},
    );
    t.same(result, [{id: 10}]);
  });

test('native_js driver - throws when no handler in options',
  async (t) => {
    const driver = new NativeJsCallbackDriver();
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('native_js'));
    }
  });

test('native_js driver - throws when handler is not function',
  async (t) => {
    const driver = new NativeJsCallbackDriver();
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {handler: 'not-fn'},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('native_js'));
    }
  });

// --- WasmComponentCallbackDriver ---

test('wasm driver - delegates to wasmExecutor',
  async (t) => {
    let executeCalled = false;
    const wasmExecutor = {
      execute: async (func, context, args) => {
        executeCalled = true;
        t.equal(func.function_id, 'mod-1');
        t.equal(context.callbackExport, 'run_batch');
        t.same(args.rows, [{id: 1}]);
        return {result: [{processed: true}], mutations: []};
      },
    };

    const driver = new WasmComponentCallbackDriver({
      wasmExecutor,
    });
    const result = await driver.invokeCallback(
      makeBatch('p0', [{id: 1}]),
      makeDescriptor(),
      {},
    );

    t.ok(executeCalled);
    t.same(result, [{processed: true}]);
  });

test('wasm driver - forwards execution options to wasmExecutor',
  async (t) => {
    let receivedOptions = null;
    const wasmExecutor = {
      execute: async (_func, context, _args, options) => {
        receivedOptions = options;
        t.equal(context.callbackContext.tenantId, 'tenant-a');
        t.equal(context.debugScope.lineageId, 'lineage-1');
        t.equal(typeof context.debug.trace, 'function');
        return {result: [{ok: true}], mutations: []};
      },
    };

    const driver = new WasmComponentCallbackDriver({
      wasmExecutor,
    });
    const result = await driver.invokeCallback(
      makeBatch('p0', [{id: 1}]),
      makeDescriptor(),
      {
        callbackContext: {tenantId: 'tenant-a'},
        debugScope: {lineageId: 'lineage-1'},
        debug: {trace: () => true},
        runtimeOptions: {someFlag: true},
      },
    );

    t.same(result, [{ok: true}]);
    t.equal(receivedOptions.runtimeOptions.someFlag, true);
  });

test('wasm driver - wraps non-array result in array',
  async (t) => {
    const wasmExecutor = {
      execute: async () => ({result: {ok: true}, mutations: []}),
    };

    const driver = new WasmComponentCallbackDriver({
      wasmExecutor,
    });
    const result = await driver.invokeCallback(
      makeBatch(), makeDescriptor(), {},
    );

    t.same(result, [{ok: true}]);
  });

test('wasm driver - throws when no wasmExecutor provided',
  async (t) => {
    const driver = new WasmComponentCallbackDriver();
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('wasm_component'));
    }
  });

// --- OciContainerCallbackDriver ---

test('oci driver - rejects when feature gate disabled',
  async (t) => {
    const driver = new OciContainerCallbackDriver();
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED);
    }
  });

test('oci driver - rejects with explicit false gate',
  async (t) => {
    const driver = new OciContainerCallbackDriver({
      featureGateEnabled: false,
    });
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED);
    }
  });

// --- createCallbackDriverRegistry factory ---

test('factory - creates registry with all three drivers',
  async (t) => {
    const registry = createCallbackDriverRegistry({
      runtimeDriverRegistry: makeRuntimeRegistry(),
    });
    t.ok(registry.hasDriver(CALLBACK_RUNTIME_KIND.NATIVE_JS));
    t.ok(registry.hasDriver(
      CALLBACK_RUNTIME_KIND.WASM_COMPONENT));
    t.ok(registry.hasDriver(
      CALLBACK_RUNTIME_KIND.OCI_CONTAINER));
    t.equal(registry.hasRuntimeDriverRegistry(), true);
  });

test('factory - native_js driver works via registry',
  async (t) => {
    const registry = createCallbackDriverRegistry({
      runtimeDriverRegistry: makeRuntimeRegistry(),
    });
    const driver = registry.getDriver(
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
    );
    const handler = (b) => b.rows;
    const result = await driver.invokeCallback(
      makeBatch('p0', [{v: 1}]), makeDescriptor(), {handler},
    );
    t.same(result, [{v: 1}]);
  });

test('factory - oci_container driver rejects via registry',
  async (t) => {
    const registry = createCallbackDriverRegistry({
      runtimeDriverRegistry: makeRuntimeRegistry(),
    });
    const driver = registry.getDriver(
      CALLBACK_RUNTIME_KIND.OCI_CONTAINER,
    );
    try {
      await driver.invokeCallback(
        makeBatch(), makeDescriptor(), {},
      );
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message,
        ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED);
    }
  });

test('factory - wasm driver uses provided executor',
  async (t) => {
    const wasmExecutor = {
      execute: async () => ({result: [{ok: 1}], mutations: []}),
    };
    const registry = createCallbackDriverRegistry({
      runtimeDriverRegistry: makeRuntimeRegistry(),
      wasmExecutor,
    });
    const driver = registry.getDriver(
      CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
    );
    const result = await driver.invokeCallback(
      makeBatch(), makeDescriptor(), {},
    );
    t.same(result, [{ok: 1}]);
  });

test('factory - unknown kind fails closed',
  async (t) => {
    const registry = createCallbackDriverRegistry({
      runtimeDriverRegistry: makeRuntimeRegistry(),
    });
    try {
      registry.getDriver('imaginary_runtime');
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('imaginary_runtime'));
    }
  });

test('factory - rejects missing runtime driver ownership',
  async (t) => {
    try {
      createCallbackDriverRegistry();
      t.fail('should have thrown');
    } catch (err) {
      t.equal(
        err.message,
        ADAPTER_ERROR_MSG.RUNTIME_DRIVER_REGISTRY_REQUIRED,
      );
    }
  });
