/**
 * Integration test: strict load-lane benchmark table probe admission.
 *
 * Reproduces the case where a node answers a generic load-lane ping but still
 * cannot serve the benchmark table over the load lane.
 */

import {test} from '../../src/test-helpers/tap.js';
import {run} from '../distributed/scenarios/postgres-baseline-comparison.js';
import {
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
} from '../distributed/harness/constants.js';

const ZERO = 0;
const TABLE_NAME = 'benchmark_events';
const TABLE_PROBE_SQL = `SELECT count(*) FROM ${TABLE_NAME} WHERE 1 = 0`;
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';

function createProviderStub() {
  return {
    createContainer: async () => ({
      containerId: 'benchmark-postgres-1',
      ip: '172.18.0.80',
      name: 'benchmark-postgres-1',
    }),
    execInContainer: async (_containerId, cmd) => {
      const command = String(cmd[2] || '');
      if (command.includes('pg_isready')) {
        return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
      }
      if (command.includes('pg_stat_replication')) {
        return {exitCode: 0, stdout: '0\n', stderr: ''};
      }
      return {exitCode: 0, stdout: '', stderr: ''};
    },
    stopContainer: async () => {},
    removeContainer: async () => {},
  };
}

function createLoadGeneratorFactory(loadCalls) {
  return (nodes) => {
    loadCalls.push(nodes.map((node) => node.id));
    const isBaselineLoad =
      String(nodes?.[0]?.id || '').startsWith('postgres-baseline-load-node-');
    return {
      start: () => ({
        waitComplete: async () => (
          isBaselineLoad ?
            {
              total: 100,
              success: 100,
              failed: 0,
              errors: 0,
              opsPerSec: 100,
              latency: {avg: 1, p50: 1, p95: 2, p99: 2},
            } :
            {
              total: 100,
              success: 100,
              failed: 0,
              errors: 0,
              opsPerSec: 50,
              latency: {avg: 4, p50: 3, p95: 6, p99: 7},
            }
        ),
      }),
    };
  };
}

function buildDiscoverySnapshot(nodeId) {
  const nowMs = Date.now();
  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId: String(nodeId),
    capturedAt: nowMs,
    serviceCount: 1,
    replicaCount: 2,
    services: [{
      serviceKey:
        NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
        '|' +
        NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
      desiredReplicaCount: 2,
      desiredReplicaCountByServiceId: {
        [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 2,
      },
      observedReplicaCount: 2,
      healthyReplicaCount: 2,
      unhealthyReplicaCount: ZERO,
      health: 'healthy',
      nodeCount: 2,
      nodes: ['seed-1', 'joiner-1'],
      replicas: ['seed-1', 'joiner-1'].map((replicaNodeId) => ({
        endpointId: `${NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE}-ep-${replicaNodeId}`,
        serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
        nodeId: replicaNodeId,
        address: '127.0.0.1',
        port: 5432,
        healthStatus: 'healthy',
        updatedAt: nowMs,
        metadata: {},
        readiness: {
          workloadReady: true,
          benchmarkReady: true,
          routingReady: true,
          schemaReady: true,
          topologyReady: true,
          replicaOpsInFlight: 0,
          leadershipStable: true,
          tableName: TABLE_NAME,
          reasons: [],
        },
      })),
    }],
  };
}

function buildControlSnapshotPayload(nodeId) {
  return {
    schemaVersion: 1,
    nodeId: String(nodeId),
    capturedAt: Date.now(),
    nodes: ['seed-1', 'joiner-1'],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
    },
  };
}

function createNode(nodeId, role, options = {}) {
  return {
    id: nodeId,
    role,
    query: async (sql) => {
      const statement = String(sql);
      if (statement === 'SELECT 1') {
        return {rows: [{value: 1}]};
      }
      if (statement === TABLE_PROBE_SQL) {
        return {rows: [{count: 0}]};
      }
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (statement.includes('FROM tables')) {
        return {
          rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}],
        };
      }
      if (statement.startsWith('UPDATE partitions SET table_name')) {
        return {rows: [], changes: 1};
      }
      if (statement.includes('FROM partitions')) {
        return {rows: [{partition_id: 'p1'}]};
      }
      if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
        return {rows: []};
      }
      return {rows: []};
    },
    queryWithTimeout: async function(sql, params = [], queryOptions = {}) {
      const statement = String(sql);
      if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
        return {rows: [buildControlSnapshotPayload(this.id)]};
      }
      if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
          statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
        return {rows: [buildDiscoverySnapshot(this.id)]};
      }
      if (queryOptions?.lane === 'load' &&
          statement === TABLE_PROBE_SQL &&
          options.failBenchmarkTableProbe === true) {
        throw new Error('benchmark table probe timed out');
      }
      return this.query(statement, params);
    },
    getReachabilityDiagnostics: async () => ({
      nodeId: nodeId,
      reachable: true,
      adminReady: true,
      reachableBy: 'admin_health',
    }),
  };
}

test('Strict load-lane benchmark table probe integration', async (t) => {
  const loadCalls = [];
  const cluster = {
    _config: {
      benchmark: {
        baselineImage: 'postgres:16',
        durationSeconds: 5,
        clients: 2,
        jobs: 1,
        loadOpsPerSec: 40,
        loadDuration: '5s',
        loadMaxInFlight: 64,
        tableName: TABLE_NAME,
        replicationFactor: 1,
        syncReplicaAcks: 0,
        readyTimeoutMs: 120,
        readyPollIntervalMs: 5,
        quiescentTimeoutMs: 100,
        quiescentPollIntervalMs: 5,
        quiescentStableWindowMs: 0,
      },
      convergence: {
        settleTimeoutMs: 1000,
        quietWindowMs: 100,
        targetVoterCount: 3,
      },
      resourceLimits: {
        memory: '1g',
        cpus: '1.0',
      },
      timeouts: {
        nodeStartup: 1000,
      },
    },
    _scenarioOverrides: {
      postgresBaselineComparison: {
        createPostgresPool: () => ({
          query: async () => ({rows: []}),
          end: async () => {},
        }),
        createLoadGenerator: createLoadGeneratorFactory(loadCalls),
      },
    },
    _providers: [createProviderStub()],
    _hostAssignment: [0],
    _networkName: 'test-net',
    getNodes: () => [
      createNode('seed-1', 'seed'),
      createNode('joiner-1', 'joiner', {failBenchmarkTableProbe: true}),
    ],
    waitForConvergence: async () => ({settledAfterMs: 1}),
    assertConsistency: async () => {},
  };

  const result = await run(cluster);

  t.same(
    loadCalls[0],
    ['seed-1'],
    'benchmark load should exclude nodes that fail the benchmark table probe',
  );
  t.match(
    JSON.stringify(result.details.benchmark.sutLoadDiscovery),
    /load_probe/i,
    'discovery diagnostics should record the benchmark-table load-lane probe failure',
  );
});
