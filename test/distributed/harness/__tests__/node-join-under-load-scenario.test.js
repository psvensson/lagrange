import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/node-join-under-load.js';

describe('node-join-under-load scenario', () => {
  it('calls waitForConsistencyConvergence after join and load', async () => {
    let convergenceCalls = 0;

    const cluster = {
      startLoad: () => ({
        getMetrics: () => ({failed: 0}),
        waitComplete: async () => ({
          total: 10,
          success: 10,
          failed: 0,
        }),
      }),
      addNode: async () => ({id: 'joiner-3'}),
      nodes: () => [{id: 'seed'}, {id: 'joiner-1'}, {id: 'joiner-2'}, {id: 'joiner-3'}],
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {
        convergenceCalls += 1;
      },
    };

    const result = await run(cluster, {
      preJoinSettleMs: 0,
      interRetryDelayMs: 0,
      consistencyTimeoutMs: 20,
      consistencyPollIntervalMs: 0,
    });

    assert.equal(result.newNodeId, 'joiner-3');
    assert.ok(convergenceCalls >= 1);
  });
});
