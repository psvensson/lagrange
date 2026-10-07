// Witness W4 of the local-log guard: no envelope a correct replica sends is
// ever refused. One scripted sequence of normal operation on real rs-raft
// ports and the real WASM core - an election, appends, a lagging follower
// caught up, a follower restarted from its durable log, a proposal
// forwarded by a follower (a peer MsgPropose with entries), a named
// transfer requested at a follower (forwarded to the leader as a peer
// MsgTransferLeader - the path a P7 refusal would have broken), a transfer
// the leader makes through MsgTimeoutNow to a caught-up follower whose gate
// is open, and a leader lost and replaced by election - after which every
// replica's port has recorded zero local-log guard refusals, none is held,
// and every replica holds the same committed log.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  LEADER_ROLE,
  formedCluster,
  lifecycleRow,
} from './identity-reuse-harness.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_PHASE} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';

const REPLICAS = Object.freeze(['cf-a', 'cf-b', 'cf-c']);
const LAGGING_ENTRIES = 30;
const ROUNDS = 400;

function leaderOf(cluster) {
  return REPLICAS.find((replicaId) =>
    cluster.node(replicaId).readStatus().role === LEADER_ROLE) ?? null;
}

function commitOf(cluster, replicaId) {
  return Number(cluster.node(replicaId).readStatus().commitIndex);
}

function allCommit(cluster, index, tickers) {
  cluster.tickers = tickers;
  return cluster.settle(() => REPLICAS.every((replicaId) =>
    commitOf(cluster, replicaId) >= index), {rounds: ROUNDS});
}

function proposeAndCommit(cluster, proposer, label) {
  const leader = leaderOf(cluster);
  const target = commitOf(cluster, leader) + 1;
  cluster.propose(proposer, {op: label});
  assert.ok(allCommit(cluster, target, [leader]),
    `${label}: committed on every replica`);
}

function guardRefusals(cluster) {
  return REPLICAS.flatMap((replicaId) =>
    cluster.node(replicaId).readStatus().inboundStepRefusals
      .filter((record) => record.phase === RUNTIME_PHASE.LOCAL_LOG_GUARD)
      .map((record) => ({replicaId, ...record})));
}

function settleOnLeader(cluster, expected, tickers) {
  cluster.tickers = tickers;
  return cluster.settle(() => leaderOf(cluster) === expected &&
    REPLICAS.every((replicaId) =>
      cluster.node(replicaId).readStatus().leaderId === expected),
  {rounds: ROUNDS});
}

test('W4: correct replicas are never refused by the local-log guard across ' +
  'elections, catch-up, restart, forwarding, transfers and a leader loss',
async () => {
  const cluster = formedCluster('w4-correct', [...REPLICAS], 5);
  try {
    // A lagging follower caught up by the leader's appends.
    cluster.isolate('cf-c');
    for (let index = 0; index < LAGGING_ENTRIES; index += 1) {
      cluster.propose('cf-a', {op: 'while-c-lags', index});
      cluster.settle(() => false, {rounds: 1});
    }
    cluster.heal('cf-c');
    assert.ok(allCommit(cluster, commitOf(cluster, 'cf-a'), ['cf-a']),
      'the lagging follower caught up');

    // A follower restarted from its own durable log.
    // Idle first: the leader's heartbeats (commit = its committed index)
    // reach the restarted follower before any append, so its bound must be
    // the last index its durable record holds.
    cluster.restart('cf-b');
    cluster.tickers = ['cf-a'];
    cluster.settle(() => false, {rounds: 12});
    assert.deepEqual(guardRefusals(cluster), [],
      'a heartbeat to a follower restarted from its durable log was refused');
    proposeAndCommit(cluster, 'cf-a', 'after-b-restarted');

    // A proposal forwarded by a follower to the leader.
    proposeAndCommit(cluster, 'cf-b', 'forwarded-by-b');

    // A named transfer requested at a follower: forwarded to the leader.
    const forwarded = await cluster.node('cf-b').transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: 'cf-c'});
    assert.equal(forwarded.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED,
      JSON.stringify(forwarded));
    assert.ok(settleOnLeader(cluster, 'cf-c', ['cf-a']),
      'the forwarded named transfer moved leadership');
    proposeAndCommit(cluster, 'cf-c', 'after-forwarded-transfer');

    // The leader's own transfer: MsgTimeoutNow to a caught-up follower.
    const requested = await cluster.node('cf-c').transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: 'cf-a'});
    assert.equal(requested.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED,
      JSON.stringify(requested));
    assert.ok(settleOnLeader(cluster, 'cf-a', ['cf-c']),
      'the leader transferred through MsgTimeoutNow');
    proposeAndCommit(cluster, 'cf-a', 'after-timeout-now');

    // The leader is lost; the others elect (both tick: under check_quorum a
    // follower that is never ticked keeps its leader lease); it comes back
    // as a follower.
    cluster.isolate('cf-a');
    cluster.tickers = ['cf-b', 'cf-c'];
    const survivorLeader = () => ['cf-b', 'cf-c'].find((replicaId) =>
      cluster.node(replicaId).readStatus().role === LEADER_ROLE);
    assert.ok(cluster.settle(() => survivorLeader() !== undefined,
      {rounds: ROUNDS}), 'a new leader was elected');
    const newLeader = survivorLeader();
    cluster.heal('cf-a');
    assert.ok(settleOnLeader(cluster, newLeader, [newLeader]),
      'the old leader follows the new one');
    proposeAndCommit(cluster, newLeader, 'after-leader-change');

    assert.deepEqual(guardRefusals(cluster), [],
      'a correct replica\'s envelope was refused');
    for (const replicaId of REPLICAS) {
      assert.equal(lifecycleRow(cluster, replicaId).state, 'active');
    }
    const committed = commitOf(cluster, newLeader);
    const logs = REPLICAS.map((replicaId) =>
      durableLog(cluster.dbFileOf(replicaId), cluster.partitionId)
        .filter((entry) => entry.index <= committed)
        .map((entry) => [entry.index, entry.term]));
    assert.deepEqual(logs[1], logs[0]);
    assert.deepEqual(logs[2], logs[0]);
  } finally {
    cluster.dispose();
  }
});
