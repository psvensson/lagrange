/**
 * Scenario: diag-admin-discovery
 *
 * Collects per-node local service discovery snapshots for both:
 * 1) unscoped discovery:   service_discovery_local()
 * 2) table-scoped readiness: service_discovery_local('benchmark_events')
 *
 * The output is intended for diagnosis of discovery/admin readiness drift in
 * multi-node benchmark runs.
 */

import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const BENCHMARK_TABLE = 'benchmark_events';
const BENCHMARK_TABLE_DDL = [
  'CREATE TABLE IF NOT EXISTS benchmark_events (',
  '  event_id TEXT PRIMARY KEY,',
  '  payload BIGINT NOT NULL,',
  '  created_at BIGINT NOT NULL',
  ')',
].join(' ');
const DISCOVERY_SQL = 'SELECT * FROM service_discovery_local()';
const TABLE_DISCOVERY_SQL =
  'SELECT * FROM service_discovery_local(\'' + BENCHMARK_TABLE + '\')';
const POSTGRES_PROTOCOL = 'postgresql';
const POSTGRES_SERVICE_ID = 'sys-postgres-wire';
const TABLE_PARTITIONS_SQL =
  'SELECT partition_id, table_id, table_name, replica_count ' +
  'FROM partitions WHERE table_name = \'' + BENCHMARK_TABLE + '\'';
const SERVICE_ROWS_SQL_PREFIX =
  'SELECT service_id, node_id, status, raft_role, address ' +
  'FROM services WHERE partition_id = \'';
const SERVICE_ROWS_SQL_SUFFIX = '\'';
const NODE_ENDPOINTS_SQL =
  'SELECT endpoint_id, node_id, transport_type, address, status, updated_at ' +
  'FROM node_endpoints';
const SERVICE_ENDPOINTS_SQL =
  'SELECT endpoint_id, service_id, node_id, protocol, address, port, ' +
  'health_status, updated_at FROM service_endpoints';
const POSTGRES_SERVICE_ENDPOINTS_SQL =
  SERVICE_ENDPOINTS_SQL + ' WHERE service_id = \'' + POSTGRES_SERVICE_ID + '\'';
const POSTGRES_SERVICE_DEFINITION_SQL =
  'SELECT service_id, service_name, protocol, replica_count, status, updated_at ' +
  'FROM service_definitions WHERE service_id = \'' + POSTGRES_SERVICE_ID + '\'';
const ONE_SECOND_MS = 1000;
const QUERY_RETRY_TIMEOUT_MS = 60000;
const QUERY_RETRY_INTERVAL_MS = 250;

function rowsFromResult(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalizePartitionRows(rows) {
  return rows.map((row) => ({
    partitionId: row?.partition_id || row?.partitionId || null,
    tableId: row?.table_id || row?.tableId || null,
    tableName: row?.table_name || row?.tableName || null,
    replicaCount: Number.isInteger(row?.replica_count) ?
      row.replica_count :
      Number.isInteger(row?.replicaCount) ?
        row.replicaCount :
        null,
  }));
}

function normalizeServiceRows(rows) {
  return rows.map((row) => ({
    serviceId: row?.service_id || row?.serviceId || null,
    nodeId: row?.node_id || row?.nodeId || null,
    status: row?.status || null,
    raftRole: row?.raft_role || row?.raftRole || null,
    address: row?.address || null,
  }));
}

function normalizeNodeEndpointRows(rows) {
  return rows.map((row) => ({
    endpointId: row?.endpoint_id || row?.endpointId || null,
    nodeId: row?.node_id || row?.nodeId || null,
    transportType: row?.transport_type || row?.transportType || null,
    address: row?.address || null,
    status: row?.status || null,
    updatedAt: Number.isFinite(row?.updated_at) ? row.updated_at : null,
  }));
}

function normalizeServiceEndpointRows(rows) {
  return rows.map((row) => ({
    endpointId: row?.endpoint_id || row?.endpointId || null,
    serviceId: row?.service_id || row?.serviceId || null,
    nodeId: row?.node_id || row?.nodeId || null,
    protocol: row?.protocol || null,
    address: row?.address || null,
    port: Number.isInteger(row?.port) ? row.port : null,
    healthStatus: row?.health_status || row?.healthStatus || null,
    updatedAt: Number.isFinite(row?.updated_at) ? row.updated_at : null,
  }));
}

function normalizeServiceDefinitionRows(rows) {
  return rows.map((row) => ({
    serviceId: row?.service_id || row?.serviceId || null,
    serviceName: row?.service_name || row?.serviceName || null,
    protocol: row?.protocol || null,
    replicaCount: Number.isInteger(row?.replica_count) ?
      row.replica_count :
      Number.isInteger(row?.replicaCount) ?
        row.replicaCount :
        null,
    status: row?.status || null,
    updatedAt: Number.isFinite(row?.updated_at) ? row.updated_at : null,
  }));
}

function toUniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildPostgresWireSummary(snapshot) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  const postgresWireServices = services.filter((service) => {
    if (!service || typeof service !== 'object') {
      return false;
    }
    if (service.protocol !== POSTGRES_PROTOCOL) {
      return false;
    }
    const serviceIds = Array.isArray(service.serviceIds) ? service.serviceIds : [];
    return serviceIds.includes(POSTGRES_SERVICE_ID);
  });

  const replicas = [];
  for (const service of postgresWireServices) {
    const serviceReplicas = Array.isArray(service.replicas) ?
      service.replicas :
      [];
    for (const replica of serviceReplicas) {
      if (!replica || typeof replica !== 'object') {
        continue;
      }
      replicas.push(replica);
    }
  }

  const readyNodeIds = [];
  const notReadyByNodeId = {};
  for (const replica of replicas) {
    const nodeId = typeof replica.nodeId === 'string' ? replica.nodeId : null;
    if (!nodeId) {
      continue;
    }
    const readiness = replica.readiness && typeof replica.readiness === 'object' ?
      replica.readiness :
      null;
    const workloadReady = readiness?.workloadReady === true;
    const routingReady = readiness?.routingReady === true;
    const schemaReady = readiness?.schemaReady === true;
    if (workloadReady && routingReady && schemaReady) {
      readyNodeIds.push(nodeId);
      continue;
    }
    const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
    const summarizedReasons = reasons.map((reason) => {
      const code = typeof reason?.code === 'string' && reason.code.length > 0 ?
        reason.code :
        'unknown';
      const detail = typeof reason?.detail === 'string' && reason.detail.length > 0 ?
        reason.detail :
        null;
      return detail ? code + '=' + detail : code;
    });
    notReadyByNodeId[nodeId] = summarizedReasons;
  }

  return {
    serviceCount: services.length,
    postgresWireServiceCount: postgresWireServices.length,
    postgresWireReplicaCount: replicas.length,
    postgresWireReadyNodeIds: toUniqueSorted(readyNodeIds),
    postgresWireNotReadyByNodeId: notReadyByNodeId,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(node, sql, options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ?
    options.timeoutMs :
    QUERY_RETRY_TIMEOUT_MS;
  const intervalMs = Number.isInteger(options.intervalMs) && options.intervalMs > 0 ?
    options.intervalMs :
    QUERY_RETRY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await node.query(sql);
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }
  throw lastError || new Error('query_retry_timeout');
}

async function run(cluster) {
  const nodes = cluster.getNodes();
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  if (!seedNode) {
    throw new Error('No nodes available');
  }
  const quietWindowMs = Number.isFinite(cluster?._config?.convergence?.quietWindowMs) ?
    Number(cluster._config.convergence.quietWindowMs) :
    CONVERGENCE_DEFAULTS.quietWindowMs;

  try {
    await cluster.waitForConvergence({
      quietWindowMs,
      settleTimeoutMs: 120000,
      targetVoterCount: nodes.length,
    });
  } catch (_error) {
    // Continue with best-effort diagnostics even when convergence is unstable.
  }

  let ddlError = null;
  try {
    await queryWithRetry(
      seedNode,
      BENCHMARK_TABLE_DDL,
      {
        timeoutMs: 120 * ONE_SECOND_MS,
        intervalMs: QUERY_RETRY_INTERVAL_MS,
      },
    );
  } catch (error) {
    ddlError = String(error?.message || error);
  }

  const resultsByNodeId = {};
  for (const node of nodes) {
    const nodeResult = {
      role: node.role || 'unknown',
      unscoped: null,
      tableScoped: null,
      error: null,
    };
    try {
      const unscopedResult = await queryWithRetry(node, DISCOVERY_SQL);
      const unscopedRows = rowsFromResult(unscopedResult);
      const unscopedSnapshot = unscopedRows[0] || {};
      nodeResult.unscoped = {
        nodeId: unscopedSnapshot.nodeId || null,
        capturedAt: unscopedSnapshot.capturedAt || null,
        ...buildPostgresWireSummary(unscopedSnapshot),
      };

      if (ddlError) {
        nodeResult.tableScoped = {
          skipped: true,
          reason: 'ddl_failed',
          ddlError,
        };
      } else {
        const tableScopedResult = await queryWithRetry(node, TABLE_DISCOVERY_SQL);
        const tableScopedRows = rowsFromResult(tableScopedResult);
        const tableScopedSnapshot = tableScopedRows[0] || {};
        nodeResult.tableScoped = {
          nodeId: tableScopedSnapshot.nodeId || null,
          capturedAt: tableScopedSnapshot.capturedAt || null,
          ...buildPostgresWireSummary(tableScopedSnapshot),
        };
      }

      const tablePartitionRowsResult = await queryWithRetry(
        node,
        TABLE_PARTITIONS_SQL,
      );
      const tablePartitionRows = normalizePartitionRows(
        rowsFromResult(tablePartitionRowsResult),
      );
      const serviceRowsByPartitionId = {};
      for (const row of tablePartitionRows) {
        const partitionId = row.partitionId;
        if (!partitionId) {
          continue;
        }
        const serviceRowsResult = await queryWithRetry(
          node,
          SERVICE_ROWS_SQL_PREFIX + partitionId + SERVICE_ROWS_SQL_SUFFIX,
        );
        serviceRowsByPartitionId[partitionId] = normalizeServiceRows(
          rowsFromResult(serviceRowsResult),
        );
      }
      nodeResult.tableMetadata = {
        partitionRows: tablePartitionRows,
        serviceRowsByPartitionId,
      };

      const nodeEndpointsResult = await queryWithRetry(
        node,
        NODE_ENDPOINTS_SQL,
      );
      const nodeEndpointRows = normalizeNodeEndpointRows(
        rowsFromResult(nodeEndpointsResult),
      );

      const serviceEndpointsResult = await queryWithRetry(
        node,
        SERVICE_ENDPOINTS_SQL,
      );
      const serviceEndpointRows = normalizeServiceEndpointRows(
        rowsFromResult(serviceEndpointsResult),
      );

      const postgresServiceEndpointsResult = await queryWithRetry(
        node,
        POSTGRES_SERVICE_ENDPOINTS_SQL,
      );
      const postgresServiceEndpointRows = normalizeServiceEndpointRows(
        rowsFromResult(postgresServiceEndpointsResult),
      );

      const postgresServiceDefinitionResult = await queryWithRetry(
        node,
        POSTGRES_SERVICE_DEFINITION_SQL,
      );
      const postgresServiceDefinitionRows = normalizeServiceDefinitionRows(
        rowsFromResult(postgresServiceDefinitionResult),
      );

      nodeResult.endpointMetadata = {
        nodeEndpointCount: nodeEndpointRows.length,
        serviceEndpointCount: serviceEndpointRows.length,
        postgresServiceEndpointCount: postgresServiceEndpointRows.length,
        nodeEndpoints: nodeEndpointRows,
        postgresServiceEndpoints: postgresServiceEndpointRows,
        postgresServiceDefinitions: postgresServiceDefinitionRows,
      };
    } catch (error) {
      nodeResult.error = String(error?.message || error);
    }
    resultsByNodeId[node.id] = nodeResult;
  }

  return {
    nodeCount: nodes.length,
    benchmarkTable: BENCHMARK_TABLE,
    postgresServiceId: POSTGRES_SERVICE_ID,
    ddlError,
    resultsByNodeId,
  };
}

export {run};
