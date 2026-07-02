/**
 * Runtime_Driver_Registry — single owner mapping runtime_kind to
 * runtime driver implementations.
 *
 * Provides:
 *   1. Driver registration keyed by runtime_kind.
 *   2. Immutable read-only lookup API (freeze after setup).
 *   3. Deterministic unknown-kind failure (no fallback selection).
 *
 * NO-FALLBACK INVARIANT (Requirements: 1.5, 6.5, 15.5):
 *   Unknown runtime kinds MUST produce UnknownRuntimeKindError.
 *   No caller may catch this error and attempt a secondary lookup,
 *   default to another kind, or silently degrade. This is enforced
 *   by architecture policy — see "Runtime Anti-Patterns" in
 *   architecture.md.
 *
 * Requirements: 1.2, 1.4
 *
 * @module runtime/runtime-driver-registry
 */

import {RuntimeDriver} from './runtime-driver.js';
import {
  UnknownRuntimeKindError,
  DuplicateDriverError,
  RegistryFrozenError,
} from './runtime-driver-errors.js';

const LOCAL_STR_REGISTER = 'register';
const LOCAL_STR_DRIVER_MUST_BE_AN_INSTANCE_OF_RUNTIMEDRI = 'driver must be an instance of RuntimeDriver';

/**
 * RuntimeDriverRegistry — the single lookup owner for runtime
 * drivers, keyed by runtime_kind.
 *
 * NO-FALLBACK CONTRACT:
 *   getDriver() fails closed with UnknownRuntimeKindError for
 *   any unregistered runtime kind. Callers MUST NOT catch this
 *   error and attempt a secondary driver lookup or default to
 *   another runtime kind. This is a non-negotiable architectural
 *   invariant — see architecture.md "Runtime Anti-Patterns".
 *
 * Usage:
 *   const registry = new RuntimeDriverRegistry();
 *   registry.register(nativeDriver);
 *   registry.register(wasmDriver);
 *   registry.freeze();
 *   const driver = registry.getDriver('native_js');
 */
class RuntimeDriverRegistry {
  constructor() {
    /** @type {Map<string, RuntimeDriver>} */
    this._drivers = new Map();

    /** @type {boolean} */
    this._frozen = false;
  }

  /**
   * Register a driver instance. The driver's `kind` property
   * determines the registration key.
   *
   * @param {RuntimeDriver} driver - Driver extending RuntimeDriver.
   * @throws {RegistryFrozenError} If registry is already frozen.
   * @throws {TypeError} If driver is not a RuntimeDriver instance.
   * @throws {DuplicateDriverError} If kind is already registered.
   */
  register(driver) {
    if (this._frozen) {
      throw new RegistryFrozenError(LOCAL_STR_REGISTER);
    }
    if (!(driver instanceof RuntimeDriver)) {
      throw new TypeError(
        LOCAL_STR_DRIVER_MUST_BE_AN_INSTANCE_OF_RUNTIMEDRI,
      );
    }
    if (this._drivers.has(driver.kind)) {
      throw new DuplicateDriverError(driver.kind);
    }
    this._drivers.set(driver.kind, driver);
  }

  /**
   * Freeze the registry. No further registrations are allowed
   * after this call.
   */
  freeze() {
    this._frozen = true;
  }

  /**
   * Whether the registry has been frozen.
   *
   * @return {boolean}
   */
  get frozen() {
    return this._frozen;
  }

  /**
   * Look up the driver for a runtime kind.
   *
   * NO-FALLBACK: throws UnknownRuntimeKindError for any
   * unregistered kind. Callers MUST propagate this error.
   * Catching it to try a different driver is forbidden.
   *
   * @param {string} kind - One of ALLOWED_RUNTIME_KINDS values.
   * @return {RuntimeDriver} The registered driver.
   * @throws {UnknownRuntimeKindError} If no driver is registered.
   */
  getDriver(kind) {
    const driver = this._drivers.get(kind);
    if (!driver) {
      throw new UnknownRuntimeKindError(kind, this.registeredKinds);
    }
    return driver;
  }

  /**
   * Check whether a driver is registered for a kind.
   *
   * @param {string} kind - Runtime kind to check.
   * @return {boolean}
   */
  hasDriver(kind) {
    return this._drivers.has(kind);
  }

  /**
   * Return the set of registered runtime kinds.
   *
   * @return {string[]} Registered kind values.
   */
  get registeredKinds() {
    return [...this._drivers.keys()];
  }
}

export {RuntimeDriverRegistry};
