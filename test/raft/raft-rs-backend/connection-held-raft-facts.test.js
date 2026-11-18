// The two raft facts the per-turn and per-message paths read from memory,
// held by the connection's cache (src/storage/sqlite-connection-cache.js):
//
//   the snapshot index (raft-rs-snapshot-witness.js) - read every raft turn by
//     the runtime's compaction check. Read from storage once per connection;
//     a compaction (made through another store on the same connection, as the
//     snapshot cadence does), a Ready's snapshot or an installed snapshot is
//     observed by the next read; a rolled-back snapshot write never is; a
//     reopened connection reads the durable value;
//   the peer-identity view (raft-rs-peer-identity.js) - read for every
//     outbound message and every status. A reservation, a committed node or a
//     committed membership change is observed by the next lookup, from any
//     registry on the connection; a rolled-back reservation never is.
//
// Prepares are counted on the connection (one compile per statement) and
// executions through better-sqlite3's verbose hook (one derivation per write).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_SQL} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_RS_ENTRY_TYPE} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_RS_PEER_IDENTITY_RESOLUTION as RESOLUTION} from
  '../../../src/raft/raft-rs-peer-identity-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const GROUP_ID = 'held-facts-group';
const TERM = '2';
const CONF_STATE = Object.freeze({voters: ['1'], learners: [], votersOutgoing: [],
  learnersNext: [], autoLeave: false});
const LAST_INDEX = 6;
const COMPACT_TO = 4;
const INSTALLED_INDEX = '9';
const LOOKUPS = 40;
const REPLICA_A = 'held-facts/replica-a';
const REPLICA_B = 'held-facts/replica-b';
const REPLICA_C = 'held-facts/replica-c';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const FOUNDERS = Object.freeze(['hf-a', 'hf-b', 'hf-c']);
const LEARNER = 'hf-learner';
const LEARNER_NODE = 'node-learner';
const ROUNDS = 400;

function openCounted(t, file) {
  const executed = [];
  const db = new Database(file, {verbose: (sql) => executed.push(sql)});
  const prepares = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    prepares.push(sql);
    return prepare(sql);
  };
  t.after(() => {
    if (db.open) db.close();
  });
  return {db, prepares, executed};
}

function tempFile(t, name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'held-raft-facts-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return path.join(directory, name);
}

function countOf(list, sql) {
  return list.filter((entry) => entry === sql).length;
}

function populatedStore(db) {
  const store = new RaftRsDurableStore(db);
  store.transaction(() => {
    store.appendEntries(GROUP_ID, Array.from({length: LAST_INDEX}, (_, offset) => ({
      index: String(offset + 1), term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL})));
    store.putHardState(GROUP_ID, {term: TERM, vote: '1', commit: String(LAST_INDEX)});
    store.putAppliedState(GROUP_ID, String(LAST_INDEX), CONF_STATE);
  });
  return store;
}

test('the snapshot index is read from storage once and follows compaction', (t) => {
  const {db, prepares, executed} = openCounted(t, ':memory:');
  const store = populatedStore(db);
  executed.length = 0;
  for (let lookup = 0; lookup < LOOKUPS; lookup += 1) {
    assert.equal(store.readSnapshotIndex(GROUP_ID), 0n);
  }
  assert.equal(countOf(prepares, RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX), 1,
    'one compile per connection');
  assert.equal(executed.length, 2,
    'one storage read (table check and row) for all the turns that asked');

  // The snapshot cadence compacts through a store of its own on the same
  // connection (snapshot-compaction.js); the runtime's store sees it.
  const compacted = new RaftRsDurableStore(db).compactCommittedPrefix(GROUP_ID,
    {toIndex: COMPACT_TO});
  assert.equal(compacted.changed, true, JSON.stringify(compacted));
  assert.equal(store.readSnapshotIndex(GROUP_ID), BigInt(COMPACT_TO),
    'the compaction is observed by the next read');
  assert.equal(RaftRsDurableStore.readSnapshotIndexIn(db, GROUP_ID),
    BigInt(COMPACT_TO), 'by every reader of the connection');
  assert.equal(countOf(prepares, RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX), 1,
    'still one compile');
});

test('a Ready\'s snapshot and an installed snapshot are observed at once; a ' +
  'rolled-back snapshot write never is', (t) => {
  const {db} = openCounted(t, ':memory:');
  const store = populatedStore(db);
  assert.equal(store.readSnapshotIndex(GROUP_ID), 0n);
  store.persistReady(GROUP_ID, {snapshot: {metadata: {index: String(COMPACT_TO),
    term: TERM, confState: CONF_STATE}}, entries: []});
  assert.equal(store.readSnapshotIndex(GROUP_ID), BigInt(COMPACT_TO),
    'a Ready that carries a snapshot');

  assert.throws(() => store.transaction(() => {
    store.putSnapshot(GROUP_ID, {metadata: {index: INSTALLED_INDEX, term: TERM,
      confState: CONF_STATE}});
    assert.equal(store.readSnapshotIndex(GROUP_ID), BigInt(INSTALLED_INDEX),
      'inside its transaction the connection reads its own write');
    throw new Error('install failed');
  }), /install failed/u);
  assert.equal(store.readSnapshotIndex(GROUP_ID), BigInt(COMPACT_TO),
    'the rolled-back snapshot is not observed');

  store.transaction(() => store.putSnapshot(GROUP_ID, {metadata: {
    index: INSTALLED_INDEX, term: TERM, confState: CONF_STATE}}));
  assert.equal(store.readSnapshotIndex(GROUP_ID), BigInt(INSTALLED_INDEX),
    'the installed snapshot is observed');
});

test('a reopened connection reads the compacted index from storage', (t) => {
  const file = tempFile(t, 'replica.sqlite');
  const first = openCounted(t, file);
  const store = populatedStore(first.db);
  assert.equal(store.readSnapshotIndex(GROUP_ID), 0n);
  store.compactCommittedPrefix(GROUP_ID, {toIndex: COMPACT_TO});
  first.db.close();
  assert.equal(RaftRsDurableStore.readSnapshotIndexIn(first.db, GROUP_ID), 0n,
    'a closed connection answers as it always has');

  const reopened = openCounted(t, file);
  const restarted = new RaftRsDurableStore(reopened.db);
  for (let lookup = 0; lookup < LOOKUPS; lookup += 1) {
    assert.equal(restarted.readSnapshotIndex(GROUP_ID), BigInt(COMPACT_TO));
  }
  assert.equal(countOf(reopened.prepares, RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX), 1,
    'initialized from storage once');
});

test('a peer-identity lookup is answered from memory and follows every ' +
  'registry write on the connection', (t) => {
  const file = tempFile(t, 'identity.sqlite');
  const {db, executed} = openCounted(t, file);
  const runtime = new RaftRsPeerIdentityRegistry(db);
  const peerA = runtime.registerReplica(REPLICA_A);
  const peerB = deriveRaftRsPeerId(REPLICA_B);
  executed.length = 0;
  for (let lookup = 0; lookup < LOOKUPS; lookup += 1) {
    assert.equal(runtime.resolveReplicaIdentity(peerA).replicaIdentity, REPLICA_A);
    assert.equal(runtime.committedNodeIdOf(REPLICA_A), null);
    assert.equal(runtime.resolveReplicaIdentity(peerB).status, RESOLUTION.UNRESERVED);
  }
  assert.equal(executed.length, 1, 'one storage read for every lookup');

  // Another registry on the same connection (as a fixture or the original
  // allocation does) writes; the runtime's lookups observe it at once.
  const other = new RaftRsPeerIdentityRegistry(db);
  other.registerReplica(REPLICA_B);
  assert.deepEqual(runtime.resolveReplicaIdentity(peerB),
    {status: RESOLUTION.RESERVED, replicaIdentity: REPLICA_B});
  assert.equal(runtime.replicaIdentityOf(peerB), REPLICA_B);
  other.recordCommittedNodeIds([[REPLICA_A, NODE_A]]);
  assert.equal(runtime.committedNodeIdOf(REPLICA_A), NODE_A,
    'a committed node is observed by the next lookup');

  // A committed membership context applies inside the apply transaction; a
  // failed apply rolls it back and nothing of it is observed.
  const peerC = deriveRaftRsPeerId(REPLICA_C);
  assert.throws(() => db.transaction(() => {
    runtime.reserveCommittedReplica(REPLICA_C, peerC);
    runtime.recordCommittedNodeId(REPLICA_C, NODE_B);
    assert.equal(runtime.resolveReplicaIdentity(peerC).replicaIdentity, REPLICA_C,
      'the apply reads its own reservation');
    assert.equal(runtime.committedNodeIdOf(REPLICA_C), NODE_B);
    throw new Error('apply failed');
  })(), /apply failed/u);
  assert.equal(runtime.resolveReplicaIdentity(peerC).status, RESOLUTION.UNRESERVED,
    'the rolled-back reservation is not observed');
  assert.equal(runtime.committedNodeIdOf(REPLICA_C), null);

  db.close();
  const reopened = new RaftRsPeerIdentityRegistry(openCounted(t, file).db);
  assert.equal(reopened.resolveReplicaIdentity(peerB).replicaIdentity, REPLICA_B);
  assert.equal(reopened.committedNodeIdOf(REPLICA_A), NODE_A,
    'a reopened connection reads the durable rows');
});

function observer(cluster, replicaId) {
  return new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db);
}

test('a committed membership change is observed by the next status and address ' +
  'lookup of every replica', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: 'held-facts-partition',
    replicaIds: FOUNDERS});
  t.after(() => cluster.dispose());
  const [leader] = FOUNDERS;
  cluster.node(leader).campaign();
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === leader,
    {rounds: ROUNDS}), 'setup: the first founder leads');
  const learnerPeer = deriveRaftRsPeerId(LEARNER);
  for (const replicaId of FOUNDERS) {
    // Each runtime has read its peers (status, delivery) before the change.
    assert.equal(cluster.node(replicaId).readStatus().peers.length,
      FOUNDERS.length - 1);
    assert.equal(observer(cluster, replicaId).resolveReplicaIdentity(learnerPeer)
      .status, RESOLUTION.UNRESERVED, 'setup: nobody holds the learner yet');
  }
  // The leader reserves the learner before proposing it, through a registry
  // of its own on the connection (what the reservation owner does).
  observer(cluster, leader).registerReplica(LEARNER);
  assert.equal(observer(cluster, leader).resolveReplicaIdentity(learnerPeer)
    .replicaIdentity, LEARNER);

  const proposed = turnChainValue(cluster.node(leader).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: LEARNER,
    nodeId: LEARNER_NODE}));
  assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    JSON.stringify(proposed));
  assert.ok(cluster.settle(() => FOUNDERS.every((replicaId) =>
    cluster.node(replicaId).readStatus().confState.learners.includes(learnerPeer)),
  {rounds: ROUNDS}), 'every founder applied the learner');
  for (const replicaId of FOUNDERS) {
    const peer = cluster.node(replicaId).readStatus().peers
      .find(({peerId}) => peerId === learnerPeer);
    assert.equal(peer?.replicaIdentity, LEARNER,
      `${replicaId}: the runtime's status names the learner`);
    assert.equal(peer?.address, cluster.addressOf(LEARNER),
      `${replicaId}: and addresses it`);
    assert.equal(observer(cluster, replicaId).committedNodeIdOf(LEARNER),
      LEARNER_NODE, `${replicaId}: the committed node is observed`);
  }
});
