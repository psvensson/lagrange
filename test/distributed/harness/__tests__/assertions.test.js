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
import {hasConflictingLeaders} from '../assertions.js';
import {CONVERGENCE_DEFAULTS} from '../constants.js';

const CONTROL_SNAPSHOT_SCHEMA_VERSION = 1;
const TERMINAL_OPERATION_STATUSES = new Set(['active', 'removed', 'failed']);

function normalizeReplicaRowsByPartition(rows) {
  const membership = {};
  if (!Array.isArray(rows)) {
    return membership;
  }
  for (const row of rows) {
    if (!row || row.service_type !== 'partition' || !row.partition_id) {
      continue;
    }
    const partitionId = String(row.partition_id);
    if (!membership[partitionId]) {
      membership[partitionId] = {
        voterCount: 0,
        leader: null,
        replicas: [],
      };
    }
    const raftRole = String(row.raft_role || '').toLowerCase();
    const status = String(row.status || '').toLowerCase();
    const address = String(row.address || '').trim();
    membership[partitionId].replicas.push({
      nodeId: row.node_id ? String(row.node_id) : null,
      address: address || null,
      status: row.status ? String(row.status) : null,
      raftRole: row.raft_role ? String(row.raft_role) : null,
    });
    if (address.length > 0 &&
      status === 'active' &&
      raftRole.length > 0 &&
      raftRole !== 'learner') {
      membership[partitionId].voterCount += 1;
    }
    if (raftRole === 'leader' && address.length > 0) {
      membership[partitionId].leader = address;
    }
  }

  for (const details of Object.values(membership)) {
    details.replicas.sort((left, right) => {
      const leftKey = String(left.nodeId || left.address || '');
      const rightKey = String(right.nodeId || right.address || '');
      return leftKey.localeCompare(rightKey);
    });
  }
  return membership;
}

function summarizeOperationStatuses(rows) {
  const statusHistogram = {};
  let inFlightCount = 0;
  if (!Array.isArray(rows)) {
    return {
      inFlightCount,
      statusHistogram,
    };
  }
  for (const row of rows) {
    const status = String(row?.status || row?.state || 'unknown').toLowerCase();
    statusHistogram[status] = (statusHistogram[status] || 0) + 1;
    if (!TERMINAL_OPERATION_STATUSES.has(status)) {
      inFlightCount += 1;
    }
  }
  return {
    inFlightCount,
    statusHistogram,
  };
}

function buildControlSnapshotRecord(options = {}) {
  const servicesRows = Array.isArray(options.servicesRows) ? options.servicesRows : [];
  const operationRows = Array.isArray(options.operationRows) ?
    options.operationRows :
    [];
  const explicitPartitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds.map((partitionId) => String(partitionId)) :
    [];
  const partitionMembership = normalizeReplicaRowsByPartition(servicesRows);
  const discoveredPartitionIds = Object.keys(partitionMembership);
  const partitionIds = explicitPartitionIds.length > 0 ?
    explicitPartitionIds :
    discoveredPartitionIds;
  const leaders = {};
  const voterCounts = {};

  for (const partitionId of partitionIds) {
    const details = partitionMembership[partitionId];
    if (details?.leader) {
      leaders[partitionId] = details.leader;
    }
    if (Number.isInteger(details?.voterCount)) {
      voterCounts[partitionId] = details.voterCount;
    }
    if (!partitionMembership[partitionId]) {
      partitionMembership[partitionId] = {
        voterCount: 0,
        leader: null,
        replicas: [],
      };
    }
  }

  const operationSummary = summarizeOperationStatuses(operationRows);
  return {
    schemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    nodeId: String(options.nodeId || 'mock-node'),
    capturedAt: Number.isFinite(options.capturedAt) ? options.capturedAt : Date.now(),
    nodes: Array.isArray(options.nodes) ? options.nodes : [String(options.nodeId || 'mock-node')],
    partitions: partitionIds,
    leaders,
    voterCounts,
    partitionMembership,
    replicaOperations: {
      inFlightCount: operationSummary.inFlightCount,
      statusHistogram: operationSummary.statusHistogram,
      rows: operationRows,
    },
    ...(options.controlPlaneDiagnostics &&
      typeof options.controlPlaneDiagnostics === 'object' &&
      !Array.isArray(options.controlPlaneDiagnostics) ?
      {controlPlaneDiagnostics: options.controlPlaneDiagnostics} :
      {}),
  };
}

/**
 * Build a mock node whose control snapshot is converged for the
 * given partition IDs and targetVoterCount.
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
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-node-1',
    partitionIds,
    servicesRows: rows,
  });
  return {
    id: 'mock-node-1',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
  };
}

/**
 * Build a mock node that never converges.
 */
function buildNonConvergingMockNode() {
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-node-nc',
    partitionIds: [],
    servicesRows: [],
  });
  return {
    id: 'mock-node-nc',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
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
  const operationSnapshots = Array.isArray(options.operationSnapshots) ?
    options.operationSnapshots :
    [];
  const partitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds :
    ['p1'];
  let snapshotIndex = 0;
  let operationSnapshotIndex = 0;

  return {
    id: options.id || 'mock-sequence-node',
    isReachable: async () => true,
    getControlSnapshot: async () => {
      const serviceSnapshotIndex = Math.min(
        snapshotIndex,
        Math.max(snapshots.length - 1, 0),
      );
      const operationSnapshotBoundedIndex = Math.min(
        operationSnapshotIndex,
        Math.max(operationSnapshots.length - 1, 0),
      );
      snapshotIndex += 1;
      operationSnapshotIndex += 1;

      const snapshot = buildControlSnapshotRecord({
        nodeId: options.id || 'mock-sequence-node',
        partitionIds,
        servicesRows: snapshots[serviceSnapshotIndex] || [],
        operationRows: operationSnapshots[operationSnapshotBoundedIndex] || [],
      });
      return {rows: [snapshot]};
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

test('waitForConvergence — falls back to SQL when control snapshot lanes time out',
  async () => {
    let sqlQueryCount = 0;
    const node = {
      id: 'mock-control-snapshot-timeout-node',
      isReachable: async () => true,
      getControlSnapshot: async () => {
        throw new Error('Admin API query timed out on lane snapshot');
      },
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
      'SQL fallback should query partitions and services when control snapshots time out',
    );
  });

test('waitForConvergence — SQL fallback derives leaders from partitions metadata',
  async () => {
    let sqlQueryCount = 0;
    const node = {
      id: 'mock-sql-fallback-partition-leader-node',
      isReachable: async () => true,
      getControlSnapshot: async () => {
        throw new Error('Admin API query timed out on lane snapshot');
      },
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
      'SQL fallback should query partitions and services when control snapshots time out',
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

// --- hasConflictingLeaders tests ---

test('hasConflictingLeaders returns false for identical maps',
  async () => {
    const leaders = {'p1': 'node-a', 'p2': 'node-b'};
    assert.strictEqual(
      hasConflictingLeaders(leaders, leaders), false,
    );
  });

test('hasConflictingLeaders returns false when one map has extra keys',
  async () => {
    const a = {'p1': 'node-a', 'p2': 'node-b'};
    const b = {'p1': 'node-a', 'p2': 'node-b', 'p3': 'node-c'};
    assert.strictEqual(hasConflictingLeaders(a, b), false);
    assert.strictEqual(hasConflictingLeaders(b, a), false);
  });

test('hasConflictingLeaders returns true for conflicting values',
  async () => {
    const a = {'p1': 'node-a', 'p2': 'node-b'};
    const b = {'p1': 'node-a', 'p2': 'node-x'};
    assert.strictEqual(hasConflictingLeaders(a, b), true);
  });

test('hasConflictingLeaders returns false for empty maps',
  async () => {
    assert.strictEqual(hasConflictingLeaders({}, {}), false);
    assert.strictEqual(
      hasConflictingLeaders({'p1': 'a'}, {}), false,
    );
  });

test('hasConflictingLeaders returns false for disjoint keys',
  async () => {
    const a = {'p1': 'node-a'};
    const b = {'p2': 'node-b'};
    assert.strictEqual(hasConflictingLeaders(a, b), false);
  });
