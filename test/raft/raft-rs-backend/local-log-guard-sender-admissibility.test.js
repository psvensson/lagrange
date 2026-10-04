// Sender admissibility at the single raft-rs ingress (owner decision M5:
// unadmitted traffic cannot depose a legitimate leader, and nothing a peer
// sends may hold a replica it does not lead). Real rs-raft ports on the real
// WASM core (PartitionNodeCluster); every verdict is a port answer, a durable
// lifecycle row read on a connection of the test's own, a refusal record or
// an actual-core-entry count. No wall time.
//
//   A1  a forged heartbeat - an unknown raft id, term 0, a commit beyond the
//       leader's log - is refused and holds nothing: the leader keeps
//       leading, its lifecycle row stays active, also after a restart
//       (before this change it held the leader for a reseed, for good);
//   A2  a member's heartbeat at a term below the receiver's, with a commit
//       beyond its log, is refused and holds nothing;
//   A3  a member's heartbeat at the current term with a commit inside the
//       receiver's log is stepped (no refusal);
//   A4  a vote request at a higher term from a raft id outside the
//       receiver's configuration does not move the term or the role of a
//       leader or of a follower that has one (before: the leader stepped
//       down to the forger's term); a member's is stepped as raft decides;
//   A5  the membership-transition race the binding direction requires
//       (section 6): a voter added while one follower is partitioned, the
//       old leader then lost; the lagging follower, which does not yet hold
//       the new voter in its configuration, heals and the group converges -
//       one leader, the new configuration everywhere, a fresh write
//       committed on all three survivors.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  envelopeTo,
  formedCluster,
  leadersByTerm,
  lifecycleRow,
  peerIdsOf,
} from './identity-reuse-harness.js';
import {RAFT_OPERATION, RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {
  RAFT_RS_LOCAL_LOG_REFUSAL,
  RUNTIME_PHASE,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';

const FORMED_ENTRIES = 6;
const BEYOND = 1000n;
const UNKNOWN_SENDER = '424242';
const HIGHER = 5;
const ADD_NODE = 0;
const CONVERGENCE_ROUNDS = 600;
const SETTLE_ROUNDS = 300;
const LEADER = 'leader';
const ACTIVE = 'active';
const STEP = 'step';

// Deliver one envelope to one port and drain it with that port's own turn:
// the core steps it observes are the recipient's.
async function deliverAlone(cluster, replicaId, envelope) {
  const before = cluster.coreEntries.length;
  const accepted = await cluster.node(replicaId).step(envelope);
  assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `setup: the envelope passes admission (${JSON.stringify(accepted)})`);
  await cluster.node(replicaId).tick();
  return cluster.coreEntries.slice(before)
    .filter((entry) => entry.operation === STEP).length;
}

function refusalOf(cluster, replicaId, sender) {
  return cluster.node(replicaId).readStatus().inboundStepRefusals
    .find((record) => record.from === sender) ?? null;
}

function assertRefusedNotHeld(cluster, replicaId, sender, reason, steps) {
  assert.equal(steps, 0, `the core stepped the refused ${reason} envelope`);
  const record = refusalOf(cluster, replicaId, sender);
  assert.equal(record?.reason, reason,
    `no ${reason} refusal recorded: ${JSON.stringify(record)}`);
  assert.equal(record.phase, RUNTIME_PHASE.LOCAL_LOG_GUARD);
  const status = cluster.node(replicaId).readStatus();
  assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `the replica is held: ${JSON.stringify(status.reason)}`);
  const row = lifecycleRow(cluster, replicaId);
  assert.ok(row === null || row.state === ACTIVE,
    `the lifecycle row moved: ${JSON.stringify(row)}`);
}

function heartbeat(ids, sender, recipient, term, commit) {
  return {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT, from: sender,
    to: ids[recipient], term: String(term), commit: String(commit)};
}

// A group whose leader is `b` at term 2: `a` led term 1 and was cut off.
function secondTermCluster(prefix) {
  const cluster = formedCluster(prefix,
    [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`], FORMED_ENTRIES);
  cluster.isolate(`${prefix}-a`);
  cluster.tickers = [`${prefix}-b`];
  assert.ok(cluster.settle(() => cluster.node(`${prefix}-b`).readStatus()
    .role === LEADER, {rounds: SETTLE_ROUNDS}), 'setup: b was not elected');
  cluster.heal(`${prefix}-a`);
  assert.ok(cluster.settle(() => cluster.node(`${prefix}-a`).readStatus()
    .role !== LEADER, {rounds: SETTLE_ROUNDS}), 'setup: a did not step down');
  return cluster;
}

test('A1: a forged heartbeat (unknown raft id, term 0, commit beyond the ' +
  'log) is refused and holds nothing, also after a restart', async () => {
  const cluster = formedCluster('a1', ['a1-a', 'a1-b', 'a1-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const leader = cluster.node('a1-a').readStatus();
    const steps = await deliverAlone(cluster, 'a1-a', envelopeTo(
      cluster.partitionId, ids['a1-a'], heartbeat(ids, UNKNOWN_SENDER,
        'a1-a', 0, BigInt(leader.commitIndex) + BEYOND)));
    assertRefusedNotHeld(cluster, 'a1-a', UNKNOWN_SENDER,
      RAFT_RS_LOCAL_LOG_REFUSAL.UNADMITTED_COMMIT_BEYOND_LOCAL_LOG, steps);
    const after = cluster.node('a1-a').readStatus();
    assert.equal(after.role, LEADER);
    assert.equal(after.term, leader.term);
    cluster.restart('a1-a');
    const restarted = cluster.node('a1-a').readStatus();
    assert.equal(restarted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the restarted leader is refused: ${restarted.reason}`);
    const row = lifecycleRow(cluster, 'a1-a');
    assert.ok(row === null || row.state === ACTIVE, JSON.stringify(row));
  } finally {
    cluster.dispose();
  }
});

test('A2: a member heartbeat at a term below the receiver with a commit ' +
  'beyond its log is refused and holds nothing', async () => {
  const cluster = secondTermCluster('a2');
  try {
    const ids = peerIdsOf(cluster);
    const leader = cluster.node('a2-b').readStatus();
    assert.ok(leader.term >= 2, 'setup: the leader is past term 1');
    const steps = await deliverAlone(cluster, 'a2-b', envelopeTo(
      cluster.partitionId, ids['a2-b'], heartbeat(ids, ids['a2-c'], 'a2-b',
        leader.term - 1, BigInt(leader.commitIndex) + BEYOND)));
    assertRefusedNotHeld(cluster, 'a2-b', ids['a2-c'],
      RAFT_RS_LOCAL_LOG_REFUSAL.UNADMITTED_COMMIT_BEYOND_LOCAL_LOG, steps);
    assert.equal(cluster.node('a2-b').readStatus().role, LEADER);
  } finally {
    cluster.dispose();
  }
});

test('A3: a member heartbeat at the current term with a commit inside the ' +
  'log is stepped', async () => {
  const cluster = formedCluster('a3', ['a3-a', 'a3-b', 'a3-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const follower = cluster.node('a3-b').readStatus();
    const steps = await deliverAlone(cluster, 'a3-b', envelopeTo(
      cluster.partitionId, ids['a3-b'], heartbeat(ids, ids['a3-a'], 'a3-b',
        follower.term, follower.commitIndex)));
    assert.equal(steps, 1, 'the admissible heartbeat was not stepped');
    assert.equal(refusalOf(cluster, 'a3-b', ids['a3-a']), null);
  } finally {
    cluster.dispose();
  }
});

function voteRequest(ids, sender, recipient, status) {
  return {msgType: RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE, from: sender,
    to: ids[recipient], term: String(status.term + HIGHER),
    logTerm: String(status.term + HIGHER),
    index: String(BigInt(status.commitIndex) + BEYOND)};
}

test('A4: a higher-term vote request from outside the configuration moves ' +
  'neither a leader nor a follower that has one; a member is stepped',
async () => {
  const cluster = formedCluster('a4', ['a4-a', 'a4-b', 'a4-c'],
    FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    for (const recipient of ['a4-a', 'a4-b']) {
      const before = cluster.node(recipient).readStatus();
      const steps = await deliverAlone(cluster, recipient, envelopeTo(
        cluster.partitionId, ids[recipient],
        voteRequest(ids, UNKNOWN_SENDER, recipient, before)));
      assertRefusedNotHeld(cluster, recipient, UNKNOWN_SENDER,
        RAFT_RS_LOCAL_LOG_REFUSAL.VOTE_REQUEST_OUTSIDE_CONFIGURATION, steps);
      const after = cluster.node(recipient).readStatus();
      assert.equal(after.term, before.term, `${recipient} term moved`);
      assert.equal(after.role, before.role, `${recipient} role moved`);
    }
    const leader = cluster.node('a4-a').readStatus();
    const steps = await deliverAlone(cluster, 'a4-a', envelopeTo(
      cluster.partitionId, ids['a4-a'],
      voteRequest(ids, ids['a4-c'], 'a4-a', leader)));
    assert.equal(steps, 1, 'a member vote request was not stepped');
    assert.equal(cluster.node('a4-a').readStatus().term,
      leader.term + HIGHER, 'raft no longer decides a member vote request');
  } finally {
    cluster.dispose();
  }
});

function hasVoter(cluster, replicaId, peerId) {
  const status = cluster.node(replicaId).readStatus();
  return status.confState?.voters.includes(peerId) === true;
}

function commitOf(cluster, replicaId) {
  return Number(cluster.node(replicaId).readStatus().commitIndex);
}

// The race: `d` added while `c` is cut off, then `a` (the leader) lost and
// `c` healed. `first` alone time out for `firstRounds` (then `firstCheck`
// reads c's refusal record of d), then every survivor does.
function transitionRace({first, firstRounds, firstCheck}) {
  const cluster = formedCluster('a5', ['a5-a', 'a5-b', 'a5-c'],
    FORMED_ENTRIES);
  try {
    cluster.isolate('a5-c');
    const stamp = cluster.node('a5-a')[RAFT_OPERATION
      .READ_COMMITTED_MEMBERSHIP]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    cluster.addReplica('a5-d', ['a5-a', 'a5-b', 'a5-c'], {
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
    const ids = peerIdsOf(cluster);
    cluster.proposeConfigurationChange(
      [{changeType: ADD_NODE, nodeId: ids['a5-d']}], 0, 'a5-a');
    cluster.tickers = ['a5-a'];
    assert.ok(cluster.settle(() => ['a5-a', 'a5-b', 'a5-d'].every((id) =>
      hasVoter(cluster, id, ids['a5-d'])) &&
      cluster.node('a5-d').readStatus().gateOpen === true,
    {rounds: SETTLE_ROUNDS}), 'setup: the new voter was not admitted');
    assert.equal(hasVoter(cluster, 'a5-c', ids['a5-d']), false,
      'setup: the partitioned follower already holds the new voter');
    const addedAt = commitOf(cluster, 'a5-a');
    cluster.isolate('a5-a');
    cluster.heal('a5-c');
    const survivors = ['a5-b', 'a5-c', 'a5-d'];
    cluster.tickers = first;
    cluster.settle(() => false, {rounds: firstRounds});
    firstCheck(cluster, refusalOf(cluster, 'a5-c', ids['a5-d']));
    cluster.tickers = survivors;
    assert.ok(cluster.settle(() => {
      const leaders = leadersByTerm(cluster).filter(([id]) => id !== 'a5-a');
      return leaders.length === 1 &&
        survivors.every((id) => hasVoter(cluster, id, ids['a5-d']) &&
          commitOf(cluster, id) >= addedAt);
    }, {rounds: CONVERGENCE_ROUNDS}), 'the survivors did not converge: ' +
      JSON.stringify(survivors.map((id) => cluster.node(id).readStatus())
        .map(({role, term, commitIndex, inboundStepRefusals}) =>
          ({role, term, commitIndex, inboundStepRefusals}))));
    const [[newLeader]] = leadersByTerm(cluster)
      .filter(([id]) => id !== 'a5-a');
    const before = commitOf(cluster, newLeader);
    cluster.propose(newLeader, {op: 'after-the-race'});
    assert.ok(cluster.settle(() => survivors.every((id) =>
      commitOf(cluster, id) > before), {rounds: SETTLE_ROUNDS}),
    'a write after the race did not commit on every survivor');
  } finally {
    cluster.dispose();
  }
}

test('A5: a voter added while a follower is partitioned, the old leader ' +
  'lost: the lagging follower heals and the group converges', () => {
  transitionRace({first: [], firstRounds: 0, firstCheck: () => undefined});
});

test('A5: the same race with the new voter timing out first - the lagging ' +
  'follower refuses it while it still follows the lost leader, and the ' +
  'group converges once the follower\'s own timer clears that leader',
() => {
  transitionRace({first: ['a5-d'], firstRounds: SETTLE_ROUNDS,
    firstCheck: (cluster, record) => {
      assert.equal(record?.reason,
        RAFT_RS_LOCAL_LOG_REFUSAL.VOTE_REQUEST_OUTSIDE_CONFIGURATION,
        `the race did not reach the refusal: ${JSON.stringify(record)}`);
      assert.equal(cluster.node('a5-c').readStatus().role, 'follower');
    }});
});
