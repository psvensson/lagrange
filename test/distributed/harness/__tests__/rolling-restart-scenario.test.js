import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/rolling-restart.js';

const ACK_QUERY_FRAGMENT = ' AS ack_id ';
const EXPECTED_FINAL_CONVERGENCE_WAITS = 2;
const OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS = 2468;
const CALL_WAIT_FOR_CONVERGENCE = 'waitForConvergence';
const CALL_WAIT_FOR_CONTROL_PLANE_QUIESCENCE =
  'waitForControlPlaneQuiescence';
const CALL_WAIT_FOR_LOAD_READINESS_STABILITY =
  'waitForLoadReadinessStability';
const CALL_WAIT_FOR_CONSISTENCY_CONVERGENCE =
  'waitForConsistencyConvergence';
const ZERO = 0;
const PRE_LOAD_READINESS_CALL_COUNT = 1;
const POST_RESTART_QUIESCENCE_MAX_IN_FLIGHT_COUNT = ZERO;
const DEFAULT_PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 8;
const DEFAULT_POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 5;
const DEFAULT_POST_RESTART_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS = 30000;
const OVERRIDE_PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 11;
const OVERRIDE_POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 7;
const OVERRIDE_POST_RESTART_ACTIVE_NO_PROGRESS_MAX_ATTEMPTS = 6;
const OVERRIDE_POST_RESTART_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS = 2222;
const SQL_CREATE_TABLE_IF_NOT_EXISTS = 'CREATE TABLE IF NOT EXISTS';
const SQL_UPDATE_TABLE_POLICIES = 'UPDATE tables SET table_policies';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
const LOAD_READINESS_PHASE_PRE_LOAD = 'pre_load';
const LOAD_READINESS_PHASE_POST_RESTART = 'post_restart';
const SINGLE_SEED_NODE_ID = 'seed-1';
const SINGLE_SEED_NODE_ROLE = 'seed';
const BENCHMARK_TABLE_NAME = 'benchmark_events';
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const LOGS_TABLE_NAME = 'logs';
const LOG_ID_COLUMN_NAME = 'log_id';
const INITIAL_LOAD_TOTAL = 10;
const INITIAL_LOAD_SUCCESS = 10;
const FINAL_LOAD_TOTAL = 20;
const FINAL_LOAD_SUCCESS = 20;
const FINAL_LOAD_FAILED = 0;
const POSITIVE_POST_RESTART_QUIET_WINDOW_MS = 1;
const EXPECTED_POST_RESTART_RECOVERY_STABLE_WINDOW_MS = 15000;
const SHORT_BARRIER_TIMEOUT_MS = 200;
const DEFAULT_CONSISTENCY_FORCE_REPAIR_AFTER_MS = 10000;
const ACK_VISIBILITY_RETRY_TIMEOUT_MS = 50;
const ACK_VISIBILITY_RETRY_POLL_INTERVAL_MS = 1;
const TABLE_POLICIES_JSON = JSON.stringify({
  externalCdcAllowed: false,
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

describe('rolling-restart scenario', () => {
  it('waits for load readiness before starting sustained load',
    async () => {
      const calls = [];
      const cluster = {
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async () => ({rows: []}),
          },
        ],
        waitForLoadReadinessStability: async (options = {}) => {
          calls.push(['waitForLoadReadinessStability', options]);
        },
        startLoad: () => {
          calls.push(['startLoad']);
          return {
            getMetrics: () => ({total: 10, success: 10}),
            getAcknowledgedWrites: () => ({
              tableName: 'logs',
              idColumn: 'log_id',
              ids: [],
            }),
            cancel: () => {},
            waitComplete: async () => ({
              total: 20,
              success: 20,
              failed: 0,
            }),
          };
        },
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preLoadReadinessStableWindowMs: 123,
        preLoadReadinessTimeoutMs: 456,
        preRestartSettleMs: 0,
        interRestartDelayMs: 0,
        postRestartLoadSoakMs: 0,
        postRestartQuietWindowMs: 0,
      });

      assert.deepEqual(calls.slice(0, 2), [
        [
          'waitForLoadReadinessStability',
          {
            stableWindowMs: 123,
            timeoutMs: 456,
            noProgressMaxAttempts:
              DEFAULT_PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
            loadReadinessPhase: LOAD_READINESS_PHASE_PRE_LOAD,
          },
        ],
        ['startLoad'],
      ]);
    });

  it('uses cluster scenario timing overrides when explicit options are absent',
    async () => {
      let observedLoadDuration = null;
      const restartOptions = [];
      const convergenceOptions = [];
      const activeOptions = [];
      const quiescenceOptions = [];
      const loadReadinessOptions = [];
      const consistencyOptions = [];

      const cluster = {
        _config: {
          scenarios: {
            rollingRestart: {
              loadDuration: '15s',
              preRestartSettleMs: 0,
              perRestartActiveTimeoutMs: 1234,
              perNodeConvergenceTimeoutMs:
                OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS,
              interRestartDelayMs: 0,
              postRestartLoadSoakMs: 0,
              postRestartQuietWindowMs: 0,
              postRestartActiveTimeoutMs: 4321,
              preLoadReadinessNoProgressMaxAttempts:
                OVERRIDE_PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
              postRestartControlPlaneQuiescenceNoProgressTimeoutMs:
                OVERRIDE_POST_RESTART_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS,
              postRestartActiveNoProgressMaxAttempts:
                OVERRIDE_POST_RESTART_ACTIVE_NO_PROGRESS_MAX_ATTEMPTS,
              postRestartLoadReadinessNoProgressMaxAttempts:
                OVERRIDE_POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
              postRestartConsistencyTimeoutMs: 9876,
              postRestartConsistencyPollIntervalMs: 43,
              postRestartConsistencyForceRepairAfterMs: 12,
              minRestartSuccessRate: 0.5,
            },
          },
        },
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async () => ({rows: []}),
          },
          {
            id: 'joiner-1',
            role: 'joiner',
            query: async () => ({rows: []}),
          },
        ],
        startLoad: (options = {}) => {
          observedLoadDuration = options.duration;
          return {
            getMetrics: () => ({total: 10, success: 10}),
            getAcknowledgedWrites: () => ({
              tableName: 'logs',
              idColumn: 'log_id',
              ids: [],
            }),
            cancel: () => {},
            waitComplete: async () => ({
              total: 20,
              success: 20,
              failed: 0,
            }),
          };
        },
        restartNode: async (_nodeId, options = {}) => {
          restartOptions.push({...options});
        },
        waitForConvergence: async (options = {}) => {
          convergenceOptions.push({...options});
          return {settledAfterMs: 1};
        },
        waitForAllActive: async (options = {}) => {
          activeOptions.push({...options});
        },
        waitForControlPlaneQuiescence: async (options = {}) => {
          quiescenceOptions.push({...options});
        },
        waitForLoadReadinessStability: async (options = {}) => {
          loadReadinessOptions.push({...options});
        },
        waitForConsistencyConvergence: async (options = {}) => {
          consistencyOptions.push({...options});
        },
      };

      await run(cluster);

      assert.equal(observedLoadDuration, '15s');
      assert.deepEqual(restartOptions, [{
        readinessTimeoutMs: 1234,
        requireAdminReady: true,
      }]);
      assert.equal(
        convergenceOptions.length,
        EXPECTED_FINAL_CONVERGENCE_WAITS,
      );
      assert.deepEqual(
        convergenceOptions.map((option) => option.settleTimeoutMs),
        [
          OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS,
          OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS,
        ],
      );
      assert.equal(convergenceOptions[0].ignoreStaleInFlightReplicaOperations,
        true);
      assert.equal(convergenceOptions[1].ignoreStaleInFlightReplicaOperations,
        true);
      assert.deepEqual(activeOptions, [{
        timeoutMs: 4321,
        noProgressMaxAttempts:
          OVERRIDE_POST_RESTART_ACTIVE_NO_PROGRESS_MAX_ATTEMPTS,
      }]);
      assert.deepEqual(quiescenceOptions, [{
        timeoutMs: OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS,
        stableWindowMs: 0,
        noProgressTimeoutMs:
          OVERRIDE_POST_RESTART_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS,
        maxInFlightCount: POST_RESTART_QUIESCENCE_MAX_IN_FLIGHT_COUNT,
        ignoreStaleInFlightReplicaOperations: true,
        requireCriticalSystemSpread: true,
      }]);
      assert.equal(
        loadReadinessOptions[ZERO].noProgressMaxAttempts,
        OVERRIDE_PRE_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
      );
      assert.deepEqual(loadReadinessOptions.slice(1), [{
        stableWindowMs: 0,
        timeoutMs: 4321,
        noProgressMaxAttempts:
          OVERRIDE_POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
        loadReadinessPhase: LOAD_READINESS_PHASE_POST_RESTART,
      }]);
      assert.deepEqual(consistencyOptions, [{
        timeoutMs: 9876,
        pollIntervalMs: 43,
        forceRepairAfterMs: 12,
      }]);
    });

  it('starts benchmark load only after table-local admission is planned',
    async () => {
      const calls = [];
      let observedStartLoadOptions = null;
      const query = async (sql) => {
        if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
          calls.push('createBenchmarkTable');
          return {rows: []};
        }
        if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
          calls.push('updateBenchmarkPolicies');
          return {rows: []};
        }
        if (sql.includes(SQL_FROM_TABLES)) {
          return {
            rows: [{
              table_id: 'tbl-benchmark-events-1',
              table_policies: TABLE_POLICIES_JSON,
            }],
          };
        }
        if (sql.includes(SQL_FROM_PARTITIONS)) {
          return {rows: [{partition_id: 'benchmark-events-p1'}]};
        }
        if (sql.includes(SQL_FROM_SERVICES)) {
          return {
            rows: [
              {
                partition_id: 'benchmark-events-p1',
                node_id: 'seed-1',
                status: 'active',
              },
              {
                partition_id: 'benchmark-events-p1',
                node_id: 'joiner-1',
                status: 'active',
              },
            ],
          };
        }
        return {rows: []};
      };
      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query,
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query,
      };

      const cluster = {
        getNodes: () => [seedNode, joinerNode],
        waitForLoadReadinessStability: async (options = {}) => {
          calls.push(['waitForLoadReadinessStability', options]);
        },
        waitForControlPlaneQuiescence: async (options = {}) => {
          calls.push(['waitForControlPlaneQuiescence', options]);
        },
        resolveBenchmarkReadyLoadNodes: async (options = {}) => {
          calls.push(['resolveBenchmarkReadyLoadNodes', options]);
          return [seedNode, joinerNode];
        },
        startLoad: (options = {}) => {
          observedStartLoadOptions = options;
          calls.push(['startLoad', options]);
          return {
            getMetrics: () => ({total: 10, success: 10}),
            getAcknowledgedWrites: () => ({
              tableName: BENCHMARK_TABLE_NAME,
              idColumn: 'event_id',
              ids: [],
            }),
            cancel: () => {},
            waitComplete: async () => ({
              total: 20,
              success: 20,
              failed: 0,
            }),
          };
        },
        restartNode: async (nodeId) => {
          calls.push(['restartNode', nodeId]);
          assert.deepEqual(
            observedStartLoadOptions.nodeResolver().map((node) => node.id),
            ['seed-1'],
            'nodeResolver should withdraw the node being restarted',
          );
        },
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preLoadReadinessStableWindowMs: 0,
        preLoadReadinessTimeoutMs: 2000,
        preRestartSettleMs: 0,
        interRestartDelayMs: 0,
        postRestartLoadSoakMs: 0,
        postRestartQuietWindowMs: 0,
      });

      const startLoadIndex = calls.findIndex((call) =>
        Array.isArray(call) && call[0] === 'startLoad');
      const admissionIndex = calls.findIndex((call) =>
        Array.isArray(call) && call[0] === 'resolveBenchmarkReadyLoadNodes');
      const quiescenceIndex = calls.findIndex((call) =>
        Array.isArray(call) && call[0] === 'waitForControlPlaneQuiescence');
      const createIndex = calls.findIndex((call) =>
        call === 'createBenchmarkTable');
      assert.deepEqual(calls[ZERO], [
        'waitForLoadReadinessStability',
        {
          stableWindowMs: ZERO,
          timeoutMs: 2000,
          noProgressMaxAttempts: ZERO,
          loadReadinessPhase: LOAD_READINESS_PHASE_PRE_LOAD,
          requireActiveGatePromotion: true,
        },
      ]);
      assert.deepEqual(calls[quiescenceIndex], [
        'waitForControlPlaneQuiescence',
        {
          timeoutMs: 2000,
          stableWindowMs: ZERO,
          maxInFlightCount: ZERO,
          ignoreStaleInFlightReplicaOperations: true,
          requireCriticalSystemSpread: true,
        },
      ]);
      assert.ok(quiescenceIndex > ZERO);
      if (createIndex >= ZERO) {
        assert.ok(createIndex > quiescenceIndex);
      }
      assert.ok(admissionIndex >= 0);
      assert.ok(admissionIndex > quiescenceIndex);
      assert.ok(startLoadIndex > admissionIndex);
      assert.equal(
        observedStartLoadOptions.tableName,
        BENCHMARK_TABLE_NAME,
      );
      assert.equal(
        observedStartLoadOptions.workloadProfile,
        BENCHMARK_WORKLOAD_PROFILE,
      );
      assert.equal(typeof observedStartLoadOptions.nodeResolver, 'function');
      assert.deepEqual(
        observedStartLoadOptions.nodes.map((node) => node.id).sort(),
        ['joiner-1', 'seed-1'],
      );
      assert.ok(
        observedStartLoadOptions.opsPerSec < 30,
        'benchmark load should be scaled to leave control-plane headroom',
      );
      assert.equal(observedStartLoadOptions.trackAcknowledgedWrites, true);
    });

  it('uses the guarded post-restart stability window as the final quiet period',
    async () => {
      const finalBarrierCalls = [];
      const quiescenceOptions = [];
      const loadReadinessOptions = [];
      const consistencyOptions = [];

      const cluster = {
        getNodes: () => [
          {
            id: SINGLE_SEED_NODE_ID,
            role: SINGLE_SEED_NODE_ROLE,
            query: async () => ({rows: []}),
          },
        ],
        startLoad: () => ({
          getMetrics: () => ({
            total: INITIAL_LOAD_TOTAL,
            success: INITIAL_LOAD_SUCCESS,
          }),
          getAcknowledgedWrites: () => ({
            tableName: LOGS_TABLE_NAME,
            idColumn: LOG_ID_COLUMN_NAME,
            ids: [],
          }),
          cancel: () => {},
          waitComplete: async () => ({
            total: FINAL_LOAD_TOTAL,
            success: FINAL_LOAD_SUCCESS,
            failed: FINAL_LOAD_FAILED,
          }),
        }),
        waitForConvergence: async () => ({
          settledAfterMs: POSITIVE_POST_RESTART_QUIET_WINDOW_MS,
        }),
        waitForAllActive: async () => {},
        waitForControlPlaneQuiescence: async (options = {}) => {
          quiescenceOptions.push({...options});
          finalBarrierCalls.push(CALL_WAIT_FOR_CONTROL_PLANE_QUIESCENCE);
        },
        waitForLoadReadinessStability: async (options = {}) => {
          loadReadinessOptions.push({...options});
          finalBarrierCalls.push(CALL_WAIT_FOR_LOAD_READINESS_STABILITY);
        },
        waitForConsistencyConvergence: async (options = {}) => {
          consistencyOptions.push({...options});
          finalBarrierCalls.push(CALL_WAIT_FOR_CONSISTENCY_CONVERGENCE);
        },
      };

      await run(cluster, {
        preLoadReadinessStableWindowMs: ZERO,
        preRestartSettleMs: ZERO,
        interRestartDelayMs: ZERO,
        postRestartLoadSoakMs: ZERO,
        postRestartQuietWindowMs: POSITIVE_POST_RESTART_QUIET_WINDOW_MS,
        perNodeConvergenceTimeoutMs: SHORT_BARRIER_TIMEOUT_MS,
        postRestartActiveTimeoutMs: SHORT_BARRIER_TIMEOUT_MS,
      });

      assert.deepEqual(quiescenceOptions, [{
        timeoutMs: SHORT_BARRIER_TIMEOUT_MS,
        stableWindowMs: EXPECTED_POST_RESTART_RECOVERY_STABLE_WINDOW_MS,
        noProgressTimeoutMs:
          DEFAULT_POST_RESTART_QUIESCENCE_NO_PROGRESS_TIMEOUT_MS,
        maxInFlightCount: POST_RESTART_QUIESCENCE_MAX_IN_FLIGHT_COUNT,
        ignoreStaleInFlightReplicaOperations: true,
        requireCriticalSystemSpread: true,
      }]);
      assert.deepEqual(
        loadReadinessOptions.slice(PRE_LOAD_READINESS_CALL_COUNT),
        [{
          stableWindowMs: EXPECTED_POST_RESTART_RECOVERY_STABLE_WINDOW_MS,
          timeoutMs: SHORT_BARRIER_TIMEOUT_MS,
          noProgressMaxAttempts:
            DEFAULT_POST_RESTART_LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
          loadReadinessPhase: LOAD_READINESS_PHASE_POST_RESTART,
        }],
      );
      assert.deepEqual(finalBarrierCalls.slice(PRE_LOAD_READINESS_CALL_COUNT), [
        CALL_WAIT_FOR_CONTROL_PLANE_QUIESCENCE,
        CALL_WAIT_FOR_LOAD_READINESS_STABILITY,
        CALL_WAIT_FOR_CONSISTENCY_CONVERGENCE,
      ]);
      assert.equal(
        consistencyOptions[ZERO].forceRepairAfterMs,
        DEFAULT_CONSISTENCY_FORCE_REPAIR_AFTER_MS,
      );
    });

  it('keeps load running across both restarts and stops it explicitly',
    async () => {
      const restartCalls = [];
      const restartReadinessTimeouts = [];
      const convergenceCalls = [];
      const activeCalls = [];
      const finalBarrierCalls = [];
      let cancelCalls = 0;
      const acknowledgedWriteIds = ['load-ack-1', 'load-ack-2'];
      let loadStopped = false;

      const loadRun = {
        getMetrics: () => ({total: 10, success: 10}),
        getAcknowledgedWrites: () => ({
          tableName: 'logs',
          idColumn: 'log_id',
          ids: acknowledgedWriteIds,
        }),
        cancel: () => {
          cancelCalls += 1;
          loadStopped = true;
        },
        waitComplete: async () => {
          assert.equal(
            loadStopped,
            true,
            'rolling-restart should stop the load run after both restarts',
          );
          return {
            total: 110,
            success: 80,
            failed: 30,
          };
        },
      };

      const cluster = {
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {
                  rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
                };
              }
              return {rows: []};
            },
          },
          {
            id: 'joiner-1',
            role: 'joiner',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {
                  rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
                };
              }
              return {rows: []};
            },
          },
          {
            id: 'joiner-2',
            role: 'joiner',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {
                  rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
                };
              }
              return {rows: []};
            },
          },
        ],
        startLoad: () => loadRun,
        restartNode: async (nodeId, options = {}) => {
          restartCalls.push(nodeId);
          restartReadinessTimeouts.push(options.readinessTimeoutMs ?? null);
        },
        waitForConvergence: async (options = {}) => {
          convergenceCalls.push({...options});
          finalBarrierCalls.push(CALL_WAIT_FOR_CONVERGENCE);
          return {settledAfterMs: 1};
        },
        waitForAllActive: async (options = {}) => {
          assert.equal(
            loadStopped,
            true,
            'final active wait should run after load has stopped',
          );
          activeCalls.push({...options});
        },
        waitForControlPlaneQuiescence: async () => {
          finalBarrierCalls.push(CALL_WAIT_FOR_CONTROL_PLANE_QUIESCENCE);
        },
        waitForLoadReadinessStability: async () => {
          finalBarrierCalls.push(CALL_WAIT_FOR_LOAD_READINESS_STABILITY);
        },
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        preRestartSettleMs: 0,
        interRestartDelayMs: 0,
        postRestartLoadSoakMs: 0,
        postRestartQuietWindowMs: 0,
        minRestartSuccessRate: 0.6,
      });

      assert.deepEqual(restartCalls, ['joiner-1', 'joiner-2']);
      assert.deepEqual(restartReadinessTimeouts, [120000, 120000]);
      assert.equal(
        convergenceCalls.length,
        EXPECTED_FINAL_CONVERGENCE_WAITS,
      );
      assert.equal(
        convergenceCalls[0].ignoreStaleInFlightReplicaOperations,
        true,
      );
      assert.equal(
        convergenceCalls[1].ignoreStaleInFlightReplicaOperations,
        true,
      );
      assert.deepEqual(
        finalBarrierCalls.slice(2),
        [
          CALL_WAIT_FOR_CONVERGENCE,
          CALL_WAIT_FOR_CONTROL_PLANE_QUIESCENCE,
          CALL_WAIT_FOR_LOAD_READINESS_STABILITY,
        ],
      );
      assert.equal(activeCalls.length, 1);
      assert.equal(
        Object.hasOwn(activeCalls[0], 'mode'),
        false,
        'final active wait should not use load-mode soft success',
      );
      assert.equal(cancelCalls, 1);
      assert.equal(result.restartSuccessRate, 0.7);
      assert.deepEqual(result.restartedNodes, ['joiner-1', 'joiner-2']);
      assert.deepEqual(result.acknowledgedWriteVisibility, {
        acknowledgedWriteCount: 2,
        reachableNodeCount: 3,
      });
    });

  it('waits for acknowledged writes to become visible after convergence',
    async () => {
      const acknowledgedWriteIds = ['load-ack-visible', 'load-ack-late'];
      const joinerAckQueries = [];
      const loadRun = {
        getMetrics: () => ({total: 10, success: 10}),
        getAcknowledgedWrites: () => ({
          tableName: 'logs',
          idColumn: 'log_id',
          ids: acknowledgedWriteIds,
        }),
        cancel: () => {},
        waitComplete: async () => ({
          total: 20,
          success: 20,
          failed: 0,
        }),
      };

      const cluster = {
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {
                  rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
                };
              }
              return {rows: []};
            },
          },
          {
            id: 'joiner-1',
            role: 'joiner',
            query: async (sql) => {
              if (!sql.includes(ACK_QUERY_FRAGMENT)) {
                return {rows: []};
              }
              joinerAckQueries.push(sql);
              if (joinerAckQueries.length === 1) {
                return {rows: [{ack_id: acknowledgedWriteIds[ZERO]}]};
              }
              return {
                rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
              };
            },
          },
        ],
        startLoad: () => loadRun,
        restartNode: async () => {},
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        preRestartSettleMs: ZERO,
        interRestartDelayMs: ZERO,
        postRestartLoadSoakMs: ZERO,
        postRestartQuietWindowMs: ZERO,
        acknowledgedWriteVisibilityTimeoutMs:
          ACK_VISIBILITY_RETRY_TIMEOUT_MS,
        acknowledgedWriteVisibilityPollIntervalMs:
          ACK_VISIBILITY_RETRY_POLL_INTERVAL_MS,
      });

      assert.deepEqual(result.acknowledgedWriteVisibility, {
        acknowledgedWriteCount: acknowledgedWriteIds.length,
        reachableNodeCount: 2,
      });
      assert.equal(joinerAckQueries.length, 2);
      assert.equal(joinerAckQueries[1].includes(acknowledgedWriteIds[ZERO]),
        true);
      assert.equal(joinerAckQueries[1].includes(acknowledgedWriteIds[1]),
        true);
    });

  it('requires acknowledged writes to be visible in the same retry pass',
    async () => {
      const acknowledgedWriteIds = ['load-ack-unstable-a',
        'load-ack-unstable-b'];
      let joinerAckQueryCount = ZERO;
      const loadRun = {
        getMetrics: () => ({total: 10, success: 10}),
        getAcknowledgedWrites: () => ({
          tableName: 'logs',
          idColumn: 'log_id',
          ids: acknowledgedWriteIds,
        }),
        cancel: () => {},
        waitComplete: async () => ({
          total: 20,
          success: 20,
          failed: 0,
        }),
      };

      const cluster = {
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {
                  rows: acknowledgedWriteIds.map((ackId) => ({ack_id: ackId})),
                };
              }
              return {rows: []};
            },
          },
          {
            id: 'joiner-1',
            role: 'joiner',
            query: async (sql) => {
              if (!sql.includes(ACK_QUERY_FRAGMENT)) {
                return {rows: []};
              }
              joinerAckQueryCount += 1;
              const ackId = joinerAckQueryCount % 2 === 1 ?
                acknowledgedWriteIds[ZERO] :
                acknowledgedWriteIds[1];
              return {rows: [{ack_id: ackId}]};
            },
          },
        ],
        startLoad: () => loadRun,
        restartNode: async () => {},
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      await assert.rejects(
        run(cluster, {
          preRestartSettleMs: ZERO,
          interRestartDelayMs: ZERO,
          postRestartLoadSoakMs: ZERO,
          postRestartQuietWindowMs: ZERO,
          acknowledgedWriteVisibilityTimeoutMs:
            ACK_VISIBILITY_RETRY_TIMEOUT_MS,
          acknowledgedWriteVisibilityPollIntervalMs:
            ACK_VISIBILITY_RETRY_POLL_INTERVAL_MS,
        }),
        /Acknowledged writes missing after rolling restart/,
      );
      assert.ok(joinerAckQueryCount > 1);
    });

  it('fails when acknowledged writes are missing after convergence',
    async () => {
      const loadRun = {
        getMetrics: () => ({total: 10, success: 10}),
        getAcknowledgedWrites: () => ({
          tableName: 'logs',
          idColumn: 'log_id',
          ids: ['load-ack-missing'],
        }),
        cancel: () => {},
        waitComplete: async () => ({
          total: 20,
          success: 20,
          failed: 0,
        }),
      };

      const cluster = {
        getNodes: () => [
          {
            id: 'seed-1',
            role: 'seed',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {rows: []};
              }
              return {rows: []};
            },
          },
          {
            id: 'joiner-1',
            role: 'joiner',
            query: async (sql) => {
              if (sql.includes(ACK_QUERY_FRAGMENT)) {
                return {rows: []};
              }
              return {rows: []};
            },
          },
        ],
        startLoad: () => loadRun,
        restartNode: async () => {},
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      await assert.rejects(
        run(cluster, {
          preRestartSettleMs: 0,
          interRestartDelayMs: 0,
          postRestartLoadSoakMs: 0,
          postRestartQuietWindowMs: 0,
          minRestartSuccessRate: 0.6,
          acknowledgedWriteVisibilityTimeoutMs: ZERO,
          acknowledgedWriteVisibilityPollIntervalMs: ZERO,
        }),
        /Acknowledged writes missing after rolling restart/,
      );
    });
});
