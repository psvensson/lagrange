/**
 * Integration test: strict versioned CDC readiness convergence barrier.
 *
 * Exercises 4-node benchmark readiness behavior for successful convergence
 * and lagging-node failure classification.
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
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const TABLE_NAME = 'benchmark_events';
const REQUIRED_SCHEMA_VERSION = '1740589945123:7:seed-1';
const LAGGING_SCHEMA_VERSION = '1740589945123:6:seed-1';
const NODE_IDS = ['seed-1', 'join-2', 'join-3', 'join-4'];

function buildControlSnapshotPayload(nodeId, overrides = {}) {
  const normalizedNodeId = String(nodeId);
  return {
    schemaVersion: 1,
    nodeId: normalizedNodeId,
    capturedAt: Date.now(),
    nodes: [...NODE_IDS],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
    },
    ...overrides,
  };
}

function buildServiceDiscoverySnapshot(nodeId, appliedSchemaByNodeId) {
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
          appliedSchemaVersion:
            appliedSchemaByNodeId[replicaNodeId] || REQUIRED_SCHEMA_VERSION,
        },
      })),
    }],
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

function createCluster(options = {}) {
  const join4LagPolls = Number.isInteger(options.join4LagPolls) &&
    options.join4LagPolls >= 0 ?
    options.join4LagPolls :
    ZERO;
  const quiescentTimeoutMs = Number.isInteger(options.quiescentTimeoutMs) &&
    options.quiescentTimeoutMs > 0 ?
    options.quiescentTimeoutMs :
    600;
  let discoveryPollCount = 0;

  function resolveAppliedSchemaByNodeId() {
    discoveryPollCount += 1;
    const join4AppliedVersion = discoveryPollCount > join4LagPolls ?
      REQUIRED_SCHEMA_VERSION :
      LAGGING_SCHEMA_VERSION;
    return {
      'seed-1': REQUIRED_SCHEMA_VERSION,
      'join-2': REQUIRED_SCHEMA_VERSION,
      'join-3': REQUIRED_SCHEMA_VERSION,
      'join-4': join4AppliedVersion,
    };
  }

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
          return {
            rows: [buildServiceDiscoverySnapshot(this.id, resolveAppliedSchemaByNodeId())],
          };
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
        quiescentTimeoutMs,
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

test('Versioned CDC readiness convergence integration', async (t) => {
  await t.test('four-node cluster converges required schema version before load', async (t) => {
    const result = await run(createCluster({
      join4LagPolls: 6,
      quiescentTimeoutMs: 800,
    }));

    t.equal(
      result.details.benchmark.sutLoadNodeCount,
      4,
      'strict run should gate load until all four nodes are admitted',
    );

    const versionConvergence =
      result.details.phaseArtifacts.pre_load_gate.versionConvergence;
    t.equal(
      Object.keys(versionConvergence.nodes || {}).length,
      4,
      'pre-load barrier should report version convergence for all four nodes',
    );

    const laggingNodes = Object.values(versionConvergence.nodes || {})
      .filter((node) => Array.isArray(node.unmetReasons) &&
        node.unmetReasons.length > ZERO);
    t.equal(
      laggingNodes.length,
      0,
      'all nodes should be converged at pre-load gate pass',
    );
  });

  await t.test('strict pre-load convergence after concurrent joins keeps non-null applied schema versions',
    async (t) => {
      const result = await run(createCluster({
        join4LagPolls: 4,
        quiescentTimeoutMs: 900,
      }));

      const convergence =
        result.details?.phaseArtifacts?.pre_load_gate?.versionConvergence;
      t.ok(convergence, 'pre-load gate should emit version convergence diagnostics');

      const nodeSummaries = convergence?.nodes || {};
      for (const nodeId of NODE_IDS) {
        const summary = nodeSummaries[nodeId];
        t.ok(summary, `${nodeId} should be present in convergence diagnostics`);
        t.ok(
          typeof summary?.observedSchemaVersion === 'string' &&
            summary.observedSchemaVersion.length > ZERO,
          `${nodeId} should report non-null observed schema version`,
        );
      }

      const strictFailure =
        result.details?.phaseArtifacts?.pre_load_gate?.strictFailure || null;
      t.notOk(
        strictFailure,
        'successful strict pre-load convergence should not emit assignment/convergence failure envelope',
      );
    });

  await t.test('four-node strict barrier classifies lagging node as schema_version_lag',
    async (t) => {
      const runError = await t.rejects(
        run(createCluster({
          join4LagPolls: Number.MAX_SAFE_INTEGER,
          quiescentTimeoutMs: 120,
        })),
        /strict_preload_readiness_failed.*schema_version_lag/i,
      );
      const laggingNodeSummary =
        runError?.diagnostics?.failure?.versionConvergence?.nodes?.['join-4'];
      t.ok(laggingNodeSummary, 'failure should include lagging node diagnostics');
      t.ok(
        Array.isArray(laggingNodeSummary.unmetReasons) &&
          laggingNodeSummary.unmetReasons.includes('schema_version_lag'),
        'lagging node should be classified with schema_version_lag',
      );
    });
});
