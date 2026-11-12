// The prepared statements of one SQLite handle are prepared once and never
// outlive it.
//
// Read through the production readers that use the owner: the raft durable
// store, the peer-identity registry and the CDC obligation ledger. `prepare`
// is counted on the real better-sqlite3 handle; a replaced database file is a
// real file renamed over the old one and reopened, as a snapshot install does.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';

import {
  ensureCdcObligationLedger,
  insertCdcObligation,
  readCdcLedgerNewest,
  readOwedCdcObligations,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {RAFT_RS_SQL, RAFT_RS_TABLE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_PEER_IDENTITY_RESOLUTION} from
  '../../src/raft/raft-rs-peer-identity-constants.js';
import {RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {
  preparedExactStatementOf,
  preparedStatementOf,
} from '../../src/storage/sqlite-prepared-statement-owner.js';

const GROUP_ID = 'statement-owner-group';
const REPLICA = 'statement-owner-group_r1';
const OTHER_REPLICA = 'statement-owner-group_r2';
const NODE_ID = 'node-a';
const TERM = '2';
const REPEATED_READS = 50;
const CONF_STATE = Object.freeze({voters: ['1'], learners: [], votersOutgoing: [],
  learnersNext: [], autoLeave: false});
const CLOSED_HANDLE = /The database connection is not open/u;
const SELECT_VALUE = 'SELECT value FROM facts WHERE name = ?';

function countingPrepares(db) {
  const counted = {count: 0};
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    counted.count += 1;
    return prepare(sql);
  };
  return counted;
}

function snapshotAt(index) {
  return {metadata: {index, term: TERM, confState: CONF_STATE}};
}

// One replica file as an opened replica holds it: its Raft record with a
// snapshot row, and its own reserved peer identity with a committed node.
function openReplica(file, snapshotIndex, replica) {
  const db = new SQLiteConnection(file);
  const store = new RaftRsDurableStore(db);
  store.putSnapshot(GROUP_ID, snapshotAt(snapshotIndex));
  const registry = new RaftRsPeerIdentityRegistry(db);
  const peerId = registry.registerReplica(replica);
  registry.recordCommittedNodeId(replica, NODE_ID);
  return {db, store, registry, peerId};
}

function withTemporaryDirectory(work) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'statement-owner-'));
  try {
    return work(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('repeated raft status reads prepare nothing after the first', () => {
  const {db, store, registry, peerId} = openReplica(':memory:', '7', REPLICA);
  const read = () => ({
    snapshotIndex: store.readSnapshotIndex(GROUP_ID),
    resolution: registry.resolvePeer(peerId),
    nodeId: registry.committedNodeIdOf(REPLICA),
    progress: store.readDurableProgress(GROUP_ID),
  });
  const first = read();
  const prepares = countingPrepares(db);
  for (let index = 0; index < REPEATED_READS; index += 1) {
    assert.deepEqual(read(), first);
  }
  assert.equal(prepares.count, 0);
  assert.equal(first.snapshotIndex, 7n);
  assert.deepEqual(first.resolution,
    {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED, replicaIdentity: REPLICA,
      nodeId: NODE_ID});
  assert.equal(first.nodeId, NODE_ID);
  db.close();
});

test('repeated CDC ledger reads prepare nothing after the first, and see a ' +
  'ledger created after an absent read', () => {
  const db = new SQLiteConnection(':memory:');
  assert.equal(readCdcLedgerNewest(db), null);
  assert.deepEqual(readOwedCdcObligations(db), []);
  ensureCdcObligationLedger(db, {index: 3, term: 2, entryId: 'entry-3'});
  insertCdcObligation(db, {eventKey: 'event-3', logIndex: 3, term: 2, ordinal: 0,
    entryId: 'entry-3', eventJson: '{}'});
  const first = {newest: readCdcLedgerNewest(db), owed: readOwedCdcObligations(db)};
  assert.equal(first.newest.eventKey, 'event-3');
  assert.equal(first.owed.length, 1);
  const prepares = countingPrepares(db);
  for (let index = 0; index < REPEATED_READS; index += 1) {
    assert.deepEqual({newest: readCdcLedgerNewest(db), owed: readOwedCdcObligations(db)},
      first);
  }
  assert.equal(prepares.count, 0);
  db.close();
});

test('a ledger whose creating transaction rolled back reads absent again', () => {
  const db = new SQLiteConnection(':memory:');
  db.exec('BEGIN');
  ensureCdcObligationLedger(db, {index: 3, term: 2, entryId: 'entry-3'});
  insertCdcObligation(db, {eventKey: 'event-3', logIndex: 3, term: 2, ordinal: 0,
    entryId: 'entry-3', eventJson: '{}'});
  assert.equal(readCdcLedgerNewest(db).eventKey, 'event-3');
  db.exec('ROLLBACK');
  assert.equal(readCdcLedgerNewest(db), null);
  assert.deepEqual(readOwedCdcObligations(db), []);
  db.close();
});

test('a replaced and reopened database file is read through its own ' +
  'statements, and the closed handle\'s statements refuse', () => {
  withTemporaryDirectory((directory) => {
    const file = path.join(directory, 'replica.db');
    const image = path.join(directory, 'image.db');
    const before = openReplica(file, '7', REPLICA);
    assert.equal(before.store.readSnapshotIndex(GROUP_ID), 7n);
    assert.equal(before.registry.raftPeerIdOf(REPLICA), before.peerId);
    const heldIndexStatement =
      preparedExactStatementOf(before.db, RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX);

    // The install: another image is built, the open replica is closed, the
    // image replaces its file, and the file is reopened.
    const built = openReplica(image, '41', OTHER_REPLICA);
    built.db.close();
    before.db.close();
    fs.renameSync(image, file);
    const db = new SQLiteConnection(file);
    const store = new RaftRsDurableStore(db);
    const registry = new RaftRsPeerIdentityRegistry(db);

    assert.equal(store.readSnapshotIndex(GROUP_ID), 41n);
    assert.equal(RaftRsDurableStore.readSnapshotIndexIn(db, GROUP_ID), 41n);
    assert.equal(store.readDurableRecord(GROUP_ID).snapshot.metadata.index, '41');
    assert.equal(registry.raftPeerIdOf(REPLICA), null);
    assert.equal(registry.raftPeerIdOf(OTHER_REPLICA), built.peerId);
    assert.equal(registry.committedNodeIdOf(OTHER_REPLICA), NODE_ID);
    assert.notEqual(
      preparedExactStatementOf(db, RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX), heldIndexStatement);

    // The closed handle answers as it did before statements were held: its
    // store reads no snapshot, and a statement of it cannot run.
    assert.equal(before.store.readSnapshotIndex(GROUP_ID), 0n);
    assert.throws(() => heldIndexStatement.get(GROUP_ID), CLOSED_HANDLE);
    assert.throws(() => before.registry.raftPeerIdOf(REPLICA), CLOSED_HANDLE);
    assert.throws(() => before.store.readDurableRecord(GROUP_ID), CLOSED_HANDLE);
    db.close();
  });
});

test('a store opened on a record without its snapshot table reads no ' +
  'snapshot index', () => {
  const db = new SQLiteConnection(':memory:');
  db.exec(RAFT_RS_SQL.CREATE_LOG_TABLE);
  const store = new RaftRsDurableStore(db);
  assert.equal(store.readSnapshotIndex(GROUP_ID), 0n);
  assert.equal(RaftRsDurableStore.readSnapshotIndexIn(db, GROUP_ID), 0n);
  assert.throws(() => store.readDurableRecord(GROUP_ID),
    (error) => error.table === RAFT_RS_TABLE.HARD_STATE);
  db.close();
});

test('one handle holds one statement per text and integer mode, and a held ' +
  'statement reads a migrated schema', () => {
  const db = new SQLiteConnection(':memory:');
  db.exec('CREATE TABLE facts (name TEXT PRIMARY KEY, value INTEGER)');
  db.prepare('INSERT INTO facts VALUES (?, ?)').run('answer', 42);
  const statement = preparedStatementOf(db, SELECT_VALUE);
  const exact = preparedExactStatementOf(db, SELECT_VALUE);
  assert.equal(preparedStatementOf(db, SELECT_VALUE), statement);
  assert.equal(preparedExactStatementOf(db, SELECT_VALUE), exact);
  assert.notEqual(statement, exact);
  assert.deepEqual(statement.get('answer'), {value: 42});
  assert.deepEqual(exact.get('answer'), {value: 42n});
  assert.deepEqual(statement.get('answer'), {value: 42});

  const all = preparedStatementOf(db, 'SELECT * FROM facts');
  db.exec('ALTER TABLE facts ADD COLUMN note TEXT DEFAULT \'added\'');
  assert.deepEqual(all.all(), [{name: 'answer', value: 42, note: 'added'}]);

  const other = new SQLiteConnection(':memory:');
  other.exec('CREATE TABLE facts (name TEXT PRIMARY KEY, value INTEGER)');
  assert.notEqual(preparedStatementOf(other, SELECT_VALUE), statement);
  assert.equal(preparedStatementOf(other, SELECT_VALUE).get('answer'), undefined);
  db.close();
  other.close();
});
