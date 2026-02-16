/**
 * Endpoint sync desired-state planner.
 *
 * Plans logical service exports from normalized endpoint rows,
 * including strict-port validation and deterministic grouping.
 *
 * @module runtime/endpoint-sync-planner
 */

import {
  ENDPOINT_SYNC_ADDRESS_TYPE,
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_ERROR,
  ENDPOINT_SYNC_LIST_SEPARATOR,
  ENDPOINT_SYNC_REGEX,
} from './endpoint-sync-constants.js';
import {
  buildKubernetesServiceName,
  buildServiceKey,
} from './endpoint-sync-naming.js';

/**
 * Resolve address type for EndpointSlice planning.
 *
 * @param {string} address - Endpoint address.
 * @return {string} Address type identifier.
 */
function resolveAddressType(address) {
  if (ENDPOINT_SYNC_REGEX.IPV4.test(address)) {
    return ENDPOINT_SYNC_ADDRESS_TYPE.IPV4;
  }
  if (address.includes(':') && ENDPOINT_SYNC_REGEX.IPV6.test(address)) {
    return ENDPOINT_SYNC_ADDRESS_TYPE.IPV6;
  }
  return ENDPOINT_SYNC_ADDRESS_TYPE.FQDN;
}

/**
 * Group normalized rows by logical service key.
 *
 * @param {Array<Object>} rows - Filtered normalized endpoint rows.
 * @return {Map<string, Object>} Group map.
 */
function groupEndpointRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = buildServiceKey(row.logicalServiceName, row.protocol);
    if (!groups.has(key)) {
      groups.set(key, {
        serviceKey: key,
        logicalServiceName: row.logicalServiceName,
        protocol: row.protocol,
        endpoints: [],
      });
    }
    groups.get(key).endpoints.push(row);
  }

  return groups;
}

/**
 * Chunk endpoint rows into fixed-size arrays.
 *
 * @param {Array<Object>} endpoints - Endpoints to chunk.
 * @param {number} maxEndpointsPerSlice - Chunk size.
 * @return {Array<Array<Object>>}
 */
function chunkEndpoints(endpoints, maxEndpointsPerSlice) {
  if (endpoints.length === 0) {
    return [];
  }

  const chunks = [];
  for (let idx = 0; idx < endpoints.length; idx += maxEndpointsPerSlice) {
    chunks.push(endpoints.slice(idx, idx + maxEndpointsPerSlice));
  }
  return chunks;
}

/**
 * Build EndpointSlice planning chunks per address type.
 *
 * @param {Array<Object>} endpoints - Endpoints for one logical service.
 * @param {number} maxEndpointsPerSlice - Maximum endpoints per slice.
 * @return {Array<Object>} Planned slice records.
 */
function planEndpointSlices(endpoints, maxEndpointsPerSlice) {
  const byAddressType = new Map();

  for (const endpoint of endpoints) {
    const addressType = resolveAddressType(endpoint.address);
    if (!byAddressType.has(addressType)) {
      byAddressType.set(addressType, []);
    }
    byAddressType.get(addressType).push(endpoint);
  }

  const slicePlans = [];
  for (const [addressType, typedEndpoints] of byAddressType) {
    const chunks = chunkEndpoints(typedEndpoints, maxEndpointsPerSlice);
    for (const chunk of chunks) {
      slicePlans.push({
        addressType,
        endpoints: chunk,
      });
    }
  }

  return slicePlans;
}

/**
 * Validate group ports under strict-port mode.
 *
 * @param {Object} group - Group with endpoints.
 * @return {{valid: boolean, ports: Array<number>}}
 */
function validateGroupPorts(group) {
  const ports = [...new Set(group.endpoints.map((row) => row.port))]
    .sort((left, right) => left - right);
  return {
    valid: ports.length === 1,
    ports,
  };
}

/**
 * Build desired endpoint exports from filtered rows.
 *
 * @param {Array<Object>} rows - Filtered normalized rows.
 * @param {Object} [options={}] - Planner options.
 * @param {boolean} [options.strictPortMode=true]
 * @param {string} [options.serviceNamePrefix='svc']
 * @param {number} [options.maxEndpointsPerSlice=100]
 * @return {{exports: Array<Object>, conflicts: Array<Object>}}
 */
function planEndpointExports(rows, options = {}) {
  const strictPortMode = options.strictPortMode === undefined ?
    ENDPOINT_SYNC_DEFAULT.STRICT_PORT_MODE :
    options.strictPortMode === true;
  const serviceNamePrefix = options.serviceNamePrefix ||
    ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX;
  const maxEndpointsPerSlice = options.maxEndpointsPerSlice ||
    ENDPOINT_SYNC_DEFAULT.MAX_ENDPOINTS_PER_SLICE;

  const groups = groupEndpointRows(rows);
  const orderedGroupKeys = [...groups.keys()].sort((left, right) =>
    left.localeCompare(right));

  const plannedExports = [];
  const conflicts = [];

  for (const groupKey of orderedGroupKeys) {
    const group = groups.get(groupKey);
    group.endpoints.sort((left, right) =>
      left.endpointId.localeCompare(right.endpointId));

    const portValidation = validateGroupPorts(group);
    if (strictPortMode && !portValidation.valid) {
      conflicts.push({
        serviceKey: group.serviceKey,
        logicalServiceName: group.logicalServiceName,
        protocol: group.protocol,
        ports: portValidation.ports,
        reason: ENDPOINT_SYNC_ERROR.STRICT_PORT_CONFLICT,
      });
      continue;
    }

    const selectedPort = portValidation.ports[0];
    const serviceName = buildKubernetesServiceName(
      serviceNamePrefix,
      group.logicalServiceName,
      group.protocol,
    );

    plannedExports.push({
      serviceKey: group.serviceKey,
      logicalServiceName: group.logicalServiceName,
      protocol: group.protocol,
      serviceName,
      port: selectedPort,
      endpointCount: group.endpoints.length,
      endpoints: group.endpoints,
      slicePlans: planEndpointSlices(group.endpoints, maxEndpointsPerSlice),
      sourceGroupKey: group.logicalServiceName +
        ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY +
        group.protocol,
    });
  }

  return {
    exports: plannedExports,
    conflicts,
  };
}

export {
  resolveAddressType,
  groupEndpointRows,
  chunkEndpoints,
  planEndpointSlices,
  validateGroupPorts,
  planEndpointExports,
};
