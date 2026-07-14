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
import {PostgresWireRuntimeModule} from './pgwire-runtime-module.js';
import {
  SQL_QUERY_LOOP_RUNTIME_REF,
  SqlQueryLoopRuntimeModule,
} from './sql-query-loop-runtime-module.js';
import {META_SERVICE_RUNTIME_REF} from '../constants/wasm-meta.js';
import {buildPgwireCredentialVerifier} from
  './pgwire-credential-verifier.js';

/**
 * Build runtime wiring used by seed and joining startup flows.
 *
 * @param {Object} [options] - Wiring options.
 * @param {boolean} [options.ociFeatureGateEnabled] - OCI gate state.
 * @param {Object} [options.pgwireCredentialEnv] - Environment-shaped PG
 *   credential source. Defaults to process.env.
 * @param {Function} [options.pgwireCredentialVerifier] - Explicit verifier
 *   override for an embedding composition root.
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

  // Built-in native_js lifecycle modules, resolved by runtime_ref when
  // a placed replica prepares through the wired create path.
  serviceRuntimeLifecycle.registerNativeJsHandler(
    META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    new PostgresWireRuntimeModule({
      credentialVerifier: options.pgwireCredentialVerifier ||
        buildPgwireCredentialVerifier(
          options.pgwireCredentialEnv || process.env,
        ),
    }),
  );
  serviceRuntimeLifecycle.registerNativeJsHandler(
    SQL_QUERY_LOOP_RUNTIME_REF,
    new SqlQueryLoopRuntimeModule(),
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
