import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {assertConsistency} from '../assertions.js';
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

test('assertConsistency uses control snapshots when available', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});
