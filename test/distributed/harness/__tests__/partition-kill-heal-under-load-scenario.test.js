import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/partition-kill-heal-under-load.js';
import {
  createThreeNodeScenarioFixture,
} from '../../scenarios/user-load-table-and-marker-helpers.js';

describe('partition-kill-heal-under-load scenario', () => {
  it('provisions user load table, applies compound fault flow, and verifies marker readback',
    async () => {
      const calls = [];
      let startLoadOptions = null;
      const {state, nodes} = createThreeNodeScenarioFixture();

      const cluster = {
        getNodes: () => nodes,
        startLoad: (options) => {
          startLoadOptions = options;
          return {
            waitComplete: async () => ({
              total: 20,
              success: 19,
              failed: 1,
            }),
          };
        },
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

      assert.equal(state.provisionedTable, 'user_load_logs');
      assert.equal(startLoadOptions.tableName, 'user_load_logs');
      assert.equal(result.tableName, 'user_load_logs');
      assert.equal(
        result.diagnosticMarkers.preFault.markerId,
        'partition-kill-heal-under-load-pre-fault',
      );
      assert.equal(
        result.diagnosticMarker.markerId,
        'partition-kill-heal-under-load-post-heal',
      );
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
