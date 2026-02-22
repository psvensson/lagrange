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
  SCENARIO_PHASE_SEQUENCE,
} from '../constants.js';

const PROBE_SQL = 'SELECT 1';
const DEFAULT_PROBE_TIMEOUT_MS = 1000;

function asNodeHandle(node) {
  const adapted = {...node};
  if (typeof adapted.queryWithTimeout !== 'function') {
    adapted.queryWithTimeout = async (sql, params = [], _options = {}) => {
      if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
        return {
          rows: [{
            schemaVersion: 1,
            nodeId: String(adapted.id || 'unknown'),
            capturedAt: Date.now(),
            nodes: [String(adapted.id || 'unknown')],
            partitions: ['p1'],
            leaders: {p1: 'seed-1'},
            replicaOperations: {
              inFlightCount: 0,
              statusHistogram: {},
            },
          }],
        };
      }
      return adapted.query(sql, params);
    };
  }
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
  return nodes.map((node) => asNodeHandle(node));
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
                      failed: 2,
                      errors: 2,
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
                        failed: 2,
                        errors: 2,
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

  it('uses all queryable SUT nodes for shared load generation', async () => {
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
      'sut load should include all queryable nodes and skip failing probe node',
    );
    assert.equal(
      result.details.benchmark.sutLoadNodeCount,
      2,
      'benchmark details should report queryable SUT load node count',
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

  it('uses ready load-node subset when one node never reaches table visibility',
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

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should exclude nodes that fail benchmark table visibility probe',
      );
      assert.equal(
        result.details.benchmark.sutEligibleLoadNodeCount,
        3,
        'benchmark details should include all initially queryable nodes',
      );
      assert.deepEqual(
        result.details.benchmark.sutExcludedLoadNodeIds,
        ['joiner-2'],
        'benchmark details should report nodes excluded by quiescence readiness',
      );
    });

  it('uses last known ready subset when quiescence ends on in-flight probe error',
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

      const result = await run(cluster);
      assert.ok(
        inFlightProbeCount > 1,
        'scenario should continue polling after initial successful in-flight probe',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should use last known ready subset when in-flight probe errors persist',
      );
      assert.deepEqual(
        result.details.benchmark.sutExcludedLoadNodeIds,
        ['joiner-2'],
        'benchmark details should still report excluded lagging nodes',
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
          typeof entry.policy === 'object' &&
          Array.isArray(entry.reasons)),
      'phase decisions should include policy and reason list',
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
          throw new Error('legacy direct query path invoked');
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
