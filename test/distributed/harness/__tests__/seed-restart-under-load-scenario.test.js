import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/seed-restart-under-load.js';

describe('seed-restart-under-load scenario', () => {
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
      restartNode: async (nodeId) => {
        calls.push(['restartNode', nodeId]);
      },
      waitForConvergence: async () => {
        calls.push(['waitForConvergence']);
        return {settledAfterMs: 1};
      },
      assertConsistency: async () => {
        calls.push(['assertConsistency']);
      },
    };

    const result = await run(cluster, {
      preRestartDelayMs: 0,
      minSuccessRate: 0.5,
    });

    assert.equal(result.seedNodeId, 'seed-1');
    assert.equal(result.convergenceTiming.settledAfterMs, 1);
    assert.ok(result.successRate >= 0.5);
    assert.deepEqual(calls[0], ['restartNode', 'seed-1']);
    assert.deepEqual(calls[1], ['waitForConvergence']);
    assert.deepEqual(calls[2], ['assertConsistency']);
  });
});
