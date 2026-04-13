// @ts-nocheck
import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  run as scenarioRun,
  runWithVirtualScenarioTiming as run,
  installVirtualScenarioTiming,
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
      ip: PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
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

  it('defaults strict required fanout to cluster size when not explicitly configured',
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
            clients: 8,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            readyTimeoutMs: 500,
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
        'strict defaults should use full cluster fanout when required count is omitted',
      );
      assert.equal(result.details.benchmark.strictMode, true);
      assert.equal(result.details.benchmark.requiredSutLoadNodeCount, 2);
      assert.equal(result.details.benchmark.strictFanoutOptOut, false);
    });

  it('marks explicit strict fanout opt-out in benchmark report details',
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
            clients: 8,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            requiredSutLoadNodeCount: 1,
            readyTimeoutMs: 500,
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
      assert.equal(result.details.benchmark.strictMode, true);
      assert.equal(result.details.benchmark.strictFanoutOptOut, true);
      assert.match(
        String(result.details.benchmark.strictFanoutOptOutReason || ''),
        /requiredSutLoadNodeCount=1.*clusterCandidateLoadNodeCount=2/i,
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

  it('keeps baseline fanout aligned with partial discovery under strict parity',
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
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            strictParity: true,
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
      assert.deepEqual(
        loadCalls[1],
        ['postgres-baseline-load-node-1'],
        'baseline load should match the effective partial fanout under strict parity',
      );
      assert.ok(
        joinerDiscoveryCalls > 0,
        'discovery should attempt non-seed sources before partial fallback',
      );
      assert.equal(
        result.details.benchmark.baselineLoadNodeCountApplied,
        1,
        'benchmark details should report the effective baseline fanout',
      );
      assert.equal(
        result.details.parity.status,
        'matched',
        'strict parity should accept aligned partial fanout when discovery is soft',
      );
    });

  it('fails strict discovery when seven-node target cannot be reached',
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
      const joinerNodes = Array.from({length: 6}, (_unusedValue, index) => ({
        id: 'joiner-' + String(index + 1),
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
            throw new Error('Admin API query timed out');
          }
          return this.query(sql, params);
        },
      }));

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 8,
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 7,
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
        getNodes: () => asNodeHandles([seedNode, ...joinerNodes]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const timing = installVirtualScenarioTiming(cluster);
      await assert.rejects(
        scenarioRun(cluster),
        /insufficient_reachable_nodes/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict discovery failure should abort before load starts',
      );
      assert.ok(
        timing.getSleepCalls().length > 0,
        'strict discovery timeout path should consume virtual polls instead of waiting on wall clock',
      );
    });

  it('falls back to admin-ready nodes when non-strict local readiness never converges',
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

      function buildDiscoverySnapshotForNode(nodeId) {
        const snapshot = buildServiceDiscoverySnapshot({
          id: nodeId,
          _discoveryNodeIds: ['seed-1', 'joiner-1'],
        });
        const replicas = Array.isArray(snapshot?.services?.[0]?.replicas) ?
          snapshot.services[0].replicas : [];
        for (const replica of replicas) {
          replica.readiness = {
            workloadReady: true,
            benchmarkReady: true,
            routingReady: true,
            schemaReady: true,
            topologyReady: true,
            replicaOpsInFlight: 0,
            leadershipStable: true,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            reasons: [],
          };
          if (replica.nodeId === nodeId) {
            replica.benchmarkAdmission = {
              tableName: DEFAULT_DISCOVERY_TABLE_NAME,
              nodeId,
              state: 'blocked',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              localReplicaRole: 'candidate',
              degradedByOperationIds: [],
              reasons: [{
                code: 'local_replica_not_voter_ready',
                detail: nodeId,
              }],
            };
            continue;
          }
          replica.benchmarkAdmission = {
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            nodeId: replica.nodeId,
            state: 'ready',
            routingReady: true,
            schemaReady: true,
            topologyReady: true,
            localReplicaRole: 'voter',
            degradedByOperationIds: [],
            reasons: [],
          };
        }
        return snapshot;
      }

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
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
                rows: [buildDiscoverySnapshotForNode(this.id)],
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
            strictDiscovery: false,
            allowSoftDiscoveryNodeFallback: true,
            requiredSutLoadNodeCount: 1,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'non-strict discovery should fall back to admin-ready nodes when only local readiness blocks admission',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        true,
        'fallback should preserve timed-out diagnostics for non-converged local readiness',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.attempts < 20,
        'fallback should short-circuit stalled non-strict discovery before full timeout',
      );
    });

  it('extends strict discovery timeout to cover strict pre-load readiness budget',
    async () => {
      const loadCalls = [];
      let timingController = null;
      const requiredSchemaVersion = '1740589945123:7:seed-1';
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

      function createNode(nodeId, role, discoveryNodeIds) {
        return {
          id: nodeId,
          role,
          discoveryNodeIds,
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement === 'SELECT count(*) FROM benchmark_events WHERE 1 = 0') {
              return {rows: [{count: 0}]};
            }
            if (statement.includes('FROM tables')) {
              return {
                rows: [{
                  table_id: 'tbl-benchmark',
                  schema_version: requiredSchemaVersion,
                  updated_at: 1740589945123,
                }],
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              if (timingController && timingController.now() < 7) {
                return {
                  rows: [{
                    schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
                    nodeId: this.id,
                    capturedAt: Date.now(),
                    serviceCount: 0,
                    replicaCount: 0,
                    services: [],
                  }],
                };
              }
              const snapshot = buildServiceDiscoverySnapshot(this);
              const services = Array.isArray(snapshot.services) ?
                snapshot.services :
                [];
              for (const service of services) {
                const replicas = Array.isArray(service?.replicas) ?
                  service.replicas :
                  [];
                for (const replica of replicas) {
                  replica.readiness = {
                    ...(replica?.readiness || {}),
                    benchmarkReady: true,
                    topologyReady: true,
                    appliedSchemaVersion: requiredSchemaVersion,
                  };
                }
              }
              return {
                rows: [snapshot],
              };
            }
            return this.query(statement, params);
          },
          getReachabilityDiagnostics: async () => ({
            nodeId,
            reachable: true,
            adminReady: true,
          }),
        };
      }

      const seedNode = createNode('seed-1', 'seed', ['seed-1', 'joiner-1']);
      const joinerNode = createNode('joiner-1', 'joiner', ['seed-1', 'joiner-1']);
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
            strictDiscovery: true,
            strictPreloadReadiness: true,
            requiredSutLoadNodeCount: 2,
            readyTimeoutMs: 5,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 40,
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

      timingController = installVirtualScenarioTiming(cluster);
      const result = await scenarioRun(cluster);
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'strict discovery should keep polling until all required nodes are discovered',
      );
      assert.equal(
        loadCalls.length,
        2,
        'both sut and baseline loads should run after delayed strict discovery recovers',
      );
      assert.ok(
        timingController.getSleepCalls().some((durationMs) => durationMs > 0),
        'strict discovery should consume virtual poll time while waiting for readiness',
      );
    });

  it('discovers replicas when discovery readiness metadata is absent',
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

      function buildDiscoverySnapshotWithoutReadiness(nodeId, replicaNodeIds) {
        const normalizedReplicaNodeIds =
          replicaNodeIds.map((value) => String(value));
        const replicaCount = normalizedReplicaNodeIds.length;
        const serviceId = NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE;
        const protocol = NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL;
        const capturedAt = Date.now();
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId,
          capturedAt,
          serviceCount: 1,
          replicaCount,
          services: [{
            serviceKey: serviceId + '|' + protocol,
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
            nodes: normalizedReplicaNodeIds,
            replicas: normalizedReplicaNodeIds.map((replicaNodeId) => ({
              endpointId: serviceId + '-ep-' + replicaNodeId,
              serviceId,
              nodeId: replicaNodeId,
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: capturedAt,
              metadata: {},
            })),
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildDiscoverySnapshotWithoutReadiness(
                this.id,
                ['seed-1', 'joiner-1'],
              )],
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
              rows: [buildDiscoverySnapshotWithoutReadiness(
                this.id,
                ['seed-1', 'joiner-1'],
              )],
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
        'sut load should include discovered replicas without readiness metadata',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'benchmark details should report discovered replicas despite missing readiness',
      );
    });

  it('requires admin-ready probes before admitting discovered load nodes',
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
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
        getReachabilityDiagnostics: async () => ({
          nodeId: 'joiner-1',
          reachable: true,
          adminReady: false,
          controlPlaneRecoveryReady: false,
          reachableBy: 'bootstrap_health',
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
            readyTimeoutMs: 120,
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
        'sut load should exclude discovered nodes that are not admin-ready',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        true,
        'admin-ready gating should keep unmet fanout as a timed out discovery',
      );
    });

  it('admits discovered load nodes once control-plane recovery is ready',
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
        discoveryNodeIds: ['seed-1', 'joiner-1'],
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
        getReachabilityDiagnostics: async () => ({
          nodeId: 'joiner-1',
          reachable: true,
          adminReady: false,
          controlPlaneRecoveryReady: true,
          recoveryStage: 'control_plane_recovery_ready',
          recoveryStageRank: 2,
          reachableBy: 'bootstrap_health',
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
            readyTimeoutMs: 120,
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
        'benchmark discovery should admit nodes once the control-plane recovery gate is open even before admin health is green',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        false,
        'recovery-ready admission should avoid artificial discovery timeout',
      );
    });

  it('requires local self-discovery confirmation before admitting discovered load nodes',
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

      const capturedAt = Date.now();
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
        queryWithTimeout: async (sql, _params = [], _options = {}) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: 'seed-1',
                _discoveryNodeIds: ['seed-1', 'joiner-1'],
              })],
            };
          }
          return seedNode.query(statement);
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
        queryWithTimeout: async (sql, _params = [], _options = {}) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [{
                schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
                nodeId: 'joiner-1',
                capturedAt,
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
                  unhealthyReplicaCount: 0,
                  health: DEFAULT_DISCOVERY_HEALTH,
                  nodeCount: 2,
                  nodes: ['seed-1', 'joiner-1'],
                  replicas: [{
                    endpointId:
                      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
                    serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                    nodeId: 'seed-1',
                    address: '127.0.0.1',
                    port: DEFAULT_DISCOVERY_REPLICA_PORT,
                    healthStatus: DEFAULT_DISCOVERY_HEALTH,
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
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      reasons: [],
                    },
                  }, {
                    endpointId:
                      NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
                    serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                    nodeId: 'joiner-1',
                    address: '127.0.0.1',
                    port: DEFAULT_DISCOVERY_REPLICA_PORT,
                    healthStatus: DEFAULT_DISCOVERY_HEALTH,
                    updatedAt: capturedAt,
                    metadata: {},
                    readiness: {
                      workloadReady: false,
                      benchmarkReady: false,
                      routingReady: true,
                      schemaReady: true,
                      topologyReady: false,
                      replicaOpsInFlight: 1,
                      leadershipStable: false,
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      reasons: [{
                        code: 'local_replica_not_voter_ready',
                        detail: 'joiner-local-view-lagging',
                      }],
                    },
                    benchmarkAdmission: {
                      tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                      nodeId: 'joiner-1',
                      state: 'blocked',
                      routingReady: true,
                      schemaReady: true,
                      topologyReady: false,
                      localReplicaRole: 'candidate',
                      degradedByOperationIds: [],
                      reasons: [{
                        code: 'local_replica_not_voter_ready',
                        detail: 'joiner-local-view-lagging',
                      }],
                    },
                  }],
                }],
              }],
            };
          }
          return joinerNode.query(statement);
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
            readyTimeoutMs: 120,
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
        'sut load should exclude nodes whose local discovery view does not confirm readiness',
      );
      assert.match(
        JSON.stringify(result.details.benchmark.sutLoadDiscovery),
        /local_replica_not_voter_ready/i,
        'discovery diagnostics should include canonical benchmark admission exclusion detail',
      );
    });

  it('requires benchmark table probe success before admitting discovered load nodes',
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
            return {rows: [{value: 1}]};
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
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        discoveryNodeIds: ['seed-1', 'joiner-1'],
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
        queryWithTimeout: async (sql, _params = [], options = {}) => {
          const statement = String(sql);
          if (options?.lane === 'load' && statement === benchmarkTableProbeSql) {
            throw new Error('benchmark table probe timed out');
          }
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        getReachabilityDiagnostics: async () => ({
          nodeId: 'joiner-1',
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
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
            readyTimeoutMs: 120,
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
        'sut load should exclude discovered nodes whose load lane probe fails',
      );
      assert.match(
        JSON.stringify(result.details.benchmark.sutLoadDiscovery),
        /load_probe/i,
        'discovery diagnostics should record load-lane probe failures',
      );
    });

  it('requires schema-ready discovery before admitting discovered load nodes',
    async () => {
      const loadCalls = [];
      const discoveryQueryStatements = [];
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

      const buildDiscoverySnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
        capturedAt: Date.now(),
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
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 2,
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
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
              tableName: 'benchmark_events',
              reasons: [],
            },
          }, {
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: false,
              replicaOpsInFlight: 0,
              leadershipStable: true,
              tableName: 'benchmark_events',
              reasons: [{
                code: 'schema_not_ready',
                detail: 'table "benchmark_events" missing',
              }],
            },
          }],
        }],
      });

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        queryWithTimeout: async (sql) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            discoveryQueryStatements.push(statement);
            return {
              rows: [buildDiscoverySnapshot('seed-1')],
            };
          }
          return seedNode.query(sql);
        },
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
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async (sql) => {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            discoveryQueryStatements.push(statement);
            return {
              rows: [buildDiscoverySnapshot('joiner-1')],
            };
          }
          return joinerNode.query(sql);
        },
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude discovered nodes that are not schema-ready',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.sourceResults
          .some((sourceResult) =>
            Array.isArray(
              sourceResult.excludedReadinessByNodeId?.['joiner-1'],
            ) &&
            sourceResult.excludedReadinessByNodeId['joiner-1']
              .some((reason) => reason.startsWith('schema_not_ready')),
          ),
        'discovery diagnostics should record schema readiness exclusions',
      );
      const expectedDiscoverySql = SERVICE_DISCOVERY_SQL_PREFIX +
        '\'' + DEFAULT_DISCOVERY_TABLE_NAME + '\')';
      const expectedDiscoverySqlWithTableId = SERVICE_DISCOVERY_SQL_PREFIX +
        '\'' + DEFAULT_DISCOVERY_TABLE_NAME + '\', \'tbl-benchmark\')';
      assert.ok(
        discoveryQueryStatements.length > 0,
        'schema-ready discovery should query service_discovery_local()',
      );
      assert.ok(
        discoveryQueryStatements.every((statement) =>
          statement === expectedDiscoverySql ||
            statement === expectedDiscoverySqlWithTableId),
        'schema-ready discovery should scope service discovery by benchmark table',
      );
    });

  it('admits discovered nodes when load-lane probe confirms stale local schema blockers',
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

      const buildSeedDiscoverySnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
        capturedAt: Date.now(),
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
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 2,
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'seed-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }, {
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }],
        }],
      });

      const buildJoinerLocalSnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
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
          nodes: ['joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: false,
              replicaOpsInFlight: 0,
              leadershipStable: false,
              tableName: 'benchmark_events',
              reasons: [{
                code: 'schema_partition_unavailable',
                detail: 'table "benchmark_events" not query-ready on node',
              }, {
                code: 'leadership_unstable',
                detail: 'leader coverage incomplete for readiness scope',
              }],
            },
          }],
        }],
      });

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        queryWithTimeout: async function(sql) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildSeedDiscoverySnapshot(this.id)],
            };
          }
          return this.query(sql);
        },
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
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          return {rows: []};
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async function(sql) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildJoinerLocalSnapshot(this.id)],
            };
          }
          return this.query(sql);
        },
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
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should admit discovered nodes when load-lane confirmation overrides stale local blockers',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.reachableNodeIds
          .includes('joiner-1'),
        'diagnostics should report load-lane-confirmed nodes as reachable',
      );
    });

  it('admits discovered nodes when control-lane probes clear stale blockers after load-lane denial',
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

      const buildSeedDiscoverySnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
        capturedAt: Date.now(),
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
          unhealthyReplicaCount: 0,
          health: DEFAULT_DISCOVERY_HEALTH,
          nodeCount: 2,
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'seed-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }, {
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            benchmarkAdmission: {
              state: 'ready',
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              tableName: 'benchmark_events',
              localReplicaRole: 'voter',
              degradedByOperationIds: [],
              reasons: [],
            },
          }],
        }],
      });

      const buildJoinerLocalSnapshot = (originNodeId) => ({
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId: originNodeId,
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
          nodes: ['joiner-1'],
          replicas: [{
            endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: DEFAULT_DISCOVERY_REPLICA_PORT,
            healthStatus: DEFAULT_DISCOVERY_HEALTH,
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: false,
              replicaOpsInFlight: 0,
              leadershipStable: false,
              tableName: 'benchmark_events',
              reasons: [{
                code: 'schema_partition_unavailable',
                detail: 'table "benchmark_events" not query-ready on node',
              }, {
                code: 'leadership_unstable',
                detail: 'leader coverage incomplete for readiness scope',
              }],
            },
          }],
        }],
      });

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        queryWithTimeout: async function(sql) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildSeedDiscoverySnapshot(this.id)],
            };
          }
          return this.query(sql);
        },
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
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          return {rows: []};
        },
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        queryWithTimeout: async function(sql, _params = [], options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
            statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildJoinerLocalSnapshot(this.id)],
            };
          }
          if (String(options?.lane || '') === 'load' &&
            (statement === 'SELECT 1' || statement === benchmarkTableProbeSql)) {
            throw new Error(
              'serve not ready: load lane admission denied on node joiner-1',
            );
          }
          return this.query(sql);
        },
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
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
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
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should admit nodes when control-lane benchmark probes clear stale local blockers',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.reachableNodeIds
          .includes('joiner-1'),
        true,
        'diagnostics should keep control-lane-confirmed nodes in the reachable load set',
      );
    });

  it('excludes discovered nodes when canonical benchmark readiness is false',
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

      function buildDiscoverySnapshot(nodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId,
          capturedAt: Date.now(),
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
            unhealthyReplicaCount: 0,
            health: DEFAULT_DISCOVERY_HEALTH,
            nodeCount: 2,
            nodes: ['seed-1', 'joiner-1'],
            replicas: [{
              endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-seed-1',
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: 'seed-1',
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: Date.now(),
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: true,
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                replicaOpsInFlight: 0,
                leadershipStable: true,
                tableName: 'benchmark_events',
                reasons: [],
              },
            }, {
              endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-joiner-1',
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: 'joiner-1',
              address: '127.0.0.1',
              port: DEFAULT_DISCOVERY_REPLICA_PORT,
              healthStatus: DEFAULT_DISCOVERY_HEALTH,
              updatedAt: Date.now(),
              metadata: {},
              readiness: {
                workloadReady: false,
                benchmarkReady: false,
                routingReady: true,
                schemaReady: true,
                topologyReady: false,
                replicaOpsInFlight: 2,
                leadershipStable: false,
                tableName: 'benchmark_events',
                reasons: [{
                  code: 'replica_operations_in_flight',
                  detail: '2',
                }, {
                  code: 'leadership_unstable',
                  detail: 'leader coverage incomplete for readiness scope',
                }],
              },
            }],
          }],
        };
      }

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
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
                rows: [buildDiscoverySnapshot(this.id)],
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

      const seedNode = createNode('seed-1', 'seed');
      const joinerNode = createNode('joiner-1', 'joiner');

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
            strictDiscovery: true,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
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
        getNodes: () => [seedNode, joinerNode],
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /insufficient_reachable_nodes.*joiner-1:(?:replica_operations_in_flight=2\|leadership_unstable|leadership_unstable[^|]*\|replica_operations_in_flight=2)/i,
        'strict discovery should fail closed when canonical readiness excludes a required replica',
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict discovery failure should abort before sut load starts',
      );
    });

  it('prefers canonical benchmark admission over optimistic readiness booleans',
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

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
          _discoveryNodeIds: ['seed-1', 'joiner-1'],
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              const snapshot = buildServiceDiscoverySnapshot(this);
              const joinerReplica = snapshot.services[0].replicas.find((replica) =>
                replica.nodeId === 'joiner-1');
              joinerReplica.readiness = {
                workloadReady: true,
                benchmarkReady: true,
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                replicaOpsInFlight: 0,
                leadershipStable: true,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                reasons: [],
              };
              joinerReplica.benchmarkAdmission = {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: 'joiner-1',
                state: 'blocked',
                routingReady: true,
                schemaReady: true,
                topologyReady: true,
                localReplicaRole: 'follower',
                degradedByOperationIds: [],
                reasons: [{
                  code: 'local_replica_not_voter_ready',
                  detail: 'p1',
                }],
              };
              return {
                rows: [snapshot],
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1'],
        'sut load should exclude nodes blocked by canonical benchmark admission',
      );
      assert.ok(
        result.details.benchmark.sutLoadDiscovery.sourceResults
          .some((sourceResult) =>
            Array.isArray(
              sourceResult.excludedReadinessByNodeId?.['joiner-1'],
            ) &&
            sourceResult.excludedReadinessByNodeId['joiner-1']
              .includes('local_replica_not_voter_ready=p1')),
        'discovery diagnostics should expose canonical benchmark admission reasons',
      );
    });

  it('reports legacy readiness fallback when runtime admission is absent',
    async () => {
      const loadCalls = [];
      const provider = {
        createContainer: async () => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async () => ({
          exitCode: 0,
          stdout: '',
          stderr: '',
        }),
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      function createNode(nodeId, role) {
        return {
          id: nodeId,
          role,
          _discoveryNodeIds: ['seed-1', 'joiner-1'],
          query: async (sql) => {
            const statement = String(sql);
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement === `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`) {
              return {rows: [{count: 0}]};
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
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload(this.id)],
              };
            }
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              const snapshot = buildServiceDiscoverySnapshot(this);
              for (const replica of snapshot.services[0].replicas) {
                replica.readiness = {
                  workloadReady: true,
                  benchmarkReady: true,
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                  replicaOpsInFlight: 0,
                  leadershipStable: true,
                  tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                  reasons: [],
                };
                delete replica.benchmarkAdmission;
              }
              return {
                rows: [snapshot],
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
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'compatibility fallback still admits nodes when only legacy readiness exists',
      );
      assert.deepEqual(
        result.details.runtimeAdmissionOwnership.selection.legacyFallbackNodeIds,
        ['joiner-1', 'seed-1'],
        'scenario should surface legacy discovery selection fallback nodes',
      );
      assert.deepEqual(
        result.details.runtimeAdmissionOwnership.localReplicaConfirmation.
          legacyFallbackNodeIds,
        ['joiner-1', 'seed-1'],
        'scenario should surface local replica confirmation fallback nodes',
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
        (error) => {
          const message = String(error?.message || error);
          assert.match(
            message,
            /No discovered admin-ready load service nodes available for benchmark load/i,
          );
          assert.match(
            message,
            /probes=.*(probe timeout|circuit breaker is open)/i,
            'failure should include per-node readiness probe diagnostics',
          );
          return true;
        },
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

  it('recovers discovery fanout after transient admin connection refusals',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      let joinerDiscoveryAttempts = 0;
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
            joinerDiscoveryAttempts += 1;
            if (joinerDiscoveryAttempts <= 3) {
              throw new Error('connect ECONNREFUSED 172.18.0.3:8081');
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
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 150,
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
        'sut load should recover full fanout after transient discovery errors',
      );
      assert.ok(
        joinerDiscoveryAttempts >= 4,
        'discovery should keep retrying transient connection refusals',
      );
      assert.equal(
        result.details.benchmark.sutLoadDiscovery.timedOut,
        false,
        'fanout should converge instead of falling back to partial discovery',
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
        /No discovered admin-ready load service nodes available for benchmark load/i,
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run load when canonical postgres-wire discovery is empty',
      );
    });

});
