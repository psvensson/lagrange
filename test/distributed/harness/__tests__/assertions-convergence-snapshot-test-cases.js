import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {waitForConvergence} from '../assertions.js';
import {buildControlSnapshotRecord} from './assertions-test-helpers.js';

// -------------------------------------------------------
// Convergence timeout throws descriptive error (Req 5.3)
// -------------------------------------------------------

test('waitForConvergence — timeout throws descriptive error with diagnostics', async () => {
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-timeout-node',
    partitionIds: [],
    servicesRows: [],
  });
  const node = {
    id: 'mock-timeout-node',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
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
  const partialRows = [
    {
      service_type: 'partition',
      status: 'ACTIVE',
      raft_role: 'leader',
      address: 'a',
      partition_id: 'p1',
    },
  ];
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-partial-node',
    partitionIds: ['p1'],
    servicesRows: partialRows,
  });
  const node = {
    id: 'mock-partial-node',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
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
    const operationRows = [
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
    ];
    const membershipRows = [
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
    ];
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-membership-node',
      partitionIds: ['p1'],
      servicesRows: membershipRows,
      operationRows,
    });
    const node = {
      id: 'mock-membership-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
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

test(
  'waitForConvergence — operation history normalizes malformed syncing replica rows',
  async () => {
    const operationRows = [
      {
        operation_id: 'op-sql-transactions-r4',
        type: '',
        status: 'syncing',
        workflow_step: 'SYNCING',
        replica_id: 'sql_transactions-p1-r4',
        steps_history: JSON.stringify([{
          step: 'PENDING',
          sourceReplicaId: 'sql_transactions-p1-r1',
          replicaIds: [
            'sql_transactions-p1-r2',
            'sql_transactions-p1-r3',
            'sql_transactions-p1-r4',
          ],
          peerAddresses: [
            'seed/p1/sql_transactions-p1-r2',
            'seed/p1/sql_transactions-p1-r3',
            'joiner-4/p1/sql_transactions-p1-r4',
          ],
        }, {
          step: 'SYNCING',
          readinessSnapshot: {
            nodeId: 'joiner-4',
          },
        }]),
        updated_at: 100,
      },
    ];
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-operation-node',
      partitionIds: ['sql_transactions-p1'],
      servicesRows: [],
      operationRows,
    });
    const node = {
      id: 'mock-operation-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
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
        err.message.includes('sql_transactions-p1:REPLACE:syncing'),
        'operation history snippet should use normalized partition and type',
      );
      assert.ok(
        err.message.includes('unknown->joiner-4'),
        'operation history snippet should use the inferred target node',
      );
      assert.match(
        err.message,
        /@100\b/,
        'operation history snippet should preserve the normalized timestamp',
      );
      assert.strictEqual(
        err.diagnostics.operationHistory[0].partitionId,
        'sql_transactions-p1',
      );
      assert.strictEqual(
        err.diagnostics.operationHistory[0].type,
        'REPLACE',
      );
      assert.strictEqual(
        err.diagnostics.operationHistory[0].toNodeId,
        'joiner-4',
      );
    }
  },
);

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
    function createSnapshotNode(nodeId) {
      const snapshot = buildControlSnapshotRecord({
        nodeId,
        partitionIds: ['p1'],
        servicesRows,
      });
      return {
        id: nodeId,
        isReachable: async () => true,
        getControlSnapshot: async () => ({rows: [snapshot]}),
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

test('waitForConvergence — uses control snapshot path only',
  async () => {
    const node = {
      id: 'mock-control-snapshot-node',
      isReachable: async () => true,
      query: async () => {
        throw new Error('SQL fanout should not run');
      },
      getControlSnapshot: async () => ({
        rows: [{
          schemaVersion: 1,
          nodeId: 'mock-control-snapshot-node',
          capturedAt: Date.now(),
          nodes: ['mock-control-snapshot-node'],
          partitions: ['p1'],
          leaders: {
            p1: 'mock-control-snapshot-node/p1/r0',
          },
          voterCounts: {
            p1: 3,
          },
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
          },
        }],
      }),
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — uses SQL compatibility when control snapshot owner is absent',
  async () => {
    let sqlQueryCount = 0;
    const node = {
      id: 'mock-sql-compatibility-node',
      isReachable: async () => true,
      query: async (sql) => {
        sqlQueryCount += 1;
        if (sql.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
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
        throw new Error('Unexpected SQL query: ' + sql);
      },
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
    assert.ok(
      sqlQueryCount >= 2,
      'SQL compatibility should query partitions and services when no snapshot owner exists',
    );
  });

test('waitForConvergence — SQL fallback derives leaders from partitions metadata',
  async () => {
    let sqlQueryCount = 0;
    const node = {
      id: 'mock-sql-fallback-partition-leader-node',
      isReachable: async () => true,
      query: async (sql) => {
        sqlQueryCount += 1;
        if (sql.includes('FROM partitions')) {
          return {
            rows: [{
              partition_id: 'p1',
              leader_node_id: 'node-a',
            }],
          };
        }
        if (sql.includes('FROM services')) {
          return {
            rows: [
              {
                service_type: 'partition',
                status: 'ACTIVE',
                raft_role: 'follower',
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
        throw new Error('Unexpected SQL query: ' + sql);
      },
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
    assert.ok(
      sqlQueryCount >= 2,
      'SQL compatibility should query partitions and services when no snapshot owner exists',
    );
  });

test('waitForConvergence — can ignore stale over-target caused by stale in-flight operations',
  async () => {
    const node = {
      id: 'mock-stale-inflight-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: 'mock-stale-inflight-node',
          partitionIds: ['p1'],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address: 'mock-stale-inflight-node/p1/r0',
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
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'follower',
              address: 'node-d/p1/r3',
              partition_id: 'p1',
            },
          ],
          operationRows: [
            {
              operation_id: 'op-stale-removing',
              type: 'REPLACE',
              partition_id: 'p1',
              source_node_id: 'node-a',
              target_node_id: 'node-b',
              replica_id: 'p1-r3',
              status: 'removing',
              workflow_step: 'STOPPING',
              updated_at: Date.now() - 120000,
            },
          ],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 1,
            },
          },
        })],
      }),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      }),
      /Convergence timeout/,
      'stale over-target should still gate convergence by default',
    );

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });
