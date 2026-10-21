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
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {acquireDataDirectoryProcessOwner, ownsDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

function fixture(t, identityOverride = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-allocation-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'original-node', buildDigest: 'test-build'};
  const declaration = createSeedOriginalAllocation({...identity, now: 1234});
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner,
    ...identity, ...identityOverride});
  t.after(() => {
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {dataDir, directoryOwner, declaration, preparation};
}

function hold(reason) {
  return (error) => error.code === STATE.HOLD && error.reason === reason;
}

function refuseBeforeFiles(f, declaration, reason, operation) {
  const before = fs.readdirSync(f.dataDir).sort();
  let applicationCalls = 0;
  const attempt = operation === 'prepare' ? () => f.preparation.prepare(declaration) :
    () => f.preparation.inspect(declaration, () => {
      applicationCalls++;
      return STATE.HISTORY_ACCEPTED;
    });
  assert.throws(attempt, hold(reason));
  assert.deepEqual(fs.readdirSync(f.dataDir).sort(), before);
  assert.deepEqual(f.preparation.observeResources(), []);
  assert.equal(applicationCalls, 0);
  assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
  assert.throws(() => f.preparation.assertCurrent(), hold(REASON.CLOSED));
}

const MALFORMED = [
  ['empty cohort', REASON.INCOMPLETE, (d) => { d.members = []; }],
  ['anchor-only cohort', REASON.INCOMPLETE, (d) => {
    d.members = d.members.filter((m) => m.replicaId === d.anchorReplicaId);
  }],
  ['missing founder', REASON.INCOMPLETE, (d) => { d.members.pop(); }],
  ['duplicate founder', REASON.IDENTITY, (d) => { d.members[1] = d.members[0]; }],
  ['foreign node', REASON.IDENTITY, (d) => { d.nodeId = 'other-node'; }],
  ['foreign build', REASON.IDENTITY, (d) => { d.buildDigest = 'other-build'; }],
  ['invalid allocation timestamp', REASON.IDENTITY, (d) => { d.declaredAt = -1; }],
  ['foreign member path', REASON.IDENTITY, (d) => { d.members[0].dbPath += '-foreign'; }],
  ['aliased birth token', REASON.IDENTITY, (d) => {
    d.members[0].createAttemptToken = d.members[0].incarnation;
  }],
];
for (const operation of ['prepare', 'inspect']) {
  for (const [name, reason, mutate] of MALFORMED) {
    test(`${operation}: ${name} refuses before any member file or callback`, (t) => {
      const f = fixture(t);
      const declaration = structuredClone(f.declaration);
      mutate(declaration);
      refuseBeforeFiles(f, declaration, reason, operation);
    });
  }
}

for (const field of ['nodeId', 'buildDigest']) {
  test(`missing externally bound ${field} cannot be supplied by the declaration`, (t) => {
    const f = fixture(t, {[field]: undefined});
    refuseBeforeFiles(f, f.declaration, REASON.IDENTITY, 'prepare');
  });
}

test('an accessor is refused without invoking it', (t) => {
  const f = fixture(t);
  const declaration = structuredClone(f.declaration);
  let calls = 0;
  Object.defineProperty(declaration, 'members', {enumerable: true,
    get() { calls++; return f.declaration.members; }});
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('a proxy is refused without invoking its traps', (t) => {
  const f = fixture(t);
  let calls = 0;
  const declaration = new Proxy(f.declaration, {
    get() { calls++; throw new Error('unexpected proxy callback'); },
    ownKeys() { calls++; throw new Error('unexpected proxy callback'); },
    getPrototypeOf() { calls++; throw new Error('unexpected proxy callback'); },
  });
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('a toJSON callback is not invoked during allocation preparation', (t) => {
  const f = fixture(t);
  const declaration = structuredClone(f.declaration);
  let calls = 0;
  declaration.toJSON = () => { calls++; return f.declaration; };
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('complete catalog is durably prepared and closed before any native history', (t) => {
  const {declaration, preparation, directoryOwner, dataDir} = fixture(t);
  preparation.prepare(declaration);
  assert.deepEqual(preparation.observeResources(), []);
  assert.equal(ownsDataDirectoryProcessOwner(directoryOwner, dataDir), true);
  for (const member of declaration.members) {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      const row = originalAllocationRow(db, member);
      const anchor = member.replicaId === declaration.anchorReplicaId;
      assert.equal(row[COLUMN.DECLARATION], JSON.stringify(declaration));
      assert.equal(row[COLUMN.ISSUE], anchor ? STATE.ISSUED : STATE.PREPARING);
      assert.equal(row[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
      assert.equal(row[COLUMN.IDENTITY_RIGHT], anchor ? STATE.UNUSED : null);
      assert.equal(row.native_history_state, HISTORY.NEVER_OPENED);
      assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, member.groupId), false);
    } finally {
      db.close();
    }
  }
  assert.throws(() => preparation.prepare(declaration), hold(REASON.REENTRANT));
});
