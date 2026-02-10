import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from './wasm-service-constants.js';

/**
 * Column name constants for service_endpoints table.
 * @enum {string}
 */
const EP_COL = Object.freeze({
  ENDPOINT_ID: 'endpoint_id',
  SERVICE_ID: 'service_id',
  NODE_ID: 'node_id',
  PROTOCOL: 'protocol',
  ADDRESS: 'address',
  PORT: 'port',
  HEALTH_STATUS: 'health_status',
  METADATA: 'metadata',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

/**
 * Metadata field name constants for service endpoint metadata.
 * @enum {string}
 */
const EP_META = Object.freeze({
  SERVICE_NAME: 'service_name',
  VERSION: 'version',
  PROTOCOL: 'protocol',
});

/**
 * Endpoint ID separator constant.
 * @type {string}
 */
const EP_ID_SEPARATOR = '-ep-';

/**
 * Default version string when none is provided.
 * @type {string}
 */
const DEFAULT_VERSION = '1.0.0';

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
  const {serviceDefinition, nodeId, address, port} = options;
  const version = options.version ?? DEFAULT_VERSION;
  const protocol = serviceDefinition.protocol ??
    WASM_SERVICE_PROTOCOL.WEBSOCKET;
  const now = Date.now();

  const metadata = {
    [EP_META.SERVICE_NAME]: serviceDefinition.serviceName,
    [EP_META.VERSION]: version,
    [EP_META.PROTOCOL]: protocol,
  };

  return {
    [EP_COL.ENDPOINT_ID]:
      `${serviceDefinition.serviceId}${EP_ID_SEPARATOR}${nodeId}`,
    [EP_COL.SERVICE_ID]: serviceDefinition.serviceId,
    [EP_COL.NODE_ID]: nodeId,
    [EP_COL.PROTOCOL]: protocol,
    [EP_COL.ADDRESS]: address,
    [EP_COL.PORT]: port,
    [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
    [EP_COL.METADATA]: JSON.stringify(metadata),
    [EP_COL.CREATED_AT]: now,
    [EP_COL.UPDATED_AT]: now,
  };
}

export {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  DEFAULT_VERSION,
  buildEndpointRecord,
};
