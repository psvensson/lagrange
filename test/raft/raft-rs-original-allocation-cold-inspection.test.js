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
import {RAFT_RS_TABLE} from '../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  isOriginalAllocationHold,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';

const hold = (reason) => (error) => isOriginalAllocationHold(error, reason);

function completeStorageFixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-cold-inspection-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'inspection-node', buildDigest: 'inspection-build'};
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
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
  const declaration = createPreparation().prepare(draft);
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

// Deliberately corrupt retained storage, not a native-history producer. The
// existing preparation API must reject these facts before its application
// callback. The valid zero-progress and pending-prefix controls remain separate.
function nativeRecordFixture(member, mutate) {
  const db = new Database(member.dbPath, {fileMustExist: true});
  const store = new RaftRsDurableStore(db);
  const confState = {voters: member.replicaIds.map(deriveRaftRsPeerId),
    learners: [], votersOutgoing: [], learnersNext: [], autoLeave: false};
  const entry = (index, term = '1', extra = {}) => ({index, term,
    entryType: RAFT_RS_ENTRY_TYPE.NORMAL, ...extra});
  try {
    store.transaction(() => mutate({db, store, confState, entry,
      groupId: member.groupId}), RAFT_RS_COMMIT_DURABILITY.SYNCED);
  } finally {
    db.close();
  }
}

function resetNativeRecord(member) {
  nativeRecordFixture(member, ({db, store, confState, groupId}) => {
    for (const table of Object.values(RAFT_RS_TABLE)) {
      db.prepare(`DELETE FROM ${table} WHERE group_id = ?`).run(groupId);
    }
    store.putBootstrapAppliedState(groupId, confState,
      {bootstrapIndex: '0', admissionIndex: '0'});
  });
}

const invalidNativeRecords = [
  ['applied progress beyond commit', ({store, groupId, confState}) => {
    store.putAppliedState(groupId, '1', confState);
  }],
  ['commit beyond retained log', ({store, groupId}) => {
    store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  }],
  ['a hole in retained history', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1'), entry('3')]);
    store.putHardState(groupId, {term: '1', vote: '0', commit: '3'});
  }],
  ['regressing retained terms', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1', '2'), entry('2', '1')]);
    store.putHardState(groupId, {term: '2', vote: '0', commit: '2'});
  }],
  ['a retained term beyond hard state', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1', '2')]);
    store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  }],
  ['the missing required applied row', ({db, groupId}) => {
    db.prepare(`DELETE FROM ${RAFT_RS_TABLE.APPLIED_STATE} WHERE group_id = ?`).run(groupId);
  }],
  ['an invalid stored auto-leave value', ({db, groupId}) => {
    db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE} SET auto_leave = 2 WHERE group_id = ?`)
      .run(groupId);
  }],
  ['a foreign voter', ({store, groupId, confState}) => {
    store.putAppliedState(groupId, '0', {...confState,
      voters: [...confState.voters, deriveRaftRsPeerId('foreign-original-voter')]});
  }],
  ['a duplicate voter', ({store, groupId, confState}) => {
    store.putAppliedState(groupId, '0', {...confState,
      voters: [...confState.voters, confState.voters[0]]});
  }],
  ['an unknown native entry type', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1', '1', {entryType: 17})]);
    store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  }],
  ['malformed payload encoding', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1', '1', {data: '%%%%'})]);
    store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  }],
  ['undecodable proposal bytes', ({store, groupId, entry}) => {
    store.appendEntries(groupId, [entry('1', '1', {data: Buffer.from('{').toString('base64')})]);
    store.putHardState(groupId, {term: '1', vote: '0', commit: '1'});
  }],
];

test('original cold native validation precedes application inspection', async (t) => {
  const f = completeStorageFixture(t);
  const first = f.declaration.members[0];
  for (const [name, corrupt] of invalidNativeRecords) {
    await t.test(name, () => {
      nativeRecordFixture(first, corrupt);
      const owner = f.createPreparation();
      let applicationCalls = 0;
      try {
        assert.throws(() => owner.inspect(f.declaration, () => {
          applicationCalls++;
          return STATE.HISTORY_ACCEPTED;
        }), hold(REASON.HISTORY), 'invalid native history cannot reach the application owner');
        assert.equal(applicationCalls, 0);
        assert.deepEqual(owner.observeResources(), []);
      } finally {
        resetNativeRecord(first);
      }
    });
  }

  await t.test('coherent applied committed-pending and local-uncommitted positions survive', () => {
    nativeRecordFixture(first, ({store, groupId, confState, entry}) => {
      store.appendEntries(groupId, [entry('1'), entry('2'), entry('3')]);
      store.putHardState(groupId, {term: '1', vote: '0', commit: '2'});
      store.putAppliedState(groupId, '1', confState);
    });
    const owner = f.createPreparation();
    let seen = null;
    owner.inspect(f.declaration, ({member, record}) => {
      if (member.replicaId === first.replicaId) seen = record;
      return STATE.HISTORY_ACCEPTED;
    });
    assert.equal(seen.appliedIndex, '1');
    assert.equal(seen.hardState.commit, '2');
    assert.deepEqual(seen.entries.map(({index}) => index), ['1', '2', '3']);
    assert.deepEqual(owner.observeResources(), []);
  });
});
