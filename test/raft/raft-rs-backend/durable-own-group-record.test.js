// The replica's own durable group record (raft-rs-durable-own-group-record.js)
// read from REAL replica database files a real rs-raft group wrote: a lone
// founder, the same founder after a proposal, after compaction, after it
// admitted a second voter or a learner, in a joint configuration, a joiner
// not yet admitted, a founder of three, a born but never opened founder, and
// files that cannot be read. Nothing expected is read from the read's own
// implementation: the groups' shapes are the test's premises.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {test} from 'node:test';

import Database from 'better-sqlite3';
import {SQLiteConnection} from '../../../src/storage/sqlite-prepared-statement-owner.js';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {bindingWireNumbers} from './committed-membership-oracles.js';
import {
  DURABLE_OWN_HISTORY as HISTORY,
  DURABLE_OWN_MEMBERSHIP as MEMBERSHIP,
} from '../../../src/raft/raft-rs-durable-own-group-record.js';
import {raftRsLifecycleAdministration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';
import {
  LIFECYCLE_READ_SUBJECT,
  prepareReplicaLifecycleForOriginalAllocation,
} from '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_COMPACTION_OUTCOME} from
  '../../../src/raft/compaction-policy.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';

// The one public read of a replica's own group record.
const readDurableOwnGroupRecord =
  raftRsLifecycleAdministration.readReplicaOwnGroupRecord;

const PARTITION_ID = 'own-record-partition';
const LONE = 'own-a';
const SECOND = 'own-b';
const COMMAND = 'own-record-command';
const ROUNDS = 400;
const SOLE_EMPTY = Object.freeze({membership: MEMBERSHIP.SOLE_MEMBER,
  history: HISTORY.EMPTY, cause: null});
const SOLE_HELD = Object.freeze({membership: MEMBERSHIP.SOLE_MEMBER,
  history: HISTORY.HELD, cause: null});
const NO_ROW = Object.freeze({membership: MEMBERSHIP.NO_LIFECYCLE_ROW,
  history: HISTORY.UNKNOWN, cause: null});

// The unreadable record and why: the lifecycle read's reason and, when a
// read failed, the store's error code and what was being read.
function unreadable(reason, code = null, subject = null) {
  return {membership: MEMBERSHIP.UNREADABLE, history: HISTORY.UNKNOWN,
    cause: {reason, code, subject}};
}

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

function applyCommand(cluster, command = COMMAND) {
  cluster.propose(LONE, command);
  assert.ok(cluster.settle(() => cluster.replica(LONE).appliedCommands
    .includes(command), {rounds: ROUNDS}), 'setup: the command applied');
}

function admitSecondVoter(cluster) {
  new RaftRsPeerIdentityRegistry(cluster.replica(LONE).db)
    .registerReplica(SECOND);
  assert.equal(cluster.node(LONE).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: SECOND,
    nodeId: 'node-b'}).result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
  'setup: the lone leader accepted the AddNode');
}

// A copy of a replica's database as a crash leaves it: the main file and
// its write-ahead log, no shared-memory file.
function crashCopy(t, file, label) {
  const copy = `${file}.${label}`;
  fs.copyFileSync(file, copy);
  if (fs.existsSync(`${file}-wal`)) {
    fs.copyFileSync(`${file}-wal`, `${copy}-wal`);
  }
  t.after(() => ['', '-wal', '-shm'].forEach((suffix) =>
    fs.rmSync(`${copy}${suffix}`, {force: true})));
  return copy;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file))
    .digest('hex');
}

test('a lone founder reads SOLE_MEMBER with no history, before and after ' +
  'its election', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [LONE]});
  t.after(() => cluster.dispose());
  assert.deepEqual(read(cluster, LONE), SOLE_EMPTY, 'founded, never elected');
  cluster.tickers = [LONE];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === LONE,
    {rounds: ROUNDS}), 'setup: it leads');
  const record = read(cluster, LONE);
  assert.deepEqual(record, SOLE_EMPTY,
    'elected (its empty first entry applied)');
  assert.equal(Object.isFrozen(record), true, 'the answer is frozen');
});

test('a lone founder that applied a proposal holds history; compacted by ' +
  'the production compaction (no payload left in its log) it still does',
(t) => {
  const cluster = electedCluster(t, [LONE]);
  applyCommand(cluster);
  assert.deepEqual(read(cluster, LONE), SOLE_HELD, 'a payload in the log');
  const db = cluster.replica(LONE).db;
  const store = new RaftRsDurableStore(db);
  const {appliedIndex} = store.readDurableProgress(PARTITION_ID);
  assert.equal(store.compactCommittedPrefix(PARTITION_ID,
    {toIndex: appliedIndex}).outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
  'setup: the committed prefix was compacted');
  assert.equal(db.prepare(`SELECT COUNT(*) AS payloads FROM ${
    RAFT_RS_TABLE.LOG} WHERE group_id = ? AND data IS NOT NULL`)
    .get(PARTITION_ID).payloads, 0, 'setup: no payload is left in the log');
  assert.deepEqual(read(cluster, LONE), SOLE_HELD,
    'the snapshot the compaction left is the history');
});

test('a founder that admitted a second voter reads SHARED; with the applied ' +
  'row still as it was before the change applied, the persisted change is ' +
  'history', (t) => {
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
  const crashed = crashCopy(t, file, 'crash-window');
  const db = new Database(crashed);
  const columns = Object.keys(before).filter((name) => name !== 'group_id');
  db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE} SET ${columns.map((name) =>
    `${name} = ?`).join(', ')} WHERE group_id = ?`)
    .run(...columns.map((name) => before[name]), PARTITION_ID);
  db.close();
  assert.deepEqual(readDurableOwnGroupRecord(crashed, PARTITION_ID, LONE),
    SOLE_HELD, 'a sole voter\'s persisted change may already have enlarged ' +
      'the group: never an empty history');
});

test('a sole voter with a learner reads SHARED', (t) => {
  const cluster = electedCluster(t, [LONE]);
  cluster.addReplica(SECOND, [LONE]);
  const wire = bindingWireNumbers();
  cluster.proposeConfigurationChange([{
    changeType: wire.changeType.AddLearnerNode,
    nodeId: cluster.raftPeerIdOf(SECOND)}], wire.transition.Auto, LONE);
  assert.ok(cluster.settle(() =>
    cluster.coreConfState(LONE).learners.length === 1, {rounds: ROUNDS}),
  'setup: the leader applied the learner');
  assert.deepEqual(cluster.coreConfState(LONE).voters.map(String),
    [String(cluster.raftPeerIdOf(LONE))], 'setup: it is still the only voter');
  assert.equal(read(cluster, LONE).membership, MEMBERSHIP.SHARED);
});

test('a joiner whose configuration names only ANOTHER replica reads SHARED',
  (t) => {
    const cluster = electedCluster(t, [LONE]);
    cluster.addReplica(SECOND, [LONE]);
    assert.deepEqual(cluster.coreConfState(SECOND).voters.map(String),
      [String(cluster.raftPeerIdOf(LONE))],
      'setup: its one voter is the founder, not itself');
    assert.equal(read(cluster, SECOND).membership, MEMBERSHIP.SHARED);
  });

test('the only incoming voter of a joint configuration reads SHARED: the ' +
  'outgoing voters are members', (t) => {
  const cluster = electedCluster(t, [LONE]);
  cluster.addReplica(SECOND, [LONE]);
  cluster.tickers = [LONE];
  admitSecondVoter(cluster);
  assert.ok(cluster.settle(() =>
    cluster.coreConfState(SECOND).voters.length === 2, {rounds: ROUNDS}),
  'setup: both voters applied the admission');
  applyCommand(cluster, 'joint-setup-heard-voters');
  const wire = bindingWireNumbers();
  cluster.proposeConfigurationChange([{
    changeType: wire.changeType.RemoveNode,
    nodeId: cluster.raftPeerIdOf(SECOND)}], wire.transition.Explicit, LONE);
  assert.ok(cluster.settle(() =>
    cluster.coreConfState(LONE).votersOutgoing.length > 0, {rounds: ROUNDS}),
  'setup: the leader applied the joint configuration');
  assert.deepEqual(cluster.coreConfState(LONE).voters.map(String),
    [String(cluster.raftPeerIdOf(LONE))],
    'setup: it is the only incoming voter');
  assert.equal(read(cluster, LONE).membership, MEMBERSHIP.SHARED);
});

test('a founder of three reads SHARED on every member', (t) => {
  const founders = ['own-x', 'own-y', 'own-z'];
  const cluster = electedCluster(t, founders);
  for (const replicaId of founders) {
    assert.equal(read(cluster, replicaId).membership, MEMBERSHIP.SHARED,
      replicaId);
  }
});

test('a founder born but never opened, its record tables empty, reads ' +
  'NO_CONFIGURATION', (t) => {
  const file = `${fs.mkdtempSync(`${process.env.TMPDIR ?? '/tmp'}/own-record-`)}/born.sqlite`;
  t.after(() => fs.rmSync(file.slice(0, file.lastIndexOf('/')),
    {recursive: true, force: true}));
  const db = new SQLiteConnection(file);
  const born = db.transaction(() => prepareReplicaLifecycleForOriginalAllocation({
    db, groupId: PARTITION_ID, peerId: '7', replicaIdentity: LONE}))();
  assert.equal(born.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the lifecycle owner bore the row');
  assert.deepEqual(readDurableOwnGroupRecord(file, PARTITION_ID, LONE),
    unreadable('lifecycle-database-unreadable', 'SQLITE_ERROR',
      LIFECYCLE_READ_SUBJECT.BESIDE),
    'without its record tables the record cannot be read, and the cause ' +
      'names the record read');
  new RaftRsDurableStore(db).readDurableProgress(PARTITION_ID);
  db.close();
  assert.deepEqual(readDurableOwnGroupRecord(file, PARTITION_ID, LONE),
    {membership: MEMBERSHIP.NO_CONFIGURATION, history: HISTORY.EMPTY,
      cause: null});
});

test('no file is NO_LIFECYCLE_ROW; a file that cannot be read, holds no ' +
  'lifecycle table, or holds no row for the identity is UNREADABLE with ' +
  'its cause', (t) => {
  const cluster = electedCluster(t, [LONE]);
  assert.deepEqual(read(cluster, LONE, 'own-stranger'),
    unreadable('lifecycle-row-absent'),
    'another identity: the database is not this replica\'s');
  const absent = `${cluster.dbFileOf(LONE)}.absent`;
  assert.deepEqual(readDurableOwnGroupRecord(absent, PARTITION_ID, LONE),
    NO_ROW, 'no file');
  assert.equal(fs.existsSync(absent), false, 'the read created no database');
  const garbage = `${cluster.dbFileOf(LONE)}.garbage`;
  fs.writeFileSync(garbage, Buffer.alloc(8192, 0x5a));
  const empty = `${cluster.dbFileOf(LONE)}.empty`;
  fs.writeFileSync(empty, '');
  t.after(() => [garbage, empty].forEach((file) =>
    ['', '-wal', '-shm'].forEach((suffix) =>
      fs.rmSync(`${file}${suffix}`, {force: true}))));
  assert.deepEqual(readDurableOwnGroupRecord(garbage, PARTITION_ID, LONE),
    unreadable('lifecycle-database-unreadable', 'SQLITE_NOTADB',
      LIFECYCLE_READ_SUBJECT.SCHEMA), 'not a database');
  assert.deepEqual(readDurableOwnGroupRecord(empty, PARTITION_ID, LONE),
    unreadable('lifecycle-table-absent'),
    'a readable database without the lifecycle table');
  assert.deepEqual(readDurableOwnGroupRecord(
    `${cluster.dbFileOf(LONE)}/below-a-file.sqlite`, PARTITION_ID, LONE),
  unreadable('lifecycle-database-unreadable', 'ENOTDIR',
    LIFECYCLE_READ_SUBJECT.FILE),
  'a path through a regular file is not an absent file');
});

test('the read changes no byte of the database and reads what an unclean ' +
  'shutdown left in the write-ahead log', (t) => {
  const cluster = electedCluster(t, [LONE]);
  const file = cluster.dbFileOf(LONE);
  cluster.replica(LONE).db.pragma('wal_checkpoint(TRUNCATE)');
  applyCommand(cluster);
  // Main file (checkpointed before the command) + the log that holds the
  // command, no shared-memory file: an unclean shutdown.
  const crashed = crashCopy(t, file, 'unclean');
  assert.ok(fs.statSync(`${crashed}-wal`).size > 0,
    'setup: the command is only in the write-ahead log');
  const before = sha256(crashed);
  assert.deepEqual(readDurableOwnGroupRecord(crashed, PARTITION_ID, LONE),
    SOLE_HELD, 'the log\'s content is read, not the stale main file');
  assert.equal(sha256(crashed), before, 'the database file is unchanged');
});
