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

import {
  EP_COL,
  EP_META,
  EP_ID_SEPARATOR,
  DEFAULT_VERSION,
} from '../wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../wasm-service/wasm-service-constants.js';
import {
  ENDPOINT_INTENT_FIELD,
} from '../constants/runtime.js';

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
  const port = endpointIntent[ENDPOINT_INTENT_FIELD.PORT];
  const host = endpointIntent[ENDPOINT_INTENT_FIELD.HOST] || nodeId;
  const protocol = endpointIntent[ENDPOINT_INTENT_FIELD.PROTOCOL] ||
    WASM_SERVICE_PROTOCOL.WEBSOCKET;
  const now = Date.now();

  const metadata = {
    [EP_META.SERVICE_NAME]: serviceId,
    [EP_META.VERSION]: DEFAULT_VERSION,
    [EP_META.PROTOCOL]: protocol,
  };

  return {
    [EP_COL.ENDPOINT_ID]: `${serviceId}${EP_ID_SEPARATOR}${nodeId}`,
    [EP_COL.SERVICE_ID]: serviceId,
    [EP_COL.NODE_ID]: nodeId,
    [EP_COL.PROTOCOL]: protocol,
    [EP_COL.ADDRESS]: host,
    [EP_COL.PORT]: port,
    [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
    [EP_COL.METADATA]: JSON.stringify(metadata),
    [EP_COL.CREATED_AT]: now,
    [EP_COL.UPDATED_AT]: now,
  };
}

/**
 * Derive the deterministic endpoint ID for a service on a node.
 *
 * @param {string} serviceId - The service identifier.
 * @param {string} nodeId - The hosting node identifier.
 * @return {string} The endpoint ID.
 */
function deriveEndpointId(serviceId, nodeId) {
  return `${serviceId}${EP_ID_SEPARATOR}${nodeId}`;
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
  return {
    [EP_COL.ENDPOINT_ID]: deriveEndpointId(serviceId, nodeId),
    [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
    [EP_COL.UPDATED_AT]: Date.now(),
  };
}

export {
  buildRuntimeEndpointRow,
  deriveEndpointId,
  buildUnhealthyEndpointRow,
};
