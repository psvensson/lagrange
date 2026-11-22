// A proposal enters the core only under the leadership it was submitted
// under (raft-rs-proposal-term.js), and the port's answer when it does not is
// one named refusal: nothing was proposed, the submission's authority is
// gone, the submitter decides again and never re-sends it
// (verify-raft-owner-authority.md C-1, C-2, C-3).
//
//   C-1 a proposal submitted while this replica led term T, whose core leads
//       T+2 at the propose step (deposed and re-elected in the turn's own
//       inbound drain): the answer is the named refusal, never the
//       retryable transfer-in-progress deferral, so a caller that follows
//       the port's deferral path (the write kernel's portDeferralOf:
//       HOST_FAILURE, group usable, transfer or user transaction) re-proposes
//       nothing: no native propose at all.
//   C-2 the same for a configuration change: submitted under T, its step
//       finds the core leading T+2 with an entry of T+2 applied (so the
//       conf-change admission itself would take it): refused by name, never
//       proposed.
//   C-3 a proposal submitted while this replica was an announced candidate,
//       whose turn's drain then wins the election: submitted under no
//       leadership, refused by name, never adopted by the leadership won.
//
// Real: three raft-rs partition ports (PartitionNodeCluster), their runtime
// owner, ingress, local-log guard and SQLite stores. Substituted: the
// transport (in-process inboxes, delivered by the test), the clock (a
// VirtualTimeSource never advanced, so a delivered envelope waits in the
// group's inbound until the next turn drains it) and, in C-1/C-2, the peers'
// envelopes of the re-election: synthesized from the cluster's real raft
// ids, each admitted by the ingress and the local-log guard as a peer's would
// be (a heartbeat of B's at T+1, B's MsgTimeoutNow at T+1, C's vote at T+2,
// and in C-2 C's acknowledgement of the term-start entry).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
// A namespace import, so the witness loads before the refusal's name exists.
import * as PORT_CONTRACT from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {envelopeTo} from './identity-reuse-harness.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const {RAFT_LEADERSHIP_TRANSFER_REASON, RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME} = PORT_CONTRACT;
const REPLICAS = Object.freeze(['psl-a', 'psl-b', 'psl-c']);
const [A, , C] = REPLICAS;
const ROUNDS = 200;
const NATIVE_PROPOSE = 'propose';
const NATIVE_CONF_CHANGE = 'propose_conf_change_v2';
const SUBMITTED_UNDER_T = 'submitted-under-the-leadership-of-term-t';
const SUBMITTED_AS_CANDIDATE = 'submitted-while-an-announced-candidate';
// The port's typed deferrals the write kernel re-proposes on its own clock
// (partition-service-raft-write-commit.js WRITE_DEFERRAL_MESSAGE).
const KERNEL_DEFERRAL_REASONS = Object.freeze([
  RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN,
  RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS,
]);

function newCluster(partitionId) {
  const clock = new VirtualTimeSource({startMs: 0});
  return new PartitionNodeCluster({partitionId, replicaIds: [...REPLICAS],
    substrateFor: () => ({timeSource: clock})});
}

function quiesce(cluster) {
  for (let round = 0; round < ROUNDS; round += 1) {
    if ([...cluster.replicas.values()].every((replica) =>
      replica.inbox.length === 0)) return;
    cluster.deliverAll();
  }
  assert.fail('setup: the cluster did not go quiet');
}

// A leads with an entry of its term applied, and the transport is quiet.
function formedCluster(partitionId) {
  const cluster = newCluster(partitionId);
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true,
    'setup: A leads');
  cluster.propose(A, {setup: partitionId});
  assert.equal(cluster.settle(() => cluster.node(A).readStatus()
    .currentTermApplied === true, {rounds: ROUNDS}), true,
  'setup: A applied an entry of its term');
  quiesce(cluster);
  return cluster;
}

function peerId(cluster, replicaId) {
  return String(cluster.raftPeerIdOf(replicaId));
}

// Hand envelopes to A's port (raft id `a`): queued in its inbound, stepped by
// its next turn. No status read in between: readStatus() drives delivered
// inbound (and the cluster's raftPeerIdOf reads it).
function deliverToInbound(cluster, a, messages) {
  for (const message of messages) {
    const admitted = turnChainValue(cluster.node(A).step(envelopeTo(
      cluster.partitionId, a, message)));
    assert.equal(admitted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: the port admits the envelope (${JSON.stringify(admitted)})`);
  }
}

// What A's next turn steps first: A, leading T, follows B at T+1, campaigns
// on B's MsgTimeoutNow (a transfer's election, candidate at T+2) and wins on
// C's vote; with {acknowledged} C also acknowledges A's term-start entry, so
// A applies an entry of T+2 in the same drain.
function reelectionAtTermPlusTwo(cluster, {acknowledged}) {
  const status = cluster.node(A).readStatus();
  assert.equal(status.role, RAFT_ROLE.LEADER, 'setup: A leads term T');
  const term = BigInt(status.term);
  const [a, b, c] = REPLICAS.map((replicaId) => peerId(cluster, replicaId));
  const messages = [
    {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT, from: b, to: a,
      term: String(term + 1n), commit: String(status.commitIndex)},
    {msgType: RAFT_RS_MESSAGE_TYPE.TIMEOUT_NOW, from: b, to: a,
      term: String(term + 1n)},
    {msgType: RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE, from: c, to: a,
      term: String(term + 2n), reject: false},
  ];
  if (acknowledged) {
    messages.push({msgType: RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE, from: c,
      to: a, term: String(term + 2n),
      index: String(BigInt(status.lastIndex) + 1n), reject: false});
  }
  deliverToInbound(cluster, a, messages);
  // Read without driving: the envelopes wait unstepped, the core leads T.
  const queued = cluster.node(A)[PORT_CONTRACT.RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY]();
  assert.deepEqual([queued.inboundQueued, queued.term], [messages.length, Number(term)],
    `setup: the re-election waits in A's inbound (${JSON.stringify(queued)})`);
  return {term: Number(term)};
}

function nativeEntries(cluster, mark, operation) {
  return cluster.coreEntries.slice(mark).filter((entry) =>
    entry.groupId === cluster.partitionId && entry.operation === operation)
    .length;
}

function isKernelDeferral(answer) {
  return answer?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    answer.recoveryRequired === false &&
    KERNEL_DEFERRAL_REASONS.includes(answer.reason);
}

function refusalSummary(answer) {
  return {outcome: answer?.outcome, reason: answer?.reason,
    retryable: answer?.retryable, recoveryRequired: answer?.recoveryRequired};
}

// The one named refusal: nothing proposed, not a host failure, never re-sent.
function namedRefusal() {
  return {outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: PORT_CONTRACT.RAFT_PROPOSAL_REFUSAL?.SUBMITTING_LEADERSHIP_ENDED,
    retryable: false, recoveryRequired: false};
}

test('C-1: a proposal submitted under term T whose replica leads T+2 at the ' +
  'propose step is refused by name, and the deferral path re-proposes nothing',
async () => {
  const cluster = formedCluster('psl-c1');
  try {
    const {term} = reelectionAtTermPlusTwo(cluster, {acknowledged: false});
    const mark = cluster.coreEntries.length;
    const first = await turnChainValue(cluster.node(A).propose(SUBMITTED_UNDER_T));
    let reproposed = 0;
    if (isKernelDeferral(first)) {
      reproposed += 1;
      await turnChainValue(cluster.node(A).propose(SUBMITTED_UNDER_T));
    }
    const after = cluster.node(A).readStatus();
    const measured = {term, first, reproposed, after: {role: after.role,
      term: after.term}, nativeProposes: nativeEntries(cluster, mark, NATIVE_PROPOSE)};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.deepEqual([after.role, after.term], [RAFT_ROLE.LEADER, term + 2],
      `premise: A was re-elected at T+2 in the proposal's own turn: ${report}`);
    assert.deepEqual({answer: refusalSummary(first), reproposed,
      nativeProposes: measured.nativeProposes},
    {answer: namedRefusal(), reproposed: 0, nativeProposes: 0},
    `the submitting leadership ended: named refusal, nothing proposed: ${report}`);
  } finally {
    cluster.dispose();
  }
});

test('C-2: a configuration change submitted under term T whose replica leads ' +
  'T+2 (its entry applied) at the step is refused by name, never proposed',
async () => {
  const cluster = formedCluster('psl-c2');
  try {
    const {term} = reelectionAtTermPlusTwo(cluster, {acknowledged: true});
    const mark = cluster.coreEntries.length;
    const answer = await turnChainValue(cluster.node(A).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C}));
    const after = cluster.node(A).readStatus();
    const measured = {term, answer, after: {role: after.role, term: after.term,
      currentTermApplied: after.currentTermApplied},
    nativeConfChanges: nativeEntries(cluster, mark, NATIVE_CONF_CHANGE)};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.deepEqual([after.role, after.term, after.currentTermApplied],
      [RAFT_ROLE.LEADER, term + 2, true],
      `premise: A leads T+2 with an entry of T+2 applied: ${report}`);
    assert.deepEqual({answer: refusalSummary(answer),
      nativeConfChanges: measured.nativeConfChanges},
    {answer: namedRefusal(), nativeConfChanges: 0},
    `a configuration change enters only under its submitting leadership: ${report}`);
  } finally {
    cluster.dispose();
  }
});

test('C-3: a proposal submitted while the replica is an announced candidate ' +
  'is refused by name when its turn wins the election', async () => {
  const cluster = newCluster('psl-c3');
  try {
    await turnChainValue(cluster.node(A).campaign());
    for (let round = 0; round < ROUNDS; round += 1) {
      if (cluster.node(A).readStatus().role === RAFT_ROLE.CANDIDATE &&
          cluster.replica(A).inbox.length > 0) break;
      cluster.deliverAll();
    }
    const announced = cluster.node(A).readStatus();
    assert.equal(announced.role, RAFT_ROLE.CANDIDATE,
      'premise: A is an announced candidate holding its votes unstepped');
    const replica = cluster.replica(A);
    for (const envelope of replica.inbox.splice(0)) replica.node.step(envelope);
    const mark = cluster.coreEntries.length;
    const answer = await turnChainValue(cluster.node(A).propose(SUBMITTED_AS_CANDIDATE));
    const after = cluster.node(A).readStatus();
    const measured = {announced: {role: announced.role, term: announced.term},
      answer, after: {role: after.role, term: after.term},
      nativeProposes: nativeEntries(cluster, mark, NATIVE_PROPOSE)};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.deepEqual([after.role, after.term], [RAFT_ROLE.LEADER, announced.term],
      `premise: the proposal's own turn won the candidate's election: ${report}`);
    assert.deepEqual({answer: refusalSummary(answer),
      nativeProposes: measured.nativeProposes},
    {answer: namedRefusal(), nativeProposes: 0},
    `a submission made under no leadership is never adopted: ${report}`);
  } finally {
    cluster.dispose();
  }
});
