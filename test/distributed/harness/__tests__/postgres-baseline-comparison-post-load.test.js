import {
  describe,
  it,
  assert,
  runWithVirtualScenarioTiming as run,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  buildControlSnapshotPayload,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';
import {registerPostgresBaselineComparisonPostLoadTailTests} from './postgres-baseline-comparison-post-load-tail-test-cases.js';

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
        getAdminQueryTraceSnapshot: function() {
          return [{
            nodeId: this.id,
            queryId: 'q-load-timeout-1',
            lane: 'load',
            operation: 'queryLoad',
            timeoutMs: 4000,
            durationMs: 4000,
            outcome: 'timeout',
            error: 'Admin API query timed out',
          }];
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

  it('uses evaluator snapshots for single-pass consistency verification', async () => {
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
      getAdminQueryTraceSnapshot: function() {
        return [{
          nodeId: this.id,
          queryId: 'q-load-timeout-1',
          lane: 'load',
          operation: 'queryLoad',
          timeoutMs: 4000,
          durationMs: 4000,
          outcome: 'timeout',
          error: 'Admin API query timed out',
        }];
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
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.ok(
      result.loadMetrics,
      'scenario should complete with evaluator-based consistency',
    );
    assert.equal(
      result.details.benchmark.consistencyAssertionAttempts,
      1,
      'evaluator-based verify uses single-pass ' +
        'assertConsistencyFromSnapshots',
    );
  });

  it('retries control snapshots with forced repair after partition-set mismatch',
    async () => {
      let forcedSnapshotCalls = 0;
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

      const sharedNodes = ['seed-1', 'joiner-1'];
      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement ===
            'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
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
                updated_at: 1740589945123,
              }],
            };
          }
          if (statement.startsWith(
            'UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {
              rows: [
                {partition_id: 'p1'},
                {partition_id: 'p2'},
              ],
            };
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _opts = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL ||
            statement ===
              NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                nodes: sharedNodes,
                partitions: ['p1', 'p2'],
                leaders: {
                  p1: 'seed-1',
                  p2: 'seed-1',
                },
              })],
            };
          }
          return this.query(statement, params);
        },
      };

      const laggingNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement ===
            'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
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
                updated_at: 1740589945123,
              }],
            };
          }
          if (statement.startsWith(
            'UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {
              rows: [
                {partition_id: 'p1'},
                {partition_id: 'p2'},
              ],
            };
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _opts = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                nodes: sharedNodes,
                partitions: ['p1'],
                leaders: {p1: 'seed-1'},
              })],
            };
          }
          if (statement ===
            NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
            forcedSnapshotCalls++;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                nodes: sharedNodes,
                partitions: ['p1', 'p2'],
                leaders: {
                  p1: 'seed-1',
                  p2: 'seed-1',
                },
              })],
            };
          }
          return this.query(statement, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            baselineLoadNodeCount: 2,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 200,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            postLoadDrainTimeoutMs: 200,
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
        getNodes: () => asNodeHandles([seedNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(
        forcedSnapshotCalls,
        1,
        'verification should force one authoritative refresh on lagging node',
      );
      assert.equal(
        result.details.verification.verdict,
        'consistent',
        'verification should converge after forced snapshot refresh',
      );
    });

  it('retries control snapshots with forced repair after leader ' +
    'identity mismatch from CDC propagation gap', async () => {
    let forcedSnapshotCalls = 0;
    const provider = {
      createContainer: async (_options) => ({
        containerId: 'benchmark-postgres-1',
        ip: '172.18.0.80',
        name: 'benchmark-postgres-1',
      }),
      execInContainer: async (_containerId, cmd) => {
        const command = String(cmd[2] || '');
        if (command.includes('pg_isready')) {
          return {
            exitCode: 0,
            stdout: 'accepting connections',
            stderr: '',
          };
        }
        if (command.includes('pg_stat_replication')) {
          return {exitCode: 0, stdout: '0\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const sharedNodes = ['seed-1', 'joiner-1'];
    const sharedPartitions = ['p1', 'p2', 'p2-left'];
    const fullLeaders = {
      'p1': 'seed-1',
      'p2': 'seed-1',
      'p2-left': 'seed-1',
    };
    const laggingLeaders = {
      p1: 'seed-1',
      p2: 'seed-1',
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement ===
            'SELECT count(*) FROM benchmark_events ' +
            'WHERE 1 = 0') {
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
              updated_at: 1740589945123,
            }],
          };
        }
        if (statement.startsWith(
          'UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {
            rows: sharedPartitions.map(
              (partitionId) => ({partition_id: partitionId}),
            ),
          };
        }
        return {rows: []};
      },
      queryWithTimeout: async function(
        sql, params = [], _opts = {},
      ) {
        const statement = String(sql);
        if (statement ===
            NODE_CLIENT_CONTROL_SNAPSHOT_SQL ||
            statement ===
              NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              nodes: sharedNodes,
              partitions: sharedPartitions,
              leaders: fullLeaders,
            })],
          };
        }
        return this.query(statement, params);
      },
    };

    const laggingNode = {
      id: 'joiner-1',
      role: 'joiner',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement ===
            'SELECT count(*) FROM benchmark_events ' +
            'WHERE 1 = 0') {
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
              updated_at: 1740589945123,
            }],
          };
        }
        if (statement.startsWith(
          'UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {
            rows: sharedPartitions.map(
              (partitionId) => ({partition_id: partitionId}),
            ),
          };
        }
        return {rows: []};
      },
      queryWithTimeout: async function(
        sql, params = [], _opts = {},
      ) {
        const statement = String(sql);
        if (statement ===
            NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              nodes: sharedNodes,
              partitions: sharedPartitions,
              leaders: laggingLeaders,
            })],
          };
        }
        if (statement ===
            NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL) {
          forcedSnapshotCalls++;
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              nodes: sharedNodes,
              partitions: sharedPartitions,
              leaders: fullLeaders,
            })],
          };
        }
        return this.query(statement, params);
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 5,
          clients: 2,
          jobs: 1,
          baselineLoadNodeCount: 2,
          loadOpsPerSec: 40,
          loadDuration: '5s',
          loadMaxInFlight: 64,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 200,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          postLoadDrainTimeoutMs: 200,
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
                      latency: {
                        avg: 1, p50: 1, p95: 2, p99: 2,
                      },
                    } :
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {
                        avg: 4, p50: 3, p95: 6, p99: 7,
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
      getNodes: () => asNodeHandles([seedNode, laggingNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    const result = await run(cluster);
    assert.equal(
      forcedSnapshotCalls,
      1,
      'verification should force authoritative refresh ' +
          'on node with missing split-child leader',
    );
    assert.equal(
      result.details.verification.verdict,
      'consistent',
      'verification should converge after forced ' +
          'leader-mismatch snapshot refresh',
    );
  });

  registerPostgresBaselineComparisonPostLoadTailTests({
    it,
  });
});
