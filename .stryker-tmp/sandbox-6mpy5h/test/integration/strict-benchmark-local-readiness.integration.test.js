/**
 * Integration test: strict benchmark local readiness failure classification.
 *
 * Reproduces the two preflight blockers seen in strict 7-node baseline runs:
 * - local_cdc_subscriber_missing on the benchmark leader
 * - local_replica_not_voter_ready on benchmark-hosting joiners
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
const TABLE_ID = 'tbl-benchmark';
const PARTITION_ID = `${TABLE_ID}-p1`;
const REQUIRED_SCHEMA_VERSION = '1740589945123:7:seed-1';
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const NODE_IDS = [
  'seed-1',
  'join-2',
  'join-3',
  'join-4',
  'join-5',
  'join-6',
  'join-7',
];

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

function createVirtualTiming() {
  let nowMs = ZERO;
  return {
    now: () => nowMs,
    sleep: async (delayMs) => {
      nowMs += Number.isFinite(delayMs) ? Math.max(ZERO, delayMs) : ZERO;
    },
  };
}

function buildControlSnapshotPayload(nodeId) {
  return {
    schemaVersion: 1,
    nodeId: String(nodeId),
    capturedAt: Date.now(),
    nodes: [...NODE_IDS],
    partitions: [PARTITION_ID],
    leaders: {[PARTITION_ID]: 'seed-1'},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
    },
  };
}

function buildReplicaReadiness(replicaNodeId, blockedReason) {
  const blocked = blockedReason && typeof blockedReason === 'object' ?
    blockedReason :
    null;
  return {
    workloadReady: !blocked,
    benchmarkReady: !blocked,
    routingReady: true,
    schemaReady: true,
    topologyReady: !blocked,
    replicaOpsInFlight: 0,
    leadershipStable: true,
    tableName: TABLE_NAME,
    reasons: blocked ?
      [{
        code: blocked.code,
        detail: blocked.detail,
      }] :
      [],
    appliedSchemaVersion: REQUIRED_SCHEMA_VERSION,
    nodeId: replicaNodeId,
  };
}

function buildServiceDiscoverySnapshot(sourceNodeId, blockedReasonByNodeId) {
  const capturedAt = Date.now();
  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId: String(sourceNodeId),
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
        readiness: buildReplicaReadiness(
          replicaNodeId,
          replicaNodeId === sourceNodeId ?
            blockedReasonByNodeId[replicaNodeId] || null :
            null,
        ),
      })),
    }],
  };
}

function createCluster(options = {}) {
  const blockedReasonByNodeId =
    options.blockedReasonByNodeId &&
      typeof options.blockedReasonByNodeId === 'object' ?
      options.blockedReasonByNodeId :
      {};
  const timing = createVirtualTiming();

  function createNodeHandle(nodeId, role) {
    return {
      id: nodeId,
      role,
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === `SELECT count(*) FROM ${TABLE_NAME} WHERE 1 = 0`) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM tables WHERE table_name')) {
          return {
            rows: [{
              table_id: TABLE_ID,
              schema_version: REQUIRED_SCHEMA_VERSION,
              updated_at: Number.parseInt(REQUIRED_SCHEMA_VERSION.split(':')[0], 10),
            }],
          };
        }
        if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) {
          return {rows: []};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions WHERE table_name') ||
            statement.includes('FROM partitions WHERE table_id') ||
            statement.includes('FROM partitions')) {
          return {rows: [{partition_id: PARTITION_ID}]};
        }
        return {rows: []};
      },
      queryWithTimeout: async function(sql, params = [], _options = {}) {
        const statement = String(sql);
        if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          return {rows: [buildControlSnapshotPayload(this.id)]};
        }
        if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
          return {
            rows: [buildServiceDiscoverySnapshot(
              this.id,
              blockedReasonByNodeId,
            )],
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
        replicationFactor: 3,
        syncReplicaAcks: 1,
        strictDiscovery: true,
        requiredSutLoadNodeCount: NODE_IDS.length,
        readyTimeoutMs: 60,
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
        createLoadGenerator: createLoadGeneratorFactory(),
        timing,
      },
    },
    _providers: [createProviderStub()],
    _hostAssignment: [0],
    _networkName: 'test-net',
    getNodes: () => NODE_IDS.map((nodeId, index) =>
      createNodeHandle(nodeId, index === ZERO ? 'seed' : 'joiner')),
    waitForConvergence: async () => ({settledAfterMs: 1}),
    assertConsistency: async () => {},
  };
}

test('Strict benchmark local readiness integration', async (t) => {
  await t.test(
    'classifies missing local CDC subscribers during strict discovery',
    async (t) => {
      const runError = await t.rejects(
        run(createCluster({
          blockedReasonByNodeId: {
            'seed-1': {
              code: 'local_cdc_subscriber_missing',
              detail: PARTITION_ID,
            },
          },
        })),
        /local_cdc_subscriber_missing/i,
      );

      t.match(
        String(runError?.message || runError),
        /local_cdc_subscriber_missing=tbl-benchmark-p1/i,
        'strict discovery should surface the missing local CDC subscriber reason',
      );
    },
  );

  await t.test(
    'classifies non-voter local replicas during strict discovery',
    async (t) => {
      const runError = await t.rejects(
        run(createCluster({
          blockedReasonByNodeId: {
            'join-2': {
              code: 'local_replica_not_voter_ready',
              detail: PARTITION_ID,
            },
            'join-3': {
              code: 'local_replica_not_voter_ready',
              detail: PARTITION_ID,
            },
          },
        })),
        /local_replica_not_voter_ready/i,
      );

      t.match(
        String(runError?.message || runError),
        /local_replica_not_voter_ready=tbl-benchmark-p1:2/i,
        'strict discovery should surface the blocked local voter readiness reason count',
      );
    },
  );
});
