import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {waitForConvergence} from '../assertions.js';
import {ASSERTIONS_CONVERGENCE_WAIT} from '../assertions-convergence-wait.js';
import {
  buildControlSnapshotRecord,
  withPolicyTargets,
} from './assertions-test-helpers.js';

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
      finalAdjudicationDrainTimeoutMs: 0,
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
      finalAdjudicationDrainTimeoutMs: 0,
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
        finalAdjudicationDrainTimeoutMs: 0,
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
        finalAdjudicationDrainTimeoutMs: 0,
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
    const result = await waitForConvergence([
      withPolicyTargets(nodeA, ['p1']), withPolicyTargets(nodeB, ['p1'])], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
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
      // Only the partitions policy read (withPolicyTargets) may run: the
      // services/partitions SQL fanout must not.
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

    const result = await waitForConvergence([withPolicyTargets(node, ['p1'])], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

// Three ACTIVE p1 service rows for the SQL-fallback tests; the first row's
// raft role varies per test (leader-labeled vs derived-from-partitions).
function buildSqlFallbackServicesRows(firstRowRole) {
  return [
    ['node-a/p1/r0', firstRowRole],
    ['node-b/p1/r1', 'follower'],
    ['node-c/p1/r2', 'follower'],
  ].map(([address, role]) => ({
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: role,
    address,
    partition_id: 'p1',
  }));
}

test('waitForConvergence — uses SQL compatibility when control snapshot owner is absent',
  async () => {
    let sqlQueryCount = 0;
    const node = {
      id: 'mock-sql-compatibility-node',
      isReachable: async () => true,
      query: async (sql) => {
        sqlQueryCount += 1;
        if (sql.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1', replica_count: 3}]};
        }
        if (sql.includes('FROM services')) {
          return {rows: buildSqlFallbackServicesRows('leader')};
        }
        throw new Error('Unexpected SQL query: ' + sql);
      },
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
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
              replica_count: 3,
            }],
          };
        }
        if (sql.includes('FROM services')) {
          return {rows: buildSqlFallbackServicesRows('follower')};
        }
        throw new Error('Unexpected SQL query: ' + sql);
      },
    };

    const result = await waitForConvergence([node], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
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

test('waitForConvergence — can ignore a stale in-flight operation at the policy target',
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
          ],
          operationRows: [
            {
              // A REMOVE: under A6 (quest replace-source-removal-owner, R09)
              // a partition REPLACE at STOPPING is never stale by step age,
              // so the stale in-flight operation this case needs is one whose
              // staleness is still age-derived.
              operation_id: 'op-stale-removing',
              type: 'REMOVE',
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
      waitForConvergence([withPolicyTargets(node, ['p1'])], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
      }),
      /Convergence timeout/,
      'a stale in-flight operation still gates convergence by default',
    );

    const result = await waitForConvergence([withPolicyTargets(node, ['p1'])], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — uses drain-row stale classification when control-plane summary undercounts',
  async () => {
    const node = {
      id: 'mock-drain-row-stale-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({
        rows: [buildControlSnapshotRecord({
          nodeId: 'mock-drain-row-stale-node',
          partitionIds: ['p1'],
          servicesRows: [
            {
              service_type: 'partition',
              status: 'ACTIVE',
              raft_role: 'leader',
              address: 'mock-drain-row-stale-node/p1/r0',
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
          operationRows: [
            {
              operation_id: 'op-stale-syncing-undercounted',
              type: 'REPLACE',
              partition_id: 'p1',
              source_node_id: 'node-a',
              target_node_id: 'node-b',
              replica_id: 'p1-r3',
              status: 'syncing',
              workflow_step: 'SYNCING',
              updated_at: Date.now() - 120000,
            },
          ],
          controlPlaneDiagnostics: {
            replicaOperations: {
              staleInFlightCount: 0,
              inFlightOperationIds: ['op-stale-syncing-undercounted'],
            },
          },
        })],
      }),
    };

    const result = await waitForConvergence([withPolicyTargets(node, ['p1'])], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — does not use stale drain rows outside canonical in-flight ids',
  async () => {
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-canonical-inflight-node',
      partitionIds: ['p1'],
      servicesRows: [
        {
          service_type: 'partition',
          status: 'ACTIVE',
          raft_role: 'leader',
          address: 'mock-canonical-inflight-node/p1/r0',
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
      operationRows: [
        {
          operation_id: 'op-stale-row-not-canonical',
          type: 'REPLACE',
          partition_id: 'p1',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          replica_id: 'p1-r3',
          status: 'syncing',
          workflow_step: 'SYNCING',
          updated_at: Date.now() - 120000,
        },
      ],
      controlPlaneDiagnostics: {
        replicaOperations: {
          staleInFlightCount: 0,
          inFlightOperationIds: ['op-canonical-missing-row'],
        },
      },
    });
    snapshot.replicaOperations.inFlightCount = 1;

    const node = {
      id: 'mock-canonical-inflight-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
        ignoreStaleInFlightReplicaOperations: true,
      }),
      /Convergence/,
    );
  });

test('waitForConvergence — falls back to summary stale count when canonical drain row is missing',
  async () => {
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-canonical-summary-fallback-node',
      partitionIds: ['p1'],
      servicesRows: [
        {
          service_type: 'partition',
          status: 'ACTIVE',
          raft_role: 'leader',
          address: 'mock-canonical-summary-fallback-node/p1/r0',
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
      operationRows: [],
      controlPlaneDiagnostics: {
        replicaOperations: {
          staleInFlightCount: 1,
          inFlightOperationIds: ['op-canonical-missing-row'],
        },
      },
    });
    snapshot.replicaOperations.inFlightCount = 1;

    const node = {
      id: 'mock-canonical-summary-fallback-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
    };

    const result = await waitForConvergence([withPolicyTargets(node, ['p1'])], {
      settleTimeoutMs: 80,
      finalAdjudicationDrainTimeoutMs: 0,
      quietWindowMs: 0,
      maxSustainedOverTargetMs: 80,
      sampleIntervalMs: 10,
      targetVoterCount: 3,
      ignoreStaleInFlightReplicaOperations: true,
    });
    assert.strictEqual(typeof result.settledAfterMs, 'number');
    assert.ok(result.settledAfterMs >= 0);
  });

test('waitForConvergence — does not use noncanonical additional drain discounts',
  async () => {
    const snapshot = buildControlSnapshotRecord({
      nodeId: 'mock-noncanonical-additional-discount-node',
      partitionIds: ['p1'],
      servicesRows: [
        {
          service_type: 'partition',
          status: 'ACTIVE',
          raft_role: 'leader',
          address: 'mock-noncanonical-additional-discount-node/p1/r0',
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
      operationRows: [
        {
          operation_id: 'op-noncanonical-priority-recovery',
          type: 'REPLACE',
          partition_id: 'p1',
          source_node_id: 'node-a',
          target_node_id: 'node-d',
          replica_id: 'p1-r3',
          status: 'syncing',
          workflow_step: 'SYNCING',
          updated_at: Date.now() - 1000,
        },
      ],
      controlPlaneDiagnostics: {
        replicaOperations: {
          staleInFlightCount: 0,
          inFlightOperationIds: ['op-canonical-missing-row'],
        },
        publicationConvergence: {
          priorityRecoveryClosureWitness: {
            state: 'closure_satisfied_fresh',
            prioritySpreadPending: false,
            publicationRefreshRequired: false,
            blockedPartitionIds: [],
            blockedPartitionCount: 0,
            unresolvedSemanticStateIds: [],
            unresolvedSemanticStateCount: 0,
          },
          priorityRecoveryPartitionIdsBySemanticState: {
            spread_satisfied_in_flight: ['p1'],
          },
          priorityRecoveryPartitionSemanticStateHistory: [{
            partitionId: 'p1',
            semanticStateIds: ['spread_satisfied_in_flight'],
          }],
        },
      },
    });
    snapshot.replicaOperations.inFlightCount = 1;

    const node = {
      id: 'mock-noncanonical-additional-discount-node',
      isReachable: async () => true,
      getControlSnapshot: async () => ({rows: [snapshot]}),
    };

    await assert.rejects(
      waitForConvergence([node], {
        settleTimeoutMs: 80,
        finalAdjudicationDrainTimeoutMs: 0,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 80,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
        ignoreStaleInFlightReplicaOperations: true,
        criticalSystemTopologyReady: true,
      }),
      /Convergence/,
    );
  });

// -------------------------------------------------------
// Replica-target convergence: under-target is not converged
// -------------------------------------------------------

const REPLICA_TARGET_VOTER_COUNT = 3;
const REPLICA_TARGET_UNDER_VOTER_COUNT = 1;
const REPLICA_TARGET_PARTITION_FULL = 'p-full';
const REPLICA_TARGET_PARTITION_UNDER = 'p-under';
const REPLICA_TARGET_LEADER = 'node-a';
const REPLICA_TARGET_TOLERANCE_REASON =
  'witness: the fixture deliberately runs below the replica target';

// The partitions rows' policy target for both fixture partitions.
const REPLICA_TARGET_POLICY = Object.freeze({
  voterTargets: new Map([
    [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
    [REPLICA_TARGET_PARTITION_UNDER, REPLICA_TARGET_VOTER_COUNT],
  ]),
});

function buildReplicaTargetSnapshot(voterCountEntries) {
  const leaders = new Map();
  const voterCounts = new Map();
  const expectedPartitionIds = new Set();
  for (const [partitionId, voterCount] of voterCountEntries) {
    expectedPartitionIds.add(partitionId);
    leaders.set(partitionId, REPLICA_TARGET_LEADER);
    if (voterCount !== null) {
      voterCounts.set(partitionId, voterCount);
    }
  }
  return {
    expectedPartitionIds,
    leaders,
    voterCounts,
    inFlightReplicaOperationCount: 0,
  };
}

test('isConvergedSnapshot — a partition at 1 of 3 voters is not converged',
  async () => {
    const {isConvergedSnapshot} = ASSERTIONS_CONVERGENCE_WAIT;
    const snapshot = buildReplicaTargetSnapshot([
      [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
      [REPLICA_TARGET_PARTITION_UNDER, REPLICA_TARGET_UNDER_VOTER_COUNT],
    ]);
    assert.strictEqual(
      isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT,
        REPLICA_TARGET_POLICY),
      false,
      'an under-target partition must block convergence',
    );
  });

test('isConvergedSnapshot — an expected partition with no voter count is ' +
  'not converged', async () => {
  const {isConvergedSnapshot} = ASSERTIONS_CONVERGENCE_WAIT;
  const snapshot = buildReplicaTargetSnapshot([
    [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
    [REPLICA_TARGET_PARTITION_UNDER, null],
  ]);
  assert.strictEqual(
    isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT,
      REPLICA_TARGET_POLICY),
    false,
    'absent voter evidence counts as zero voters, never as at-target',
  );
});

test('classifyConvergedSnapshot — names the under-target state and partitions',
  async () => {
    const {classifyConvergedSnapshot, CONVERGED_SNAPSHOT_STATE} =
      ASSERTIONS_CONVERGENCE_WAIT;
    const snapshot = buildReplicaTargetSnapshot([
      [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
      [REPLICA_TARGET_PARTITION_UNDER, REPLICA_TARGET_UNDER_VOTER_COUNT],
    ]);
    const decision = classifyConvergedSnapshot(
      snapshot,
      REPLICA_TARGET_VOTER_COUNT,
      REPLICA_TARGET_POLICY,
    );
    assert.strictEqual(decision.state, 'under_target_voters');
    assert.strictEqual(CONVERGED_SNAPSHOT_STATE.CONVERGED, 'converged');
    assert.deepStrictEqual(
      Array.from(decision.voterTargetVerdict.underTarget,
        (entry) => entry.partitionId),
      [REPLICA_TARGET_PARTITION_UNDER],
    );
    assert.strictEqual(
      classifyConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT).state,
      'voter_target_evidence_absent',
      'without policy targets the snapshot is never converged',
    );
  });

test('isConvergedSnapshot — every partition at its replica target converges',
  async () => {
    const {isConvergedSnapshot, classifyConvergedSnapshot,
      CONVERGED_SNAPSHOT_STATE} = ASSERTIONS_CONVERGENCE_WAIT;
    const snapshot = buildReplicaTargetSnapshot([
      [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
      [REPLICA_TARGET_PARTITION_UNDER, REPLICA_TARGET_VOTER_COUNT],
    ]);
    assert.strictEqual(
      isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT,
        REPLICA_TARGET_POLICY),
      true,
    );
    assert.strictEqual(
      classifyConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT,
        REPLICA_TARGET_POLICY).state,
      CONVERGED_SNAPSHOT_STATE.CONVERGED,
    );
  });

test('isConvergedSnapshot — tolerateUnderReplication names the tolerated ' +
  'under-target state', async () => {
  const {isConvergedSnapshot, classifyConvergedSnapshot,
    CONVERGED_SNAPSHOT_STATE} = ASSERTIONS_CONVERGENCE_WAIT;
  const snapshot = buildReplicaTargetSnapshot([
    [REPLICA_TARGET_PARTITION_FULL, REPLICA_TARGET_VOTER_COUNT],
    [REPLICA_TARGET_PARTITION_UNDER, REPLICA_TARGET_UNDER_VOTER_COUNT],
  ]);
  const options = {...REPLICA_TARGET_POLICY,
    tolerateUnderReplication: {minVoters: REPLICA_TARGET_UNDER_VOTER_COUNT,
      reason: REPLICA_TARGET_TOLERANCE_REASON}};
  assert.strictEqual(
    isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT, options),
    true,
  );
  const decision = classifyConvergedSnapshot(
    snapshot,
    REPLICA_TARGET_VOTER_COUNT,
    options,
  );
  assert.strictEqual(decision.state, CONVERGED_SNAPSHOT_STATE.CONVERGED);
  assert.strictEqual(decision.voterTargetVerdict.state,
    'under_replication_tolerated');
  assert.strictEqual(
    decision.voterTargetVerdict.toleranceReason,
    REPLICA_TARGET_TOLERANCE_REASON,
  );
  assert.throws(
    () => isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT, {
      ...REPLICA_TARGET_POLICY,
      tolerateUnderReplication: '',
    }),
    /tolerateUnderReplication/,
    'a tolerance without a reason is refused, never a silent default',
  );
  assert.throws(
    () => isConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT, {
      ...REPLICA_TARGET_POLICY,
      tolerateUnderReplication: REPLICA_TARGET_TOLERANCE_REASON,
    }),
    /tolerateUnderReplication/,
    'a tolerance without a declared voter floor is refused',
  );
  assert.strictEqual(
    classifyConvergedSnapshot(snapshot, REPLICA_TARGET_VOTER_COUNT, {
      ...REPLICA_TARGET_POLICY,
      tolerateUnderReplication: {minVoters: REPLICA_TARGET_VOTER_COUNT - 1,
        reason: REPLICA_TARGET_TOLERANCE_REASON},
    }).state,
    'under_target_voters',
    'a partition below the declared floor is never tolerated',
  );
});

test('queryReachableClusterSnapshot — prefers the at-target view over an ' +
  'earlier under-target view', async () => {
  const {queryReachableClusterSnapshot} = ASSERTIONS_CONVERGENCE_WAIT;
  const leaderRow = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'leader',
    address: 'node-a/p1/r0',
    partition_id: 'p1',
  };
  const followerRows = [
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
  function createViewNode(nodeId, servicesRows) {
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
  const underTargetNode = createViewNode('mock-under-target', [leaderRow]);
  const atTargetNode = createViewNode('mock-at-target', [
    leaderRow,
    ...followerRows,
  ]);
  const snapshot = await queryReachableClusterSnapshot(
    [underTargetNode, atTargetNode],
    {targetVoterCount: REPLICA_TARGET_VOTER_COUNT,
      voterTargets: new Map([['p1', REPLICA_TARGET_VOTER_COUNT]])},
  );
  assert.strictEqual(snapshot.nodeId, 'mock-at-target');
  assert.strictEqual(
    snapshot.voterCounts.get('p1'),
    REPLICA_TARGET_VOTER_COUNT,
  );
});
