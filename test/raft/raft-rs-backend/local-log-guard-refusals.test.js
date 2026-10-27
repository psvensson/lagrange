// Witness W5 of the local-log guard (raft-rs-local-log-guard.js): each
// refusal individually, on real rs-raft ports and the real WASM core, each
// proving the core's `step` was never entered for the refused envelope (the
// actual-core-entry observer counts no step while only the recipient is
// driven), each recorded against its sender with its typed reason, and the
// recipient still serving afterwards. Plus the structured ERROR lines of a
// core trap and of the runtime replacement it causes, which before this
// change reached only the panic hook's raw stderr.
//
//   P2  an append carrying an entry at or below the recipient's commit
//       while its own index is not below it: since entry contiguity is part
//       of the ingress schema (raft-rs-ingress.js), such an append is
//       refused at admission, before the guard and the core;
//   P3  an empty proposal forwarded by a peer;
//   P4  an accepting append response whose index lies beyond the leader's
//       persisted log;
//   P6  a MsgTimeoutNow to a replica below its participation gate.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  capturingErrors,
  envelopeTo,
  formedCluster,
  peerIdsOf,
} from './identity-reuse-harness.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {durableLog} from './committed-membership-oracles.js';
import {
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  PARTICIPATION_GATE,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {
  RAFT_RS_LOCAL_LOG_REFUSAL,
  RUNTIME_FAULT_REPORT,
  RUNTIME_PHASE,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE,
} from '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {
  openedLastIndex,
  persistedLastIndexAfter,
} from '../../../src/raft/raft-rs-local-log-guard.js';

const FORMED_ENTRIES = 6;
const BEYOND = 100n;
const STEP = 'step';

function stepCount(cluster, from) {
  return cluster.coreEntries.slice(from)
    .filter((entry) => entry.operation === STEP).length;
}

function refusalFrom(cluster, replicaId, sender) {
  return cluster.node(replicaId).readStatus().inboundStepRefusals
    .find((record) => record.from === sender) ?? null;
}

// Deliver one envelope to one port and drain it with that port's own turn;
// no other replica is driven, so every core step observed is the
// recipient's.
async function deliverAlone(cluster, replicaId, envelope) {
  const before = cluster.coreEntries.length;
  const accepted = await cluster.node(replicaId).step(envelope);
  assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the envelope passes routing and schema admission');
  await cluster.node(replicaId).tick();
  return stepCount(cluster, before);
}

function assertRefused(cluster, replicaId, sender, reason, steps) {
  assert.equal(steps, 0, `the core stepped the refused ${reason} envelope`);
  const record = refusalFrom(cluster, replicaId, sender);
  assert.equal(record?.reason, reason,
    `no ${reason} refusal recorded: ${JSON.stringify(record)}`);
  assert.equal(record.phase, RUNTIME_PHASE.LOCAL_LOG_GUARD);
  assert.equal(record.refusalCount, 1);
}

function stillCommits(cluster, leader, followers) {
  const before = Number(cluster.node(leader).readStatus().commitIndex);
  cluster.propose(leader, {op: 'after-the-refusal'});
  cluster.tickers = [leader];
  return cluster.settle(() => [leader, ...followers].every((replicaId) =>
    Number(cluster.node(replicaId).readStatus().commitIndex) > before),
  {rounds: 200});
}

test('W5 P2: an append carrying an entry at or below the follower commit ' +
  'is refused at admission, before step', async () => {
  const cluster = formedCluster('w5-p2', ['p2-a', 'p2-b', 'p2-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const follower = cluster.node('p2-b').readStatus();
    const commit = String(follower.commitIndex);
    const committedEntry = durableLog(cluster.dbFileOf('p2-b'),
      cluster.partitionId).find((entry) => entry.index === Number(commit));
    const before = cluster.coreEntries.length;
    const admitted = await cluster.node('p2-b').step(envelopeTo(
      cluster.partitionId, ids['p2-b'], {
        msgType: RAFT_RS_MESSAGE_TYPE.APPEND,
        from: ids['p2-a'],
        term: String(follower.term),
        index: commit,
        logTerm: String(committedEntry.term),
        commit,
        entries: [{index: commit, term: String(follower.term + 1),
          entryType: RAFT_RS_ENTRY_TYPE.NORMAL}],
      }));
    await cluster.node('p2-b').tick();
    assert.equal(admitted.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(admitted.reason,
      RAFT_RS_INGRESS_REFUSAL.NON_CONTIGUOUS_ENTRIES);
    assert.equal(stepCount(cluster, before), 0,
      'the core stepped the refused append');
    assert.ok(stillCommits(cluster, 'p2-a', ['p2-b', 'p2-c']));
  } finally {
    cluster.dispose();
  }
});

test('W5 P3: an empty proposal forwarded by a peer is refused before step',
  async () => {
    const cluster = formedCluster('w5-p3', ['p3-a', 'p3-b', 'p3-c'],
      FORMED_ENTRIES);
    try {
      const ids = peerIdsOf(cluster);
      const steps = await deliverAlone(cluster, 'p3-a', envelopeTo(
        cluster.partitionId, ids['p3-a'], {
          msgType: RAFT_RS_MESSAGE_TYPE.PROPOSE,
          from: ids['p3-b'],
          entries: [],
        }));
      assertRefused(cluster, 'p3-a', ids['p3-b'],
        RAFT_RS_LOCAL_LOG_REFUSAL.EMPTY_FORWARDED_PROPOSAL, steps);
      assert.ok(stillCommits(cluster, 'p3-a', ['p3-b', 'p3-c']));
    } finally {
      cluster.dispose();
    }
  });

test('W5 P4: an accepting append response beyond the leader log is ' +
  'refused before step; replication to that follower is not skipped',
async () => {
  const cluster = formedCluster('w5-p4', ['p4-a', 'p4-b', 'p4-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const leader = cluster.node('p4-a').readStatus();
    const beyond = String(BigInt(leader.commitIndex) + BEYOND);
    const steps = await deliverAlone(cluster, 'p4-a', envelopeTo(
      cluster.partitionId, ids['p4-a'], {
        msgType: RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE,
        from: ids['p4-c'],
        term: String(leader.term),
        index: beyond,
        commit: '0',
        logTerm: '0',
        reject: false,
      }));
    assertRefused(cluster, 'p4-a', ids['p4-c'],
      RAFT_RS_LOCAL_LOG_REFUSAL.APPEND_RESPONSE_BEYOND_LOCAL_LOG, steps);
    assert.ok(cluster.node('p4-a').readStatus()
      .followerProgress[cluster.addressOf('p4-c')] < Number(beyond),
    'the follower\'s matched moved past the leader log');
    assert.ok(stillCommits(cluster, 'p4-a', ['p4-b', 'p4-c']));
  } finally {
    cluster.dispose();
  }
});

test('W5 P6: a MsgTimeoutNow to a replica below its participation gate is ' +
  'refused before step; it does not campaign', async () => {
  const cluster = formedCluster('w5-p6', ['p6-a', 'p6-b', 'p6-c'],
    FORMED_ENTRIES);
  try {
    const stamp = cluster.node('p6-a')[RAFT_OPERATION
      .READ_COMMITTED_MEMBERSHIP]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    cluster.addReplica('p6-t', ['p6-a', 'p6-b', 'p6-c'], {
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
    const gated = cluster.node('p6-t').readStatus();
    assert.equal(gated.gateOpen, false, 'setup: the joiner is below its gate');
    const ids = peerIdsOf(cluster);
    const steps = await deliverAlone(cluster, 'p6-t', envelopeTo(
      cluster.partitionId, ids['p6-t'], {
        msgType: RAFT_RS_MESSAGE_TYPE.TIMEOUT_NOW,
        from: ids['p6-a'],
        // A leader sends it at its own term (raft.rs send()); the joiner
        // below its gate may not have taken a term yet.
        term: String(cluster.node('p6-a').readStatus().term),
      }));
    assertRefused(cluster, 'p6-t', ids['p6-a'],
      PARTICIPATION_GATE.GATE_CLOSED, steps);
    const after = cluster.node('p6-t').readStatus();
    assert.equal(after.term, gated.term, 'the gated replica campaigned');
    assert.notEqual(after.role, 'candidate');
  } finally {
    cluster.dispose();
  }
});

test('a core trap and the runtime replacement it causes each write one ' +
  'ERROR line naming the group, the peer and the reason', async () => {
  const cluster = formedCluster('trap-log', ['tl-a', 'tl-b', 'tl-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const victim = cluster.node('tl-b').readStatus();
    let trapped = null;
    const errors = await capturingErrors(async () => {
      await cluster.node('tl-b').step(coreTrappingAppend({
        dbFile: cluster.dbFileOf('tl-b'), groupId: cluster.partitionId,
        status: victim, from: ids['tl-a'], term: String(victim.term)}));
      trapped = await cluster.node('tl-b').tick();
      cluster.node('tl-a').readStatus();
    });
    assert.equal(trapped.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL);
    const traps = errors.filter(({context}) =>
      context.report === RUNTIME_FAULT_REPORT.CORE_TRAPPED);
    assert.equal(traps.length, 1, JSON.stringify(errors));
    assert.equal(traps[0].context.groupId, cluster.partitionId);
    assert.equal(traps[0].context.replicaIdentity, 'tl-b');
    assert.equal(traps[0].context.operation, STEP);
    assert.equal(traps[0].context.from, ids['tl-a']);
    assert.equal(traps[0].context.msgType, RAFT_RS_MESSAGE_TYPE.APPEND);
    assert.equal(typeof traps[0].context.reason, 'string');
    const replaced = errors.filter(({context}) =>
      context.report === RUNTIME_FAULT_REPORT.RUNTIME_REPLACED);
    assert.equal(replaced.length, 1, JSON.stringify(errors));
    assert.equal(replaced[0].context.groupsRestored, 3);
    assert.equal(replaced[0].context.failure, null);
  } finally {
    cluster.dispose();
  }
});

// The bound the guard compares against is SET, never only advanced: a
// follower's uncommitted suffix can be replaced by a shorter one, and a
// snapshot resets the log (verification V2).
test('the persisted last index is set by each persist, reset by a ' +
  'snapshot, and opened from the record', () => {
  assert.equal(persistedLastIndexAfter(10n,
    {entries: [{index: '6'}, {index: '7'}]}), 7n,
  'an append that replaced a longer suffix moves the bound down');
  assert.equal(persistedLastIndexAfter(7n,
    {entries: [{index: '8'}, {index: '9'}]}), 9n);
  assert.equal(persistedLastIndexAfter(9n,
    {snapshot: {metadata: {index: '40'}}}), 40n,
  'a snapshot with no entries sets the bound to its index');
  assert.equal(persistedLastIndexAfter(9n,
    {snapshot: {metadata: {index: '40'}}, entries: [{index: '41'}]}), 41n);
  assert.equal(persistedLastIndexAfter(9n, {hardState: {term: '2'}}), 9n,
    'a Ready that wrote no entry and no snapshot leaves it');
  assert.equal(openedLastIndex(null), 0n, 'a created group holds no entry');
  assert.equal(openedLastIndex({entries: [{index: '3'}, {index: '12'}],
    snapshot: null}), 12n);
  assert.equal(openedLastIndex({entries: [],
    snapshot: {metadata: {index: '30'}}}), 30n);
});

// The ERROR lines of refusals are bounded per (group, reason) whatever the
// unauthenticated sender claims (the verifier's T2: 50 lines for 50
// alternating-reason messages, and for 50 spoofed senders); the per-sender
// record still counts every refusal.
const FLOOD = 50;
const LINES_PER_REASON_BOUND = Math.floor(Math.log2(FLOOD)) + 1;

async function floodLines(cluster, replicaId, messageAt) {
  const lines = await capturingErrors(async () => {
    for (let index = 0; index < FLOOD; index += 1) {
      await cluster.node(replicaId).step(envelopeTo(cluster.partitionId,
        cluster.node(replicaId).readStatus().peerId, messageAt(index)));
      await cluster.node(replicaId).tick();
      // The group's own traffic keeps flowing: with check_quorum a leader
      // that hears no quorum for an election timeout steps down.
      cluster.deliverAll();
    }
  });
  return lines.filter(({context}) =>
    context.report === RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED);
}

test('refusal ERROR lines are rate limited per group and reason: one ' +
  'sender alternating two reasons, and many spoofed senders', async () => {
  const cluster = formedCluster('w5-rate', ['rt-a', 'rt-b', 'rt-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const leader = cluster.node('rt-a').readStatus();
    const beyond = String(BigInt(leader.commitIndex) + BEYOND);
    const alternating = await floodLines(cluster, 'rt-a', (index) =>
      index % 2 === 0 ?
        {msgType: RAFT_RS_MESSAGE_TYPE.PROPOSE, from: ids['rt-b'],
          entries: []} :
        {msgType: RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE, from: ids['rt-b'],
          term: String(leader.term), index: beyond, reject: false});
    assert.ok(alternating.length <= 2 * LINES_PER_REASON_BOUND,
      `${alternating.length} lines for ${FLOOD} alternating refusals`);
    assert.equal(refusalFrom(cluster, 'rt-a', ids['rt-b']).refusalCount,
      FLOOD, 'the per-sender record no longer counts every refusal');
    const spoofed = await floodLines(cluster, 'rt-a', (index) => ({
      msgType: RAFT_RS_MESSAGE_TYPE.PROPOSE, from: String(1000 + index),
      entries: []}));
    assert.ok(spoofed.length <= LINES_PER_REASON_BOUND,
      `${spoofed.length} lines for ${FLOOD} spoofed senders`);
    const last = spoofed.at(-1).context;
    assert.equal(last.reason,
      RAFT_RS_LOCAL_LOG_REFUSAL.EMPTY_FORWARDED_PROPOSAL);
    assert.ok(last.occurrences > FLOOD / 2,
      `the summary does not count the refusals: ${last.occurrences}`);
    assert.equal(cluster.node('rt-a').readStatus().role, 'leader');
  } finally {
    cluster.dispose();
  }
});
