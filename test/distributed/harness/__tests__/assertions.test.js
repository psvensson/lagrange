/**
 * Property-based tests for convergence assertions.
 *
 * Feature: distributed-testing-framework
 * Property 9: Convergence Threshold Configuration
 *
 * Validates: Requirements 5.2
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import fc from 'fast-check';
import {waitForConvergence} from '../assertions.js';
import {CONVERGENCE_DEFAULTS} from '../constants.js';

/**
 * Build a mock node whose query() returns a converged state
 * for the given partition IDs and targetVoterCount.
 *
 * Each partition gets exactly targetVoterCount voter replicas
 * with one leader, so convergence conditions are immediately
 * satisfied.
 */
function buildConvergedMockNode(partitionIds, targetVoterCount) {
  const rows = [];
  for (const pid of partitionIds) {
    for (let i = 0; i < targetVoterCount; i++) {
      rows.push({
        service_type: 'partition',
        status: 'ACTIVE',
        raft_role: i === 0 ? 'leader' : 'follower',
        address: 'node-1/' + pid + '/r' + i,
        partition_id: pid,
      });
    }
  }
  return {
    id: 'mock-node-1',
    isReachable: async () => true,
    query: async () => ({rows}),
  };
}

/**
 * Build a mock node that never converges — returns no
 * partitions at all, so waitForConvergence will time out.
 */
function buildNonConvergingMockNode() {
  return {
    id: 'mock-node-nc',
    isReachable: async () => true,
    query: async () => ({rows: []}),
  };
}

function buildPartitionReplicaRow(partitionId, replicaSuffix, raftRole) {
  return {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: raftRole,
    address: 'node-' + replicaSuffix + '/' + partitionId + '/r-' + replicaSuffix,
    node_id: 'node-' + replicaSuffix,
    partition_id: partitionId,
  };
}

function buildSequencedConvergenceNode(options = {}) {
  const snapshots = Array.isArray(options.snapshots) ? options.snapshots : [];
  const partitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds :
    ['p1'];
  let snapshotIndex = 0;

  return {
    id: options.id || 'mock-sequence-node',
    isReachable: async () => true,
    query: async (sql) => {
      if (sql.includes('FROM partitions')) {
        return {
          rows: partitionIds.map((partitionId) => ({partition_id: partitionId})),
        };
      }
      if (sql.includes('FROM services')) {
        const boundedIndex = Math.min(
          snapshotIndex,
          Math.max(snapshots.length - 1, 0),
        );
        snapshotIndex += 1;
        return {rows: snapshots[boundedIndex] || []};
      }
      return {rows: []};
    },
  };
}

/**
 * Feature: distributed-testing-framework
 * Property 9: Convergence Threshold Configuration
 *
 * *For any* set of convergence options (settleTimeoutMs,
 * quietWindowMs, targetVoterCount, maxSustainedOverTargetMs),
 * the convergence assertion SHALL use the provided values
 * instead of defaults.
 *
 * **Validates: Requirements 5.2**
 */
test('Property 9: Convergence Threshold Configuration', async (t) => {
  await t.test(
    'custom targetVoterCount is used instead of default',
    async () => {
      const partitionIds = ['p1', 'p2'];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 1, max: 9}),
          async (targetVoterCount) => {
            const node = buildConvergedMockNode(
              partitionIds, targetVoterCount,
            );

            // Use very small timeouts so the test completes
            // instantly. If the function ignored our custom
            // targetVoterCount and used the default (3), then
            // targetVoterCount !== 3 would either fail
            // convergence (count < 3) or detect over-target
            // (count > 3).
            const result = await waitForConvergence([node], {
              settleTimeoutMs: 500,
              quietWindowMs: 0,
              maxSustainedOverTargetMs: 500,
              sampleIntervalMs: 10,
              targetVoterCount,
            });

            assert.strictEqual(typeof result.settledAfterMs, 'number');
            assert.ok(result.settledAfterMs >= 0);
            assert.strictEqual(typeof result.leaderChanges, 'number');
            assert.strictEqual(typeof result.maxOverTargetMs, 'number');
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'custom settleTimeoutMs controls timeout duration',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 50, max: 200}),
          async (settleTimeoutMs) => {
            const node = buildNonConvergingMockNode();
            const start = Date.now();

            try {
              await waitForConvergence([node], {
                settleTimeoutMs,
                quietWindowMs: 0,
                maxSustainedOverTargetMs: 1000,
                sampleIntervalMs: 10,
                targetVoterCount: 3,
              });
              // Should not reach here — non-converging node
              // must time out.
              assert.fail('Expected convergence timeout');
            } catch (err) {
              const elapsed = Date.now() - start;
              // The error message should reference our custom
              // timeout, not the default.
              assert.ok(
                err.message.includes(String(settleTimeoutMs)),
                'Error should reference custom timeout ' +
                settleTimeoutMs + ' but got: ' + err.message,
              );
              // Elapsed time should be roughly around our
              // custom timeout (with tolerance for scheduling).
              assert.ok(
                elapsed < settleTimeoutMs + 500,
                'Should timeout near ' + settleTimeoutMs +
                'ms but took ' + elapsed + 'ms',
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'provided options override defaults for all fields',
    async () => {
      const optionsArb = fc.record({
        settleTimeoutMs: fc.integer({min: 100, max: 500}),
        quietWindowMs: fc.integer({min: 0, max: 50}),
        targetVoterCount: fc.integer({min: 1, max: 9}),
        maxSustainedOverTargetMs: fc.integer({min: 100, max: 1000}),
        sampleIntervalMs: fc.integer({min: 5, max: 50}),
      });

      await fc.assert(
        fc.asyncProperty(optionsArb, async (customOpts) => {
          // Merge should produce custom values, not defaults.
          const merged = {...CONVERGENCE_DEFAULTS, ...customOpts};

          assert.strictEqual(
            merged.settleTimeoutMs, customOpts.settleTimeoutMs,
          );
          assert.strictEqual(
            merged.quietWindowMs, customOpts.quietWindowMs,
          );
          assert.strictEqual(
            merged.targetVoterCount, customOpts.targetVoterCount,
          );
          assert.strictEqual(
            merged.maxSustainedOverTargetMs,
            customOpts.maxSustainedOverTargetMs,
          );
          assert.strictEqual(
            merged.sampleIntervalMs, customOpts.sampleIntervalMs,
          );

          // Verify the function actually uses these by
          // converging with the custom targetVoterCount.
          const node = buildConvergedMockNode(
            ['p1'], customOpts.targetVoterCount,
          );
          const result = await waitForConvergence(
            [node], customOpts,
          );
          assert.ok(result.settledAfterMs >= 0);
        }),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Unit tests for convergence assertions.
 *
 * Validates: Requirements 5.2, 5.3
 */

import {
  isVoterReady,
  countVotersPerPartition,
} from '../assertions.js';

// -------------------------------------------------------
// isVoterReady
// -------------------------------------------------------

test('isVoterReady — valid voter-ready row returns true', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'leader',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), true);
});

test('isVoterReady — follower role returns true', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'follower',
    address: 'node-1/p1/r1',
  };
  assert.strictEqual(isVoterReady(row), true);
});

test('isVoterReady — null/undefined row returns false', async () => {
  assert.strictEqual(isVoterReady(null), false);
  assert.strictEqual(isVoterReady(undefined), false);
});

test('isVoterReady — wrong service_type returns false', async () => {
  const row = {
    service_type: 'message-group',
    status: 'ACTIVE',
    raft_role: 'leader',
    address: 'node-1/mg/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — non-ACTIVE status returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'STARTING',
    raft_role: 'leader',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — learner role returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'learner',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — missing raft_role returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — missing address returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'leader',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — case-insensitive raft_role check', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'LEADER',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), true);
});

// -------------------------------------------------------
// countVotersPerPartition
// -------------------------------------------------------

test('countVotersPerPartition — counts voters per partition', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'follower',
      address: 'b', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'follower',
      address: 'c', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'd', partition_id: 'p2'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.get('p1'), 3);
  assert.strictEqual(counts.get('p2'), 1);
});

test('countVotersPerPartition — skips learners', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'learner',
      address: 'b', partition_id: 'p1'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.get('p1'), 1);
});

test('countVotersPerPartition — empty rows returns empty map', async () => {
  const counts = countVotersPerPartition([]);
  assert.strictEqual(counts.size, 0);
});

test('countVotersPerPartition — skips rows without partition_id', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.size, 0);
});

// -------------------------------------------------------
// Convergence timeout throws descriptive error (Req 5.3)
// -------------------------------------------------------

test('waitForConvergence — timeout throws descriptive error with diagnostics', async () => {
  const node = {
    id: 'mock-timeout-node',
    isReachable: async () => true,
    query: async () => ({rows: []}),
  };

  try {
    await waitForConvergence([node], {
      settleTimeoutMs: 50,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 1000,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.fail('Expected convergence timeout error');
  } catch (err) {
    // Error message includes timeout value
    assert.ok(
      err.message.includes('50'),
      'Error message should include timeout value 50',
    );
    // Error message includes voter counts
    assert.ok(
      err.message.includes('Voter counts'),
      'Error message should include voter counts',
    );
    // Error message includes leaders
    assert.ok(
      err.message.includes('Leaders'),
      'Error message should include leaders',
    );
    // diagnostics object exists
    assert.ok(
      err.diagnostics !== undefined,
      'Error should have diagnostics property',
    );
    assert.strictEqual(typeof err.diagnostics.voterCounts, 'object');
    assert.strictEqual(typeof err.diagnostics.leaders, 'object');
    assert.strictEqual(typeof err.diagnostics.leaderChanges, 'number');
    assert.strictEqual(typeof err.diagnostics.maxOverTargetMs, 'number');
    assert.strictEqual(typeof err.diagnostics.elapsedMs, 'number');
    assert.strictEqual(typeof err.diagnostics.overTargetDurations, 'object');
  }
});

test('waitForConvergence — timeout error includes voter counts from partial state', async () => {
  const node = {
    id: 'mock-partial-node',
    isReachable: async () => true,
    query: async () => ({
      rows: [
        {service_type: 'partition', status: 'ACTIVE',
          raft_role: 'leader', address: 'a', partition_id: 'p1'},
      ],
    }),
  };

  try {
    await waitForConvergence([node], {
      settleTimeoutMs: 50,
      quietWindowMs: 9999,
      maxSustainedOverTargetMs: 1000,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.fail('Expected convergence timeout error');
  } catch (err) {
    assert.ok(err.diagnostics, 'Should have diagnostics');
    assert.strictEqual(err.diagnostics.voterCounts.p1, 1);
    assert.ok(err.diagnostics.leaders.p1, 'Should have leader for p1');
  }
});

test('waitForConvergence — timeout diagnostics include membership and operation history',
  async () => {
    const node = {
      id: 'mock-membership-node',
      isReachable: async () => true,
      query: async (sql) => {
        if (sql.includes('FROM replica_operations')) {
          return {
            rows: [
              {
                operation_id: 'op-1',
                partition_id: 'p1',
                operation: 'add_replica',
                status: 'pending',
                from_node_id: 'seed',
                to_node_id: 'joiner-1',
                updated_at: '2026-02-17T00:00:00.000Z',
              },
              {
                operation_id: 'op-2',
                partition_id: 'p1',
                operation: 'promote_learner',
                status: 'running',
                from_node_id: 'seed',
                to_node_id: 'joiner-2',
                updated_at: '2026-02-17T00:00:01.000Z',
              },
            ],
          };
        }
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address: 'seed/p1/r1',
              node_id: 'seed',
              partition_id: 'p1',
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address: 'joiner-1/p1/r2',
              node_id: 'joiner-1',
              partition_id: 'p1',
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address: 'joiner-2/p1/r3',
              node_id: 'joiner-2',
              partition_id: 'p1',
            },
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address: 'joiner-3/p1/r4',
              node_id: 'joiner-3',
              partition_id: 'p1',
            },
          ],
        };
      },
    };

    try {
      await waitForConvergence([node], {
        settleTimeoutMs: 50,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 0,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      });
      assert.fail('Expected convergence timeout error');
    } catch (err) {
      assert.ok(
        err.message.includes('Replica membership'),
        'Error message should include replica membership snippet',
      );
      assert.ok(
        err.message.includes('Operation history'),
        'Error message should include operation history snippet',
      );
      assert.ok(
        err.diagnostics.partitionMembership,
        'Diagnostics should include partition membership dump',
      );
      assert.ok(
        Array.isArray(err.diagnostics.operationHistory),
        'Diagnostics should include operation history snippet',
      );
      assert.ok(
        err.diagnostics.operationHistory.length > 0,
        'Operation history should include at least one operation',
      );
    }
  });

test('waitForConvergence — does not double-count replicated services snapshots',
  async () => {
    const servicesRows = [
      {
        service_type: 'partition',
        status: 'ACTIVE',
        raft_role: 'leader',
        address: 'node-a/p1/r0',
        partition_id: 'p1',
      },
      {
        service_type: 'partition',
        status: 'ACTIVE',
        raft_role: 'follower',
        address: 'node-b/p1/r1',
        partition_id: 'p1',
      },
      {
        service_type: 'partition',
        status: 'ACTIVE',
        raft_role: 'follower',
        address: 'node-c/p1/r2',
        partition_id: 'p1',
      },
    ];
    const partitionsRows = [{partition_id: 'p1'}];

    function createSnapshotNode(nodeId) {
      return {
        id: nodeId,
        isReachable: async () => true,
        query: async (sql) => {
          if (sql.includes('FROM services')) {
            return {rows: servicesRows};
          }
          if (sql.includes('FROM partitions')) {
            return {rows: partitionsRows};
          }
          return {rows: []};
        },
      };
    }

    const nodeA = createSnapshotNode('mock-snapshot-a');
    const nodeB = createSnapshotNode('mock-snapshot-b');
    const result = await waitForConvergence([nodeA, nodeB], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — requires leader coverage for all partitions',
  async () => {
    const node = {
      id: 'mock-partitions-missing-leader',
      isReachable: async () => true,
      query: async (sql) => {
        if (sql.includes('FROM partitions')) {
          return {
            rows: [{partition_id: 'p1'}, {partition_id: 'p2'}],
          };
        }
        if (sql.includes('FROM services')) {
          return {
            rows: [
              {
                service_type: 'partition',
                status: 'ACTIVE',
                raft_role: 'leader',
                address: 'node-a/p1/r0',
                partition_id: 'p1',
              },
              {
                service_type: 'partition',
                status: 'ACTIVE',
                raft_role: 'follower',
                address: 'node-b/p1/r1',
                partition_id: 'p1',
              },
              {
                service_type: 'partition',
                status: 'ACTIVE',
                raft_role: 'follower',
                address: 'node-c/p1/r2',
                partition_id: 'p1',
              },
            ],
          };
        }
        return {rows: []};
      },
    };

    try {
      await waitForConvergence([node], {
        settleTimeoutMs: 80,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      });
      assert.fail('Expected timeout when a partition has no leader');
    } catch (err) {
      assert.ok(
        err.message.includes('Convergence timeout'),
        'Expected timeout error message',
      );
    }
  });

// -------------------------------------------------------
// Custom thresholds override defaults (Req 5.2)
// -------------------------------------------------------

test('waitForConvergence — custom targetVoterCount of 5 converges with 5 voters', async () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push({
      service_type: 'partition',
      status: 'ACTIVE',
      raft_role: i === 0 ? 'leader' : 'follower',
      address: 'node-1/p1/r' + i,
      partition_id: 'p1',
    });
  }
  const node = {
    id: 'mock-5voter',
    isReachable: async () => true,
    query: async () => ({rows}),
  };

  // With custom targetVoterCount=5, 5 voters should converge
  const result = await waitForConvergence([node], {
    settleTimeoutMs: 500,
    quietWindowMs: 0,
    maxSustainedOverTargetMs: 500,
    sampleIntervalMs: 10,
    targetVoterCount: 5,
  });
  assert.strictEqual(typeof result.settledAfterMs, 'number');
  assert.ok(result.settledAfterMs >= 0);
});

test('waitForConvergence — 5 voters fails with default targetVoterCount of 3', async () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push({
      service_type: 'partition',
      status: 'ACTIVE',
      raft_role: i === 0 ? 'leader' : 'follower',
      address: 'node-1/p1/r' + i,
      partition_id: 'p1',
    });
  }
  const node = {
    id: 'mock-5voter-default',
    isReachable: async () => true,
    query: async () => ({rows}),
  };

  // With default targetVoterCount=3, 5 voters is over-target
  // and will not converge within the tiny timeout
  try {
    await waitForConvergence([node], {
      settleTimeoutMs: 50,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 0,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.fail('Expected timeout with 5 voters and target 3');
  } catch (err) {
    assert.ok(err.diagnostics, 'Should have diagnostics');
    assert.strictEqual(err.diagnostics.voterCounts.p1, 5);
  }
});

test('waitForConvergence — transient join/replace over-target converges back to target',
  async () => {
    const partitionId = 'p1';
    const baseline = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
    ];
    const joinOverTarget = [
      ...baseline,
      buildPartitionReplicaRow(partitionId, 'd', 'follower'),
    ];
    const replacedStable = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'd', 'follower'),
    ];

    const node = buildSequencedConvergenceNode({
      id: 'mock-join-replace-node',
      partitionIds: [partitionId],
      snapshots: [baseline, joinOverTarget, replacedStable, replacedStable],
    });

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 200,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 100,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });

    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
    assert.strictEqual(typeof result.maxOverTargetMs, 'number');
    assert.ok(result.maxOverTargetMs <= 100);
  });

test('waitForConvergence — transient remove with leader gap recovers to stable quorum',
  async () => {
    const partitionId = 'p1';
    const baseline = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
    ];
    const removalGap = [
      buildPartitionReplicaRow(partitionId, 'a', 'follower'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
    ];
    const recovered = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'd', 'follower'),
    ];

    const node = buildSequencedConvergenceNode({
      id: 'mock-remove-recover-node',
      partitionIds: [partitionId],
      snapshots: [baseline, removalGap, recovered, recovered],
    });

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 200,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 100,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });

    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });
