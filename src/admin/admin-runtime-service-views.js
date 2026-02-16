/**
 * Admin view helpers for runtime-service replicas.
 *
 * Provides functions to query and format runtime-service replicas
 * for admin views, group replicas by logical service, format
 * endpoint details with protocol/address/port, and distinguish
 * logical services from individual replica rows.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {SQL, TABLES, COLUMN, STRING} from '../constants/index.js';
import {
  EP_COL,
} from '../wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
} from '../wasm-service/wasm-service-constants.js';
import {
  LOGICAL_SERVICE_HEALTH,
  VIEW_ROW_KIND,
  PROTOCOL_URI_SCHEME,
  BUILT_IN_RUNTIME_SERVICE_IDS,
  PORT_UNKNOWN,
} from './admin-runtime-service-view-constants.js';

const SELECT_ALL_FROM = `${SQL.SELECT} * FROM`;

/**
 * Handle listRuntimeServiceReplicas command.
 * Returns SQL to query service_endpoints joined conceptually
 * with service_definitions for runtime-service replicas.
 * Optionally filtered by serviceId or nodeId.
 *
 * @param {Object} params - Optional {serviceId, nodeId}.
 * @return {Object} Result with sql/params for execution.
 */
function handleListRuntimeServiceReplicas(params) {
  let sql = `${SELECT_ALL_FROM} ${TABLES.SERVICE_ENDPOINTS}`;
  const filters = [];
  const sqlParams = [];

  if (params && params.serviceId) {
    sqlParams.push(params.serviceId);
    filters.push(
      `${EP_COL.SERVICE_ID} = ?${sqlParams.length}`,
    );
  }

  if (params && params.nodeId) {
    sqlParams.push(params.nodeId);
    filters.push(
      `${EP_COL.NODE_ID} = ?${sqlParams.length}`,
    );
  }

  if (filters.length > 0) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }

  return {success: true, sql, params: sqlParams};
}

/**
 * Group flat endpoint rows by logical service ID.
 * Each group contains the service ID, aggregated replica list,
 * and health summary.
 *
 * @param {Array<Object>} endpoints - Rows from service_endpoints.
 * @param {Array<Object>} definitions - Rows from service_definitions.
 * @return {Array<Object>} Logical service groups with replica details.
 */
function groupReplicasByLogicalService(endpoints, definitions) {
  const defMap = new Map();
  for (const def of definitions) {
    const id = def[COLUMN.SERVICE_ID] || def.service_id;
    if (id) {
      defMap.set(id, def);
    }
  }

  const groups = new Map();
  for (const ep of endpoints) {
    const serviceId = ep[EP_COL.SERVICE_ID] || ep.service_id;
    if (!serviceId) {
      continue;
    }
    if (!groups.has(serviceId)) {
      groups.set(serviceId, []);
    }
    groups.get(serviceId).push(ep);
  }

  const result = [];
  for (const [serviceId, replicas] of groups) {
    const definition = defMap.get(serviceId) || {};
    const desiredCount = definition.replica_count ??
      definition.replicaCount ?? 0;
    const healthyCount = countHealthyReplicas(replicas);

    result.push({
      row_kind: VIEW_ROW_KIND.LOGICAL_SERVICE,
      service_id: serviceId,
      service_name: definition.service_name ||
        definition.serviceName || serviceId,
      runtime_kind: definition.runtime_kind ||
        definition.runtimeKind || STRING.UNKNOWN,
      desired_replica_count: desiredCount,
      observed_replica_count: replicas.length,
      healthy_replica_count: healthyCount,
      nodes: collectUniqueNodes(replicas),
      health: resolveLogicalServiceHealth(
        desiredCount, replicas.length, healthyCount,
      ),
      replicas: replicas.map((ep) => formatReplicaRow(ep)),
    });
  }

  return result;
}

/**
 * Format a single endpoint row as a replica detail object.
 * Includes protocol, address, port, health status, and
 * the row_kind label to distinguish from logical service rows.
 *
 * @param {Object} endpoint - A service_endpoints row.
 * @return {Object} Formatted replica row.
 */
function formatReplicaRow(endpoint) {
  const protocol = endpoint[EP_COL.PROTOCOL] ||
    endpoint.protocol || WASM_SERVICE_PROTOCOL.WEBSOCKET;
  const address = endpoint[EP_COL.ADDRESS] ||
    endpoint.address || STRING.UNKNOWN;
  const port = endpoint[EP_COL.PORT] ??
    endpoint.port ?? PORT_UNKNOWN;
  const healthStatus = endpoint[EP_COL.HEALTH_STATUS] ||
    endpoint.health_status ||
    WASM_SERVICE_HEALTH_STATUS.HEALTHY;

  return {
    row_kind: VIEW_ROW_KIND.REPLICA,
    endpoint_id: endpoint[EP_COL.ENDPOINT_ID] ||
      endpoint.endpoint_id || STRING.UNKNOWN,
    service_id: endpoint[EP_COL.SERVICE_ID] ||
      endpoint.service_id || STRING.UNKNOWN,
    node_id: endpoint[EP_COL.NODE_ID] ||
      endpoint.node_id || STRING.UNKNOWN,
    protocol,
    address,
    port,
    health_status: healthStatus,
    endpoint_uri: formatEndpointUri(protocol, address, port),
  };
}

/**
 * Format a protocol-aware endpoint URI for display.
 * Maps known protocols to URI schemes (e.g. postgresql://host:port).
 *
 * @param {string} protocol - Internal protocol identifier.
 * @param {string} address - Endpoint host address.
 * @param {number|string} port - Endpoint port.
 * @return {string} Formatted URI string.
 */
function formatEndpointUri(protocol, address, port) {
  const scheme = protocol === WASM_SERVICE_PROTOCOL.POSTGRESQL ?
    PROTOCOL_URI_SCHEME.POSTGRESQL :
    PROTOCOL_URI_SCHEME.WEBSOCKET;
  return `${scheme}${address}:${port}`;
}

/**
 * Resolve logical service health from replica counts.
 *
 * @param {number} desired - Desired replica count.
 * @param {number} observed - Observed replica count.
 * @param {number} healthy - Healthy replica count.
 * @return {string} Health state constant.
 */
function resolveLogicalServiceHealth(desired, observed, healthy) {
  if (desired <= 0) {
    return observed === 0 ?
      LOGICAL_SERVICE_HEALTH.UNKNOWN :
      LOGICAL_SERVICE_HEALTH.HEALTHY;
  }
  if (healthy >= desired) {
    return LOGICAL_SERVICE_HEALTH.HEALTHY;
  }
  if (healthy === 0) {
    return LOGICAL_SERVICE_HEALTH.DEGRADED;
  }
  return LOGICAL_SERVICE_HEALTH.PARTIAL;
}

/**
 * Check whether a service ID is a built-in runtime service.
 *
 * @param {string} serviceId - Service identifier.
 * @return {boolean} True if the ID is a built-in runtime service.
 */
function isBuiltInRuntimeService(serviceId) {
  return BUILT_IN_RUNTIME_SERVICE_IDS.includes(serviceId);
}

/**
 * Count healthy replicas from endpoint rows.
 *
 * @param {Array<Object>} endpoints - Endpoint rows.
 * @return {number} Count of healthy endpoints.
 */
function countHealthyReplicas(endpoints) {
  let count = 0;
  for (const ep of endpoints) {
    const status = ep[EP_COL.HEALTH_STATUS] ||
      ep.health_status;
    if (status === WASM_SERVICE_HEALTH_STATUS.HEALTHY) {
      count++;
    }
  }
  return count;
}

/**
 * Collect unique node IDs from endpoint rows.
 *
 * @param {Array<Object>} endpoints - Endpoint rows.
 * @return {Array<string>} Sorted unique node IDs.
 */
function collectUniqueNodes(endpoints) {
  const nodeSet = new Set();
  for (const ep of endpoints) {
    const nodeId = ep[EP_COL.NODE_ID] || ep.node_id;
    if (nodeId) {
      nodeSet.add(nodeId);
    }
  }
  return Array.from(nodeSet).sort();
}

export {
  handleListRuntimeServiceReplicas,
  groupReplicasByLogicalService,
  formatReplicaRow,
  formatEndpointUri,
  resolveLogicalServiceHealth,
  isBuiltInRuntimeService,
  countHealthyReplicas,
  collectUniqueNodes,
};
