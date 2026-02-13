/**
 * Tests proving callback runtime lifecycle touchpoints route
 * through Service_Runtime_Lifecycle semantics — no parallel
 * lifecycle owner exists for callback execution.
 *
 * Validates:
 *   - ServiceRuntimeLifecycle resolves callback-compatible kinds
 *   - Lifecycle and callback registries use the same RUNTIME_KIND enum
 *   - CallbackExecutionHost has NO lifecycle methods (execute only)
 *   - Lifecycle telemetry emits runtimeKind matching CALLBACK_RUNTIME_KIND
 *   - Unknown kinds fail closed in both lifecycle and callback paths
 *   - No parallel lifecycle system exists
 *
 * Requirements: 1.3, 1.5, 14.2, 14.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceRuntimeLifecycle,
} from '../../src/runtime/service-runtime-lifecycle.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {
  UnknownRuntimeKindError,
} from '../../src/runtime/runtime-driver-errors.js';
import {
  CallbackExecutionHost,
} from '../../src/query/callback-execution-host.js';
import {
  CallbackRuntimeDriverRegistry,
} from '../../src/query/callback-runtime-driver-registry.js';
import {
  RUNTIME_KIND,
  LIFECYCLE_EVENT,
} from '../../src/constants/runtime.js';
import {
  CALLBACK_RUNTIME_KIND,
} from '../../src/query/sql-adapter-constants.js';

// --- Minimal concrete driver for lifecycle registry ---

class StubNativeDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true};
  }
  async prepare() {
    return {status: 'ready'};
  }
  async start() {
    return {status: 'running'};
  }
  async stop() {}
  async health() {
    return {status: 'healthy'};
  }
}

class StubWasmDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
  validateDescriptor() {
    return {valid: true};
  }
  async prepare() {
    return {status: 'ready'};
  }
  async start() {
    return {status: 'running'};
  }
  async stop() {}
  async health() {
    return {status: 'healthy'};
  }
}

/**
 * Build a lifecycle instance with both callback-compatible
 * drivers registered.
 *
 * @return {{lifecycle: ServiceRuntimeLifecycle,
 *   registry: RuntimeDriverRegistry}}
 */
function buildLifecycle() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubNativeDriver());
  registry.register(new StubWasmDriver());
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  return {lifecycle, registry};
}

// --- 1. Lifecycle resolves callback-compatible runtime kinds ---

describe('Lifecycle resolves callback-compatible kinds', () => {
  it('resolves native_js via _resolveDriver', () => {
    const {lifecycle} = buildLifecycle();
    const driver = lifecycle._resolveDriver(RUNTIME_KIND.NATIVE_JS);
    assert.equal(driver.kind, RUNTIME_KIND.NATIVE_JS);
  });

  it('resolves wasm_component via _resolveDriver', () => {
    const {lifecycle} = buildLifecycle();
    const driver = lifecycle._resolveDriver(
      RUNTIME_KIND.WASM_COMPONENT,
    );
    assert.equal(driver.kind, RUNTIME_KIND.WASM_COMPONENT);
  });

  it('prepare succeeds for native_js definition', async () => {
    const {lifecycle} = buildLifecycle();
    const result = await lifecycle.prepare(
      {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId: 'svc-1'},
      {},
    );
    assert.equal(result.status, 'ready');
  });

  it('prepare succeeds for wasm_component definition', async () => {
    const {lifecycle} = buildLifecycle();
    const result = await lifecycle.prepare(
      {runtime_kind: RUNTIME_KIND.WASM_COMPONENT, serviceId: 'svc-2'},
      {},
    );
    assert.equal(result.status, 'ready');
  });
});

// --- 2. Same RUNTIME_KIND enum used by both registries ---

describe('Shared RUNTIME_KIND enum', () => {
  it('CALLBACK_RUNTIME_KIND is identical to RUNTIME_KIND', () => {
    assert.strictEqual(CALLBACK_RUNTIME_KIND, RUNTIME_KIND);
  });

  it('CALLBACK_RUNTIME_KIND.NATIVE_JS matches RUNTIME_KIND', () => {
    assert.equal(
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
      RUNTIME_KIND.NATIVE_JS,
    );
  });

  it('CALLBACK_RUNTIME_KIND.WASM_COMPONENT matches RUNTIME_KIND', () => {
    assert.equal(
      CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      RUNTIME_KIND.WASM_COMPONENT,
    );
  });

  it('CALLBACK_RUNTIME_KIND.OCI_CONTAINER matches RUNTIME_KIND', () => {
    assert.equal(
      CALLBACK_RUNTIME_KIND.OCI_CONTAINER,
      RUNTIME_KIND.OCI_CONTAINER,
    );
  });

  it('lifecycle registry resolves same kind values as callback', () => {
    const {registry} = buildLifecycle();
    const callbackRegistry = new CallbackRuntimeDriverRegistry();
    callbackRegistry.registerDriver(
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
      {invokeCallback: async () => []},
    );

    // Both registries resolve native_js without error
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.ok(
      callbackRegistry.hasDriver(CALLBACK_RUNTIME_KIND.NATIVE_JS),
    );
    // The string values are identical
    assert.equal(
      RUNTIME_KIND.NATIVE_JS,
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
    );
  });
});

// --- 3. CallbackExecutionHost has NO lifecycle methods ---

describe('No parallel lifecycle on CallbackExecutionHost', () => {
  it('has execute method', () => {
    const host = new CallbackExecutionHost();
    assert.equal(typeof host.execute, 'function');
  });

  it('does NOT have prepare method', () => {
    const host = new CallbackExecutionHost();
    assert.equal(host.prepare, undefined);
  });

  it('does NOT have start method', () => {
    const host = new CallbackExecutionHost();
    assert.equal(host.start, undefined);
  });

  it('does NOT have stop method', () => {
    const host = new CallbackExecutionHost();
    assert.equal(host.stop, undefined);
  });

  it('does NOT have health method', () => {
    const host = new CallbackExecutionHost();
    assert.equal(host.health, undefined);
  });
});

// --- 4. Callback host delegates runtime selection to registry ---

describe('Callback host delegates to registry', () => {
  it('host uses runtimeDriverRegistry for driver lookup', async () => {
    let resolvedKind = null;
    const mockRegistry = {
      getDriver(kind) {
        resolvedKind = kind;
        return {
          async invokeCallback() {
            return [{result: true}];
          },
        };
      },
    };
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: mockRegistry,
    });
    await host.execute(
      [{partitionId: 'p1', rows: [{id: 1}]}],
      {
        callbackModuleRef: 'mod-1',
        callbackExport: 'handler',
        runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
      },
    );
    assert.equal(resolvedKind, CALLBACK_RUNTIME_KIND.NATIVE_JS);
  });

  it('registry kind matches lifecycle enum value', async () => {
    let resolvedKind = null;
    const mockRegistry = {
      getDriver(kind) {
        resolvedKind = kind;
        return {
          async invokeCallback() {
            return [];
          },
        };
      },
    };
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: mockRegistry,
    });
    await host.execute(
      [{partitionId: 'p1', rows: []}],
      {
        callbackModuleRef: 'mod-2',
        callbackExport: 'fn',
        runtimeKind: CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      },
    );
    // The kind passed to the callback registry is the same
    // string value the lifecycle registry uses
    assert.equal(resolvedKind, RUNTIME_KIND.WASM_COMPONENT);
  });
});

// --- 5. Lifecycle telemetry emits runtimeKind matching callback ---

describe('Lifecycle telemetry runtimeKind matches callback kinds', () => {
  it('prepare emits runtimeKind for native_js', async () => {
    const {lifecycle} = buildLifecycle();
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (e) => events.push(e));
    lifecycle.on(
      LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => events.push(e),
    );

    await lifecycle.prepare(
      {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId: 'svc-t1'},
      {},
    );

    assert.ok(events.length >= 2);
    for (const evt of events) {
      assert.equal(evt.runtimeKind, CALLBACK_RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('start emits runtimeKind for wasm_component', async () => {
    const {lifecycle} = buildLifecycle();
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.START_START, (e) => events.push(e));
    lifecycle.on(
      LIFECYCLE_EVENT.START_SUCCESS, (e) => events.push(e),
    );

    await lifecycle.start({
      definition: {
        runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
        serviceId: 'svc-t2',
      },
    });

    assert.ok(events.length >= 2);
    for (const evt of events) {
      assert.equal(
        evt.runtimeKind,
        CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      );
    }
  });

  it('stop emits runtimeKind for native_js', async () => {
    const {lifecycle} = buildLifecycle();
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.STOP_START, (e) => events.push(e));
    lifecycle.on(
      LIFECYCLE_EVENT.STOP_SUCCESS, (e) => events.push(e),
    );

    await lifecycle.stop({
      definition: {
        runtime_kind: RUNTIME_KIND.NATIVE_JS,
        serviceId: 'svc-t3',
      },
    });

    assert.ok(events.length >= 2);
    for (const evt of events) {
      assert.equal(evt.runtimeKind, CALLBACK_RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('health emits runtimeKind for wasm_component', async () => {
    const {lifecycle} = buildLifecycle();
    const events = [];
    lifecycle.on(
      LIFECYCLE_EVENT.HEALTH_CHECK, (e) => events.push(e),
    );
    lifecycle.on(
      LIFECYCLE_EVENT.HEALTH_RESULT, (e) => events.push(e),
    );

    await lifecycle.health({
      definition: {
        runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
        serviceId: 'svc-t4',
      },
    });

    assert.ok(events.length >= 2);
    for (const evt of events) {
      assert.equal(
        evt.runtimeKind,
        CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      );
    }
  });
});

// --- 6. Unknown kinds fail closed in both systems ---

describe('Unknown kinds fail closed', () => {
  it('lifecycle rejects unknown kind with UnknownRuntimeKindError', () => {
    const {lifecycle} = buildLifecycle();
    assert.throws(
      () => lifecycle._resolveDriver('unknown_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'unknown_kind');
        return true;
      },
    );
  });

  it('callback registry rejects unknown kind with error', () => {
    const callbackRegistry = new CallbackRuntimeDriverRegistry();
    callbackRegistry.registerDriver(
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
      {invokeCallback: async () => []},
    );
    assert.throws(
      () => callbackRegistry.getDriver('unknown_kind'),
    );
  });

  it('both registries reject the same unknown kind string', () => {
    const {lifecycle} = buildLifecycle();
    const callbackRegistry = new CallbackRuntimeDriverRegistry();
    callbackRegistry.registerDriver(
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
      {invokeCallback: async () => []},
    );

    const unknownKind = 'nonexistent_runtime';

    assert.throws(
      () => lifecycle._resolveDriver(unknownKind),
      (err) => err instanceof UnknownRuntimeKindError,
    );
    assert.throws(
      () => callbackRegistry.getDriver(unknownKind),
    );
  });
});

// --- 7. No parallel lifecycle system ---

describe('No parallel lifecycle system', () => {
  it('CallbackExecutionHost prototype has no lifecycle methods', () => {
    const proto = CallbackExecutionHost.prototype;
    const lifecycleMethods = ['prepare', 'start', 'stop', 'health'];
    for (const method of lifecycleMethods) {
      assert.equal(
        proto[method],
        undefined,
        `CallbackExecutionHost.prototype.${method} must not exist`,
      );
    }
  });

  it('CallbackExecutionHost instance has no lifecycle methods', () => {
    const host = new CallbackExecutionHost({});
    const lifecycleMethods = ['prepare', 'start', 'stop', 'health'];
    for (const method of lifecycleMethods) {
      assert.equal(
        host[method],
        undefined,
        `host.${method} must not exist`,
      );
    }
  });

  it('ServiceRuntimeLifecycle has all lifecycle methods', () => {
    const {lifecycle} = buildLifecycle();
    assert.equal(typeof lifecycle.prepare, 'function');
    assert.equal(typeof lifecycle.start, 'function');
    assert.equal(typeof lifecycle.stop, 'function');
    assert.equal(typeof lifecycle.health, 'function');
  });

  it('only ServiceRuntimeLifecycle owns lifecycle orchestration', () => {
    // ServiceRuntimeLifecycle has _resolveDriver (lifecycle path)
    const {lifecycle} = buildLifecycle();
    assert.equal(typeof lifecycle._resolveDriver, 'function');

    // CallbackExecutionHost has no _resolveDriver
    const host = new CallbackExecutionHost({});
    assert.equal(host._resolveDriver, undefined);
  });
});
