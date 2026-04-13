/**
 * Debug runtime constants for Track B runtime foundation.
 *
 * Defines adapter kinds, operation names, state values, and
 * error messages used by debug-runtime modules.
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
import { DEBUG_CAPABILITY } from '../debug/debug-constants.js';
const WASM_RUNTIME_ADAPTER_KIND = Object.freeze(stryMutAct_9fa48("77143") ? {} : (stryCov_9fa48("77143"), {
  ABSTRACT: stryMutAct_9fa48("77144") ? "" : (stryCov_9fa48("77144"), 'abstract'),
  IN_PROCESS: stryMutAct_9fa48("77145") ? "" : (stryCov_9fa48("77145"), 'in_process')
}));
const WASM_RUNTIME_OPERATION = Object.freeze(stryMutAct_9fa48("77146") ? {} : (stryCov_9fa48("77146"), {
  CREATE_INSTANCE: stryMutAct_9fa48("77147") ? "" : (stryCov_9fa48("77147"), 'createInstance'),
  EXECUTE: stryMutAct_9fa48("77148") ? "" : (stryCov_9fa48("77148"), 'execute'),
  SUSPEND: stryMutAct_9fa48("77149") ? "" : (stryCov_9fa48("77149"), 'suspend'),
  RESUME: stryMutAct_9fa48("77150") ? "" : (stryCov_9fa48("77150"), 'resume'),
  INSPECT: stryMutAct_9fa48("77151") ? "" : (stryCov_9fa48("77151"), 'inspect'),
  DESTROY_INSTANCE: stryMutAct_9fa48("77152") ? "" : (stryCov_9fa48("77152"), 'destroyInstance')
}));
const WASM_RUNTIME_ADAPTER_STATE = Object.freeze(stryMutAct_9fa48("77153") ? {} : (stryCov_9fa48("77153"), {
  RUNNING: stryMutAct_9fa48("77154") ? "" : (stryCov_9fa48("77154"), 'running'),
  PAUSED: stryMutAct_9fa48("77155") ? "" : (stryCov_9fa48("77155"), 'paused')
}));
const WASM_RUNTIME_DEFAULT = Object.freeze(stryMutAct_9fa48("77156") ? {} : (stryCov_9fa48("77156"), {
  EXECUTION_TIMEOUT_MS: 30000
}));
const WASM_RUNTIME_ADAPTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("77157") ? {} : (stryCov_9fa48("77157"), {
  ABSTRACT_CLASS: stryMutAct_9fa48("77158") ? "" : (stryCov_9fa48("77158"), 'WasmRuntimeAdapter is abstract and cannot be instantiated directly'),
  METHOD_NOT_IMPLEMENTED: stryMutAct_9fa48("77159") ? "" : (stryCov_9fa48("77159"), 'WasmRuntimeAdapter method not implemented: '),
  REQUEST_REQUIRED: stryMutAct_9fa48("77160") ? "" : (stryCov_9fa48("77160"), 'Runtime request is required'),
  MODULE_REF_REQUIRED: stryMutAct_9fa48("77161") ? "" : (stryCov_9fa48("77161"), 'Runtime request requires non-empty moduleRef'),
  MODULE_ENTRY_REQUIRED: stryMutAct_9fa48("77162") ? "" : (stryCov_9fa48("77162"), 'Runtime request requires moduleEntry object'),
  INSTANCE_HANDLE_REQUIRED: stryMutAct_9fa48("77163") ? "" : (stryCov_9fa48("77163"), 'Runtime request requires instanceHandle'),
  INSTANCE_ID_REQUIRED: stryMutAct_9fa48("77164") ? "" : (stryCov_9fa48("77164"), 'Runtime request requires instanceHandle.instanceId'),
  INSTANCE_NOT_FOUND: stryMutAct_9fa48("77165") ? "" : (stryCov_9fa48("77165"), 'Runtime instance not found: '),
  MANIFEST_REQUIRED: stryMutAct_9fa48("77166") ? "" : (stryCov_9fa48("77166"), 'Runtime execute request requires manifest object'),
  RUN_EXPORT_REQUIRED: stryMutAct_9fa48("77167") ? "" : (stryCov_9fa48("77167"), 'Runtime execute request requires runExport'),
  RUN_EXPORT_NOT_FOUND: stryMutAct_9fa48("77168") ? "" : (stryCov_9fa48("77168"), 'Runtime execute request runExport not found in module exports'),
  RUN_EXPORT_NOT_CALLABLE: stryMutAct_9fa48("77169") ? "" : (stryCov_9fa48("77169"), 'Runtime execute request runExport must be a function'),
  EXECUTION_TIMEOUT: stryMutAct_9fa48("77170") ? "" : (stryCov_9fa48("77170"), 'Runtime execution timed out'),
  EXECUTION_CANCELLED: stryMutAct_9fa48("77171") ? "" : (stryCov_9fa48("77171"), 'Runtime execution cancelled'),
  CAPABILITY_REQUIRED: stryMutAct_9fa48("77172") ? "" : (stryCov_9fa48("77172"), 'Capability name is required'),
  IMPORT_NAMESPACE_REQUIRED: stryMutAct_9fa48("77173") ? "" : (stryCov_9fa48("77173"), 'Import namespace is required'),
  IMPORT_MODULE_REQUIRED: stryMutAct_9fa48("77174") ? "" : (stryCov_9fa48("77174"), 'Import module object is required')
}));
const HOST_IMPORT_NAMESPACE = Object.freeze(stryMutAct_9fa48("77175") ? {} : (stryCov_9fa48("77175"), {
  ENV: stryMutAct_9fa48("77176") ? "" : (stryCov_9fa48("77176"), 'env'),
  DB: stryMutAct_9fa48("77177") ? "" : (stryCov_9fa48("77177"), 'db'),
  DEBUG: stryMutAct_9fa48("77178") ? "" : (stryCov_9fa48("77178"), 'debug')
}));
export { WASM_RUNTIME_ADAPTER_KIND, WASM_RUNTIME_OPERATION, WASM_RUNTIME_ADAPTER_STATE, WASM_RUNTIME_DEFAULT, WASM_RUNTIME_ADAPTER_ERROR_MSG, HOST_IMPORT_NAMESPACE, DEBUG_CAPABILITY };