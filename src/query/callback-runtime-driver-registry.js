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

import {TYPEOF} from '../constants/index.js';
import {
  ADAPTER_ERROR_MSG,
  CALLBACK_RUNTIME_KIND,
} from './sql-adapter-constants.js';
import {RuntimeDriverRegistry} from '../runtime/runtime-driver-registry.js';

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
    if (options.handler &&
        typeof options.handler === TYPEOF.FUNCTION) {
      return options.handler(
        batch, descriptor, options.callbackContext,
      );
    }
    throw new Error(
      ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME +
      CALLBACK_RUNTIME_KIND.NATIVE_JS,
    );
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
    this.wasmExecutor = deps.wasmExecutor || null;
  }

  /**
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor with
   *   callbackModuleRef and callbackExport.
   * @param {object} options - Execution options.
   * @return {Promise<Array>} Result rows.
   */
  async invokeCallback(batch, descriptor, options) {
    if (!this.wasmExecutor) {
      throw new Error(
        ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME +
        CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
      );
    }

    const func = {
      function_id: descriptor.callbackModuleRef,
    };
    const context = {
      partitionId: batch.partitionId,
      callbackExport: descriptor.callbackExport,
      callbackContext: options?.callbackContext || null,
      debugScope: options?.debugScope || null,
      debug: options?.debug || null,
    };
    const args = {rows: batch.rows};

    const execResult = await this.wasmExecutor.execute(
      func, context, args, options || {},
    );

    const result = execResult.result;
    return Array.isArray(result) ? result : [result];
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
    this.featureGateEnabled = deps.featureGateEnabled || false;
  }

  /**
   * @param {object} _batch - Partition batch (unused).
   * @param {object} _descriptor - Callback descriptor.
   * @param {object} _options - Execution options (unused).
   * @return {Promise<Array>} Never resolves when gated.
   */
  async invokeCallback(_batch, _descriptor, _options) {
    if (!this.featureGateEnabled) {
      throw new Error(
        ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
      );
    }
    // Future: delegate to OCI runtime when gate is open.
    throw new Error(
      ADAPTER_ERROR_MSG.REGISTRY_OCI_CONTAINER_GATED,
    );
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
    /** @type {Map<string, object>} */
    this._drivers = new Map();
    this._runtimeDriverRegistry =
      deps.runtimeDriverRegistry || null;
  }

  /**
   * Set unified runtime registry used as the callback selector owner.
   * @param {RuntimeDriverRegistry} runtimeDriverRegistry - Runtime registry.
   */
  setRuntimeDriverRegistry(runtimeDriverRegistry) {
    if (runtimeDriverRegistry &&
        !(runtimeDriverRegistry instanceof RuntimeDriverRegistry)) {
      throw new TypeError(
        'runtimeDriverRegistry must be a RuntimeDriverRegistry instance',
      );
    }
    this._runtimeDriverRegistry = runtimeDriverRegistry || null;
  }

  /**
   * Register a driver for a runtime kind.
   *
   * @param {string} runtimeKind - One of CALLBACK_RUNTIME_KIND.
   * @param {object} driver - Driver with invokeCallback method.
   * @throws {Error} If driver lacks invokeCallback.
   */
  registerDriver(runtimeKind, driver) {
    if (!driver ||
        typeof driver.invokeCallback !== TYPEOF.FUNCTION) {
      throw new Error(
        ADAPTER_ERROR_MSG.REGISTRY_DRIVER_MISSING_INVOKE,
      );
    }
    this._drivers.set(runtimeKind, driver);
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
    if (this._runtimeDriverRegistry) {
      this._runtimeDriverRegistry.getDriver(runtimeKind);
    }
    const driver = this._drivers.get(runtimeKind);
    if (!driver) {
      throw new Error(
        ADAPTER_ERROR_MSG.REGISTRY_UNKNOWN_RUNTIME_KIND +
        runtimeKind,
      );
    }
    return driver;
  }

  /**
   * Check whether a driver is registered for a kind.
   *
   * @param {string} runtimeKind - Runtime kind to check.
   * @return {boolean} True if registered.
   */
  hasDriver(runtimeKind) {
    if (this._runtimeDriverRegistry &&
        !this._runtimeDriverRegistry.hasDriver(runtimeKind)) {
      return false;
    }
    return this._drivers.has(runtimeKind);
  }

  /**
   * Whether startup-owned runtime registry is injected.
   * @return {boolean} True when runtime ownership is present.
   */
  hasRuntimeDriverRegistry() {
    return this._runtimeDriverRegistry instanceof RuntimeDriverRegistry;
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
  const runtimeDriverRegistry = deps.runtimeDriverRegistry || null;
  if (!(runtimeDriverRegistry instanceof RuntimeDriverRegistry)) {
    throw new Error(ADAPTER_ERROR_MSG.RUNTIME_DRIVER_REGISTRY_REQUIRED);
  }
  const registry = new CallbackRuntimeDriverRegistry({
    runtimeDriverRegistry,
  });

  registry.registerDriver(
    CALLBACK_RUNTIME_KIND.NATIVE_JS,
    new NativeJsCallbackDriver(),
  );

  registry.registerDriver(
    CALLBACK_RUNTIME_KIND.WASM_COMPONENT,
    new WasmComponentCallbackDriver({
      wasmExecutor: deps.wasmExecutor || null,
    }),
  );

  registry.registerDriver(
    CALLBACK_RUNTIME_KIND.OCI_CONTAINER,
    new OciContainerCallbackDriver({
      featureGateEnabled: deps.ociFeatureGateEnabled || false,
    }),
  );

  return registry;
}

export {
  CallbackRuntimeDriverRegistry,
  NativeJsCallbackDriver,
  WasmComponentCallbackDriver,
  OciContainerCallbackDriver,
  createCallbackDriverRegistry,
};
