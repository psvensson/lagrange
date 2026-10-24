// Actual allocation, custody and operation-port owners. No public-startup,
// native crash durability or complete handoff claim is made by these tests.
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
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RAFT_OPERATION_PORT_REQUEST as REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';

const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});
const hold = (reason) => (error) => error.code === STATE.HOLD && error.reason === reason;

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-opening-authority-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'original-node', buildDigest: 'test-build'};
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
  const owners = [];
  const resources = [];
  const newOwner = () => {
    const owner = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
    owners.push(owner);
    return owner;
  };
  const preparation = newOwner();
  t.after(() => {
    setActualCoreEntryObserver(null);
    for (const {port, db} of resources.reverse()) {
      port?.close();
      if (db.open) db.close();
    }
    for (const owner of owners) owner.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  function native(member, opening, extra = {}) {
    const db = new Database(member.dbPath, {fileMustExist: true});
    const resource = {db, port: null};
    resources.push(resource);
    const request = {groupId: member.groupId, peerId: member.replicaId,
      peerAddress: `raft-rs://replica-${member.replicaId}`, durableStorage: db,
      bootstrapPeerIds: member.replicaIds, bootstrapMembership: member.membership,
      identityExisted: false, timing: TIMING, deferElection: true,
      resolvePeerAddress: (id) => `raft-rs://replica-${id}`,
      sendToPeer: () => {}, applyCommittedEntry: () => {},
      [REQUEST.ORIGINAL_ALLOCATION_OPENING]: opening, ...extra};
    return {db, request, open: () => {
      resource.port = createRaftRsOperationPort(request);
      return resource.port;
    }};
  }
  const f = {directoryOwner, draft, declaration: null, preparation, newOwner, native};
  // The issued declaration carries the stamps the lifecycle owner minted.
  f.prepare = () => {
    f.declaration = preparation.prepare(draft);
    return f.declaration;
  };
  return f;
}

test('original admission is unavailable until the complete allocation closes preparation', (t) => {
  const f = fixture(t);
  assert.throws(() => f.preparation.openingFor(f.draft.members[0].replicaId),
    hold(REASON.AUTHORITY));
  const member = f.prepare().members[0];
  assert.deepEqual(f.preparation.observeResources(), []);
  const opening = f.preparation.openingFor(member.replicaId);
  assert.equal(Object.isFrozen(opening), true);
  assert.deepEqual(Object.keys(opening), []);
  assert.equal(f.preparation.openingFor(member.replicaId), opening);
  assert.throws(() => f.preparation.openingFor('foreign-member'), hold(REASON.IDENTITY));
  const native = f.native(member, opening);
  const port = native.open();
  assert.equal(port.readStatus().outcome, 'CORE_OK');
  const row = originalAllocationRow(native.db, member);
  assert.equal(row.native_history_state, HISTORY.ESTABLISHED);
  assert.equal(row[COLUMN.SERVICE_RIGHT], STATE.UNUSED, 'opening is not SERVICES consumption');
  port.close();
  assert.throws(() => f.native(member, opening).open(), hold(REASON.OPENING_CONSUMED));
});

test('opening capabilities bind exact member, store and original membership', async (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const opening = f.preparation.openingFor(member.replicaId);
  for (const [name, extra] of [
    ['group', {groupId: 'different-group'}],
    ['replica', {peerId: 'different-replica'}],
    ['member set', {bootstrapPeerIds: member.replicaIds.slice(1)}],
    ['first-opening identity', {identityExisted: true}],
    ['membership source', {bootstrapMembership: durableRecordBootstrap()}],
    ['joining existing group', {joiningExistingGroup: true}],
  ]) {
    await t.test(`refuses different ${name} without native entry`, () => {
      const entries = [];
      setActualCoreEntryObserver((entry) => entries.push(entry));
      assert.throws(() => f.native(member, opening, extra).open(), hold(REASON.IDENTITY));
      assert.deepEqual(entries, []);
    });
  }
  await t.test('another declared member cannot borrow the capability', () => {
    assert.throws(() => f.native(f.declaration.members[1], opening).open(),
      hold(REASON.IDENTITY));
  });
  const copies = [{...opening}, structuredClone(opening), JSON.parse(JSON.stringify(opening))];
  for (const copy of copies) {
    await t.test('copying a capability cannot copy its authority', () => {
      assert.throws(() => f.native(member, copy).open(), hold(REASON.AUTHORITY));
    });
  }
  const native = f.native(member, opening);
  assert.equal(native.open().readStatus().outcome, 'CORE_OK',
    'rejected caller identities did not consume a valid opening');
});

for (const close of ['revoke', 'directory']) {
  test(`${close} closes queued original native admission`, (t) => {
    const f = fixture(t);
    f.prepare();
    const member = f.declaration.members[0];
    const opening = f.preparation.openingFor(member.replicaId);
    const native = f.native(member, opening);
    if (close === 'revoke') f.preparation.revoke();
    else f.directoryOwner.release();
    const entries = [];
    setActualCoreEntryObserver((entry) => entries.push(entry));
    assert.throws(native.open, hold(close === 'revoke' ? REASON.CLOSED : REASON.DIRECTORY));
    assert.deepEqual(entries, []);
    assert.equal(originalAllocationRow(native.db, member).native_history_state,
      HISTORY.NEVER_OPENED);
  });
}

test('revocation during an intermediate constructor callback prevents native entry', (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const opening = f.preparation.openingFor(member.replicaId);
  const native = f.native(member, opening, {timing: {
    get tickIntervalMs() {
      f.preparation.revoke();
      return 10;
    },
  }});
  const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  assert.throws(native.open, hold(REASON.CLOSED));
  assert.deepEqual(entries, []);
  assert.equal(originalAllocationRow(native.db, member).native_history_state, HISTORY.NEVER_OPENED);
});

test('constructor failure cannot restore an already consumed opening', (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const opening = f.preparation.openingFor(member.replicaId);
  const failure = new Error('timing owner failed');
  const native = f.native(member, opening, {timing: {
    get tickIntervalMs() {
      throw failure;
    },
  }});
  assert.throws(native.open, (error) => error === failure);
  assert.throws(() => f.native(member, opening).open(), hold(REASON.OPENING_CONSUMED));
});

test('a changed durable incarnation cannot borrow the original opening', (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const native = f.native(member, f.preparation.openingFor(member.replicaId));
  native.db.prepare(`UPDATE ${TABLE} SET incarnation = ? WHERE replica_identity = ?`)
    .run('replacement-incarnation', member.replicaId);
  assert.throws(native.open, hold(REASON.IDENTITY));
});

test('all-member actual native opening then readonly original recovery', async (t) => {
  const f = fixture(t);
  f.prepare();
  for (const member of f.declaration.members) {
    const native = f.native(member, f.preparation.openingFor(member.replicaId));
    const port = native.open();
    assert.equal(port.readStatus().outcome, 'CORE_OK');
    port.close();
    native.db.close();
  }
  f.preparation.close();
  const recovery = f.newOwner();
  const inspected = [];
  // This fixture admits only empty native records. Application-owner payload
  // classification and the real public cold path remain separate work.
  recovery.inspect(f.declaration, ({db, member, record}) => {
    assert.throws(() => db.exec('CREATE TABLE forbidden (id INT)'), /readonly|read-only/u);
    assert.equal(record.entries.length, 0);
    inspected.push(member.replicaId);
    return STATE.HISTORY_ACCEPTED;
  });
  assert.equal(inspected.length, f.declaration.members.length);
  const member = f.declaration.members[0];
  const opening = recovery.openingFor(member.replicaId);
  await t.test('cold original permission never supplies genesis or a new identity', () => {
    assert.throws(() => f.native(member, opening).open(), hold(REASON.IDENTITY));
  });
  await t.test('readonly revalidation precedes actual durable reconstruction', () => {
    const native = f.native(member, opening, {identityExisted: true,
      bootstrapMembership: durableRecordBootstrap()});
    assert.equal(native.open().readStatus().outcome, 'CORE_OK');
    assert.equal(inspected.length, f.declaration.members.length + 1);
  });
  const treatments = [
    {name: 'late commit beyond retained frontier', reason: REASON.HISTORY,
      mutate(store, member) {
        store.putHardState(member.groupId, {term: '1', vote: '0', commit: '1'});
      }},
    {name: 'late unclassified membership command', reason: REASON.CLASSIFICATION_UNAVAILABLE,
      mutate(store, member) {
        store.appendEntries(member.groupId, [{index: '1', term: '1',
          entryType: RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2,
          data: Buffer.from('membership-owner-bytes').toString('base64')}]);
        store.putHardState(member.groupId, {term: '1', vote: '0', commit: '0'});
      }},
    {name: 'late snapshot with uncovered application prefix',
      reason: REASON.CLASSIFICATION_UNAVAILABLE,
      mutate(store, member) {
        const {confState} = store.readDurableRecord(member.groupId);
        store.putSnapshot(member.groupId, {metadata: {index: '1', term: '1', confState}});
        store.putHardState(member.groupId, {term: '1', vote: '0', commit: '1'});
      }},
  ];
  // All three complete-cohort inspections precede any treatment. Every later
  // treatment has its own attempt and its own member's one-use capability.
  const attempts = treatments.map(() => {
    const owner = f.newOwner();
    let callbacks = 0;
    owner.inspect(f.declaration, () => {
      callbacks++;
      return STATE.HISTORY_ACCEPTED;
    });
    return {owner, callbacks: () => callbacks};
  });
  for (const [index, treatment] of treatments.entries()) {
    await t.test(treatment.name, () => {
      const member = f.declaration.members[index + 1];
      const attempt = attempts[index];
      const native = f.native(member, attempt.owner.openingFor(member.replicaId),
        {identityExisted: true, bootstrapMembership: durableRecordBootstrap()});
      const store = new RaftRsDurableStore(native.db);
      let reached = false;
      Object.defineProperty(native.request, 'sendToPeer', {get() {
        treatment.mutate(store, member);
        reached = true;
        return () => {};
      }});
      const entries = [];
      setActualCoreEntryObserver((entry) => entries.push(entry));
      assert.throws(native.open, hold(treatment.reason));
      assert.equal(reached, true, 'treatment runs after the first opening check');
      assert.deepEqual(entries, [], 'renewed native assessment precedes actual core entry');
      assert.equal(attempt.callbacks(), f.declaration.members.length,
        'unclassified or contrary native history never reaches the application callback');
      assert.deepEqual(attempt.owner.observeResources(), []);
    });
  }
});

test('revocation while resolving the last dispatcher callback cannot cross native entry', (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const native = f.native(member, f.preparation.openingFor(member.replicaId));
  Object.defineProperty(native.request, 'sendToPeer', {get() {
    f.preparation.revoke();
    return () => {};
  }});
  const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  assert.throws(native.open, hold(REASON.CLOSED));
  assert.deepEqual(entries, []);
  assert.equal(originalAllocationRow(native.db, member).native_history_state, HISTORY.NEVER_OPENED);
});
