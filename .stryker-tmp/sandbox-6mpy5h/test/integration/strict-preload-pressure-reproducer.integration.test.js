/**
 * Integration test: strict preload failure reproducer under control-plane pressure.
 *
 * This test induces snapshot/query timeout pressure after initial discovery and
 * validates strict preload failure classification plus saturation counters.
 */
// @ts-nocheck


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
const REQUIRED_SCHEMA_VERSION = '1740589945123:7:seed-1';
const NODE_IDS = ['seed-1', 'join-2', 'join-3', 'join-4'];
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

function buildControlSnapshotPayload(nodeId) {
  return {
    schemaVersion: 1,
    nodeId: String(nodeId),
    capturedAt: Date.now(),
    nodes: [...NODE_IDS],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
    },
  };
}

function buildServiceDiscoverySnapshot(nodeId) {
  const capturedAt = Date.now();
  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId: String(nodeId),
    capturedAt,
    serviceCount: 1,
    replicaCount: NODE_IDS.length,
    services: [{
      serviceKey:
        NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
        '|' +
        NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
      serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
      nodes: [...NODE_IDS],
      replicas: NODE_IDS.map((replicaNodeId) => ({
        endpointId: 'sys-postgres-wire-ep-' + replicaNodeId,
        serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
        nodeId: replicaNodeId,
        address: '127.0.0.1',
        port: 5432,
        healthStatus: 'healthy',
        updatedAt: capturedAt,
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
          appliedSchemaVersion: REQUIRED_SCHEMA_VERSION,
        },
      })),
    }],
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

function createPressureCluster(options = {}) {
  const quietModeEnabled = options.quietModeEnabled === true;
  let preflightAdmitted = false;

  function createNodeHandle(nodeId, role) {
    return {
      id: nodeId,
      role,
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
          if (!preflightAdmitted) {
            preflightAdmitted = true;
          }
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return {
            rows: [{
              table_id: 'tbl-benchmark',
              schema_version: REQUIRED_SCHEMA_VERSION,
              updated_at: Number.parseInt(REQUIRED_SCHEMA_VERSION.split(':')[0], 10),
            }],
          };
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
      queryWithTimeout: async function(sql, params = [], _options = {}) {
        const statement = String(sql);
        if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          return {
            rows: [buildControlSnapshotPayload(this.id)],
          };
        }
        if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
          if (!preflightAdmitted) {
            return {
              rows: [buildServiceDiscoverySnapshot(this.id)],
            };
          }
          if (quietModeEnabled) {
            return {
              rows: [buildServiceDiscoverySnapshot(this.id)],
            };
          }
          if (this.id === 'seed-1' || this.id === 'join-3') {
            throw new Error(
              'CDC forward to leader failed: Message timeout while forwarding event',
            );
          }
          throw new Error(
            'system table query timeout while collecting service discovery snapshot',
          );
        }
        return this.query(statement, params);
      },
      getReachabilityDiagnostics: async function() {
        return {
          nodeId: this.id,
          reachable: true,
          adminReady: true,
        };
      },
    };
  }

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
        strictPreloadReadiness: true,
        quietModeEnabled,
        quiescentTimeoutMs: 140,
        quiescentPollIntervalMs: 5,
        quiescentStableWindowMs: 0,
      },
      nodeClient: {
        channelPolicies: {
          snapshot: {
            retryBudget: 0,
            circuitBreakerThreshold: 9999,
          },
        },
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
    getNodes: () => [
      createNodeHandle('seed-1', 'seed'),
      createNodeHandle('join-2', 'joiner'),
      createNodeHandle('join-3', 'joiner'),
      createNodeHandle('join-4', 'joiner'),
    ],
    waitForConvergence: async () => ({settledAfterMs: 1}),
    assertConsistency: async () => {},
  };
}

test('strict preload failure under pressure emits reason pattern and saturation',
  async (t) => {
    const runError = await t.rejects(
      run(createPressureCluster({quietModeEnabled: false})),
      /strict_preload_readiness_failed/i,
    );

    const failure = runError?.diagnostics?.failure || {};
    t.equal(
      failure.phase,
      'pre_load_gate',
      'failure should classify pre-load gate phase',
    );
    t.ok(
      Number(failure?.reasonCounts?.schema_version_unknown || ZERO) > ZERO,
      'failure reasons should include schema_version_unknown',
    );
    t.ok(
      Number(failure?.reasonCounts?.routing_not_ready || ZERO) > ZERO,
      'failure reasons should include routing_not_ready',
    );
    t.ok(
      Number(failure?.saturation?.cdcForwardTimeoutCount || ZERO) > ZERO,
      'saturation should record CDC forward/message timeout pressure',
    );
    t.ok(
      Number(failure?.saturation?.systemTableQueryTimeoutCount || ZERO) > ZERO,
      'saturation should record system-table query timeout pressure',
    );
    t.ok(
      Number(failure?.saturation?.snapshotCollectionErrorCount || ZERO) > ZERO,
      'saturation should record snapshot collection errors',
    );
  });

test('strict preload recovery admits full fanout when quiet mode is enabled',
  async (t) => {
    const result = await run(createPressureCluster({quietModeEnabled: true}));
    const benchmark = result?.details?.benchmark || {};
    const preLoadGate = result?.details?.phaseArtifacts?.pre_load_gate || {};
    const admittedNodeIds = Array.isArray(preLoadGate.includedNodeIds) ?
      preLoadGate.includedNodeIds :
      [];

    t.equal(
      benchmark.quietMode?.enabled,
      true,
      'quiet mode should be enabled for recovery run',
    );
    t.equal(
      benchmark.sutLoadNodeCount,
      NODE_IDS.length,
      'strict preload should admit full required fanout before load',
    );
    t.equal(
      admittedNodeIds.length,
      NODE_IDS.length,
      'pre-load gate should include all required nodes',
    );
    t.same(
      [...admittedNodeIds].sort(),
      [...NODE_IDS].sort(),
      'pre-load gate should admit the full node-id set',
    );
  });
