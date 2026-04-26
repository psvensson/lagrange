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
  buildControlSnapshotPayload,
  buildServiceDiscoverySnapshot,
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';
import {
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';


describe('postgres-baseline-comparison scenario', () => {
  it('fails pre-load gate when degraded fallback nodes are not strict load-admissible',
    async () => {
      const tableProbeSql =
        `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`;
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let sutLoadStarted = false;
      let currentTimeMs = 0;
      let tableProbePassesRemaining = 1;

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
        const degraded = tableProbePassesRemaining === 0;
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
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
              updatedAt: capturedAt,
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: !degraded,
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                replicaOpsInFlight: 0,
                leadershipStable: !degraded,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: degraded ?
                  [{
                    code: 'local_replica_not_voter_ready',
                    detail: 'p1',
                  }] :
                  [],
              },
              benchmarkAdmission: {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: sourceNodeId,
                state: degraded ? 'blocked' : 'ready',
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                localReplicaRole: degraded ? 'candidate' : 'voter',
                degradedByOperationIds: [],
                reasons: degraded ?
                  [{
                    code: 'local_replica_not_voter_ready',
                    detail: 'p1',
                  }] :
                  [],
              },
            }],
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
          if (statement === tableProbeSql) {
            if (tableProbePassesRemaining > 0) {
              tableProbePassesRemaining -= 1;
              return {rows: [{count: 0}]};
            }
            throw new Error(
              'benchmark admission blocked: local_replica_not_voter_ready',
            );
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

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 4,
            loadQueryTimeoutMs: 1000,
            controlQueryTimeoutMs: 1000,
            readyTimeoutMs: 20,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 20,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            strictParity: false,
            strictPreloadReadiness: false,
            allowPreloadStallSoftFallback: true,
            requiredSutLoadNodeCount: 1,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 1,
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
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  sutLoadStarted = true;
                  return {
                    waitComplete: async () => {
                      await nodes[0].query(tableProbeSql);
                      return {
                        total: 1,
                        success: 1,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 10,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      };
                    },
                  };
                },
              };
            },
            timing: {
              now: () => currentTimeMs,
              sleep: async (delayMs = 0) => {
                currentTimeMs += Math.max(1, Number(delayMs) || 0);
              },
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
        /failed in phase pre_load_gate: degraded pre-load fallback produced no strict load-admissible nodes/i,
      );
      assert.equal(
        sutLoadStarted,
        false,
        'scenario should not start SUT load when degraded fallback nodes are already known to be non-admissible',
      );
    });

  it('retains topology-deferred degraded fallback nodes without forcing load-lane proof',
    async () => {
      const tableProbeSql =
        `SELECT count(*) FROM ${DEFAULT_DISCOVERY_TABLE_NAME} WHERE 1 = 0`;
      const requiredSchemaVersion = '1740589945123:7:seed-1';
      let sutLoadStarted = false;
      let currentTimeMs = 0;
      let tableProbePassesRemaining = 1;

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
        const degraded = tableProbePassesRemaining === 0;
        return {
          schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
          nodeId: sourceNodeId,
          capturedAt,
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
              updatedAt: capturedAt,
              metadata: {},
              readiness: {
                workloadReady: true,
                benchmarkReady: !degraded,
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                replicaOpsInFlight: degraded ? 1 : 0,
                leadershipStable: true,
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                appliedSchemaVersion: requiredSchemaVersion,
                reasons: degraded ?
                  [{
                    code: 'replica_operations_in_flight',
                    detail: 'p1',
                  }] :
                  [],
              },
              benchmarkAdmission: {
                tableName: DEFAULT_DISCOVERY_TABLE_NAME,
                nodeId: sourceNodeId,
                state: degraded ? 'blocked' : 'ready',
                routingReady: true,
                schemaReady: true,
                topologyReady: !degraded,
                localReplicaRole: degraded ? 'candidate' : 'voter',
                degradedByOperationIds: degraded ? ['replica-op-1'] : [],
                reasons: degraded ?
                  [{
                    code: 'replica_operations_in_flight',
                    detail: 'p1',
                  }] :
                  [],
              },
            }],
          }],
        };
      }

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
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
          if (statement === tableProbeSql) {
            if (tableProbePassesRemaining > 0) {
              tableProbePassesRemaining -= 1;
              return {rows: [{count: 0}]};
            }
            throw new Error(
              'NodeClient queryLoadProbe failed ' +
                '(node=seed-1, channel=probe, timeoutClass=none, code=circuit_open): ' +
                'circuit breaker is open',
            );
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

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 1,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 10,
            loadDuration: '1s',
            loadMaxInFlight: 4,
            loadQueryTimeoutMs: 1000,
            controlQueryTimeoutMs: 1000,
            readyTimeoutMs: 20,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 20,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            preloadRequiredStableMs: 0,
            tableName: DEFAULT_DISCOVERY_TABLE_NAME,
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            strictParity: false,
            strictPreloadReadiness: false,
            allowPreloadStallSoftFallback: true,
            requiredSutLoadNodeCount: 1,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 1,
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
                      total: 10,
                      success: 10,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  }),
                };
              }
              return {
                start: () => {
                  sutLoadStarted = true;
                  return {
                    waitComplete: async () => ({
                      total: 1,
                      success: 1,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 10,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    }),
                  };
                },
              };
            },
            timing: {
              now: () => currentTimeMs,
              sleep: async (delayMs = 0) => {
                currentTimeMs += Math.max(1, Number(delayMs) || 0);
              },
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
        result?.loadMetrics,
        'scenario should continue when degraded fallback nodes are only topology-deferred',
      );
      assert.equal(
        sutLoadStarted,
        true,
        'scenario should start SUT load when degraded fallback keeps a topology-deferred node admitted',
      );
      assert.equal(
        result.details.phaseArtifacts?.pre_load_gate?.preloadFallbackLoadAdmission
          ?.nodeAdmissionTraceByNodeId?.['seed-1']?.derivedState,
        'topology_deferred',
        'pre-load fallback diagnostics should retain the topology-deferred admission state',
      );
    });

  it('retains last-known-good load routing admission through transient probe errors',
    async () => {
      let loadWindowOpen = false;
      let admittedLoadQueryCount = 0;
      let loadWindowDiscoverySuccessCount = 0;
      let loadWindowDiscoveryFailureCount = 0;
      let loadWindowDiscoveryRecoverySuccessCount = 0;
      let pendingTransientDiscoveryFailures = 0;

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
        _discoveryNodeIds: ['seed-1'],
        query: async function(sql) {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            admittedLoadQueryCount += 1;
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
                schema_version: '1740589945123:7:seed-1',
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
            if (loadWindowOpen && pendingTransientDiscoveryFailures > 0) {
              pendingTransientDiscoveryFailures -= 1;
              loadWindowDiscoveryFailureCount += 1;
              throw new Error('transient discovery outage');
            }
            if (loadWindowOpen) {
              loadWindowDiscoverySuccessCount += 1;
              if (loadWindowDiscoveryFailureCount > 0) {
                loadWindowDiscoveryRecoverySuccessCount += 1;
              }
            }
            return {rows: [buildServiceDiscoverySnapshot(this)]};
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 1,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRoutingProbeErrorGraceMs: 200,
          },
          nodeClient: {
            channelPolicies: {
              snapshot: {
                retryBudget: 0,
                circuitBreakerThreshold: 10,
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
                    waitComplete: async () => {
                      await new Promise((resolve) => {
                        setTimeout(resolve, 6);
                      });
                      await nodes[0].query('SELECT 1');
                      while (loadWindowDiscoverySuccessCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      await new Promise((resolve) => {
                        setTimeout(resolve, 12);
                      });
                      pendingTransientDiscoveryFailures = 1;
                      while (loadWindowDiscoveryFailureCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      while (loadWindowDiscoveryRecoverySuccessCount < 1) {
                        await new Promise((resolve) => {
                          setTimeout(resolve, 1);
                        });
                      }
                      await nodes[0].query('SELECT 1');
                      return {
                        total: 2,
                        success: 2,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      };
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

      const result = await run(cluster);
      const loadRoutingAdmission =
        result.details.benchmark.rebalancingPressure.load.routingAdmission;
      assert.ok(
        admittedLoadQueryCount > 0,
        'load queries should continue running while transient routing probe errors recover',
      );
      assert.ok(
        loadRoutingAdmission.graceSampleCount > 0,
        'routing admission should record grace-backed samples during transient probe errors',
      );
      assert.equal(
        loadRoutingAdmission.blockedSampleCount,
        0,
        'transient routing probe errors should not immediately block load routing',
      );
      assert.equal(
        loadRoutingAdmission.stateByNodeId['seed-1'].ready,
        true,
        'node should recover back to an admitted routing state after transient probe errors',
      );
      assert.ok(
        loadRoutingAdmission.probeErrors.length > 0,
        'transient probe errors should still be recorded for diagnostics',
      );
    });

  it('blocks load routing after the probe-error grace window expires',
    async () => {
      let loadWindowOpen = false;
      let loadWindowDiscoveryCallCount = 0;

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
        _discoveryNodeIds: ['seed-1'],
        query: async function(sql) {
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
                schema_version: '1740589945123:7:seed-1',
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
            if (loadWindowOpen) {
              loadWindowDiscoveryCallCount += 1;
              if (loadWindowDiscoveryCallCount >= 2) {
                throw new Error('persistent discovery outage');
              }
            }
            return {rows: [buildServiceDiscoverySnapshot(this)]};
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 1,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRoutingProbeErrorGraceMs: 20,
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
                    waitComplete: async () => {
                      await new Promise((resolve) => {
                        setTimeout(resolve, 35);
                      });
                      await nodes[0].query('SELECT 1');
                      return {
                        total: 1,
                        success: 1,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      };
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
        /routing admission blocked: node=seed-1, reasons=routing_probe_error:service_discovery_query_error/i,
      );
    });
});
