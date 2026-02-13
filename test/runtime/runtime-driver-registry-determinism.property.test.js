/**
 * Property-based tests for RuntimeDriverRegistry deterministic behavior.
 *
 * Verifies:
 * 1. Same kind always returns the same driver instance (referential stability)
 * 2. Registration order does not affect lookup results
 * 3. Unknown kinds always produce the same error shape
 *
 * **Validates: Requirements 1.2, 14.1, 14.2**
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from
  '../../src/runtime/runtime-driver.js';
import {UnknownRuntimeKindError} from
  '../../src/runtime/runtime-driver-errors.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

// --- Minimal concrete drivers ---

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

// --- Helpers ---

const ALL_KINDS = Object.values(RUNTIME_KIND);

/**
 * Build a fully populated, frozen registry with one driver per kind.
 * Returns {registry, drivers} where drivers is a Map<kind, driver>.
 */
function buildFullRegistry() {
  const registry = new RuntimeDriverRegistry();
  const drivers = new Map();
  const native = new NativeTestDriver();
  const wasm = new WasmTestDriver();
  const oci = new OciTestDriver();
  drivers.set(RUNTIME_KIND.NATIVE_JS, native);
  drivers.set(RUNTIME_KIND.WASM_COMPONENT, wasm);
  drivers.set(RUNTIME_KIND.OCI_CONTAINER, oci);
  registry.register(native);
  registry.register(wasm);
  registry.register(oci);
  registry.freeze();
  return {registry, drivers};
}

// --- Property 1: Deterministic lookup (same kind → same instance) ---

describe('RuntimeDriverRegistry deterministic lookup', () => {
  /**
   * **Validates: Requirements 1.2**
   */
  it('same kind always returns the exact same driver instance', () => {
    const {registry} = buildFullRegistry();

    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KINDS),
        fc.integer({min: 2, max: 5}),
        (kind, repeatCount) => {
          const results = [];
          for (let i = 0; i < repeatCount; i++) {
            results.push(registry.getDriver(kind));
          }
          // All lookups must return the same reference
          return results.every((d) => d === results[0]);
        },
      ),
      {numRuns: 10},
    );
  });
});

// --- Property 2: Registration order independence ---

describe('RuntimeDriverRegistry registration order independence', () => {
  /**
   * **Validates: Requirements 1.2**
   */
  it('any permutation of registration order yields same lookup', () => {
    // Driver instances shared across permutations
    const native = new NativeTestDriver();
    const wasm = new WasmTestDriver();
    const oci = new OciTestDriver();
    const driverList = [native, wasm, oci];

    // Generate shuffled index arrays as permutations
    fc.assert(
      fc.property(
        fc.shuffledSubarray([0, 1, 2], {minLength: 3, maxLength: 3}),
        (order) => {
          const registry = new RuntimeDriverRegistry();
          for (const idx of order) {
            registry.register(driverList[idx]);
          }
          registry.freeze();

          // Lookup must return the correct driver regardless of order
          return (
            registry.getDriver(RUNTIME_KIND.NATIVE_JS) === native &&
            registry.getDriver(RUNTIME_KIND.WASM_COMPONENT) === wasm &&
            registry.getDriver(RUNTIME_KIND.OCI_CONTAINER) === oci
          );
        },
      ),
      {numRuns: 10},
    );
  });
});

// --- Property 3: Deterministic error for unknown kinds ---

describe('RuntimeDriverRegistry deterministic error behavior', () => {
  /**
   * **Validates: Requirements 14.1, 14.2**
   */
  it('unknown kind always produces UnknownRuntimeKindError with kind', () => {
    const {registry} = buildFullRegistry();

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 30}).filter(
          (s) => !ALL_KINDS.includes(s),
        ),
        (unknownKind) => {
          let err1 = null;
          let err2 = null;
          try {
            registry.getDriver(unknownKind);
          } catch (e) {
            err1 = e;
          }
          try {
            registry.getDriver(unknownKind);
          } catch (e) {
            err2 = e;
          }
          // Both calls must throw UnknownRuntimeKindError
          if (!(err1 instanceof UnknownRuntimeKindError)) return false;
          if (!(err2 instanceof UnknownRuntimeKindError)) return false;
          // Error shape must be identical
          if (err1.kind !== unknownKind) return false;
          if (err2.kind !== unknownKind) return false;
          if (err1.name !== err2.name) return false;
          // Available kinds must match
          const a1 = err1.availableKinds.slice().sort();
          const a2 = err2.availableKinds.slice().sort();
          return JSON.stringify(a1) === JSON.stringify(a2);
        },
      ),
      {numRuns: 10},
    );
  });

  /**
   * **Validates: Requirements 14.1**
   */
  it('error availableKinds always lists all registered kinds', () => {
    const {registry} = buildFullRegistry();
    const sorted = ALL_KINDS.slice().sort();

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => !ALL_KINDS.includes(s),
        ),
        (unknownKind) => {
          try {
            registry.getDriver(unknownKind);
            return false;
          } catch (err) {
            const errSorted = err.availableKinds.slice().sort();
            return JSON.stringify(errSorted) === JSON.stringify(sorted);
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
