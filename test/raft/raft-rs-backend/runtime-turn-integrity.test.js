// Runtime turn integrity of the rs-raft runtime owner (quest F1, amendment 1,
// owner decision 1: CA1 and CA5).
//
// Frozen claim: a decision made while relevant raft messages are already
// pending produces the same externally relevant result as the same decision
// made after those messages were processed first. A turn drains the envelopes
// delivered to the group, then runs its command. So:
//
// - CA1. When the core refuses a delivered envelope, that refusal is the
//   envelope's outcome, never the command's answer. raft-rs refuses a
//   response from a sender that has no progress at the receiver
//   (raw_node.rs `step`, StepPeerNotFound) and a MsgPropose that a leader
//   with a transfer in progress drops (raft.rs step_leader). The refusal is
//   recorded against its sender and dropped. The rest of the delivered
//   envelopes are stepped in the same turn (M9: none is stranded until the
//   next tick), and the command runs on the state they leave.
// - CA5. An announcement of a role change never processes messages inside
//   itself. A role listener that reads status, as the partition's wiring
//   does, answers from the announced state, and the turn keeps draining. So
//   after the turn, the projection a subscriber builds from the event stream
//   equals the core's own status.
//
// Every pending-then-decide answer is compared with the processed-first
// answer of an identical cluster. Message types are read from the binding's
// own num_to_msg_type match arm, and a refusal's phase is one of the core
// primitives the binding exposes.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CORE_PRIMITIVES} from
  '../../../src/raft/raft-rs-core-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_SOURCE = path.join(
  ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const REPLICAS = Object.freeze(['turn-a', 'turn-b', 'turn-c']);
const [A, B, C] = REPLICAS;
const PENDING = 'pending';
const PROCESSED = 'processed';

// The binding's own message-type numbers, by raft-rs name.
function messageTypes() {
  const source = fs.readFileSync(BINDING_SOURCE, 'utf8');
  return Object.fromEntries([...source.matchAll(
    /(\d+)\s*=>\s*(Msg\w+)\s*,/gu)].map(([, number, name]) =>
    [name, Number(number)]));
}
const MESSAGE_TYPE = messageTypes();

function formedCluster(partitionId) {
  const cluster = new PartitionNodeCluster({partitionId, replicaIds: REPLICAS});
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true,
    'setup: A leads');
  cluster.propose(A, {setup: partitionId});
  assert.equal(cluster.settle(() => REPLICAS.every((replicaId) =>
    cluster.replica(replicaId).appliedCommands.length === 1)), true,
  'setup: a write commits everywhere');
  quiesce(cluster);
  return cluster;
}

// Everything the transport holds for a replica, taken out of its inbox.
function takeInbox(cluster, replicaId) {
  return cluster.replica(replicaId).inbox.splice(0);
}

// A replica processes what it was sent, through its own turn (a status read
// drains delivered envelopes and never ticks).
function processAt(cluster, replicaId) {
  for (const envelope of takeInbox(cluster, replicaId)) {
    cluster.node(replicaId).step(envelope);
  }
  return cluster.node(replicaId).readStatus();
}

// Process every inbox, without ticks, until the transport holds nothing.
function quiesce(cluster) {
  for (let round = 0; round < REPLICAS.length * 4; round += 1) {
    if (REPLICAS.every((replicaId) =>
      cluster.replica(replicaId).inbox.length === 0)) {
      return;
    }
    for (const replicaId of REPLICAS) {
      processAt(cluster, replicaId);
    }
  }
  assert.fail('setup: the cluster quiesces');
}

// Hand envelopes to a replica's port without letting any turn run.
function deliverPending(cluster, replicaId, envelopes) {
  for (const envelope of envelopes) {
    const admitted = cluster.node(replicaId).step(envelope);
    assert.equal(admitted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'setup: the port admits the delivered envelope');
  }
}

// The PROCESSED run processes the pending envelopes in their own turn first;
// the status that turn answers must be a status, never a refusal.
function processFirst(cluster, replicaId) {
  const drained = cluster.node(replicaId).readStatus();
  assert.equal(drained.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `the processing turn answers a status (${JSON.stringify(drained)})`);
  assert.equal(typeof drained.role, 'string', 'with a role');
  return drained;
}

// Runs one scenario in both modes on identical clusters and returns both.
async function pendingAgainstProcessed(name, scenario) {
  const results = {};
  for (const mode of [PENDING, PROCESSED]) {
    const cluster = formedCluster(`${name}-${mode}`);
    try {
      const envelopes = await scenario.pending(cluster);
      deliverPending(cluster, A, envelopes);
      if (mode === PROCESSED) {
        processFirst(cluster, A);
      }
      const answer = await scenario.decide(cluster);
      if (mode === PENDING) {
        // The raft-rs answer the decision has on the drained state; checked
        // before any reference run, so the pending side stands on its own.
        scenario.anchor(answer);
      }
      results[mode] = {answer, status: cluster.node(A).readStatus()};
    } finally {
      cluster.dispose();
    }
  }
  return results;
}

function refusalFrom(status, sender) {
  return status.inboundStepRefusals.find((refusal) =>
    refusal.from === sender) ?? null;
}

// A has removed C and committed it; C's acknowledgement of the removal then
// reaches A, which no longer holds progress for C.
async function removedPeerAcknowledgementPending(cluster) {
  cluster.node(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: C});
  processAt(cluster, B);
  processAt(cluster, C);
  const envelopes = takeInbox(cluster, A);
  assert.deepEqual(envelopes.map((envelope) => envelope.message.msgType),
    [MESSAGE_TYPE.MsgAppendResponse, MESSAGE_TYPE.MsgAppendResponse],
    'setup: B\'s and C\'s acknowledgements are pending at A');
  return envelopes;
}

test('CA1: a pending response the core refuses (peer not found) never ' +
  'answers a named transfer; the transfer is decided on the drained state',
async () => {
  const cSenderIds = {};
  const results = await pendingAgainstProcessed('ca1-peer-not-found', {
    pending: async (cluster) => {
      cSenderIds[cluster.partitionId] = cluster.raftPeerIdOf(C);
      return removedPeerAcknowledgementPending(cluster);
    },
    decide: (cluster) => cluster.node(A).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: B,
    }),
    anchor: (answer) => assert.equal(answer.outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
      `the leader decides the transfer to its voter B (${JSON.stringify(
        answer)})`),
  });
  assert.deepEqual(results[PENDING].answer, results[PROCESSED].answer,
    'the pending run answers what the processed-first run answers');
  assert.equal(results[PENDING].answer.outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'the transfer itself was decided');
  const [cId] = Object.values(cSenderIds);
  const refusal = refusalFrom(results[PENDING].status, cId);
  assert.ok(refusal, 'the refused acknowledgement is recorded against C');
  assert.equal(refusal.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  assert.ok(RAFT_RS_CORE_PRIMITIVES.includes(refusal.phase),
    'the refusal carries the core primitive that refused it');
  assert.equal(refusal.msgType, MESSAGE_TYPE.MsgAppendResponse);
});

test('CA1: a pending response the core refuses never answers a proposal',
  async () => {
    const results = await pendingAgainstProcessed('ca1-peer-not-found-propose', {
      pending: removedPeerAcknowledgementPending,
      decide: (cluster) => cluster.node(A).propose({after: 'removal'}),
      anchor: (answer) => assert.equal(answer.outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
        `the leader appends its proposal (${JSON.stringify(answer)})`),
    });
    assert.deepEqual(results[PENDING].answer, results[PROCESSED].answer);
    assert.equal(results[PENDING].answer.outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK, 'the proposal was made');
  });

test('CA1: a forwarded proposal the transferring leader drops never answers ' +
  'the leader\'s own proposal, which is the retryable in-progress outcome',
async () => {
  const bSenderIds = [];
  const results = await pendingAgainstProcessed('ca1-forwarded-propose', {
    pending: async (cluster) => {
      cluster.isolate(C);
      const accepted = await cluster.node(A).transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: C,
      });
      assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        'setup: A runs a transfer to the cut-off C');
      const forwarded = await cluster.node(B).propose({forwardedBy: B});
      assert.equal(forwarded.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
        'setup: B forwards its proposal to its leader');
      bSenderIds.push(cluster.raftPeerIdOf(B));
      const envelopes = takeInbox(cluster, A);
      assert.deepEqual(envelopes.map((envelope) =>
        envelope.message.msgType), [MESSAGE_TYPE.MsgPropose],
      'setup: B\'s forwarded proposal is pending at A');
      return envelopes;
    },
    decide: (cluster) => cluster.node(A).propose({own: A}),
    anchor: (answer) => assert.equal(
      answer.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
      answer.retryable === true && answer.recoveryRequired === false, true,
      'a leader with a transfer in progress drops the proposal: the ' +
      `retryable in-progress outcome (${JSON.stringify(answer)})`),
  });
  assert.deepEqual(results[PENDING].answer, results[PROCESSED].answer,
    'the pending run answers what the processed-first run answers');
  assert.equal(results[PENDING].answer.outcome,
    RAFT_OPERATION_OUTCOME.HOST_FAILURE);
  assert.equal(results[PENDING].answer.retryable, true,
    'a proposal during the transfer window is retryable, never the ' +
    'forwarded proposal\'s raw refusal');
  assert.equal(results[PENDING].answer.recoveryRequired, false);
  const refusal = refusalFrom(results[PENDING].status, bSenderIds[0]);
  assert.equal(refusal?.msgType, MESSAGE_TYPE.MsgPropose,
    'the dropped forwarded proposal is recorded against B');
});

test('CA1 / M9: the envelopes after a refused one are stepped in the same ' +
  'turn, not stranded until the next tick', async () => {
  const cluster = formedCluster('ca1-tail-not-stranded');
  try {
    const [bAcknowledgement, refused] =
      await removedPeerAcknowledgementPending(cluster);
    // A commits and applies C's removal on B's acknowledgement alone.
    deliverPending(cluster, A, [bAcknowledgement]);
    processFirst(cluster, A);
    // A forwarded proposal of B's, delivered after a response of C's that A
    // (which removed C) refuses.
    await cluster.node(B).propose({afterRefused: true});
    const [forwarded] = takeInbox(cluster, A);
    assert.equal(forwarded?.message.msgType, MESSAGE_TYPE.MsgPropose,
      'setup: B\'s forwarded proposal');
    takeInbox(cluster, B);
    deliverPending(cluster, A, [refused, forwarded]);
    const answered = cluster.node(A).readStatus();
    assert.equal(answered.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the turn answers its own read (${JSON.stringify(answered)})`);
    const appends = cluster.replica(B).inbox.filter((envelope) =>
      envelope.message.msgType === MESSAGE_TYPE.MsgAppend &&
      (envelope.message.entries || []).length > 0);
    assert.ok(appends.length > 0,
      'in that same turn A appended B\'s proposal and sent it to B');
  } finally {
    cluster.dispose();
  }
});

test('CA5: with [MsgRequestVote, MsgAppend] pending, the event stream after ' +
  'the turn matches the core, even when role listeners read status',
async () => {
  const cluster = formedCluster('ca5-nested-announce');
  try {
    const port = cluster.node(A);
    const projection = {};
    const listenerReads = [];
    const listenerCommands = [];
    let outerTurnReturned = false;
    for (const role of [RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER,
      RAFT_EVENT.CANDIDATE]) {
      port.subscribe(role, () => {
        projection.role = role;
        // What the partition's wiring does inside every role event.
        listenerReads.push(port.readStatus());
        // A command asked inside the announcement (hypothesis 2): it must
        // queue behind the turn, never run nested inside it.
        const asked = port.probePeerProgress('no-such-peer-address');
        listenerCommands.push({
          queued: typeof asked?.then === 'function',
          ranAfterTurn: Promise.resolve(asked).then(() => outerTurnReturned),
        });
      });
    }
    port.subscribe(RAFT_EVENT.TERM_CHANGE, (term) => {
      projection.term = term;
    });
    port.subscribe(RAFT_EVENT.LEADER_CHANGE, (leaderId) => {
      projection.leaderId = leaderId;
    });
    await cluster.node(B).campaign();
    processAt(cluster, C);
    processAt(cluster, B);
    const envelopes = takeInbox(cluster, A);
    assert.deepEqual(envelopes.map((envelope) => envelope.message.msgType),
      [MESSAGE_TYPE.MsgRequestVote, MESSAGE_TYPE.MsgAppend],
      'setup: B\'s vote request and B\'s first append are pending at A');
    deliverPending(cluster, A, envelopes);
    const turn = port.readStatus();
    outerTurnReturned = true;
    await turn;
    const core = port.readStatus();
    assert.equal(core.leaderId, B, 'the core follows B');
    assert.deepEqual(projection, {role: core.role, term: core.term,
      leaderId: core.leaderId},
    'the subscriber projection equals the core after the turn');
    assert.ok(listenerReads.length > 0, 'a role listener read status');
    assert.ok(listenerReads.every((read) =>
      read.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
      read.role === RAFT_EVENT.FOLLOWER),
    'each in-announcement read answered the announced state');
    assert.ok(listenerCommands.length > 0 && listenerCommands.every(
      (command) => command.queued), 'a command asked inside the ' +
      'announcement was queued, not run nested in the turn');
    assert.deepEqual(await Promise.all(listenerCommands.map((command) =>
      command.ranAfterTurn)), listenerCommands.map(() => true),
    'and it ran only after the turn that announced');
  } finally {
    cluster.dispose();
  }
});
