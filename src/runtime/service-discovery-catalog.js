/**
 * Runtime service-discovery catalog builder.
 *
 * Reuses endpoint-sync source normalization/filtering and grouping so the
 * same discovery model used for Kubernetes projection is available for
 * general service-discovery consumers.
 *
 * @module runtime/service-discovery-catalog
 */

import {TYPEOF} from '../constants/index.js';
import {
  ENDPOINT_SYNC_HEALTH,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from './endpoint-sync-constants.js';
import {
  filterNormalizedEndpointRows,
  normalizeEndpointRows,
} from './endpoint-sync-source-query.js';
import {groupEndpointRows} from './endpoint-sync-planner.js';

const SERVICE_DISCOVERY_DEFAULT = Object.freeze({
  HEALTHY_ONLY: false,
  UNHEALTHY_POLICY: ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
});

const SERVICE_DISCOVERY_HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  PARTIAL: 'partial',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
});

/**
 * Build a normalized string allowlist from optional query values.
 *
 * @param {Array<string>|undefined|null} values - Raw values.
 * @return {Set<string>}
 */
function toStringAllowlist(values) {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(
    values
      .filter((value) => typeof value === TYPEOF.STRING)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

/**
 * Resolve service definition id from snake_case/camelCase rows.
 *
 * @param {Object} row - service_definitions row.
 * @return {string|null}
 */
function resolveDefinitionServiceId(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }
  const serviceId = row.service_id || row.serviceId || row.id || null;
  if (typeof serviceId !== TYPEOF.STRING || serviceId.trim().length === 0) {
    return null;
  }
  return serviceId.trim();
}

/**
 * Resolve replica count from a service definition row.
 *
 * @param {Object} row - service_definitions row.
 * @return {number|null}
 */
function resolveDefinitionReplicaCount(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }
  const rawReplicaCount = row.replica_count ?? row.replicaCount;
  const parsedReplicaCount = Number(rawReplicaCount);
  if (!Number.isInteger(parsedReplicaCount) || parsedReplicaCount < 0) {
    return null;
  }
  return parsedReplicaCount;
}

/**
 * Build desired replica-count map keyed by service_id.
 *
 * @param {Array<Object>|undefined|null} definitionRows - Definitions table rows.
 * @return {Map<string, number>}
 */
function buildDesiredReplicaCountByServiceId(definitionRows) {
  const desiredReplicaCountByServiceId = new Map();
  if (!Array.isArray(definitionRows)) {
    return desiredReplicaCountByServiceId;
  }

  for (const definitionRow of definitionRows) {
    const serviceId = resolveDefinitionServiceId(definitionRow);
    if (!serviceId) {
      continue;
    }
    const replicaCount = resolveDefinitionReplicaCount(definitionRow);
    if (replicaCount === null) {
      continue;
    }
    desiredReplicaCountByServiceId.set(serviceId, replicaCount);
  }

  return desiredReplicaCountByServiceId;
}

/**
 * Build deterministic per-service desired replica-count object.
 *
 * @param {Array<string>} serviceIds - Unique service ids for one group.
 * @param {Map<string, number>} desiredByServiceId - Desired count map.
 * @return {Object}
 */
function buildDesiredReplicaCountMap(serviceIds, desiredByServiceId) {
  const desiredReplicaCountByServiceId = {};
  for (const serviceId of serviceIds) {
    if (!desiredByServiceId.has(serviceId)) {
      continue;
    }
    desiredReplicaCountByServiceId[serviceId] =
      desiredByServiceId.get(serviceId);
  }
  return desiredReplicaCountByServiceId;
}

/**
 * Resolve top-level desired replica count for one group.
 * Uses direct value when group maps to one service_id; otherwise null.
 *
 * @param {Array<string>} serviceIds - Unique service ids for one group.
 * @param {Map<string, number>} desiredByServiceId - Desired count map.
 * @return {number|null}
 */
function resolveDesiredReplicaCount(serviceIds, desiredByServiceId) {
  if (serviceIds.length !== 1) {
    return null;
  }
  const serviceId = serviceIds[0];
  if (!desiredByServiceId.has(serviceId)) {
    return null;
  }
  return desiredByServiceId.get(serviceId);
}

/**
 * Resolve aggregate health classification.
 *
 * @param {number} observedReplicaCount - Observed replicas.
 * @param {number} healthyReplicaCount - Healthy replicas.
 * @return {string}
 */
function resolveDiscoveryHealth(observedReplicaCount, healthyReplicaCount) {
  if (observedReplicaCount <= 0) {
    return SERVICE_DISCOVERY_HEALTH.UNKNOWN;
  }
  if (healthyReplicaCount >= observedReplicaCount) {
    return SERVICE_DISCOVERY_HEALTH.HEALTHY;
  }
  if (healthyReplicaCount === 0) {
    return SERVICE_DISCOVERY_HEALTH.DEGRADED;
  }
  return SERVICE_DISCOVERY_HEALTH.PARTIAL;
}

/**
 * Build one deterministic replica row.
 *
 * @param {Object} endpointRow - Normalized endpoint row.
 * @return {Object}
 */
function buildReplicaRecord(endpointRow) {
  return {
    endpointId: endpointRow.endpointId,
    serviceId: endpointRow.serviceId,
    nodeId: endpointRow.nodeId,
    address: endpointRow.address,
    port: endpointRow.port,
    healthStatus: endpointRow.healthStatus,
    updatedAt: endpointRow.updatedAt,
    metadata: endpointRow.metadata,
  };
}

/**
 * Build general-purpose discovery catalog from endpoint rows.
 *
 * @param {Array<Object>} endpointRows - service_endpoints rows.
 * @param {Object} [options={}] - Discovery options.
 * @param {Array<string>} [options.protocolAllowlist] - Protocol allowlist.
 * @param {Array<string>} [options.serviceIdAllowlist] - Service id allowlist.
 * @param {Array<string>} [options.nodeIdAllowlist] - Node id allowlist.
 * @param {boolean} [options.healthyOnly=false] - Keep only healthy endpoints.
 * @param {string} [options.unhealthyPolicy='not_ready'] - Unhealthy policy.
 * @param {Array<Object>} [options.definitionRows] - service_definitions rows.
 * @return {Array<Object>} Discovery catalog entries.
 */
function buildServiceDiscoveryCatalog(endpointRows, options = {}) {
  const normalizedRows = normalizeEndpointRows(endpointRows);
  const filteredRows = filterNormalizedEndpointRows(normalizedRows, {
    protocolAllowlist: options.protocolAllowlist,
    serviceIdAllowlist: options.serviceIdAllowlist,
    healthyOnly: options.healthyOnly === undefined ?
      SERVICE_DISCOVERY_DEFAULT.HEALTHY_ONLY :
      options.healthyOnly === true,
    unhealthyPolicy: options.unhealthyPolicy ||
      SERVICE_DISCOVERY_DEFAULT.UNHEALTHY_POLICY,
  });

  const nodeAllowlist = toStringAllowlist(options.nodeIdAllowlist);
  const scopedRows = nodeAllowlist.size > 0 ?
    filteredRows.filter((row) => nodeAllowlist.has(row.nodeId)) :
    filteredRows;

  const desiredByServiceId =
    buildDesiredReplicaCountByServiceId(options.definitionRows);
  const groupedRows = groupEndpointRows(scopedRows);
  const orderedKeys = [...groupedRows.keys()].sort((left, right) =>
    left.localeCompare(right));

  const catalog = [];
  for (const serviceKey of orderedKeys) {
    const group = groupedRows.get(serviceKey);
    const replicas = [...group.endpoints]
      .sort((left, right) => left.endpointId.localeCompare(right.endpointId))
      .map((endpointRow) => buildReplicaRecord(endpointRow));

    const serviceIds = [...new Set(replicas.map((replica) => replica.serviceId))]
      .sort((left, right) => left.localeCompare(right));
    const nodes = [...new Set(replicas.map((replica) => replica.nodeId))]
      .sort((left, right) => left.localeCompare(right));
    const observedReplicaCount = replicas.length;
    const healthyReplicaCount = replicas.filter((replica) =>
      replica.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY).length;
    const unhealthyReplicaCount = observedReplicaCount - healthyReplicaCount;
    const desiredReplicaCountByServiceId =
      buildDesiredReplicaCountMap(serviceIds, desiredByServiceId);

    catalog.push({
      serviceKey,
      logicalServiceName: group.logicalServiceName,
      protocol: group.protocol,
      serviceIds,
      desiredReplicaCount: resolveDesiredReplicaCount(serviceIds, desiredByServiceId),
      desiredReplicaCountByServiceId,
      observedReplicaCount,
      healthyReplicaCount,
      unhealthyReplicaCount,
      health: resolveDiscoveryHealth(observedReplicaCount, healthyReplicaCount),
      nodeCount: nodes.length,
      nodes,
      replicas,
    });
  }

  return catalog;
}

export {
  SERVICE_DISCOVERY_DEFAULT,
  SERVICE_DISCOVERY_HEALTH,
  toStringAllowlist,
  resolveDefinitionServiceId,
  resolveDefinitionReplicaCount,
  buildDesiredReplicaCountByServiceId,
  buildDesiredReplicaCountMap,
  resolveDesiredReplicaCount,
  resolveDiscoveryHealth,
  buildReplicaRecord,
  buildServiceDiscoveryCatalog,
};
