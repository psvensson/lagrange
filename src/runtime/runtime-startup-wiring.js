/**
 * Runtime startup wiring helpers.
 *
 * Creates the unified runtime registry and lifecycle owner in one
 * deterministic startup-owned path.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import {RuntimeDriverRegistry} from './runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from './service-runtime-lifecycle.js';
import {NativeJsDriver} from './native-js-driver.js';
import {WasmComponentDriver} from './wasm-component-driver.js';
import {OciContainerDriver} from './oci-container-driver.js';

/**
 * Build runtime wiring used by seed and joining startup flows.
 *
 * @param {Object} [options] - Wiring options.
 * @param {boolean} [options.ociFeatureGateEnabled] - OCI gate state.
 * @return {{
 *   runtimeDriverRegistry: RuntimeDriverRegistry,
 *   serviceRuntimeLifecycle: ServiceRuntimeLifecycle,
 *   drivers: Object
 * }}
 */
function createRuntimeStartupWiring(options = {}) {
  const runtimeDriverRegistry = new RuntimeDriverRegistry();

  const nativeJsDriver = new NativeJsDriver();
  const wasmComponentDriver = new WasmComponentDriver();
  const ociContainerDriver = new OciContainerDriver();
  ociContainerDriver.setFeatureGate(
    Boolean(options.ociFeatureGateEnabled),
  );

  runtimeDriverRegistry.register(nativeJsDriver);
  runtimeDriverRegistry.register(wasmComponentDriver);
  runtimeDriverRegistry.register(ociContainerDriver);
  runtimeDriverRegistry.freeze();

  const serviceRuntimeLifecycle = new ServiceRuntimeLifecycle(
    runtimeDriverRegistry,
  );

  return {
    runtimeDriverRegistry,
    serviceRuntimeLifecycle,
    drivers: Object.freeze({
      nativeJsDriver,
      wasmComponentDriver,
      ociContainerDriver,
    }),
  };
}

export {createRuntimeStartupWiring};
