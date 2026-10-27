// The open-time refusal of a replica identity that existed before (owner
// ruling 2026-10-05): when the opening host's authoritative row proves this
// identity existed before and its durable raft record is gone, the opening is
// refused reseed-required and held by the replica's lifecycle owner - under
// every bootstrap source, before the core is entered, never dependent on a
// heartbeat. Real rs-raft ports on the real WASM core (PartitionNodeCluster);
// every verdict is a port answer, a thrown typed refusal, a durable
// lifecycle row read on a connection of the test's own, or a core-entry
// count. No wall time.
//
//   A1  seed/system-partition founder reopen: founder r2's own database is
//       lost while the seed's services row survives; reopened GENESIS with
//       the prior-existence fact it is refused at open, held durably (a
//       second opening of the same file is refused too), never enters the
//       core, never votes; {r0, r1} keep their leader and commit;
//   A2  a provisioning GENESIS retry to a wiped target - the same opening
//       through the founding stamp - is refused the same way;
//   A3  a stale COMMITTED stamp (it does not name the target a voter)
//       re-sent after the admitted target lost its data under the same
//       identity: refused at open (before: it opened empty and gated);
//   A4  the S2 shapes: the leader outside the opening configuration
//       ({a,b,c}, add d, transfer to d, wipe c, reopen c), and a leader
//       change after the wipe in a five-voter group: c is refused at open,
//       so no empty-log vote is ever cast; the group keeps committing;
//   A6  legitimate openings stay open: a first genesis (no fact), a durable
//       restart with the fact and its record present, RF=1 likewise, and an
//       O2 joiner (no fact) that opens gated as a learner;
//   S   the seed's fact: a services row for this replica on this node in a
//       non-empty startup admission (rows are registered after the
//       founders opened); an empty admission or an absent row proves
//       nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {
  formedCluster,
  leadersByTerm,
  lifecycleRow,
  peerIdsOf,
} from './identity-reuse-harness.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {seedReplicaIdentityExisted} from
  '../../../src/bootstrap/seed-startup-storage-admission.js';

const RESEED_REQUIRED = COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED;
const FORMED_ENTRIES = 6;
const SETTLE_ROUNDS = 300;
const EXISTED = Object.freeze({
  [RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED]: true});
const RETIRED_FOR_RESEED = Object.freeze({
  state: 'retired', reason: RESEED_REQUIRED});
const LEADER = 'leader';

function commitOf(cluster, replicaId) {
  return Number(cluster.node(replicaId).readStatus().commitIndex);
}

function createNodeCount(cluster, from) {
  return cluster.coreEntries.slice(from)
    .filter((entry) => entry.operation === 'create_node').length;
}

// Lose the replica's own database and open its identity again with
// `extraRequest` (the stamp it is handed, and the prior-existence fact).
// Answers the thrown refusal, or null when the port opened.
function wipeAndReopen(cluster, replicaId, founders, extraRequest) {
  const replica = cluster.replica(replicaId);
  replica.node.close();
  replica.db.close();
  fs.rmSync(cluster.dbFileOf(replicaId), {force: true});
  return reopen(cluster, replicaId, founders, extraRequest);
}

function reopen(cluster, replicaId, founders, extraRequest) {
  try {
    cluster.buildReplica(replicaId, founders, extraRequest);
    return null;
  } catch (error) {
    // The port never existed: the replica leaves the transport.
    const replica = cluster.replica(replicaId);
    replica.db.close();
    cluster.replicas.delete(replicaId);
    return error;
  }
}

function assertRefusedAtOpen(cluster, replicaId, refused, entriesBefore) {
  assert.ok(refused !== null, `${replicaId} opened under a reused identity`);
  assert.equal(refused.consensus?.outcome,
    RAFT_OPERATION_OUTCOME.CORE_REFUSED, JSON.stringify(refused.consensus));
  assert.equal(refused.consensus?.reason, RESEED_REQUIRED);
  assert.equal(refused.consensus?.retryable, false);
  assert.deepEqual({...lifecycleRow(cluster, replicaId)}, RETIRED_FOR_RESEED,
    `${replicaId}'s hold is not durable`);
  assert.equal(createNodeCount(cluster, entriesBefore), 0,
    `${replicaId}'s opening entered the core`);
}

// The refused identity opened again on the same (new) file: its lifecycle
// row refuses everything, campaign and votes included.
async function assertStillHeld(cluster, replicaId, founders, extraRequest) {
  const again = reopen(cluster, replicaId, founders, extraRequest);
  assert.equal(again, null, 'a held identity\'s port exists and answers typed');
  const status = cluster.node(replicaId).readStatus();
  assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  assert.equal(status.reason, RESEED_REQUIRED);
  const campaign = await cluster.node(replicaId).campaign();
  assert.equal(campaign.reason, RESEED_REQUIRED);
  const tick = await cluster.node(replicaId).tick();
  assert.equal(tick.reason, RESEED_REQUIRED);
}

function keepsCommitting(cluster, leader, followers) {
  const before = commitOf(cluster, leader);
  cluster.propose(leader, {op: 'after-the-refusal'});
  return cluster.settle(() => [leader, ...followers].every((replicaId) =>
    commitOf(cluster, replicaId) > before), {rounds: SETTLE_ROUNDS});
}

function join(cluster, leader, founders, replicaId, extra = {}) {
  const stamp = cluster.node(leader)[RAFT_OPERATION
    .READ_COMMITTED_MEMBERSHIP]({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
  cluster.addReplica(replicaId, founders, {
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp, ...extra});
  return stamp;
}

function addVoter(cluster, leader, replicaId, others) {
  cluster.proposeConfigurationChange([{
    changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
    nodeId: cluster.raftPeerIdOf(replicaId)}], 0, leader);
  assert.ok(cluster.settle(() => [leader, ...others, replicaId].every((id) =>
    cluster.node(id).readStatus().confState.voters
      .includes(cluster.raftPeerIdOf(replicaId))) &&
    cluster.node(replicaId).readStatus().gateOpen === true,
  {rounds: SETTLE_ROUNDS}), `setup: ${replicaId} was not admitted`);
}

for (const [witness, partitionId] of [['A1 (seed founder reopen)', 'a1-seed'],
  ['A2 (provisioning GENESIS retry to a wiped target)', 'a2-prov']]) {
  test(`${witness}: a founder whose identity existed and whose record is ` +
    'gone is refused reseed-required at open and held; the rest of the ' +
    'group keeps its leader and commits', async () => {
    const founders = ['r0', 'r1', 'r2'].map((id) => `${partitionId}-${id}`);
    const cluster = formedCluster(partitionId, founders, FORMED_ENTRIES);
    try {
      const [r0, r1, r2] = founders;
      const terms = [r0, r1].map((id) => cluster.node(id).readStatus().term);
      const entriesBefore = cluster.coreEntries.length;
      const refused = wipeAndReopen(cluster, r2, founders, EXISTED);
      assertRefusedAtOpen(cluster, r2, refused, entriesBefore);
      cluster.tickers = [r0];
      assert.ok(keepsCommitting(cluster, r0, [r1]),
        'the surviving quorum no longer commits');
      assert.deepEqual(leadersByTerm(cluster), [[r0, terms[0]]]);
      assert.deepEqual([r0, r1].map((id) =>
        cluster.node(id).readStatus().term), terms, 'a term moved');
      await assertStillHeld(cluster, r2, founders, EXISTED);
    } finally {
      cluster.dispose();
    }
  });
}

test('A3: a stale COMMITTED stamp re-sent after the admitted target lost ' +
  'its data under the same identity is refused at open', async () => {
  const founders = ['a3s-a', 'a3s-b', 'a3s-c'];
  const cluster = formedCluster('a3-stale', founders, FORMED_ENTRIES);
  try {
    const staleStamp = join(cluster, 'a3s-a', founders, 'a3s-t');
    addVoter(cluster, 'a3s-a', 'a3s-t', ['a3s-b', 'a3s-c']);
    assert.ok(!staleStamp.voters.includes(cluster.raftPeerIdOf('a3s-t')),
      'setup: the stamp does not name the target a voter');
    const entriesBefore = cluster.coreEntries.length;
    const refused = wipeAndReopen(cluster, 'a3s-t', founders, {
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: staleStamp,
      ...EXISTED});
    assertRefusedAtOpen(cluster, 'a3s-t', refused, entriesBefore);
    cluster.tickers = ['a3s-a'];
    assert.ok(keepsCommitting(cluster, 'a3s-a', ['a3s-b', 'a3s-c']));
  } finally {
    cluster.dispose();
  }
});

test('A4 (S2, leader outside the opening configuration): {a,b,c}, d added, ' +
  'leadership transferred to d, c wiped and reopened - refused at open, ' +
  'not by a heartbeat', async () => {
  const founders = ['a4s-a', 'a4s-b', 'a4s-c'];
  const cluster = formedCluster('a4-outside', founders, FORMED_ENTRIES);
  try {
    join(cluster, 'a4s-a', founders, 'a4s-d');
    addVoter(cluster, 'a4s-a', 'a4s-d', ['a4s-b', 'a4s-c']);
    const transfer = cluster.node('a4s-a').transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: 'a4s-d'});
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    cluster.tickers = ['a4s-d'];
    assert.ok(cluster.settle(() =>
      cluster.node('a4s-d').readStatus().role === LEADER,
    {rounds: SETTLE_ROUNDS}), 'setup: d does not lead');
    const entriesBefore = cluster.coreEntries.length;
    const refused = wipeAndReopen(cluster, 'a4s-c', founders, EXISTED);
    assertRefusedAtOpen(cluster, 'a4s-c', refused, entriesBefore);
    cluster.tickers = ['a4s-a', 'a4s-b', 'a4s-d'];
    assert.ok(keepsCommitting(cluster, 'a4s-d', ['a4s-a', 'a4s-b']));
  } finally {
    cluster.dispose();
  }
});

test('A4 (S2, five voters, leader change after the wipe): c is refused at ' +
  'open and casts no vote in the election that follows', async () => {
  const founders = ['a45-a', 'a45-b', 'a45-c', 'a45-d', 'a45-e'];
  const cluster = formedCluster('a4-five', founders, FORMED_ENTRIES);
  try {
    const ids = peerIdsOf(cluster);
    const entriesBefore = cluster.coreEntries.length;
    const refused = wipeAndReopen(cluster, 'a45-c', founders, EXISTED);
    assertRefusedAtOpen(cluster, 'a45-c', refused, entriesBefore);
    const transfer = cluster.node('a45-a').transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: 'a45-b'});
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    const live = ['a45-a', 'a45-b', 'a45-d', 'a45-e'];
    cluster.tickers = live;
    assert.ok(cluster.settle(() =>
      cluster.node('a45-b').readStatus().role === LEADER,
    {rounds: SETTLE_ROUNDS}), 'setup: the leadership did not change');
    assert.ok(keepsCommitting(cluster, 'a45-b', ['a45-a', 'a45-d', 'a45-e']));
    // c has no port: nothing it could answer reached anyone, and the new
    // leader's progress names it only as the configured peer it cannot reach.
    assert.equal(cluster.replica('a45-c'), undefined);
    assert.ok(cluster.node('a45-b').readStatus().confState.voters
      .includes(ids['a45-c']), 'setup: c is still a configured voter');
  } finally {
    cluster.dispose();
  }
});

test('A6: legitimate openings stay open - a first genesis, a durable ' +
  'restart with the fact and its record, RF=1 likewise, and an O2 joiner',
async () => {
  const founders = ['a6-a', 'a6-b', 'a6-c'];
  const cluster = formedCluster('a6-legit', founders, FORMED_ENTRIES);
  const lone = formedCluster('a6-lone', ['a6-l'], FORMED_ENTRIES);
  try {
    const committed = commitOf(cluster, 'a6-c');
    cluster.replica('a6-c').node.close();
    cluster.replica('a6-c').db.close();
    assert.equal(reopen(cluster, 'a6-c', founders, EXISTED), null,
      'a durable restart with its record was refused');
    assert.equal(cluster.node('a6-c').readStatus().outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.ok(commitOf(cluster, 'a6-c') >= committed ||
      cluster.node('a6-c').readStatus().appliedIndex >= committed);
    cluster.tickers = ['a6-a'];
    assert.ok(keepsCommitting(cluster, 'a6-a', ['a6-b', 'a6-c']),
      'the restarted founder does not take part again');

    lone.replica('a6-l').node.close();
    lone.replica('a6-l').db.close();
    assert.equal(reopen(lone, 'a6-l', ['a6-l'], EXISTED), null);
    const campaign = await lone.node('a6-l').campaign();
    assert.equal(campaign.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(campaign));
    assert.equal(lone.node('a6-l').readStatus().role, LEADER);

    join(cluster, 'a6-a', founders, 'a6-t');
    const joiner = cluster.node('a6-t').readStatus();
    assert.equal(joiner.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(joiner.gateOpen, false);
    assert.ok(joiner.confState.learners.includes(joiner.peerId));
    addVoter(cluster, 'a6-a', 'a6-t', ['a6-b', 'a6-c']);
  } finally {
    cluster.dispose();
    lone.dispose();
  }
});

test('S: the seed\'s prior-existence fact is a services row for this ' +
  'replica on this node in a non-empty startup admission', () => {
  const row = {service_id: 'sys-r2', node_id: 'seed-1', status: 'active'};
  assert.equal(seedReplicaIdentityExisted({empty: true, rows: []},
    'sys-r2', 'seed-1'), false, 'a first boot proves nothing');
  assert.equal(seedReplicaIdentityExisted({empty: false, rows: [row]},
    'sys-r2', 'seed-1'), true);
  assert.equal(seedReplicaIdentityExisted({empty: false, rows: [row]},
    'sys-r2', 'seed-2'), false, 'another node\'s row proves nothing here');
  assert.equal(seedReplicaIdentityExisted({empty: false, rows: [row]},
    'sys-r1', 'seed-1'), false, 'an absent row proves nothing');
  assert.equal(seedReplicaIdentityExisted(null, 'sys-r2', 'seed-1'), false);
});
