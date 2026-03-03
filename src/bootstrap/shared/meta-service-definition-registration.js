/**
 * Shared owner for built-in meta service-definition registration.
 *
 * Persists sys-wasm-meta, sys-admin-meta, and sys-postgres-wire definitions
 * through a caller-provided system-table upsert function.
 */

import {URL} from 'node:url';
import {TYPEOF} from '../../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../system-table-schemas-constants.js';
import {
  createAdminMetaDefinition,
  createWasmMetaDefinition,
  createPostgresWireDefinition,
} from '../../wasm-service/meta-service-factory.js';
import {serializeServiceDefinition} from '../../wasm-service/wasm-service-models.js';
import {
  META_ENDPOINT_VERSION,
  buildMetaServiceEndpoints,
} from '../../admin/admin-meta-endpoint-builder.js';
import {buildEndpointRecord} from '../../wasm-service/service-endpoint-builder.js';

const META_SERVICE_DEFINITION_REGISTRATION_ERROR = Object.freeze({
  UPSERT_REQUIRED: 'Meta service definition registration requires upsertRow function',
  NODE_ID_REQUIRED: 'Meta service endpoint registration requires nodeId',
  ENDPOINT_PORT_REQUIRED: 'Meta service endpoint registration requires a valid port',
});
const POSTGRES_WIRE_DEFAULT_PORT = 5432;

/**
 * Register built-in meta service definitions in service_definitions.
 * @param {Object} options
 * @param {Function} options.upsertRow - Async callback (tableName, row) => Promise<void>.
 * @return {Promise<string[]>} Registered service IDs.
 */
async function registerBuiltInMetaServiceDefinitions(options = {}) {
  const {upsertRow} = options;
  if (typeof upsertRow !== TYPEOF.FUNCTION) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
  }

  const definitions = [
    createWasmMetaDefinition(),
    createAdminMetaDefinition(),
    createPostgresWireDefinition(),
  ];

  for (const definition of definitions) {
    const row = serializeServiceDefinition(definition);
    await upsertRow(SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, row);
  }

  return definitions.map((definition) => definition.serviceId);
}

/**
 * Register built-in meta service endpoints in service_endpoints.
 * @param {Object} options
 * @param {Function} options.upsertRow - Async callback (tableName, row) => Promise<void>.
 * @param {string} options.nodeId - Hosting node identifier.
 * @param {string} [options.nodeAddress] - Host or URL string used to derive endpoint address/port.
 * @param {number} [options.wsPort] - Explicit endpoint port.
 * @return {Promise<string[]>} Registered endpoint IDs.
 */
async function registerBuiltInMetaServiceEndpoints(options = {}) {
  const {upsertRow, nodeId, nodeAddress, wsPort, postgresPort} = options;
  if (typeof upsertRow !== TYPEOF.FUNCTION) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
  }
  if (typeof nodeId !== TYPEOF.STRING || nodeId.length === 0) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.NODE_ID_REQUIRED);
  }

  const endpointAddress = resolveEndpointAddress(nodeAddress, nodeId);
  const endpointPort = resolveEndpointPort(wsPort, nodeAddress);
  if (!Number.isInteger(endpointPort) || endpointPort <= 0) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_PORT_REQUIRED);
  }

  const {wasmMetaEndpoint, adminMetaEndpoint} = buildMetaServiceEndpoints(
    nodeId,
    endpointAddress,
    endpointPort,
  );
  const resolvedPostgresPort =
    Number.isInteger(postgresPort) && postgresPort > 0 ?
      postgresPort :
      POSTGRES_WIRE_DEFAULT_PORT;
  const postgresWireEndpoint = buildEndpointRecord({
    serviceDefinition: createPostgresWireDefinition(),
    nodeId,
    address: endpointAddress,
    port: resolvedPostgresPort,
    version: META_ENDPOINT_VERSION,
  });

  const endpoints = [wasmMetaEndpoint, adminMetaEndpoint, postgresWireEndpoint];
  for (const endpoint of endpoints) {
    await upsertRow(SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS, endpoint);
  }

  return endpoints.map((endpoint) => endpoint.endpoint_id);
}

/**
 * Resolve endpoint address from node address or fallback to node ID.
 * @param {string|undefined|null} nodeAddress
 * @param {string} nodeId
 * @return {string}
 */
function resolveEndpointAddress(nodeAddress, nodeId) {
  if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === 0) {
    return nodeId;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === 0) {
    return nodeId;
  }

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname) {
        return parsed.hostname;
      }
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith('[')) {
    const bracketClose = trimmed.indexOf(']');
    if (bracketClose > 1) {
      return trimmed.substring(1, bracketClose);
    }
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0 && trimmed.indexOf(':') === lastColon) {
    return trimmed.substring(0, lastColon);
  }

  return trimmed;
}

/**
 * Resolve endpoint port from explicit wsPort or nodeAddress.
 * @param {number|undefined|null} wsPort
 * @param {string|undefined|null} nodeAddress
 * @return {number}
 */
function resolveEndpointPort(wsPort, nodeAddress) {
  if (Number.isInteger(wsPort) && wsPort > 0) {
    return wsPort;
  }

  if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === 0) {
    return 0;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      const parsedPort = Number(parsed.port);
      return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 0;
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith('[')) {
    const bracketClose = trimmed.indexOf(']');
    const colonAfterBracket = trimmed.lastIndexOf(':');
    if (bracketClose > 1 && colonAfterBracket > bracketClose) {
      const bracketPort = Number(trimmed.substring(colonAfterBracket + 1));
      return Number.isInteger(bracketPort) && bracketPort > 0 ? bracketPort : 0;
    }
    return 0;
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= 0 || trimmed.indexOf(':') !== lastColon) {
    return 0;
  }
  const parsedPort = Number(trimmed.substring(lastColon + 1));
  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 0;
}

export {
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
  registerBuiltInMetaServiceDefinitions,
  registerBuiltInMetaServiceEndpoints,
};
