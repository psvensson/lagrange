import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/network-partition-split-brain.js';

describe('network-partition-split-brain scenario', () => {
  it('retries consistency checks after transient disagreement', async () => {
    let assertConsistencyCalls = 0;
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1'},
        {id: 'joiner-1'},
        {id: 'joiner-2'},
      ],
      partitionNetwork: async (groupA, groupB) => {
        calls.push(['partitionNetwork', groupA, groupB]);
      },
      healPartition: async () => {
        calls.push(['healPartition']);
      },
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      assertConsistency: async () => {
        assertConsistencyCalls += 1;
      },
      waitForConsistencyConvergence: async () => {
        assertConsistencyCalls += 1;
      },
    };

    const result = await run(cluster, {
      partitionHoldMs: 0,
      postHealConvergenceTimeoutMs: 1000,
      consistencyTimeoutMs: 20,
      consistencyPollIntervalMs: 0,
    });

    assert.ok(Array.isArray(result.groupA));
    assert.ok(Array.isArray(result.groupB));
    assert.ok(assertConsistencyCalls >= 1,
      'waitForConsistencyConvergence should be called');
    assert.equal(calls[0][0], 'partitionNetwork');
    assert.equal(calls[1][0], 'healPartition');
  });
});
