import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import * as stagingLifecycleOperation from
  '../../../src/raft/raft-rs-snapshot-staging-lifecycle-operation.js';
import {deriveRaftRsPeerId, RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from
  '../../../src/raft/snapshot-install-constants.js';

const GROUP = 'staging-lifecycle-group';
const {stageRaftRsSnapshotLifecycle} = stagingLifecycleOperation;
const REPLICA = 'staging-receiver';
const PEER = deriveRaftRsPeerId(REPLICA);
const CONF_STATE = Object.freeze({voters: ['1', '2', '3'], learners: [PEER],
  votersOutgoing: [], learnersNext: [], autoLeave: false});

function authority() {
  return {operationId: 'op-stage', operationType: 'REPLACE',
    entityType: 'message-group', entityId: GROUP, partitionId: GROUP,
    replicaId: REPLICA, targetNodeId: 'node-stage',
    admissionToken: 'admission-stage', attemptToken: 'attempt-stage',
    attemptSeq: 1, workflowUpdatedAt: 10, replicaCreatedAt: 11};
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-stage-lifecycle-'));
  const install = path.join(root, RAFT_SNAPSHOT_INSTALL_DIRNAME);
  fs.mkdirSync(install, {recursive: true});
  const stagingFile = path.join(install, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
  const db = new Database(stagingFile);
  const registry = new RaftRsPeerIdentityRegistry(db);
  registry.registerReplica(REPLICA);
  const peerReservations = registry.reservations();
  db.close();
  const stat = fs.lstatSync(stagingFile);
  const input = {checkpointsRoot: root, stagingFile,
    destinationFile: path.join(root, 'receiver.db'),
    fileIdentity: {dev: stat.dev, ino: stat.ino, mode: stat.mode,
      nlink: stat.nlink}, installId: 'install-stage', generationIndex: 12,
    createAuthority: authority(), destinationDigest: 'absent', groupId: GROUP,
    peerId: PEER, replicaIdentity: REPLICA, appliedIndex: '12',
    appliedTerm: '4', membershipGenerationIndex: '9', confState: CONF_STATE,
    peerReservations};
  return {root, input, stagingFile};
}

function rows(file, table) {
  const db = new Database(file, {readonly: true});
  try {
    const present = db.prepare(`SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = ?`).get(table);
    return present ? db.prepare(`SELECT * FROM ${table}`).all() : [];
  } finally {
    db.close();
  }
}

test('the narrow staging operation atomically initializes and exactly replays',
  () => {
    assert.deepEqual(Object.keys(stagingLifecycleOperation),
      ['stageRaftRsSnapshotLifecycle']);
    assert.equal(Object.isFrozen(stageRaftRsSnapshotLifecycle), true,
      'the only public capability is frozen');
    const {root, input, stagingFile} = fixture();
    try {
      const initialized = stageRaftRsSnapshotLifecycle(input);
      assert.equal(initialized.outcome, 'STAGED_INITIALIZED');
      assert.equal(Object.isFrozen(initialized), true);
      assert.equal(typeof initialized.incarnation, 'string');
      assert.equal(rows(stagingFile, '_raft_snapshot_install_binding').length, 1);
      assert.equal(rows(stagingFile, '_raft_rs_replica_lifecycle').length, 1);
      assert.equal(rows(stagingFile, '_raft_rs_applied_state').length, 1);
      assert.equal(rows(stagingFile, '_raft_rs_hard_state').length, 1);
      assert.equal(rows(stagingFile, '_raft_rs_snapshot').length, 1);

      const replayed = stageRaftRsSnapshotLifecycle(input);
      assert.equal(replayed.outcome, 'STAGED_REPLAY');
      assert.equal(replayed.incarnation, initialized.incarnation,
        'the exact install preserves its receiver incarnation');
      assert.equal(rows(stagingFile, '_raft_rs_replica_lifecycle').length, 1);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('a failed Raft write rolls lifecycle, binding and every boundary row back',
  () => {
    const {root, input, stagingFile} = fixture();
    try {
      const result = stageRaftRsSnapshotLifecycle({...input,
        appliedTerm: 'not-a-term'});
      assert.equal(result.outcome, 'CONFLICT');
      assert.equal(rows(stagingFile, '_raft_snapshot_install_binding').length, 0);
      assert.equal(rows(stagingFile, '_raft_rs_replica_lifecycle').length, 0);
      assert.equal(rows(stagingFile, '_raft_rs_applied_state').length, 0);
      assert.equal(rows(stagingFile, '_raft_rs_hard_state').length, 0);
      assert.equal(rows(stagingFile, '_raft_rs_snapshot').length, 0);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('partial schemas and foreign bindings cannot be repaired into authority',
  () => {
    for (const mutant of ['partial-record', 'foreign-binding']) {
      const {root, input, stagingFile} = fixture();
      try {
        const db = new Database(stagingFile);
        if (mutant === 'partial-record') {
          db.exec('CREATE TABLE _raft_rs_log (group_id TEXT)');
        } else {
          db.exec(`CREATE TABLE _raft_snapshot_install_binding (
            install_id TEXT PRIMARY KEY, create_authority TEXT NOT NULL)`);
          db.prepare(`INSERT INTO _raft_snapshot_install_binding
            (install_id, create_authority) VALUES (?, ?)`)
            .run('older-install', JSON.stringify(authority()));
        }
        db.close();
        const result = stageRaftRsSnapshotLifecycle(input);
        assert.equal(result.outcome, 'CONFLICT');
        assert.equal(rows(stagingFile, '_raft_rs_replica_lifecycle').length, 0);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    }
  });

test('same-name malformed schemas cannot authorize replay', () => {
  for (const mutant of ['raft-record', 'binding', 'lifecycle']) {
    const {root, input, stagingFile} = fixture();
    try {
      assert.equal(stageRaftRsSnapshotLifecycle(input).outcome,
        'STAGED_INITIALIZED');
      const db = new Database(stagingFile);
      if (mutant === 'raft-record') {
        db.exec(`DROP TABLE _raft_rs_hard_state;
          CREATE TABLE _raft_rs_hard_state (
            group_id TEXT, term INTEGER, vote INTEGER, commit_index INTEGER)`);
      } else if (mutant === 'binding') {
        db.exec(`DROP TABLE _raft_snapshot_install_binding;
          CREATE TABLE _raft_snapshot_install_binding (
            install_id TEXT, create_authority TEXT)`);
        db.prepare(`INSERT INTO _raft_snapshot_install_binding
          (install_id, create_authority) VALUES (?, ?)`)
          .run(input.installId, JSON.stringify(input.createAuthority));
      } else {
        db.exec(`DROP TABLE _raft_rs_replica_lifecycle;
          CREATE TABLE _raft_rs_replica_lifecycle (
            group_id TEXT NOT NULL, peer_id TEXT NOT NULL,
            replica_identity TEXT NOT NULL, state TEXT NOT NULL,
            reason TEXT, changed_at TEXT NOT NULL, incarnation TEXT,
            retirement_evidence TEXT)`);
      }
      db.close();
      const refused = stageRaftRsSnapshotLifecycle(input);
      assert.equal(refused.outcome, 'CONFLICT');
      assert.equal(refused.reason, mutant === 'binding' ?
        'binding_extra_or_mismatch' : 'raft_schema_or_record_partial');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  }
});

test('the operation refuses destination, hardlink and noncanonical path aliases',
  () => {
    const {root, input, stagingFile} = fixture();
    try {
      fs.writeFileSync(input.destinationFile, 'live-receiver');
      assert.equal(stageRaftRsSnapshotLifecycle(input).reason,
        'destination_present_or_changed');
      assert.equal(fs.readFileSync(input.destinationFile, 'utf8'),
        'live-receiver');
      fs.rmSync(input.destinationFile);

      const alias = path.join(root, 'alias.db');
      fs.linkSync(stagingFile, alias);
      const linked = fs.lstatSync(stagingFile);
      assert.equal(stageRaftRsSnapshotLifecycle({...input, fileIdentity: {
        dev: linked.dev, ino: linked.ino, mode: linked.mode,
        nlink: linked.nlink}}).outcome, 'CONFLICT');
      fs.rmSync(alias);

      assert.equal(stageRaftRsSnapshotLifecycle({...input,
        stagingFile: path.join(root, 'not-the-fixed-staging.db')}).reason,
      'input_invalid');
      assert.equal(rows(stagingFile, '_raft_rs_replica_lifecycle').length, 0);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('only SQLite BUSY is deferred and the same operation progresses on release',
  () => {
    const {root, input, stagingFile} = fixture();
    const blocker = new Database(stagingFile);
    try {
      blocker.exec('BEGIN EXCLUSIVE');
      const deferred = stageRaftRsSnapshotLifecycle(input);
      assert.equal(deferred.outcome, 'DEFERRED');
      assert.equal(deferred.reason, 'sqlite_busy_or_locked');
      assert.equal(deferred.sqliteCode, 'SQLITE_BUSY');
      blocker.exec('ROLLBACK');
      assert.equal(stageRaftRsSnapshotLifecycle(input).outcome,
        'STAGED_INITIALIZED');
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('retired replay and corrupt SQLite remain permanent conflicts', () => {
  const retired = fixture();
  try {
    const initialized = stageRaftRsSnapshotLifecycle(retired.input);
    assert.equal(initialized.outcome, 'STAGED_INITIALIZED');
    const db = new Database(retired.stagingFile);
    db.prepare(`UPDATE _raft_rs_replica_lifecycle
      SET state = 'retired', reason = 'removed' WHERE group_id = ?`)
      .run(GROUP);
    db.close();
    const refused = stageRaftRsSnapshotLifecycle(retired.input);
    assert.equal(refused.outcome, 'CONFLICT');
    assert.equal(refused.reason, 'lifecycle_retired_or_colliding');
    assert.equal(rows(retired.stagingFile,
      '_raft_rs_replica_lifecycle')[0].incarnation, initialized.incarnation,
    'refusal does not replace the retired incarnation');
  } finally {
    fs.rmSync(retired.root, {recursive: true, force: true});
  }

  const corrupt = fixture();
  try {
    fs.writeFileSync(corrupt.stagingFile, 'not a sqlite database');
    const stat = fs.lstatSync(corrupt.stagingFile);
    const refused = stageRaftRsSnapshotLifecycle({...corrupt.input,
      fileIdentity: {dev: stat.dev, ino: stat.ino, mode: stat.mode,
        nlink: stat.nlink}});
    assert.equal(refused.outcome, 'CONFLICT');
    assert.equal(refused.reason, 'database_unreadable_or_corrupt');
    assert.notEqual(refused.sqliteCode, 'SQLITE_BUSY');
    assert.notEqual(refused.sqliteCode, 'SQLITE_LOCKED');
  } finally {
    fs.rmSync(corrupt.root, {recursive: true, force: true});
  }
});
