// @ts-nocheck
import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertConsistency,
  assertConsistencyFromSnapshots,
  waitForConsistencyConvergence,
} from '../assertions.js';
import {PORTS} from '../constants.js';

const TEST_WS_ADDRESS = `ws://node-2:${PORTS.WS_TRANSPORT}`;
const TEST_LEADER_ADDRESS = `ws://node-1:${PORTS.WS_TRANSPORT}`;

const NODE_ROWS = Object.freeze([
  {node_id: 'node-1'},
  {node_id: 'node-2'},
  {node_id: 'node-3'},
]);
const PARTITION_ROWS = Object.freeze([
  {partition_id: 'p1'},
]);

function buildServiceRows(leaderAddress) {
  return [
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: leaderAddress,
      partition_id: 'p1',
      node_id: 'node-1',
    },
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
      address: TEST_WS_ADDRESS,
      partition_id: 'p1',
      node_id: 'node-2',
    },
  ];
}

function buildQueryableNode(nodeId, leaderAddress = TEST_LEADER_ADDRESS) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {rows: PARTITION_ROWS};
      }
      if (sql.includes('FROM services')) {
        return {rows: buildServiceRows(leaderAddress)};
      }
      return {rows: []};
    },
  };
}

function buildControlSnapshotNode(nodeId, snapshotOverrides = {}) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {
            p1: TEST_LEADER_ADDRESS,
          },
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
          ...snapshotOverrides,
        }],
      };
    },
    async query() {
      throw new Error('raw consistency SQL should not run when control snapshot is available');
    },
  };
}

test('assertConsistency ignores nodes that fail query collection', async () => {
  const healthyA = buildQueryableNode('node-a');
  const healthyB = buildQueryableNode('node-b');
  const flapping = {
    id: 'node-c',
    async isReachable() {
      return true;
    },
    async query() {
      throw new Error('Admin API query timed out');
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([healthyA, healthyB, flapping]);
  });
});

test('assertConsistency fails when fewer than two nodes are queryable', async () => {
  const healthy = buildQueryableNode('node-a');
  const flapping = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async query() {
      throw new Error('Admin API query timed out');
    },
  };
  const unreachable = {
    id: 'node-c',
    async isReachable() {
      return false;
    },
    async query() {
      return {rows: []};
    },
  };

  await assert.rejects(
    assertConsistency([healthy, flapping, unreachable]),
    /fewer than 2 queryable nodes/i,
  );
});

test('assertConsistency still fails on real state disagreement', async () => {
  const nodeA = buildQueryableNode('node-a', `ws://node-1:${PORTS.WS_TRANSPORT}`);
  const nodeB = buildQueryableNode('node-b', `ws://node-9:${PORTS.WS_TRANSPORT}`);

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Leader identities disagree/i,
  );
});

test('assertConsistency attaches control-plane diagnostics on mismatch errors',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a', {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          sourceSnapshotVersion: 31,
          status: 'ACK_PENDING',
        },
      },
    });
    const nodeB = buildControlSnapshotNode('node-b', {
      nodes: ['node-1', 'node-3'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          sourceSnapshotVersion: 29,
          status: 'ACK_PENDING',
        },
      },
    });

    try {
      await assertConsistency([nodeA, nodeB]);
      assert.fail('expected mismatch');
    } catch (error) {
      assert.match(String(error?.message || ''), /Active nodes disagree/i);
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.publicationConvergence
          ?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.publicationConvergence
          ?.sourceSnapshotVersion,
        31,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.mismatch?.reasonCode,
        'active_nodes_disagree',
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-a']?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-a']?.sourceSnapshotVersion,
        31,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-b']?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-b']?.sourceSnapshotVersion,
        29,
      );
    }
  });

test('assertConsistency uses control snapshots when available', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});

test('assertConsistency prefers published membership over effective node disagreement', async () => {
  const publishedNodes = ['node-1', 'node-2', 'node-3'];
  const nodeA = buildControlSnapshotNode('node-a', {
    nodes: ['node-1'],
    publishedNodes,
    projectedNodes: ['node-1'],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });
  const nodeB = buildControlSnapshotNode('node-b', {
    nodes: ['node-1', 'node-2', 'node-3'],
    publishedNodes,
    projectedNodes: ['node-1', 'node-2', 'node-3'],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1', 'node-2', 'node-3'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});

test('assertConsistency retries missing published membership with forced repair', async () => {
  const publishedNodes = ['node-1', 'node-2'];
  const nodeACalls = [];
  const nodeA = {
    id: 'node-a',
    async isReachable() {
      return true;
    },
    async getControlSnapshot(options = {}) {
      nodeACalls.push(options);
      if (options.forceRepair === true) {
        return {
          rows: [{
            nodes: ['node-1', 'node-2'],
            publishedNodes,
            partitions: ['p1'],
            leaders: {p1: TEST_LEADER_ADDRESS},
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 14,
                publishedActiveNodeIds: publishedNodes,
              },
              activeNodeViews: {
                effectiveSource: 'published_membership',
                effectiveNodeIds: publishedNodes,
                projectedNodeIds: ['node-1', 'node-2'],
                publishedNodeIds: publishedNodes,
                publishedMembershipAvailable: true,
              },
            },
          }],
        };
      }
      return {
        rows: [{
          nodes: ['node-1', 'node-2'],
          partitions: ['p1'],
          leaders: {p1: TEST_LEADER_ADDRESS},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: publishedNodes,
            },
            activeNodeViews: {
              effectiveSource: 'projected',
              effectiveNodeIds: ['node-1', 'node-2'],
              projectedNodeIds: ['node-1', 'node-2'],
              publishedNodeIds: [],
              publishedMembershipAvailable: false,
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('raw consistency SQL should not run when control snapshot is available');
    },
  };
  const nodeB = buildControlSnapshotNode('node-b', {
    nodes: ['node-1', 'node-2'],
    publishedNodes,
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1', 'node-2'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
  assert.equal(nodeACalls.length, 2);
  assert.equal(nodeACalls[0]?.forceRepair, false);
  assert.equal(nodeACalls[1]?.forceRepair, true);
});

test('assertConsistency ignores raw SQL fallback split topology once two control snapshots agree', async () => {
  const splitPartitions = ['logs-p2', 'logs-p3'];
  const leaderMap = {
    'logs-p2': TEST_LEADER_ADDRESS,
    'logs-p3': TEST_WS_ADDRESS,
  };
  const nodeA = buildControlSnapshotNode('node-a', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  const nodeB = buildControlSnapshotNode('node-b', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  let fallbackQueryCount = 0;
  const fallbackNode = {
    id: 'node-c',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      throw new Error('Admin API query timed out');
    },
    async query(sql) {
      fallbackQueryCount += 1;
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [
            {partition_id: 'logs-p1'},
            {partition_id: 'logs-p2'},
            {partition_id: 'logs-p3'},
          ],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p1',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p2',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_WS_ADDRESS,
              partition_id: 'logs-p3',
              node_id: 'node-2',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB, fallbackNode]);
  });
  assert.ok(
    fallbackQueryCount > 0,
    'expected fallback node to exercise raw SQL path before being ignored',
  );
});

test('assertConsistency ignores raw SQL fallback split topology once one control snapshot is available', async () => {
  const splitPartitions = ['logs-p2', 'logs-p3'];
  const leaderMap = {
    'logs-p2': TEST_LEADER_ADDRESS,
    'logs-p3': TEST_WS_ADDRESS,
  };
  const nodeA = buildControlSnapshotNode('node-a', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  let fallbackQueryCount = 0;
  const fallbackNode = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      throw new Error('Admin API query timed out');
    },
    async query(sql) {
      fallbackQueryCount += 1;
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [
            {partition_id: 'logs-p1'},
            {partition_id: 'logs-p2'},
            {partition_id: 'logs-p3'},
          ],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p1',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p2',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_WS_ADDRESS,
              partition_id: 'logs-p3',
              node_id: 'node-2',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, fallbackNode]);
  });
  assert.ok(
    fallbackQueryCount > 0,
    'expected fallback node to exercise raw SQL path before being ignored',
  );
});

test('assertConsistency supplements SQL fallback partitions from service-visible topology', async () => {
  const publishedNodes = ['node-1', 'node-2', 'node-3'];
  const nodeA = buildControlSnapshotNode('node-a', {
    publishedNodes,
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
    },
  });
  let fallbackQueryCount = 0;
  const fallbackNode = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      throw new Error('Admin API query timed out');
    },
    async query(sql) {
      fallbackQueryCount += 1;
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {rows: []};
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'p1',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: TEST_WS_ADDRESS,
              partition_id: 'p1',
              node_id: 'node-2',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'follower',
              address: `ws://node-3:${PORTS.WS_TRANSPORT}`,
              partition_id: 'p1',
              node_id: 'node-3',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, fallbackNode]);
  });
  assert.ok(
    fallbackQueryCount > 0,
    'expected fallback node to exercise raw SQL path',
  );
});

test('assertConsistency ignores bootstrap-only control-snapshot nodes', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');
  let fallbackQueryCalled = false;
  const restartingNode = {
    id: 'node-c',
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-c',
        reachable: true,
        adminReady: false,
        reachableBy: 'bootstrap_health',
        lastError: 'connect ECONNREFUSED 172.20.0.3:8081',
      };
    },
    async getControlSnapshot() {
      throw new Error('Admin API query failed: connect ECONNREFUSED');
    },
    async query() {
      fallbackQueryCalled = true;
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB, restartingNode]);
  });
  assert.equal(fallbackQueryCalled, false);
});

test('assertConsistency fails on published control-plane epoch disagreement', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b', {
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 13,
        publishedActiveNodeIds: ['node-1', 'node-3'],
      },
    },
  });

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Publication epochs disagree/i,
  );
});

test('assertConsistencyFromSnapshots throws on published active-node mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-3'],
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Published active-node sets disagree/i,
  );
});

test('assertConsistencyFromSnapshots prefers published membership over effective node disagreement', async () => {
  const publishedNodes = ['node-1', 'node-2'];
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1'],
      publishedNodes,
      projectedNodes: ['node-1'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes,
      projectedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1', 'node-2'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots passes with ' +
  'consistent evaluator snapshots', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS, p2: TEST_WS_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p2', 'p1'],
      leaders: {p2: TEST_WS_ADDRESS, p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots throws on partition ' +
  'set mismatch — uses evaluator snapshots as single ' +
  'consistency owner', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Partition assignments disagree/i,
  );
});

test('assertConsistencyFromSnapshots throws on leader ' +
  'identity mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_WS_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Leader identities disagree/i,
  );
});

test('assertConsistencyFromSnapshots is a no-op when ' +
  'fewer than 2 snapshots provided', async () => {
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([
      {
        nodeId: 'node-a',
        nodes: ['node-1'],
        partitions: ['p1'],
        leaders: {p1: TEST_LEADER_ADDRESS},
      },
    ]);
  });
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([]);
  });
});

test('waitForConsistencyConvergence resolves when nodes ' +
  'agree on first attempt', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 2000, pollIntervalMs: 50},
    );
  });
});

test('waitForConsistencyConvergence retries until nodes ' +
  'converge within timeout', async () => {
  let callCount = 0;
  const convergenceThreshold = 3;
  const divergentLeader = TEST_WS_ADDRESS;

  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      callCount += 1;
      const leader = callCount >= convergenceThreshold ?
        TEST_LEADER_ADDRESS :
        divergentLeader;
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {p1: leader},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 5000, pollIntervalMs: 50},
    );
  });
  assert.ok(
    callCount >= convergenceThreshold,
    'Expected at least ' + convergenceThreshold +
    ' probes, got ' + callCount,
  );
});

test('waitForConsistencyConvergence throws last error ' +
  'when timeout expires', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b', {
    leaders: {p1: TEST_WS_ADDRESS},
  });

  await assert.rejects(
    waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 500, pollIntervalMs: 50},
    ),
    /Leader identities disagree/i,
  );
});

test('waitForConsistencyConvergence tolerates transient empty leader maps',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a', {
      leaders: {p1: TEST_LEADER_ADDRESS},
    });
    const nodeB = buildControlSnapshotNode('node-b', {
      leaders: {},
    });

    await assert.doesNotReject(async () => {
      await waitForConsistencyConvergence(
        [nodeA, nodeB],
        {timeoutMs: 500, pollIntervalMs: 50},
      );
    });
  });

test('assertConsistency derives leaders from ' +
  'replicaRoles when partitions table leaders are ' +
  'empty — uses services-derived leader identity ' +
  'during cache hydration', async () => {
  // Simulates post-seed-restart state: partitions table
  // not yet hydrated so leaders={}, but services rows
  // report raft_role leaders via replicaRoles.
  const snapshotPayload = {
    nodes: ['node-1', 'node-2', 'node-3'],
    partitions: ['p1'],
    leaders: {},
    voterCounts: {p1: 3},
    replicaRoles: {
      p1: {
        'replica-1': 'leader',
        'replica-2': 'follower',
        'replica-3': 'follower',
      },
    },
  };

  const nodeA = {
    id: 'node-a',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {rows: [snapshotPayload]};
    },
    async query() {
      throw new Error('should not be called');
    },
  };
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {rows: [snapshotPayload]};
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});
