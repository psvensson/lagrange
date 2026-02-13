/**
 * Builds service endpoint records and routing metadata
 * for both sys-wasm-meta and sys-admin-meta meta services.
 *
 * Requirements: 1.3, 2.1
 */

import {META_SERVICE_ID, WASM_META_ACTION} from '../constants/index.js';
import {
  buildEndpointRecord,
} from '../wasm-service/service-endpoint-builder.js';
import {
  createWasmMetaDefinition,
  createAdminMetaDefinition,
} from '../wasm-service/meta-service-factory.js';
import {
  ADMIN_META_ACTION,
} from './admin-meta-command-handlers.js';

/**
 * Version string for meta service endpoints.
 * @type {string}
 */
const META_ENDPOINT_VERSION = '1.0.0';

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
  const wasmMetaEndpoint = buildEndpointRecord({
    serviceDefinition: createWasmMetaDefinition(),
    nodeId,
    address,
    port,
    version: META_ENDPOINT_VERSION,
  });

  const adminMetaEndpoint = buildEndpointRecord({
    serviceDefinition: createAdminMetaDefinition(),
    nodeId,
    address,
    port,
    version: META_ENDPOINT_VERSION,
  });

  return {wasmMetaEndpoint, adminMetaEndpoint};
}

/**
 * Build frozen routing metadata describing both meta services
 * and their supported actions.
 *
 * @return {{wasmMeta: Object, adminMeta: Object}}
 *   Routing metadata for both meta services.
 */
function buildMetaServiceRoutingMetadata() {
  return Object.freeze({
    wasmMeta: Object.freeze({
      serviceId: META_SERVICE_ID.WASM_META,
      actions: Object.values(WASM_META_ACTION),
    }),
    adminMeta: Object.freeze({
      serviceId: META_SERVICE_ID.ADMIN_META,
      actions: Object.values(ADMIN_META_ACTION),
    }),
  });
}

export {
  META_ENDPOINT_VERSION,
  buildMetaServiceEndpoints,
  buildMetaServiceRoutingMetadata,
};
