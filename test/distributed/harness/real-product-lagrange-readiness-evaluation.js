/**
 * The Lagrange cluster readiness decision, from the system tables the harness
 * already reads (nodes, service_endpoints, partitions, services) - never from
 * `/health`, whose `ready: true` only means a SQL engine object exists
 * (src/bootstrap/bootstrap-api-server-methods.js). Ready means every expected
 * node is an active member with a live ready lease (the product's own
 * isNodeRecordReady, src/node/node-readiness-policy.js) and connection_state
 * `ready`; every required service has a healthy endpoint row; and every
 * partition considered has an active leader replica on an expected node and
 * as many active replicas on distinct nodes as its replica count, including
 * the six priority control-plane partitions; and, from every node's control
 * snapshot (GET /api/admin/control-snapshot,
 * src/admin/admin-control-snapshot-local-build-base.js), the serve lane is
 * open (controlPlaneDiagnostics.readinessByNodeId[node].serveEligible with no
 * reason codes) and no replica operation is in flight. Not ready is a list of
 * typed denial codes, the last of which an exhaustion carries.
 * (Predicate: product-blocker-first-divergence-2026-11-01.md section 5.)
 */
import {DEFAULT_READY_LEASE_MS} from '../../../src/control-plane/control-plane-constants.js';
import {
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../../../src/node/node-readiness-policy.js';
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
// The priority control-plane partitions whose spread gates the serve lane.
const PRIORITY_PARTITION_IDS = Object.freeze(['control_plane_publications-p1',
  'replica_operations-p1', 'schema_operations-p1', 'sql_transaction_participants-p1',
  'sql_transactions-p1', 'sql_write_operations-p1']);
const DENIAL = Object.freeze({
  PRIORITY_PARTITION_MISSING: 'priority_partition_missing',
  PARTITION_WITHOUT_LEADER_ROW: 'partition_without_leader_row',
  CONTROL_SNAPSHOT_UNAVAILABLE: 'control_snapshot_unavailable',
  SERVE_NOT_ELIGIBLE: 'serve_not_eligible',
  SERVE_DENIED: 'serve_denied',
  REPLICA_OPERATIONS_IN_FLIGHT: 'replica_operations_in_flight',
  NODE_MISSING: 'node_missing',
  NODE_NOT_READY: 'node_ready_lease_or_status',
  NODE_CONNECTION: 'node_connection_not_ready',
  NODE_HEARTBEAT_STALE: 'node_heartbeat_stale',
  SERVICE_ENDPOINT: 'service_endpoint_unhealthy',
  NO_PARTITIONS: 'no_partitions',
  TABLE_WITHOUT_PARTITIONS: 'table_without_partitions',
  PARTITION_NOT_ROUTABLE: 'partition_not_routable',
  PARTITION_UNDER_REPLICATED: 'partition_under_replicated',
  PARTITION_REPLICA_COUNT_UNREADABLE: 'partition_replica_count_unreadable',
});
const numberIsSafeInteger = Number.isSafeInteger;
const DECIMAL_COUNT = /^[1-9][0-9]*$/u;
const regExpTest = Function.call.bind(RegExp.prototype.test);

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
    // The heartbeat the lease was written on, no older than the product's own
    // ready-lease duration (src/control-plane/control-plane-constants.js).
    const heartbeatAt = Number(row.last_heartbeat);
    if (!wasNodeRecordReadyWhenWritten({...lease, last_heartbeat: heartbeatAt},
      {now, requireActiveStatus: true}) || !Number.isFinite(heartbeatAt) ||
        now - heartbeatAt > DEFAULT_READY_LEASE_MS) {
      denials.push(`${DENIAL.NODE_HEARTBEAT_STALE}:${nodeId}`);
    }
    if (text(row.connection_state) !== CONNECTION_READY) {
      denials.push(`${DENIAL.NODE_CONNECTION}:${nodeId}`);
    }
  }
  return denials;
}

// The partition's own replication target: a positive decimal integer as the
// system table reports it, or null when it is absent or unreadable. Neither a
// missing count nor the cluster size ever lowers the target.
function replicaCountOf(partition) {
  const raw = partition.replica_count;
  if ((typeof raw !== 'string' && typeof raw !== 'number') ||
      !regExpTest(DECIMAL_COUNT, String(raw))) return null;
  const count = Number(raw);
  return numberIsSafeInteger(count) ? count : null;
}

function partitionDenials(partition, services, expectedNodeIds) {
  const replicas = arrayFilter(services, (row) => row.partition_id === partition.partition_id &&
    text(row.status) === ACTIVE && arrayIncludes(expectedNodeIds, row.node_id));
  const denials = [];
  if (!arraySome(replicas, (row) => text(row.raft_role) === LEADER)) {
    denials.push(`${DENIAL.PARTITION_NOT_ROUTABLE}:${partition.partition_id}`);
  }
  const target = replicaCountOf(partition);
  if (target === null) {
    denials.push(`${DENIAL.PARTITION_REPLICA_COUNT_UNREADABLE}:${partition.partition_id}`);
  } else if (new Set(arrayMap(replicas, (row) => row.node_id)).size < target) {
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
  const denials = [...nodeDenials(nodes, expectedNodeIds, now),
    ...serviceEndpointDenials(endpoints, requiredServiceIds)];
  const scope = partitionScopeOf(partitions, requiredTables);
  denials.push(...scope.denials);
  for (const partition of scope.considered) {
    if (requiredTables && !partition.leader_node_id) {
      denials.push(`${DENIAL.PARTITION_WITHOUT_LEADER_ROW}:${partition.partition_id}`);
    }
    denials.push(...partitionDenials(partition, services, expectedNodeIds));
  }
  return {ready: denials.length === 0, denials};
}

// Every required service has a healthy endpoint row.
function serviceEndpointDenials(endpoints, requiredServiceIds) {
  return arrayMap(arrayFilter(requiredServiceIds, (serviceId) => !arraySome(endpoints,
    (row) => row.service_id === serviceId && text(row.health_status) === HEALTHY)),
  (serviceId) => `${DENIAL.SERVICE_ENDPOINT}:${serviceId}`);
}

// The partitions the verdict considers: the required tables' partitions (each
// required table must have one), or, for the system tables, every partition
// with the priority partitions present.
function partitionScopeOf(partitions, requiredTables) {
  if (requiredTables) {
    const considered = arrayFilter(partitions,
      (row) => arrayIncludes(requiredTables, row.table_name));
    return {considered, denials: arrayMap(arrayFilter(requiredTables, (table) =>
      !arraySome(considered, (row) => row.table_name === table)),
    (table) => `${DENIAL.TABLE_WITHOUT_PARTITIONS}:${table}`)};
  }
  const denials = partitions.length === 0 ? [DENIAL.NO_PARTITIONS] : [];
  for (const partitionId of PRIORITY_PARTITION_IDS) {
    if (!arraySome(partitions, (row) => row.partition_id === partitionId)) {
      denials.push(`${DENIAL.PRIORITY_PARTITION_MISSING}:${partitionId}`);
    }
  }
  return {considered: partitions, denials};
}

/**
 * The serve lane and the replica-operation ledger from every node's control
 * snapshot.
 * @param {{snapshots: Array<{nodeId: string, snapshot: Object|null}>}} input
 * @return {{ready: boolean, denials: Array<string>}}
 */
function evaluateLagrangeServeLane({snapshots}) {
  const denials = [];
  for (const {nodeId, snapshot} of snapshots) {
    denials.push(...(snapshot ? nodeServeDenials(nodeId, snapshot) :
      [`${DENIAL.CONTROL_SNAPSHOT_UNAVAILABLE}:${nodeId}`]));
  }
  return {ready: denials.length === 0, denials};
}

// One node's own serve verdict from its control snapshot: serve-eligible with
// no denial reason, and no replica operation in flight (an unreadable count is
// a denial naming `unknown`).
function nodeServeDenials(nodeId, snapshot) {
  const denials = [];
  const readiness = snapshot.controlPlaneDiagnostics?.readinessByNodeId?.[nodeId];
  if (readiness?.serveEligible !== true) {
    denials.push(`${DENIAL.SERVE_NOT_ELIGIBLE}:${nodeId}`);
  }
  for (const code of Array.isArray(readiness?.reasonCodes) ? readiness.reasonCodes : []) {
    denials.push(`${DENIAL.SERVE_DENIED}:${nodeId}:${code}`);
  }
  const inFlight = Number(snapshot.replicaOperations?.inFlightCount);
  if (!Number.isInteger(inFlight) || inFlight !== 0) {
    denials.push(`${DENIAL.REPLICA_OPERATIONS_IN_FLIGHT}:${nodeId}:` +
      `${Number.isInteger(inFlight) ? inFlight : 'unknown'}`);
  }
  return denials;
}

export {
  DENIAL as LAGRANGE_READINESS_DENIAL,
  PRIORITY_PARTITION_IDS as LAGRANGE_PRIORITY_PARTITION_IDS,
  evaluateLagrangeClusterReadiness,
  evaluateLagrangeServeLane,
};
