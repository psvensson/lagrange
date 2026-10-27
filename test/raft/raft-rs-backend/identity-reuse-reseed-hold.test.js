// Witnesses W1, W2, W3 and W6 of the identity-reuse safety fix (the
// cutover quest, design-raft-identity A1 with its
// verification's corrections): a replica identity re-opened empty under a
// GENESIS stamp while the leader still holds its progress - the shape a
// message-group MOVE_REPLICA produced - is held for a reseed by the first
// leader heartbeat that proves its history lost, durably, and never takes
// part again.
//
// Real rs-raft ports on the real WASM core (PartitionNodeCluster). Every
// verdict is a state or a count: the port's answer, the durable lifecycle
// row and hard state read on a connection of the test's own, the core-entry
// observer's create_node count (a runtime replacement re-creates every
// group), and each port's reported role and term. No wall time.
//
//   W1  the trap: the leader's heartbeat (commit = the stale matched) reaches
//       the empty incarnation. Before: the shared core traps and every group
//       on the node is re-created. After: no trap and no replacement; the
//       group is held reseed-required, durably; the leader, the other
//       follower and an unrelated group keep committing; one ERROR line
//       names the group, the sender, the message type and the reason.
//   W2  no second leader (verification S3, S2): with both moved identities
//       held, neither campaigns nor grants a vote; with the seed cut off no
//       leader is elected below its commit; after healing no leader other
//       than the seed at term 1 ever exists and the committed log is intact
//       (with two of three held the seed has no quorum: check_quorum steps
//       it down, and pre-vote keeps its term at 1 - nothing can commit
//       without a quorum, so no leader is the correct state).
//   W3  liveness of the guard (S5/S6): held replicas never depose the
//       legitimate leader - no term inflation while every replica ticks
//       (one held: the leader keeps its quorum and leads; two held: it has
//       none, steps down under check_quorum, and still no term moves).
//   W6  durability: the held replica restarted from the same file is still
//       held and still does not vote.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  capturingErrors,
  envelopeTo,
  formedCluster,
  hardStateOf,
  leadersByTerm,
  lifecycleRow,
  peerIdsOf,
  reopenEmpty,
} from './identity-reuse-harness.js';
import {durableLog} from './committed-membership-oracles.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_RS_LOCAL_LOG_REFUSAL,
  RUNTIME_FAULT_REPORT,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';

const RESEED_REQUIRED = COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED;
const FORMED_ENTRIES = 20;
const HEARTBEAT_ROUNDS = 12;
const ISOLATED_ROUNDS = 200;
const ALL_TICK_ROUNDS = 150;
const RETIRED_FOR_RESEED = Object.freeze({
  state: 'retired', reason: RESEED_REQUIRED});

// Every leader any port reports is `seed` at `term`, and `seed` is still at
// `term`: no other identity led and no term moved (with a quorum held the
// seed itself may have stepped down under check_quorum).
function assertOnlySeedLed(cluster, seed, term) {
  for (const [replicaId, leaderTerm] of leadersByTerm(cluster)) {
    assert.deepEqual([replicaId, leaderTerm], [seed, term]);
  }
  assert.equal(cluster.node(seed).readStatus().term, term,
    `${seed}'s term moved`);
}

function assertHeld(cluster, replicaId) {
  const answer = cluster.node(replicaId).readStatus();
  assert.equal(answer.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    `${replicaId} still answers a status as a running replica`);
  assert.equal(answer.reason, RESEED_REQUIRED);
  assert.deepEqual({...lifecycleRow(cluster, replicaId)}, RETIRED_FOR_RESEED,
    `${replicaId}'s hold is not durable`);
}

function createNodeCount(cluster, from) {
  return cluster.coreEntries.slice(from)
    .filter((entry) => entry.operation === 'create_node').length;
}

function commitAndCount(cluster, leader, followers) {
  const before = Number(cluster.node(leader).readStatus().commitIndex);
  cluster.propose(leader, {op: 'after-the-hold'});
  cluster.tickers = [leader];
  return cluster.settle(() => [leader, ...followers].every((replicaId) =>
    Number(cluster.node(replicaId).readStatus().commitIndex) > before),
  {rounds: 200});
}

// A vote request from a fresh candidate whose log is as empty as the
// recipient's: Raft's own rules would grant it.
function emptyCandidateVote(ids, from, to) {
  return envelopeTo('', ids[to], {
    msgType: RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE,
    from: ids[from], term: '2', logTerm: '0', index: '0',
  });
}

test('W1: a leader heartbeat to an identity re-opened empty holds that ' +
  'group for a reseed - no trap, no runtime replacement, every other ' +
  'group keeps running, one ERROR line', async () => {
  const bystander = formedCluster('w1-bystander', ['w1-x', 'w1-y', 'w1-z'],
    3);
  const cluster = formedCluster('w1-moved', ['w1-a', 'w1-b', 'w1-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const matched = cluster.node('w1-a').readStatus()
      .followerProgress[cluster.addressOf('w1-c')];
    assert.ok(matched >= FORMED_ENTRIES,
      `setup: the leader holds w1-c matched at ${matched}`);
    const generation = bystander.node('w1-x').readStatus().runtimeGeneration;
    reopenEmpty(cluster, 'w1-c');
    const entriesAfterReopen = cluster.coreEntries.length;
    const errors = await capturingErrors(() => {
      cluster.tickers = ['w1-a'];
      cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    });

    assertHeld(cluster, 'w1-c');
    assert.equal(createNodeCount(cluster, entriesAfterReopen), 0,
      'the runtime was replaced: every group was re-created');
    assert.equal(bystander.node('w1-x').readStatus().runtimeGeneration,
      generation, 'an unrelated group runs in a replaced runtime');
    assert.ok(errors.some(({context}) =>
      context.groupId === 'w1-moved' &&
      context.from === ids['w1-a'] &&
      context.msgType === RAFT_RS_MESSAGE_TYPE.HEARTBEAT &&
      context.reason === RAFT_RS_LOCAL_LOG_REFUSAL
        .PEER_COMMIT_BEYOND_LOCAL_LOG &&
      context.report === RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED),
    `no ERROR line names the refusal: ${JSON.stringify(errors)}`);
    assert.equal(errors.filter(({context}) =>
      context.report === RUNTIME_FAULT_REPORT.CORE_TRAPPED).length, 0);
    assert.ok(commitAndCount(cluster, 'w1-a', ['w1-b']),
      'the leader and the healthy follower keep committing');
    assert.ok(commitAndCount(bystander, 'w1-x', ['w1-y', 'w1-z']),
      'an unrelated group keeps committing');
  } finally {
    cluster.dispose();
    bystander.dispose();
  }
});

test('W2 (S3): held identities neither campaign nor grant a vote; one ' +
  'leader per term', async () => {
  const cluster = formedCluster('w2-s3', ['w2-a', 'w2-b', 'w2-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    reopenEmpty(cluster, 'w2-b');
    reopenEmpty(cluster, 'w2-c');
    await capturingErrors(() => {
      cluster.tickers = ['w2-a'];
      cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    });
    assertHeld(cluster, 'w2-b');
    assertHeld(cluster, 'w2-c');
    const campaign = await cluster.node('w2-b').campaign();
    assert.equal(campaign.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(campaign.reason, RESEED_REQUIRED);
    const voteBefore = hardStateOf(cluster, 'w2-c');
    const vote = emptyCandidateVote(ids, 'w2-b', 'w2-c');
    const delivered = await cluster.node('w2-c').step(
      {...vote, groupId: cluster.partitionId});
    assert.equal(delivered.reason, RESEED_REQUIRED);
    await cluster.node('w2-c').tick();
    assert.deepEqual(hardStateOf(cluster, 'w2-c'), voteBefore,
      'a held replica granted a vote');
    cluster.tickers = ['w2-a', 'w2-b', 'w2-c'];
    cluster.settle(() => false, {rounds: ALL_TICK_ROUNDS});
    assertOnlySeedLed(cluster, 'w2-a', 1);
  } finally {
    cluster.dispose();
  }
});

test('W2 (S2): the seed cut off, two held identities elect no leader; ' +
  'after healing one leader holds term 1 and the committed log is ' +
  'intact', async () => {
  const cluster = formedCluster('w2-s2', ['w2s-a', 'w2s-b', 'w2s-c'],
    FORMED_ENTRIES);
  try {
    reopenEmpty(cluster, 'w2s-b');
    reopenEmpty(cluster, 'w2s-c');
    await capturingErrors(() => {
      cluster.tickers = ['w2s-a'];
      cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    });
    const seedCommit = Number(cluster.node('w2s-a').readStatus().commitIndex);
    const seedLog = durableLog(cluster.dbFileOf('w2s-a'), cluster.partitionId)
      .filter((entry) => Number(entry.index) <= seedCommit);
    const heldHardStates = ['w2s-b', 'w2s-c'].map((replicaId) =>
      hardStateOf(cluster, replicaId));
    cluster.isolate('w2s-a');
    cluster.tickers = ['w2s-b', 'w2s-c'];
    await capturingErrors(() =>
      cluster.settle(() => false, {rounds: ISOLATED_ROUNDS}));
    assert.deepEqual(['w2s-b', 'w2s-c'].map((replicaId) =>
      hardStateOf(cluster, replicaId)), heldHardStates,
    'a held replica raised its term or voted while the seed was cut off');
    cluster.heal('w2s-a');
    cluster.tickers = ['w2s-a'];
    cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    assertOnlySeedLed(cluster, 'w2s-a', 1);
    assert.ok(Number(cluster.node('w2s-a').readStatus().commitIndex) >=
      seedCommit);
    assert.deepEqual(durableLog(cluster.dbFileOf('w2s-a'),
      cluster.partitionId).filter((entry) =>
      Number(entry.index) <= seedCommit), seedLog,
    'the seed\'s committed log changed');
  } finally {
    cluster.dispose();
  }
});

for (const moved of [['w3-c'], ['w3-b', 'w3-c']]) {
  test(`W3: held ${moved.join(' and ')} never depose the leader while ` +
    'every replica ticks (no term inflation)', async () => {
    const cluster = formedCluster(`w3-${moved.length}`,
      ['w3-a', 'w3-b', 'w3-c'], FORMED_ENTRIES);
    try {
      const term = cluster.node('w3-a').readStatus().term;
      for (const replicaId of moved) {
        reopenEmpty(cluster, replicaId);
      }
      const entriesAfterReopen = cluster.coreEntries.length;
      cluster.tickers = ['w3-a', 'w3-b', 'w3-c'];
      await capturingErrors(() =>
        cluster.settle(() => false, {rounds: ALL_TICK_ROUNDS}));
      for (const replicaId of moved) {
        assertHeld(cluster, replicaId);
      }
      assert.equal(createNodeCount(cluster, entriesAfterReopen), 0);
      if (moved.length === 1) {
        assert.deepEqual(leadersByTerm(cluster), [['w3-a', term]]);
      } else {
        assertOnlySeedLed(cluster, 'w3-a', term);
      }
      for (const replicaId of ['w3-a', 'w3-b', 'w3-c']) {
        if (!moved.includes(replicaId)) {
          assert.equal(cluster.node(replicaId).readStatus().term, term,
            `${replicaId}'s term was inflated`);
        }
      }
    } finally {
      cluster.dispose();
    }
  });
}

test('W6: the hold survives a restart - the held replica re-opened from ' +
  'the same file is still held and still does not vote', async () => {
  const cluster = formedCluster('w6-restart', ['w6-a', 'w6-b', 'w6-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    reopenEmpty(cluster, 'w6-c');
    await capturingErrors(() => {
      cluster.tickers = ['w6-a'];
      cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    });
    assertHeld(cluster, 'w6-c');
    cluster.restart('w6-c');
    assertHeld(cluster, 'w6-c');
    const before = hardStateOf(cluster, 'w6-c');
    const vote = emptyCandidateVote(ids, 'w6-b', 'w6-c');
    const delivered = await cluster.node('w6-c').step(
      {...vote, groupId: cluster.partitionId});
    assert.equal(delivered.reason, RESEED_REQUIRED);
    const campaign = await cluster.node('w6-c').campaign();
    assert.equal(campaign.reason, RESEED_REQUIRED);
    assert.deepEqual(hardStateOf(cluster, 'w6-c'), before);
    cluster.tickers = ['w6-a', 'w6-b', 'w6-c'];
    await capturingErrors(() =>
      cluster.settle(() => false, {rounds: ALL_TICK_ROUNDS}));
    assert.deepEqual(leadersByTerm(cluster),
      [['w6-a', cluster.node('w6-a').readStatus().term]]);
    assert.deepEqual(hardStateOf(cluster, 'w6-c'), before);
  } finally {
    cluster.dispose();
  }
});

test('W2: the turn that proves the history lost ends there - a vote ' +
  'request behind the proving heartbeat and the turn\'s own tick never ' +
  'reach the core', async () => {
  const cluster = formedCluster('w2-turn', ['w2t-a', 'w2t-b', 'w2t-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const leader = cluster.node('w2t-a').readStatus();
    reopenEmpty(cluster, 'w2t-c');
    const before = hardStateOf(cluster, 'w2t-c');
    const node = cluster.node('w2t-c');
    await node.step(envelopeTo(cluster.partitionId, ids['w2t-c'], {
      msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT, from: ids['w2t-a'],
      term: String(leader.term), commit: String(leader.commitIndex)}));
    await node.step(emptyCandidateVote(ids, 'w2t-b', 'w2t-c'));
    const from = cluster.coreEntries.length;
    await capturingErrors(() => node.tick());
    assert.equal(cluster.coreEntries.length, from,
      'the turn that proved the history lost entered the core');
    assertHeld(cluster, 'w2t-c');
    assert.deepEqual(hardStateOf(cluster, 'w2t-c'), before,
      'the vote behind the proving heartbeat was stepped');
  } finally {
    cluster.dispose();
  }
});

test('W1: a runtime replacement after the hold does not reopen the held ' +
  'group', async () => {
  const cluster = formedCluster('w1-replace', ['w1r-a', 'w1r-b', 'w1r-c'],
    FORMED_ENTRIES);
  const other = formedCluster('w1-replace-trap', ['w1t-x', 'w1t-y', 'w1t-z'],
    3);
  try {
    const ids = peerIdsOf(other);
    reopenEmpty(cluster, 'w1r-c');
    await capturingErrors(() => {
      cluster.tickers = ['w1r-a'];
      cluster.settle(() => false, {rounds: HEARTBEAT_ROUNDS});
    });
    assertHeld(cluster, 'w1r-c');
    const victim = other.node('w1t-y').readStatus();
    const from = other.coreEntries.length;
    await capturingErrors(async () => {
      await other.node('w1t-y').step(coreTrappingAppend({
        dbFile: other.dbFileOf('w1t-y'), groupId: other.partitionId,
        status: victim, from: ids['w1t-x'], term: String(victim.term)}));
      await other.node('w1t-y').tick();
      cluster.node('w1r-a').readStatus();
    });
    const reopened = other.coreEntries.slice(from).filter((entry) =>
      entry.operation === 'create_node' &&
      entry.groupId === cluster.partitionId).length;
    assert.equal(reopened, 2,
      'the replacement re-created the held group\'s node');
    assertHeld(cluster, 'w1r-c');
  } finally {
    other.dispose();
    cluster.dispose();
  }
});
