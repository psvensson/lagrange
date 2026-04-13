import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/node-join-under-load.js';

describe('node-join-under-load scenario', () => {
  it('uses cluster scenario timing overrides when explicit options are absent',
    async () => {
      let observedLoadDuration = null;

      const cluster = {
        _config: {
          scenarios: {
            nodeJoinUnderLoad: {
              loadDuration: '15s',
              preJoinSettleMs: 0,
              loadReadinessStableWindowMs: 250,
              loadReadinessStabilizationTimeoutMs: 1000,
            },
          },
        },
        waitForLoadReadinessStability: async () => {},
        getNodes: () => [{
          id: 'seed',
          async queryWithTimeout(sql) {
            if (sql.includes('FROM partitions')) {
              return {
                rows: [{partition_id: 'tbl-benchmark-p1'}],
              };
            }
            if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
              return {
                rows: [{table_id: 'tbl-benchmark'}],
              };
            }
            return {rows: []};
          },
        }],
        waitForBenchmarkReadyLoadNodes: async () => [
          {id: 'seed'},
          {id: 'peer-1'},
        ],
        startLoad: (options = {}) => {
          observedLoadDuration = options.duration;
          return {
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
          };
        },
        addNode: async () => ({id: 'joiner-2'}),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster);

      assert.equal(observedLoadDuration, '15s');
    });

  it('waits for load-readiness stability before preparing benchmark table',
    async () => {
      let loadReadinessSettled = false;
      let observedSeedQuery = false;

      const cluster = {
        waitForLoadReadinessStability: async () => {
          loadReadinessSettled = true;
        },
        getNodes: () => [{
          id: 'seed',
          async queryWithTimeout(sql) {
            observedSeedQuery = true;
            assert.equal(
              loadReadinessSettled,
              true,
              'benchmark table bootstrap should not start before load-readiness settles',
            );
            if (sql.includes('FROM partitions')) {
              return {
                rows: [{partition_id: 'tbl-benchmark-p1'}],
              };
            }
            if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
              return {
                rows: [{table_id: 'tbl-benchmark'}],
              };
            }
            return {rows: []};
          },
        }],
        waitForBenchmarkReadyLoadNodes: async () => [
          {id: 'seed'},
          {id: 'peer-1'},
        ],
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
        addNode: async () => ({id: 'joiner-2'}),
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
        loadReadinessStableWindowMs: 250,
        loadReadinessStabilizationTimeoutMs: 1000,
      });

      assert.equal(
        observedSeedQuery,
        true,
        'scenario should execute benchmark table bootstrap after load-readiness stabilization',
      );
    });

  it('prepares benchmark workload routing before starting join load',
    async () => {
      const seedQueries = [];
      const startLoadCalls = [];
      const cluster = {
        startLoad: (options) => {
          startLoadCalls.push(options);
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => [{
          id: 'seed',
          async queryWithTimeout(sql) {
            seedQueries.push(sql);
            if (sql.includes('FROM partitions')) {
              return {
                rows: [{partition_id: 'tbl-benchmark-p1'}],
              };
            }
            if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
              return {
                rows: [{table_id: 'tbl-benchmark'}],
              };
            }
            return {rows: []};
          },
        }],
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.ok(
        seedQueries.some((sql) => sql.startsWith(
          'CREATE TABLE IF NOT EXISTS benchmark_events ',
        )),
        'scenario should ensure the benchmark workload table exists before load',
      );
      assert.equal(startLoadCalls.length, 1);
      assert.equal(startLoadCalls[0].tableName, 'benchmark_events');
      assert.equal(
        startLoadCalls[0].workloadProfile,
        'benchmark_events_mixed',
      );
    });

  it('waits for benchmark-ready load nodes before starting pressure', async () => {
    let benchmarkReadySettled = false;
    let startLoadObserved = false;

    const cluster = {
      waitForBenchmarkReadyLoadNodes: async () => {
        benchmarkReadySettled = true;
        return [{id: 'seed'}, {id: 'joiner-1'}];
      },
      startLoad: () => {
        startLoadObserved = true;
        assert.equal(
          benchmarkReadySettled,
          true,
          'load should not start before benchmark-ready node selection completes',
        );
        return {
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
        };
      },
      addNode: async () => ({id: 'joiner-3'}),
      nodes: () => [{id: 'seed'}, {id: 'joiner-1'}, {id: 'joiner-2'}, {id: 'joiner-3'}],
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {},
    };

    await run(cluster, {
      preJoinSettleMs: 0,
      loadReadinessStableWindowMs: 250,
      loadReadinessStabilizationTimeoutMs: 1000,
    });

    assert.equal(startLoadObserved, true, 'scenario should still execute load once gated');
  });

  it('routes benchmark load through discovery-selected nodes when available',
    async () => {
      const selectedNodes = [
        {id: 'seed'},
        {id: 'ready-peer'},
      ];
      let startLoadNodes = null;

      const cluster = {
        resolveBenchmarkReadyLoadNodes: async (options = {}) => {
          assert.equal(
            options.tableName,
            'benchmark_events',
            'selection should scope discovery to the benchmark workload table',
          );
          return selectedNodes;
        },
        startLoad: (options = {}) => {
          startLoadNodes = options.nodes || null;
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => [{id: 'seed'}, {id: 'peer-1'}, {id: 'peer-2'}],
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.deepEqual(
        startLoadNodes,
        selectedNodes,
        'scenario should pass discovery-selected load nodes into startLoad',
      );
    });

  it('waits for benchmark-ready load nodes before starting pressure',
    async () => {
      let benchmarkReadyGateSettled = false;
      let startLoadObserved = false;
      const selectedNodes = [
        {id: 'seed'},
        {id: 'ready-peer'},
        {id: 'ready-peer-2'},
      ];

      const cluster = {
        waitForBenchmarkReadyLoadNodes: async (options = {}) => {
          assert.equal(
            options.tableName,
            'benchmark_events',
            'benchmark gate should scope readiness to the benchmark table',
          );
          assert.equal(
            options.minNodeCount,
            2,
            'benchmark gate should wait for enough ready nodes to avoid single-node saturation',
          );
          benchmarkReadyGateSettled = true;
          return selectedNodes;
        },
        startLoad: (options = {}) => {
          startLoadObserved = true;
          assert.equal(
            benchmarkReadyGateSettled,
            true,
            'load should not start before benchmark-ready nodes stabilize',
          );
          assert.deepEqual(
            options.nodes,
            selectedNodes,
            'startLoad should use the gated benchmark-ready node set',
          );
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => [{id: 'seed'}, {id: 'peer-1'}, {id: 'peer-2'}],
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.equal(
        startLoadObserved,
        true,
        'scenario should still execute load after benchmark-ready gating',
      );
    });

  it('admission-gates all cluster load candidates when the benchmark gate is active',
    async () => {
      let startLoadNodes = null;
      const rawSeedNode = {
        id: 'seed',
        async queryWithTimeout(sql) {
          if (sql.includes('FROM partitions')) {
            return {
              rows: [{partition_id: 'tbl-benchmark-p1'}],
            };
          }
          if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
            return {
              rows: [{table_id: 'tbl-benchmark'}],
            };
          }
          return {rows: []};
        },
      };
      const rawBlockedNode = {
        id: 'blocked-peer',
        async queryWithTimeout() {
          throw new Error('blocked node should not receive direct load traffic');
        },
      };
      const rawReadyNode = {
        id: 'ready-peer',
        async queryWithTimeout() {
          return {rows: []};
        },
      };
      const rawNodes = [
        rawSeedNode,
        rawBlockedNode,
        rawReadyNode,
      ];

      const cluster = {
        waitForBenchmarkReadyLoadNodes: async () => [
          rawSeedNode,
          rawReadyNode,
        ],
        resolveBenchmarkReadyLoadNodes: async () => [
          rawSeedNode,
          rawReadyNode,
        ],
        startLoad: (options = {}) => {
          startLoadNodes = options.nodes || null;
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => rawNodes,
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.equal(
        startLoadNodes.length,
        rawNodes.length,
        'dynamic benchmark gate should keep all current cluster nodes available for later admission',
      );
      assert.equal(
        startLoadNodes.find((node) => node.id === 'blocked-peer')
          .isLoadAdmissionReady(),
        false,
        'blocked peers should surface benchmark admission readiness to the load generator',
      );
      await assert.rejects(
        startLoadNodes.find((node) => node.id === 'blocked-peer')
          .queryWithTimeout('SELECT 1', [], {}),
        (error) => error?.code === 'routing_not_ready',
      );
      const healthyResult = await startLoadNodes
        .find((node) => node.id === 'ready-peer')
        .queryWithTimeout('SELECT 1', [], {});
      assert.deepEqual(
        healthyResult,
        {rows: []},
        'ready peers should still proxy load queries to the underlying node',
      );
    });

  it('disables dynamic benchmark admission gating after ready-node gate timeout fallback',
    async () => {
      let observedStartLoadOptions = null;
      const rawNodes = [
        {
          id: 'seed',
          async queryWithTimeout(sql) {
            if (sql.includes('FROM partitions')) {
              return {
                rows: [{partition_id: 'tbl-benchmark-p1'}],
              };
            }
            if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
              return {
                rows: [{table_id: 'tbl-benchmark'}],
              };
            }
            return {rows: []};
          },
        },
        {id: 'peer-1', async queryWithTimeout() { return {rows: []}; }},
        {id: 'peer-2', async queryWithTimeout() { return {rows: []}; }},
      ];

      const cluster = {
        waitForBenchmarkReadyLoadNodes: async () => {
          throw new Error('Timed out waiting for benchmark-ready quorum');
        },
        resolveBenchmarkReadyLoadNodes: async () => [],
        startLoad: (options = {}) => {
          observedStartLoadOptions = options;
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-3'}),
        getNodes: () => rawNodes,
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.equal(
        typeof observedStartLoadOptions.nodeResolver,
        'undefined',
        'fallback mode should rely on admin load-lane admission and skip an extra routing pre-gate',
      );
      assert.deepEqual(
        observedStartLoadOptions.nodes.map((node) => node.id),
        ['seed'],
        'fallback mode should use a conservative single-node load target to reduce admission pressure while readiness recovers',
      );
    });

  it('scales benchmark load pressure to the initially ready node budget',
    async () => {
      let observedOpsPerSec = null;
      const rawNodes = [
        {
          id: 'seed',
          async queryWithTimeout(sql) {
            if (sql.includes('FROM partitions')) {
              return {
                rows: [{partition_id: 'tbl-benchmark-p1'}],
              };
            }
            if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
              return {
                rows: [{table_id: 'tbl-benchmark'}],
              };
            }
            return {rows: []};
          },
        },
        {id: 'peer-1', async queryWithTimeout() { return {rows: []}; }},
        {id: 'peer-2', async queryWithTimeout() { return {rows: []}; }},
        {id: 'peer-3', async queryWithTimeout() { return {rows: []}; }},
        {id: 'peer-4', async queryWithTimeout() { return {rows: []}; }},
      ];

      const cluster = {
        waitForBenchmarkReadyLoadNodes: async () => [
          rawNodes[0],
          rawNodes[1],
        ],
        resolveBenchmarkReadyLoadNodes: async () => [
          rawNodes[0],
          rawNodes[1],
        ],
        startLoad: (options = {}) => {
          observedOpsPerSec = options.opsPerSec;
          return {
            waitComplete: async () => ({
              total: 10,
              success: 10,
              failed: 0,
              errors: 0,
              targetOperations: 10,
              undispatchedOperations: 0,
              queueDelay: {p95: 10},
            }),
          };
        },
        addNode: async () => ({id: 'joiner-5'}),
        getNodes: () => rawNodes,
        waitForConvergence: async () => ({
          settledAfterMs: 1,
        }),
        waitForConsistencyConvergence: async () => {},
      };

      await run(cluster, {
        preJoinSettleMs: 0,
      });

      assert.equal(
        observedOpsPerSec,
        15,
        'load pressure should reserve headroom while scaling to the ready-node fraction at startup',
      );
    });

  it('caps startup benchmark scaling to the minimum-ready quorum budget', async () => {
    let observedOpsPerSec = null;
    const rawNodes = [
      {
        id: 'seed',
        async queryWithTimeout(sql) {
          if (sql.includes('FROM partitions')) {
            return {
              rows: [{partition_id: 'tbl-benchmark-p1'}],
            };
          }
          if (sql.startsWith('SELECT table_id FROM tables WHERE table_name = ')) {
            return {
              rows: [{table_id: 'tbl-benchmark'}],
            };
          }
          return {rows: []};
        },
      },
      {id: 'peer-1', async queryWithTimeout() { return {rows: []}; }},
      {id: 'peer-2', async queryWithTimeout() { return {rows: []}; }},
      {id: 'peer-3', async queryWithTimeout() { return {rows: []}; }},
      {id: 'peer-4', async queryWithTimeout() { return {rows: []}; }},
    ];

    const cluster = {
      waitForBenchmarkReadyLoadNodes: async () => [
        rawNodes[0],
        rawNodes[1],
        rawNodes[2],
        rawNodes[3],
      ],
      resolveBenchmarkReadyLoadNodes: async () => [
        rawNodes[0],
        rawNodes[1],
        rawNodes[2],
        rawNodes[3],
      ],
      startLoad: (options = {}) => {
        observedOpsPerSec = options.opsPerSec;
        return {
          waitComplete: async () => ({
            total: 10,
            success: 10,
            failed: 0,
            errors: 0,
            targetOperations: 10,
            undispatchedOperations: 0,
            queueDelay: {p95: 10},
          }),
        };
      },
      addNode: async () => ({id: 'joiner-5'}),
      getNodes: () => rawNodes,
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {},
    };

    await run(cluster, {
      preJoinSettleMs: 0,
    });

    assert.equal(
      observedOpsPerSec,
      15,
      'startup scaling should remain pinned to the conservative quorum budget even when more nodes are already benchmark-ready',
    );
  });

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

  it('allows mild benchmark under-dispatch while admission control keeps join stable', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 93,
          success: 93,
          failed: 0,
          errors: 0,
          attemptErrors: 12,
          nonAdmissionAttemptErrors: 0,
          admissionSignals: 12,
          targetOperations: 100,
          undispatchedOperations: 7,
          queueDelay: {p95: 20},
          waitReasons: {
            nodeAdmissionBlocked: 40,
            retryableControlPlanePressure: 12,
            timeoutWaits: 0,
          },
        }),
      }),
      addNode: async () => ({id: 'joiner-3'}),
      nodes: () => [{id: 'seed'}, {id: 'joiner-1'}, {id: 'joiner-2'}, {id: 'joiner-3'}],
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {},
    };

    const result = await run(cluster, {
      preJoinSettleMs: 0,
    });

    assert.equal(result.newNodeId, 'joiner-3');
    assert.equal(result.loadMetrics.undispatchedOperations, 7);
  });

  it('allows mild benchmark under-dispatch when node-admission waits dominate even without aggregated admission signals', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 93,
          success: 93,
          failed: 0,
          errors: 0,
          attemptErrors: 12,
          nonAdmissionAttemptErrors: 0,
          admissionSignals: 0,
          targetOperations: 100,
          undispatchedOperations: 7,
          queueDelay: {p95: 20},
          waitReasons: {
            nodeAdmissionBlocked: 40,
            retryableControlPlanePressure: 0,
            timeoutWaits: 0,
          },
        }),
      }),
      addNode: async () => ({id: 'joiner-3'}),
      nodes: () => [{id: 'seed'}, {id: 'joiner-1'}, {id: 'joiner-2'}, {id: 'joiner-3'}],
      waitForConvergence: async () => ({
        settledAfterMs: 1,
      }),
      waitForConsistencyConvergence: async () => {},
    };

    const result = await run(cluster, {
      preJoinSettleMs: 0,
    });

    assert.equal(result.newNodeId, 'joiner-3');
    assert.equal(result.loadMetrics.undispatchedOperations, 7);
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
                publicationConvergence: {
                  publicationEpoch: 12,
                  publicationStatus: 'ACK_PENDING',
                  publishedActiveNodeIds: ['seed', 'joiner-1'],
                  pendingAckNodeIds: ['joiner-3'],
                  recoveryProtocolState: 'publication_pending',
                  priorityRecoveryReasonCodes: [
                    'publication_epoch_pending',
                    'priority_partitions_not_spread',
                  ],
                  priorityPartitionSummary: {
                    satisfied: false,
                    missingPartitionIds: ['replica_operations-p1'],
                  },
                },
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
              publicationConvergence: {
                publicationEpoch: 12,
                publicationStatus: 'ACK_PENDING',
                publishedActiveNodeIds: ['seed', 'joiner-1'],
                pendingAckNodeIds: ['joiner-3'],
                recoveryProtocolState: 'publication_pending',
                priorityRecoveryReasonCodes: [
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ],
                priorityPartitionSummary: {
                  satisfied: false,
                  missingPartitionIds: ['replica_operations-p1'],
                },
              },
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

  it('counts overlapping failed/errors once in failure assertions', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 6,
          failed: 4,
          errors: 4,
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
      waitForConsistencyConvergence: async () => {},
    };

    await assert.rejects(async () => {
      await run(cluster, {
        preJoinSettleMs: 0,
        maxFailedOperations: 3,
      });
    }, /observed 4/);
  });

  it('falls back to failed when errors is absent', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 8,
          failed: 2,
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
      waitForConsistencyConvergence: async () => {},
    };

    await assert.rejects(async () => {
      await run(cluster, {
        preJoinSettleMs: 0,
        maxFailedOperations: 1,
      });
    }, /observed 2/);
  });

  it('falls back to errors when failed is absent', async () => {
    const cluster = {
      startLoad: () => ({
        waitComplete: async () => ({
          total: 10,
          success: 8,
          errors: 2,
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
      waitForConsistencyConvergence: async () => {},
    };

    await assert.rejects(async () => {
      await run(cluster, {
        preJoinSettleMs: 0,
        maxFailedOperations: 1,
      });
    }, /observed 2/);
  });
});
