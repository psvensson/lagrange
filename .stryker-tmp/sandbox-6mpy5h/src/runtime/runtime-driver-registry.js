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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ALLOWED_RUNTIME_KINDS } from '../constants/runtime.js';
import { TYPEOF } from '../constants/types.js';
import { RuntimeDriver } from './runtime-driver.js';
import { UnknownRuntimeKindError, DuplicateDriverError, RegistryFrozenError } from './runtime-driver-errors.js';

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
    if (stryMutAct_9fa48("148621")) {
      {}
    } else {
      stryCov_9fa48("148621");
      /** @type {Map<string, RuntimeDriver>} */
      this._drivers = new Map();

      /** @type {boolean} */
      this._frozen = stryMutAct_9fa48("148622") ? true : (stryCov_9fa48("148622"), false);
    }
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
    if (stryMutAct_9fa48("148623")) {
      {}
    } else {
      stryCov_9fa48("148623");
      if (stryMutAct_9fa48("148625") ? false : stryMutAct_9fa48("148624") ? true : (stryCov_9fa48("148624", "148625"), this._frozen)) {
        if (stryMutAct_9fa48("148626")) {
          {}
        } else {
          stryCov_9fa48("148626");
          throw new RegistryFrozenError(stryMutAct_9fa48("148627") ? "" : (stryCov_9fa48("148627"), 'register'));
        }
      }
      if (stryMutAct_9fa48("148630") ? false : stryMutAct_9fa48("148629") ? true : stryMutAct_9fa48("148628") ? driver instanceof RuntimeDriver : (stryCov_9fa48("148628", "148629", "148630"), !(driver instanceof RuntimeDriver))) {
        if (stryMutAct_9fa48("148631")) {
          {}
        } else {
          stryCov_9fa48("148631");
          throw new TypeError(stryMutAct_9fa48("148632") ? "" : (stryCov_9fa48("148632"), 'driver must be an instance of RuntimeDriver'));
        }
      }
      if (stryMutAct_9fa48("148634") ? false : stryMutAct_9fa48("148633") ? true : (stryCov_9fa48("148633", "148634"), this._drivers.has(driver.kind))) {
        if (stryMutAct_9fa48("148635")) {
          {}
        } else {
          stryCov_9fa48("148635");
          throw new DuplicateDriverError(driver.kind);
        }
      }
      this._drivers.set(driver.kind, driver);
    }
  }

  /**
   * Freeze the registry. No further registrations are allowed
   * after this call.
   */
  freeze() {
    if (stryMutAct_9fa48("148636")) {
      {}
    } else {
      stryCov_9fa48("148636");
      this._frozen = stryMutAct_9fa48("148637") ? false : (stryCov_9fa48("148637"), true);
    }
  }

  /**
   * Whether the registry has been frozen.
   *
   * @return {boolean}
   */
  get frozen() {
    if (stryMutAct_9fa48("148638")) {
      {}
    } else {
      stryCov_9fa48("148638");
      return this._frozen;
    }
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
    if (stryMutAct_9fa48("148639")) {
      {}
    } else {
      stryCov_9fa48("148639");
      const driver = this._drivers.get(kind);
      if (stryMutAct_9fa48("148642") ? false : stryMutAct_9fa48("148641") ? true : stryMutAct_9fa48("148640") ? driver : (stryCov_9fa48("148640", "148641", "148642"), !driver)) {
        if (stryMutAct_9fa48("148643")) {
          {}
        } else {
          stryCov_9fa48("148643");
          throw new UnknownRuntimeKindError(kind, this.registeredKinds);
        }
      }
      return driver;
    }
  }

  /**
   * Check whether a driver is registered for a kind.
   *
   * @param {string} kind - Runtime kind to check.
   * @return {boolean}
   */
  hasDriver(kind) {
    if (stryMutAct_9fa48("148644")) {
      {}
    } else {
      stryCov_9fa48("148644");
      return this._drivers.has(kind);
    }
  }

  /**
   * Return the set of registered runtime kinds.
   *
   * @return {string[]} Registered kind values.
   */
  get registeredKinds() {
    if (stryMutAct_9fa48("148645")) {
      {}
    } else {
      stryCov_9fa48("148645");
      return stryMutAct_9fa48("148646") ? [] : (stryCov_9fa48("148646"), [...this._drivers.keys()]);
    }
  }
}
export { RuntimeDriverRegistry };