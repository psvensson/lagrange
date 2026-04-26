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
const SINGLE_SEED_NODE_ID = 'seed-1';
const SINGLE_SEED_NODE_ROLE = 'seed';
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
        false);
      assert.deepEqual(activeOptions, [{timeoutMs: 4321}]);
      assert.deepEqual(quiescenceOptions, [{
        timeoutMs: OVERRIDE_PER_NODE_CONVERGENCE_TIMEOUT_MS,
        stableWindowMs: 0,
        maxInFlightCount: POST_RESTART_QUIESCENCE_MAX_IN_FLIGHT_COUNT,
        requireCriticalSystemSpread: true,
      }]);
      assert.deepEqual(loadReadinessOptions.slice(1), [{
        stableWindowMs: 0,
        timeoutMs: 4321,
      }]);
      assert.deepEqual(consistencyOptions, [{
        timeoutMs: 9876,
        pollIntervalMs: 43,
        forceRepairAfterMs: 12,
      }]);
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
        maxInFlightCount: POST_RESTART_QUIESCENCE_MAX_IN_FLIGHT_COUNT,
        requireCriticalSystemSpread: true,
      }]);
      assert.deepEqual(
        loadReadinessOptions.slice(PRE_LOAD_READINESS_CALL_COUNT),
        [{
          stableWindowMs: EXPECTED_POST_RESTART_RECOVERY_STABLE_WINDOW_MS,
          timeoutMs: SHORT_BARRIER_TIMEOUT_MS,
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
        false,
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
        }),
        /Acknowledged writes missing after rolling restart/,
      );
    });
});
