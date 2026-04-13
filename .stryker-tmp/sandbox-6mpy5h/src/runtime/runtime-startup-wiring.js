/**
 * Runtime startup wiring helpers.
 *
 * Creates the unified runtime registry and lifecycle owner in one
 * deterministic startup-owned path.
 *
 * Requirements: 5.1, 5.2, 5.3
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
import { RuntimeDriverRegistry } from './runtime-driver-registry.js';
import { ServiceRuntimeLifecycle } from './service-runtime-lifecycle.js';
import { NativeJsDriver } from './native-js-driver.js';
import { WasmComponentDriver } from './wasm-component-driver.js';
import { OciContainerDriver } from './oci-container-driver.js';

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
  if (stryMutAct_9fa48("148702")) {
    {}
  } else {
    stryCov_9fa48("148702");
    const runtimeDriverRegistry = new RuntimeDriverRegistry();
    const nativeJsDriver = new NativeJsDriver();
    const wasmComponentDriver = new WasmComponentDriver();
    const ociContainerDriver = new OciContainerDriver();
    ociContainerDriver.setFeatureGate(Boolean(options.ociFeatureGateEnabled));
    runtimeDriverRegistry.register(nativeJsDriver);
    runtimeDriverRegistry.register(wasmComponentDriver);
    runtimeDriverRegistry.register(ociContainerDriver);
    runtimeDriverRegistry.freeze();
    const serviceRuntimeLifecycle = new ServiceRuntimeLifecycle(runtimeDriverRegistry);
    return stryMutAct_9fa48("148703") ? {} : (stryCov_9fa48("148703"), {
      runtimeDriverRegistry,
      serviceRuntimeLifecycle,
      drivers: Object.freeze(stryMutAct_9fa48("148704") ? {} : (stryCov_9fa48("148704"), {
        nativeJsDriver,
        wasmComponentDriver,
        ociContainerDriver
      }))
    });
  }
}
export { createRuntimeStartupWiring };