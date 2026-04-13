/**
 * Integration test: preflight benchmark-table create timeout diagnostics.
 *
 * Reproduces the strict 7-node partition-split failure class where control
 * table creation times out and must surface actionable diagnostics.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {run} from '../distributed/scenarios/postgres-baseline-comparison.js';
import {
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
} from '../distributed/harness/constants.js';

const ZERO = 0;
const TABLE_NAME = 'benchmark_events';
const TABLE_CREATE_OUTER_TIMEOUT_MS = 35000;
const TABLE_CREATE_INNER_TIMEOUT_MS = 30000;

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
    nodes: [String(nodeId)],
    partitions: [],
    leaders: {},
    replicaOperations: {
      inFlightCount: 0,
      statusHistogram: {},
      partitionGroupInFlight: {},
    },
  };
}

function createCluster() {
  const seedNode = {
    id: 'seed-1',
    role: 'seed',
    query: async (sql) => {
      const statement = String(sql);
      if (statement === 'SELECT 1') {
        return {rows: [{value: 1}]};
      }
      if (statement.startsWith('SELECT * FROM tables')) {
        return {rows: []};
      }
      if (statement.startsWith('SELECT * FROM partitions')) {
        return {rows: []};
      }
      if (statement.startsWith('SELECT * FROM services')) {
        return {rows: []};
      }
      return {rows: []};
    },
    queryWithTimeout: async function(sql, params = [], _options = {}) {
      const statement = String(sql);
      if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
        return {rows: [buildControlSnapshotPayload(this.id)]};
      }
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) {
        throw new Error('Query timeout after 30000ms');
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
        controlQueryTimeoutMs: 15000,
        replicationFactor: 1,
        syncReplicaAcks: 0,
        strictParity: false,
        strictDiscovery: false,
        strictPreloadReadiness: false,
        readyTimeoutMs: 120,
        readyPollIntervalMs: 5,
        quiescentTimeoutMs: 120,
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
        createLoadGenerator: () => ({
          start: () => ({
            waitComplete: async () => ({
              total: 100,
              success: 100,
              failed: ZERO,
              errors: ZERO,
              opsPerSec: 100,
              latency: {avg: 1, p50: 1, p95: 2, p99: 2},
            }),
          }),
        }),
      },
    },
    _providers: [createProviderStub()],
    _hostAssignment: [0],
    _networkName: 'test-net',
    getNodes: () => [seedNode],
    waitForConvergence: async () => ({settledAfterMs: 1}),
    assertConsistency: async () => {},
  };
}

test('benchmark table create timeout emits structured preflight diagnostics',
  async (t) => {
    const runError = await t.rejects(
      run(createCluster()),
      /query timeout after 30000ms/i,
    );

    const failure = runError?.diagnostics?.failure;
    t.equal(
      failure?.phase,
      'preflight',
      'preflight should fail when benchmark table create times out',
    );

    const createAttempt = failure?.benchmarkMetadataFlow?.createAttempt;
    t.ok(
      createAttempt && typeof createAttempt === 'object',
      'failure diagnostics should include benchmark table create attempt details',
    );
    t.equal(
      createAttempt?.writeNodeId,
      'seed-1',
      'create-attempt diagnostics should include canonical write node',
    );
    t.equal(
      createAttempt?.outerTimeoutMs,
      TABLE_CREATE_OUTER_TIMEOUT_MS,
      'create-attempt diagnostics should include outer control timeout',
    );
    t.equal(
      createAttempt?.innerTimeoutMs,
      TABLE_CREATE_INNER_TIMEOUT_MS,
      'create-attempt diagnostics should include inner table-create timeout',
    );
    t.equal(
      createAttempt?.timeoutBudgetMismatch,
      true,
      'create-attempt diagnostics should flag timeout budget mismatch',
    );
    t.equal(
      createAttempt?.outcome,
      'failed',
      'create-attempt diagnostics should classify failed create outcome',
    );
    t.equal(
      createAttempt?.isTimeout,
      true,
      'create-attempt diagnostics should classify timeout failures explicitly',
    );
    t.match(
      String(createAttempt?.error || ''),
      /query timeout after 30000ms/i,
      'create-attempt diagnostics should preserve timeout error detail',
    );
    t.equal(
      createAttempt?.durationMs >= ZERO,
      true,
      'create-attempt diagnostics should include non-negative duration',
    );

    const metadataSnapshot = createAttempt?.metadataSnapshot;
    t.ok(
      metadataSnapshot && typeof metadataSnapshot === 'object',
      'timeout diagnostics should include metadata snapshot from create node',
    );
    t.equal(
      metadataSnapshot?.stage,
      'create_error',
      'metadata snapshot should be tagged as create_error stage',
    );
    t.equal(
      typeof metadataSnapshot?.queryErrors === 'object',
      true,
      'metadata snapshot should expose per-query lookup errors',
    );
  });
