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
  probeLoadLaneReadiness,
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
import {
  SUT_LOAD_NODE_ADMISSION_STATE,
  hasLoadLaneConfirmableLocalReadinessBlock,
  normalizeSutLoadNodeAdmissionEvidence,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadNodeAdmissionDecisionTrace,
  shouldPreserveTopologyDeferredAdmission,
  shouldConfirmLocalReadinessViaLoadLane,
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
  RERUN_20260403T102148Z_NODE_ADMISSION_CASES,
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';
import {QUERY_DEFAULTS} from '../../../../src/query/query-constants.js';


describe('postgres-baseline-comparison scenario', () => {
  it('rechecks transient leadership-unknown invariant before failing strict preload gate',
    async () => {
      let loadGeneratorCalls = 0;
      let preflightSnapshotCalls = 0;
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

      function buildDiscoverySnapshot(sourceNodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
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
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: [],
              },
            }],
          }],
        };
      }

      function buildTransientLeadershipUnknownSnapshot(node) {
        const unknownPartition = {
          leaderKnown: false,
          leaderNodeId: null,
          isLeaderLocal: false,
          lastErrorCode: 'leader_service_missing',
        };
        return buildPreflightCriticalPathSnapshotPayload(node, {
          controlPlanePartitions: {
            nodes: {...unknownPartition},
            services: {...unknownPartition},
            node_endpoints: {...unknownPartition},
            service_endpoints: {...unknownPartition},
          },
        });
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            loadNodeMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictBenchmarkMode: true,
            strictDiscovery: true,
            strictPreloadReadiness: true,
            requiredSutLoadNodeCount: 1,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
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
          nodeClient: {
            channelPolicies: {
              snapshot: {
                retryBudget: 0,
                circuitBreakerThreshold: 10,
              },
            },
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
              loadGeneratorCalls += 1;
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
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
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement ===
              `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`) {
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
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
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              preflightSnapshotCalls += 1;
              if (preflightSnapshotCalls === 1) {
                return {
                  rows: [buildTransientLeadershipUnknownSnapshot(this)],
                };
              }
              return {
                rows: [buildPreflightCriticalPathSnapshotPayload(this)],
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
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should recover from transient leadership-unknown snapshots',
      );
      assert.ok(
        preflightSnapshotCalls >= 2,
        'strict pre-load invariant gate should re-check transient breaches',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should continue through SUT and baseline load phases',
      );
      assert.equal(
        result.details.benchmark.strictBenchmarkGate.invariants.status,
        'ok',
      );
      assert.ok(
        result.details.benchmark.strictBenchmarkGate.invariants.retryAttempts >= 1,
        'strict benchmark gate should record at least one transient retry',
      );
    });

  it('does not hard-fail pre-load invariants when only strict parity is enabled',
    async () => {
      let loadGeneratorCalls = 0;
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

      function buildDiscoverySnapshot(sourceNodeId) {
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
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
            nodes: [sourceNodeId],
            replicas: [{
              endpointId:
                NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + sourceNodeId,
              serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
              nodeId: sourceNodeId,
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
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: [],
              },
            }],
          }],
        };
      }

      function buildLeadershipUnknownSnapshot(node) {
        const unknownPartition = {
          leaderKnown: false,
          leaderNodeId: null,
          isLeaderLocal: false,
          lastErrorCode: 'leader_service_missing',
        };
        return buildPreflightCriticalPathSnapshotPayload(node, {
          controlPlanePartitions: {
            nodes: {...unknownPartition},
            services: {...unknownPartition},
            node_endpoints: {...unknownPartition},
            service_endpoints: {...unknownPartition},
          },
        });
      }

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            loadNodeMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictParity: true,
            strictDiscovery: false,
            strictPreloadReadiness: false,
            requiredSutLoadNodeCount: 1,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
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
              loadGeneratorCalls += 1;
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
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
            if (statement === 'SELECT 1') {
              return {rows: [{value: 1}]};
            }
            if (statement ===
              `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`) {
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
            if (statement.includes('FROM services')) {
              return {
                rows: [{
                  partition_id: 'p1',
                  node_id: 'seed-1',
                  status: 'active',
                }],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
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
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              return {
                rows: [buildLeadershipUnknownSnapshot(this)],
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
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should continue when strict preload readiness is disabled',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should execute SUT and baseline load phases',
      );
      assert.equal(
        result.details.benchmark.strictBenchmarkGate.invariants,
        null,
        'strict invariant gate should stay disabled outside strict preload mode',
      );
    });

  it('routes benchmark metadata lookups through canonical fallback for non-owner nodes',
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
          if (statement.includes('FROM tables') ||
            statement.includes('FROM partitions')) {
            throw new Error('local system table partition is not available');
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
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
            forceLocalSystemTableReadShortcut: true,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          nodeClient: {
            channelPolicies: {
              control: {
                circuitBreakerThreshold: 1000,
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
      assert.equal(
        result.details.benchmark.systemTableReadPath.mode,
        'canonical_fallback',
        'benchmark metadata reads should use canonical fallback path',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'non-owner nodes should still participate in load fanout',
      );
    });

  it('does not fan out mutating benchmark table writes to fallback nodes', async () => {
    const loadCalls = [];
    const seedMutationStatements = [];
    const joinerMutationStatements = [];
    const benchmarkTableProbeSql = 'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const benchmarkTableDdlPrefix = 'CREATE TABLE IF NOT EXISTS benchmark_events';
    const benchmarkTablePolicyPrefix = 'UPDATE tables SET table_policies';
    const benchmarkPartitionRepairPrefix = 'UPDATE partitions SET table_name';
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
        if (statement.startsWith(benchmarkTableDdlPrefix)) {
          seedMutationStatements.push(statement);
          throw new Error('query timed out');
        }
        if (statement.startsWith(benchmarkTablePolicyPrefix) ||
          statement.startsWith(benchmarkPartitionRepairPrefix)) {
          seedMutationStatements.push(statement);
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
        if (statement.includes('FROM replica_operations') &&
          statement.includes('status NOT IN')) {
          return {rows: []};
        }
        if (statement.startsWith(benchmarkTableDdlPrefix) ||
          statement.startsWith(benchmarkTablePolicyPrefix) ||
          statement.startsWith(benchmarkPartitionRepairPrefix)) {
          joinerMutationStatements.push(statement);
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
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
          forceLocalSystemTableReadShortcut: true,
          readyTimeoutMs: 120,
          readyPollIntervalMs: 5,
          quiescentTimeoutMs: 120,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
        },
        nodeClient: {
          channelPolicies: {
            control: {
              circuitBreakerThreshold: 1000,
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
            loadCalls.push(nodes.map((node) => node.id));
            return {
              start: () => ({
                waitComplete: async () => ({
                  total: 100,
                  success: 100,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 100,
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
      getNodes: () => asNodeHandles([seedNode, joinerNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    await run(cluster);
    assert.ok(
      seedMutationStatements.some((statement) =>
        statement.startsWith(benchmarkTableDdlPrefix)),
      'canonical node should receive benchmark table create mutation',
    );
    assert.equal(
      joinerMutationStatements.length,
      0,
      'mutating benchmark table writes should not fan out to fallback nodes',
    );
    assert.ok(
      loadCalls.length > 0,
      'non-strict bootstrap should continue once table and partition metadata are visible',
    );
  });

  it('uses an explicit create-table timeout budget above the provisioning timeout',
    async () => {
      const ddlTimeouts = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const benchmarkTableDdlPrefix =
        'CREATE TABLE IF NOT EXISTS benchmark_events';
      const benchmarkTablePolicyPrefix = 'UPDATE tables SET table_policies';
      const benchmarkPartitionRepairPrefix = 'UPDATE partitions SET table_name';
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
          if (statement.startsWith(benchmarkTableDdlPrefix) ||
            statement.startsWith(benchmarkTablePolicyPrefix) ||
            statement.startsWith(benchmarkPartitionRepairPrefix)) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], options = {}) {
          const statement = String(sql);
          if (statement.startsWith(benchmarkTableDdlPrefix)) {
            ddlTimeouts.push({
              lane: options.lane,
              timeoutMs: options.timeoutMs,
            });
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
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            controlQueryTimeoutMs: 15000,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            forceLocalSystemTableReadShortcut: true,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          nodeClient: {
            channelPolicies: {
              control: {
                circuitBreakerThreshold: 1000,
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
            createLoadGenerator: () => ({
              start: () => ({
                waitComplete: async () => ({
                  total: 100,
                  success: 100,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 100,
                  latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                }),
              }),
            }),
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

      assert.deepEqual(ddlTimeouts, [{
        lane: 'control',
        timeoutMs: QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS + 5000,
      }]);
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
          controlQueryTimeoutMs: 12000,
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
    assert.equal(resolved.controlQueryTimeoutMs, 12000);
    assert.equal(resolved.baselineLoadNodeCount, 16);
    assert.equal(resolved.replicationFactor, 5);
    assert.equal(resolved.syncReplicaAcks, 2);
    assert.equal(resolved.cacheBaselineMetrics, false);
    assert.equal(resolved.refreshBaselineMetrics, true);
    assert.equal(resolved.baselineCacheTtlMs, 60000);
    assert.equal(typeof resolved.durationSeconds, 'number');
    assert.equal(typeof resolved.user, 'string');
    assert.equal(Object.isFrozen(resolved), true);
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
          queryWithTimeout: async function(sql) {
            const statement = String(sql);
            if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              return {
                rows: [buildControlSnapshotPayload('seed-1', {
                  cdcTelemetry: {
                    subscriberCount: 2,
                    bufferedEvents: 0,
                    catchupLagEvents: 0,
                    authoritativeFallback: {
                      schemaVersion: 1,
                      nodeId: 'seed-1',
                      windowMs: 60000,
                      totalCount: 4,
                      windowCount: 2,
                      windowRatePerMinute: 2,
                      phases: {
                        bootstrap: {windowCount: 0, totalCount: 0},
                        recovery: {windowCount: 1, totalCount: 2},
                        steady_state: {windowCount: 1, totalCount: 2},
                      },
                    },
                  },
                })],
              };
            }
            return this.query(sql);
          },
          query: async (sql) => {
            const statement = String(sql);
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

});
