import {
  describe,
  it,
  assert,
  runWithVirtualScenarioTiming as run,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  DEFAULT_DISCOVERY_HEALTH,
  DEFAULT_DISCOVERY_REPLICA_PORT,
  SERVICE_DISCOVERY_SQL_PREFIX,
  DEFAULT_DISCOVERY_TABLE_NAME,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL,
  buildControlSnapshotPayload,
  buildServiceDiscoverySnapshot,
  buildPreflightCriticalPathSnapshotPayload,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';
import {
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';


describe('postgres-baseline-comparison scenario', () => {
  it('widens strict discovery scope when table-id scoped snapshots stay empty',
    async () => {
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      const scopedDiscoverySql =
        'SELECT * FROM service_discovery_local(\'benchmark_events\', \'tbl-benchmark\')';
      const tableNameOnlyDiscoverySql =
        'SELECT * FROM service_discovery_local(\'benchmark_events\')';
      const serviceDiscoverySqlCalls = [];
      let loadGeneratorCalls = 0;

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
        const capturedAt = Date.now();
        const replicas = ['seed-1', 'joiner-1'].map((nodeId) => ({
          endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + nodeId,
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId,
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
            appliedSchemaVersion: requiredSchemaVersion,
            reasons: [],
          },
        }));
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
          serviceCount: 1,
          replicaCount: replicas.length,
          services: [{
            serviceKey:
              NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
              '|' +
              NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
            nodes: replicas.map((replica) => replica.nodeId),
            replicas,
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
                  nodes: ['seed-1', 'joiner-1'],
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
              serviceDiscoverySqlCalls.push(statement);
              if (statement === scopedDiscoverySql) {
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
              return {
                rows: [buildDiscoverySnapshot(this.id)],
              };
            }
            if (statement.startsWith(
              `CREATE TABLE IF NOT EXISTS ${DEFAULT_DISCOVERY_TABLE_NAME}`,
            )) {
              return {rows: []};
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
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            requiredSutLoadNodeCount: 2,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should complete after widening discovery scope',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'strict discovery should admit both SUT load nodes',
      );
      assert.ok(
        serviceDiscoverySqlCalls.includes(scopedDiscoverySql),
        'preflight discovery should attempt table-id scoped query first',
      );
      assert.ok(
        serviceDiscoverySqlCalls.includes(tableNameOnlyDiscoverySql),
        'preflight discovery should retry with table-name scoped query',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should continue through SUT and baseline load phases',
      );
    });

  it('admits topology-blocked replicas during strict discovery when routing and schema are ready',
    async () => {
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let loadGeneratorCalls = 0;

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

      function buildReplica(nodeId) {
        const isJoiner = nodeId === 'joiner-1';
        return {
          endpointId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE + '-ep-' + nodeId,
          serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          nodeId,
          address: '127.0.0.1',
          port: DEFAULT_DISCOVERY_REPLICA_PORT,
          healthStatus: DEFAULT_DISCOVERY_HEALTH,
          updatedAt: Date.now(),
          metadata: {},
          readiness: {
            workloadReady: true,
            benchmarkReady: !isJoiner,
            routingReady: true,
            schemaReady: true,
            topologyReady: !isJoiner,
            replicaOpsInFlight: isJoiner ? 1 : 0,
            leadershipStable: !isJoiner,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            appliedSchemaVersion: requiredSchemaVersion,
            reasons: isJoiner ? [{
              code: 'local_replica_not_voter_ready',
              detail: 'p1',
            }] : [],
          },
          benchmarkAdmission: {
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            nodeId,
            state: isJoiner ? 'blocked' : 'ready',
            routingReady: true,
            schemaReady: true,
            topologyReady: !isJoiner,
            localReplicaRole: isJoiner ? 'candidate' : 'voter',
            degradedByOperationIds: isJoiner ? ['op-topology-sync'] : [],
            reasons: isJoiner ? [{
              code: 'replica_operation_in_flight',
              detail: 'op-topology-sync:REPLACE:syncing',
            }] : [],
          },
        };
      }

      function buildDiscoverySnapshot(sourceNodeId) {
        const replicas = ['seed-1', 'joiner-1'].map((nodeId) => buildReplica(nodeId));
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt: Date.now(),
          serviceCount: 1,
          replicaCount: replicas.length,
          services: [{
            serviceKey:
              NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
              '|' +
              NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
            serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
            nodes: replicas.map((replica) => replica.nodeId),
            replicas,
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
                  nodes: ['seed-1', 'joiner-1'],
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
            if (statement.startsWith(
              `CREATE TABLE IF NOT EXISTS ${DEFAULT_DISCOVERY_TABLE_NAME}`,
            )) {
              return {rows: []};
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
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 8,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: true,
            requiredSutLoadNodeCount: 2,
            readyTimeoutMs: 120,
            readyPollIntervalMs: 10,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 10,
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.ok(
        result?.loadMetrics,
        'scenario should complete with topology-only admission blockers deferred',
      );
      assert.equal(
        result.details.benchmark.sutLoadNodeCount,
        2,
        'strict discovery should keep route-safe topology-blocked node admitted',
      );
      const admissionTrace =
        result.details.benchmark.sutLoadDiscovery?.nodeAdmissionTraceByNodeId?.['joiner-1'];
      assert.equal(
        admissionTrace?.derivedState,
        'topology_deferred',
        'mixed-admission diagnostics should retain per-node derived admission state',
      );
      assert.equal(
        admissionTrace?.normalizedEvidence?.local?.topologyDeferredEligible,
        true,
        'mixed-admission diagnostics should retain normalized topology-deferred evidence',
      );
      assert.equal(
        admissionTrace?.rawEvidence?.localReadiness?.evaluation?.admissionState?.topologyReady,
        false,
        'mixed-admission diagnostics should retain raw topology readiness evidence',
      );
      assert.match(
        String(admissionTrace?.finalAdmissionReason || ''),
        /topology_deferred/i,
        'mixed-admission diagnostics should retain the final admission explanation',
      );
      assert.ok(
        loadGeneratorCalls >= 2,
        'scenario should proceed through SUT and baseline load phases',
      );
    });

  it('fails when load-phase rebalancing thrash breaches benchmark pinning policy',
    async () => {
      let loadWindowOpen = false;
      let loadCancelled = false;
      let loadSnapshotCount = 0;
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
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
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            if (!loadWindowOpen) {
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
            loadSnapshotCount++;
            const leaderNodeId = loadSnapshotCount % 2 === 0 ? 'seed-1' : 'join-2';
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: leaderNodeId},
                replicaOperations: {
                  inFlightCount: 2,
                  statusHistogram: {creating: 2},
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
            pinRebalancingDuringLoad: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
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
              if (isBaselineLoad) {
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
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  let resolveRun;
                  const runPromise = new Promise((resolve) => {
                    resolveRun = resolve;
                  });
                  const timeoutId = setTimeout(() => {
                    resolveRun({
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                    });
                  }, 50);
                  return {
                    waitComplete: async () => runPromise,
                    cancel: () => {
                      loadCancelled = true;
                      clearTimeout(timeoutId);
                      resolveRun({
                        total: 20,
                        success: 20,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 20,
                        latency: {avg: 5, p50: 4, p95: 7, p99: 8},
                      });
                    },
                  };
                },
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
        /rebalancing_window_pinning_violation/i,
      );
      assert.equal(
        loadCancelled,
        true,
        'load run should be cancelled when pinning policy is violated',
      );
    });

  it('fails the load phase when node heartbeats stop advancing during the benchmark window',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
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

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
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
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            loadSnapshotCount++;
            const heartbeatAgeMs = loadWindowOpen ?
              25 + (loadSnapshotCount * 5) :
              5;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
                controlPlaneDiagnostics: {
                  nodeLivenessByNodeId: {
                    'seed-1': {
                      lastHeartbeat: 1000,
                      heartbeatAgeMs,
                      readyLeaseExpiresAt: 1200,
                      readyLeaseAgeMs: heartbeatAgeMs - 5,
                    },
                  },
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
            loadRebalanceMonitorPollIntervalMs: 5,
            heartbeatFreshnessMaxStallMs: 20,
            heartbeatFreshnessMinSamples: 2,
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
              if (isBaselineLoad) {
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
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  return {
                    waitComplete: async () => new Promise((resolve) => {
                      setTimeout(() => {
                        resolve({
                          total: 100,
                          success: 100,
                          failed: 0,
                          errors: 0,
                          opsPerSec: 50,
                          latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        });
                      }, 50);
                    }),
                  };
                },
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
        /heartbeat_freshness_invariant_failed/i,
      );
      assert.ok(
        loadSnapshotCount >= 2,
        'load monitor should observe multiple stale-heartbeat samples before failing',
      );
    });

  it('widens heartbeat freshness tolerance for large strict-parity clusters',
    async () => {
      let loadWindowOpen = false;
      let loadSnapshotCount = 0;
      const discoveryNodeIds = [
        'seed-1',
        'joiner-1',
        'joiner-2',
        'joiner-3',
        'joiner-4',
      ];
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
            return {exitCode: 0, stdout: '4\n', stderr: ''};
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
          _discoveryNodeIds: discoveryNodeIds,
          query: async function(sql) {
            const statement = String(sql);
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
            if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
                statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
              return {rows: [buildServiceDiscoverySnapshot(this)]};
            }
            if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
              return {
                rows: [buildPreflightCriticalPathSnapshotPayload(this)],
              };
            }
            return {rows: []};
          },
          queryWithTimeout: async function(sql, params = [], _options = {}) {
            if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
              if (loadWindowOpen) {
                loadSnapshotCount++;
              }
              const heartbeatAgeMs = loadWindowOpen ? 20000 : 5;
              const readyLeaseAgeMs = loadWindowOpen ? 19995 : 0;
              const nodeLivenessByNodeId = Object.fromEntries(
                discoveryNodeIds.map((discoveryNodeId) => [
                  discoveryNodeId,
                  {
                    lastHeartbeat: 1000 + loadSnapshotCount,
                    heartbeatAgeMs,
                    readyLeaseExpiresAt: 32000,
                    readyLeaseAgeMs,
                  },
                ]),
              );
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  nodes: discoveryNodeIds,
                  leaders: {p1: 'seed-1'},
                  replicaOperations: {
                    inFlightCount: 0,
                    statusHistogram: {},
                  },
                  controlPlaneDiagnostics: {
                    nodeLivenessByNodeId,
                  },
                })],
              };
            }
            return this.query(sql, params);
          },
        };
      }

      const nodes = [
        createNode('seed-1', 'seed'),
        createNode('joiner-1', 'joiner'),
        createNode('joiner-2', 'joiner'),
        createNode('joiner-3', 'joiner'),
        createNode('joiner-4', 'joiner'),
      ];

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 30,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '30s',
            loadMaxInFlight: 64,
            loadNodeMaxInFlight: 2,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictParity: true,
            loadRebalanceMonitorPollIntervalMs: 5000,
            heartbeatFreshnessMinSamples: 2,
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
            createLoadGenerator: (loadNodes) => {
              const isBaselineLoad =
                String(loadNodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              if (isBaselineLoad) {
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
              }
              return {
                start: () => {
                  loadWindowOpen = true;
                  return {
                    waitComplete: async () => new Promise((resolve) => {
                      setTimeout(() => {
                        resolve({
                          total: 100,
                          success: 100,
                          failed: 0,
                          errors: 0,
                          opsPerSec: 50,
                          latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        });
                      }, 50);
                    }),
                  };
                },
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles(nodes),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      const heartbeatFreshness =
        result.details.benchmark.rebalancingPressure.load.heartbeatFreshness;
      assert.equal(
        heartbeatFreshness.failed,
        false,
        'large strict-parity runs should honor the scaled heartbeat freshness threshold',
      );
      assert.ok(
        loadSnapshotCount >= 2,
        'heartbeat monitor should record multiple load-window samples',
      );
      assert.equal(
        heartbeatFreshness.perNode['seed-1'].currentHeartbeatAgeMs,
        20000,
        'regression should stay above the strict-mode default threshold',
      );
    });
});
