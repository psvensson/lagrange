/**
 * CallbackRuntimeDriverRegistry — single owner mapping
 * runtime kinds to callback driver implementations.
 *
 * Reuses runtime-driver ownership for callback invocation
 * instead of creating a parallel callback engine.
 *
 * Drivers:
 *   native_js      — wraps in-process handler invocation
 *   wasm_component — delegates to WasmExecutor for module
 *                    export invocation
 *   oci_container  — rejects with feature-gate error
 *
 * Fails closed for unknown runtime kinds (no fallback).
 *
 * Requirements: 14.3
 * @module query/callback-runtime-driver-registry
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
import { TYPEOF } from '../../constants/index.js';
import { ADAPTER_ERROR_MSG, CALLBACK_RUNTIME_KIND } from '../sql-adapter-constants.js';
import { RuntimeDriverRegistry } from '../../runtime/runtime-driver-registry.js';
const ERR_INVALID_REGISTRY_TYPE = stryMutAct_9fa48("109619") ? "" : (stryCov_9fa48("109619"), 'runtimeDriverRegistry must be a RuntimeDriverRegistry instance');

/**
 * Native JS callback driver — invokes the handler function
 * directly in-process.
 */
class NativeJsCallbackDriver {
  /**
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor.
   * @param {object} options - Execution options; must
   *   include `handler` function for native_js kind.
   *   May include `callbackContext` with bounded primitives.
   * @return {Promise<Array>} Result rows.
   */
  async invokeCallback(batch, descriptor, options) {
    if (stryMutAct_9fa48("109620")) {
      {}
    } else {
      stryCov_9fa48("109620");
      if (stryMutAct_9fa48("109623") ? options.handler || typeof options.handler === TYPEOF.FUNCTION : stryMutAct_9fa48("109622") ? false : stryMutAct_9fa48("109621") ? true : (stryCov_9fa48("109621", "109622", "109623"), options.handler && (stryMutAct_9fa48("109625") ? typeof options.handler !== TYPEOF.FUNCTION : stryMutAct_9fa48("109624") ? true : (stryCov_9fa48("109624", "109625"), typeof options.handler === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("109626")) {
          {}
        } else {
          stryCov_9fa48("109626");
          return options.handler(batch, descriptor, options.callbackContext);
        }
      }
      throw new Error(stryMutAct_9fa48("109627") ? ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME - CALLBACK_RUNTIME_KIND.NATIVE_JS : (stryCov_9fa48("109627"), ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME + CALLBACK_RUNTIME_KIND.NATIVE_JS));
    }
  }
}

/**
 * WASM component callback driver — delegates to a
 * WasmExecutor instance for module export invocation.
 */
class WasmComponentCallbackDriver {
  /**
   * @param {object} [deps] - Dependencies.
   * @param {object} [deps.wasmExecutor] - WasmExecutor
   *   instance for module export invocation.
   */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("109628")) {
      {}
    } else {
      stryCov_9fa48("109628");
      this.wasmExecutor = stryMutAct_9fa48("109631") ? deps.wasmExecutor && null : stryMutAct_9fa48("109630") ? false : stryMutAct_9fa48("109629") ? true : (stryCov_9fa48("109629", "109630", "109631"), deps.wasmExecutor || null);
    }
  }

  /**
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor with
   *   callbackModuleRef and callbackExport.
   * @param {object} options - Execution options.
   * @return {Promise<Array>} Result rows.
   */
  async invokeCallback(batch, descriptor, options) {
    if (stryMutAct_9fa48("109632")) {
      {}
    } else {
      stryCov_9fa48("109632");
      if (stryMutAct_9fa48("109635") ? false : stryMutAct_9fa48("109634") ? true : stryMutAct_9fa48("109633") ? this.wasmExecutor : (stryCov_9fa48("109633", "109634", "109635"), !this.wasmExecutor)) {
        if (stryMutAct_9fa48("109636")) {
          {}
        } else {
          stryCov_9fa48("109636");
          throw new Error(stryMutAct_9fa48("109637") ? ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME - CALLBACK_RUNTIME_KIND.WASM_COMPONENT : (stryCov_9fa48("109637"), ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME + CALLBACK_RUNTIME_KIND.WASM_COMPONENT));
        }
      }
      const func = stryMutAct_9fa48("109638") ? {} : (stryCov_9fa48("109638"), {
        function_id: descriptor.callbackModuleRef
      });
      const callbackContext = stryMutAct_9fa48("109641") ? options?.callbackContext && null : stryMutAct_9fa48("109640") ? false : stryMutAct_9fa48("109639") ? true : (stryCov_9fa48("109639", "109640", "109641"), (stryMutAct_9fa48("109642") ? options.callbackContext : (stryCov_9fa48("109642"), options?.callbackContext)) || null);
      const context = callbackContext ? Object.create(callbackContext) : {};
      context.partitionId = batch.partitionId;
      context.callbackExport = descriptor.callbackExport;
      context.callbackContext = callbackContext;
      context.debugScope = stryMutAct_9fa48("109645") ? options?.debugScope && null : stryMutAct_9fa48("109644") ? false : stryMutAct_9fa48("109643") ? true : (stryCov_9fa48("109643", "109644", "109645"), (stryMutAct_9fa48("109646") ? options.debugScope : (stryCov_9fa48("109646"), options?.debugScope)) || null);
      context.debug = stryMutAct_9fa48("109649") ? options?.debug && null : stryMutAct_9fa48("109648") ? false : stryMutAct_9fa48("109647") ? true : (stryCov_9fa48("109647", "109648", "109649"), (stryMutAct_9fa48("109650") ? options.debug : (stryCov_9fa48("109650"), options?.debug)) || null);
      const args = stryMutAct_9fa48("109651") ? {} : (stryCov_9fa48("109651"), {
        rows: batch.rows
      });
      const execResult = await this.wasmExecutor.execute(func, context, args, stryMutAct_9fa48("109654") ? options && {} : stryMutAct_9fa48("109653") ? false : stryMutAct_9fa48("109652") ? true : (stryCov_9fa48("109652", "109653", "109654"), options || {}));
      const result = execResult.result;
      return Array.isArray(result) ? result : stryMutAct_9fa48("109655") ? [] : (stryCov_9fa48("109655"), [result]);
    }
  }
}

/**
 * OCI container callback driver — feature-gated.
 * Rejects all invocations unless the feature gate is
 * explicitly enabled.
 */
class OciContainerCallbackDriver {
  /**
   * @param {object} [deps] - Dependencies.
   * @param {boolean} [deps.featureGateEnabled] - Whether
   *   the OCI container feature gate is enabled.
   */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("109656")) {
      {}
    } else {
      stryCov_9fa48("109656");
      this.featureGateEnabled = stryMutAct_9fa48("109659") ? deps.featureGateEnabled && false : stryMutAct_9fa48("109658") ? false : stryMutAct_9fa48("109657") ? true : (stryCov_9fa48("109657", "109658", "109659"), deps.featureGateEnabled || (stryMutAct_9fa48("109660") ? true : (stryCov_9fa48("109660"), false)));
    }
  }

  /**
   * @param {object} _batch - Partition batch (unused).
   * @param {object} _descriptor - Callback descriptor.
   * @param {object} _options - Execution options (unused).
   * @return {Promise<Array>} Never resolves when gated.
   */
  async invokeCallback(_batch, _descriptor, _options) {
    if (stryMutAct_9fa48("109661")) {
      {}
    } else {
      stryCov_9fa48("109661");
      if (stryMutAct_9fa48("109664") ? false : stryMutAct_9fa48("109663") ? true : stryMutAct_9fa48("109662") ? this.featureGateEnabled : (stryCov_9fa48("109662", "109663", "109664"), !this.featureGateEnabled)) {
        if (stryMutAct_9fa48("109665")) {
          {}
        } else {
          stryCov_9fa48("109665");
          throw new Error(ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED);
        }
      }
      // Future: delegate to OCI runtime when gate is open.
      throw new Error(ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED);
    }
  }
}

/**
 * CallbackRuntimeDriverRegistry — maps runtime kinds to
 * driver implementations. Fails closed for unknown kinds.
 *
 * This is the single selector from runtime_kind to callback
 * driver. No fallback driver selection is allowed.
 */
class CallbackRuntimeDriverRegistry {
  constructor(deps = {}) {
    if (stryMutAct_9fa48("109666")) {
      {}
    } else {
      stryCov_9fa48("109666");
      /** @type {Map<string, object>} */
      this._drivers = new Map();
      this._runtimeDriverRegistry = stryMutAct_9fa48("109669") ? deps.runtimeDriverRegistry && null : stryMutAct_9fa48("109668") ? false : stryMutAct_9fa48("109667") ? true : (stryCov_9fa48("109667", "109668", "109669"), deps.runtimeDriverRegistry || null);
    }
  }

  /**
   * Set unified runtime registry used as the callback selector owner.
   * @param {RuntimeDriverRegistry} runtimeDriverRegistry - Runtime registry.
   */
  setRuntimeDriverRegistry(runtimeDriverRegistry) {
    if (stryMutAct_9fa48("109670")) {
      {}
    } else {
      stryCov_9fa48("109670");
      if (stryMutAct_9fa48("109673") ? runtimeDriverRegistry || !(runtimeDriverRegistry instanceof RuntimeDriverRegistry) : stryMutAct_9fa48("109672") ? false : stryMutAct_9fa48("109671") ? true : (stryCov_9fa48("109671", "109672", "109673"), runtimeDriverRegistry && (stryMutAct_9fa48("109674") ? runtimeDriverRegistry instanceof RuntimeDriverRegistry : (stryCov_9fa48("109674"), !(runtimeDriverRegistry instanceof RuntimeDriverRegistry))))) {
        if (stryMutAct_9fa48("109675")) {
          {}
        } else {
          stryCov_9fa48("109675");
          throw new TypeError(ERR_INVALID_REGISTRY_TYPE);
        }
      }
      this._runtimeDriverRegistry = stryMutAct_9fa48("109678") ? runtimeDriverRegistry && null : stryMutAct_9fa48("109677") ? false : stryMutAct_9fa48("109676") ? true : (stryCov_9fa48("109676", "109677", "109678"), runtimeDriverRegistry || null);
    }
  }

  /**
   * Register a driver for a runtime kind.
   *
   * @param {string} runtimeKind - One of CALLBACK_RUNTIME_KIND.
   * @param {object} driver - Driver with invokeCallback method.
   * @throws {Error} If driver lacks invokeCallback.
   */
  registerDriver(runtimeKind, driver) {
    if (stryMutAct_9fa48("109679")) {
      {}
    } else {
      stryCov_9fa48("109679");
      if (stryMutAct_9fa48("109682") ? !driver && typeof driver.invokeCallback !== TYPEOF.FUNCTION : stryMutAct_9fa48("109681") ? false : stryMutAct_9fa48("109680") ? true : (stryCov_9fa48("109680", "109681", "109682"), (stryMutAct_9fa48("109683") ? driver : (stryCov_9fa48("109683"), !driver)) || (stryMutAct_9fa48("109685") ? typeof driver.invokeCallback === TYPEOF.FUNCTION : stryMutAct_9fa48("109684") ? false : (stryCov_9fa48("109684", "109685"), typeof driver.invokeCallback !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("109686")) {
          {}
        } else {
          stryCov_9fa48("109686");
          throw new Error(ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE);
        }
      }
      this._drivers.set(runtimeKind, driver);
    }
  }

  /**
   * Get the driver for a runtime kind. Fails closed for
   * unknown kinds — no fallback driver is returned.
   *
   * @param {string} runtimeKind - Runtime kind to resolve.
   * @return {object} Driver with invokeCallback method.
   * @throws {Error} If no driver is registered for the kind.
   */
  getDriver(runtimeKind) {
    if (stryMutAct_9fa48("109687")) {
      {}
    } else {
      stryCov_9fa48("109687");
      if (stryMutAct_9fa48("109689") ? false : stryMutAct_9fa48("109688") ? true : (stryCov_9fa48("109688", "109689"), this._runtimeDriverRegistry)) {
        if (stryMutAct_9fa48("109690")) {
          {}
        } else {
          stryCov_9fa48("109690");
          this._runtimeDriverRegistry.getDriver(runtimeKind);
        }
      }
      const driver = this._drivers.get(runtimeKind);
      if (stryMutAct_9fa48("109693") ? false : stryMutAct_9fa48("109692") ? true : stryMutAct_9fa48("109691") ? driver : (stryCov_9fa48("109691", "109692", "109693"), !driver)) {
        if (stryMutAct_9fa48("109694")) {
          {}
        } else {
          stryCov_9fa48("109694");
          throw new Error(stryMutAct_9fa48("109695") ? ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND - runtimeKind : (stryCov_9fa48("109695"), ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND + runtimeKind));
        }
      }
      return driver;
    }
  }

  /**
   * Check whether a driver is registered for a kind.
   *
   * @param {string} runtimeKind - Runtime kind to check.
   * @return {boolean} True if registered.
   */
  hasDriver(runtimeKind) {
    if (stryMutAct_9fa48("109696")) {
      {}
    } else {
      stryCov_9fa48("109696");
      if (stryMutAct_9fa48("109699") ? this._runtimeDriverRegistry || !this._runtimeDriverRegistry.hasDriver(runtimeKind) : stryMutAct_9fa48("109698") ? false : stryMutAct_9fa48("109697") ? true : (stryCov_9fa48("109697", "109698", "109699"), this._runtimeDriverRegistry && (stryMutAct_9fa48("109700") ? this._runtimeDriverRegistry.hasDriver(runtimeKind) : (stryCov_9fa48("109700"), !this._runtimeDriverRegistry.hasDriver(runtimeKind))))) {
        if (stryMutAct_9fa48("109701")) {
          {}
        } else {
          stryCov_9fa48("109701");
          return stryMutAct_9fa48("109702") ? true : (stryCov_9fa48("109702"), false);
        }
      }
      return this._drivers.has(runtimeKind);
    }
  }

  /**
   * Whether startup-owned runtime registry is injected.
   * @return {boolean} True when runtime ownership is present.
   */
  hasRuntimeDriverRegistry() {
    if (stryMutAct_9fa48("109703")) {
      {}
    } else {
      stryCov_9fa48("109703");
      return this._runtimeDriverRegistry instanceof RuntimeDriverRegistry;
    }
  }
}

/**
 * Create a pre-configured registry with the three standard
 * callback runtime drivers.
 *
 * @param {object} [deps] - Optional dependencies.
 * @param {object} [deps.wasmExecutor] - WasmExecutor for
 *   wasm_component driver.
 * @param {boolean} [deps.ociFeatureGateEnabled] - Whether
 *   OCI container feature gate is enabled.
 * @return {CallbackRuntimeDriverRegistry} Configured registry.
 */
function createCallbackDriverRegistry(deps = {}) {
  if (stryMutAct_9fa48("109704")) {
    {}
  } else {
    stryCov_9fa48("109704");
    const runtimeDriverRegistry = stryMutAct_9fa48("109707") ? deps.runtimeDriverRegistry && null : stryMutAct_9fa48("109706") ? false : stryMutAct_9fa48("109705") ? true : (stryCov_9fa48("109705", "109706", "109707"), deps.runtimeDriverRegistry || null);
    if (stryMutAct_9fa48("109710") ? false : stryMutAct_9fa48("109709") ? true : stryMutAct_9fa48("109708") ? runtimeDriverRegistry instanceof RuntimeDriverRegistry : (stryCov_9fa48("109708", "109709", "109710"), !(runtimeDriverRegistry instanceof RuntimeDriverRegistry))) {
      if (stryMutAct_9fa48("109711")) {
        {}
      } else {
        stryCov_9fa48("109711");
        throw new Error(ADAPTER_ERROR_MSG.RUNTIME_DRIVER_REGISTRY_REQUIRED);
      }
    }
    const registry = new CallbackRuntimeDriverRegistry(stryMutAct_9fa48("109712") ? {} : (stryCov_9fa48("109712"), {
      runtimeDriverRegistry
    }));
    registry.registerDriver(CALLBACK_RUNTIME_KIND.NATIVE_JS, new NativeJsCallbackDriver());
    registry.registerDriver(CALLBACK_RUNTIME_KIND.WASM_COMPONENT, new WasmComponentCallbackDriver(stryMutAct_9fa48("109713") ? {} : (stryCov_9fa48("109713"), {
      wasmExecutor: stryMutAct_9fa48("109716") ? deps.wasmExecutor && null : stryMutAct_9fa48("109715") ? false : stryMutAct_9fa48("109714") ? true : (stryCov_9fa48("109714", "109715", "109716"), deps.wasmExecutor || null)
    })));
    registry.registerDriver(CALLBACK_RUNTIME_KIND.OCI_CONTAINER, new OciContainerCallbackDriver(stryMutAct_9fa48("109717") ? {} : (stryCov_9fa48("109717"), {
      featureGateEnabled: stryMutAct_9fa48("109720") ? deps.ociFeatureGateEnabled && false : stryMutAct_9fa48("109719") ? false : stryMutAct_9fa48("109718") ? true : (stryCov_9fa48("109718", "109719", "109720"), deps.ociFeatureGateEnabled || (stryMutAct_9fa48("109721") ? true : (stryCov_9fa48("109721"), false)))
    })));
    return registry;
  }
}
export { CallbackRuntimeDriverRegistry, NativeJsCallbackDriver, WasmComponentCallbackDriver, OciContainerCallbackDriver, createCallbackDriverRegistry };