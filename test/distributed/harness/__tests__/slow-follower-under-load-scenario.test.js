import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/slow-follower-under-load.js';

describe('slow-follower-under-load scenario', () => {
  it('injects follower slowdown, heals it, and returns diagnostics', async () => {
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 20,
          success: 17,
          failed: 3,
        }),
      }),
      slowNetwork: async (nodeId, options) => {
        calls.push(['slowNetwork', nodeId, options]);
      },
      clearNetworkSlowdown: async (nodeId) => {
        calls.push(['clearNetworkSlowdown', nodeId]);
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
      faultHoldMs: 0,
      postHealDelayMs: 0,
      latencyMs: 300,
      jitterMs: 40,
      minSuccessRate: 0.5,
    });

    assert.equal(result.targetNodeId, 'joiner-1');
    assert.equal(result.slowdown.latencyMs, 300);
    assert.equal(result.slowdown.jitterMs, 40);
    assert.equal(result.convergenceTiming.settledAfterMs, 1);
    assert.ok(result.successRate >= 0.5);

    assert.deepEqual(calls[0], [
      'slowNetwork',
      'joiner-1',
      {
        latency: 300,
        jitter: 40,
      },
    ]);
    assert.deepEqual(calls[1], [
      'clearNetworkSlowdown',
      'joiner-1',
    ]);
    assert.deepEqual(calls[2], ['waitForConvergence']);
    assert.deepEqual(calls[3], ['waitForConsistencyConvergence']);
  });

  it('still clears slowdown when convergence checks fail', async () => {
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 1,
          success: 1,
          failed: 0,
        }),
      }),
      slowNetwork: async (nodeId, _options) => {
        calls.push(['slowNetwork', nodeId]);
      },
      clearNetworkSlowdown: async (nodeId) => {
        calls.push(['clearNetworkSlowdown', nodeId]);
      },
      waitForConvergence: async () => {
        throw new Error('convergence failed');
      },
      assertConsistency: async () => {},
      waitForConsistencyConvergence: async () => {},
    };

    await assert.rejects(
      run(cluster, {
        preFaultDelayMs: 0,
        faultHoldMs: 0,
        postHealDelayMs: 0,
      }),
      /convergence failed/,
    );

    assert.deepEqual(calls[0], ['slowNetwork', 'joiner-1']);
    assert.deepEqual(calls[1], ['clearNetworkSlowdown', 'joiner-1']);
  });
});
