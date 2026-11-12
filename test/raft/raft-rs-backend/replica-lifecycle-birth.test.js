import {SQLiteConnection} from '../../../src/storage/sqlite-prepared-statement-owner.js';
// The birth of a replica database and what the durable lifecycle read says
// of it (2026-11-12): the lifecycle owner's one birth writes the table and
// the replica's never-opened row in a database's first transaction; the read
// answers NEVER_OPENED only from that row in a database holding no consensus
// row, ABSENT only for a file that is positively not there, and UNREADABLE
// with its reason and cause for everything else. Every database here is
// made by the production creator (the administration's birthReplica, the
// lifecycle owner, the durable store); nothing is a hand-written table.

import {REPLICA_DATABASE_CREATION} from '../../../src/raft/raft-rs-replica-lifecycle-constants.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';


import {raftRsLifecycleAdministration as administration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';
import {
  DURABLE_LIFECYCLE_OPENING as OPENING,
  DURABLE_LIFECYCLE_READ,
  LIFECYCLE_BIRTH,
  LIFECYCLE_READ_SUBJECT as SUBJECT,
  RaftRsReplicaLifecycleOwner,
  readDurableReplicaLifecycle,
} from '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {
  LIFECYCLE_STATE,
  REPLICA_LIFECYCLE_TABLE,
} from '../../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {deriveRaftRsPeerId} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {
  DURABLE_FILE_PRESENCE as PRESENCE,
  DURABLE_FILE_PRESENCE_CAUSE,
  readDurableFilePresence,
} from '../../../src/storage/durable-file-presence.js';
import {readDurableParticipantCustodyAt} from
  '../../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_CUSTODY as CUSTODY} from
  '../../../src/partition/partition-participant-transaction-constants.js';
import {REPLICA_DB_PRAGMA} from
  '../../../src/storage/storage-constants.js';

const GROUP = 'birth-partition';
const REPLICA = 'birth-partition-r-a';
const OTHER = 'birth-partition-r-b';
const RUNS_AS_ROOT = process.getuid?.() === 0;
const SELECT_TABLE_SQL = 'SELECT sql FROM sqlite_master WHERE name = ?';

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-birth-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

// A replica database as its creator opens it: the file, the replica
// pragmas, then the birth - nothing else.
function born(file, replicaIdentity = REPLICA) {
  const db = new SQLiteConnection(file);
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  const birth = administration.birthReplica({db, creation: REPLICA_DATABASE_CREATION.NEW,
    groupId: GROUP,
    replicaIdentity});
  return {db, birth};
}

function read(file, replicaIdentity = REPLICA) {
  return readDurableReplicaLifecycle(file, GROUP, replicaIdentity);
}

function unreadable(reason, cause = null) {
  return {...DURABLE_LIFECYCLE_READ.UNREADABLE, reason, cause};
}

test('the birth writes the table and the replica\'s never-opened row; it ' +
  'is the port\'s own lifecycle record, and happens once', (t) => {
  const file = path.join(directory(t), 'born.sqlite');
  const {db, birth} = born(file);
  assert.equal(birth, LIFECYCLE_BIRTH.BORN);
  const lifecycle = read(file);
  assert.deepEqual({state: lifecycle.state, opening: lifecycle.opening,
    peerId: lifecycle.peerId, cause: lifecycle.cause},
  {state: LIFECYCLE_STATE.ACTIVE, opening: OPENING.NEVER_OPENED,
    peerId: deriveRaftRsPeerId(REPLICA), cause: null},
  'born active, never opened, bound to this replica\'s peer identity');
  assert.match(String(lifecycle.incarnation), /^[0-9a-f-]{36}$/u,
    'born with an incarnation');
  assert.equal(administration.isNeverOpened(lifecycle), true);
  assert.equal(administration.isAbsent(lifecycle), false);
  assert.equal(administration.birthReplica({db, creation: REPLICA_DATABASE_CREATION.NEW,
    groupId: GROUP,
    replicaIdentity: REPLICA}), LIFECYCLE_BIRTH.NOT_EMPTY,
  'a database that holds anything is not born again');
  // The port's lifecycle owner opens the born row: same row, same stamp.
  const owner = new RaftRsReplicaLifecycleOwner({db, groupId: GROUP,
    peerId: deriveRaftRsPeerId(REPLICA), replicaIdentity: REPLICA});
  assert.equal(owner.active, true, 'the port\'s owner admits the born row');
  assert.equal(owner.incarnation, lifecycle.incarnation,
    'the port reads the incarnation the birth minted');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${REPLICA_LIFECYCLE_TABLE}`)
    .get().n, 1, 'one row');
  // The same explicit birth operation owns every new database's schema.
  const unborn = born(path.join(path.dirname(file), 'port.sqlite')).db;
  new RaftRsReplicaLifecycleOwner({db: unborn, groupId: GROUP,
    peerId: deriveRaftRsPeerId(REPLICA), replicaIdentity: REPLICA});
  assert.equal(db.prepare(SELECT_TABLE_SQL).get(REPLICA_LIFECYCLE_TABLE).sql,
    unborn.prepare(SELECT_TABLE_SQL).get(REPLICA_LIFECYCLE_TABLE).sql);
  unborn.close();
  db.close();
});

test('a database that already holds anything is never born: it keeps no ' +
  'table, and reads TABLE_ABSENT', (t) => {
  const file = path.join(directory(t), 'formatted.sqlite');
  const db = new SQLiteConnection(file);
  db.exec('CREATE TABLE partition_rows (k TEXT PRIMARY KEY)');
  assert.equal(administration.birthReplica({db, creation: REPLICA_DATABASE_CREATION.NEW,
    groupId: GROUP,
    replicaIdentity: REPLICA}), LIFECYCLE_BIRTH.NOT_EMPTY);
  db.close();
  assert.deepEqual(read(file), unreadable('lifecycle-table-absent'));
  assert.equal(administration.isNeverOpened(read(file)), false);
  assert.equal(administration.isAbsent(read(file)), false);
});

test('never opened is the born row AND no consensus row: an established ' +
  'row, a consensus row beside a never-established row, and a retired row ' +
  'are each not never-opened', (t) => {
  const dir = directory(t);
  const established = path.join(dir, 'established.sqlite');
  const first = born(established).db;
  const owner = new RaftRsReplicaLifecycleOwner({db: first, groupId: GROUP,
    peerId: deriveRaftRsPeerId(REPLICA), replicaIdentity: REPLICA});
  first.transaction(() => owner.recordOpeningHistory(owner.incarnation))();
  first.close();
  assert.equal(read(established).opening, OPENING.OPENED,
    'native history established, no consensus row');
  assert.equal(administration.isNeverOpened(read(established)), false);

  const voted = path.join(dir, 'voted.sqlite');
  const second = born(voted).db;
  const store = new RaftRsDurableStore(second);
  assert.equal(read(voted).opening, OPENING.NEVER_OPENED,
    'the consensus tables exist and are empty');
  store.transaction(() => store.putHardState(GROUP,
    {term: '1', vote: deriveRaftRsPeerId(REPLICA), commit: '0'}));
  second.close();
  assert.equal(read(voted).opening, OPENING.OPENED,
    'a vote is durable beside a row never marked established');
  assert.equal(administration.isNeverOpened(read(voted)), false);

  const retired = path.join(dir, 'retired.sqlite');
  const third = born(retired).db;
  const retiring = new RaftRsReplicaLifecycleOwner({db: third, groupId: GROUP,
    peerId: deriveRaftRsPeerId(REPLICA), replicaIdentity: REPLICA});
  return retiring.retire('test-retirement').then(() => {
    third.close();
    const lifecycle = read(retired);
    assert.equal(lifecycle.state, LIFECYCLE_STATE.RETIRED);
    assert.equal(administration.isNeverOpened(lifecycle), false,
      'a retired row answers as retired, not as never opened');
    assert.equal(administration.isRetired(lifecycle), true);
  });
});

test('a database born for another replica identity, and one that lost the ' +
  'write-ahead log holding its birth, are UNREADABLE - never absent, never ' +
  'never-opened', (t) => {
  const dir = directory(t);
  const foreign = path.join(dir, 'foreign.sqlite');
  born(foreign, OTHER).db.close();
  assert.equal(read(foreign, OTHER).opening, OPENING.NEVER_OPENED,
    'setup: it is the other replica\'s never-opened database');
  assert.deepEqual(read(foreign), unreadable('lifecycle-row-absent'),
    'the marker of another replica identity');

  // The birth is durable only in the write-ahead log until a checkpoint: a
  // copy of the main file alone is the database that lost its log.
  const whole = path.join(dir, 'whole.sqlite');
  const {db} = born(whole);
  assert.ok(fs.statSync(`${whole}-wal`).size > 0,
    'setup: the birth is in the write-ahead log');
  const lost = path.join(dir, 'lost-wal.sqlite');
  fs.copyFileSync(whole, lost);
  db.close();
  assert.deepEqual(read(lost), unreadable('lifecycle-table-absent'),
    'the main file without its log holds no lifecycle table');
  for (const lifecycle of [read(foreign), read(lost)]) {
    assert.equal(administration.isAbsent(lifecycle), false);
    assert.equal(administration.isNeverOpened(lifecycle), false);
    assert.equal(administration.isRetired(lifecycle), false);
  }
});

test('only a positively missing file is ABSENT: a missing file or replica ' +
  'directory under a readable directory', (t) => {
  const dir = directory(t);
  assert.deepEqual(read(path.join(dir, 'missing.sqlite')),
    DURABLE_LIFECYCLE_READ.ABSENT, 'no file in a readable directory');
  assert.deepEqual(read(path.join(dir, 'no-group', 'missing.sqlite')),
    DURABLE_LIFECYCLE_READ.ABSENT,
    'the replica directory itself is gone (removed with its last database)');
  assert.deepEqual(fs.readdirSync(dir), [], 'the reads created nothing');
});

test('a lookup that failed is never an absent file: a path through a ' +
  'regular file, a directory in the file\'s place, a dangling link', (t) => {
  const dir = directory(t);
  const regular = path.join(dir, 'regular');
  fs.writeFileSync(regular, 'x');
  assert.deepEqual(read(path.join(regular, 'r.sqlite')),
    unreadable('lifecycle-database-unreadable',
      {code: 'ENOTDIR', subject: SUBJECT.FILE}));
  assert.deepEqual(read(path.join(regular, 'group', 'r.sqlite')),
    unreadable('lifecycle-database-unreadable',
      {code: 'ENOTDIR', subject: SUBJECT.FILE}),
    'also when the replica directory is the missing level');
  const occupied = path.join(dir, 'directory.sqlite');
  fs.mkdirSync(occupied);
  assert.deepEqual(read(occupied), unreadable('lifecycle-database-unreadable',
    {code: DURABLE_FILE_PRESENCE_CAUSE.NOT_A_REGULAR_FILE,
      subject: SUBJECT.FILE}));
  const link = path.join(dir, 'dangling.sqlite');
  fs.symlinkSync(path.join(dir, 'nowhere'), link);
  assert.deepEqual(read(link), unreadable('lifecycle-database-unreadable',
    {code: DURABLE_FILE_PRESENCE_CAUSE.NOT_A_REGULAR_FILE,
      subject: SUBJECT.FILE}));
  // A replica directory reached through a link to nothing (a data
  // directory linked to a volume that is not mounted).
  const unmounted = path.join(dir, 'linked-volume');
  fs.symlinkSync(path.join(dir, 'not-mounted'), unmounted);
  assert.deepEqual(read(path.join(unmounted, 'group', 'r.sqlite')),
    unreadable('lifecycle-database-unreadable',
      {code: DURABLE_FILE_PRESENCE_CAUSE.DANGLING_LINK, subject: SUBJECT.FILE}));
  // The removal's other read of the same file (participant custody) takes
  // the same answer: IDLE only for a positively absent database.
  assert.equal(readDurableParticipantCustodyAt(path.join(regular, 'r.sqlite')),
    CUSTODY.UNAVAILABLE, 'a failed lookup is not an idle participant');
  assert.equal(readDurableParticipantCustodyAt(link), CUSTODY.UNAVAILABLE);
  assert.equal(readDurableParticipantCustodyAt(
    path.join(dir, 'no-group', 'missing.sqlite')), CUSTODY.IDLE,
  'a positively absent database holds no reservation');
  assert.deepEqual(readDurableFilePresence(regular),
    {presence: PRESENCE.PRESENT, cause: null});
  assert.deepEqual(readDurableFilePresence(path.join(regular, 'r.sqlite')),
    {presence: PRESENCE.UNKNOWN, cause: {code: 'ENOTDIR',
      path: path.join(regular, 'r.sqlite')}});
});

// A process running as root searches every directory: the permission
// witness needs an unprivileged process.
test('a file under a directory this process may not search, or may not ' +
  'read, is never absent', {skip: RUNS_AS_ROOT}, (t) => {
  const dir = directory(t);
  const closed = path.join(dir, 'closed');
  fs.mkdirSync(closed);
  const file = path.join(closed, 'r.sqlite');
  born(file).db.close();
  try {
    fs.chmodSync(closed, 0o000);
    assert.equal(fs.existsSync(file), false,
      'premise: existsSync reads the unreachable file as missing');
    assert.deepEqual(read(file), unreadable('lifecycle-database-unreadable',
      {code: 'EACCES', subject: SUBJECT.FILE}),
    'the file is there, unreachable');
    assert.deepEqual(read(path.join(closed, 'group', 'missing.sqlite')),
      unreadable('lifecycle-database-unreadable',
        {code: 'EACCES', subject: SUBJECT.FILE}),
      'a missing level below an unsearchable directory');
    // Searchable but not readable: the name is missing, and the directory
    // that says so cannot be listed - not a positive absence.
    fs.chmodSync(closed, 0o300);
    assert.deepEqual(
      readDurableFilePresence(path.join(closed, 'other.sqlite')),
      {presence: PRESENCE.UNKNOWN, cause: {code: 'EACCES', path: closed}});
  } finally {
    fs.chmodSync(closed, 0o700);
  }
});
