// Storage-owner fixtures, not a claim that native Raft or public startup ran.
// Construct records through the existing lifecycle/durable owners; inspection
// must remain read-only and stop at the first lost custody or invalid fact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {RaftRsOriginalAllocationPreparation} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {RaftRsReplicaLifecycleOwner} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RaftRsDurableStore, commitDurably} from
  '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_COMMIT_DURABILITY} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-original-allocation-constants.js';

const hold = (reason) => (error) =>
  error.code === STATE.HOLD && error.reason === reason;

function completeStorageFixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-cold-inspection-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'inspection-node', buildDigest: 'inspection-build'};
  const declaration = createSeedOriginalAllocation({...identity, now: 1234});
  const preparations = [];
  const createPreparation = () => {
    const owner = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
    preparations.push(owner);
    return owner;
  };
  t.after(() => {
    for (const owner of preparations) owner.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  createPreparation().prepare(declaration);
  for (const member of declaration.members) {
    const db = new Database(member.dbPath, {fileMustExist: true});
    try {
      const lifecycle = new RaftRsReplicaLifecycleOwner({db,
        groupId: member.groupId, peerId: member.peerId, replicaIdentity: member.replicaId});
      const store = new RaftRsDurableStore(db);
      store.transaction(() => {
        store.putBootstrapAppliedState(member.groupId, {
          voters: member.replicaIds.map(deriveRaftRsPeerId), learners: [],
          votersOutgoing: [], learnersNext: [], autoLeave: false,
        }, {bootstrapIndex: '0', admissionIndex: '0'});
        lifecycle.recordOpeningHistory(member.incarnation);
      }, RAFT_RS_COMMIT_DURABILITY.SYNCED);
    } finally {
      db.close();
    }
  }
  return {declaration, directoryOwner, createPreparation};
}

function setIdentityRight(member, value) {
  const db = new Database(member.dbPath, {fileMustExist: true});
  try {
    commitDurably(db, () => db.prepare(`UPDATE ${TABLE}
      SET ${COLUMN.IDENTITY_RIGHT} = ? WHERE group_id = ? AND peer_id = ?`)
      .run(value, member.groupId, member.peerId));
  } finally {
    db.close();
  }
}

test('complete original cold inspection: current custody and exact rights', async (t) => {
  const f = completeStorageFixture(t);
  const first = f.declaration.members[0];
  assert.notEqual(first.replicaId, f.declaration.anchorReplicaId);

  await t.test('complete read-only scan visits every exact member and closes its DB', () => {
    const owner = f.createPreparation();
    const visited = [];
    const databases = [];
    owner.inspect(f.declaration, ({db, declaration, member, record}) => {
      assert.equal(db.readonly, true);
      assert.equal(declaration, f.declaration);
      assert.ok(record.confState.voters.includes(member.peerId));
      visited.push(member.replicaId);
      databases.push(db);
      return STATE.HISTORY_ACCEPTED;
    });
    assert.deepEqual(visited, f.declaration.members.map((member) => member.replicaId));
    assert.ok(databases.every((db) => db.open === false));
    assert.deepEqual(owner.observeResources(), []);
  });

  await t.test('revocation inside the application owner stops before the next member', () => {
    const owner = f.createPreparation();
    const visited = [];
    assert.throws(() => owner.inspect(f.declaration, ({member}) => {
      visited.push(member.replicaId);
      owner.revoke();
      return STATE.HISTORY_ACCEPTED;
    }), hold(REASON.CLOSED));
    assert.deepEqual(visited, [first.replicaId]);
    assert.deepEqual(owner.observeResources(), []);
  });

  for (const right of [STATE.UNUSED, STATE.SUBMITTED, STATE.TRANSFERRED, 'UNKNOWN']) {
    await t.test(`non-anchor identity right ${right} refuses before application inspection`, () => {
      setIdentityRight(first, right);
      const owner = f.createPreparation();
      let applicationCalls = 0;
      try {
        assert.throws(() => owner.inspect(f.declaration, () => {
          applicationCalls++;
          return STATE.HISTORY_ACCEPTED;
        }), hold(REASON.IDENTITY));
        assert.equal(applicationCalls, 0);
        assert.deepEqual(owner.observeResources(), []);
      } finally {
        setIdentityRight(first, null);
      }
    });
  }

  await t.test('missing required file is a typed observation HOLD, not absence', () => {
    const heldPath = first.dbPath + '.held-by-test';
    fs.renameSync(first.dbPath, heldPath);
    const owner = f.createPreparation();
    let applicationCalls = 0;
    try {
      assert.throws(() => owner.inspect(f.declaration, () => {
        applicationCalls++;
        return STATE.HISTORY_ACCEPTED;
      }), (error) => hold(REASON.OBSERVATION)(error) && error.cause instanceof Error);
      assert.equal(applicationCalls, 0);
      assert.equal(fs.existsSync(first.dbPath), false);
      assert.deepEqual(owner.observeResources(), []);
    } finally {
      fs.renameSync(heldPath, first.dbPath);
    }
  });

  await t.test('application observation error remains the cause of a typed HOLD', () => {
    const owner = f.createPreparation();
    const failure = new Error('required application observation failed');
    let calls = 0;
    assert.throws(() => owner.inspect(f.declaration, () => {
      calls++;
      throw failure;
    }), (error) => hold(REASON.OBSERVATION)(error) && error.cause === failure);
    assert.equal(calls, 1);
    assert.deepEqual(owner.observeResources(), []);
  });

  await t.test('directory custody lost inside the callback stops before the next member', () => {
    const owner = f.createPreparation();
    const visited = [];
    assert.throws(() => owner.inspect(f.declaration, ({member}) => {
      visited.push(member.replicaId);
      f.directoryOwner.release();
      return STATE.HISTORY_ACCEPTED;
    }), hold(REASON.DIRECTORY));
    assert.deepEqual(visited, [first.replicaId]);
    assert.deepEqual(owner.observeResources(), []);
  });
});
