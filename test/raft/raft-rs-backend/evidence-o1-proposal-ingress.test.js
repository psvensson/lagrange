// Round 3 (verification O1 round 2, F-1): the proposer's role is a model
// dimension of D8. A conf-change proposal is taken only at the leader's
// port; a replica that does not lead answers a typed, retryable NOT_LEADER
// naming the leader it knows and hands the crate nothing - no entry, no
// forward, nothing the leader could drop silently. The leader's port defers
// what its core would drop (CONF_CHANGE_PENDING) and takes it once the
// pending change settled.
//
// Ranges over PROPOSER (every core role of the runtime's ROLE enumeration,
// classified: the leader proposes, every other role is refused) x the
// crate's pending-change kinds {effective AddNode, effective RemoveNode,
// no-op RemoveNode, no-op AddNode, post-election conservative index} x
// "AddNode(t) is proposed while the change is pending". Oracles: the
// leader's durable log (entry types from the binding's own wire numbers)
// and its durable applied configuration. Then, on the production admission
// path: a follower's remembered NOT_LEADER admission is proposed when that
// replica gains leadership, and a removed founder is never re-admitted by
// the wakes that follow.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  LEADER_ROLE,
  UNBOUNDED,
  WIRE,
  createModelCluster,
  durableOf,
  leaderOf,
  liveReplicas,
  peerIdIn,
  prefixFilter,
  reserveIdentity,
  roleOf,
  settle,
} from './evidence-o1-model.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  addressOf,
  buildTargetFromOperation,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  formGroup,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
} from './committed-membership-harness.js';
import {durableAppliedState} from './committed-membership-oracles.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  ROLE,
  ROLE_LEADER,
  RUNTIME_REASON,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';

const PARTITION_ID = 'evidence-o1-ingress';
const A = 'in-a';
const B = 'in-b';
const C = 'in-c';
const TARGET = 'in-t';
const EXTRA = 'in-x';
const ABSENT = 'in-gone';
const SETTLE = 400;

// Every core role, classified by what its port does with a conf-change
// proposal; a role added to ROLE without a class fails here.
const PROPOSER_CLASS = Object.freeze({
  proposes: [ROLE_LEADER],
  refusedNotLeader: Object.values(ROLE).filter((role) => role !== ROLE_LEADER),
});
assert.deepEqual([...PROPOSER_CLASS.proposes, ...PROPOSER_CLASS.refusedNotLeader]
  .sort(), Object.values(ROLE).sort(), 'every core role is classified');

function addPeer(identity) {
  return {type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: identity};
}

function removePeer(identity) {
  return {type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
    replicaIdentity: identity};
}

function reserveEverywhere(cluster, identity) {
  for (const member of liveReplicas(cluster)) {
    reserveIdentity(cluster, member, identity);
  }
}

// Each kind leaves a pending configuration index on the leader it returns
// (nothing is ticked after the proposal, so nothing settles).
const PENDING_KINDS = Object.freeze({
  'effective AddNode': ({cluster, leader}) => {
    reserveEverywhere(cluster, EXTRA);
    assert.equal(cluster.node(leader).proposeConfChange(addPeer(EXTRA))
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    return leader;
  },
  'effective RemoveNode': ({cluster, leader}) => {
    const removed = liveReplicas(cluster).find((id) => id !== leader);
    assert.equal(cluster.node(leader).proposeConfChange(removePeer(removed))
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    return leader;
  },
  'no-op RemoveNode (a non-member)': ({cluster, leader}) => {
    reserveEverywhere(cluster, ABSENT);
    assert.equal(cluster.node(leader).proposeConfChange(removePeer(ABSENT))
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    return leader;
  },
  'no-op AddNode (a member)': ({cluster, leader}) => {
    const member = liveReplicas(cluster).find((id) => id !== leader);
    assert.equal(cluster.node(leader).proposeConfChange(addPeer(member))
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    return leader;
  },
  // B holds an entry it does not know committed (its deliveries carry a
  // capped commit index); A hands its leadership to B (under check_quorum
  // the followers ignore any other election while A's lease runs) and is
  // isolated: B's conservative pending index is its last index, above what
  // it applied.
  'post-election conservative index': ({cluster, leader, cap}) => {
    cap.value = durableOf(cluster, B).applied.appliedIndex;
    assert.equal(cluster.node(leader).propose('before-the-election').outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    const lastOf = (id) => durableLog(cluster.replica(id).dbFile,
      PARTITION_ID).at(-1).index;
    assert.ok(settle(cluster, () => lastOf(B) === lastOf(leader), [leader],
      60), 'setup: B holds the leader\'s last entry');
    assert.equal(cluster.node(leader).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: B}).outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.ok(settle(cluster, () => roleOf(cluster, B) === LEADER_ROLE, [],
      40), 'setup: B is elected');
    cluster.isolate(leader);
    cap.value = UNBOUNDED;
    return B;
  },
});

function pendingWorld() {
  const filter = {value: null};
  const cap = {value: UNBOUNDED};
  const cluster = createModelCluster({partitionId: PARTITION_ID,
    founders: [A, B, C], target: B, filter});
  filter.value = prefixFilter(cap, {entries: false});
  assert.ok(settle(cluster, () => leaderOf(cluster) === A &&
    [A, B, C].every((id) => durableOf(cluster, id).applied.appliedIndex > 0),
  [A]), 'setup: A leads and every founder applied an entry');
  return {cluster, cap};
}

for (const [kind, pend] of Object.entries(PENDING_KINDS)) {
  test(`proposal ingress x ${kind}: the leader defers typed, a follower is ` +
    'refused NOT_LEADER naming the leader with nothing forwarded, and the ' +
    'AddNode commits once proposed at the leader after the settlement', () => {
    const {cluster, cap} = pendingWorld();
    try {
      const leader = pend({cluster, leader: A, cap});
      const follower = liveReplicas(cluster).find((id) =>
        id !== leader && roleOf(cluster, id) !== LEADER_ROLE);
      assert.ok(follower, 'setup: a follower');
      assert.ok(PROPOSER_CLASS.refusedNotLeader.includes(
        roleOf(cluster, follower)), 'setup: its role is a refused one');
      reserveEverywhere(cluster, TARGET);
      const lastBefore = durableLog(cluster.replica(leader).dbFile,
        PARTITION_ID).at(-1).index;

      const atLeader = cluster.node(leader).proposeConfChange(addPeer(TARGET));
      assert.equal(atLeader.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
        `the leader defers (${JSON.stringify(atLeader)})`);
      assert.equal(atLeader.reason, RUNTIME_REASON.CONF_CHANGE_PENDING);
      assert.equal(atLeader.retryable, true);

      const atFollower = cluster.node(follower).proposeConfChange(
        addPeer(TARGET));
      assert.equal(atFollower.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        `the follower refuses (${JSON.stringify(atFollower)})`);
      assert.equal(atFollower.reason,
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER);
      assert.equal(atFollower.retryable, true);
      assert.equal(atFollower.leaderReplicaId, leader,
        'the refusal names the leader the follower knows');

      // Nothing was forwarded: the leader's log gains nothing for either
      // proposal, and the crate never replaced one with an empty entry.
      cluster.tickers = [leader];
      cluster.settle(() => false, {rounds: 20});
      const afterProposals = durableLog(cluster.replica(leader).dbFile,
        PARTITION_ID).filter((entry) => entry.index > lastBefore);
      assert.deepEqual(afterProposals.filter((entry) =>
        entry.entryType === WIRE.entryType.EntryNormal &&
        entry.data === null), [], 'no empty entry at the leader');
      const targetPeerId = peerIdIn(cluster, leader, TARGET);
      assert.equal(durableOf(cluster, leader).applied.voters
        .includes(targetPeerId), false, 'the target was not admitted yet');

      // The pending change settles; proposed again at the leader the
      // AddNode is taken and commits.
      assert.ok(settle(cluster, () => cluster.node(leader).proposeConfChange(
        addPeer(TARGET)).outcome === RAFT_OPERATION_OUTCOME.CORE_OK,
      [leader], SETTLE), 'the AddNode is taken at the leader after settling');
      assert.ok(settle(cluster, () => durableOf(cluster, leader).applied
        .voters.includes(targetPeerId), [leader], SETTLE),
      'the target is admitted');
    } finally {
      cluster.dispose();
    }
  });
}

test('proposal ingress (production admission path): a follower\'s ' +
  'remembered NOT_LEADER admission is proposed when it gains leadership, ' +
  'and a removed founder is never re-admitted by the wakes that follow',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['pi-a', 'node-a'], ['pi-b', 'node-b'], ['pi-c', 'node-c']];
  const target = ['pi-t', 'node-t'];
  try {
    await formGroup(harness, founders);
    const leader = harness.leader();
    const created = await createJoinOperation(harness, {target,
      rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
      leaderHint: harness.leaderMember()[1]});
    assert.equal(created.error, undefined, created.error?.message);
    await buildTargetFromOperation(harness, {target,
      operation: created.operation, cache: metadataCache(PARTITION_ID, [])});
    const followerMember = founders.find((member) =>
      harness.services.get(member[0]) !== leader);
    const follower = harness.services.get(followerMember[0]);
    // The target's row reaches the FOLLOWER only: its admission is refused
    // NOT_LEADER by its own role check and remembered.
    harness.caches.get(followerMember[0]).applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(PARTITION_ID, target));
    const targetPeerId = deriveRaftRsPeerId(target[0]);
    const votersOf = (member) => durableAppliedState(harness.dbPathOf(member),
      PARTITION_ID).voters;
    assert.equal(await waitFor(() =>
      votersOf(harness.leaderMember()).includes(targetPeerId), 600), false,
    'a follower admits nothing: the leader never saw the row');

    const transfer = await leader.raft.transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: followerMember[0]});
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: leadership transferred (${JSON.stringify(transfer)})`);
    assert.equal(await waitFor(() => statusOf(follower).role === LEADER_ROLE),
      true, 'setup: the follower leads');
    assert.equal(await waitFor(() =>
      votersOf(followerMember).includes(targetPeerId)), true,
    'the remembered admission is proposed on leadership gain: admitted');

    // A founder retires (its row REMOVING at the new leader): removed, and
    // never re-admitted by the settlements and wakes that follow.
    const retiring = founders.find((member) =>
      member[0] !== followerMember[0]);
    harness.caches.get(followerMember[0]).applySystemTableChange(
      TABLES.SERVICES, CDCOperation.UPDATE,
      {...serviceRow(PARTITION_ID, retiring), status: ReplicaStatus.REMOVING});
    const retiringPeerId = deriveRaftRsPeerId(retiring[0]);
    assert.equal(await waitFor(() =>
      !votersOf(followerMember).includes(retiringPeerId)), true,
    'the retiring founder is removed');
    harness.caches.get(followerMember[0]).applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT,
      serviceRow(PARTITION_ID, [`${PARTITION_ID}-late`, 'node-l']));
    await waitFor(() => false, 500);
    assert.equal(votersOf(followerMember).includes(retiringPeerId), false,
      'no re-admission of the removed founder');
    void addressOf;
  } finally {
    await harness.dispose();
  }
});
