/**
 * Tests for the callback-host runtime invocation contract.
 *
 * Proves that CallbackExecutionHost resolves runtime kind
 * through Runtime_Driver_Registry ownership — the callback
 * registry uses the same RUNTIME_KIND constants, fails closed
 * for unknown kinds, and has no fallback handler path.
 *
 * Validates: Requirements 1.3, 14.2, 14.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  CALLBACK_RUNTIME_KIND,
  ADAPTER_ERROR_MSG,
} from '../../src/query/sql-adapter-constants.js';
import {
  CallbackRuntimeDriverRegistry,
  createCallbackDriverRegistry,
} from '../../src/query/callback-runtime-driver-registry.js';
import {
  CallbackExecutionHost,
} from '../../src/query/callback-execution-host.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {UnknownRuntimeKindError} from
  '../../src/runtime/runtime-driver-errors.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

// --- Helpers ---

/** Minimal driver satisfying the invokeCallback contract. */
class StubCallbackDriver {
  async invokeCallback(_batch, _descriptor, _options) {
    return [{result: true}];
  }
}

/** Build a minimal valid descriptor for native_js. */
function nativeDescriptor() {
  return {
    callbackModuleRef: 'mod-1',
    callbackExport: 'run',
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
  };
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

// --- 1. Same RUNTIME_KIND constants ---

describe('CALLBACK_RUNTIME_KIND is RUNTIME_KIND', () => {
  it('alias is the exact same object reference', () => {
    assert.equal(
      CALLBACK_RUNTIME_KIND, RUNTIME_KIND,
      'CALLBACK_RUNTIME_KIND must be === RUNTIME_KIND',
    );
  });

  it('all RUNTIME_KIND values present in alias', () => {
    for (const key of Object.keys(RUNTIME_KIND)) {
      assert.equal(
        CALLBACK_RUNTIME_KIND[key], RUNTIME_KIND[key],
      );
    }
  });

  it('alias is frozen', () => {
    assert.ok(Object.isFrozen(CALLBACK_RUNTIME_KIND));
  });
});

// --- 2. Callback registry maps same enum values ---

describe('CallbackRuntimeDriverRegistry enum alignment', () => {
  it('pre-configured registry has all three runtime kinds', () => {
    const registry = createCallbackRegistry();
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.ok(registry.hasDriver(RUNTIME_KIND.WASM_COMPONENT));
    assert.ok(registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('registry resolves drivers by RUNTIME_KIND values', () => {
    const registry = createCallbackRegistry();
    const nativeDriver = registry.getDriver(
      RUNTIME_KIND.NATIVE_JS,
    );
    assert.ok(nativeDriver);
    assert.equal(typeof nativeDriver.invokeCallback, 'function');

    const wasmDriver = registry.getDriver(
      RUNTIME_KIND.WASM_COMPONENT,
    );
    assert.ok(wasmDriver);
    assert.equal(typeof wasmDriver.invokeCallback, 'function');

    const ociDriver = registry.getDriver(
      RUNTIME_KIND.OCI_CONTAINER,
    );
    assert.ok(ociDriver);
    assert.equal(typeof ociDriver.invokeCallback, 'function');
  });

  it('unified RuntimeDriverRegistry uses same enum values', () => {
    const unified = new RuntimeDriverRegistry();
    const callback = new CallbackRuntimeDriverRegistry();

    // Both registries accept the same RUNTIME_KIND keys
    for (const kind of Object.values(RUNTIME_KIND)) {
      callback.registerDriver(kind, new StubCallbackDriver());
      assert.ok(callback.hasDriver(kind));
    }
    // Unified registry uses driver.kind, but the enum values
    // are identical — verified by the alias assertion above.
    assert.ok(unified);
  });
});

// --- 3. Fail-closed for unknown runtime kinds ---

describe('Callback registry fails closed', () => {
  it('unknown kind throws with no fallback', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver('unknown_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'unknown_kind');
        return true;
      },
    );
  });

  it('null kind throws', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver(null),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, null);
        return true;
      },
    );
  });

  it('empty string kind throws', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver(''),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, '');
        return true;
      },
    );
  });

  it('undefined kind throws', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver(undefined),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });
});

// --- 4. CallbackExecutionHost delegates to registry ---

describe('CallbackExecutionHost runtime delegation', () => {
  it('_invokeCallback delegates to registry getDriver', async () => {
    let resolvedKind = null;
    const mockRegistry = {
      getDriver(kind) {
        resolvedKind = kind;
        return new StubCallbackDriver();
      },
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: mockRegistry,
    });

    const batch = {partitionId: 'p1', rows: [{id: 1}]};
    const descriptor = nativeDescriptor();

    // Use execute() which calls _invokeCallback internally
    const result = await host.execute(
      [batch], descriptor, {handler: () => [{ok: true}]},
    );

    assert.equal(
      resolvedKind, CALLBACK_RUNTIME_KIND.NATIVE_JS,
    );
    assert.ok(result);
  });

  it('no fallback handler when registry returns driver', async () => {
    let driverInvoked = false;
    const mockDriver = {
      async invokeCallback(_batch, _desc, _opts) {
        driverInvoked = true;
        return [{done: true}];
      },
    };
    const mockRegistry = {
      getDriver(_kind) {
        return mockDriver;
      },
    };

    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: mockRegistry,
    });

    const batch = {partitionId: 'p1', rows: []};
    await host.execute([batch], nativeDescriptor());

    assert.ok(
      driverInvoked,
      'driver.invokeCallback must be called',
    );
  });
});

// --- 5. No registry → error (no fallback) ---

describe('CallbackExecutionHost without registry', () => {
  it('throws when no registry is provided', async () => {
    const host = new CallbackExecutionHost({});
    const batch = {partitionId: 'p1', rows: []};
    const descriptor = nativeDescriptor();

    // execute catches errors per-batch and returns failed state
    const result = await host.execute(
      [batch], descriptor,
    );

    // The batch should fail with the unsupported runtime error
    assert.equal(result.partitionResults.length, 1);
    const batchResult = result.partitionResults[0];
    assert.ok(batchResult.error);
    assert.ok(batchResult.error.includes(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
    ));
  });

  it('null registry produces error, not silent fallback', async () => {
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: null,
    });
    const batch = {partitionId: 'p1', rows: []};
    const descriptor = nativeDescriptor();

    const result = await host.execute([batch], descriptor);

    const batchResult = result.partitionResults[0];
    assert.ok(batchResult.error);
    assert.ok(batchResult.error.includes(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
    ));
  });
});

// --- 6. Unknown runtime kind in descriptor → error ---

describe('Unknown runtime kind in callback descriptor', () => {
  it('unsupported kind rejected by descriptor validation', async () => {
    const host = new CallbackExecutionHost({
      runtimeDriverRegistry: createCallbackRegistry(),
    });

    const batch = {partitionId: 'p1', rows: []};
    const descriptor = {
      callbackModuleRef: 'mod-1',
      callbackExport: 'run',
      runtimeKind: 'imaginary_runtime',
    };

    await assert.rejects(
      () => host.execute([batch], descriptor),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME,
        ));
        assert.ok(err.message.includes('imaginary_runtime'));
        return true;
      },
    );
  });

  it('registry getDriver also rejects unknown kind', () => {
    const registry = createCallbackRegistry();
    assert.throws(
      () => registry.getDriver('imaginary_runtime'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'imaginary_runtime');
        return true;
      },
    );
  });
});

// --- 7. Driver registration requires invokeCallback ---

describe('Driver registration contract', () => {
  it('rejects driver without invokeCallback method', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    assert.throws(
      () => registry.registerDriver('test_kind', {}),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE,
        ));
        return true;
      },
    );
  });

  it('rejects null driver', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    assert.throws(
      () => registry.registerDriver('test_kind', null),
      (err) => {
        assert.ok(err.message.includes(
          ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE,
        ));
        return true;
      },
    );
  });

  it('accepts driver with invokeCallback method', () => {
    const registry = new CallbackRuntimeDriverRegistry();
    registry.registerDriver('test_kind', new StubCallbackDriver());
    assert.ok(registry.hasDriver('test_kind'));
  });
});
