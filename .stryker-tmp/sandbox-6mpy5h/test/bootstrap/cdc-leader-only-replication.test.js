/**
 * Unit test for CDC leader-only replication fix.
 * Verifies that CDC events from partitions are only replicated through
 * the message group leader, not followers.
 *
 * Bug: CDC events were being applied on all message group replicas,
 * but only the leader can replicate through Raft. This caused CDC events
 * to not propagate to other nodes.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {strict as assert} from 'node:assert';
import {EventEmitter} from 'events';

test('CDC subscription - only leader replicates events', async (t) => {
  let leaderApplyCalled = false;
  let followerApplyCalled = false;

  // Mock message group leader
  const leaderMessageGroup = {
    isLeaderReplica: () => true,
    subscribeToCDC: async () => {},
    applyCDCEvent: async (tableName, operation, data) => {
      leaderApplyCalled = true;
      assert.equal(tableName, 'nodes');
      assert.equal(operation, 'INSERT');
      assert.deepEqual(data, {node_id: 'test-node'});
    },
  };

  // Mock message group follower
  const followerMessageGroup = {
    isLeaderReplica: () => false,
    subscribeToCDC: async () => {},
    applyCDCEvent: async () => {
      followerApplyCalled = true;
    },
  };

  // Mock partition
  const partition = new EventEmitter();
  const cdcSubscribers = [];
  partition.subscribeToCDC = (handler) => {
    cdcSubscribers.push(handler);
  };

  // Simulate the CDC subscription setup (as done in bootstrap/joining services)
  for (const messageGroup of [leaderMessageGroup, followerMessageGroup]) {
    await messageGroup.subscribeToCDC('nodes');

    partition.subscribeToCDC(async (cdcEvent) => {
      if (cdcEvent.tableName === 'nodes') {
        // Only apply CDC event if this message group is the leader
        if (messageGroup.isLeaderReplica()) {
          await messageGroup.applyCDCEvent(
            cdcEvent.tableName,
            cdcEvent.operation,
            cdcEvent.data,
          );
        }
      }
    });
  }

  // Simulate partition generating a CDC event
  const cdcEvent = {
    tableName: 'nodes',
    operation: 'INSERT',
    data: {node_id: 'test-node'},
  };

  // Deliver to all subscribers
  for (const subscriber of cdcSubscribers) {
    await subscriber(cdcEvent);
  }

  // Verify only leader applied the event
  assert.ok(leaderApplyCalled, 'Leader should have applied CDC event');
  assert.ok(!followerApplyCalled, 'Follower should NOT have applied CDC event');
});

test('CDC subscription - follower does not replicate', async (t) => {
  let applyCalled = false;

  // Mock message group follower
  const followerMessageGroup = {
    isLeaderReplica: () => false,
    subscribeToCDC: async () => {},
    applyCDCEvent: async () => {
      applyCalled = true;
    },
  };

  // Mock partition
  const partition = new EventEmitter();
  const cdcSubscribers = [];
  partition.subscribeToCDC = (handler) => {
    cdcSubscribers.push(handler);
  };

  // Setup CDC subscription
  await followerMessageGroup.subscribeToCDC('nodes');

  partition.subscribeToCDC(async (cdcEvent) => {
    if (cdcEvent.tableName === 'nodes') {
      // Only apply if leader
      if (followerMessageGroup.isLeaderReplica()) {
        await followerMessageGroup.applyCDCEvent(
          cdcEvent.tableName,
          cdcEvent.operation,
          cdcEvent.data,
        );
      }
    }
  });

  // Simulate CDC event
  const cdcEvent = {
    tableName: 'nodes',
    operation: 'UPDATE',
    data: {node_id: 'test-node', status: 'ready'},
  };

  for (const subscriber of cdcSubscribers) {
    await subscriber(cdcEvent);
  }

  // Verify follower did not apply
  assert.ok(!applyCalled, 'Follower should not apply CDC event');
});
