// The replica's own durable group record (raft-rs-durable-own-group-record.js)
// read from REAL replica database files a real rs-raft group wrote: a lone
// founder, the same founder after it admitted a second voter, a founder of
// three, and the crash window between a persisted configuration change and
// its apply. Nothing expected is read from the read's own implementation:
// the groups' shapes are the test's premises.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  DURABLE_OWN_HISTORY as HISTORY,
  DURABLE_OWN_MEMBERSHIP as MEMBERSHIP,
  readDurableOwnGroupRecord,
} from '../../../src/raft/raft-rs-durable-own-group-record.js';
import {raftRsLifecycleAdministration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';

const PARTITION_ID = 'own-record-partition';
const LONE = 'own-a';
const SECOND = 'own-b';
const ROUNDS = 400;

function electedCluster(t, replicaIds) {
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds});
  t.after(() => cluster.dispose());
  cluster.tickers = [replicaIds[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === replicaIds[0],
    {rounds: ROUNDS}), 'setup: the first founder leads');
  return cluster;
}

function read(cluster, replicaId, identity = replicaId) {
  return readDurableOwnGroupRecord(cluster.dbFileOf(replicaId), PARTITION_ID,
    identity);
}

function admitSecondVoter(cluster) {
  new RaftRsPeerIdentityRegistry(cluster.replica(LONE).db)
    .registerReplica(SECOND);
  assert.equal(cluster.node(LONE).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: SECOND,
    nodeId: 'node-b'}).result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
  'setup: the lone leader accepted the AddNode');
}

test('a lone founder reads SOLE_MEMBER with no history, before and after ' +
  'its election; the administration serves the same read', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [LONE]});
  t.after(() => cluster.dispose());
  const expected = {membership: MEMBERSHIP.SOLE_MEMBER, history: HISTORY.EMPTY};
  assert.deepEqual(read(cluster, LONE), expected, 'founded, never elected');
  cluster.tickers = [LONE];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === LONE,
    {rounds: ROUNDS}), 'setup: it leads');
  const record = read(cluster, LONE);
  assert.deepEqual(record, expected, 'elected (its empty first entry applied)');
  assert.equal(Object.isFrozen(record), true, 'the answer is frozen');
  assert.deepEqual(raftRsLifecycleAdministration.readReplicaOwnGroupRecord(
    cluster.dbFileOf(LONE), PARTITION_ID, LONE), expected);
});

test('a lone founder that applied a proposal holds history', (t) => {
  const cluster = electedCluster(t, [LONE]);
  cluster.propose(LONE, 'own-record-command');
  assert.ok(cluster.settle(() => cluster.replica(LONE).appliedCommands
    .includes('own-record-command'), {rounds: ROUNDS}), 'setup: applied');
  assert.deepEqual(read(cluster, LONE),
    {membership: MEMBERSHIP.SOLE_MEMBER, history: HISTORY.HELD});
});

test('a founder that admitted a second voter reads SHARED; with the applied ' +
  'row still as it was before the change applied it reads CHANGE_PENDING',
(t) => {
  const cluster = electedCluster(t, [LONE]);
  const file = cluster.dbFileOf(LONE);
  const select = `SELECT * FROM ${RAFT_RS_TABLE.APPLIED_STATE} WHERE group_id = ?`;
  const before = cluster.replica(LONE).db.prepare(select).get(PARTITION_ID);
  admitSecondVoter(cluster);
  assert.equal(read(cluster, LONE).membership, MEMBERSHIP.SHARED,
    'the applied configuration names the second voter');
  // The crash window: the AddNode entry is durable in the log, the applied
  // row is the one that was durable before it applied (its own earlier
  // bytes, restored on a copy of the file).
  cluster.replica(LONE).db.pragma('wal_checkpoint(TRUNCATE)');
  const crashed = `${file}.crash-window`;
  fs.copyFileSync(file, crashed);
  t.after(() => fs.rmSync(crashed, {force: true}));
  const db = new Database(crashed);
  const columns = Object.keys(before).filter((name) => name !== 'group_id');
  db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE} SET ${columns.map((name) =>
    `${name} = ?`).join(', ')} WHERE group_id = ?`)
    .run(...columns.map((name) => before[name]), PARTITION_ID);
  db.close();
  assert.deepEqual(readDurableOwnGroupRecord(crashed, PARTITION_ID, LONE),
    {membership: MEMBERSHIP.CHANGE_PENDING, history: HISTORY.HELD},
    'a sole voter\'s persisted change may already have enlarged the group');
});

test('a founder of three reads SHARED on every member, elected or not',
  (t) => {
    const founders = ['own-x', 'own-y', 'own-z'];
    const cluster = electedCluster(t, founders);
    for (const replicaId of founders) {
      assert.equal(read(cluster, replicaId).membership, MEMBERSHIP.SHARED,
        replicaId);
    }
  });

test('no lifecycle row for the identity, or no file, is NO_LIFECYCLE_ROW; a ' +
  'file that cannot be read throws', (t) => {
  const cluster = electedCluster(t, [LONE]);
  const none = {membership: MEMBERSHIP.NO_LIFECYCLE_ROW, history: HISTORY.EMPTY};
  assert.deepEqual(read(cluster, LONE, 'own-stranger'), none,
    'another identity');
  assert.deepEqual(readDurableOwnGroupRecord(
    `${cluster.dbFileOf(LONE)}.absent`, PARTITION_ID, LONE), none, 'no file');
  const garbage = `${cluster.dbFileOf(LONE)}.garbage`;
  fs.writeFileSync(garbage, Buffer.alloc(8192, 0x5a));
  t.after(() => fs.rmSync(garbage, {force: true}));
  assert.throws(() => readDurableOwnGroupRecord(garbage, PARTITION_ID, LONE),
    'unreadable is an error, never a state');
});
