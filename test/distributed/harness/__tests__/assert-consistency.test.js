import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {assertConsistency} from '../assertions.js';

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
      address: 'ws://node-2:9080',
      partition_id: 'p1',
      node_id: 'node-2',
    },
  ];
}

function buildQueryableNode(nodeId, leaderAddress = 'ws://node-1:9080') {
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
  const nodeA = buildQueryableNode('node-a', 'ws://node-1:9080');
  const nodeB = buildQueryableNode('node-b', 'ws://node-9:9080');

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Leader identities disagree/i,
  );
});
