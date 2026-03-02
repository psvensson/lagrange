import {AdminWebSocketAPI} from '../../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {TABLES} from '../../../src/constants/index.js';

const DEFAULT_TABLE_NAME = 'benchmark_events';
const DEFAULT_TABLE_ID = 'table-benchmark-events';
const DEFAULT_PARTITION_ID = 'partition-benchmark-events-1';
const DEFAULT_SERVICE_ID = 'sys-postgres-wire';
const DEFAULT_PROTOCOL = 'postgresql';
const DEFAULT_UPDATED_AT = 1740589945123;
const ZERO = 0;

function createMockQueryEngine() {
  return {
    executeRequest: async () => ({
      success: true,
      rows: [],
      count: 0,
      partitions: [DEFAULT_PARTITION_ID],
      tableName: DEFAULT_TABLE_NAME,
    }),
  };
}

function buildReplicaReadiness({
  tableName = DEFAULT_TABLE_NAME,
  ready = true,
  reasons = [],
  appliedSchemaVersion = DEFAULT_UPDATED_AT,
} = {}) {
  return {
    workloadReady: ready,
    benchmarkReady: ready,
    routingReady: true,
    schemaReady: true,
    topologyReady: ready,
    replicaOpsInFlight: 0,
    leadershipStable: true,
    tableName,
    appliedSchemaVersion,
    reasons: Array.isArray(reasons) ? reasons.map((reason) => ({...reason})) : [],
  };
}

function seedNode(cache, node) {
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: node.id,
    address: node.address,
    status: 'active',
  });
}

function seedServiceEndpoint(cache, node, updatedAt) {
  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: `${DEFAULT_SERVICE_ID}-ep-${node.id}`,
    service_id: DEFAULT_SERVICE_ID,
    node_id: node.id,
    protocol: DEFAULT_PROTOCOL,
    address: node.endpointAddress,
    port: node.port,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: DEFAULT_SERVICE_ID,
      protocol: DEFAULT_PROTOCOL,
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });
}

function seedPartitionReplica(cache, node, role, options = {}) {
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: `service-benchmark-events-${node.id}`,
    service_id: `service-benchmark-events-${node.id}`,
    service_type: 'partition',
    partition_id: DEFAULT_PARTITION_ID,
    node_id: node.id,
    status: 'active',
    raft_role: role,
    address: `${node.endpointAddress}:7001`,
    updated_at: options.updatedAt || DEFAULT_UPDATED_AT,
  });
}

export function createBenchmarkDiscoveryCache(options = {}) {
  const cache = new SystemTableCache();
  const updatedAt = Number.isFinite(options.updatedAt) ?
    options.updatedAt :
    DEFAULT_UPDATED_AT;
  const nodes = Array.isArray(options.nodes) && options.nodes.length > ZERO ?
    options.nodes :
    [
      {
        id: 'node-1',
        address: 'localhost:8080',
        endpointAddress: '10.0.0.1',
        port: 5432,
      },
      {
        id: 'node-2',
        address: 'localhost:8081',
        endpointAddress: '10.0.0.2',
        port: 5432,
      },
    ];
  const leaderNodeId = typeof options.leaderNodeId === 'string' ?
    options.leaderNodeId :
    nodes[ZERO].id;
  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
    options.tableName :
    DEFAULT_TABLE_NAME;
  const tableId = typeof options.tableId === 'string' &&
    options.tableId.length > ZERO ?
    options.tableId :
    DEFAULT_TABLE_ID;
  const partitionId = typeof options.partitionId === 'string' &&
    options.partitionId.length > ZERO ?
    options.partitionId :
    DEFAULT_PARTITION_ID;

  for (const node of nodes) {
    seedNode(cache, node);
  }

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: DEFAULT_SERVICE_ID,
    service_name: DEFAULT_SERVICE_ID,
    replica_count: nodes.length,
    runtime_kind: 'native_js',
  });

  for (const node of nodes) {
    seedServiceEndpoint(cache, node, updatedAt);
  }

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    id: tableId,
    table_id: tableId,
    name: tableName,
    table_name: tableName,
    updated_at: updatedAt,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: partitionId,
    partition_id: partitionId,
    table_id: tableId,
    table_name: tableName,
    leader_node_id: leaderNodeId,
    keyStart: null,
    keyEnd: null,
    updated_at: updatedAt,
  });

  for (const node of nodes) {
    seedPartitionReplica(
      cache,
      node,
      node.id === leaderNodeId ? 'leader' : 'follower',
      {updatedAt},
    );
  }

  const replicaOperations = Array.isArray(options.replicaOperations) ?
    options.replicaOperations :
    [];
  for (const row of replicaOperations) {
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      updated_at: updatedAt,
      ...row,
    });
  }

  return {
    cache,
    nodes,
    tableName,
    tableId,
    partitionId,
  };
}

export async function createBenchmarkDiscoveryApi(options = {}) {
  const fixture = createBenchmarkDiscoveryCache(options);
  const api = new AdminWebSocketAPI({
    nodeId: typeof options.nodeId === 'string' ? options.nodeId : fixture.nodes[ZERO].id,
    systemTableCache: fixture.cache,
    sqlQueryEngine: createMockQueryEngine(),
    partitionServices: new Map([
      [fixture.partitionId, {
        partitionId: fixture.partitionId,
        getCDCSubscriptionDiagnostics() {
          return options.cdcDiagnostics || {
            subscriberCount: 1,
            bufferedEvents: 0,
            bufferReplayInFlight: false,
          };
        },
      }],
    ]),
  });
  await api.initialize(0, {listen: false});
  return {
    api,
    ...fixture,
  };
}

export function findReplica(snapshot, nodeId) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  for (const service of services) {
    const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
    for (const replica of replicas) {
      if (String(replica?.nodeId || '') === nodeId) {
        return replica;
      }
    }
  }
  return null;
}

export {buildReplicaReadiness};
