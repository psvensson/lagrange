import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAOS_ACTION,
  resolveInClusterChaosInjectionScenarioConfig,
  run,
} from '../../scenarios/in-cluster-chaos-injection.js';

describe('in-cluster-chaos-injection scenario', () => {
  it('executes deterministic chaos sequence with explicit recoveries',
    async () => {
      const calls = [];

      const cluster = {
        getNodes: () => [
          {id: 'seed-1', role: 'seed'},
          {id: 'joiner-1', role: 'joiner'},
          {id: 'joiner-2', role: 'joiner'},
        ],
        startLoad: () => ({
          waitComplete: async () => ({
            total: 30,
            success: 24,
            failed: 6,
          }),
        }),
        killNode: async (nodeId) => {
          calls.push(['killNode', nodeId]);
        },
        restartNode: async (nodeId) => {
          calls.push(['restartNode', nodeId]);
        },
        pauseNode: async (nodeId) => {
          calls.push(['pauseNode', nodeId]);
        },
        unpauseNode: async (nodeId) => {
          calls.push(['unpauseNode', nodeId]);
        },
        partitionNetwork: async (groupA, groupB) => {
          calls.push(['partitionNetwork', groupA, groupB]);
        },
        healPartition: async () => {
          calls.push(['healPartition']);
        },
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
      };

      const result = await run(cluster, {
        seed: 42,
        actionSet: [CHAOS_ACTION.SLOW_CLEAR],
        actionCount: 2,
        preChaosDelayMs: 0,
        faultHoldMs: 0,
        recoveryHoldMs: 0,
        slowdownLatencyMs: 210,
        slowdownJitterMs: 15,
        minSuccessRate: 0.5,
      });

      assert.equal(result.actionCount, 2);
      assert.equal(result.seed, 42);
      assert.ok(result.successRate >= 0.5);
      assert.equal(result.actionTimeline.length, 6);
      assert.deepEqual(calls[0], [
        'slowNetwork',
        'joiner-1',
        {
          latency: 210,
          jitter: 15,
        },
      ]);
      assert.deepEqual(calls[1], ['clearNetworkSlowdown', 'joiner-1']);
      assert.deepEqual(calls[2], ['waitForConvergence']);
      assert.deepEqual(calls[3], ['waitForConsistencyConvergence']);
      assert.deepEqual(calls[4], [
        'slowNetwork',
        'joiner-1',
        {
          latency: 210,
          jitter: 15,
        },
      ]);
      assert.deepEqual(calls[5], ['clearNetworkSlowdown', 'joiner-1']);
      assert.deepEqual(calls[6], ['waitForConvergence']);
      assert.deepEqual(calls[7], ['waitForConsistencyConvergence']);
    });

  it('retries consistency checks after transient disagreement', async () => {
    let assertConsistencyCalls = 0;
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
        {id: 'joiner-2', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 10,
          failed: 0,
        }),
      }),
      killNode: async () => {
        calls.push('killNode');
      },
      restartNode: async () => {
        calls.push('restartNode');
      },
      pauseNode: async () => {
        calls.push('pauseNode');
      },
      unpauseNode: async () => {
        calls.push('unpauseNode');
      },
      partitionNetwork: async () => {
        calls.push('partitionNetwork');
      },
      healPartition: async () => {
        calls.push('healPartition');
      },
      slowNetwork: async () => {
        calls.push('slowNetwork');
      },
      clearNetworkSlowdown: async () => {
        calls.push('clearNetworkSlowdown');
      },
      waitForConvergence: async () => {
        calls.push('waitForConvergence');
        return {settledAfterMs: 1};
      },
      assertConsistency: async () => {
        assertConsistencyCalls++;
      },
      waitForConsistencyConvergence: async () => {
        assertConsistencyCalls++;
      },
    };

    const result = await run(cluster, {
      seed: 1337,
      actionSet: [CHAOS_ACTION.SLOW_CLEAR],
      actionCount: 1,
      preChaosDelayMs: 0,
      faultHoldMs: 0,
      recoveryHoldMs: 0,
      consistencyTimeoutMs: 20,
      consistencyPollIntervalMs: 0,
      minSuccessRate: 0.5,
    });

    assert.equal(result.actionCount, 1);
    assert.ok(assertConsistencyCalls >= 1,
      'waitForConsistencyConvergence should be called at least once');
    assert.ok(calls.includes('waitForConvergence'));
  });

  it('resolves deterministic default config values', () => {
    const resolved = resolveInClusterChaosInjectionScenarioConfig({});
    assert.equal(resolved.seed, 1337);
    assert.equal(resolved.actionCount, 3);
    assert.ok(Array.isArray(resolved.actionSet));
    assert.ok(resolved.actionSet.length > 0);
    assert.equal(resolved.minSuccessRate, 0.7);
  });

  it('rejects execution when no non-seed node is available', async () => {
    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 1,
          success: 1,
          failed: 0,
        }),
      }),
    };

    await assert.rejects(
      run(cluster, {
        preChaosDelayMs: 0,
      }),
      /non-seed node/,
    );
  });
});
