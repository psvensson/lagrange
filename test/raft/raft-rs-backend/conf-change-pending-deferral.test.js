// V2 (verification O1 round 1), the port's half: raft-rs drops a conf-change
// proposal behind ANY pending configuration index (`pending_conf_index >
// applied`, raft.rs:2743) - answering Ok and appending an empty entry in its
// place (raft.rs:2063-2090). Every proposed conf entry sets that index,
// whatever its effect (raft.rs:2077), and a new leader sets it to its last
// index (raft.rs:1227-1232). At ab7669fd0 the port answered such an AddNode
// CORE_OK: a silent drop no wake-up keyed on the configuration key ever
// re-drove when the pending change applied without changing the key.
//
// The property, ranged over the crate's pending-change kinds {effective
// AddNode, effective RemoveNode, no-op RemoveNode, no-op AddNode, the
// leader's post-election conservative index} x "AddNode(t) lands behind it":
//   - the AddNode is answered as a typed, retryable deferral, never CORE_OK,
//     and the crate never replaces it with an empty entry;
//   - the port announces the settlement (CONF_CHANGE_APPLIED) in
//     the drain that applies the pending index - within one applied entry;
//   - proposed again then (what the admission re-drive does), t is admitted.
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
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RUNTIME_REASON} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';

const WIRE = bindingWireNumbers();
const A = 'pd-a';
const B = 'pd-b';
const C = 'pd-c';
const TARGET = 'pd-t';
const EXTRA = 'pd-x';
const ABSENT = 'pd-gone';
const ROUNDS = 400;
const DEFERRAL = Object.freeze({
  outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
  reason: RUNTIME_REASON.CONF_CHANGE_PENDING,
  retryable: true,
  recoveryRequired: false,
});

function deferralOf(answer) {
  const {outcome, reason, retryable, recoveryRequired} = answer ?? {};
  return {outcome, reason, retryable, recoveryRequired};
}

function addPeer(replicaIdentity) {
  return {type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity};
}

function removePeer(replicaIdentity) {
  return {type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity};
}

// A cluster of three founders; `capTo` names a replica whose deliveries
// carry at most `cap.value` as their commit index.
function openCluster(t, {capTo = null} = {}) {
  const cap = {value: Number.POSITIVE_INFINITY};
  let cluster = null;
  cluster = new PartitionNodeCluster({
    partitionId: 'pending-deferral',
    replicaIds: [A, B, C],
    sendFor: (fromReplicaId, address, packet) => {
      if (capTo === null || address !== cluster.addressOf(capTo) ||
          cluster.isolated.has(fromReplicaId) || cluster.isolated.has(capTo)) {
        return undefined;
      }
      const message = {...packet.message};
      if (message.commit !== undefined) {
        message.commit = String(Math.min(Number(message.commit), cap.value));
      }
      cluster.replica(capTo).inbox.push({...packet, message});
      return null;
    },
  });
  t.after(() => cluster.dispose());
  cluster.tickers = [A];
  const settled = cluster.settle(() => cluster.leaderReplicaId() === A &&
    [A, B, C].every((replicaId) => durableAppliedState(
      cluster.replica(replicaId).dbFile, cluster.partitionId)
      ?.appliedIndex > 0), {rounds: ROUNDS});
  assert.ok(settled, 'setup: A leads and every founder applied');
  // Every member can name the identities the changes use.
  for (const replicaId of [A, B, C]) {
    const registry = new RaftRsPeerIdentityRegistry(cluster.replica(replicaId)
      .db);
    for (const identity of [TARGET, EXTRA, ABSENT]) {
      registry.registerReplica(identity);
    }
  }
  return {cluster, cap};
}

function peerIdOf(cluster, leader, identity) {
  return String(new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .registerReplica(identity));
}

// The pending-change kinds: each leaves a pending configuration index on the
// leader it returns, without settling.
const PENDING_KINDS = Object.freeze({
  'effective AddNode': ({cluster}) => {
    assert.equal(cluster.node(A).proposeConfChange(addPeer(EXTRA)).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    return A;
  },
  'effective RemoveNode': ({cluster}) => {
    assert.equal(cluster.node(A).proposeConfChange(removePeer(C)).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    return A;
  },
  'no-op RemoveNode (a non-member)': ({cluster}) => {
    assert.equal(cluster.node(A).proposeConfChange(removePeer(ABSENT))
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    return A;
  },
  'no-op AddNode (a member)': ({cluster}) => {
    assert.equal(cluster.node(A).proposeConfChange(addPeer(B)).outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    return A;
  },
  // B holds an entry it does not know committed (its deliveries carry a
  // capped commit index), A hands its leadership to B and goes away: B's
  // conservative pending index is its last index, above what it applied.
  // (A transfer, not a campaign of B's own: C heard A within its election
  // timeout, and under check_quorum it ignores any other election.)
  'post-election conservative index': ({cluster, cap}) => {
    cap.value = Number(cluster.coreStatus(B).commit ??
      durableAppliedState(cluster.replica(B).dbFile, cluster.partitionId)
        .appliedIndex);
    assert.equal(cluster.node(A).propose('before-the-election').outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    const lastOf = (replicaId) => durableLog(cluster.replica(replicaId).dbFile,
      cluster.partitionId).at(-1).index;
    cluster.settle(() => lastOf(B) === lastOf(A), {rounds: 60});
    assert.equal(cluster.node(A).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: B}).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    cluster.tickers = [];
    const elected = cluster.settle(() =>
      cluster.node(B).readStatus().role === RAFT_ROLE.LEADER, {rounds: 20});
    assert.ok(elected, 'setup: B is elected');
    cluster.isolate(A);
    cap.value = Number.POSITIVE_INFINITY;
    return B;
  },
});

for (const [kind, setup] of Object.entries(PENDING_KINDS)) {
  test(`V2 port: AddNode(t) behind a pending ${kind} is deferred typed, ` +
    'announced within one applied entry, and admitted when proposed again',
  (t) => {
    const world = openCluster(t,
      {capTo: kind.startsWith('post-election') ? B : null});
    const {cluster} = world;
    const leader = setup(world);
    const logBefore = durableLog(cluster.replica(leader).dbFile,
      cluster.partitionId).at(-1).index;
    // Every entry the leader holds when the AddNode arrives (the pending
    // configuration index is at most its last one).
    const lastAtProposal = durableLog(cluster.replica(leader).dbFile,
      cluster.partitionId).at(-1).index;
    const answer = cluster.node(leader).proposeConfChange(addPeer(TARGET));
    assert.deepEqual(deferralOf(answer), DEFERRAL,
      `the AddNode is deferred typed, never answered Ok (${
        JSON.stringify(answer)})`);
    // Subscribed after the answer: nothing applies inside a deferral.
    const settlements = [];
    cluster.node(leader).subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED,
      (settlement) => settlements.push(settlement));
    cluster.tickers = [leader];
    assert.ok(cluster.settle(() => settlements.length > 0, {rounds: 60}),
      'the settlement is announced');
    const [first] = settlements;
    assert.ok(first.appliedIndex <= lastAtProposal,
      'announced by the apply of the entries it waited behind (last ' +
        `${lastAtProposal}, announced at ${first.appliedIndex})`);
    const emptyAfter = durableLog(cluster.replica(leader).dbFile,
      cluster.partitionId).filter((entry) => entry.index > logBefore &&
      entry.entryType === WIRE.entryType.EntryNormal && entry.data === null);
    assert.deepEqual(emptyAfter, [],
      'the crate replaced no proposal of this port with an empty entry');
    const again = cluster.node(leader).proposeConfChange(addPeer(TARGET));
    assert.equal(again.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const targetPeer = peerIdOf(cluster, leader, TARGET);
    assert.ok(cluster.settle(() => durableAppliedState(
      cluster.replica(leader).dbFile, cluster.partitionId).voters
      .includes(targetPeer), {rounds: 60}), 't is admitted');
  });
}
