// Receipts (quest replace-source-removal-owner, amendment-1 step 1, design
// S5.2): the operation port announces MEMBERSHIP_CHANGED from the applied
// ConfState itself.
//   - the first observation after construction is announced (a listener's
//     baseline is level-correct);
//   - a committed RemoveNode is announced on every remaining replica, with
//     the configuration the core applied, once;
//   - a restart from the same durable record announces its first observation
//     again, and it is the committed configuration, not a prediction;
//   - a round with no configuration change announces nothing.
// Oracle: the core's own readStatus().confState on the same replica. Nothing
// here chooses an expected configuration.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_OPERATION,
} from '../../../src/raft/raft-operation-port-constants.js';

const PARTITION_ID = 'membership-event-partition';
const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const SETTLE_ROUNDS = 400;

function subscribeAll(cluster, replicaIds, received) {
  return replicaIds.map((replicaId) => {
    received.set(replicaId, []);
    return cluster.node(replicaId).subscribe(
      RAFT_EVENT.MEMBERSHIP_CHANGED,
      (observation) => received.get(replicaId).push(observation),
    );
  });
}

function votersOf(confState) {
  return [...confState.voters].map(String).sort();
}

function electedCluster() {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
  });
  cluster.tickers = [FOUNDING[0]];
  const elected = cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS});
  assert.ok(elected, 'the partition elects a leader');
  return cluster;
}

test('membership changed: the first observation after construction is ' +
  'announced with the core\'s own configuration', () => {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: FOUNDING,
  });
  const received = new Map();
  try {
    subscribeAll(cluster, FOUNDING, received);
    cluster.tickers = [FOUNDING[0]];
    cluster.settle(() => FOUNDING.every((replicaId) =>
      received.get(replicaId).length > 0), {rounds: SETTLE_ROUNDS});
    for (const replicaId of FOUNDING) {
      const first = received.get(replicaId)[0];
      assert.ok(first, `${replicaId} announced its first observation`);
      assert.deepEqual(votersOf(first.confState),
        votersOf(cluster.coreConfState(replicaId)),
        'the announced configuration is the core\'s');
      assert.equal(Number.isFinite(first.commitIndex), true,
        'the announcement carries the commit index');
    }
  } finally {
    cluster.dispose();
  }
});

test('membership changed: a committed RemoveNode is announced once on every ' +
  'remaining replica; a round without a change announces nothing', () => {
  const cluster = electedCluster();
  const received = new Map();
  try {
    const leader = cluster.leaderReplicaId();
    const retiring = FOUNDING.find((replicaId) => replicaId !== leader);
    const retiringPeerId = cluster.raftPeerIdOf(retiring);
    const remaining = FOUNDING.filter((replicaId) => replicaId !== retiring);
    subscribeAll(cluster, remaining, received);
    // A listener that subscribes after the first announcement reads its
    // baseline from status; the event is an edge after that baseline.
    for (const replicaId of remaining) {
      assert.ok(votersOf(cluster.coreConfState(replicaId))
        .includes(retiringPeerId), 'the baseline still names the voter');
    }
    for (let round = 0; round < 20; round += 1) {
      cluster.node(leader).tick();
      cluster.deliverAll();
    }
    for (const replicaId of remaining) {
      assert.equal(received.get(replicaId).length, 0,
        `${replicaId}: no configuration change, no announcement`);
    }
    const proposed = cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: retiring,
    });
    assert.equal(proposed.outcome, 'CORE_OK', 'the removal is proposed');
    const announced = cluster.settle(() => remaining.every((replicaId) =>
      received.get(replicaId).length > 0 &&
      !votersOf(received.get(replicaId).at(-1).confState)
        .includes(retiringPeerId)), {rounds: SETTLE_ROUNDS});
    assert.ok(announced, 'every remaining replica announced the removal');
    for (const replicaId of remaining) {
      const events = received.get(replicaId);
      assert.equal(events.length, 1,
        `${replicaId} announced the applied change exactly once`);
      assert.deepEqual(votersOf(events.at(-1).confState),
        votersOf(cluster.coreConfState(replicaId)),
        'the announced configuration is the one the core applied');
    }
  } finally {
    cluster.dispose();
  }
});

test('membership changed: a restart announces its first observation again, ' +
  'from the durable committed configuration', () => {
  const cluster = electedCluster();
  const received = new Map();
  try {
    const leader = cluster.leaderReplicaId();
    const restarted = FOUNDING.find((replicaId) => replicaId !== leader);
    const before = votersOf(cluster.coreConfState(restarted));
    cluster.restart(restarted);
    subscribeAll(cluster, [restarted], received);
    cluster.settle(() => received.get(restarted).length > 0,
      {rounds: SETTLE_ROUNDS});
    const first = received.get(restarted)[0];
    assert.ok(first, 'the restarted replica announced its first observation');
    assert.deepEqual(votersOf(first.confState), before,
      'the restored configuration is the committed one it had');
  } finally {
    cluster.dispose();
  }
});
