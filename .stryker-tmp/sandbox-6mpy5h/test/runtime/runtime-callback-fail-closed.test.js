/**
 * Tests for fail-closed behavior of unknown/unsupported callback
 * runtime kinds.
 *
 * Proves that unknown or unsupported runtime kinds produce typed
 * errors with no fallback execution path — the system fails closed.
 *
 * Validates: Requirements 1.5, 6.5, 14.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CallbackRuntimeDriverRegistry,
  NativeJsCallbackDriver,
  WasmComponentCallbackDriver,
  OciContainerCallbackDriver,
  createCallbackDriverRegistry,
} from '../../src/query/callback/callback-runtime-driver-registry.js';
import {
  CallbackExecutionHost,
  validateDescriptor,
} from '../../src/query/callback/callback-execution-host.js';
import {ADAPTER_ERROR_MSG} from
  '../../src/query/sql-adapter-constants.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from
  '../../src/runtime/runtime-driver.js';
import {UnknownRuntimeKindError} from
  '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

// --- Minimal stub driver for unified registry tests ---

class StubRuntimeDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
}

function createRuntimeRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return runtimeWiring.runtimeDriverRegistry;
}

function createCallbackRegistry(overrides = {}) {
  return createCallbackDriverRegistry({
    runtimeDriverRegistry: createRuntimeRegistry(),
    ...overrides,
  });
}

// --- 1. CallbackRuntimeDriverRegistry.getDriver() unknown kind ---

describe('CallbackRuntimeDriverRegistry fail-closed', () => {
  it('throws for unknown runtime kind', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    assert.throws(
      () => registry.getDriver('totally_unknown'),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND,
        ));
        assert.ok(err.message.includes('totally_unknown'));
        return true;
      },
    );
  });

  it('throws for null runtime kind', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    assert.throws(
      () => registry.getDriver(null),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND,
        ));
        return true;
      },
    );
  });

  it('throws for empty string runtime kind', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    assert.throws(
      () => registry.getDriver(''),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND,
        ));
        return true;
      },
    );
  });

  it('pre-configured registry throws for unknown kind', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver('mystery_runtime'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'mystery_runtime');
        return true;
      },
    );
  });
});

// --- 2. validateDescriptor runtime-kind checks ---

describe('validateDescriptor fail-closed', () => {
  it('accepts oci_container kind at descriptor level', () => {
    assert.doesNotThrow(
      () => validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
        runtimeKind: 'oci_container',
      }),
    );
  });

  it('rejects completely unknown runtime kind', () => {
    assert.throws(
      () => validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
        runtimeKind: 'alien_runtime',
      }),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        assert.ok(err.message.includes('alien_runtime'));
        return true;
      },
    );
  });

  // --- 3. Missing runtimeKind ---

  it('rejects missing runtimeKind', () => {
    assert.throws(
      () => validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
      }),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_RUNTIME_KIND_REQUIRED,
        ));
        return true;
      },
    );
  });

  it('rejects null runtimeKind', () => {
    assert.throws(
      () => validateDescriptor({
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
        runtimeKind: null,
      }),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_RUNTIME_KIND_REQUIRED,
        ));
        return true;
      },
    );
  });
});

// --- 4. OciContainerCallbackDriver gate disabled ---

describe('OciContainerCallbackDriver fail-closed', () => {
  it('rejects when feature gate is disabled', async () => {
    const driver = new OciContainerCallbackDriver({
      featureGateEnabled: false,
    });
    await assert.rejects(
      () => driver.invokeCallback({}, {}, {}),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
        ));
        return true;
      },
    );
  });

  // --- 5. OciContainerCallbackDriver gate enabled (future) ---

  it('rejects even when feature gate is enabled', async () => {
    const driver = new OciContainerCallbackDriver({
      featureGateEnabled: true,
    });
    await assert.rejects(
      () => driver.invokeCallback({}, {}, {}),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
        ));
        return true;
      },
    );
  });
});

// --- 6. Unified RuntimeDriverRegistry fail-closed ---

describe('Unified RuntimeDriverRegistry fail-closed', () => {
  it('throws UnknownRuntimeKindError for unknown kind', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new StubRuntimeDriver());
    registry.freeze();
    assert.throws(
      () => registry.getDriver('nonexistent_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'nonexistent_kind');
        assert.ok(Array.isArray(err.availableKinds));
        return true;
      },
    );
  });
});

// --- 7. No fallback path: error propagates ---

describe('No fallback path', () => {
  it('callback registry error propagates without retry', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    let errorCaught = null;
    try {
      registry.getDriver('bad_kind');
    } catch (err) {
      errorCaught = err;
    }
    assert.ok(errorCaught);
    assert.ok(errorCaught.message.includes(
      ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND,
    ));
    // Verify the error is a plain Error — not silently
    // swallowed or wrapped in a fallback result.
    assert.ok(errorCaught instanceof Error);
  });
});

// --- 8. CallbackExecutionHost.execute() with unknown kind ---

describe('CallbackExecutionHost.execute() fail-closed', () => {
  it('returns failed batch when runtime is allowed by descriptor but not executable', async () => {
    const host = new CallbackExecutionHost({});
    const batches = [{partitionId: 'p1', rows: [{id: 1}]}];
    const descriptor = {
      callbackModuleRef: 'mod-1',
      callbackExport: 'run',
      runtimeKind: 'oci_container',
    };
    const result = await host.execute(batches, descriptor);
    assert.equal(result.failedPartitions, 1);
    assert.ok(result.partitionResults[0].error.includes(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
    ));
    assert.ok(result.partitionResults[0].error.includes('oci_container'));
  });

  it('throws for completely unknown runtime kind', async () => {
    const host = new CallbackExecutionHost({});
    const batches = [{partitionId: 'p1', rows: [{id: 1}]}];
    const descriptor = {
      callbackModuleRef: 'mod-1',
      callbackExport: 'run',
      runtimeKind: 'quantum_runtime',
    };
    await assert.rejects(
      () => host.execute(batches, descriptor),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        assert.ok(err.message.includes('quantum_runtime'));
        return true;
      },
    );
  });
});

// --- 9. NativeJsCallbackDriver no handler ---

describe('NativeJsCallbackDriver fail-closed', () => {
  it('throws when no handler function is provided', async () => {
    const driver = new NativeJsCallbackDriver();
    await assert.rejects(
      () => driver.invokeCallback(
        {partitionId: 'p1', rows: []},
        {callbackModuleRef: 'mod', callbackExport: 'run'},
        {},
      ),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        return true;
      },
    );
  });

  it('throws when handler is not a function', async () => {
    const driver = new NativeJsCallbackDriver();
    await assert.rejects(
      () => driver.invokeCallback(
        {partitionId: 'p1', rows: []},
        {callbackModuleRef: 'mod', callbackExport: 'run'},
        {handler: 'not-a-function'},
      ),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        return true;
      },
    );
  });
});

// --- 10. WasmComponentCallbackDriver no executor ---

describe('WasmComponentCallbackDriver fail-closed', () => {
  it('throws when no wasmExecutor is provided', async () => {
    const driver = new WasmComponentCallbackDriver();
    await assert.rejects(
      () => driver.invokeCallback(
        {partitionId: 'p1', rows: []},
        {
          callbackModuleRef: 'mod',
          callbackExport: 'run',
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        },
        {},
      ),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        return true;
      },
    );
  });

  it('throws when wasmExecutor is null', async () => {
    const driver = new WasmComponentCallbackDriver({
      wasmExecutor: null,
    });
    await assert.rejects(
      () => driver.invokeCallback(
        {partitionId: 'p1', rows: []},
        {
          callbackModuleRef: 'mod',
          callbackExport: 'run',
          runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        },
        {},
      ),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        return true;
      },
    );
  });
});
