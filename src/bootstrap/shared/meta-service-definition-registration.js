/**
 * Shared owner for built-in meta service-definition registration.
 *
 * Persists sys-wasm-meta, sys-admin-meta, and sys-postgres-wire definitions
 * through a caller-provided system-table upsert function.
 */

import {URL} from 'node:url';
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
import {resolveAdvertisedEndpointHost} from
  '../../transport/node-address-resolution.js';

const LOCAL_STR_COLON_SLASH_SLASH = '://';
const LOCAL_STR_LBRACKET = '[';
const LOCAL_STR_COLON = ':';

const META_SERVICE_DEFINITION_REGISTRATION_ERROR = Object.freeze({
  UPSERT_REQUIRED: 'Meta service definition registration requires upsertRow function',
  NODE_ID_REQUIRED: 'Meta service endpoint registration requires nodeId',
  ENDPOINT_ADDRESS_REQUIRED:
    'Meta service endpoint registration requires a valid address',
  ENDPOINT_PORT_REQUIRED: 'Meta service endpoint registration requires a valid port',
});
const POSTGRES_WIRE_DEFAULT_PORT = 5432;

function assertEndpointRegistrationOptions(options = {}) {
  if (typeof options.upsertRow !== 'function') {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
  }
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.NODE_ID_REQUIRED);
  }
}

function resolveValidatedEndpointBinding(options = {}) {
  const endpointAddress = resolveEndpointAddress({
    nodeAddress: options.nodeAddress,
    advertisedNodeWsAddress: options.advertisedNodeWsAddress,
    nodeId: options.nodeId,
  });
  if (typeof endpointAddress !== 'string' || endpointAddress.length === 0) {
    throw new Error(
      META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_ADDRESS_REQUIRED,
    );
  }

  const endpointPort = resolveEndpointPort(options.wsPort, options.nodeAddress);
  if (!Number.isInteger(endpointPort) || endpointPort <= 0) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_PORT_REQUIRED);
  }

  return {endpointAddress, endpointPort};
}

function resolvePostgresEndpointPort(postgresPort) {
  return Number.isInteger(postgresPort) && postgresPort > 0 ?
    postgresPort :
    POSTGRES_WIRE_DEFAULT_PORT;
}

function resolvePositiveIntegerPort(portValue) {
  const parsedPort = Number(portValue);
  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 0;
}

function resolveBracketedEndpointPort(address) {
  const bracketClose = address.indexOf(']');
  const colonAfterBracket = address.lastIndexOf(':');
  if (bracketClose <= 1 || colonAfterBracket <= bracketClose) {
    return 0;
  }
  return resolvePositiveIntegerPort(address.substring(colonAfterBracket + 1));
}

function buildBuiltInMetaEndpoints(options = {}) {
  const {wasmMetaEndpoint, adminMetaEndpoint} = buildMetaServiceEndpoints(
    options.nodeId,
    options.endpointAddress,
    options.endpointPort,
  );
  const postgresWireEndpoint = buildEndpointRecord({
    serviceDefinition: createPostgresWireDefinition(),
    nodeId: options.nodeId,
    address: options.endpointAddress,
    port: resolvePostgresEndpointPort(options.postgresPort),
    version: META_ENDPOINT_VERSION,
  });

  return [wasmMetaEndpoint, adminMetaEndpoint, postgresWireEndpoint];
}

/**
 * Register built-in meta service definitions in service_definitions.
 * @param {Object} options
 * @param {Function} options.upsertRow - Async callback (tableName, row) => Promise<void>.
 * @return {Promise<string[]>} Registered service IDs.
 */
async function registerBuiltInMetaServiceDefinitions(options = {}) {
  const {upsertRow} = options;
  if (typeof upsertRow !== 'function') {
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
  assertEndpointRegistrationOptions(options);
  const {upsertRow, nodeId, postgresPort} = options;
  const {endpointAddress, endpointPort} = resolveValidatedEndpointBinding(options);
  const endpoints = buildBuiltInMetaEndpoints({
    endpointAddress,
    endpointPort,
    nodeId,
    postgresPort,
  });
  for (const endpoint of endpoints) {
    await upsertRow(SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS, endpoint);
  }

  return endpoints.map((endpoint) => endpoint.endpoint_id);
}

/**
 * Resolve endpoint address from advertised/node transport authority.
 * @param {Object} options
 * @param {string|undefined|null} options.nodeAddress
 * @param {string|undefined|null} options.advertisedNodeWsAddress
 * @param {string} options.nodeId
 * @return {string|null}
 */
function resolveEndpointAddress(options = {}) {
  const advertisedHost = resolveAdvertisedEndpointHost({
    advertisedAddress: options.advertisedNodeWsAddress,
    nodeAddress: options.nodeAddress,
    wsPort: null,
  });
  if (typeof advertisedHost === 'string' &&
      advertisedHost.length > 0) {
    return advertisedHost;
  }

  const nodeAddress = options.nodeAddress;
  if (typeof nodeAddress !== 'string' || nodeAddress.length === 0) {
    return null;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.includes(LOCAL_STR_COLON_SLASH_SLASH)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname) {
        return parsed.hostname;
      }
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith(LOCAL_STR_LBRACKET)) {
    const bracketClose = trimmed.indexOf(']');
    if (bracketClose > 1) {
      return trimmed.substring(1, bracketClose);
    }
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0 && trimmed.indexOf(LOCAL_STR_COLON) === lastColon) {
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

  if (typeof nodeAddress !== 'string' || nodeAddress.length === 0) {
    return 0;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  if (trimmed.includes(LOCAL_STR_COLON_SLASH_SLASH)) {
    try {
      const parsed = new URL(trimmed);
      return resolvePositiveIntegerPort(parsed.port);
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith(LOCAL_STR_LBRACKET)) {
    return resolveBracketedEndpointPort(trimmed);
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= 0 || trimmed.indexOf(LOCAL_STR_COLON) !== lastColon) {
    return 0;
  }
  return resolvePositiveIntegerPort(trimmed.substring(lastColon + 1));
}

export {
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
  registerBuiltInMetaServiceDefinitions,
  registerBuiltInMetaServiceEndpoints,
};
