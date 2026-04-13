/**
 * Integration test: benchmark system-table read path hardening.
 *
 * Focuses on benchmark scenario metadata lookup behavior when
 * seed-local system-table visibility is incomplete in a four-node topology.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {run} from '../distributed/scenarios/postgres-baseline-comparison.js';
import {NodeClient} from '../distributed/harness/node-client.js';
import {
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
} from '../distributed/harness/constants.js';

const ZERO = 0;
const READY = 'healthy';
const DEFAULT_PORT = 5432;
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const TABLE_NAME = 'benchmark_events';
const RAW_TABLE_LOOKUP_SQL =
  'SELECT * FROM tables WHERE table_name = \'' + TABLE_NAME + '\'';

function buildControlSnapshotPayload(nodeId, overrides = {}) {
  return {
    schemaVersion: 1,
    nodeId: String(nodeId),
    capturedAt: Date.now(),
    nodes: [String(nodeId)],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
    },
    ...overrides,
  };
}

function buildServiceDiscoverySnapshot(nodeId, allNodeIds) {
  const normalizedNodeIds = allNodeIds.map((id) => String(id));
  const nowMs = Date.now();
  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId: String(nodeId),
    capturedAt: nowMs,
    serviceCount: 1,
    replicaCount: normalizedNodeIds.length,
    services: [{
      serviceKey:
        NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
        '|' +
        NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
      desiredReplicaCount: normalizedNodeIds.length,
      desiredReplicaCountByServiceId: {
        [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: normalizedNodeIds.length,
      },
      observedReplicaCount: normalizedNodeIds.length,
      healthyReplicaCount: normalizedNodeIds.length,
      unhealthyReplicaCount: ZERO,
      health: READY,
      nodeCount: normalizedNodeIds.length,
      nodes: normalizedNodeIds,
      replicas: normalizedNodeIds.map((replicaNodeId) => ({
        endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + replicaNodeId,
        serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
        nodeId: replicaNodeId,
        address: '127.0.0.1',
        port: DEFAULT_PORT,
        healthStatus: READY,
        updatedAt: nowMs,
        metadata: {},
        readiness: {
          workloadReady: true,
          routingReady: true,
          schemaReady: true,
          replicaOpsInFlight: 0,
          leadershipStable: true,
          tableName: TABLE_NAME,
          reasons: [],
        },
      })),
    }],
  };
}

function buildNodeHandle(nodeId, role, allNodeIds, queryImpl) {
  return {
    id: String(nodeId),
    role,
    query: queryImpl,
    queryWithTimeout: async function(sql, params = [], _options = {}) {
      const statement = String(sql);
      if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
        return {
          rows: [buildControlSnapshotPayload(this.id, {
            nodes: allNodeIds.map((id) => String(id)),
            authoritativeActiveNodes: allNodeIds.map((id) => String(id)),
          })],
        };
      }
      if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
          statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
        return {
          rows: [buildServiceDiscoverySnapshot(this.id, allNodeIds)],
        };
      }
      return this.query(statement, params);
    },
    getReachabilityDiagnostics: async () => ({
      nodeId: String(nodeId),
      reachable: true,
      adminReady: true,
    }),
  };
}

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

function createLoadGeneratorFactory() {
  return (nodes) => {
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

function createBenchmarkCluster(options = {}) {
  const nodeIds = ['seed-1', 'join-2', 'join-3', 'join-4'];
  const seedMetadataError = Object.prototype.hasOwnProperty.call(
    options,
    'seedMetadataError',
  ) ?
    options.seedMetadataError :
    'table not found on local replica';
  const tableMetadataUpdatedAt = Number.isFinite(options.tableMetadataUpdatedAt) ?
    options.tableMetadataUpdatedAt :
    1740589945123;
  const seedNode = buildNodeHandle(
    'seed-1',
    'seed',
    nodeIds,
    async (sql) => {
      const statement = String(sql);
      if (statement === 'SELECT 1') {
        return {rows: [{value: 1}]};
      }
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (statement.includes('FROM tables WHERE table_name')) {
        if (seedMetadataError) {
          throw new Error(seedMetadataError);
        }
        return {
          rows: [{
            table_id: 'tbl-benchmark',
            updated_at: tableMetadataUpdatedAt,
          }],
        };
      }
      if (statement.includes('SELECT partition_id FROM partitions WHERE table_name')) {
        throw new Error(seedMetadataError);
      }
      if (statement.includes('SELECT partition_id FROM partitions WHERE table_id')) {
        throw new Error(seedMetadataError);
      }
      if (statement.startsWith('UPDATE partitions SET table_name')) {
        return {rows: [], changes: 1};
      }
      if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
        return {rows: [{count: 0}]};
      }
      if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
        return {rows: []};
      }
      return {rows: []};
    },
  );

  const joiningQuery = async (sql) => {
    const statement = String(sql);
    if (statement === 'SELECT 1') {
      return {rows: [{value: 1}]};
    }
    if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) {
      return {rows: []};
    }
    if (statement.includes('FROM tables WHERE table_name')) {
      return {
        rows: [{
          table_id: 'tbl-benchmark',
          updated_at: tableMetadataUpdatedAt,
        }],
      };
    }
    if (statement.includes('SELECT partition_id FROM partitions WHERE table_name')) {
      return {rows: [{partition_id: 'p1'}]};
    }
    if (statement.includes('SELECT partition_id FROM partitions WHERE table_id')) {
      return {rows: [{partition_id: 'p1'}]};
    }
    if (statement.startsWith('UPDATE partitions SET table_name')) {
      return {rows: [], changes: 1};
    }
    if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
      return {rows: [{count: 0}]};
    }
    if (statement.includes('FROM replica_operations') &&
        statement.includes('status NOT IN')) {
      return {rows: []};
    }
    return {rows: []};
  };

  const join2 = buildNodeHandle('join-2', 'joiner', nodeIds, joiningQuery);
  const join3 = buildNodeHandle('join-3', 'joiner', nodeIds, joiningQuery);
  const join4 = buildNodeHandle('join-4', 'joiner', nodeIds, joiningQuery);

  return {
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
        strictDiscovery: true,
        requiredSutLoadNodeCount: 4,
        strictParity: false,
        readyTimeoutMs: 120,
        readyPollIntervalMs: 5,
        quiescentTimeoutMs: 120,
        quiescentPollIntervalMs: 5,
        quiescentStableWindowMs: 0,
        ...(options.benchmarkOverrides || {}),
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
        createLoadGenerator: createLoadGeneratorFactory(),
      },
    },
    _providers: [createProviderStub()],
    _hostAssignment: [0],
    _networkName: 'test-net',
    getNodes: () => [seedNode, join2, join3, join4],
    waitForConvergence: async () => ({settledAfterMs: 1}),
    assertConsistency: async () => {},
  };
}

function extractMetadataVersionFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === ZERO) {
    return null;
  }
  const candidate = rows[ZERO];
  if (typeof candidate?.updated_at === 'number' &&
      Number.isFinite(candidate.updated_at)) {
    return String(candidate.updated_at);
  }
  if (typeof candidate?.updated_at === 'string' &&
      candidate.updated_at.length > ZERO) {
    return candidate.updated_at;
  }
  return null;
}

test('benchmark metadata reads fall back to non-seed nodes in four-node topology',
  async (t) => {
    const cluster = createBenchmarkCluster();
    const result = await run(cluster);
    t.ok(result?.loadMetrics, 'scenario should complete with load metrics');
    t.equal(
      result.details.benchmark.sutLoadNodeCount >= 4,
      true,
      'scenario should keep four load-capable SUT nodes',
    );
  });

test('explicit local-only shortcut flag is ignored in canonical benchmark mode',
  async (t) => {
    const cluster = createBenchmarkCluster({
      benchmarkOverrides: {
        forceLocalSystemTableReadShortcut: true,
      },
    });
    const result = await run(cluster);
    t.ok(result?.loadMetrics, 'scenario should complete even with shortcut flag');
    t.equal(
      result.details?.benchmark?.systemTableReadPath?.mode,
      'canonical_fallback',
      'benchmark mode should force canonical metadata fallback path',
    );
  });

test('raw per-node table metadata converges on one updated_at watermark',
  async (t) => {
    const expectedVersion = 1740589945999;
    const cluster = createBenchmarkCluster({
      seedMetadataError: null,
      tableMetadataUpdatedAt: expectedVersion,
    });
    const nodeClient = new NodeClient();
    const versionsByNodeId = {};
    const nodes = cluster.getNodes();
    const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];

    await nodeClient.queryControl(
      seedNode,
      'CREATE TABLE IF NOT EXISTS benchmark_events (event_id TEXT PRIMARY KEY)',
      [],
      {[NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true},
    );

    for (const node of nodes) {
      const result = await nodeClient.queryControl(
        node,
        RAW_TABLE_LOOKUP_SQL,
        [],
        {[NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true},
      );
      versionsByNodeId[node.id] = extractMetadataVersionFromRows(result?.rows);
    }

    const distinctVersions = [...new Set(Object.values(versionsByNodeId))];
    t.same(
      distinctVersions,
      [String(expectedVersion)],
      'all nodes should expose the same table updated_at watermark',
    );
  });
