import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  run,
  resolveBenchmarkConfig,
  buildComparison,
} from '../../scenarios/postgres-baseline-comparison.js';
import {
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  SCENARIO_PHASE_SEQUENCE,
} from '../constants.js';

const PROBE_SQL = 'SELECT 1';
const DEFAULT_PROBE_TIMEOUT_MS = 1000;
const DEFAULT_DISCOVERY_HEALTH = 'healthy';
const DEFAULT_DISCOVERY_REPLICA_PORT = 5432;
const DISCOVERY_ADMIN_META_SERVICE_ID = 'sys-admin-meta';
const DISCOVERY_ADMIN_META_PROTOCOL = 'websocket';
const SERVICE_DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const DEFAULT_DISCOVERY_TABLE_NAME = 'benchmark_events';

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function buildControlSnapshotPayload(nodeId, overrides = {}) {
  const normalizedNodeId = String(nodeId || 'unknown');
  const replicaOperations = {
    inFlightCount: 0,
    statusHistogram: {},
    ...(isRecord(overrides.replicaOperations) ? overrides.replicaOperations : {}),
  };
  return {
    schemaVersion: 1,
    nodeId: normalizedNodeId,
    capturedAt: Date.now(),
    nodes: [normalizedNodeId],
    partitions: ['p1'],
    leaders: {p1: 'seed-1'},
    ...overrides,
    replicaOperations,
  };
}

function hasValidControlSnapshotResult(result) {
  const firstRow = Array.isArray(result?.rows) ? result.rows[0] : null;
  return isRecord(firstRow) &&
    firstRow.schemaVersion === 1 &&
    typeof firstRow.nodeId === 'string' &&
    firstRow.nodeId.length > 0 &&
    Number.isFinite(firstRow.capturedAt) &&
    Array.isArray(firstRow.nodes) &&
    Array.isArray(firstRow.partitions) &&
    isRecord(firstRow.leaders) &&
    isRecord(firstRow.replicaOperations) &&
    Number.isInteger(firstRow.replicaOperations.inFlightCount);
}

function hasValidServiceDiscoveryResult(result) {
  const firstRow = Array.isArray(result?.rows) ? result.rows[0] : null;
  return isRecord(firstRow) &&
    firstRow.schemaVersion === NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION &&
    Array.isArray(firstRow.services);
}

function buildServiceDiscoverySnapshot(adapted) {
  const nodeId = String(adapted.id || 'unknown');
  const discoveryNodeIds = Array.isArray(adapted._discoveryNodeIds) ?
    [...new Set(adapted._discoveryNodeIds.map((value) => String(value)))] :
    [nodeId];
  const serviceId = typeof adapted._discoveryServiceId === 'string' &&
    adapted._discoveryServiceId.length > 0 ?
    adapted._discoveryServiceId :
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE;
  const protocol = typeof adapted._discoveryProtocol === 'string' &&
    adapted._discoveryProtocol.length > 0 ?
    adapted._discoveryProtocol :
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL;
  const serviceKey = serviceId + '|' + protocol;
  const replicaCount = discoveryNodeIds.length;
  const capturedAt = Date.now();

  return {
    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    nodeId,
    capturedAt,
    serviceCount: 1,
    replicaCount,
    services: [{
      serviceKey,
      logicalServiceName: serviceId,
      protocol,
      serviceIds: [serviceId],
      desiredReplicaCount: replicaCount,
      desiredReplicaCountByServiceId: {
        [serviceId]: replicaCount,
      },
      observedReplicaCount: replicaCount,
      healthyReplicaCount: replicaCount,
      unhealthyReplicaCount: 0,
      health: DEFAULT_DISCOVERY_HEALTH,
      nodeCount: replicaCount,
      nodes: discoveryNodeIds,
      replicas: discoveryNodeIds.map((replicaNodeId) => ({
        endpointId: serviceId + '-ep-' + replicaNodeId,
        serviceId,
        nodeId: replicaNodeId,
        address: '127.0.0.1',
        port: DEFAULT_DISCOVERY_REPLICA_PORT,
        healthStatus: DEFAULT_DISCOVERY_HEALTH,
        updatedAt: capturedAt,
        metadata: {},
        readiness: {
          workloadReady: true,
          routingReady: true,
          schemaReady: true,
          replicaOpsInFlight: 0,
          leadershipStable: true,
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          reasons: [],
        },
      })),
    }],
  };
}

function asNodeHandle(node) {
  const adapted = {...node};
  if (Array.isArray(node?.discoveryNodeIds)) {
    adapted._discoveryNodeIds =
      node.discoveryNodeIds.map((value) => String(value));
  }
  if (typeof node?.discoveryServiceId === 'string') {
    adapted._discoveryServiceId = node.discoveryServiceId;
  }
  if (typeof node?.discoveryProtocol === 'string') {
    adapted._discoveryProtocol = node.discoveryProtocol;
  }
  const originalQueryWithTimeout =
    typeof adapted.queryWithTimeout === 'function' ?
      adapted.queryWithTimeout.bind(adapted) :
      null;
  adapted.queryWithTimeout = async (sql, params = [], options = {}) => {
    const normalizedSql = String(sql);
    if (normalizedSql === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
      if (originalQueryWithTimeout) {
        const result = await originalQueryWithTimeout(sql, params, options);
        if (hasValidControlSnapshotResult(result)) {
          return result;
        }
      }
      return {
        rows: [buildControlSnapshotPayload(adapted.id)],
      };
    }

    if (normalizedSql === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
        normalizedSql.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
      if (originalQueryWithTimeout) {
        const result = await originalQueryWithTimeout(sql, params, options);
        if (hasValidServiceDiscoveryResult(result)) {
          return result;
        }
      }
      return {
        rows: [buildServiceDiscoverySnapshot(adapted)],
      };
    }

    if (originalQueryWithTimeout) {
      return originalQueryWithTimeout(sql, params, options);
    }
    return adapted.query(sql, params);
  };
  if (typeof adapted.getReachabilityDiagnostics !== 'function') {
    adapted.getReachabilityDiagnostics = async () => {
      try {
        await adapted.queryWithTimeout(PROBE_SQL, [], {
          timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
        });
        return {
          nodeId: adapted.id,
          reachable: true,
          adminReady: true,
        };
      } catch (error) {
        return {
          nodeId: adapted.id,
          reachable: false,
          adminReady: false,
          lastError: String(error?.message || error),
        };
      }
    };
  }
  return adapted;
}

function asNodeHandles(nodes) {
  const adaptedNodes = nodes.map((node) => asNodeHandle(node));
  const allNodeIds = adaptedNodes.map((node) => String(node.id || 'unknown'));
  for (const node of adaptedNodes) {
    if (!Array.isArray(node._discoveryNodeIds)) {
      node._discoveryNodeIds = allNodeIds;
    }
  }
  return adaptedNodes;
}

describe('postgres-baseline-comparison scenario', () => {
  it('returns baseline comparison metrics and cleans up benchmark containers', async () => {
    const commandLog = [];
    const providerCalls = [];
    const createdContainers = [];
    const stoppedContainers = [];
    const removedContainers = [];
    const baselineSql = [];
    const baselineLoadCalls = [];
    let loadGeneratorCalls = 0;

    const provider = {
      createContainer: async (options) => {
        providerCalls.push('createContainer');
        createdContainers.push(options);
        const index = createdContainers.length;
        return {
          containerId: `benchmark-postgres-${index}`,
          ip: `172.18.0.${76 + index}`,
          name: `benchmark-postgres-${index}`,
        };
      },
      execInContainer: async (_containerId, cmd) => {
        providerCalls.push('execInContainer');
        const command = String(cmd[2] || '');
        commandLog.push(command);

        if (command.includes('pg_isready')) {
          return {
            exitCode: 0,
            stdout: 'accepting connections',
            stderr: '',
          };
        }
        if (command.includes('pg_stat_replication')) {
          return {
            exitCode: 0,
            stdout: '2\n',
            stderr: '',
          };
        }

        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      },
      stopContainer: async (containerId) => {
        providerCalls.push('stopContainer');
        stoppedContainers.push(containerId);
      },
      removeContainer: async (containerId) => {
        providerCalls.push('removeContainer');
        removedContainers.push(containerId);
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 10,
          clients: 4,
          jobs: 2,
          loadOpsPerSec: 80,
          loadDuration: '10s',
          loadMaxInFlight: 96,
          tableName: 'benchmark_events',
          replicationFactor: 3,
          syncReplicaAcks: 1,
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
            query: async (sql) => {
              baselineSql.push(String(sql));
              return {rows: []};
            },
            end: async () => {},
          }),
          createLoadGenerator: (nodes, options) => {
            const callIndex = loadGeneratorCalls++;
            baselineLoadCalls.push({nodes, options, callIndex});
            return {
              start: () => ({
                waitComplete: async () => (
                  callIndex === 0 ?
                    {
                      total: 120,
                      success: 118,
                      failed: 0,
                      errors: 0,
                      attemptErrors: 2,
                      opsPerSec: 84,
                      latency: {
                        p50: 3,
                        p95: 7,
                        p99: 15,
                      },
                    } :
                    {
                      total: 118,
                      success: 118,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {
                        avg: 12.5,
                        p50: 6,
                        p95: 11,
                        p99: 14,
                      },
                    }
                ),
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([{
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      }]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {
        providerCalls.push('assertConsistency');
      },
    };

    const result = await run(cluster);

    assert.ok(result.loadMetrics, 'scenario should return loadMetrics');
    assert.ok(result.details, 'scenario should return details payload');
    assert.equal(result.details.baseline.engine, 'postgres');
    assert.equal(result.details.baseline.metrics.opsPerSec, 100);
    assert.equal(result.details.comparison.sutOpsPerSec, 84);
    assert.equal(
      result.details.benchmark.sutLoadNodeCount,
      1,
      'scenario should report one queryable SUT load node in single-node cluster',
    );
    assert.equal(
      result.details.comparison.throughputRatioSutToBaseline,
      0.84,
    );
    assert.equal(
      result.details.comparison.p99LatencyRatioSutToBaselineAvg,
      1.2,
    );
    assert.equal(
      result.details.baseline.replicationFactor,
      3,
      'scenario should report replicated baseline factor',
    );
    assert.equal(
      result.details.verification.verdict,
      'consistent',
      'scenario should report verification verdict',
    );
    assert.equal(
      result.details.verification.confidence,
      'high',
      'scenario should report verification confidence',
    );
    assert.equal(
      result.details.policy.insufficientEvidence,
      'soft',
      'scenario should report assertion policy mapping',
    );

    assert.ok(
      commandLog.some((command) => command.includes('pg_isready')),
      'scenario should wait for baseline postgres readiness',
    );
    assert.ok(
      commandLog.some((command) => command.includes('synchronous_standby_names')),
      'scenario should configure synchronous replication on baseline primary',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container?.command?.[2] || '').includes('pg_basebackup')),
      'scenario should initialize replicas with pg_basebackup bootstrap command',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container?.command?.[2] || '').includes(
          'export PATH="$PATH:/usr/lib/postgresql/$PG_MAJOR/bin"',
        )),
      'scenario should export postgres binary path before invoking entrypoint',
    );
    assert.ok(
      baselineSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')),
      'scenario should prepare benchmark_events table on baseline',
    );
    assert.ok(
      baselineLoadCalls.length === 2,
      'scenario should run shared load generator for both sut and postgres baseline',
    );
    assert.equal(
      baselineLoadCalls[0]?.options?.tableName,
      'benchmark_events',
      'sut shared load should target benchmark_events table',
    );
    assert.equal(
      baselineLoadCalls[1]?.options?.tableName,
      'benchmark_events',
      'baseline shared load should target benchmark_events table',
    );
    assert.equal(
      baselineLoadCalls[0]?.nodes?.[0]?.id,
      'seed-1',
      'sut load should run through queryable SUT nodes',
    );
    assert.equal(
      createdContainers.length,
      3,
      'scenario should create one primary and two replica benchmark containers',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-primary')),
      'scenario should name one benchmark primary container',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-replica-1')),
      'scenario should name the first benchmark replica container',
    );
    assert.ok(
      createdContainers.some((container) =>
        String(container.name || '').includes('-replica-2')),
      'scenario should name the second benchmark replica container',
    );
    assert.equal(
      stoppedContainers.length,
      3,
      'scenario should stop all benchmark containers in teardown',
    );
    assert.equal(
      removedContainers.length,
      3,
      'scenario should remove all benchmark containers in teardown',
    );
    assert.ok(
      providerCalls.includes('assertConsistency'),
      'scenario should verify cluster consistency at end',
    );
  });

  it('resolveBenchmarkConfig merges defaults with explicit overrides', () => {
    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:15',
          clients: 16,
          jobs: 8,
          loadDuration: '45s',
          loadMaxInFlight: 240,
          replicationFactor: 5,
          syncReplicaAcks: 2,
          cacheBaselineMetrics: false,
          refreshBaselineMetrics: true,
          baselineCacheTtlMs: 60000,
        },
      },
    };

    const resolved = resolveBenchmarkConfig(cluster);

    assert.equal(resolved.baselineImage, 'postgres:15');
    assert.equal(resolved.clients, 16);
    assert.equal(resolved.jobs, 8);
    assert.equal(resolved.loadDuration, '45s');
    assert.equal(resolved.loadMaxInFlight, 240);
    assert.equal(resolved.baselineLoadNodeCount, 16);
    assert.equal(resolved.replicationFactor, 5);
    assert.equal(resolved.syncReplicaAcks, 2);
    assert.equal(resolved.cacheBaselineMetrics, false);
    assert.equal(resolved.refreshBaselineMetrics, true);
    assert.equal(resolved.baselineCacheTtlMs, 60000);
    assert.equal(typeof resolved.durationSeconds, 'number');
    assert.equal(typeof resolved.user, 'string');
  });

  it('emits load parity contract with configured and effective sections',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result.details.parity,
        'scenario should emit parity contract in details',
      );
      assert.equal(
        typeof result.details.parity.configured,
        'object',
        'parity contract should include configured section',
      );
      assert.equal(
        typeof result.details.parity.effective,
        'object',
        'parity contract should include effective section',
      );
    });

  it('emits mismatch reason codes for fanout and budget parity gaps',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(
        result.details.parity.status,
        'mismatched',
        'parity should classify fanout and budget mismatch as mismatched',
      );
      const reasonCodes = result.details.parity.reasons
        .map((reason) => reason.code);
      assert.ok(
        reasonCodes.includes('load_fanout_mismatch'),
        'parity reasons should include load fanout mismatch code',
      );
      assert.ok(
        reasonCodes.includes('per_node_budget_mismatch'),
        'parity reasons should include per-node budget mismatch code',
      );
    });

  it('emits one resolved load admission policy view in scenario details',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result.details.effectiveAdmissionPolicy,
        'scenario should emit effective admission policy details',
      );
      assert.equal(
        result.details.effectiveAdmissionPolicy.sources.benchmark.loadNodeMaxInFlight,
        2,
        'effective admission policy should report benchmark source values',
      );
      assert.equal(
        result.details.effectiveAdmissionPolicy.resolved.loadMaxInFlightPerNode,
        2,
        'effective admission policy should report resolved per-node load cap',
      );
    });

  it('diagnoses conflicting admission policy sources for load node budget',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
          },
          nodeClient: {
            channelPolicies: {
              load: {
                maxInFlightPerNode: 5,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      const conflictCodes = result.details.effectiveAdmissionPolicy.conflicts
        .map((conflict) => conflict.code);
      assert.ok(
        conflictCodes.includes('load_node_max_in_flight_conflict'),
        'effective admission policy should diagnose benchmark/channel conflict',
      );
    });

  it('emits explicit diagnostics coverage unavailability reason when diagnostics are absent',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result.details.diagnosticsCoverage,
        'scenario should include diagnosticsCoverage block',
      );
      assert.equal(
        result.details.diagnosticsCoverage.status,
        'unavailable',
        'diagnostics coverage should report unavailable when no diagnostics exist',
      );
      assert.equal(
        result.details.diagnosticsCoverage.reason,
        'not_reported',
        'diagnostics coverage should include explicit unavailability reason',
      );
      assert.equal(
        result.details.diagnosticsCoverage.sampleCount,
        0,
        'diagnostics coverage should report zero samples when unavailable',
      );
    });

  it('propagates diagnostics sample counts when write-path diagnostics are present',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            loadMaxInFlight: 96,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({
          settledAfterMs: 1,
          diagnostics: {
            writePath: {
              sampleCounts: {
                raftPropose: 5,
                transportDeliver: 7,
                sqlite: 11,
              },
            },
          },
        }),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(
        result.details.diagnosticsCoverage.status,
        'available',
        'diagnostics coverage should report available when diagnostics exist',
      );
      assert.equal(
        result.details.diagnosticsCoverage.sampleCount,
        23,
        'diagnostics coverage should report total propagated sample count',
      );
      assert.deepEqual(
        result.details.diagnosticsCoverage.writePathSamples,
        {
          raftPropose: 5,
          transportDeliver: 7,
          sqlite: 11,
        },
        'diagnostics coverage should include write-path sample counts',
      );
    });

  it('buildComparison calculates ratios using baseline metrics', () => {
    const comparison = buildComparison(
      {
        opsPerSec: 120,
        latency: {p99: 24},
      },
      {
        tps: 80,
        latencyAverageMs: 12,
      },
    );

    assert.equal(comparison.sutOpsPerSec, 120);
    assert.equal(comparison.baselineTps, 80);
    assert.equal(comparison.throughputRatioSutToBaseline, 1.5);
    assert.equal(comparison.p99LatencyRatioSutToBaselineAvg, 2);
  });

  it('reuses cached baseline metrics for repeated runs on same machine/profile',
    async () => {
      const outputDir = await mkdtemp(
        join(tmpdir(), 'postgres-baseline-cache-test-'),
      );
      const createdContainers = [];
      let baselineLoadCalls = 0;
      let sutLoadCalls = 0;
      const baselineSql = [];
      const provider = {
        createContainer: async (options) => {
          createdContainers.push(options);
          const index = createdContainers.length;
          return {
            containerId: `benchmark-postgres-${index}`,
            ip: `172.18.0.${80 + index}`,
            name: `benchmark-postgres-${index}`,
          };
        },
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          outputDir,
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            cacheBaselineMetrics: true,
            refreshBaselineMetrics: false,
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
              query: async (sql) => {
                baselineSql.push(String(sql));
                return {rows: []};
              },
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const firstNodeId = String(nodes?.[0]?.id || '');
              const isBaselineLoad = firstNodeId.startsWith(
                'postgres-baseline-load-node-',
              );
              if (isBaselineLoad) {
                baselineLoadCalls++;
              } else {
                sutLoadCalls++;
              }
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      try {
        const first = await run(cluster);
        assert.equal(first.details.baseline.cache.hit, false);
        assert.equal(first.details.baseline.cache.reason, 'cache-stored');
        assert.equal(createdContainers.length, 3);
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 1);
        assert.ok(
          baselineSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS')),
          'scenario should prepare baseline benchmark table before load',
        );

        const second = await run(cluster);
        assert.equal(second.details.baseline.cache.hit, true);
        assert.equal(second.details.baseline.cache.reason, 'cache-hit');
        assert.equal(createdContainers.length, 3);
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 2);
      } finally {
        await rm(outputDir, {recursive: true, force: true});
      }
    });

  it('reuses baseline cache across equivalent runs with different report filenames',
    async () => {
      const outputRoot = await mkdtemp(
        join(tmpdir(), 'postgres-baseline-cache-report-name-test-'),
      );
      const createdContainers = [];
      let baselineLoadCalls = 0;
      let sutLoadCalls = 0;
      const provider = {
        createContainer: async (options) => {
          createdContainers.push(options);
          const index = createdContainers.length;
          return {
            containerId: `benchmark-postgres-${index}`,
            ip: `172.18.0.${80 + index}`,
            name: `benchmark-postgres-${index}`,
          };
        },
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '2\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const buildCluster = (outputDir) => ({
        _config: {
          outputDir,
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 10,
            clients: 4,
            jobs: 2,
            loadOpsPerSec: 80,
            loadDuration: '10s',
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            cacheBaselineMetrics: true,
            refreshBaselineMetrics: false,
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
            createLoadGenerator: (nodes) => {
              const firstNodeId = String(nodes?.[0]?.id || '');
              const isBaselineLoad = firstNodeId.startsWith(
                'postgres-baseline-load-node-',
              );
              if (isBaselineLoad) {
                baselineLoadCalls++;
              } else {
                sutLoadCalls++;
              }
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 118,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 12.5, p50: 6, p95: 11, p99: 14},
                      } :
                      {
                        total: 120,
                        success: 118,
                        failed: 0,
                        errors: 0,
                        attemptErrors: 2,
                        opsPerSec: 84,
                        latency: {p50: 3, p95: 7, p99: 15},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark'}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      });

      try {
        const first = await run(buildCluster(
          join(outputRoot, 'postgres-baseline-a.report.json'),
        ));
        assert.equal(first.details.baseline.cache.hit, false);
        assert.equal(first.details.baseline.cache.reason, 'cache-stored');
        assert.equal(baselineLoadCalls, 1);
        assert.equal(sutLoadCalls, 1);

        const second = await run(buildCluster(
          join(outputRoot, 'postgres-baseline-b.report.json'),
        ));
        assert.equal(
          second.details.baseline.cache.key,
          first.details.baseline.cache.key,
          'cache identity key should remain stable across report filename changes',
        );
        assert.equal(
          second.details.baseline.cache.path,
          first.details.baseline.cache.path,
          'cache path should be anchored independent of report filename',
        );
        assert.equal(second.details.baseline.cache.hit, true);
        assert.equal(second.details.baseline.cache.reason, 'cache-hit');
        assert.equal(
          baselineLoadCalls,
          1,
          'equivalent rerun with different report filename should reuse baseline cache',
        );
      } finally {
        await rm(outputRoot, {recursive: true, force: true});
      }
    });

  it('uses discovered pg replica nodes for shared load generation', async () => {
    const loadCalls = [];
    const provider = {
      createContainer: async (_options) => ({
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

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
    };
    const joinerNode = {
      id: 'joiner-1',
      role: 'joiner',
      discoveryNodeIds: ['seed-1', 'joiner-1'],
      query: async (sql) => {
        if (String(sql) === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        return {rows: []};
      },
    };
    const failingNode = {
      id: 'joiner-2',
      role: 'joiner',
      query: async (sql) => {
        if (String(sql) === 'SELECT 1') {
          throw new Error('probe timeout');
        }
        return {rows: []};
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
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
          createLoadGenerator: (nodes) => {
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
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode, joinerNode, failingNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.deepEqual(
      loadCalls[0],
      ['seed-1', 'joiner-1'],
      'sut load should include discovered replica nodes and skip failing probe node',
    );
    assert.equal(
      result.details.benchmark.sutLoadNodeCount,
      2,
      'benchmark details should report discovered reachable SUT load node count',
    );
  });

  it('aggregates discovered replicas across all discovery snapshot sources',
    async () => {
      const loadCalls = [];
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: ['seed-1'],
              })],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          if (String(sql) === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: ['seed-1', 'joiner-1'],
              })],
            };
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should aggregate discovered nodes across all discovery sources',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'benchmark details should report unioned discovered node count',
      );
      assert.deepEqual(
        result.details.benchmark.sutLoadDiscovery.sourceResults.map((source) =>
          source.nodeId),
        ['seed-1', 'joiner-1'],
        'diagnostics should include all discovery sources',
      );
    });

  it('retries discovery when first attempt reaches only partial fanout',
    async () => {
      const loadCalls = [];
      let joinerDiscoveryCalls = 0;
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: ['seed-1'],
              })],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          if (String(sql) === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            joinerDiscoveryCalls += 1;
            if (joinerDiscoveryCalls === 1) {
              throw new Error('admin socket warming');
            }
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: ['seed-1', 'joiner-1'],
              })],
            };
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            readyTimeoutMs: 200,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 1000,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should wait for target fanout before starting load',
      );
      assert.ok(
        joinerDiscoveryCalls >= 2,
        'discovery should retry when early attempts do not meet target fanout',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        false,
        'discovery diagnostics should report successful fanout convergence',
      );
    });

  it('returns partial fanout quickly when discovery stops improving',
    async () => {
      const loadCalls = [];
      let joinerDiscoveryCalls = 0;
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: ['seed-1'],
              })],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          if (String(sql) === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            joinerDiscoveryCalls += 1;
            throw new Error('admin socket unavailable');
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            readyTimeoutMs: 1000,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 1000,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should continue with the best reachable partial fanout',
      );
      assert.ok(
        joinerDiscoveryCalls > 0,
        'discovery should attempt non-seed sources before partial fallback',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.attempts < 20,
        'discovery should short-circuit stalled partial fanout before timeout',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        true,
        'partial fanout fallback should be marked as timed out parity target',
      );
    });

  it('excludes reachable nodes that are not discovered pg replicas', async () => {
    const loadCalls = [];
    const provider = {
      createContainer: async (_options) => ({
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

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      discoveryNodeIds: ['seed-1', 'joiner-1'],
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
    };
    const joinerNode = {
      id: 'joiner-1',
      role: 'joiner',
      discoveryNodeIds: ['seed-1', 'joiner-1'],
      query: async (sql) => {
        if (String(sql) === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        return {rows: []};
      },
    };
    const nonReplicaNode = {
      id: 'joiner-2',
      role: 'joiner',
      discoveryNodeIds: ['seed-1', 'joiner-1'],
      query: async (sql) => {
        if (String(sql) === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        return {rows: []};
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
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
          createLoadGenerator: (nodes) => {
            loadCalls.push(nodes.map((node) => node.id));
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith(
                'postgres-baseline-load-node-',
              );
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
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode, joinerNode, nonReplicaNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.deepEqual(
      loadCalls[0],
      ['seed-1', 'joiner-1'],
      'sut load should include only discovered postgres replica nodes',
    );
    assert.equal(
      result.details.benchmark.sutEligibleLoadNodeCount,
      2,
      'benchmark details should report eligible nodes from discovery snapshot',
    );
  });

  it('fails discovery when readiness probes fail for discovered replicas',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            throw new Error('probe timeout');
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            throw new Error('probe timeout');
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /No discovered reachable load service nodes available for benchmark load/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run load when discovered replicas fail readiness probes',
      );
    });

  it('retries discovery snapshots until postgres replica nodes appear',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      let seedDiscoveryCalls = 0;
      let joinerDiscoveryCalls = 0;
      const provider = {
        createContainer: async (_options) => ({
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

      const discoveryNodeIdsByCall = [
        [],
        ['seed-1', 'joiner-1'],
      ];

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            const index = Math.min(
              seedDiscoveryCalls,
              discoveryNodeIdsByCall.length - 1,
            );
            const nodeIds = discoveryNodeIdsByCall[index];
            seedDiscoveryCalls++;
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: nodeIds,
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            const index = Math.min(
              joinerDiscoveryCalls,
              discoveryNodeIdsByCall.length - 1,
            );
            const nodeIds = discoveryNodeIdsByCall[index];
            joinerDiscoveryCalls++;
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                _discoveryNodeIds: nodeIds,
              })],
            };
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            readyTimeoutMs: 100,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 500,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should use discovered replicas after discovery retries',
      );
      assert.ok(
        seedDiscoveryCalls + joinerDiscoveryCalls >= 3,
        'discovery should retry when initial snapshots are empty',
      );
      assert.equal(
        result.details.benchmark.sutEligibleLoadNodeCount,
        2,
        'benchmark details should report discovered nodes after retry',
      );
    });

  it('fails discovery when postgres-wire replicas are unavailable',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        discoveryServiceId: DISCOVERY_ADMIN_META_SERVICE_ID,
        discoveryProtocol: DISCOVERY_ADMIN_META_PROTOCOL,
        discoveryNodeIds: ['seed-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        discoveryServiceId: DISCOVERY_ADMIN_META_SERVICE_ID,
        discoveryProtocol: DISCOVERY_ADMIN_META_PROTOCOL,
        discoveryNodeIds: ['seed-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 500,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /No discovered reachable load service nodes available for benchmark load/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run load when canonical postgres-wire discovery is empty',
      );
    });

  it('waits for benchmark table visibility on load nodes before SUT load',
    async () => {
      const loadCalls = [];
      let joinerTableProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            joinerTableProbeCount++;
            if (joinerTableProbeCount < 3) {
              throw new Error('Table not found: benchmark_events');
            }
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 500,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);
      assert.ok(
        joinerTableProbeCount >= 3,
        'scenario should wait until load nodes can query benchmark table',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should start only after benchmark table is visible on all selected nodes',
      );
    });

  it('fails pre-load gate when no discovered node reaches table visibility',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
      };
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 200,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

    await assert.rejects(
      run(cluster),
      /SUT load nodes did not reach quiescent state/i,
    );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run SUT load when no selected node passes pre-load gate',
      );
    });

  it('fails pre-load gate when quiescence cannot confirm in-flight drain',
    async () => {
      const loadCalls = [];
      let inFlightProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            inFlightProbeCount++;
            if (inFlightProbeCount === 1) {
              return {rows: []};
            }
            throw new Error('connection timed out');
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            inFlightProbeCount++;
            if (inFlightProbeCount === 1) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  replicaOperations: {
                    inFlightCount: 1,
                    statusHistogram: {creating: 1},
                  },
                })],
              };
            }
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 80,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /SUT load nodes did not reach quiescent state/i,
      );
      assert.ok(
        inFlightProbeCount > 1,
        'scenario should continue polling after initial successful in-flight probe',
      );
    assert.equal(
      loadCalls.length,
      0,
      'scenario should not run SUT load when quiescence cannot be proven',
    );
  });

  it('fails pre-load gate early when quiescence makes no progress', async () => {
    const loadCalls = [];
    let inFlightProbeCount = 0;
    const benchmarkTableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
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

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
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
        if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          inFlightProbeCount++;
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              replicaOperations: {
                inFlightCount: 5,
                statusHistogram: {creating: 5},
              },
            })],
          };
        }
        return this.query(sql, params);
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 500,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          quiescentNoProgressTimeoutMs: 20,
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
          createLoadGenerator: (nodes) => {
            loadCalls.push(nodes.map((node) => node.id));
            return {
              start: () => ({
                waitComplete: async () => ({
                  total: 10,
                  success: 10,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 10,
                  latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                }),
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    await assert.rejects(
      run(cluster),
      /gate aborted due to stalled progress/i,
    );
    assert.ok(
      inFlightProbeCount >= 2,
      'scenario should sample quiescence multiple times before aborting',
    );
    assert.ok(
      inFlightProbeCount < 30,
      'scenario should fail fast instead of exhausting full timeout budget',
    );
    assert.equal(
      loadCalls.length,
      0,
      'scenario should not start load when quiescence is stalled',
    );
  });

  it('uses alternate snapshot node when seed snapshot lane is timing out',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('seed snapshot timed out');
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            readyTimeoutMs: 150,
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
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);
      assert.ok(
        loadCalls.length >= 1,
        'scenario should proceed to load phase when alternate snapshot node is available',
      );
    });

  it('fails pre-load gate when one discovered node remains persistently timed out',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
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
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
      };
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('table probe timed out');
          }
          return {rows: []};
        },
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 80,
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
            createLoadGenerator: (nodes) => {
              const nodeIds = nodes.map((node) => node.id);
              const isBaselineLoad =
                String(nodeIds[0] || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (!isBaselineLoad) {
                loadCalls.push(nodeIds);
              }
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /phase pre_load_gate/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should fail closed before SUT load when any discovered node stays unready',
      );
    });

  it('waits for in-flight replica operations to drain before SUT load', async () => {
    const loadCalls = [];
    let inFlightProbeCount = 0;
    const provider = {
      createContainer: async (_options) => ({
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

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          inFlightProbeCount++;
          if (inFlightProbeCount < 3) {
            return {
              rows: [{
                operation_id: 'op-' + inFlightProbeCount,
                status: 'creating',
              }],
            };
          }
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
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
        if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          inFlightProbeCount++;
          const inFlightCount = inFlightProbeCount < 3 ? 1 : 0;
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              replicaOperations: {
                inFlightCount,
                statusHistogram: inFlightCount > 0 ? {creating: 1} : {},
              },
            })],
          };
        }
        return this.query(sql, params);
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 500,
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
          createLoadGenerator: (nodes) => {
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
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    await run(cluster);
    assert.ok(
      inFlightProbeCount >= 3,
      'scenario should poll in-flight replica operations until quiescent',
    );
    assert.equal(
      loadCalls.length >= 1,
      true,
      'scenario should eventually start shared load after quiescence',
    );
  });

  it('retries final consistency assertion on transient failures', async () => {
    let assertConsistencyCalls = 0;
    const provider = {
      createContainer: async (_options) => ({
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

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
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
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 200,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          consistencyAssertMaxAttempts: 3,
          consistencyAssertRetryDelayMs: 1,
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
          createLoadGenerator: (nodes) => {
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
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {
        assertConsistencyCalls++;
        if (assertConsistencyCalls === 1) {
          throw new Error('Cannot assert consistency: fewer than 2 queryable nodes');
        }
      },
    };

    const result = await run(cluster);
    assert.ok(result.loadMetrics, 'scenario should complete when consistency recovers');
    assert.equal(
      assertConsistencyCalls,
      2,
      'scenario should retry consistency check after a transient failure',
    );
  });

  it('runs post-load drain gate before final consistency verification', async () => {
    let loadCompleted = false;
    let postLoadDrainProbeCount = 0;
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
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
          return {exitCode: 0, stdout: '0\\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          if (!loadCompleted) {
            return {rows: []};
          }
          postLoadDrainProbeCount++;
          if (postLoadDrainProbeCount < 3) {
            return {
              rows: [{
                operation_id: 'op-' + String(postLoadDrainProbeCount),
                status: 'creating',
              }],
            };
          }
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
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
        if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          if (!loadCompleted) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          postLoadDrainProbeCount++;
          const inFlightCount = postLoadDrainProbeCount < 3 ? 1 : 0;
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              replicaOperations: {
                inFlightCount,
                statusHistogram: inFlightCount > 0 ? {creating: 1} : {},
              },
            })],
          };
        }
        return this.query(sql, params);
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 100,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          postLoadDrainTimeoutMs: 100,
          postLoadDrainPollIntervalMs: 5,
          postLoadDrainStableWindowMs: 0,
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
          createLoadGenerator: (nodes) => {
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith('postgres-baseline-load-node-');
            return {
              start: () => ({
                waitComplete: async () => {
                  if (!isBaselineLoad) {
                    loadCompleted = true;
                  }
                  return isBaselineLoad ?
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
                    };
                },
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {
        assert.ok(
          postLoadDrainProbeCount >= 3,
          'post-load drain should probe until in-flight operations drain',
        );
      },
    };

    const result = await run(cluster);
    assert.ok(result.loadMetrics, 'scenario should still return load metrics');
    assert.ok(
      result.details.benchmark.postLoadDrainAttempts >= 3,
      'benchmark details should include post-load drain attempts',
    );
  });

  it('maps post-load drain timeout to soft warning policy when configured', async () => {
    let loadCompleted = false;
    let assertConsistencyCalls = 0;
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
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
          return {exitCode: 0, stdout: '0\\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          if (!loadCompleted) {
            return {rows: []};
          }
          return {
            rows: [{
              operation_id: 'op-post-load-stuck',
              status: 'creating',
            }],
          };
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
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
        if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          if (!loadCompleted) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              replicaOperations: {
                inFlightCount: 1,
                statusHistogram: {creating: 1},
              },
            })],
          };
        }
        return this.query(sql, params);
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 100,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          postLoadDrainTimeoutMs: 20,
          postLoadDrainPollIntervalMs: 5,
          postLoadDrainStableWindowMs: 0,
          insufficientEvidencePolicy: 'soft',
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
          createLoadGenerator: (nodes) => {
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith('postgres-baseline-load-node-');
            return {
              start: () => ({
                waitComplete: async () => {
                  if (!isBaselineLoad) {
                    loadCompleted = true;
                  }
                  return isBaselineLoad ?
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
                    };
                },
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {
        assertConsistencyCalls++;
      },
    };

    const result = await run(cluster);
    assert.ok(result.loadMetrics, 'scenario should keep load metrics on soft warning');
    assert.equal(assertConsistencyCalls, 1, 'consistency assertion should still execute');
    assert.equal(result.details.verification.verdict, 'insufficient_evidence');
    assert.equal(result.details.verification.confidence, 'medium');
    assert.equal(result.details.policy.assertionStatus, 'passed_with_warnings');
  });

  it('fails when SUT load reports operation-level errors', async () => {
    let loadCompleted = false;
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
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
          return {exitCode: 0, stdout: '0\\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 100,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          insufficientEvidencePolicy: 'soft',
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
          createLoadGenerator: (nodes) => {
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith('postgres-baseline-load-node-');
            return {
              start: () => ({
                waitComplete: async () => {
                  if (!isBaselineLoad) {
                    loadCompleted = true;
                  }
                  return isBaselineLoad ?
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
                      success: 99,
                      failed: 1,
                      errors: 1,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                    };
                },
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {
        assert.equal(loadCompleted, true);
      },
    };

    await assert.rejects(
      run(cluster),
      /load run completed with operation errors/i,
    );
  });

  it('emits observability fields for phase and channel decisions', async () => {
    let loadCompleted = false;
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
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
          return {exitCode: 0, stdout: '0\\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          if (!loadCompleted) {
            return {rows: []};
          }
          return {
            rows: [{
              operation_id: 'stuck-op',
              status: 'creating',
            }],
          };
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark'}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
    };

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
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 100,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          postLoadDrainTimeoutMs: 20,
          postLoadDrainPollIntervalMs: 5,
          postLoadDrainStableWindowMs: 0,
          insufficientEvidencePolicy: 'soft',
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
          createLoadGenerator: (nodes) => {
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith('postgres-baseline-load-node-');
            return {
              start: () => ({
                waitComplete: async () => {
                  if (!isBaselineLoad) {
                    loadCompleted = true;
                  }
                  return isBaselineLoad ?
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
                    };
                },
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.ok(Array.isArray(result.details.phaseTimeline));
    assert.ok(result.details.phaseTimeline.length > 0);
    assert.ok(result.details.channelMetrics);
    assert.equal(typeof result.details.channelMetrics.load.requests, 'number');
    assert.ok(result.details.parity, 'scenario should include parity details');
    assert.equal(typeof result.details.parity.status, 'string');
    assert.equal(typeof result.loadMetrics.targetOperations, 'number');
    assert.equal(typeof result.loadMetrics.dispatchedOperations, 'number');
    assert.equal(typeof result.loadMetrics.undispatchedOperations, 'number');
    assert.ok(result.loadMetrics.undispatchedByReason);
    assert.equal(
      typeof result.loadMetrics.undispatchedByReason.capacity,
      'number',
    );
    assert.equal(
      typeof result.loadMetrics.undispatchedByReason.durationTimeout,
      'number',
    );
    assert.equal(
      typeof result.loadMetrics.undispatchedByReason.cancelled,
      'number',
    );
    assert.ok(result.loadMetrics.perNode);
    const expectedChannelMetrics = [
      'requests',
      'successes',
      'errors',
      'timeouts',
      'retries',
      'breakerOpens',
      'budgetDenials',
      'timeoutBudgetMismatches',
      'timedOutInFlight',
    ];
    const channels = ['load', 'control', 'probe', 'snapshot'];
    for (const channel of channels) {
      assert.ok(
        result.details.channelMetrics[channel],
        'scenario should emit channel metrics for channel ' + channel,
      );
      for (const field of expectedChannelMetrics) {
        assert.equal(
          typeof result.details.channelMetrics[channel][field],
          'number',
          'channel metric should always include numeric field ' +
            channel +
            '.' +
            field,
        );
      }
    }
    assert.ok(Array.isArray(result.details.verification.verificationNodeIds));
    assert.ok(Array.isArray(result.details.verification.verificationExcludedNodeIds));
    assert.ok(result.details.benchmark.postLoadDrainReasonHistogram);
    assert.ok(
      Array.isArray(result.details.phaseReasonSummary.dominantWarnings),
      'report should include dominant warning reasons by phase',
    );
    assert.ok(
      Array.isArray(result.details.phaseReasonSummary.dominantErrors),
      'report should include dominant error reasons by phase',
    );
    assert.ok(
      Array.isArray(result.details.phaseDecisions),
      'report should include structured phase decisions',
    );
    assert.ok(
      result.details.phaseDecisions.some((entry) =>
        entry.phase === 'post_load_drain' &&
          typeof entry.phaseClass === 'string' &&
          typeof entry.policy === 'object' &&
          Array.isArray(entry.reasons) &&
          typeof entry.reasonClassHistogram === 'object'),
      'phase decisions should include policy, phase class, and reason classes',
    );
    assert.ok(
      result.details.startupDecisionRecord &&
        result.details.startupDecisionRecord.schemaVersion === 1 &&
        Array.isArray(result.details.startupDecisionRecord.phaseDecisions),
      'report should include canonical startup decision record',
    );
  });

  it('runs canonical orchestrator phases and avoids direct node query paths',
    async () => {
      const directQueryCalls = [];
      const queryWithTimeoutCalls = [];
      const provider = {
        createContainer: async (_options) => ({
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
            return {exitCode: 0, stdout: '0\\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          directQueryCalls.push(String(sql));
          throw new Error('direct query path invoked');
        },
        queryWithTimeout: async (sql) => {
          const statement = String(sql);
          queryWithTimeoutCalls.push(statement);
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark'}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement === 'SELECT * FROM control_snapshot_local()') {
            return {
              rows: [{
                schemaVersion: 1,
                nodeId: 'seed-1',
                capturedAt: Date.now(),
                nodes: ['seed-1'],
                partitions: ['p1'],
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              }],
            };
          }
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [{
                schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
                nodeId: 'seed-1',
                capturedAt: Date.now(),
                serviceCount: 1,
                replicaCount: 1,
                services: [{
                  serviceKey:
                    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
                    '|' +
                    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
                  logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                  protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
                  serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
                  desiredReplicaCount: 1,
                  desiredReplicaCountByServiceId: {
                    [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: 1,
                  },
                  observedReplicaCount: 1,
                  healthyReplicaCount: 1,
                  unhealthyReplicaCount: 0,
                  health: DEFAULT_DISCOVERY_HEALTH,
                  nodeCount: 1,
                  nodes: ['seed-1'],
                  replicas: [{
                    endpointId: 'sys-postgres-wire-ep-seed-1',
                    serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                    nodeId: 'seed-1',
                    address: '127.0.0.1',
                    port: DEFAULT_DISCOVERY_REPLICA_PORT,
                    healthStatus: DEFAULT_DISCOVERY_HEALTH,
                    updatedAt: Date.now(),
                    metadata: {},
                    readiness: {
                      workloadReady: true,
                      routingReady: true,
                      schemaReady: true,
                      replicaOpsInFlight: 0,
                      leadershipStable: true,
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      reasons: [],
                    },
                  }],
                }],
              }],
            };
          }
          return {rows: []};
        },
        getReachabilityDiagnostics: async () => ({
          nodeId: 'seed-1',
          reachable: true,
          adminReady: true,
        }),
      };

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
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 50,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            postLoadDrainTimeoutMs: 50,
            postLoadDrainPollIntervalMs: 5,
            postLoadDrainStableWindowMs: 0,
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
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
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
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        result.details.phaseTimeline.map((phase) => phase.phase),
        SCENARIO_PHASE_SEQUENCE,
        'scenario should report canonical orchestrator phase sequence',
      );
      assert.ok(
        result.details.phaseArtifacts.pre_load_gate,
        'scenario should expose pre-load gate artifacts',
      );
      assert.ok(
        result.details.phaseArtifacts.load,
        'scenario should expose load phase artifacts',
      );
      assert.equal(
        directQueryCalls.length,
        0,
        'scenario should not call NodeHandle.query directly',
      );
      assert.ok(
        queryWithTimeoutCalls.length > 0,
        'scenario should route node SQL via NodeClient channel operations',
      );
    });
});
