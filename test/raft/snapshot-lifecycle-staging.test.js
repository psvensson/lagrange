// The snapshot owner requests one narrow lifecycle operation, never a live
// runtime/lifecycle capability. Real SQLite files keep the receiver incarnation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  prepareReplicaLifecycleForSnapshot,
  RaftRsReplicaLifecycleOwner,
  readDurableReplicaLifecycle,
} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {raftRsLifecycleAdministration} from '../../src/raft/raft-rs-lifecycle-administration.js';
import {auditRaftRsOperationBoundary} from '../../scripts/checks/raft-rs-operation-boundary-audit.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';

const IDENTITY = {groupId: 'snapshot-stage-group', peerId: '7', replicaIdentity: 'receiver'};
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-lifecycle-owner-'));
  const file = path.join(directory, 'staging.sqlite');
  const db = new Database(file);
  t.after(() => {
    if (db.open) db.close();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  return {directory, file, db, request: {db, ...IDENTITY}};
}
function rows(db) {
  return db.prepare('SELECT * FROM _raft_rs_replica_lifecycle ORDER BY peer_id').all();
}

test('snapshot staging is idempotent receiver-local data, not a runtime capability', async (t) => {
  const f = fixture(t);
  const first = prepareReplicaLifecycleForSnapshot(f.request);
  assert.equal(first.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.deepEqual(Object.keys(first).sort(), ['detail', 'outcome', 'reason']);
  assert.deepEqual(Object.keys(first.detail), ['incarnation']);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.detail), true);
  const before = rows(f.db);
  assert.deepEqual(prepareReplicaLifecycleForSnapshot(f.request), first);
  assert.deepEqual(rows(f.db), before, 'retry must not mint another incarnation');
  assert.equal(readDurableReplicaLifecycle(f.file, IDENTITY.groupId,
    IDENTITY.replicaIdentity).incarnation, first.detail.incarnation);
  const absent = await raftRsLifecycleAdministration.retireReplica(IDENTITY.replicaIdentity,
    'not-a-runtime', {groupId: IDENTITY.groupId, runtime: first});
  assert.equal(absent.outcome, 'NOT_MANAGED', 'staging result cannot retire a replica');
});

test('staging refuses conflicting receiver identity without changing the existing generation', (t) => {
  const f = fixture(t);
  prepareReplicaLifecycleForSnapshot(f.request);
  const before = rows(f.db);
  const refused = prepareReplicaLifecycleForSnapshot({...f.request, peerId: '8'});
  assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  assert.equal(refused.reason, 'lifecycle-identity-mismatch');
  assert.deepEqual(rows(f.db), before);
});

test('staging cannot reactivate a retired receiver or erase its evidence', async (t) => {
  const f = fixture(t);
  const owner = new RaftRsReplicaLifecycleOwner(f.request);
  await owner.retire('source-removed', {marker: 'retained-retirement'});
  const before = rows(f.db);
  const refused = prepareReplicaLifecycleForSnapshot(f.request);
  assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  assert.equal(refused.reason, 'retired');
  assert.deepEqual(rows(f.db), before);
});

test('staging refuses an existing native history whose lifecycle row is absent', (t) => {
  const f = fixture(t);
  const store = new RaftRsDurableStore(f.db);
  store.putBootstrapAppliedState(IDENTITY.groupId,
    {voters: [IDENTITY.peerId], learners: [], votersOutgoing: [],
      learnersNext: [], autoLeave: false},
    {bootstrapIndex: '0', admissionIndex: '0'});
  const refused = prepareReplicaLifecycleForSnapshot(f.request);
  assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
  assert.equal(refused.reason, 'lifecycle-record-missing');
  assert.deepEqual(rows(f.db), [], 'do not synthesize authority over surviving history');
});

test('two staging files never share a newly minted receiver incarnation', (t) => {
  const a = fixture(t);
  const b = fixture(t);
  assert.notEqual(prepareReplicaLifecycleForSnapshot(a.request).detail.incarnation,
    prepareReplicaLifecycleForSnapshot(b.request).detail.incarnation);
});

test('unavailable staging storage throws rather than reporting preparation success', (t) => {
  const f = fixture(t);
  f.db.close();
  assert.throws(() => prepareReplicaLifecycleForSnapshot(f.request));
});

// The permission is the symbol, not the caller filename. Old class access and
// namespaces/dynamic imports remain rejected even from the snapshot owner.
const allowed = 'prepareReplicaLifecycleForSnapshot';
const ownerModule = './raft-rs-replica-lifecycle-owner.js';
for (const [label, source, accepted, caller = 'snapshot-install.js'] of [
  ['named staging', `import {${allowed}} from '${ownerModule}';`, true],
  ['aliased staging', `import {${allowed} as stage} from '${ownerModule}';`, true],
  ['old class', `import {RaftRsReplicaLifecycleOwner} from '${ownerModule}';`, false],
  ['mixed capabilities', `import {${allowed}, RaftRsReplicaLifecycleOwner} from '${ownerModule}';`, false],
  ['namespace', `import * as lifecycle from '${ownerModule}';`, false],
  ['dynamic', `const lifecycle = await import('${ownerModule}');`, false],
  ['re-export', `export {${allowed}} from '${ownerModule}';`, false],
  ['different caller', `import {${allowed}} from '${ownerModule}';`, false, 'not-the-snapshot-owner.js'],
]) {
  test(`snapshot lifecycle import boundary: ${label}`, (t) => {
    const f = fixture(t);
    const src = path.join(f.directory, 'src/raft');
    fs.mkdirSync(src, {recursive: true});
    fs.writeFileSync(path.join(src, caller), source);
    const violations = auditRaftRsOperationBoundary({root: f.directory});
    assert.equal(violations.some((entry) => entry.code === 'lifecycle-owner-import-bypass'), !accepted);
  });
}
