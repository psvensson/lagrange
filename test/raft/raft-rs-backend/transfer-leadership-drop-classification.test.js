// Which proposals a transfer drops, classified by raft-rs's own predicate
// (quest F1, CA9).
//
// raft-rs's leader drops a proposal for one of two reasons it distinguishes
// (raft.rs step_leader, MsgPropose): it no longer has progress for itself -
// it was removed from its own configuration, a terminal refusal - or a
// transfer it accepted is still in progress, which ends within one election
// timeout and is answered retryable. "Has progress" covers learners too:
// raft-rs keeps a leader demoted to a learner leading (post_conf_change
// returns early for it). So a demoted leader's proposal dropped during its
// transfer is the retryable in-progress outcome, and a removed leader's is
// still the refusal.

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
const [A, , C] = REPLICAS;

// A leads, then its own configuration change about itself commits and is
// applied everywhere, and A still leads.
function clusterAfterSelfChange(partitionId, type) {
  const cluster = new PartitionNodeCluster({partitionId, replicaIds: REPLICAS});
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true,
    'setup: A leads');
  const proposed = turnChainValue(cluster.node(A).proposeConfChange({type,
    replicaIdentity: A, nodeId: 'node-test'}));
  assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `setup: the change about A is proposed (${JSON.stringify(proposed)})`);
  const aId = cluster.raftPeerIdOf(A);
  assert.equal(cluster.settle(() => REPLICAS.every((replicaId) =>
    !cluster.coreConfState(replicaId).voters.includes(aId))), true,
  'setup: every replica applied the change: A is no voter');
  assert.equal(cluster.node(A).readStatus().role, 'leader',
    'setup: raft-rs keeps A leading');
  return cluster;
}

test('CA9: a leader demoted to a learner that drops a proposal during its ' +
  'transfer answers the retryable in-progress outcome', async () => {
  const cluster = clusterAfterSelfChange('ca9-demoted-leader',
    RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER);
  try {
    assert.ok(cluster.coreConfState(A).learners.includes(
      cluster.raftPeerIdOf(A)), 'setup: A is a learner');
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

// A removed leader's terminal drop is pinned where such a leader can still
// arise (removed-leader-step-down.test.js): its own port refuses its own
// removal (REMOVES_LEADER), so it is not built from a self-change here.
test('a leader asked to remove itself refuses at its own port and keeps ' +
  'its configuration', async () => {
  const cluster = new PartitionNodeCluster({partitionId: 'ca9-removed-leader',
    replicaIds: REPLICAS});
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true,
      'setup: A leads');
    const refused = await turnChainValue(cluster.node(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: A}));
    assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(refused.reason,
      RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER);
    assert.ok(cluster.coreConfState(A).voters
      .includes(cluster.raftPeerIdOf(A)), 'A is still a voter');
  } finally {
    cluster.dispose();
  }
});
