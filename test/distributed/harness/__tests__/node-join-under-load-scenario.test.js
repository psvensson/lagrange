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
          errors: 0,
          targetOperations: 10,
          undispatchedOperations: 0,
          queueDelay: {p95: 10},
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

  it('fails when load leaves a large dispatch backlog', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 10,
          failed: 0,
          errors: 0,
          targetOperations: 10,
          undispatchedOperations: 3,
          queueDelay: {p95: 10},
        }),
      }),
      addNode: async () => ({id: 'joiner-3'}),
      nodes: () => [{id: 'seed'}, {id: 'joiner-1'}, {id: 'joiner-2'}, {id: 'joiner-3'}],
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {},
    };

    await assert.rejects(async () => {
      try {
        await run(cluster, {
          preJoinSettleMs: 0,
          maxUndispatchedRatio: 0.05,
        });
      } catch (error) {
        assert.match(error.message, /dispatch backlog/i);
        assert.equal(
          error.diagnostics?.partialResult?.failurePhase,
          'verify_load',
        );
        assert.equal(
          error.diagnostics?.partialResult?.dominantAssertion,
          'dispatch_backlog',
        );
        assert.equal(
          error.diagnostics?.partialResult?.newNodeId,
          'joiner-3',
        );
        assert.equal(
          error.diagnostics?.partialResult?.loadMetrics?.undispatchedOperations,
          3,
        );
        throw error;
      }
    }, /dispatch backlog/i);
  });

  it('copies retained-object diagnostics from control snapshots into failures',
    async () => {
      const cluster = {
        startLoad: () => ({
          waitComplete: async () => ({
            total: 10,
            success: 10,
            failed: 0,
            errors: 0,
            targetOperations: 10,
            undispatchedOperations: 3,
            queueDelay: {p95: 10},
          }),
        }),
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => [{
          id: 'seed',
          getControlSnapshot: async () => ({
            rows: [{
              controlPlaneDiagnostics: {
                logsTable: {
                  pendingWriteGrowthCount: 2,
                  retainedBacklogGrowthCount: 1,
                },
                cdcReplay: {
                  bufferedEvents: 7,
                  replayBufferGrowthCount: 3,
                  replayRetryDepth: 2,
                },
              },
            }],
          }),
        }],
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await assert.rejects(async () => {
        try {
          await run(cluster, {
            preJoinSettleMs: 0,
            maxUndispatchedRatio: 0.05,
          });
        } catch (error) {
          assert.deepEqual(
            error.diagnostics?.controlPlaneDiagnostics,
            {
              logsTable: {
                pendingWriteGrowthCount: 2,
                retainedBacklogGrowthCount: 1,
              },
              cdcReplay: {
                bufferedEvents: 7,
                replayBufferGrowthCount: 3,
                replayRetryDepth: 2,
              },
            },
            'failure should preserve retained-object diagnostics',
          );
          throw error;
        }
      }, /dispatch backlog/i);
    });
});
