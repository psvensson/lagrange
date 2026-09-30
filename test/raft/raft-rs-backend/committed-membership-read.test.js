// T1 witness (owner decision O1, committed-read amendment 1, section 3.1):
// the operation port answers the committed-membership read as frozen data,
// never a handle, from the runtime owner's recorded observation; every
// refusal is typed from the one refusal enumeration.
//
// Oracles are the durable bytes on connections of the test's own: the
// applied-state row (configuration and applied index), the identity
// reservations, and the binding's own ConfChangeTransition numbers. Nothing
// expected is read from the answer's own implementation.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  bindingWireNumbers,
  durableAppliedState,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {RAFT_OPERATION_PORT_METHODS} from
  '../../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION} from
  '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_FIELD,
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';

const PARTITION_ID = 'committed-read-partition';
const FOUNDING = Object.freeze(['read-a', 'read-b', 'read-c']);
const SETTLE_ROUNDS = 400;
const READ = RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP;
const REFUSALS = new Set(Object.values(COMMITTED_MEMBERSHIP_REFUSAL));

function electedCluster() {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID, replicaIds: FOUNDING});
  cluster.tickers = [FOUNDING[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), 'setup: the partition elects a leader');
  return cluster;
}

function committedWrite(cluster, leader, command) {
  cluster.propose(leader, command);
  assert.ok(cluster.settle(() => FOUNDING.every((replicaId) =>
    cluster.replica(replicaId).appliedCommands.includes(command)),
  {rounds: SETTLE_ROUNDS}), 'setup: every replica applied the write');
}

// Every own value of the answer, recursively: frozen, and data only.
function assertFrozenData(value, where = 'answer') {
  assert.notEqual(typeof value, 'function', `${where} is data, not a handle`);
  if (value === null || typeof value !== 'object') {
    return;
  }
  assert.equal(Object.isFrozen(value), true, `${where} is frozen`);
  for (const key of Reflect.ownKeys(value)) {
    assertFrozenData(value[key], `${where}.${String(key)}`);
  }
}

function assertRefusal(answer, reason) {
  assert.equal(answer.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
    `refused (${JSON.stringify(answer)})`);
  assert.ok(REFUSALS.has(answer.reason),
    `the reason ${answer.reason} is a member of the refusal enumeration`);
  assert.equal(answer.reason, reason);
  assertFrozenData(answer);
}

test('T1: the port lists the committed-membership read beside its other ' +
  'operations', () => {
  assert.ok(RAFT_OPERATION_PORT_METHODS.includes(READ),
    'the frozen operation-port method list names the read');
});

test('T1: the leader answers the committed configuration as frozen data, ' +
  'labelled with the applied index of its own durable record', () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    committedWrite(cluster, leader, 'labelled-write');
    const answer = cluster.node(leader)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    assert.equal(answer.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
      `the leader answers (${JSON.stringify(answer)})`);
    assertFrozenData(answer);
    assert.deepEqual(Object.keys(answer).sort(),
      Object.values(COMMITTED_MEMBERSHIP_ANSWER_FIELD).sort(),
      'the answer carries exactly the contract fields');
    const durable = durableAppliedState(
      cluster.replica(leader).dbFile, PARTITION_ID);
    assert.deepEqual([...answer.voters].sort(), durable.voters,
      'voters are the durable applied configuration');
    assert.deepEqual(answer.votersOutgoing, durable.votersOutgoing);
    assert.deepEqual([...answer.learners].sort(), durable.learners);
    assert.equal(answer.appliedIndex, durable.appliedIndex,
      'appliedIndex is the durable applied index of the answered ' +
        'configuration');
    const reserved = reservedIdentities(cluster.replica(leader).dbFile);
    for (const voter of answer.voters) {
      assert.equal(answer.identities[voter], reserved.get(voter),
        `the identity of ${voter} is the leader's own reservation`);
    }
    assert.equal(answer.gateOpen, true, 'a founding leader is admitted');
  } finally {
    cluster.dispose();
  }
});

test('T1: a follower refuses a bootstrap read NOT_LEADER with the leader ' +
  'address, and answers a witness read with its own configuration', () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    committedWrite(cluster, leader, 'follower-write');
    const follower = FOUNDING.find((replicaId) => replicaId !== leader);
    const refused = cluster.node(follower)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    assertRefusal(refused, COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER);
    assert.equal(refused.leaderAddress, cluster.addressOf(leader),
      'the refusal names the leader the follower resolves');
    const witnessed = cluster.node(follower)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
    assert.equal(witnessed.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    const durable = durableAppliedState(
      cluster.replica(follower).dbFile, PARTITION_ID);
    assert.deepEqual([...witnessed.voters].sort(), durable.voters);
    assert.equal(witnessed.appliedIndex, durable.appliedIndex);
  } finally {
    cluster.dispose();
  }
});

test('T1: a joint configuration is refused to a bootstrap read and ' +
  'answered, outgoing voters included, to a witness read', () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    const leaving = FOUNDING.find((replicaId) => replicaId !== leader);
    const wire = bindingWireNumbers();
    cluster.proposeConfigurationChange([{
      changeType: wire.changeType.RemoveNode,
      nodeId: cluster.raftPeerIdOf(leaving),
    }], wire.transition.Explicit, leader);
    assert.ok(cluster.settle(() =>
      cluster.coreConfState(leader).votersOutgoing.length > 0,
    {rounds: SETTLE_ROUNDS}), 'setup: the leader applied a joint ' +
      'configuration');
    assertRefusal(cluster.node(leader)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}),
    COMMITTED_MEMBERSHIP_REFUSAL.JOINT);
    const witnessed = cluster.node(leader)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
    assert.equal(witnessed.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    assert.deepEqual([...witnessed.votersOutgoing].sort(),
      durableAppliedState(cluster.replica(leader).dbFile, PARTITION_ID)
        .votersOutgoing, 'the outgoing voters are the durable ones');
  } finally {
    cluster.dispose();
  }
});

test('T1: a closed port refuses the read typed, never throws', () => {
  const cluster = electedCluster();
  try {
    const leader = cluster.leaderReplicaId();
    const port = cluster.node(leader);
    port.close();
    assertRefusal(port[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}),
    COMMITTED_MEMBERSHIP_REFUSAL.HELD);
  } finally {
    cluster.dispose();
  }
});
