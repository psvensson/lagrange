/**
 * Builds service endpoint records and routing metadata
 * for both sys-wasm-meta and sys-admin-meta meta services.
 *
 * Requirements: 1.3, 2.1
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
import { META_SERVICE_ID, WASM_META_ACTION } from '../constants/index.js';
import { buildEndpointRecord } from '../wasm-service/service-endpoint-builder.js';
import { createWasmMetaDefinition, createAdminMetaDefinition } from '../wasm-service/meta-service-factory.js';
import { ADMIN_META_ACTION } from './admin-meta-command-handlers.js';

/**
 * Version string for meta service endpoints.
 * @type {string}
 */
const META_ENDPOINT_VERSION = stryMutAct_9fa48("4195") ? "" : (stryCov_9fa48("4195"), '1.0.0');

/**
 * Build endpoint records for both meta services.
 *
 * @param {string} nodeId - The hosting node identifier.
 * @param {string} address - The endpoint address.
 * @param {number} port - The allocated port number.
 * @return {{wasmMetaEndpoint: Object, adminMetaEndpoint: Object}}
 *   Endpoint records for both meta services.
 */
function buildMetaServiceEndpoints(nodeId, address, port) {
  if (stryMutAct_9fa48("4196")) {
    {}
  } else {
    stryCov_9fa48("4196");
    const wasmMetaEndpoint = buildEndpointRecord(stryMutAct_9fa48("4197") ? {} : (stryCov_9fa48("4197"), {
      serviceDefinition: createWasmMetaDefinition(),
      nodeId,
      address,
      port,
      version: META_ENDPOINT_VERSION
    }));
    const adminMetaEndpoint = buildEndpointRecord(stryMutAct_9fa48("4198") ? {} : (stryCov_9fa48("4198"), {
      serviceDefinition: createAdminMetaDefinition(),
      nodeId,
      address,
      port,
      version: META_ENDPOINT_VERSION
    }));
    return stryMutAct_9fa48("4199") ? {} : (stryCov_9fa48("4199"), {
      wasmMetaEndpoint,
      adminMetaEndpoint
    });
  }
}

/**
 * Build frozen routing metadata describing both meta services
 * and their supported actions.
 *
 * @return {{wasmMeta: Object, adminMeta: Object}}
 *   Routing metadata for both meta services.
 */
function buildMetaServiceRoutingMetadata() {
  if (stryMutAct_9fa48("4200")) {
    {}
  } else {
    stryCov_9fa48("4200");
    return Object.freeze(stryMutAct_9fa48("4201") ? {} : (stryCov_9fa48("4201"), {
      wasmMeta: Object.freeze(stryMutAct_9fa48("4202") ? {} : (stryCov_9fa48("4202"), {
        serviceId: META_SERVICE_ID.WASM_META,
        actions: Object.values(WASM_META_ACTION)
      })),
      adminMeta: Object.freeze(stryMutAct_9fa48("4203") ? {} : (stryCov_9fa48("4203"), {
        serviceId: META_SERVICE_ID.ADMIN_META,
        actions: Object.values(ADMIN_META_ACTION)
      }))
    }));
  }
}
export { META_ENDPOINT_VERSION, buildMetaServiceEndpoints, buildMetaServiceRoutingMetadata };