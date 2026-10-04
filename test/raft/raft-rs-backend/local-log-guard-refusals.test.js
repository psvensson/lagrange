// Witness W5 of the local-log guard (raft-rs-local-log-guard.js): each
// refusal individually, on real rs-raft ports and the real WASM core, each
// proving the core's `step` was never entered for the refused envelope (the
// actual-core-entry observer counts no step while only the recipient is
// driven), each recorded against its sender with its typed reason, and the
// recipient still serving afterwards.
//
//   P2  an append carrying an entry at or below the recipient's commit
//       while its own index is not below it;
//   P3  an empty proposal forwarded by a peer;
//   P4  an accepting append response whose index lies beyond the leader's
//       persisted log;
//   P6  a MsgTimeoutNow to a replica below its participation gate.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  envelopeTo,
  formedCluster,
  peerIdsOf,
} from './identity-reuse-harness.js';
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
  RUNTIME_PHASE,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
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
  'is refused before step', async () => {
  const cluster = formedCluster('w5-p2', ['p2-a', 'p2-b', 'p2-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const follower = cluster.node('p2-b').readStatus();
    const commit = String(follower.commitIndex);
    const committedEntry = durableLog(cluster.dbFileOf('p2-b'),
      cluster.partitionId).find((entry) => entry.index === Number(commit));
    const steps = await deliverAlone(cluster, 'p2-b', envelopeTo(
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
    assertRefused(cluster, 'p2-b', ids['p2-a'],
      RAFT_RS_LOCAL_LOG_REFUSAL.APPEND_BELOW_LOCAL_COMMIT, steps);
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
        term: String(gated.term),
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
