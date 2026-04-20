import {
  assert,
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
  buildVersionedStrictReadinessCluster,
} from './postgres-baseline-comparison-test-helpers.js';

export function registerPostgresBaselineComparisonStrictDiagnosticsTailMoreTests({
  it,
}) {
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
          (error) => {
            assert.match(error?.message || '', /gate aborted due to stalled progress/i);
            assert.equal(
              error?.diagnostics?.noProgress?.reasonCode,
              'stalled_no_progress',
              'no-progress failures should carry dedicated diagnostics',
            );
            assert.equal(
              error?.diagnostics?.noProgress?.phase,
              'pre_load_gate',
              'no-progress diagnostics should identify the failed phase',
            );
            assert.equal(
              error?.diagnostics?.noProgress?.failedNoProgress?.details?.budgetMs,
              20,
              'no-progress diagnostics should include the active budget',
            );
            return true;
          },
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

      it('fails degraded preload fallback when soft stall candidates still fail load-lane revalidation',
        async () => {
          const loadCalls = [];
          let inFlightProbeCount = 0;
          let tableProbeCount = 0;
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
                tableProbeCount += 1;
                if (tableProbeCount === 1) {
                  return {rows: [{count: 0}]};
                }
                throw new Error(
                  'Distributed operation failed due to participant failures',
                );
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
                inFlightProbeCount += 1;
                return {
                  rows: [buildControlSnapshotPayload(this.id, {
                    leaders: {p1: this.id},
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
                strictDiscovery: false,
                allowPreloadStallSoftFallback: true,
                requiredSutLoadNodeCount: 1,
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
            () => run(cluster),
            (error) => {
              assert.match(
                String(error?.message || ''),
                /degraded pre-load fallback produced no strict load-admissible nodes/,
                'soft stall fallback should fail when degraded candidates still fail load-lane revalidation',
              );
              assert.equal(
                error?.diagnostics?.failedPhase?.artifacts?.mode,
                'degraded_soft_stall_fallback',
                'failure diagnostics should preserve degraded pre-load gate mode',
              );
              return true;
            },
          );
          assert.equal(
            loadCalls.length,
            0,
            'soft stall fallback should not start load when degraded candidates fail revalidation',
          );
          assert.ok(
            inFlightProbeCount >= 2,
            'soft stall fallback should still exercise quiescence polling before failing',
          );
        });

      it('treats replica operation timeline movement as preload progress',
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
                inFlightProbeCount += 1;
                const timelineTimestampMs = 1000 + (inFlightProbeCount * 5);
                const inFlightCount = inFlightProbeCount < 6 ? 2 : 0;
                return {
                  rows: [buildControlSnapshotPayload(this.id, {
                    replicaOperations: {
                      inFlightCount,
                      statusHistogram: inFlightCount > 0 ?
                        {creating: inFlightCount} :
                        {},
                      operationTimelineById: inFlightCount > 0 ?
                        {
                          'op-move-1': [{
                            eventType: 'state',
                            operationId: 'op-move-1',
                            step: 'CREATE_REPLICA',
                            status: 'creating',
                            timestampMs: timelineTimestampMs,
                            inFlight: true,
                          }],
                        } :
                        {},
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

          const result = await run(cluster);
          assert.equal(result.loadMetrics?.failed, 0);
          assert.ok(
            inFlightProbeCount >= 6,
            'quiescence gate should sample until in-flight operations drain',
          );
          assert.equal(
            loadCalls.length,
            2,
            'scenario should execute SUT and baseline load after preload gate',
          );
        });

      it('does not abort preload gate while in-flight operations stay within ' +
        'their timeout budget', async () => {
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
                inFlightProbeCount += 1;
                const inFlightCount = inFlightProbeCount < 7 ? 1 : 0;
                return {
                  rows: [buildControlSnapshotPayload(this.id, {
                    replicaOperations: {
                      inFlightCount,
                      statusHistogram: inFlightCount > 0 ?
                        {removing: inFlightCount} :
                        {},
                      operationTimelineById: inFlightCount > 0 ?
                        {
                          'op-removing-1': [{
                            eventType: 'state',
                            operationId: 'op-removing-1',
                            step: 'STOPPING',
                            status: 'removing',
                            timestampMs: 1000,
                            inFlight: true,
                            ageMs: inFlightProbeCount * 5,
                            timeoutMs: 200,
                            staleTimeout: false,
                          }],
                        } :
                        {},
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

          const result = await run(cluster);
          assert.equal(result.loadMetrics?.failed, 0);
          assert.ok(
            inFlightProbeCount >= 7,
            'gate should keep polling until in-flight operations drain',
          );
          assert.equal(
            loadCalls.length,
            2,
            'scenario should continue once in-flight operations settle',
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
}
