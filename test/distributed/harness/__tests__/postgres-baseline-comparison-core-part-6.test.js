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
  it('classifies normalized node admission evidence through one adjudicator',
    () => {
      const cases = [
        {
          name: 'admits a ready node without load-lane probing',
          input: {
            nodeId: 'node-admitted',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: true,
                hasAdmission: true,
                reasons: [],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                },
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.ADMITTED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'admits topology-deferred benchmark admission',
          input: {
            nodeId: 'node-topology-deferred',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: true,
                reasons: ['replica_operations_in_flight=1'],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: false,
                },
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'admits confirmable stale local readiness when load lane confirms',
          input: {
            nodeId: 'node-load-confirmed',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
                ],
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {ready: true, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_CONFIRMED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps topology-only local blockers soft without confirming load evidence',
          input: {
            nodeId: 'node-stale-local',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
                ],
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps topology-only blockers soft when live proof fails',
          input: {
            nodeId: 'node-load-denied',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: false,
                reasons: [
                  'leadership_unstable=leader coverage incomplete for readiness scope',
                ],
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {
              ready: false,
              reasons: ['load_probe_failed:circuit breaker is open'],
            },
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED,
          expectedAdmit: true,
          expectedReasons: [],
        },
        {
          name: 'keeps voter-ready blockers hard when live proof fails',
          input: {
            nodeId: 'node-voter-blocked',
            adminReady: true,
            localReadiness: {
              requiresConfirmation: true,
              evaluation: {
                ready: false,
                hasAdmission: true,
                reasons: [
                  'local_replica_not_voter_ready=p1',
                ],
                admissionState: {
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: false,
                },
              },
            },
            loadLaneAttempted: true,
            loadLaneReadiness: {
              ready: false,
              reasons: ['load_probe_failed:circuit breaker is open'],
            },
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_DENIED,
          expectedAdmit: false,
          expectedReasons: [
            'load_probe_failed:circuit breaker is open',
            'self_discovery=local_replica_not_voter_ready=p1',
          ],
        },
        {
          name: 'blocks on admin reachability before admission',
          input: {
            nodeId: 'node-awaiting-admin',
            adminReady: false,
            adminReasons: ['admin_not_ready'],
            localReadiness: {
              requiresConfirmation: false,
              evaluation: {
                ready: true,
                hasAdmission: false,
                reasons: [],
              },
            },
            loadLaneAttempted: false,
            loadLaneReadiness: {ready: false, reasons: []},
            allowTopologyDeferredSelection: true,
          },
          expectedState: SUT_LOAD_NODE_ADMISSION_STATE.AWAITING_ADMIN,
          expectedAdmit: false,
          expectedReasons: ['admin_not_ready'],
        },
      ];

      for (const testCase of cases) {
        const normalizedEvidence = normalizeSutLoadNodeAdmissionEvidence(
          testCase.input,
        );
        const decision = adjudicateSutLoadNodeAdmission(normalizedEvidence);
        assert.equal(
          decision.state,
          testCase.expectedState,
          testCase.name,
        );
        assert.equal(
          decision.admit,
          testCase.expectedAdmit,
          testCase.name + ' admit verdict',
        );
        assert.deepEqual(
          decision.exclusionReasons,
          testCase.expectedReasons,
          testCase.name + ' exclusion reasons',
        );
      }
    });

  it('keeps topology-only local blockers on the soft deferred path', () => {
    const localReadiness = {
      requiresConfirmation: true,
      evaluation: {
        ready: false,
        hasAdmission: false,
        reasons: [
          'leadership_unstable=leader coverage incomplete for readiness scope',
          'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
        ],
      },
    };

    assert.equal(
      hasLoadLaneConfirmableLocalReadinessBlock(localReadiness.evaluation),
      true,
      'topology-only blockers remain explainable to the load lane when proof is needed',
    );
    assert.equal(
      shouldPreserveTopologyDeferredAdmission(localReadiness),
      true,
      'topology-only blockers should stay on the soft deferred path',
    );
    assert.equal(
      shouldConfirmLocalReadinessViaLoadLane(localReadiness, {
        adminReady: true,
        hasTableProbe: true,
        allowSoftDiscoveryNodeFallback: true,
      }),
      false,
      'topology-only blockers should not trigger a hard revalidation probe',
    );
  });

  it('replays captured node-admission failures from rerun-20260403T102148Z',
    () => {
      for (const replayCase of RERUN_20260403T102148Z_NODE_ADMISSION_CASES) {
        const normalizedEvidence = normalizeSutLoadNodeAdmissionEvidence(
          replayCase.input,
        );
        const decision = adjudicateSutLoadNodeAdmission(normalizedEvidence);
        const trace = buildSutLoadNodeAdmissionDecisionTrace(
          replayCase.input,
          decision,
        );
        assert.equal(
          decision.state,
          replayCase.expectedState,
          replayCase.name,
        );
        assert.deepEqual(
          decision.exclusionReasons,
          [...replayCase.expectedReasons],
          replayCase.name + ' exclusion reasons',
        );
        assert.equal(
          trace.derivedState,
          replayCase.expectedState,
          replayCase.name + ' trace state',
        );
        assert.equal(
          trace.finalAdmissionReason,
          decision.explanation,
          replayCase.name + ' trace explanation',
        );
      }
    });

  it('keeps rerun-20260403T102148Z nodes blocked when only the control lane responds',
    async () => {
      const replayEvidence = {
        nodeId: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
        localReasons: [
          'leadership_unstable=leader coverage incomplete for readiness scope',
          'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
        ],
        probeFailure:
          'NodeClient queryLoadProbe failed (node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, channel=probe, timeoutClass=none, code=circuit_open): circuit breaker is open',
      };
      const queryLog = [];
      const node = {
        id: replayEvidence.nodeId,
        queryWithTimeout: async (_sql, _params, options = {}) => {
          queryLog.push({kind: 'direct', lane: String(options?.lane || 'default')});
          throw new Error(replayEvidence.probeFailure);
        },
      };
      const nodeClient = {
        queryLoadProbe: async () => {
          throw new Error(replayEvidence.probeFailure);
        },
        queryLoad: async () => {
          throw new Error(replayEvidence.probeFailure);
        },
        queryControl: async () => {
          queryLog.push({kind: 'control'});
          return {rows: [{value: 1}]};
        },
      };

      const readiness = await probeLoadLaneReadiness(nodeClient, node, {
        tableProbeSql: 'SELECT count(*) FROM benchmark_events WHERE 1 = 0',
        allowControlChannelFallback: true,
      });

      assert.equal(
        readiness.ready,
        false,
        'control-plane success must not upgrade a replay-backed load-lane failure to ready',
      );
      assert.equal(
        readiness.reasons[0]?.startsWith('load_probe_failed:'),
        true,
        'replay-backed failure should remain classified as a load probe failure',
      );
      assert.deepEqual(
        queryLog,
        [{kind: 'direct', lane: 'load'}],
        'replay-backed load readiness may retry the load lane directly after circuit-open, but must not switch proof planes',
      );
      assert.equal(
        replayEvidence.localReasons.length,
        2,
        'artifact-derived local blockers should remain present in the regression fixture',
      );
    });

  it('skips baseline execution when system-under-test load already has hard operation failures',
    async () => {
      let baselineContainerCreates = 0;
      let baselineLoadCalls = 0;
      const provider = {
        createContainer: async (_options) => {
          baselineContainerCreates++;
          return {
            containerId: 'benchmark-postgres-1',
            ip: '172.18.0.80',
            name: 'benchmark-postgres-1',
          };
        },
        execInContainer: async (_containerId, _cmd) => ({
          exitCode: 0,
          stdout: '',
          stderr: '',
        }),
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
              if (isBaselineLoad) {
                baselineLoadCalls++;
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
                        success: 99,
                        failed: 1,
                        errors: 1,
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

      await assert.rejects(
        run(cluster),
        (error) => {
          assert.match(
            String(error?.message || ''),
            /load run completed with failed operations/i,
          );
          assert.equal(
            error?.diagnostics?.failedPhase?.phase,
            'load',
            'hard load failures should fail the load phase before baseline work',
          );
          return true;
        },
      );
      assert.equal(
        baselineContainerCreates,
        0,
        'baseline containers should not be created after deterministic SUT load failure',
      );
      assert.equal(
        baselineLoadCalls,
        0,
        'baseline load should not start after deterministic SUT load failure',
      );
    });

  it('emits periodic system-under-test and baseline load heartbeats to the phase event sink',
    async () => {
      const sinkEvents = [];
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

      const createHeartbeatRun = (metrics) => ({
        start: () => {
          let snapshotCount = 0;
          return {
            waitComplete: async () => new Promise((resolve) => {
              setTimeout(() => resolve(metrics), 30);
            }),
            getMetrics: () => {
              snapshotCount += 1;
              return {
                ...metrics,
                total: snapshotCount * 5,
                success: snapshotCount * 5,
                failed: 0,
                errors: 0,
                attemptErrors: 0,
                dispatchedOperations: snapshotCount * 5,
                targetOperations: 30,
                undispatchedOperations: Math.max(0, 30 - (snapshotCount * 5)),
              };
            },
          };
        },
      });

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
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 1,
            jobs: 1,
            loadOpsPerSec: 30,
            loadDuration: '5s',
            loadMaxInFlight: 16,
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
            progressHeartbeatIntervalMs: 5,
            phaseEventSink: (event) => {
              sinkEvents.push({...event});
            },
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return createHeartbeatRun({
                total: 30,
                success: 30,
                failed: 0,
                errors: 0,
                attemptErrors: 0,
                opsPerSec: isBaselineLoad ? 60 : 45,
                latency: {avg: 2, p50: 2, p95: 4, p99: 5},
              });
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

      const progressMessages = sinkEvents
        .filter((event) => event.type === 'phase.progress')
        .map((event) => String(event.message || ''));
      assert.ok(
        progressMessages.includes('system-under-test load heartbeat'),
        'phase sink should receive system-under-test load heartbeats',
      );
      assert.ok(
        progressMessages.includes('baseline load heartbeat'),
        'phase sink should receive baseline load heartbeats',
      );
    });

  it('allows fault-injection override to bypass load pinning protection',
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
            allowLoadRebalancePinningBypass: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
            postLoadDrainTimeoutMs: 120,
            postLoadDrainPollIntervalMs: 5,
            postLoadDrainStableWindowMs: 0,
            postLoadDrainNoProgressTimeoutMs: 40,
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
                start: () => {
                  if (!isBaselineLoad) {
                    loadWindowOpen = true;
                  }
                  return {
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
      assert.equal(
        result.details.benchmark.rebalancingPressure.load.pinning.bypassed,
        true,
      );
    });

  it('fails strict benchmark mode on sustained critical rebalancing while bypassed',
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
            strictDiscovery: true,
            requiredSutLoadNodeCount: 1,
            pinRebalancingDuringLoad: true,
            allowLoadRebalancePinningBypass: true,
            rebalanceHysteresisCooldownMs: 20,
            rebalanceHysteresisMinDelta: 2,
            loadRebalanceMonitorPollIntervalMs: 5,
            loadRebalanceMaxReplicaOpsInFlight: 0,
            postLoadDrainTimeoutMs: 120,
            postLoadDrainPollIntervalMs: 5,
            postLoadDrainStableWindowMs: 0,
            postLoadDrainNoProgressTimeoutMs: 40,
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
                start: () => {
                  if (!isBaselineLoad) {
                    loadWindowOpen = true;
                  }
                  return {
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
                        new Promise((resolve) => {
                          setTimeout(() => {
                            resolve({
                              total: 100,
                              success: 100,
                              failed: 0,
                              errors: 0,
                              opsPerSec: 50,
                              latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                            });
                          }, 40);
                        })
                    ),
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

      const timing = installVirtualScenarioTiming(cluster);
      await assert.rejects(scenarioRun(cluster), (error) => {
        assert.match(
          String(error?.message || error),
          /internal_signal_threshold_breach.*critical_rebalancing_state/i,
        );
        const reasonCounts = error?.diagnostics?.failure?.reasonCounts || {};
        const reasonKeys = Object.keys(reasonCounts);
        assert.ok(
          reasonKeys.some((reason) =>
            /internal_signal_threshold_breach.*critical_rebalancing_state/i.test(
              reason,
            )),
          'failure artifact should include threshold reason count for critical rebalancing',
        );
        return true;
      });
      assert.ok(
        timing.getSleepCalls().length > 0,
        'critical rebalancing failure path should use virtual poll sleeps instead of wall-clock waiting',
      );
    });

  it('fails strict overload policy when queue and reject contracts are violated',
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
            strictOverloadPolicy: true,
            overloadPolicy: {
              maxRejectedOperations: 0,
              maxQueueDelayP99Ms: 5,
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
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        rejectedOperations: 5,
                        rejectedByReason: {
                          queueFull: 5,
                        },
                        queueDelay: {
                          avg: 20,
                          p50: 10,
                          p95: 90,
                          p99: 120,
                          max: 140,
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
        /overload_policy_violation/i,
      );
    });

  it('fails strict write-pressure threshold with dedicated reason code',
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
            strictWritePressure: true,
            writePressureThresholds: {
              maxAttemptedWrites: 10,
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
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        controlPlaneWrites: {
                          attempted: 50,
                          coalesced: 0,
                          unchangedSkipped: 0,
                          failed: 0,
                          timeouts: 0,
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
        /write_pressure_threshold_exceeded/i,
      );
    });

});
