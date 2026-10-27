import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/disk-full-under-load.js';
import {
  createScenarioNode,
} from '../../scenarios/user-load-table-and-marker-helpers.js';

describe('disk-full-under-load scenario', () => {
  it('provisions user load table, injects disk pressure, releases it, and verifies marker readback',
    async () => {
      const calls = [];
      let startLoadOptions = null;
      const state = {
        provisionedTable: null,
        recordedMarkers: new Set(),
      };
      const nodes = [
        createScenarioNode('seed-1', 'seed', state),
        createScenarioNode('joiner-1', 'joiner', state),
      ];

      const cluster = {
        getNodes: () => nodes,
        startLoad: (options) => {
          startLoadOptions = options;
          return {
            waitComplete: async () => ({
              total: 20,
              success: 18,
              failed: 2,
            }),
          };
        },
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

      assert.equal(startLoadOptions.tableName, 'user_load_logs');
      assert.equal(result.tableName, 'user_load_logs');
      assert.equal(
        result.diagnosticMarker.markerId,
        'disk-full-under-load-post-release',
      );
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
    const state = {
      provisionedTable: null,
      recordedMarkers: new Set(),
    };
    const nodes = [
      createScenarioNode('seed-1', 'seed', state),
      createScenarioNode('joiner-1', 'joiner', state),
    ];

    const cluster = {
      getNodes: () => nodes,
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
