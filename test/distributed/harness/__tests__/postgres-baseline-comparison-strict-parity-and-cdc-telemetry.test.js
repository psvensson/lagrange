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
  asNodeHandles,
} from './postgres-baseline-comparison-test-helpers.js';
import {
} from '../../scenarios/postgres-baseline-node-admission.js';
import {
} from '../__fixtures__/postgres-baseline-node-admission-replay-fixtures.js';


describe('postgres-baseline-comparison scenario', () => {
  it('fails when strict parity mode detects sut/baseline parity mismatch',
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
            durationSeconds: 5,
            clients: 8,
            jobs: 2,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 3,
            syncReplicaAcks: 1,
            strictParity: true,
            failOnLoadParityMismatch: false,
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

      await assert.rejects(
        run(cluster),
        /strict_parity_mismatch/i,
      );
    });

  it('fails when internal signal thresholds are breached', async () => {
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
          internalSignalThresholds: {
            failOnThresholdBreach: true,
            errorsByClass: {
              operation_failed: 1,
            },
            warningsByClass: {
              critical_rebalancing_state: 1,
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
                      attemptErrors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      distinctErrors: ['Operation failed', 'Operation failed'],
                    }
                ),
              }),
            };
          },
          getInternalSignalMessages: () => ([
            'Critical rebalancing state detected',
            'Critical rebalancing state detected',
          ]),
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

    await assert.rejects(
      run(cluster),
      /internal_signal_threshold_breach/i,
    );
  });

  it('emits cdc telemetry fields for subscriber count, buffered events, and lag',
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
                catchupLagEvents: 0,
              },
            }),
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
      const cdcTelemetry = result?.details?.benchmark?.cdcTelemetry;
      assert.ok(cdcTelemetry, 'benchmark details should include cdc telemetry');
      assert.equal(typeof cdcTelemetry.summary.totalSubscriberCount, 'number');
      assert.equal(typeof cdcTelemetry.summary.totalBufferedEvents, 'number');
      assert.equal(typeof cdcTelemetry.summary.maxCatchupLagEvents, 'number');
    });

  it('summarizes authoritative fallback telemetry in benchmark details',
    async () => {
      const provider = {
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
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
            }),
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
      const authoritativeFallback =
        result?.details?.benchmark?.cdcTelemetry?.summary?.authoritativeFallback;

      assert.ok(authoritativeFallback,
        'benchmark details should include authoritative fallback summary');
      assert.equal(authoritativeFallback.totalCount, 4);
      assert.equal(authoritativeFallback.windowCount, 2);
      assert.equal(authoritativeFallback.steadyStateWindowCount, 1);
    });

  it('fails strict report schema check when cdc telemetry fields are missing',
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
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictCdcTelemetrySchema: true,
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
            getCdcTelemetryByNode: () => ({
              'seed-1': {
                subscriberCount: 2,
                bufferedEvents: 0,
              },
            }),
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

      await assert.rejects(
        run(cluster),
        /cdc_telemetry_schema_missing/i,
      );
    });

  it('uses shared discovery snapshots during load admission and keeps route-safe nodes admitted',
    async () => {
      let loadWindowOpen = false;
      const loadWindowDiscoveryCallsByNodeId = {
        'seed-1': 0,
        'joiner-1': 0,
      };
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

      function buildReplicaReadiness(nodeId) {
        const readyReadiness = {
          workloadReady: true,
          benchmarkReady: true,
          routingReady: true,
          schemaReady: true,
          topologyReady: true,
          replicaOpsInFlight: 2,
          leadershipStable: true,
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          appliedSchemaVersion: requiredSchemaVersion,
          reasons: [],
        };
        if (!loadWindowOpen || nodeId !== 'joiner-1') {
          return readyReadiness;
        }
        return {
          ...readyReadiness,
          topologyReady: false,
          reasons: [{
            code: 'local_replica_not_voter_ready',
            detail: 'p1',
          }],
        };
      }

      function buildReplicaBenchmarkAdmission(nodeId) {
        const readyAdmission = {
          tableName: DEFAULT_DISCOVERY_TABLE_NAME,
          nodeId,
          state: 'ready',
          routingReady: true,
          schemaReady: true,
          topologyReady: true,
          localReplicaRole: 'voter',
          degradedByOperationIds: [],
          reasons: [],
        };
        if (!loadWindowOpen || nodeId !== 'joiner-1') {
          return readyAdmission;
        }
        return {
          ...readyAdmission,
          state: 'blocked',
          topologyReady: false,
          localReplicaRole: 'candidate',
          reasons: [{
            code: 'local_replica_not_voter_ready',
            detail: 'p1',
          }],
        };
      }

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
          readiness: buildReplicaReadiness(nodeId),
          benchmarkAdmission: buildReplicaBenchmarkAdmission(nodeId),
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
            desiredReplicaCount: replicas.length,
            desiredReplicaCountByServiceId: {
              [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE]: replicas.length,
            },
            observedReplicaCount: replicas.length,
            healthyReplicaCount: replicas.length,
            unhealthyReplicaCount: 0,
            health: DEFAULT_DISCOVERY_HEALTH,
            nodeCount: replicas.length,
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
              if (loadWindowOpen === true) {
                loadWindowDiscoveryCallsByNodeId[this.id] += 1;
              }
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
            requiredSutLoadNodeCount: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
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
                      }, 35);
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
        getNodes: () => asNodeHandles([
          createNode('seed-1', 'seed'),
          createNode('joiner-1', 'joiner'),
        ]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      const loadRoutingAdmission =
        result.details.benchmark.rebalancingPressure.load.routingAdmission;
      assert.ok(
        loadRoutingAdmission.sampleCount > 0,
        'monitor should emit routing-admission samples during load window',
      );
      assert.equal(
        loadRoutingAdmission.stateByNodeId['joiner-1'].ready,
        true,
        'route-safe node should stay admitted despite local topology-only blockers',
      );
      assert.equal(
        loadRoutingAdmission.blockedSampleCount,
        0,
        'topology-only benchmark admission blockers should not block load routing',
      );
      assert.equal(
        loadWindowDiscoveryCallsByNodeId['joiner-1'],
        0,
        'monitor should reuse one shared service-discovery snapshot per poll',
      );
      assert.ok(
        loadWindowDiscoveryCallsByNodeId['seed-1'] > 0,
        'monitor should still query one discovery source during load',
      );
    });
});
