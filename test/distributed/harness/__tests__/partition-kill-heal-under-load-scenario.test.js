import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/partition-kill-heal-under-load.js';

describe('partition-kill-heal-under-load scenario', () => {
  it('applies compound fault flow and returns diagnostics', async () => {
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
        {id: 'joiner-2', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 20,
          success: 19,
          failed: 1,
        }),
      }),
      partitionNetwork: async (groupA, groupB) => {
        calls.push(['partitionNetwork', groupA, groupB]);
      },
      killNode: async (nodeId) => {
        calls.push(['killNode', nodeId]);
      },
      healPartition: async () => {
        calls.push(['healPartition']);
      },
      waitForConvergence: async () => {
        calls.push(['waitForConvergence']);
        return {settledAfterMs: 1};
      },
      assertConsistency: async () => {
        calls.push(['assertConsistency']);
      },
      waitForConsistencyConvergence: async () => {
        calls.push(['waitForConsistencyConvergence']);
      },
      randomNonSeed: () => 'joiner-1',
    };

    const result = await run(cluster, {
      preFaultDelayMs: 0,
      partitionHoldMs: 0,
      postKillDelayMs: 0,
      minSuccessRate: 0.5,
    });

    assert.equal(result.killedNodeId, 'joiner-1');
    assert.equal(result.convergenceTiming.settledAfterMs, 1);
    assert.ok(result.successRate >= 0.5);
    assert.deepEqual(calls[0][0], 'partitionNetwork');
    assert.deepEqual(calls[1], ['killNode', 'joiner-1']);
    assert.deepEqual(calls[2], ['healPartition']);
    assert.deepEqual(calls[3], ['waitForConvergence']);
    assert.deepEqual(calls[4], ['waitForConsistencyConvergence']);
  });
});
