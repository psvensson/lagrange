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
import {resolveAdvertisedEndpointHost} from
  '../../transport/node-address-resolution.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_37AKI = '://';
const LOCAL_STR_1PLYW = '[';
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
  if (typeof options.upsertRow !== TYPEOF.FUNCTION) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
  }
  if (typeof options.nodeId !== TYPEOF.STRING || options.nodeId.length === LOCAL_NUM_ZERO) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.NODE_ID_REQUIRED);
  }
}

function resolveValidatedEndpointBinding(options = {}) {
  const endpointAddress = resolveEndpointAddress({
    nodeAddress: options.nodeAddress,
    advertisedNodeWsAddress: options.advertisedNodeWsAddress,
    nodeId: options.nodeId,
  });
  if (typeof endpointAddress !== TYPEOF.STRING || endpointAddress.length === LOCAL_NUM_ZERO) {
    throw new Error(
      META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_ADDRESS_REQUIRED,
    );
  }

  const endpointPort = resolveEndpointPort(options.wsPort, options.nodeAddress);
  if (!Number.isInteger(endpointPort) || endpointPort <= LOCAL_NUM_ZERO) {
    throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_PORT_REQUIRED);
  }

  return {endpointAddress, endpointPort};
}

function resolvePostgresEndpointPort(postgresPort) {
  return Number.isInteger(postgresPort) && postgresPort > LOCAL_NUM_ZERO ?
    postgresPort :
    POSTGRES_WIRE_DEFAULT_PORT;
}

function resolvePositiveIntegerPort(portValue) {
  const parsedPort = Number(portValue);
  return Number.isInteger(parsedPort) && parsedPort > LOCAL_NUM_ZERO ? parsedPort : LOCAL_NUM_ZERO;
}

function resolveBracketedEndpointPort(address) {
  const bracketClose = address.indexOf(']');
  const colonAfterBracket = address.lastIndexOf(':');
  if (bracketClose <= LOCAL_NUM_ONE || colonAfterBracket <= bracketClose) {
    return LOCAL_NUM_ZERO;
  }
  return resolvePositiveIntegerPort(address.substring(colonAfterBracket + LOCAL_NUM_ONE));
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
  if (typeof advertisedHost === TYPEOF.STRING &&
      advertisedHost.length > LOCAL_NUM_ZERO) {
    return advertisedHost;
  }

  const nodeAddress = options.nodeAddress;
  if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === LOCAL_NUM_ZERO) {
    return null;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === LOCAL_NUM_ZERO) {
    return null;
  }

  if (trimmed.includes(LOCAL_STR_37AKI)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname) {
        return parsed.hostname;
      }
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith(LOCAL_STR_1PLYW)) {
    const bracketClose = trimmed.indexOf(']');
    if (bracketClose > LOCAL_NUM_ONE) {
      return trimmed.substring(LOCAL_NUM_ONE, bracketClose);
    }
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > LOCAL_NUM_ZERO && trimmed.indexOf(LOCAL_STR_COLON) === lastColon) {
    return trimmed.substring(LOCAL_NUM_ZERO, lastColon);
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
  if (Number.isInteger(wsPort) && wsPort > LOCAL_NUM_ZERO) {
    return wsPort;
  }

  if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === LOCAL_NUM_ZERO) {
    return LOCAL_NUM_ZERO;
  }

  const trimmed = nodeAddress.trim();
  if (trimmed.length === LOCAL_NUM_ZERO) {
    return LOCAL_NUM_ZERO;
  }

  if (trimmed.includes(LOCAL_STR_37AKI)) {
    try {
      const parsed = new URL(trimmed);
      return resolvePositiveIntegerPort(parsed.port);
    } catch (_error) {
      // Non-URL node addresses are parsed below.
    }
  }

  if (trimmed.startsWith(LOCAL_STR_1PLYW)) {
    return resolveBracketedEndpointPort(trimmed);
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= LOCAL_NUM_ZERO || trimmed.indexOf(LOCAL_STR_COLON) !== lastColon) {
    return LOCAL_NUM_ZERO;
  }
  return resolvePositiveIntegerPort(trimmed.substring(lastColon + LOCAL_NUM_ONE));
}

export {
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
  registerBuiltInMetaServiceDefinitions,
  registerBuiltInMetaServiceEndpoints,
};
