import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {assertConsistency} from '../assertions.js';
import {PORTS} from '../constants.js';
import {buildQueryableNode} from './assert-consistency-fixtures.js';

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
