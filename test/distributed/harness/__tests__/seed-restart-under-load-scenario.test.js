import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/seed-restart-under-load.js';
import {
  createScenarioNode,
} from '../../scenarios/user-load-table-and-marker-helpers.js';

describe('seed-restart-under-load scenario', () => {
  it('uses cluster scenario timing overrides when explicit options are absent',
    async () => {
      let observedLoadDuration = null;
      let observedTableName = null;
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
        getNodes: () => nodes,
        startLoad: (options = {}) => {
          observedLoadDuration = options.duration;
          observedTableName = options.tableName;
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
      assert.equal(observedTableName, 'user_load_logs');
      assert.deepEqual(calls[0], [
        'restartNode',
        'seed-1',
        {readinessTimeoutMs: 4321},
      ]);
    });

  it('restarts the seed node, enforces success threshold, and verifies marker readback',
    async () => {
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
      assert.equal(result.tableName, 'user_load_logs');
      assert.equal(
        result.diagnosticMarkers.preRestart.markerId,
        'seed-restart-under-load-pre-restart',
      );
      assert.equal(
        result.diagnosticMarker.markerId,
        'seed-restart-under-load-post-restart',
      );
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

  it('rejects with typed error and surviving-node metrics when cluster.restartNode fails',
    async () => {
      const state = {
        provisionedTable: null,
        recordedMarkers: new Set(),
      };
      const nodes = [
        createScenarioNode('seed-1', 'seed', state),
        createScenarioNode('joiner-1', 'joiner', state),
        createScenarioNode('joiner-2', 'joiner', state),
      ];
      let cancelled = false;
      let consistencyChecked = false;

      const cluster = {
        getNodes: () => nodes,
        startLoad: () => ({
          cancel: () => {
            cancelled = true;
          },
          waitComplete: async () => ({
            total: 12,
            success: 11,
            failed: 1,
          }),
        }),
        restartNode: async () => {
          throw new Error('storage reopen failed: corrupted wal');
        },
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {
          consistencyChecked = true;
        },
      };

      await assert.rejects(
        () => run(cluster, {
          preRestartDelayMs: 0,
          postRestartQuietWindowMs: 0,
          minSuccessRate: 0.5,
        }),
        (error) => {
          assert.equal(error.code, 'seed_restart_recovery_failed');
          assert.equal(error.seedNodeId, 'seed-1');
          assert.equal(error.seedRejoined, false);
          assert.equal(error.seedRecoveryVerified, false);
          assert.deepEqual(error.survivingNodeLoadMetrics, {
            total: 12,
            success: 11,
            failed: 1,
            successRate: 11 / 12,
          });
          assert.match(error.message, /storage reopen failed/);
          return true;
        },
      );
      assert.equal(cancelled, true);
      assert.equal(consistencyChecked, false);
      assert.equal(
        state.recordedMarkers.has('log-seed-restart-under-load-post-restart'),
        false,
      );
    });

  it('requires post-restart waitForAllActive, waitForConsistencyConvergence, and seed marker write',
    async () => {
      const makeCluster = (overrides = {}) => {
        const state = {
          provisionedTable: null,
          recordedMarkers: new Set(),
        };
        const seedNode = createScenarioNode('seed-1', 'seed', state);
        const joinerNode = createScenarioNode('joiner-1', 'joiner', state);
        if (overrides.failSeedPostRestartMarker) {
          const originalAppend = seedNode.appendDiagnosticMarker;
          seedNode.appendDiagnosticMarker = async (args) => {
            if (args.markerId === 'seed-restart-under-load-post-restart') {
              throw new Error('seed marker write rejected');
            }
            return originalAppend(args);
          };
        }
        let activeCalls = 0;
        const cluster = {
          getNodes: () => [seedNode, joinerNode],
          startLoad: () => ({
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
            }),
          }),
          restartNode: async () => {},
          waitForConvergence: async () => ({settledAfterMs: 1}),
          waitForAllActive: async () => {
            activeCalls += 1;
            if (overrides.failPostRestartActive && activeCalls >= 2) {
              throw new Error('post-restart active gate failed');
            }
          },
          waitForConsistencyConvergence: async () => {
            if (overrides.failConsistency) {
              throw new Error('post-restart consistency failed');
            }
          },
        };
        if (overrides.omitWaitForAllActive) {
          delete cluster.waitForAllActive;
        }
        if (overrides.omitWaitForConsistencyConvergence) {
          delete cluster.waitForConsistencyConvergence;
        }
        return cluster;
      };

      const opts = {
        preRestartDelayMs: 0,
        postRestartQuietWindowMs: 0,
        minSuccessRate: 0.5,
      };

      await assert.rejects(
        () => run(makeCluster({failPostRestartActive: true}), opts),
        /post-restart active gate failed/,
      );
      await assert.rejects(
        () => run(makeCluster({failConsistency: true}), opts),
        /post-restart consistency failed/,
      );
      await assert.rejects(
        () => run(makeCluster({failSeedPostRestartMarker: true}), opts),
        /seed marker write rejected/,
      );
      await assert.rejects(
        () => run(makeCluster({omitWaitForAllActive: true}), opts),
        /waitForAllActive/,
      );
      await assert.rejects(
        () => run(
          makeCluster({omitWaitForConsistencyConvergence: true}),
          opts,
        ),
        /waitForConsistencyConvergence/,
      );
    });

  it('records survivingNodeLoadMetrics, seedRejoined, and seedRecoveryVerified separately on success',
    async () => {
      const state = {
        provisionedTable: null,
        recordedMarkers: new Set(),
      };
      const nodes = [
        createScenarioNode('seed-1', 'seed', state),
        createScenarioNode('joiner-1', 'joiner', state),
        createScenarioNode('joiner-2', 'joiner', state),
      ];
      const cluster = {
        getNodes: () => nodes,
        startLoad: () => ({
          getMetrics: () => ({
            total: 6,
            success: 6,
            failed: 0,
          }),
          waitComplete: async () => ({
            total: 10,
            success: 9,
            failed: 1,
          }),
        }),
        restartNode: async () => {},
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForAllActive: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        preRestartDelayMs: 0,
        postRestartQuietWindowMs: 0,
        minSuccessRate: 0.5,
      });

      assert.equal(result.seedRejoined, true);
      assert.equal(result.seedRecoveryVerified, true);
      assert.equal('restartWarning' in result, false);
      assert.deepEqual(result.survivingNodeLoadMetrics, {
        total: 6,
        success: 6,
        failed: 0,
        successRate: 1,
      });
      assert.deepEqual(result.loadMetrics, {
        total: 10,
        success: 9,
        failed: 1,
      });
    });
});
