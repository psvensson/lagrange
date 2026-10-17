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
import {loadPgwireTlsOptions} from './pgwire-tls-context.js';
import {WasmServiceLifecycle} from
  '../wasm-service/wasm-service-lifecycle.js';

/**
 * The node-owned dependencies a WASM service replica runs on, read when a
 * replica is created or started (a node's router and CDC owner exist only
 * after its startup wiring). No node owns a WASM service port allocator or
 * module mirror yet, so neither is supplied: a placed replica's start is
 * the lifecycle's typed unavailability, never a locally built substitute.
 *
 * @param {Object} node - The node service owning the dependencies.
 * @return {Object} The dependency owner.
 */
function createWasmServiceNodeDependencies(node) {
  return Object.freeze({
    get nodeId() {
      return node.nodeId;
    },
    get messageRouter() {
      return node.messageRouter;
    },
    get cdcIntegrationService() {
      return node.cdcIntegrationService;
    },
  });
}

/**
 * Build runtime wiring used by seed and joining startup flows.
 *
 * @param {Object} [options] - Wiring options.
 * @param {boolean} [options.ociFeatureGateEnabled] - OCI gate state.
 * @param {Object} [options.pgwireCredentialEnv] - Environment-shaped PG
 *   credential source. Defaults to process.env.
 * @param {Function} [options.pgwireCredentialVerifier] - Explicit verifier
 *   override for an embedding composition root.
 * @param {Object} [options.pgwireTlsEnv] - Environment-shaped TLS path source.
 * @param {Object} [options.pgwireTlsOptions] - Explicit server TLS material.
 * @param {Object} [options.wasmServiceDependencies] - The node's WASM
 *   service dependency owner (createWasmServiceNodeDependencies); the WASM
 *   driver's consensus replicas run on the lifecycle composed from it.
 * @return {{
 *   runtimeDriverRegistry: RuntimeDriverRegistry,
 *   serviceRuntimeLifecycle: ServiceRuntimeLifecycle,
 *   drivers: Object
 * }}
 */
function createRuntimeStartupWiring(options = {}) {
  const runtimeDriverRegistry = new RuntimeDriverRegistry();

  const nativeJsDriver = new NativeJsDriver();
  const wasmComponentDriver = new WasmComponentDriver({
    wasmServiceLifecycle: new WasmServiceLifecycle(
      options.wasmServiceDependencies,
    ),
  });
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
      tlsOptions: options.pgwireTlsOptions ||
        loadPgwireTlsOptions(options.pgwireTlsEnv || process.env),
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

export {createRuntimeStartupWiring, createWasmServiceNodeDependencies};
