import {resolveRuntimeServiceTargetReplicaCount} from
  '../../rebalancer/runtime-service-policy.js';

const LOCAL_STR_RUNTIME_SERVICE = 'runtime_service';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_NONE = 'none';
const LOCAL_STR_UNKNOWN = 'unknown';

const LOGICAL_SERVICE_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  PARTIAL: 'partial',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
});

const HEALTHY_RUNTIME_STATUS = new Set([
  'healthy',
  'active',
]);

/**
 * Get replica rows with optional filtering.
 * @param {Object} tables - Remote cache table maps.
 * @param {Object} filter - Optional filters.
 * @return {Array<Object>} Array of replica records.
 */
export function getServiceRows(tables, filter = {}) {
  let services = Array.from(tables.services.values());
  services = services.concat(getRuntimeServiceRows(tables));
  if (filter.nodeId) {
    services = services.filter((service) => {
      return resolveNodeId(service) === filter.nodeId;
    });
  }
  if (filter.type) {
    services = services.filter((service) => {
      return resolveServiceType(service) === filter.type;
    });
  }
  if (filter.partitionId) {
    services = services.filter((service) => {
      return service.partition_id === filter.partitionId;
    });
  }
  if (filter.groupId) {
    services = services.filter((service) => {
      return service.group_id === filter.groupId;
    });
  }
  if (filter.serviceId) {
    services = services.filter((service) => {
      return resolveServiceId(service) === filter.serviceId ||
        service.logical_service_id === filter.serviceId;
    });
  }

  return services.map((service) => {
    if (service.node_address) {
      return service;
    }
    const node = tables.nodes.get(resolveNodeId(service));
    const nodeAddress = resolveNodeAddress(node);
    if (nodeAddress) {
      return {...service, node_address: nodeAddress};
    }
    return service;
  });
}

/**
 * Get logical service rows (service definitions joined with endpoints).
 * @param {Object} tables - Remote cache table maps.
 * @param {Object} filter - Optional filters (nodeId, serviceId).
 * @return {Array<Object>}
 */
export function getLogicalServiceRows(tables, filter = {}) {
  const logicalServices = [];
  const definitions = Array.from(tables.service_definitions.values());
  const endpointsByServiceId = getEndpointsByServiceId(tables);

  for (const definition of definitions) {
    const serviceId = resolveServiceId(definition);
    if (!serviceId) {
      continue;
    }

    const endpoints = endpointsByServiceId.get(serviceId) || [];
    const nodes = collectEndpointNodeIds(endpoints);
    if (filter.nodeId && !nodes.includes(filter.nodeId)) {
      continue;
    }
    if (filter.serviceId && serviceId !== filter.serviceId) {
      continue;
    }

    const desiredReplicaCount = resolveReplicaCount(definition);
    const observedReplicaCount = endpoints.length;
    const healthyReplicaCount = countHealthyEndpoints(endpoints);

    logicalServices.push({
      ...definition,
      service_id: serviceId,
      service_name: definition.service_name || definition.serviceName || serviceId,
      service_type: definition.service_type || definition.serviceType || LOCAL_STR_RUNTIME_SERVICE,
      runtime_kind: definition.runtime_kind || definition.runtimeKind || null,
      runtime_ref: definition.runtime_ref || definition.runtimeRef || null,
      replica_count: desiredReplicaCount,
      replica_count_observed: observedReplicaCount,
      healthy_replica_count: healthyReplicaCount,
      node_count: nodes.length,
      nodes,
      nodes_summary: nodes.length > 0 ? nodes.join(LOCAL_STR_COMMA_SPACE) : LOCAL_STR_NONE,
      status: resolveLogicalServiceStatus(
        desiredReplicaCount,
        observedReplicaCount,
        healthyReplicaCount,
      ),
    });
  }

  return logicalServices;
}

/**
 * Build runtime service rows from service definitions and endpoints.
 * @param {Object} tables - Remote cache table maps.
 * @return {Array<Object>} Runtime-backed service rows.
 */
export function getRuntimeServiceRows(tables) {
  const runtimeServices = [];
  const definitions = Array.from(tables.service_definitions.values());
  const endpointsByServiceId = getEndpointsByServiceId(tables);

  for (const definition of definitions) {
    const serviceId = resolveServiceId(definition);
    if (!serviceId) {
      continue;
    }

    const endpoints = endpointsByServiceId.get(serviceId) || [];
    for (const endpoint of endpoints) {
      runtimeServices.push(createRuntimeServiceRow(definition, endpoint));
    }
  }

  return runtimeServices;
}

/**
 * Create one runtime service row for service inventory views.
 * @param {Object} definition - service_definitions row.
 * @param {Object} endpoint - service_endpoints row.
 * @return {Object}
 */
export function createRuntimeServiceRow(definition, endpoint) {
  const serviceId = resolveServiceId(definition);
  const endpointId = resolveEndpointId(endpoint);
  const endpointAddress = formatEndpointAddress(endpoint);
  const status = resolveRuntimeStatus(definition, endpoint);
  const nodeId = resolveNodeId(endpoint);

  return {
    ...definition,
    service_id: serviceId,
    logical_service_id: serviceId,
    service_type: LOCAL_STR_RUNTIME_SERVICE,
    status,
    node_id: nodeId,
    endpoint_id: endpointId,
    replica_id: endpointId,
    address: endpointAddress,
    row_key: `runtime:${serviceId}:${endpointId}`,
  };
}

/**
 * Format endpoint address with optional port.
 * @param {Object|null} endpoint - Endpoint record.
 * @return {string|null}
 */
export function formatEndpointAddress(endpoint) {
  const address = resolveNodeAddress(endpoint);
  if (!address) {
    return null;
  }
  const port = endpoint.port ?? endpoint.ws_port ?? endpoint.wsPort;
  if (port === undefined || port === null) {
    return address;
  }
  return `${address}:${port}`;
}

/**
 * Resolve a service identifier from snake_case, camelCase, or id fallback.
 * @param {Object|undefined|null} row
 * @return {string}
 */
export function resolveServiceId(row) {
  if (!row) {
    return '';
  }
  return row.service_id || row.serviceId || row.id || '';
}

/**
 * Resolve a node identifier from snake_case or camelCase fields.
 * @param {Object|undefined|null} row
 * @return {string|null}
 */
export function resolveNodeId(row) {
  if (!row) {
    return null;
  }
  return row.node_id || row.nodeId || null;
}

/**
 * Resolve a service type from snake_case or legacy aliases.
 * @param {Object|undefined|null} row
 * @return {string|null}
 */
export function resolveServiceType(row) {
  if (!row) {
    return null;
  }
  return row.service_type || row.serviceType || row.type || null;
}

/**
 * Resolve endpoint identifier from snake_case, camelCase, or id fallback.
 * @param {Object|undefined|null} endpoint
 * @return {string|null}
 */
export function resolveEndpointId(endpoint) {
  if (!endpoint) {
    return null;
  }
  return endpoint.endpoint_id || endpoint.endpointId || endpoint.id || null;
}

/**
 * Resolve display address from common node/endpoint field variants.
 * @param {Object|undefined|null} row
 * @return {string|null}
 */
export function resolveNodeAddress(row) {
  if (!row) {
    return null;
  }
  return row.node_address || row.nodeAddress || row.address || row.host || null;
}

/**
 * Resolve runtime service status from endpoint health or definition status.
 * @param {Object} definition
 * @param {Object|null|undefined} endpoint
 * @return {string}
 */
export function resolveRuntimeStatus(definition, endpoint) {
  return endpoint?.health_status ||
    endpoint?.healthStatus ||
    endpoint?.status ||
    definition?.status ||
    definition?.state ||
    LOCAL_STR_UNKNOWN;
}

/**
 * Group endpoint rows by service_id.
 * @param {Object} tables - Remote cache table maps.
 * @return {Map<string, Array<Object>>}
 */
export function getEndpointsByServiceId(tables) {
  const endpointsByServiceId = new Map();
  for (const endpoint of tables.service_endpoints.values()) {
    const serviceId = resolveServiceId(endpoint);
    if (!serviceId) {
      continue;
    }
    if (!endpointsByServiceId.has(serviceId)) {
      endpointsByServiceId.set(serviceId, []);
    }
    endpointsByServiceId.get(serviceId).push(endpoint);
  }
  return endpointsByServiceId;
}

/**
 * Resolve desired replica count from definition fields.
 * @param {Object} definition
 * @return {number}
 */
export function resolveReplicaCount(definition) {
  if (!definition) {
    return 0;
  }
  return resolveRuntimeServiceTargetReplicaCount(definition);
}

/**
 * Collect unique node IDs from endpoint rows.
 * @param {Array<Object>} endpoints
 * @return {Array<string>}
 */
export function collectEndpointNodeIds(endpoints) {
  const uniqueNodeIds = new Set();
  for (const endpoint of endpoints) {
    const nodeId = resolveNodeId(endpoint);
    if (nodeId) {
      uniqueNodeIds.add(nodeId);
    }
  }
  return Array.from(uniqueNodeIds.values()).sort();
}

/**
 * Count endpoints in a healthy state.
 * @param {Array<Object>} endpoints
 * @return {number}
 */
export function countHealthyEndpoints(endpoints) {
  return endpoints.reduce((count, endpoint) => {
    const status = resolveRuntimeStatus(null, endpoint);
    return HEALTHY_RUNTIME_STATUS.has(String(status).toLowerCase()) ?
      count + 1 :
      count;
  }, 0);
}

/**
 * Resolve logical-service health state from desired/observed counts.
 * @param {number} desiredReplicaCount
 * @param {number} observedReplicaCount
 * @param {number} healthyReplicaCount
 * @return {string}
 */
export function resolveLogicalServiceStatus(
  desiredReplicaCount,
  observedReplicaCount,
  healthyReplicaCount,
) {
  if (desiredReplicaCount <= 0) {
    return observedReplicaCount === 0 ?
      LOGICAL_SERVICE_STATUS.UNKNOWN :
      LOGICAL_SERVICE_STATUS.HEALTHY;
  }
  if (healthyReplicaCount >= desiredReplicaCount) {
    return LOGICAL_SERVICE_STATUS.HEALTHY;
  }
  if (healthyReplicaCount === 0) {
    return LOGICAL_SERVICE_STATUS.DEGRADED;
  }
  return LOGICAL_SERVICE_STATUS.PARTIAL;
}
