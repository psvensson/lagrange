// Receipts (quest replace-source-removal-owner, amendment-1 step 3, the
// witness seam): what a REPLACE target replica answers about the source.
//   - READ: the replica's own committed voters decide VOTER / ABSENT, with
//     the core's commit index and leader - never a row;
//   - RETIRE: a follower's REMOVE_PEER reaches the leader through the port,
//     commits, and the follower's next read is ABSENT at a later commit
//     index; a repeat after the commit changes nothing.
// Oracle: the core's own readStatus() on the same replica.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  readPartitionReplicaMembership,
  retirePartitionRaftPeer,
} from '../../../src/partition/partition-service-raft-membership-administration.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../../src/partition/partition-replica-membership-constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';

const PARTITION_ID = 'replica-membership-witness-partition';
const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const SETTLE_ROUNDS = 400;

function electedCluster() {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
  });
  cluster.tickers = [FOUNDING[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), 'the partition elects a leader');
  return cluster;
}

// The partition-service surface the seam reads: the replica's port and its
// identity. Nothing else.
function witnessService(cluster, replicaId) {
  return {
    raft: cluster.node(replicaId),
    replicaId,
    partitionId: PARTITION_ID,
    replicaIds: [...FOUNDING],
  };
}

test('witness read: the replica\'s own committed voters name the source; ' +
  'an unknown identity is absent', async () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    const [witness, source] = FOUNDING.filter((id) => id !== leader);
    const read = await readPartitionReplicaMembership(
      witnessService(cluster, witness), source);
    const status = cluster.node(witness).readStatus();
    assert.equal(read.state, PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER);
    assert.equal(read.leaderReplicaId, leader,
      'the leader is the core\'s own');
    assert.equal(read.commitIndex, status.commitIndex,
      'the commit index is the core\'s own');
    assert.equal(read.appliedIndex, Number(RaftRsDurableStore
      .readAppliedIndexIn(cluster.replica(witness).db, PARTITION_ID) ?? 0),
    'the applied index is the one the read configuration was recorded at');
    assert.ok(read.appliedIndex <= read.commitIndex,
      'applied never runs ahead of commit');
    const unknown = await readPartitionReplicaMembership(
      witnessService(cluster, witness), 'replica-never-member');
    assert.equal(unknown.state, PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT);
  } finally {
    cluster.dispose();
  }
});

test('witness retire: a follower\'s REMOVE_PEER commits through the leader; ' +
  'the witness then reads the source absent at a later commit index',
async () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    const [witness, source] = FOUNDING.filter((id) => id !== leader);
    const service = witnessService(cluster, witness);
    const before = await readPartitionReplicaMembership(service, source);
    const retired = await retirePartitionRaftPeer(service, source);
    assert.equal(retired.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      `the port accepted the proposal (${retired.portOutcome}/` +
      `${retired.reason})`);
    const sourcePeerId = String(cluster.raftPeerIdOf(source));
    assert.ok(cluster.settle(() => !cluster.coreConfState(witness).voters
      .map(String).includes(sourcePeerId), {rounds: SETTLE_ROUNDS}),
    'the removal commits on the witness');
    const after = await readPartitionReplicaMembership(service, source);
    assert.equal(after.state, PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT);
    assert.ok(after.commitIndex > before.commitIndex,
      'the absence is read at a later commit index');
    const votersAfter = cluster.coreConfState(witness).voters.map(String)
      .sort();
    await retirePartitionRaftPeer(service, source);
    cluster.settle(() => false, {rounds: 20});
    assert.deepEqual(cluster.coreConfState(witness).voters.map(String).sort(),
      votersAfter, 'a repeat after the commit changes nothing');
  } finally {
    cluster.dispose();
  }
});
