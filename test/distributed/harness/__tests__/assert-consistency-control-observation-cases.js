import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {assertConsistency} from '../assertions.js';
import {
  TEST_WS_ADDRESS,
  TEST_LEADER_ADDRESS,
  TEST_CONSISTENCY_REASON_MIXED_OBSERVATION_MODE,
  TEST_FINAL_CONSISTENCY_STATE_OBSERVATION_MODE_MISMATCH,
  TEST_EMPTY_COUNT,
  NODE_ROWS,
  buildQueryableNode,
  buildControlSnapshotNode,
} from './assert-consistency-fixtures.js';

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
        effectiveActiveNodeIds: publishedNodes,
        projectedActiveNodeIds: ['node-1'],
        publishedActiveNodeIds: publishedNodes,
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
        effectiveActiveNodeIds: publishedNodes,
        projectedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        publishedActiveNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});

test('assertConsistency does not repair missing published membership inline', async () => {
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
                effectiveActiveNodeIds: publishedNodes,
                projectedActiveNodeIds: ['node-1', 'node-2'],
                publishedActiveNodeIds: publishedNodes,
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
              effectiveActiveNodeIds: ['node-1', 'node-2'],
              projectedActiveNodeIds: ['node-1', 'node-2'],
              publishedActiveNodeIds: [],
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
        effectiveActiveNodeIds: publishedNodes,
        projectedActiveNodeIds: ['node-1', 'node-2'],
        publishedActiveNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
  assert.equal(nodeACalls.length, 1);
  assert.equal(nodeACalls[0]?.forceRepair, false);
});

test('assertConsistency does not reopen raw SQL when a control snapshot fails', async () => {
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
  assert.equal(fallbackQueryCount, TEST_EMPTY_COUNT);
});

test('assertConsistency fails rather than reopening SQL after one snapshot owner failure', async () => {
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

  try {
    await assertConsistency([nodeA, fallbackNode]);
    assert.fail('expected owner observation failure');
  } catch (error) {
    assert.match(
      String(error?.message || ''),
      /fewer than 2 queryable nodes/i,
    );
  }
  assert.equal(fallbackQueryCount, TEST_EMPTY_COUNT);
});

test('assertConsistency rejects one control snapshot mixed with SQL compatibility mode',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a');
    const sqlNode = buildQueryableNode('node-b');

    try {
      await assertConsistency([nodeA, sqlNode]);
      assert.fail('expected mixed observation mode failure');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /mixed observation modes/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_MIXED_OBSERVATION_MODE,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_OBSERVATION_MODE_MISMATCH,
      );
    }
  });

test('assertConsistency allows pure SQL compatibility mode without control snapshots',
  async () => {
    const nodeA = buildQueryableNode('node-a');
    const nodeB = buildQueryableNode('node-b');

    await assert.doesNotReject(
      assertConsistency([nodeA, nodeB]),
    );
  });

test('assertConsistency supplements SQL compatibility partitions from service-visible topology',
  async () => {
    let fallbackQueryCount = 0;
    const nodeA = buildQueryableNode('node-a');
    const fallbackNode = {
      id: 'node-b',
      async isReachable() {
        return true;
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
      fallbackQueryCount > TEST_EMPTY_COUNT,
      'expected compatibility SQL node to exercise raw SQL path',
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
