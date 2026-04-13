/**
 * Runtime endpoint writer — maps endpoint intents from runtime
 * drivers to `service_endpoints` table rows via SQL/CDC.
 *
 * This module provides the endpoint writer callback consumed by
 * `ServiceRuntimeLifecycle.setEndpointWriter()`. It is the single
 * publication path for runtime service endpoints.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 *
 * @module runtime/runtime-endpoint-writer
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
import { EP_COL, EP_META, EP_ID_SEPARATOR, DEFAULT_VERSION } from '../wasm-service/service-endpoint-builder.js';
import { WASM_SERVICE_HEALTH_STATUS, WASM_SERVICE_PROTOCOL } from '../wasm-service/wasm-service-constants.js';
import { ENDPOINT_INTENT_FIELD } from '../constants/runtime.js';

/**
 * Build a `service_endpoints` row from a validated endpoint intent.
 *
 * Reuses column constants from `service-endpoint-builder.js` to
 * avoid duplication. The intent must already be validated by
 * `ServiceRuntimeLifecycle` before reaching this function.
 *
 * @param {string} serviceId - The service identifier.
 * @param {string} nodeId - The hosting node identifier.
 * @param {Object} endpointIntent - Validated endpoint intent with
 *   host, port, and optional protocol fields.
 * @return {Object} A `service_endpoints` table row object.
 */
function buildRuntimeEndpointRow(serviceId, nodeId, endpointIntent) {
  if (stryMutAct_9fa48("148688")) {
    {}
  } else {
    stryCov_9fa48("148688");
    const port = endpointIntent[ENDPOINT_INTENT_FIELD.PORT];
    const host = stryMutAct_9fa48("148691") ? endpointIntent[ENDPOINT_INTENT_FIELD.HOST] && nodeId : stryMutAct_9fa48("148690") ? false : stryMutAct_9fa48("148689") ? true : (stryCov_9fa48("148689", "148690", "148691"), endpointIntent[ENDPOINT_INTENT_FIELD.HOST] || nodeId);
    const protocol = stryMutAct_9fa48("148694") ? endpointIntent[ENDPOINT_INTENT_FIELD.PROTOCOL] && WASM_SERVICE_PROTOCOL.WEBSOCKET : stryMutAct_9fa48("148693") ? false : stryMutAct_9fa48("148692") ? true : (stryCov_9fa48("148692", "148693", "148694"), endpointIntent[ENDPOINT_INTENT_FIELD.PROTOCOL] || WASM_SERVICE_PROTOCOL.WEBSOCKET);
    const now = Date.now();
    const metadata = stryMutAct_9fa48("148695") ? {} : (stryCov_9fa48("148695"), {
      [EP_META.SERVICE_NAME]: serviceId,
      [EP_META.VERSION]: DEFAULT_VERSION,
      [EP_META.PROTOCOL]: protocol
    });
    return stryMutAct_9fa48("148696") ? {} : (stryCov_9fa48("148696"), {
      [EP_COL.ENDPOINT_ID]: stryMutAct_9fa48("148697") ? `` : (stryCov_9fa48("148697"), `${serviceId}${EP_ID_SEPARATOR}${nodeId}`),
      [EP_COL.SERVICE_ID]: serviceId,
      [EP_COL.NODE_ID]: nodeId,
      [EP_COL.PROTOCOL]: protocol,
      [EP_COL.ADDRESS]: host,
      [EP_COL.PORT]: port,
      [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      [EP_COL.METADATA]: JSON.stringify(metadata),
      [EP_COL.CREATED_AT]: now,
      [EP_COL.UPDATED_AT]: now
    });
  }
}

/**
 * Derive the deterministic endpoint ID for a service on a node.
 *
 * @param {string} serviceId - The service identifier.
 * @param {string} nodeId - The hosting node identifier.
 * @return {string} The endpoint ID.
 */
function deriveEndpointId(serviceId, nodeId) {
  if (stryMutAct_9fa48("148698")) {
    {}
  } else {
    stryCov_9fa48("148698");
    return stryMutAct_9fa48("148699") ? `` : (stryCov_9fa48("148699"), `${serviceId}${EP_ID_SEPARATOR}${nodeId}`);
  }
}

/**
 * Build an unhealthy update row for marking an endpoint as
 * unhealthy on failure without removing it.
 *
 * @param {string} serviceId - The service identifier.
 * @param {string} nodeId - The hosting node identifier.
 * @return {Object} Partial row with endpoint_id, health_status,
 *   and updated_at for upsert.
 */
function buildUnhealthyEndpointRow(serviceId, nodeId) {
  if (stryMutAct_9fa48("148700")) {
    {}
  } else {
    stryCov_9fa48("148700");
    return stryMutAct_9fa48("148701") ? {} : (stryCov_9fa48("148701"), {
      [EP_COL.ENDPOINT_ID]: deriveEndpointId(serviceId, nodeId),
      [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
      [EP_COL.UPDATED_AT]: Date.now()
    });
  }
}
export { buildRuntimeEndpointRow, deriveEndpointId, buildUnhealthyEndpointRow };