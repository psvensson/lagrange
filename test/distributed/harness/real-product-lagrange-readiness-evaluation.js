/**
 * The Lagrange cluster readiness decision, from the system tables the harness
 * already reads (nodes, service_endpoints, partitions, services) - never from
 * `/health`, whose `ready: true` only means a SQL engine object exists
 * (src/bootstrap/bootstrap-api-server-methods.js). Ready means every expected
 * node is an active member with a live ready lease (the product's own
 * isNodeRecordReady, src/node/node-readiness-policy.js) and connection_state
 * `ready`; every required service has a healthy endpoint row; and every
 * partition considered has an active leader replica on an expected node and
 * as many active replicas on distinct nodes as its replica count. Not ready is
 * a list of typed denial codes, the last of which an exhaustion carries.
 */
import {isNodeRecordReady} from '../../../src/node/node-readiness-policy.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringToLowerCase,
} from './real-product-captured-intrinsics.js';

const ACTIVE = 'active';
const HEALTHY = 'healthy';
const LEADER = 'leader';
const CONNECTION_READY = 'ready';
const DENIAL = Object.freeze({
  NODE_MISSING: 'node_missing',
  NODE_NOT_READY: 'node_ready_lease_or_status',
  NODE_CONNECTION: 'node_connection_not_ready',
  SERVICE_ENDPOINT: 'service_endpoint_unhealthy',
  NO_PARTITIONS: 'no_partitions',
  TABLE_WITHOUT_PARTITIONS: 'table_without_partitions',
  PARTITION_NOT_ROUTABLE: 'partition_not_routable',
  PARTITION_UNDER_REPLICATED: 'partition_under_replicated',
});

function text(value) {
  return stringToLowerCase(String(value ?? ''));
}

function nodeDenials(nodes, expectedNodeIds, now) {
  const denials = [];
  for (const nodeId of expectedNodeIds) {
    const row = arrayFind(nodes, (one) => one.node_id === nodeId);
    if (!row) {
      denials.push(`${DENIAL.NODE_MISSING}:${nodeId}`);
      continue;
    }
    const lease = {...row, ready_lease_expires_at: Number(row.ready_lease_expires_at)};
    if (!isNodeRecordReady(lease, {now, requireActiveStatus: true})) {
      denials.push(`${DENIAL.NODE_NOT_READY}:${nodeId}`);
    }
    if (text(row.connection_state) !== CONNECTION_READY) {
      denials.push(`${DENIAL.NODE_CONNECTION}:${nodeId}`);
    }
  }
  return denials;
}

function partitionDenials(partition, services, expectedNodeIds) {
  const replicas = arrayFilter(services, (row) => row.partition_id === partition.partition_id &&
    text(row.status) === ACTIVE && arrayIncludes(expectedNodeIds, row.node_id));
  const denials = [];
  if (!arraySome(replicas, (row) => text(row.raft_role) === LEADER)) {
    denials.push(`${DENIAL.PARTITION_NOT_ROUTABLE}:${partition.partition_id}`);
  }
  const target = Math.min(Number(partition.replica_count) || 1, expectedNodeIds.length);
  if (new Set(arrayMap(replicas, (row) => row.node_id)).size < target) {
    denials.push(`${DENIAL.PARTITION_UNDER_REPLICATED}:${partition.partition_id}`);
  }
  return denials;
}

/**
 * @param {{nodes: Array<Object>, endpoints: Array<Object>,
 *   partitions: Array<Object>, services: Array<Object>,
 *   expectedNodeIds: Array<string>, requiredServiceIds: Array<string>,
 *   requiredTables?: Array<string>|null, now: number}} input
 * @return {{ready: boolean, denials: Array<string>}}
 */
function evaluateLagrangeClusterReadiness({nodes, endpoints, partitions, services,
  expectedNodeIds, requiredServiceIds, requiredTables = null, now}) {
  const denials = nodeDenials(nodes, expectedNodeIds, now);
  for (const serviceId of requiredServiceIds) {
    if (!arraySome(endpoints, (row) => row.service_id === serviceId &&
        text(row.health_status) === HEALTHY)) {
      denials.push(`${DENIAL.SERVICE_ENDPOINT}:${serviceId}`);
    }
  }
  let considered = partitions;
  if (requiredTables) {
    considered = arrayFilter(partitions, (row) => arrayIncludes(requiredTables, row.table_name));
    for (const table of requiredTables) {
      if (!arraySome(considered, (row) => row.table_name === table)) {
        denials.push(`${DENIAL.TABLE_WITHOUT_PARTITIONS}:${table}`);
      }
    }
  } else if (partitions.length === 0) {
    denials.push(DENIAL.NO_PARTITIONS);
  }
  for (const partition of considered) {
    denials.push(...partitionDenials(partition, services, expectedNodeIds));
  }
  return {ready: denials.length === 0, denials};
}

export {DENIAL as LAGRANGE_READINESS_DENIAL, evaluateLagrangeClusterReadiness};
