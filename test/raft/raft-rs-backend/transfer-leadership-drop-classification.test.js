// Which proposals a transfer drops, classified by raft-rs's own predicate
// (quest F1, CA9).
//
// raft-rs's leader drops a proposal for one of two reasons (raft.rs
// step_leader, MsgPropose): it no longer has progress for itself - it applied
// its own removal - or a transfer it accepted is still in progress, which
// ends within one election timeout and is answered retryable. The first
// cannot hold for a leader: the leader's port refuses a change that removes
// or demotes the leader itself (REMOVES_LEADER) and hands leadership on, and
// the binding steps down a leader that applies such a change anyway (fork
// fix 5, conf-change-leader-self-removal.test.js). Until both, raft-rs kept
// the removed or demoted leader leading and this file classified its drops.
// So a proposal a leader drops is the transfer's: the retryable in-progress
// outcome.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

const REPLICAS = Object.freeze(['drop-a', 'drop-b', 'drop-c']);
const [A, B, C] = REPLICAS;
const LEADER_ROLE = 'leader';

function clusterLedBy(partitionId, leader) {
  const cluster = new PartitionNodeCluster({partitionId, replicaIds: REPLICAS});
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === leader),
    true, `setup: ${leader} leads`);
  return cluster;
}

test('CA9: a leader that drops a proposal during its transfer answers the ' +
  'retryable in-progress outcome', async () => {
  const cluster = clusterLedBy('ca9-transfer-drop', A);
  try {
    cluster.isolate(C);
    const accepted = await turnChainValue(cluster.node(A).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: C,
    }));
    assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: A runs a transfer to C (${JSON.stringify(accepted)})`);
    const dropped = await turnChainValue(cluster.node(A).propose({duringTransfer: true}));
    assert.equal(dropped.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      `the drop is the transfer's (${JSON.stringify(dropped)})`);
    assert.equal(dropped.retryable, true);
    assert.equal(dropped.recoveryRequired, false);
  } finally {
    cluster.dispose();
  }
});

for (const type of [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
  RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]) {
  test(`a change about the leader itself (${type}) never leaves a leader ` +
    'without progress for itself: its port refuses it and hands leadership ' +
    'on, and the change made at the next leader leaves A no leader',
  async () => {
    const cluster = clusterLedBy(`ca9-self-${type}`, A);
    try {
      const refused = await turnChainValue(cluster.node(A).proposeConfChange({
        type, replicaIdentity: A, nodeId: 'node-test'}));
      assert.equal(refused.reason,
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER,
        `A's port refuses the change about A (${JSON.stringify(refused)})`);
      cluster.tickers = [...REPLICAS];
      assert.equal(cluster.settle(() => [B, C].includes(
        cluster.leaderReplicaId())), true, 'leadership passed to B or C');
      const leader = cluster.leaderReplicaId();
      const made = await turnChainValue(cluster.node(leader)
        .proposeConfChange({type, replicaIdentity: A, nodeId: 'node-test'}));
      assert.equal(made.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        `the next leader takes the change (${JSON.stringify(made)})`);
      const aId = cluster.raftPeerIdOf(A);
      assert.equal(cluster.settle(() => REPLICAS.every((replicaId) =>
        !cluster.coreConfState(replicaId).voters.includes(aId))), true,
      'every replica applied the change: A is no voter');
      assert.notEqual(cluster.node(A).readStatus().role, LEADER_ROLE,
        'A does not lead');
      const taken = await turnChainValue(cluster.propose(leader,
        {afterChange: type}));
      assert.equal(taken.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        `the group's leader takes a proposal (${JSON.stringify(taken)})`);
    } finally {
      cluster.dispose();
    }
  });
}
