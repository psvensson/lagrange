import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/seed-restart-under-load.js';

describe('seed-restart-under-load scenario', () => {
  it('uses cluster scenario timing overrides when explicit options are absent',
    async () => {
      let observedLoadDuration = null;
      const calls = [];

      const cluster = {
        _config: {
          scenarios: {
            seedRestartUnderLoad: {
              loadDuration: '15s',
              preRestartDelayMs: 0,
              postRestartQuietWindowMs: 0,
              restartReadinessTimeoutMs: 4321,
              minSuccessRate: 0.5,
            },
          },
        },
        getNodes: () => [
          {id: 'seed-1', role: 'seed'},
          {id: 'joiner-1', role: 'joiner'},
        ],
        startLoad: (options = {}) => {
          observedLoadDuration = options.duration;
          return {
            waitComplete: async () => ({
              total: 10,
              success: 9,
              failed: 1,
            }),
          };
        },
        restartNode: async (nodeId, options) => {
          calls.push(['restartNode', nodeId, options]);
        },
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster);

      assert.equal(observedLoadDuration, '15s');
      assert.deepEqual(calls[0], [
        'restartNode',
        'seed-1',
        {readinessTimeoutMs: 4321},
      ]);
    });

  it('restarts the seed node and enforces success threshold', async () => {
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 9,
          failed: 1,
        }),
      }),
      restartNode: async (nodeId, options) => {
        calls.push(['restartNode', nodeId, options]);
      },
      waitForConvergence: async () => {
        calls.push(['waitForConvergence']);
        return {settledAfterMs: 1};
      },
      waitForAllActive: async () => {
        calls.push(['waitForAllActive']);
      },
      assertConsistency: async () => {
        calls.push(['assertConsistency']);
      },
      waitForConsistencyConvergence: async () => {
        calls.push(['waitForConsistencyConvergence']);
      },
    };

    const result = await run(cluster, {
      preRestartDelayMs: 0,
      postRestartQuietWindowMs: 0,
      restartReadinessTimeoutMs: 1234,
      minSuccessRate: 0.5,
    });

    assert.equal(result.seedNodeId, 'seed-1');
    assert.equal(result.convergenceTiming.settledAfterMs, 1);
    assert.ok(result.successRate >= 0.5);
    assert.deepEqual(calls[0], ['waitForAllActive']);
    assert.deepEqual(calls[1], [
      'restartNode',
      'seed-1',
      {readinessTimeoutMs: 1234},
    ]);
    assert.deepEqual(calls[2], ['waitForConvergence']);
    assert.deepEqual(calls[3], ['waitForAllActive']);
    assert.deepEqual(calls[4], ['waitForConsistencyConvergence']);
  });
});
