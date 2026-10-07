// The open-to-SYNCING window (verifier N3): a CREATE_REPLICA target opens its
// port before its prior-existence fact (the SYNCING services row) is
// durable. raft-rs 0.7 learners grant votes and a GENESIS founder votes from
// birth, so a target that voted inside the window and then lost its disk
// reopened empty with no fact and could vote again in the same term. The
// participation gate now holds an "identity unrecorded" state from the open
// until the acknowledgement of that write (the port's IDENTITY_RECORDED
// promise): no delivered envelope is stepped (a lost message to its sender),
// no tick, campaign or proposal enters the core. Real rs-raft ports on the
// real WASM core (PartitionNodeCluster); every verdict is a port answer, a
// durable hard state read on a connection of the test's own, or a thrown
// typed refusal. No wall time.
//
//   W1  the hole: founders f0 and f1 campaign in the same term; f2 (a
//       GENESIS founder opened by CREATE_REPLICA, fact not durable) is the
//       only voter either can reach; f2 answers f0, crashes, loses its disk,
//       reopens without the fact and answers f1 - two leaders in one term.
//       Here f2 steps nothing before the fact: its durable hard state stays
//       {term 0, vote 0}, nobody leads term 1 through it, and the reopened
//       f2 (fact still absent) opens, never refused, and never voted;
//   W2  the same with the fact durable before the vote: f2 votes for f0,
//       loses its disk, and its reopening carries the fact (IDENTITY_EXISTED)
//       and is refused reseed-required: f1 never leads term 1 either;
//   W3  a COMMITTED joiner whose identity is unrecorded while the group has
//       already applied its AddNode: it steps nothing (its hard state stays
//       empty, its applied index does not move); released by the
//       acknowledgement it catches up and votes; a rejected acknowledgement
//       never releases it;
//   W4  the leader side of a not-yet-recorded VOTER (any producer that adds
//       one before its fact is durable): RF 1->2 and a REPLACE adding d to
//       {a, b, c-dead} lose their leader under check_quorum while the voter
//       is closed and elect once it is released; RF 2->3 and 3->4 with every
//       member live keep their leader throughout.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  capturingErrors,
  formedCluster,
  hardStateOf,
  leadersByTerm,
} from './identity-reuse-harness.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';

const SETTLE_ROUNDS = 400;
// PARTITION_TIMING: 10 ms ticks, election timeout 15 ticks (randomized up
// to 2x). A closed interval of 120 rounds is 1.2 s, eight election timeouts:
// a leader without quorum has stepped down well inside it.
const CLOSED_ROUNDS = 120;
const EMPTY_HARD_STATE = Object.freeze({term: '0', vote: '0'});
const LEADER = 'leader';

function pendingRecord() {
  const {promise, resolve, reject} = Promise.withResolvers();
  promise.catch(() => undefined);
  return {recorded: promise, release: resolve, abandon: reject};
}

function unrecorded(record) {
  return {[RAFT_OPERATION_PORT_REQUEST.IDENTITY_RECORDED]: record.recorded};
}

// The port takes the acknowledgement in the group's own turn.
async function settled() {
  await new Promise((resolve) => setImmediate(resolve));
}

function voteOf(cluster, replicaId) {
  const hardState = hardStateOf(cluster, replicaId);
  return hardState === null ? {...EMPTY_HARD_STATE} :
    {term: hardState.term, vote: hardState.vote};
}

// Deliver the held envelopes of `types` from `from` to `to` (and nothing
// else), then let `to` drain them.
function deliver(cluster, from, to, types) {
  const fromPeer = cluster.raftPeerIdOf(from);
  const inbox = cluster.replica(to).inbox;
  const chosen = inbox.filter((envelope) => envelope.from === fromPeer &&
    types.includes(envelope.message.msgType));
  cluster.replica(to).inbox = inbox.filter((envelope) =>
    !chosen.includes(envelope));
  for (const envelope of chosen) {
    cluster.node(to).step(envelope);
  }
  cluster.node(to).tick();
  return chosen.length;
}

function dropAll(cluster) {
  for (const replica of cluster.replicas.values()) {
    replica.inbox.length = 0;
  }
}

function wipe(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  replica.node.close();
  replica.db.close();
  fs.rmSync(cluster.dbFileOf(replicaId), {force: true});
}

function reopen(cluster, replicaId, founders, extraRequest) {
  try {
    cluster.buildReplica(replicaId, founders, extraRequest);
    return null;
  } catch (error) {
    cluster.replica(replicaId).db.close();
    cluster.replicas.delete(replicaId);
    return error;
  }
}

function leaderTerms(cluster) {
  const byTerm = new Map();
  for (const [replicaId, term] of leadersByTerm(cluster)) {
    byTerm.set(term, [...(byTerm.get(term) || []), replicaId]);
  }
  return byTerm;
}

// f0 and f1 both campaign; f2 is the one voter either can reach. Pre-vote
// first (f2 answers both while it has no leader), then the vote proper.
async function splitCampaignThroughF2(cluster, f2Answers) {
  cluster.node('f0').campaign();
  cluster.node('f1').campaign();
  dropAll(cluster);
  // Each campaign again so its pre-vote requests are the held ones.
  cluster.node('f0').campaign();
  cluster.node('f1').campaign();
  for (const from of ['f0', 'f1']) {
    for (const other of ['f0', 'f1'].filter((id) => id !== from)) {
      cluster.replica(other).inbox.length = 0;
    }
    deliver(cluster, from, 'f2', [RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE]);
    deliver(cluster, 'f2', from,
      [RAFT_RS_MESSAGE_TYPE.REQUEST_PRE_VOTE_RESPONSE]);
  }
  await settled();
  // f0's vote request reaches f2 first; its answer reaches f0.
  for (const other of ['f0', 'f1']) {
    cluster.replica(other).inbox = cluster.replica(other).inbox.filter(
      (envelope) => envelope.message.msgType !==
        RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE);
  }
  const f1Request = cluster.replica('f2').inbox.filter((envelope) =>
    envelope.from === cluster.raftPeerIdOf('f1'));
  cluster.replica('f2').inbox = cluster.replica('f2').inbox.filter(
    (envelope) => !f1Request.includes(envelope));
  deliver(cluster, 'f0', 'f2', [RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE]);
  deliver(cluster, 'f2', 'f0', [RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE]);
  await f2Answers();
  return f1Request;
}

test('W1: a GENESIS founder whose identity is unrecorded steps no vote ' +
  'request; after a disk loss in the window it reopens without the fact ' +
  'having never voted - no two leaders in one term', async () => {
  const founders = ['f0', 'f1', 'f2'];
  const cluster = new PartitionNodeCluster({partitionId: 'w1',
    replicaIds: founders});
  const record = pendingRecord();
  try {
    wipe(cluster, 'f2');
    reopen(cluster, 'f2', founders, unrecorded(record));
    const opened = cluster.node('f2').readStatus();
    let f2BeforeLoss = null;
    const f1Request = await splitCampaignThroughF2(cluster, async () => {
      f2BeforeLoss = voteOf(cluster, 'f2');
      // Crash and disk loss inside the window: the SYNCING write never
      // happened, so the reopening carries no fact and its own new record.
      wipe(cluster, 'f2');
      const refused = reopen(cluster, 'f2', founders,
        unrecorded(pendingRecord()));
      assert.equal(refused, null,
        'a target whose fact was never durable is refused (a false refusal)');
    });
    for (const envelope of f1Request) {
      cluster.node('f2').step(envelope);
    }
    cluster.node('f2').tick();
    deliver(cluster, 'f2', 'f1', [RAFT_RS_MESSAGE_TYPE.REQUEST_VOTE_RESPONSE]);
    for (const [term, leaders] of leaderTerms(cluster)) {
      assert.equal(leaders.length, 1, `two leaders in term ${term}: ` +
        leaders.join(', '));
    }
    assert.deepEqual(f2BeforeLoss, EMPTY_HARD_STATE,
      'f2 voted before its prior-existence fact was durable');
    assert.deepEqual(voteOf(cluster, 'f2'), EMPTY_HARD_STATE,
      'the reopened f2 voted before its fact was durable');
    assert.equal(opened.identityRecorded, false);
    assert.equal(opened.gateOpen, false,
      'a founder\'s gate is open before its fact is durable');
    assert.equal(cluster.node('f2').readStatus().identityRecorded, false);
  } finally {
    cluster.dispose();
  }
});

test('W2: with the fact durable before the vote, the disk-loss reopening ' +
  'carries it and is refused reseed-required: no second vote in the term',
async () => {
  const founders = ['f0', 'f1', 'f2'];
  const cluster = new PartitionNodeCluster({partitionId: 'w2',
    replicaIds: founders});
  const record = pendingRecord();
  try {
    wipe(cluster, 'f2');
    reopen(cluster, 'f2', founders, unrecorded(record));
    record.release();
    await settled();
    assert.equal(cluster.node('f2').readStatus().identityRecorded, true);
    let refused = null;
    const f1Request = await splitCampaignThroughF2(cluster, async () => {
      assert.equal(voteOf(cluster, 'f2').vote,
        cluster.raftPeerIdOf('f0'), 'setup: the recorded f2 votes for f0');
      assert.equal(cluster.node('f0').readStatus().role, LEADER);
      wipe(cluster, 'f2');
      refused = reopen(cluster, 'f2', founders,
        {[RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED]: true});
    });
    assert.equal(refused?.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
    assert.equal(f1Request.length > 0, true);
    for (const [term, leaders] of leaderTerms(cluster)) {
      assert.equal(leaders.length, 1, `two leaders in term ${term}`);
    }
  } finally {
    cluster.dispose();
  }
});

function admitVoter(cluster, leader, replicaId) {
  cluster.proposeConfigurationChange([{
    changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
    nodeId: cluster.raftPeerIdOf(replicaId)}], 0, leader);
}

function joinUnrecorded(cluster, leader, founders, replicaId, record) {
  const stamp = cluster.node(leader)[RAFT_OPERATION
    .READ_COMMITTED_MEMBERSHIP]({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
  cluster.addReplica(replicaId, founders, {
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp,
    ...unrecorded(record)});
}

test('W3: a COMMITTED joiner whose identity is unrecorded steps nothing ' +
  'although the group applied its AddNode; a rejected acknowledgement ' +
  'never releases it, a resolved one does', async () => {
  const founders = ['a', 'b', 'c'];
  const cluster = formedCluster('w3', founders, 4);
  try {
    const rejected = pendingRecord();
    joinUnrecorded(cluster, 'a', founders, 'j', rejected);
    const applied = cluster.node('j').readStatus().appliedIndex;
    admitVoter(cluster, 'a', 'j');
    cluster.tickers = ['a', 'b', 'c', 'j'];
    assert.ok(cluster.settle(() => founders.every((id) =>
      cluster.node(id).readStatus().confState.voters
        .includes(cluster.raftPeerIdOf('j'))), {rounds: SETTLE_ROUNDS}),
    'setup: the group did not apply the AddNode');
    rejected.abandon(new Error('the SYNCING write failed'));
    cluster.settle(() => false, {rounds: CLOSED_ROUNDS});
    await settled();
    const closed = cluster.node('j').readStatus();
    assert.equal(closed.identityRecorded, false);
    assert.equal(closed.gateOpen, false);
    assert.equal(closed.appliedIndex, applied, 'j applied while unrecorded');
    assert.deepEqual(voteOf(cluster, 'j'), EMPTY_HARD_STATE);
    const tick = cluster.node('j').tick();
    assert.equal(tick.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    // The retry's record, acknowledged: the same port is reopened by the
    // create's retry; here the joiner is rebuilt on its file.
    const record = pendingRecord();
    const replica = cluster.replica('j');
    replica.node.close();
    replica.db.close();
    reopen(cluster, 'j', founders, {
      ...replica.extraRequest, ...unrecorded(record)});
    record.release();
    await settled();
    assert.ok(cluster.settle(() => cluster.node('j').readStatus().gateOpen &&
      cluster.node('j').readStatus().commitIndex ===
        cluster.node('a').readStatus().commitIndex,
    {rounds: SETTLE_ROUNDS}), 'the released joiner never caught up');
  } finally {
    cluster.dispose();
  }
});

// Leaderless rounds while the added voter is closed, and whether the group
// elects once it is released.
async function measureClosedVoter({partitionId, founders, dead = []}) {
  const cluster = formedCluster(partitionId, founders, 2);
  const [leader] = founders;
  try {
    for (const id of dead) {
      cluster.isolate(id);
    }
    const live = founders.filter((id) => !dead.includes(id));
    cluster.tickers = live;
    const record = pendingRecord();
    joinUnrecorded(cluster, leader, founders, 'n', record);
    admitVoter(cluster, leader, 'n');
    cluster.tickers = [...live, 'n'];
    let leaderless = 0;
    cluster.settle(() => false, {rounds: CLOSED_ROUNDS, between: () => {
      if (leadersByTerm(cluster).length === 0) {
        leaderless += 1;
      }
    }});
    const heldLeader = leadersByTerm(cluster).length > 0;
    record.release();
    await settled();
    const elected = cluster.settle(() => leadersByTerm(cluster).length > 0 &&
      cluster.node('n').readStatus().gateOpen === true,
    {rounds: SETTLE_ROUNDS});
    return {leaderless, heldLeader, elected};
  } finally {
    cluster.dispose();
  }
}

test('W4: the leader side of a not-yet-recorded voter under check_quorum',
  async (t) => {
    const shapes = [
      ['RF 1->2', {partitionId: 'w4-12', founders: ['a']}, false],
      ['RF 2->3', {partitionId: 'w4-23', founders: ['a', 'b']}, true],
      ['RF 3->4, every member live',
        {partitionId: 'w4-34', founders: ['a', 'b', 'c']}, true],
      ['REPLACE: d added to {a, b, c-dead}',
        {partitionId: 'w4-rep', founders: ['a', 'b', 'c'], dead: ['c']},
        false],
    ];
    for (const [name, shape, keepsLeader] of shapes) {
      const measured = await measureClosedVoter(shape);
      t.diagnostic(`${name}: ${JSON.stringify(measured)}`);
      assert.equal(measured.heldLeader, keepsLeader, `${name}: leader ` +
        `${keepsLeader ? 'lost' : 'kept'} while the voter was closed`);
      assert.equal(measured.elected, true,
        `${name}: no leader after the voter was released`);
    }
  });

test('W5: an unrecorded founder is reconstructed unrecorded by a runtime ' +
  'replacement and does not campaign; released, it elects', async () => {
  const other = formedCluster('w5-other', ['x0', 'x1', 'x2'], 1);
  const lone = new PartitionNodeCluster({partitionId: 'w5-lone',
    replicaIds: ['s0']});
  const record = pendingRecord();
  try {
    wipe(lone, 's0');
    reopen(lone, 's0', ['s0'], unrecorded(record));
    const before = lone.node('s0').readStatus();
    assert.equal(before.gateOpen, false);
    const victim = other.node('x1').readStatus();
    await capturingErrors(async () => {
      await other.node('x1').step(coreTrappingAppend({
        dbFile: other.dbFileOf('x1'), groupId: other.partitionId,
        status: victim, from: other.raftPeerIdOf('x0'),
        term: String(victim.term)}));
      await other.node('x1').tick();
    });
    lone.tickers = ['s0'];
    lone.settle(() => false, {rounds: CLOSED_ROUNDS});
    const after = lone.node('s0').readStatus();
    assert.ok(after.runtimeGeneration > before.runtimeGeneration,
      'setup: the shared runtime was not replaced');
    assert.equal(after.identityRecorded, false,
      'the reconstruction forgot the unrecorded identity');
    assert.equal(after.gateOpen, false);
    assert.notEqual(after.role, LEADER, 'campaigned before its fact');
    assert.deepEqual(voteOf(lone, 's0'), EMPTY_HARD_STATE);
    record.release();
    await settled();
    assert.ok(lone.settle(() => lone.node('s0').readStatus().role === LEADER,
      {rounds: SETTLE_ROUNDS}), 'the released founder never elected');
  } finally {
    lone.dispose();
    other.dispose();
  }
});
