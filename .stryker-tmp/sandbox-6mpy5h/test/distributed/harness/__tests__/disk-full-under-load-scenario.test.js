// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/disk-full-under-load.js';

describe('disk-full-under-load scenario', () => {
  it('injects disk pressure, releases it, and returns diagnostics', async () => {
    const calls = [];

    const cluster = {
      getNodes: () => [
        {id: 'seed-1', role: 'seed'},
        {id: 'joiner-1', role: 'joiner'},
      ],
      startLoad: () => ({
        waitComplete: async () => ({
          total: 20,
          success: 18,
          failed: 2,
        }),
      }),
      fillDisk: async (nodeId, options) => {
        calls.push(['fillDisk', nodeId, options]);
      },
      releaseDiskPressure: async (nodeId, options) => {
        calls.push(['releaseDiskPressure', nodeId, options]);
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
      postReleaseDelayMs: 0,
      diskFillSizeMb: 64,
      diskPressurePath: '/tmp/lagrange-chaos/fault.bin',
      minSuccessRate: 0.5,
    });

    assert.equal(result.victimNodeId, 'joiner-1');
    assert.equal(result.diskPressure.sizeMb, 64);
    assert.equal(result.diskPressure.filePath, '/tmp/lagrange-chaos/fault.bin');
    assert.equal(result.convergenceTiming.settledAfterMs, 1);
    assert.ok(result.successRate >= 0.5);

    assert.deepEqual(calls[0], [
      'fillDisk',
      'joiner-1',
      {
        sizeMb: 64,
        filePath: '/tmp/lagrange-chaos/fault.bin',
      },
    ]);
    assert.deepEqual(calls[1], [
      'releaseDiskPressure',
      'joiner-1',
      {
        filePath: '/tmp/lagrange-chaos/fault.bin',
      },
    ]);
    assert.deepEqual(calls[2], ['waitForConvergence']);
    assert.deepEqual(calls[3], ['waitForConsistencyConvergence']);
  });

  it('still releases disk pressure when fault hold path throws', async () => {
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
      fillDisk: async (nodeId, _options) => {
        calls.push(['fillDisk', nodeId]);
      },
      releaseDiskPressure: async (nodeId, _options) => {
        calls.push(['releaseDiskPressure', nodeId]);
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
        postReleaseDelayMs: 0,
      }),
      /convergence failed/,
    );

    assert.deepEqual(calls[0], ['fillDisk', 'joiner-1']);
    assert.deepEqual(calls[1], ['releaseDiskPressure', 'joiner-1']);
  });
});
