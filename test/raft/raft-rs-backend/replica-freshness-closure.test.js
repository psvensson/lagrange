import {openReplicaDatabaseFixture} from '../../helpers/replica-database-fixture.js';
import {raftRsMembershipAdministration} from '../../../src/raft/raft-rs-membership-administration.js';
// Real construction and snapshot admission; no synthetic freshness owner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SQLiteConnection} from '../../../src/storage/sqlite-prepared-statement-owner.js';
import {createRaftRsOperationPort, openRaftRsReplicaDatabase} from
  '../../../src/raft/raft-rs-operation-port.js';
import {RAFT_COMMITTED_ENTRY_APPLY_MODE} from '../../../src/raft/raft-operation-port-request.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {genesisStamp} from '../../../src/raft/raft-committed-membership-stamp.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {inspectSnapshotReceiver} from '../../../src/raft/snapshot-receiver-admission.js';
import {prepareReplicaLifecycleForSnapshot, readDurableReplicaLifecycle} from
  '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {REPLICA_LIFECYCLE_TABLE} from '../../../src/raft/raft-rs-replica-lifecycle-constants.js';

const GROUP = 'freshness-closure';
const REPLICA = 'freshness-closure-r1';
const PEER = deriveRaftRsPeerId(REPLICA);
const descriptor = {raftRs: {groupId: GROUP, confState: {learners: [PEER], voters: []},
  peerReservations: [{replicaIdentity: REPLICA, peerId: PEER}]}};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-closure-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return path.join(root, 'replica.sqlite');
}
function construction(file) {
  return openReplicaDatabaseFixture({dbPath: file, groupId: GROUP, replicaIdentity: REPLICA}).db;
}
function port(db) {
  return createRaftRsOperationPort({groupId: GROUP, peerId: REPLICA,
    durableStorage: db, bootstrapPeerIds: [REPLICA],
    bootstrapMembership: genesisStamp([REPLICA], {}),
    timing: {heartbeatMs: 50, electionMinMs: 150, electionMaxMs: 300, tickIntervalMs: 10},
    resolvePeerAddress: () => 'local', sendToPeer: () => {},
    applyCommittedEntry: () => {},
    applyCommittedEntryMode: RAFT_COMMITTED_ENTRY_APPLY_MODE.SYNCHRONOUS,
    deferElection: true});
}
function admission(file, stagedDbPath = null) {
  return inspectSnapshotReceiver({replicaDbPath: file, descriptor,
    replicaIdentity: REPLICA, stagedDbPath});
}
function eraseHistory(file, shape) {
  if (shape === 'empty' || shape === 'truncated') {
    if (shape === 'truncated') construction(file).close();
    fs.writeFileSync(file, '');
    return;
  }
  const db = shape === 'lost-row' ? construction(file) : new Database(file);
  db.exec('CREATE TABLE application_rows (k TEXT PRIMARY KEY)');
  if (shape === 'lost-row') db.exec(`DELETE FROM ${REPLICA_LIFECYCLE_TABLE}`);
  db.close();
}
for (const shape of ['application-only', 'lost-row']) {
  test(`ordinary port cannot birth ${shape} storage`, (t) => {
    const file = fixture(t);
    eraseHistory(file, shape);
    const db = construction(file);
    t.after(() => {
      if (db.open) db.close();
    });
    const runtime = port(db);
    t.after(() => runtime.close());
    assert.equal(runtime.readStatus().outcome, OUTCOME.CORE_REFUSED,
      'missing history must refuse ordinary runtime opening');
    assert.equal(readDurableReplicaLifecycle(file, GROUP, REPLICA).state, 'unreadable',
      'runtime must not mint a NEVER_OPENED marker');
  });
}
for (const shape of ['application-only', 'lost-row', 'empty', 'truncated']) {
  test(`snapshot initial and staged admission refuse ${shape} receiver`, (t) => {
    const file = fixture(t);
    eraseHistory(file, shape);
    const before = fs.readFileSync(file);
    const staged = `${file}.staged`;
    const db = new SQLiteConnection(staged);
    const prepared = prepareReplicaLifecycleForSnapshot({db, groupId: GROUP,
      replicaIdentity: REPLICA, peerId: PEER});
    assert.equal(prepared.outcome, OUTCOME.CORE_OK, 'authorized staging control');
    db.close();
    const first = admission(file);
    const final = admission(file, staged);
    assert.deepEqual([first.outcome, final.outcome],
      [OUTCOME.CORE_REFUSED, OUTCOME.CORE_REFUSED], 'neither admission may infer fresh');
    assert.deepEqual(fs.readFileSync(file), before, 'observation changes no receiver bytes');
  });
}
test('exclusive allocation admits and ordinary reopen preserves its incarnation', (t) => {
  const file = fixture(t);
  const db = construction(file);
  const before = readDurableReplicaLifecycle(file, GROUP, REPLICA);
  db.close();
  assert.equal(admission(file).outcome, OUTCOME.CORE_OK);
  const reopened = construction(file);
  t.after(() => reopened.close());
  const runtime = port(reopened);
  t.after(() => runtime.close());
  assert.equal(runtime.readStatus().outcome, OUTCOME.CORE_OK);
  assert.equal(readDurableReplicaLifecycle(file, GROUP, REPLICA).incarnation, before.incarnation);
});

for (const shape of ['empty', 'truncated']) {
  test(`existing ${shape} file is refused by construction and direct runtime opening`, (t) => {
    const file = fixture(t);
    eraseHistory(file, shape);
    assert.throws(() => construction(file), {code: 'lifecycle-birth-unproven'});
    const db = new SQLiteConnection(file, {fileMustExist: true});
    const runtime = port(db);
    t.after(() => {
      runtime.close(); db.close();
    });
    assert.equal(runtime.readStatus().outcome, OUTCOME.CORE_REFUSED);
    assert.equal(readDurableReplicaLifecycle(file, GROUP, REPLICA).state, 'unreadable');
  });
}
test('retained-file construction never acquires a replacement for a missing file', (t) => {
  const file = fixture(t);
  assert.throws(() => openReplicaDatabaseFixture({dbPath: file, groupId: GROUP,
    replicaIdentity: REPLICA, fileMustExist: true}).db);
  assert.equal(fs.existsSync(file), false);
});
test('missing incarnation is refused without stamping a successor', (t) => {
  const file = fixture(t);
  const db = construction(file);
  db.exec(`UPDATE ${REPLICA_LIFECYCLE_TABLE} SET incarnation = NULL`);
  const runtime = port(db);
  t.after(() => {
    runtime.close(); db.close();
  });
  assert.equal(runtime.readStatus().outcome, OUTCOME.CORE_REFUSED);
  assert.equal(db.prepare(`SELECT incarnation FROM ${REPLICA_LIFECYCLE_TABLE}`).get().incarnation, null);
  db.pragma('wal_checkpoint(TRUNCATE)');
  assert.equal(admission(file).outcome, OUTCOME.CORE_REFUSED);
  assert.equal(readDurableReplicaLifecycle(file, GROUP, REPLICA).state, 'unreadable',
    'the same missing incarnation cannot authorize never-opened removal');
});

for (const earlier of [false, true]) {
  test(`missing lifecycle never replaces membership ownership: earlier=${earlier}`, (t) => {
    const file = fixture(t);
    const firstDb = earlier ? construction(`${file}.earlier`) : null;
    const first = earlier ? port(firstDb) : null;
    eraseHistory(file, 'application-only');
    const missingDb = construction(file);
    const missing = port(missingDb);
    t.after(() => {
      missing.close(); missingDb.close(); first?.close(); firstDb?.close();
    });
    assert.equal(missing.readStatus().outcome, OUTCOME.CORE_REFUSED);
    const reserve = () => raftRsMembershipAdministration.reservePeerIdentity({
      groupId: GROUP, localReplicaIdentity: REPLICA, joiningReplicaIdentity: 'new-peer'});
    assert.equal(reserve().outcome, earlier ? 'RESERVED' : 'NOT_MANAGED');
    const missingReservations = missingDb.prepare(
      'SELECT * FROM raft_rs_peer_identity WHERE replica_identity = ?').all('new-peer');
    assert.equal(missingReservations.length, 0, 'refused runtime cannot reserve');
    missing.close();
    assert.equal(reserve().outcome, earlier ? 'RESERVED' : 'NOT_MANAGED',
      'closing refused runtime preserves earlier owner or absence');
  });
}

test('construction without a custody owner refuses before file acquisition', (t) => {
  const file = fixture(t);
  assert.throws(() => openRaftRsReplicaDatabase({dbPath: file, groupId: GROUP,
    replicaIdentity: REPLICA}), /replica-database-custody-owner-required/);
  assert.equal(fs.existsSync(file), false);
});
