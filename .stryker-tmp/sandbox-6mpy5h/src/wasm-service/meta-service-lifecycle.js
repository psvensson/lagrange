/**
 * Meta-service lifecycle integration.
 * Ensures sys-wasm-meta and sys-admin-meta replicas are
 * created and started through the existing WasmServiceLifecycle
 * ownership path. No parallel lifecycle logic.
 *
 * Requirements: 1.2, 7.2
 * @module wasm-service/meta-service-lifecycle
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
import { META_SERVICE_ID } from '../constants/index.js';
const META_LIFECYCLE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161264") ? {} : (stryCov_9fa48("161264"), {
  NOT_META_SERVICE: stryMutAct_9fa48("161265") ? "" : (stryCov_9fa48("161265"), 'Service ID is not a recognized meta-service'),
  LIFECYCLE_REQUIRED: stryMutAct_9fa48("161266") ? "" : (stryCov_9fa48("161266"), 'WasmServiceLifecycle instance is required')
}));

/**
 * Returns true if the serviceId is a known meta-service.
 *
 * @param {string} serviceId - The service ID to check.
 * @return {boolean} True if meta-service, false otherwise.
 */
function isMetaService(serviceId) {
  if (stryMutAct_9fa48("161267")) {
    {}
  } else {
    stryCov_9fa48("161267");
    return stryMutAct_9fa48("161270") ? serviceId === META_SERVICE_ID.WASM_META && serviceId === META_SERVICE_ID.ADMIN_META : stryMutAct_9fa48("161269") ? false : stryMutAct_9fa48("161268") ? true : (stryCov_9fa48("161268", "161269", "161270"), (stryMutAct_9fa48("161272") ? serviceId !== META_SERVICE_ID.WASM_META : stryMutAct_9fa48("161271") ? false : (stryCov_9fa48("161271", "161272"), serviceId === META_SERVICE_ID.WASM_META)) || (stryMutAct_9fa48("161274") ? serviceId !== META_SERVICE_ID.ADMIN_META : stryMutAct_9fa48("161273") ? false : (stryCov_9fa48("161273", "161274"), serviceId === META_SERVICE_ID.ADMIN_META)));
  }
}

/**
 * Create a meta-service replica by delegating to the
 * existing WasmServiceLifecycle. Validates that the
 * definition belongs to a known meta-service before
 * delegating.
 *
 * @param {import('./wasm-service-lifecycle.js').WasmServiceLifecycle}
 *   lifecycle - The lifecycle instance to delegate to.
 * @param {Object} definition - Service definition with
 *   serviceId field.
 * @param {Object} replicaConfig - Replica configuration
 *   passed through to lifecycle.createReplica.
 * @return {import('./wasm-service-replica.js').WasmServiceReplica}
 *   The created replica.
 * @throws {Error} If lifecycle is missing or definition is
 *   not a meta-service.
 */
function createMetaServiceReplica(lifecycle, definition, replicaConfig) {
  if (stryMutAct_9fa48("161275")) {
    {}
  } else {
    stryCov_9fa48("161275");
    if (stryMutAct_9fa48("161278") ? false : stryMutAct_9fa48("161277") ? true : stryMutAct_9fa48("161276") ? lifecycle : (stryCov_9fa48("161276", "161277", "161278"), !lifecycle)) {
      if (stryMutAct_9fa48("161279")) {
        {}
      } else {
        stryCov_9fa48("161279");
        throw new Error(META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161282") ? false : stryMutAct_9fa48("161281") ? true : stryMutAct_9fa48("161280") ? isMetaService(definition.serviceId) : (stryCov_9fa48("161280", "161281", "161282"), !isMetaService(definition.serviceId))) {
      if (stryMutAct_9fa48("161283")) {
        {}
      } else {
        stryCov_9fa48("161283");
        throw new Error(META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE);
      }
    }
    return lifecycle.createReplica(definition, replicaConfig);
  }
}

/**
 * Start a meta-service replica by delegating to the
 * existing WasmServiceLifecycle.
 *
 * @param {import('./wasm-service-lifecycle.js').WasmServiceLifecycle}
 *   lifecycle - The lifecycle instance to delegate to.
 * @param {string} serviceId - The meta-service ID to start.
 * @param {Object} [startOptions] - Start options passed
 *   through to lifecycle.startReplica.
 * @return {{port: number, endpoint: Object}|null} Startup
 *   result from the lifecycle, or null if replica not found.
 * @throws {Error} If lifecycle is missing or serviceId is
 *   not a meta-service.
 */
function startMetaServiceReplica(lifecycle, serviceId, startOptions) {
  if (stryMutAct_9fa48("161284")) {
    {}
  } else {
    stryCov_9fa48("161284");
    if (stryMutAct_9fa48("161287") ? false : stryMutAct_9fa48("161286") ? true : stryMutAct_9fa48("161285") ? lifecycle : (stryCov_9fa48("161285", "161286", "161287"), !lifecycle)) {
      if (stryMutAct_9fa48("161288")) {
        {}
      } else {
        stryCov_9fa48("161288");
        throw new Error(META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161291") ? false : stryMutAct_9fa48("161290") ? true : stryMutAct_9fa48("161289") ? isMetaService(serviceId) : (stryCov_9fa48("161289", "161290", "161291"), !isMetaService(serviceId))) {
      if (stryMutAct_9fa48("161292")) {
        {}
      } else {
        stryCov_9fa48("161292");
        throw new Error(META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE);
      }
    }
    return lifecycle.startReplica(serviceId, startOptions);
  }
}
export { META_LIFECYCLE_ERROR_MSG, isMetaService, createMetaServiceReplica, startMetaServiceReplica };