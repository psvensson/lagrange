import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {waitForConvergence} from '../assertions.js';
import {CONVERGENCE_DEFAULTS} from '../constants.js';
import {
  buildControlSnapshotRecord,
  buildConvergedMockNode,
  buildPartitionReplicaRow,
  buildSequencedConvergenceNode,
} from './assertions-test-helpers.js';

const DEFAULT_CONVERGED_PARTITION_IDS = ['p1'];

test('waitForConvergence — requires leader coverage for all partitions',
  async () => {
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-partitions-missing-leader',
      partitionIds: ['p1', 'p2'],
      servicesRows: [
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
    });
    const node = {
      id: 'mock-partitions-missing-leader',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
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
    getControlSnapshot: async () => ({
      rows: [buildControlSnapshotRecord({
        nodeId: 'mock-5voter',
        partitionIds: ['p1'],
        servicesRows: rows,
      })],
    }),
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
    getControlSnapshot: async () => ({
      rows: [buildControlSnapshotRecord({
        nodeId: 'mock-5voter-default',
        partitionIds: ['p1'],
        servicesRows: rows,
      })],
    }),
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

test('waitForConvergence — default option path does not depend on undeclared segment locals',
  async () => {
    const node = buildConvergedMockNode(
      DEFAULT_CONVERGED_PARTITION_IDS,
      CONVERGENCE_DEFAULTS.targetVoterCount,
    );

    const result = await waitForConvergence([node]);

    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
    assert.strictEqual(typeof result.leaderChanges, 'number');
    assert.strictEqual(typeof result.maxOverTargetMs, 'number');
  });

test('waitForConvergence — waits for in-flight replica operations to settle',
  async () => {
    const partitionId = 'p1';
    const stableRows = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
    ];
    const node = buildSequencedConvergenceNode({
      id: 'mock-operations-settle-node',
      partitionIds: [partitionId],
      snapshots: [stableRows, stableRows, stableRows],
      operationSnapshots: [
        [{operation_id: 'op-1', status: 'creating'}],
        [{operation_id: 'op-1', status: 'syncing'}],
        [{operation_id: 'op-1', status: 'active'}],
      ],
    });

    const startedAt = Date.now();
    const result = await waitForConvergence([node], {
      settleTimeoutMs: 200,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 100,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });

    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(
      Date.now() - startedAt >= 10,
      'convergence should wait for in-flight operations to settle',
    );
  });

test('waitForConvergence — prefers a converged reachable snapshot over a stale first snapshot',
  async () => {
    const partitionId = 'p1';
    const overTargetRows = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
      buildPartitionReplicaRow(partitionId, 'd', 'follower'),
    ];
    const stableRows = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
    ];
    const staleNode = buildSequencedConvergenceNode({
      id: 'mock-stale-convergence-node',
      partitionIds: [partitionId],
      snapshots: [overTargetRows, overTargetRows, overTargetRows],
      operationSnapshots: [
        [{operation_id: 'op-1', status: 'syncing'}],
        [{operation_id: 'op-1', status: 'syncing'}],
        [{operation_id: 'op-1', status: 'syncing'}],
      ],
    });
    const convergedNode = buildSequencedConvergenceNode({
      id: 'mock-converged-convergence-node',
      partitionIds: [partitionId],
      snapshots: [stableRows, stableRows, stableRows],
      operationSnapshots: [[], [], []],
    });

    const result = await waitForConvergence([staleNode, convergedNode], {
      settleTimeoutMs: 120,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 100,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });

    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — timeout diagnostics include in-flight operation counts',
  async () => {
    const partitionId = 'p1';
    const stableRows = [
      buildPartitionReplicaRow(partitionId, 'a', 'leader'),
      buildPartitionReplicaRow(partitionId, 'b', 'follower'),
      buildPartitionReplicaRow(partitionId, 'c', 'follower'),
    ];
    const node = buildSequencedConvergenceNode({
      id: 'mock-operations-timeout-node',
      partitionIds: [partitionId],
      snapshots: [stableRows],
      operationSnapshots: [
        [{operation_id: 'op-1', status: 'creating'}],
      ],
    });

    try {
      await waitForConvergence([node], {
        settleTimeoutMs: 80,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 100,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      });
      assert.fail('Expected convergence timeout with in-flight operations');
    } catch (err) {
      assert.match(
        err.message,
        /In-flight replica operations: 1/,
      );
      assert.ok(err.diagnostics, 'should include timeout diagnostics');
      assert.strictEqual(err.diagnostics.inFlightReplicaOperationCount, 1);
      assert.deepStrictEqual(
        err.diagnostics.inFlightReplicaOperationStatuses,
        {creating: 1},
      );
    }
  });

test('waitForConvergence — timeout diagnostics include control-plane context',
  async () => {
    const partitionId = 'p1';
    const stableRows = [
      buildPartitionReplicaRow(partitionId, 'seed-1', 'leader'),
      buildPartitionReplicaRow(partitionId, 'joiner-1', 'follower'),
      buildPartitionReplicaRow(partitionId, 'joiner-2', 'follower'),
    ];
    const node = {
      id: 'seed-1',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: 'seed-1',
          partitionIds: [partitionId],
          snapshotRevision: 22,
          snapshotRevisionState: 'stale_usable',
          snapshotExpectedMinimumRevision: 24,
          snapshotRevisionGap: 2,
          snapshotResumeToken: 'control-plane-revision:captured_at:22',
          servicesRows: stableRows,
          operationRows: [{operation_id: 'op-1', status: 'creating'}],
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 8,
              publicationStatus: 'ack_pending',
              pendingAckNodeIds: ['joiner-1'],
              publishedActiveNodeIds: ['seed-1', 'joiner-2'],
            },
            readinessByNodeId: {
              'joiner-1': {
                nodeId: 'joiner-1',
                serveEligible: false,
                repairEligible: true,
                reasons: [{code: 'control_plane_publication_pending'}],
              },
            },
            publicationMode: {
              currentMode: 'recovering',
            },
          },
        })],
      }),
    };

    try {
      await waitForConvergence([node], {
        settleTimeoutMs: 80,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 100,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      });
      assert.fail('Expected convergence timeout with in-flight operations');
    } catch (err) {
      assert.ok(err.diagnostics, 'should include timeout diagnostics');
      assert.ok(
        err.diagnostics.controlPlaneDiagnostics,
        'should include control-plane diagnostics',
      );
      assert.strictEqual(
        err.diagnostics.controlPlaneDiagnostics.publicationConvergence.publicationEpoch,
        8,
      );
      assert.deepStrictEqual(
        err.diagnostics.controlPlaneDiagnostics.publicationConvergence.pendingAckNodeIds,
        ['joiner-1'],
      );
      assert.deepStrictEqual(
        err.diagnostics.controlPlaneDiagnostics.readinessByNodeId['joiner-1'].reasons,
        [{code: 'control_plane_publication_pending'}],
      );
      assert.strictEqual(err.diagnostics.snapshotRevision, 22);
      assert.strictEqual(err.diagnostics.snapshotRevisionState, 'stale_usable');
      assert.strictEqual(err.diagnostics.snapshotExpectedMinimumRevision, 24);
      assert.strictEqual(err.diagnostics.snapshotRevisionGap, 2);
      assert.strictEqual(
        err.diagnostics.snapshotResumeToken,
        'control-plane-revision:captured_at:22',
      );
    }
  });

test('waitForConvergence — preserves last meaningful control-plane context ' +
  'when later polls degrade', async () => {
  const partitionId = 'p1';
  const stableRows = [
    buildPartitionReplicaRow(partitionId, 'seed-1', 'leader'),
    buildPartitionReplicaRow(partitionId, 'joiner-1', 'follower'),
    buildPartitionReplicaRow(partitionId, 'joiner-2', 'follower'),
  ];
  let snapshotCallCount = 0;
  const node = {
    id: 'seed-1',
    isReachable: async () => true,
    getControlSnapshot: async () => {
      snapshotCallCount += 1;
      if (snapshotCallCount === 1) {
        return {
          rows: [buildControlSnapshotRecord({
            nodeId: 'seed-1',
            partitionIds: [partitionId],
            snapshotRevision: 22,
            snapshotRevisionState: 'stale_usable',
            snapshotExpectedMinimumRevision: 24,
            snapshotRevisionGap: 2,
            snapshotResumeToken: 'control-plane-revision:captured_at:22',
            servicesRows: stableRows,
            operationRows: [{operation_id: 'op-1', status: 'creating'}],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 8,
                publicationStatus: 'ack_pending',
                pendingAckNodeIds: ['joiner-1'],
                publishedActiveNodeIds: ['seed-1', 'joiner-2'],
              },
            },
          })],
        };
      }
      return {
        rows: [buildControlSnapshotRecord({
          nodeId: 'seed-1',
          partitionIds: [partitionId],
          servicesRows: stableRows,
          operationRows: [{operation_id: 'op-1', status: 'creating'}],
        })],
      };
    },
  };

  try {
    await waitForConvergence([node], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 100,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.fail('Expected convergence timeout with in-flight operations');
  } catch (err) {
    assert.ok(err.diagnostics, 'should include timeout diagnostics');
    assert.ok(
      err.diagnostics.controlPlaneDiagnostics,
      'should preserve the last meaningful control-plane diagnostics',
    );
    assert.strictEqual(
      err.diagnostics.controlPlaneDiagnostics.publicationConvergence.publicationEpoch,
      8,
    );
    assert.strictEqual(err.diagnostics.snapshotRevision, 22);
    assert.strictEqual(err.diagnostics.snapshotRevisionState, 'stale_usable');
    assert.strictEqual(err.diagnostics.snapshotExpectedMinimumRevision, 24);
    assert.strictEqual(err.diagnostics.snapshotRevisionGap, 2);
    assert.strictEqual(
      err.diagnostics.snapshotResumeToken,
      'control-plane-revision:captured_at:22',
    );
  }
});

test('waitForConvergence — escalates to forceRepair snapshots after threshold', async () => {
  const calls = [];
  const node = {
    id: 'mock-force-repair-convergence-node',
    isReachable: async () => true,
    getControlSnapshot: async (options = {}) => {
      calls.push(options);
      const snapshot = buildControlSnapshotRecord({
        nodeId: 'mock-force-repair-convergence-node',
        partitionIds: ['p1'],
        servicesRows: [
          buildPartitionReplicaRow('p1', 'a', 'leader'),
          buildPartitionReplicaRow('p1', 'b', 'follower'),
          buildPartitionReplicaRow('p1', 'c', 'follower'),
        ],
        operationRows: options.forceRepair === true ? [] : [{
          operation_id: 'op-1',
          status: 'creating',
        }],
      });
      return {rows: [snapshot]};
    },
  };

  const result = await waitForConvergence([node], {
    settleTimeoutMs: 120,
    quietWindowMs: 0,
    maxSustainedOverTargetMs: 100,
    sampleIntervalMs: 10,
    targetVoterCount: 3,
    forceRepairAfterMs: 0,
  });

  assert.strictEqual(typeof result.settledAfterMs, 'number');
  assert.strictEqual(calls[0].forceRepair, true);
  assert.strictEqual(calls[0].lane, 'snapshot');
  assert.ok(
    Number.isInteger(calls[0].timeoutMs) && calls[0].timeoutMs > 0,
  );
});
