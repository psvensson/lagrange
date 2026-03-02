import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  runWithVirtualScenarioTiming as run,
  resolveBenchmarkConfig,
  buildComparison,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  SCENARIO_PHASE_SEQUENCE,
  PROBE_SQL,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_DISCOVERY_HEALTH,
  DEFAULT_DISCOVERY_REPLICA_PORT,
  DISCOVERY_ADMIN_META_SERVICE_ID,
  DISCOVERY_ADMIN_META_PROTOCOL,
  SERVICE_DISCOVERY_SQL_PREFIX,
  DEFAULT_DISCOVERY_TABLE_NAME,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
  QUIET_MODE_ACTION_ENTER,
  QUIET_MODE_ACTION_EXIT,
  QUIET_MODE_PHASE_PRE_FLIGHT,
  QUIET_MODE_PHASE_TEARDOWN,
  isRecord,
  buildControlSnapshotPayload,
  hasValidControlSnapshotResult,
  hasValidServiceDiscoveryResult,
  buildServiceDiscoverySnapshot,
  buildPreflightCriticalPathSnapshotPayload,
  asNodeHandle,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';


describe('postgres-baseline-comparison scenario', () => {
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
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
      let laggingTableProbeCount = 0;
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            laggingTableProbeCount += 1;
            if (laggingTableProbeCount > 1) {
              throw new Error('table probe timed out');
            }
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          return this.query(String(sql), params);
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
      (error) => {
        assert.match(
          String(error?.message || ''),
          /load run completed with operation errors/i,
        );
        assert.equal(
          error?.diagnostics?.failedPhase?.phase,
          'verify',
          'failure diagnostics should expose the failing phase',
        );
        assert.equal(
          error?.diagnostics?.loadMetrics?.errors,
          1,
          'failure diagnostics should preserve load metrics',
        );
        assert.equal(
          error?.diagnostics?.failedPhase?.artifacts?.loadMetrics?.failed,
          1,
          'failed phase artifacts should preserve failed operation count',
        );
        assert.equal(
          error?.diagnostics?.failedPhase?.artifacts?.loadMetrics?.errors,
          1,
          'failed phase artifacts should preserve operation error count',
        );
        return true;
      },
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
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
