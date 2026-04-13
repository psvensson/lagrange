// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/rolling-restart.js';

const ACK_QUERY_FRAGMENT = ' AS ack_id ';

describe('rolling-restart scenario', () => {
  it('uses cluster scenario timing overrides when explicit options are absent',
    async () => {
      let observedLoadDuration = null;
      const restartReadinessTimeouts = [];
      const activeTimeouts = [];

      const cluster = {
        _config: {
          scenarios: {
            rollingRestart: {
              loadDuration: '15s',
              preRestartSettleMs: 0,
              perRestartActiveTimeoutMs: 1234,
              interRestartDelayMs: 0,
              postRestartLoadSoakMs: 0,
              postRestartQuietWindowMs: 0,
              postRestartActiveTimeoutMs: 4321,
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
          restartReadinessTimeouts.push(options.readinessTimeoutMs ?? null);
        },
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async (options = {}) => {
          activeTimeouts.push(options.timeoutMs);
        },
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster);

      assert.equal(observedLoadDuration, '15s');
      assert.deepEqual(restartReadinessTimeouts, [1234]);
      assert.deepEqual(activeTimeouts, [4321]);
    });

  it('keeps load running across both restarts and stops it explicitly',
    async () => {
      const restartCalls = [];
      const restartReadinessTimeouts = [];
      const convergenceCalls = [];
      const activeCalls = [];
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
        waitForConvergence: async () => {
          convergenceCalls.push('waitForConvergence');
          return {settledAfterMs: 1};
        },
        waitForAllActive: async () => {
          activeCalls.push('waitForAllActive');
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
      assert.equal(convergenceCalls.length, 1);
      assert.equal(activeCalls.length, 1);
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
