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
import { WASM_SERVICE_HEALTH_STATUS, WASM_SERVICE_PROTOCOL } from './wasm-service-constants.js';
import { SERVICE_PROFILE } from '../constants/index.js';
import { SQL_PROFILE_FIELD } from './sql-profile-constants.js';

/**
 * Column name constants for service_endpoints table.
 * @enum {string}
 */
const EP_COL = Object.freeze(stryMutAct_9fa48("163085") ? {} : (stryCov_9fa48("163085"), {
  ENDPOINT_ID: stryMutAct_9fa48("163086") ? "" : (stryCov_9fa48("163086"), 'endpoint_id'),
  SERVICE_ID: stryMutAct_9fa48("163087") ? "" : (stryCov_9fa48("163087"), 'service_id'),
  NODE_ID: stryMutAct_9fa48("163088") ? "" : (stryCov_9fa48("163088"), 'node_id'),
  PROTOCOL: stryMutAct_9fa48("163089") ? "" : (stryCov_9fa48("163089"), 'protocol'),
  ADDRESS: stryMutAct_9fa48("163090") ? "" : (stryCov_9fa48("163090"), 'address'),
  PORT: stryMutAct_9fa48("163091") ? "" : (stryCov_9fa48("163091"), 'port'),
  HEALTH_STATUS: stryMutAct_9fa48("163092") ? "" : (stryCov_9fa48("163092"), 'health_status'),
  METADATA: stryMutAct_9fa48("163093") ? "" : (stryCov_9fa48("163093"), 'metadata'),
  CREATED_AT: stryMutAct_9fa48("163094") ? "" : (stryCov_9fa48("163094"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("163095") ? "" : (stryCov_9fa48("163095"), 'updated_at')
}));

/**
 * Metadata field name constants for service endpoint metadata.
 * @enum {string}
 */
const EP_META = Object.freeze(stryMutAct_9fa48("163096") ? {} : (stryCov_9fa48("163096"), {
  SERVICE_NAME: stryMutAct_9fa48("163097") ? "" : (stryCov_9fa48("163097"), 'service_name'),
  VERSION: stryMutAct_9fa48("163098") ? "" : (stryCov_9fa48("163098"), 'version'),
  PROTOCOL: stryMutAct_9fa48("163099") ? "" : (stryCov_9fa48("163099"), 'protocol')
}));

/**
 * Endpoint ID separator constant.
 * @type {string}
 */
const EP_ID_SEPARATOR = stryMutAct_9fa48("163100") ? "" : (stryCov_9fa48("163100"), '-ep-');

/**
 * Default version string when none is provided.
 * @type {string}
 */
const DEFAULT_VERSION = stryMutAct_9fa48("163101") ? "" : (stryCov_9fa48("163101"), '1.0.0');

/**
 * Build a complete service endpoint record for the
 * service_endpoints table.
 *
 * The metadata field is a JSON string containing at minimum
 * service_name, version, and protocol — sufficient for
 * OpenAPI-style service discovery.
 *
 * @param {Object} options - Endpoint build options.
 * @param {Object} options.serviceDefinition - Service definition
 *   with serviceId, serviceName, and protocol fields.
 * @param {string} options.nodeId - The hosting node identifier.
 * @param {string} options.address - The endpoint address.
 * @param {number} options.port - The allocated port number.
 * @param {string} [options.version] - Service version string.
 * @return {Object} A service_endpoints table row object.
 */
function buildEndpointRecord(options) {
  if (stryMutAct_9fa48("163102")) {
    {}
  } else {
    stryCov_9fa48("163102");
    const {
      serviceDefinition,
      nodeId,
      address,
      port
    } = options;
    const version = stryMutAct_9fa48("163103") ? options.version && DEFAULT_VERSION : (stryCov_9fa48("163103"), options.version ?? DEFAULT_VERSION);
    const protocol = stryMutAct_9fa48("163104") ? serviceDefinition.protocol && WASM_SERVICE_PROTOCOL.WEBSOCKET : (stryCov_9fa48("163104"), serviceDefinition.protocol ?? WASM_SERVICE_PROTOCOL.WEBSOCKET);
    const now = Date.now();
    const metadata = stryMutAct_9fa48("163105") ? {} : (stryCov_9fa48("163105"), {
      [EP_META.SERVICE_NAME]: serviceDefinition.serviceName,
      [EP_META.VERSION]: version,
      [EP_META.PROTOCOL]: protocol
    });
    return stryMutAct_9fa48("163106") ? {} : (stryCov_9fa48("163106"), {
      [EP_COL.ENDPOINT_ID]: stryMutAct_9fa48("163107") ? `` : (stryCov_9fa48("163107"), `${serviceDefinition.serviceId}${EP_ID_SEPARATOR}${nodeId}`),
      [EP_COL.SERVICE_ID]: serviceDefinition.serviceId,
      [EP_COL.NODE_ID]: nodeId,
      [EP_COL.PROTOCOL]: protocol,
      [EP_COL.ADDRESS]: address,
      [EP_COL.PORT]: port,
      [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      [EP_COL.METADATA]: JSON.stringify(metadata),
      [EP_COL.CREATED_AT]: now,
      [EP_COL.UPDATED_AT]: now
    });
  }
}

/**
 * Build a service endpoint record specifically for SQL engine
 * profile services. Wraps `buildEndpointRecord` and adds
 * `service_profile: 'sql_engine'` to the metadata JSON.
 *
 * @param {Object} options - Endpoint build options.
 * @param {Object} options.serviceDefinition - Service
 *   definition with serviceId, serviceName, protocol fields.
 * @param {string} options.nodeId - The hosting node ID.
 * @param {string} options.address - The endpoint address.
 * @param {number} options.port - The allocated port number.
 * @param {string} [options.version] - Service version string.
 * @return {Object} A service_endpoints table row with
 *   SQL engine metadata included.
 */
function buildSqlEngineEndpointRecord(options) {
  if (stryMutAct_9fa48("163108")) {
    {}
  } else {
    stryCov_9fa48("163108");
    const record = buildEndpointRecord(options);
    const metadata = JSON.parse(record[EP_COL.METADATA]);
    metadata[SQL_PROFILE_FIELD.SERVICE_PROFILE_META] = SERVICE_PROFILE.SQL_ENGINE;
    record[EP_COL.METADATA] = JSON.stringify(metadata);
    return record;
  }
}
export { EP_COL, EP_META, EP_ID_SEPARATOR, DEFAULT_VERSION, buildEndpointRecord, buildSqlEngineEndpointRecord };