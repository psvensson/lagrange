/**
 * Integration test: user-table discovery must not depend on system-table CDC subscribers.
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

function createMockQueryEngine() {
  return {
    executeRequest: async () => ({
      success: true,
      rows: [],
      count: 0,
      partitions: ['partition-1'],
      tableName: 'benchmark_events',
    }),
  };
}

function createDiscoveryCache() {
  const cache = new SystemTableCache();
  const updatedAt = Date.now();

  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: 'node-1',
    address: 'localhost:8080',
    status: 'active',
  });
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: 'node-2',
    address: 'localhost:8081',
    status: 'active',
  });

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 2,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });
  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-2',
    service_id: 'sys-postgres-wire',
    node_id: 'node-2',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    id: 'table-benchmark-events',
    table_id: 'table-benchmark-events',
    name: 'benchmark_events',
    table_name: 'benchmark_events',
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    table_name: 'benchmark_events',
    leader_node_id: 'node-1',
    keyStart: null,
    keyEnd: null,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-2',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-2',
    status: 'active',
    raft_role: 'follower',
    address: '10.0.0.2:7001',
  });

  return cache;
}

function findReplicaReadiness(snapshot, nodeId) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  for (const service of services) {
    const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
    for (const replica of replicas) {
      if (String(replica?.nodeId || '') === nodeId) {
        return replica?.readiness || null;
      }
    }
  }
  return null;
}

test('User-table local CDC readiness integration', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'node-2',
    systemTableCache: createDiscoveryCache(),
    sqlQueryEngine: createMockQueryEngine(),
    partitionServices: new Map([
      ['partition-benchmark-events-1', {
        partitionId: 'partition-benchmark-events-1',
        getCDCSubscriptionDiagnostics() {
          return {
            subscriberCount: 0,
            bufferedEvents: 0,
            bufferReplayInFlight: false,
          };
        },
      }],
    ]),
  });

  await api.initialize(0, {listen: false});
  const snapshot = await api.resolveServiceDiscoverySnapshot({
    tableName: 'benchmark_events',
  });
  const readiness = findReplicaReadiness(snapshot, 'node-2');

  t.equal(readiness?.topologyReady, true);
  t.equal(readiness?.benchmarkReady, true);
  t.equal(
    readiness?.reasons?.some((reason) =>
      String(reason?.code || '') === 'local_cdc_subscriber_missing'),
    false,
  );

  await api.shutdown();
});
