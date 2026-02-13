/**
 * Tests for RuntimeDriverRegistry — the single lookup owner
 * for runtime drivers keyed by runtime_kind.
 *
 * Validates: Requirements 1.2, 1.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from
  '../../src/runtime/runtime-driver.js';
import {
  UnknownRuntimeKindError,
  DuplicateDriverError,
  RegistryFrozenError,
} from '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Minimal concrete drivers for testing ---

class NativeTestDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
}

class WasmTestDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
}

class OciTestDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.OCI_CONTAINER);
  }
}

// --- Registration ---

describe('RuntimeDriverRegistry registration', () => {
  it('should register a valid driver', () => {
    const registry = new RuntimeDriverRegistry();
    const driver = new NativeTestDriver();
    registry.register(driver);
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
  });

  it('should register multiple drivers for different kinds', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.register(new WasmTestDriver());
    registry.register(new OciTestDriver());
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.ok(registry.hasDriver(RUNTIME_KIND.WASM_COMPONENT));
    assert.ok(registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('should reject non-RuntimeDriver instances', () => {
    const registry = new RuntimeDriverRegistry();
    assert.throws(
      () => registry.register({kind: 'native_js'}),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject null driver', () => {
    const registry = new RuntimeDriverRegistry();
    assert.throws(
      () => registry.register(null),
      (err) => err instanceof TypeError,
    );
  });

  it('should reject undefined driver', () => {
    const registry = new RuntimeDriverRegistry();
    assert.throws(
      () => registry.register(undefined),
      (err) => err instanceof TypeError,
    );
  });

  it('should throw DuplicateDriverError for same kind', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    assert.throws(
      () => registry.register(new NativeTestDriver()),
      (err) => {
        assert.ok(err instanceof DuplicateDriverError);
        assert.equal(err.kind, RUNTIME_KIND.NATIVE_JS);
        return true;
      },
    );
  });
});

// --- Lookup ---

describe('RuntimeDriverRegistry lookup', () => {
  it('should return the registered driver for a kind', () => {
    const registry = new RuntimeDriverRegistry();
    const driver = new WasmTestDriver();
    registry.register(driver);
    assert.equal(registry.getDriver(RUNTIME_KIND.WASM_COMPONENT), driver);
  });

  it('should throw UnknownRuntimeKindError for unregistered kind', () => {
    const registry = new RuntimeDriverRegistry();
    assert.throws(
      () => registry.getDriver('imaginary_kind'),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.equal(err.kind, 'imaginary_kind');
        assert.ok(err.message.includes('imaginary_kind'));
        assert.deepStrictEqual(err.availableKinds, []);
        assert.ok(err.message.includes('available: none'));
        return true;
      },
    );
  });

  it('should throw for valid kind that was never registered', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    assert.throws(
      () => registry.getDriver(RUNTIME_KIND.WASM_COMPONENT),
      (err) => {
        assert.ok(err instanceof UnknownRuntimeKindError);
        assert.deepStrictEqual(
          err.availableKinds, [RUNTIME_KIND.NATIVE_JS],
        );
        assert.ok(err.message.includes(RUNTIME_KIND.NATIVE_JS));
        return true;
      },
    );
  });

  it('hasDriver returns false for unregistered kind', () => {
    const registry = new RuntimeDriverRegistry();
    assert.equal(registry.hasDriver(RUNTIME_KIND.NATIVE_JS), false);
  });

  it('registeredKinds returns all registered kinds', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.register(new OciTestDriver());
    const kinds = registry.registeredKinds;
    assert.equal(kinds.length, 2);
    assert.ok(kinds.includes(RUNTIME_KIND.NATIVE_JS));
    assert.ok(kinds.includes(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('registeredKinds returns empty array when empty', () => {
    const registry = new RuntimeDriverRegistry();
    assert.deepStrictEqual(registry.registeredKinds, []);
  });
});

// --- Freeze (immutability) ---

describe('RuntimeDriverRegistry freeze', () => {
  it('should not be frozen initially', () => {
    const registry = new RuntimeDriverRegistry();
    assert.equal(registry.frozen, false);
  });

  it('should be frozen after freeze()', () => {
    const registry = new RuntimeDriverRegistry();
    registry.freeze();
    assert.equal(registry.frozen, true);
  });

  it('should reject registration after freeze', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.freeze();
    assert.throws(
      () => registry.register(new WasmTestDriver()),
      (err) => {
        assert.ok(err instanceof RegistryFrozenError);
        assert.ok(err.message.includes('register'));
        return true;
      },
    );
  });

  it('should still allow lookups after freeze', () => {
    const registry = new RuntimeDriverRegistry();
    const driver = new NativeTestDriver();
    registry.register(driver);
    registry.freeze();
    assert.equal(registry.getDriver(RUNTIME_KIND.NATIVE_JS), driver);
  });

  it('should still allow hasDriver after freeze', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.freeze();
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.equal(registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER), false);
  });
});

// --- Typed error properties ---

describe('RuntimeDriverRegistry error types', () => {
  it('UnknownRuntimeKindError has context metadata', () => {
    const err = new UnknownRuntimeKindError('bad_kind', ['native_js']);
    assert.equal(err.name, 'UnknownRuntimeKindError');
    assert.equal(err.context.component, 'RuntimeDriverRegistry');
    assert.equal(err.context.operation, 'getDriver');
    assert.equal(err.context.metadata.kind, 'bad_kind');
    assert.deepStrictEqual(
      err.context.metadata.availableKinds, ['native_js'],
    );
    assert.deepStrictEqual(err.availableKinds, ['native_js']);
    assert.ok(err.message.includes('bad_kind'));
    assert.ok(err.message.includes('native_js'));
  });

  it('UnknownRuntimeKindError defaults to empty availableKinds', () => {
    const err = new UnknownRuntimeKindError('bad_kind');
    assert.deepStrictEqual(err.availableKinds, []);
    assert.ok(err.message.includes('available: none'));
  });

  it('DuplicateDriverError has context metadata', () => {
    const err = new DuplicateDriverError('native_js');
    assert.equal(err.name, 'DuplicateDriverError');
    assert.equal(err.context.component, 'RuntimeDriverRegistry');
    assert.equal(err.context.operation, 'register');
    assert.equal(err.context.metadata.kind, 'native_js');
  });

  it('RegistryFrozenError has context metadata', () => {
    const err = new RegistryFrozenError('register');
    assert.equal(err.name, 'RegistryFrozenError');
    assert.equal(err.context.component, 'RuntimeDriverRegistry');
    assert.equal(err.context.operation, 'register');
  });

  it('all registry errors serialize to JSON', () => {
    const errs = [
      new UnknownRuntimeKindError('x', ['native_js']),
      new DuplicateDriverError('y'),
      new RegistryFrozenError('z'),
    ];
    for (const err of errs) {
      const json = err.toJSON();
      assert.equal(typeof json.name, 'string');
      assert.equal(typeof json.message, 'string');
    }
  });
});

// --- No-fallback contract enforcement ---

describe('RuntimeDriverRegistry no-fallback contract', () => {
  it('getDriver throws and does not return a default driver', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.register(new WasmTestDriver());
    registry.freeze();

    // Attempting to get an unregistered kind must throw,
    // not silently return another driver.
    let caughtError = null;
    let returnedDriver = null;
    try {
      returnedDriver = registry.getDriver(RUNTIME_KIND.OCI_CONTAINER);
    } catch (err) {
      caughtError = err;
    }
    assert.ok(caughtError instanceof UnknownRuntimeKindError);
    assert.equal(returnedDriver, null);
  });

  it('catching UnknownRuntimeKindError must not yield a fallback', () => {
    const registry = new RuntimeDriverRegistry();
    registry.register(new NativeTestDriver());
    registry.freeze();

    // Simulate the anti-pattern: catch the error and try
    // a different kind. The second call must also throw,
    // proving no implicit fallback exists.
    let firstError = null;
    let secondError = null;
    try {
      registry.getDriver('nonexistent_kind');
    } catch (err) {
      firstError = err;
      // Anti-pattern: attempting fallback to a registered kind
      // after the first failure. This must NOT be done in
      // production code, but we verify the registry itself
      // does not provide any fallback mechanism.
      try {
        registry.getDriver('also_nonexistent');
      } catch (err2) {
        secondError = err2;
      }
    }
    assert.ok(firstError instanceof UnknownRuntimeKindError);
    assert.ok(secondError instanceof UnknownRuntimeKindError);
    assert.equal(firstError.kind, 'nonexistent_kind');
    assert.equal(secondError.kind, 'also_nonexistent');
  });

  it('empty registry throws for every known runtime kind', () => {
    const registry = new RuntimeDriverRegistry();
    registry.freeze();

    for (const kind of Object.values(RUNTIME_KIND)) {
      assert.throws(
        () => registry.getDriver(kind),
        (err) => {
          assert.ok(err instanceof UnknownRuntimeKindError);
          assert.equal(err.kind, kind);
          return true;
        },
      );
    }
  });

  it('partially populated registry throws only for missing kinds', () => {
    const registry = new RuntimeDriverRegistry();
    const nativeDriver = new NativeTestDriver();
    registry.register(nativeDriver);
    registry.freeze();

    // Registered kind succeeds
    assert.equal(registry.getDriver(RUNTIME_KIND.NATIVE_JS), nativeDriver);

    // Unregistered kinds fail closed
    assert.throws(
      () => registry.getDriver(RUNTIME_KIND.WASM_COMPONENT),
      (err) => err instanceof UnknownRuntimeKindError,
    );
    assert.throws(
      () => registry.getDriver(RUNTIME_KIND.OCI_CONTAINER),
      (err) => err instanceof UnknownRuntimeKindError,
    );
  });
});
