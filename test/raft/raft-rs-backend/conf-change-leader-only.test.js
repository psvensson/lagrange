// F-1 (verification O1 round 2; lead ruling: no conf-change proposal may be
// silently dropped at ANY ingress). The crate forwards a follower's
// proposal to its leader (MsgPropose), where `step_leader` replaces a conf
// change it will not take with an empty entry (raft.rs:2062-2090) - the
// forwarded ingress the leader's V2 deferral never saw. At d46777ecf a
// follower proposing RemoveNode(C) behind the leader's pending AddNode was
// answered CORE_OK, the leader's log got an empty entry and C stayed a
// voter.
//
// The property: a conf-change proposal is taken only at the leader's port.
// A follower's port answers a typed, retryable NOT_LEADER naming the leader
// and hands the crate nothing (no entry, no forward); proposed again at the
// leader's port - where the deferral applies - it commits.
// Oracles: the leader's durable log (entry types from the binding's own wire
// numbers) and its durable applied configuration.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  bindingWireNumbers,
  durableAppliedState,
  durableLog,
} from './committed-membership-oracles.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';

const WIRE = bindingWireNumbers();
const A = 'lo-a';
const B = 'lo-b';
const C = 'lo-c';
const EXTRA = 'lo-x';

function applied(cluster, replicaId) {
  return durableAppliedState(cluster.replica(replicaId).dbFile,
    cluster.partitionId);
}

function logAfter(cluster, replicaId, index) {
  return durableLog(cluster.replica(replicaId).dbFile, cluster.partitionId)
    .filter((entry) => entry.index > index);
}

test('F-1: a follower\'s conf-change proposal behind the leader\'s pending ' +
  'index is refused typed NOT_LEADER, never forwarded or dropped, and ' +
  'commits when proposed at the leader', (t) => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'leader-only', replicaIds: [A, B, C]});
  t.after(() => cluster.dispose());
  cluster.tickers = [A];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === A &&
    [A, B, C].every((replicaId) => applied(cluster, replicaId)
      ?.appliedIndex > 0), {rounds: 400}), 'setup: A leads');
  for (const replicaId of [A, B, C]) {
    new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
      .registerReplica(EXTRA);
  }
  const peerC = String(cluster.raftPeerIdOf(C));
  // The leader holds a pending (effective) AddNode.
  assert.equal(cluster.node(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: EXTRA})
    .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  const logBefore = durableLog(cluster.replica(A).dbFile,
    cluster.partitionId).at(-1).index;
  const answer = cluster.node(B).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C});
  assert.deepEqual({
    outcome: answer.outcome, reason: answer.reason,
    retryable: answer.retryable, leaderReplicaId: answer.leaderReplicaId,
  }, {
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER,
    retryable: true,
    leaderReplicaId: A,
  }, `the follower's port refuses typed, naming the leader (${
    JSON.stringify(answer)})`);
  const settlements = [];
  cluster.node(A).subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED,
    (settlement) => settlements.push(settlement));
  cluster.tickers = [A];
  assert.ok(cluster.settle(() => settlements.length > 0, {rounds: 80}),
    'the leader\'s pending change settles');
  assert.deepEqual(logAfter(cluster, A, logBefore).filter((entry) =>
    entry.entryType === WIRE.entryType.EntryNormal && entry.data === null),
  [], 'nothing reached the leader to be replaced by an empty entry');
  assert.ok(applied(cluster, A).voters.includes(peerC),
    'C is untouched until the leader proposes');

  // Re-driven where it is taken: the leader's own port.
  assert.equal(cluster.node(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C})
    .outcome, RAFT_OPERATION_OUTCOME.CORE_OK, 'the leader takes it');
  assert.ok(cluster.settle(() =>
    !applied(cluster, A).voters.includes(peerC), {rounds: 80}),
  'RemoveNode(C) commits and applies');
});
