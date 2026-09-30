// readStatus is a synchronous observation on the rs-raft port: while a Ready
// delivery is in flight (sendToPeer returned a pending promise, so the
// group's queue is busy) it answers a frozen status carrying the rs-raft
// runtime fields, never a Promise; once the delivery settles it reflects the
// new state. Every expectation is read from the port itself.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';

const REPLICAS = Object.freeze(['status-a', 'status-b', 'status-c']);
const RS_ONLY_STATUS_FIELDS = Object.freeze(['confState', 'runtimeGeneration']);
const SUSPEND_ATTEMPTS = 12;

function elect(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
    'the real group elects a leader');
  return cluster.leaderReplicaId();
}

function isThenable(value) {
  return value !== null && typeof value?.then === 'function';
}

test('readStatus answers a frozen rs-raft status while a delivery is in flight',
  async () => {
    let releaseDelivery = null;
    let suspendDelivery = false;
    // The suspended envelope is delivered late, when the send settles, so
    // the delivery is slow rather than lost.
    const cluster = new PartitionNodeCluster({
      partitionId: 'status-observation',
      replicaIds: [...REPLICAS],
      sendFor: (fromReplicaId, peerAddress, packet) => {
        if (!suspendDelivery) {
          return undefined;
        }
        suspendDelivery = false;
        return new Promise((resolve) => {
          releaseDelivery = (delivery) => {
            cluster.queue(fromReplicaId, peerAddress, packet);
            resolve(delivery);
          };
        });
      },
    });
    try {
      const leader = elect(cluster);
      cluster.tickers = [leader];
      const port = cluster.node(leader);
      const before = port.readStatus();
      assert.equal(isThenable(before), false,
        'an idle group answers its status synchronously');

      suspendDelivery = true;
      let pending = port.propose('observed-while-busy');
      for (let index = 0; index < SUSPEND_ATTEMPTS && releaseDelivery === null;
        index += 1) {
        pending = port.tick();
      }
      assert.equal(typeof releaseDelivery, 'function',
        'the leader is suspended in a real Ready delivery');
      assert.equal(isThenable(pending), true,
        'the leader\'s queue is busy behind the in-flight delivery');

      const during = port.readStatus();
      assert.equal(isThenable(during), false,
        'a busy group answers readStatus with a value, not a Promise');
      assert.equal(Object.isFrozen(during), true, 'the status is frozen');
      assert.deepEqual(
        RS_ONLY_STATUS_FIELDS.filter((field) => !Object.hasOwn(during, field)),
        [], 'the busy status carries the rs-raft runtime fields');
      assert.equal(during.role, before.role,
        'the busy status is the leader\'s own last completed observation');

      releaseDelivery({acknowledged: true});
      await pending;
      const committed = cluster.settle(
        () => port.readStatus().commitIndex > before.commitIndex);
      assert.equal(committed, true,
        'after the delivery settles, readStatus reflects the new commit');
      assert.equal(isThenable(port.readStatus()), false);
    } finally {
      cluster.dispose();
    }
  });
