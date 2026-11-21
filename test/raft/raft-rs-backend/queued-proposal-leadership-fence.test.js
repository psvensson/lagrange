// A proposal the rs-raft port QUEUED behind its group's busy turn
// (raft-rs-runtime-owner.js executeCommand: a PROPOSE while the group's turn
// is busy joins group.queuedProposals; drainQueuedProposalBatch later runs
// perform(PROPOSE), which steps every queued inbound envelope first and then
// invokes the core's propose). Nothing compares the leadership the proposal
// was submitted under with the core's at that step, and raft-rs 0.7 forwards a
// follower's proposal to the leader it knows (raft.rs step_follower,
// MsgPropose). The property (owner contract "no fresh placement decision
// authorized by an expired tenure"; record write-kernel-tenure-fence-record.md
// section 7): a proposal submitted to a replica's port while it led at one term
// never enters consensus under another leadership. The write kernel cannot
// hold this line: once it called raft.propose, the bytes belong to the port.
//
// Schedule, on three real rs-raft ports (PartitionNodeCluster): the leader's
// turn is suspended inside a real Ready delivery; a proposal submitted to it
// then is queued behind that turn; the two other replicas elect a successor at
// a higher term while the leader is suspended (their messages wait in its
// inbound queue); the delivery is released and the queued proposal's turn
// runs. Owner of the repair: the raft runtime owner (not edited by this
// witness's writer). Expected RED until the port refuses, at its propose step,
// a proposal whose submitting leadership has ended.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {DELIVERED_TO_PEER, PartitionNodeCluster} from './partition-node-cluster.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

const REPLICAS = Object.freeze(['queued-fence-a', 'queued-fence-b', 'queued-fence-c']);
const WITNESS_COMMAND = 'proposal-submitted-under-the-previous-leadership';
const SUSPEND_ATTEMPTS = 12;
const ELECTION_ROUNDS = 400;
// Enough rounds for the successor's first append and a heartbeat (heartbeat
// interval 5 ticks at the cluster's timing) to wait in the leader's inbound.
const SUCCESSOR_CONTACT_ROUNDS = 12;
const COMMIT_ROUNDS = 200;

function isThenable(value) {
  return value !== null && typeof value?.then === 'function';
}

test('port: a proposal queued behind a busy turn does not enter consensus under the ' +
  'leadership that succeeded the one it was submitted under', async () => {
  const committed = [];
  const suspension = {armed: false, from: null, release: null};
  const cluster = new PartitionNodeCluster({
    partitionId: 'queued-proposal-leadership-fence',
    replicaIds: [...REPLICAS],
    // The suspended envelope is delivered when the send settles, so the
    // delivery is slow rather than lost.
    sendFor: (fromReplicaId, peerAddress, packet) => {
      if (!suspension.armed || fromReplicaId !== suspension.from) return undefined;
      suspension.armed = false;
      return new Promise((resolve) => {
        suspension.release = () => {
          cluster.queue(fromReplicaId, peerAddress, packet);
          resolve(DELIVERED_TO_PEER);
        };
      });
    },
    applyFor: (replicaId, command, {index, term}) => {
      committed.push({replicaId, command, index: Number(index), term: Number(term)});
    },
  });
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
      'setup: the real group elects a leader');
    const leader = cluster.leaderReplicaId();
    const others = REPLICAS.filter((replicaId) => replicaId !== leader);
    const port = cluster.node(leader);
    const submittedTerm = Number(port.readStatus().term);

    suspension.from = leader;
    suspension.armed = true;
    let busy = turnChainValue(port.propose('suspends-the-leader'));
    for (let attempt = 0; attempt < SUSPEND_ATTEMPTS && suspension.release === null;
      attempt += 1) {
      busy = turnChainValue(port.tick());
    }
    assert.equal(typeof suspension.release, 'function',
      'premise: the leader is suspended inside a real Ready delivery');
    const queued = turnChainValue(port.propose(WITNESS_COMMAND));
    assert.equal(isThenable(queued), true,
      'premise: the proposal is queued behind the leader\'s busy turn');

    cluster.tickers = others;
    const successorOf = () => others.find((replicaId) => {
      const status = cluster.node(replicaId).readStatus();
      return status.role === RAFT_ROLE.LEADER && Number(status.term) > submittedTerm;
    }) ?? null;
    assert.equal(cluster.settle(() => successorOf() !== null, {rounds: ELECTION_ROUNDS}), true,
      'premise: a successor is elected at a higher term while the leader is suspended');
    const successor = successorOf();
    cluster.settle(() => false, {rounds: SUCCESSOR_CONTACT_ROUNDS});

    suspension.release();
    await busy;
    const answer = await queued;
    cluster.tickers = [successor];
    cluster.settle(() => committed.some((one) => one.replicaId === successor &&
      one.command === WITNESS_COMMAND), {rounds: COMMIT_ROUNDS});

    const after = port.readStatus();
    const report = JSON.stringify({leader, successor, submittedTerm,
      successorTerm: Number(cluster.node(successor).readStatus().term),
      queuedAnswer: {outcome: answer?.outcome ?? null, reason: answer?.reason ?? null},
      leaderAfter: {role: after.role, term: Number(after.term), leaderId: after.leaderId},
      witnessCommits: committed.filter((one) => one.command === WITNESS_COMMAND)});
    assert.deepEqual(committed.filter((one) => one.command === WITNESS_COMMAND &&
      one.term !== submittedTerm).map((one) => `${one.replicaId}@${one.term}`), [],
    `the proposal submitted while ${leader} led at term ${submittedTerm} entered consensus ` +
      `under another leadership; ${report}`);
  } finally {
    cluster.dispose();
  }
});
