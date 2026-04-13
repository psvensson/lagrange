/**
 * Factory for creating built-in meta-service definitions.
 * Used during seed bootstrap to provision sys-wasm-meta
 * and sys-admin-meta service definitions.
 *
 * Requirements: 1.1
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
import { META_SERVICE_ID, META_SERVICE_RUNTIME_REF, SERVICE_PROFILE, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { RUNTIME_KIND } from '../constants/runtime.js';
import { READ_CONSISTENCY_MODE, WRITE_CONSISTENCY_MODE, WASM_SERVICE_DEFAULT, WASM_SERVICE_PROTOCOL } from './wasm-service-constants.js';
const META_FACTORY_SUBSYSTEM = stryMutAct_9fa48("161253") ? "" : (stryCov_9fa48("161253"), 'meta-service-factory');
const META_FACTORY_LOG_MSG = Object.freeze(stryMutAct_9fa48("161254") ? {} : (stryCov_9fa48("161254"), {
  WASM_META_CREATED: stryMutAct_9fa48("161255") ? "" : (stryCov_9fa48("161255"), 'Created sys-wasm-meta service definition'),
  ADMIN_META_CREATED: stryMutAct_9fa48("161256") ? "" : (stryCov_9fa48("161256"), 'Created sys-admin-meta service definition'),
  POSTGRES_WIRE_CREATED: stryMutAct_9fa48("161257") ? "" : (stryCov_9fa48("161257"), 'Created sys-postgres-wire service definition')
}));

/**
 * Create the built-in sys-wasm-meta service definition.
 * Binds to wasm_component runtime kind with the WASM meta
 * command handler reference.
 * @return {Object} Service definition object for sys-wasm-meta.
 */
function createWasmMetaDefinition() {
  if (stryMutAct_9fa48("161258")) {
    {}
  } else {
    stryCov_9fa48("161258");
    return stryMutAct_9fa48("161259") ? {} : (stryCov_9fa48("161259"), {
      serviceId: META_SERVICE_ID.WASM_META,
      serviceName: META_SERVICE_ID.WASM_META,
      serviceProfile: SERVICE_PROFILE.DEFAULT,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      handlerFunctionId: null,
      readConsistency: READ_CONSISTENCY_MODE.STRONG,
      writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
      replicaCount: WASM_SERVICE_DEFAULT.REPLICA_COUNT,
      resourceBudget: {},
      safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
      runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      runtimeRef: META_SERVICE_RUNTIME_REF.WASM_META,
      runtimeConfig: null
    });
  }
}

/**
 * Create the built-in sys-admin-meta service definition.
 * Binds to native_js runtime kind with the admin command
 * handler reference.
 * @return {Object} Service definition object for sys-admin-meta.
 */
function createAdminMetaDefinition() {
  if (stryMutAct_9fa48("161260")) {
    {}
  } else {
    stryCov_9fa48("161260");
    return stryMutAct_9fa48("161261") ? {} : (stryCov_9fa48("161261"), {
      serviceId: META_SERVICE_ID.ADMIN_META,
      serviceName: META_SERVICE_ID.ADMIN_META,
      serviceProfile: SERVICE_PROFILE.DEFAULT,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      handlerFunctionId: null,
      readConsistency: READ_CONSISTENCY_MODE.STRONG,
      writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
      replicaCount: WASM_SERVICE_DEFAULT.REPLICA_COUNT,
      resourceBudget: {},
      safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
      runtimeKind: RUNTIME_KIND.NATIVE_JS,
      runtimeRef: META_SERVICE_RUNTIME_REF.ADMIN_META,
      runtimeConfig: null
    });
  }
}

/**
 * Create the built-in sys-postgres-wire service definition.
 * Binds to native_js runtime kind with the PostgreSQL wire
 * runtime reference and postgresql protocol.
 * @return {Object} Service definition object for sys-postgres-wire.
 */
function createPostgresWireDefinition() {
  if (stryMutAct_9fa48("161262")) {
    {}
  } else {
    stryCov_9fa48("161262");
    return stryMutAct_9fa48("161263") ? {} : (stryCov_9fa48("161263"), {
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      serviceName: META_SERVICE_ID.POSTGRES_WIRE,
      serviceProfile: SERVICE_PROFILE.DEFAULT,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      handlerFunctionId: null,
      readConsistency: READ_CONSISTENCY_MODE.STRONG,
      writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
      replicaCount: WASM_SERVICE_DEFAULT.REPLICA_COUNT,
      resourceBudget: {},
      safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
      runtimeKind: RUNTIME_KIND.NATIVE_JS,
      runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
      runtimeConfig: null,
      protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL
    });
  }
}
export { META_FACTORY_SUBSYSTEM, META_FACTORY_LOG_MSG, createWasmMetaDefinition, createAdminMetaDefinition, createPostgresWireDefinition };