import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createSeedOriginalAllocation, originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {ownerStampedSeedDeclaration} from
  '../test-helpers/original-allocation-declaration-fixture.js';
import {readDurableReplicaLifecycle, readOriginalAllocationRow} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RaftRsOriginalAllocationPreparation} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
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
  // prepare() takes the declaration owner's draft; inspect() a complete
  // declaration as retained on disk, with lifecycle-owner stamps.
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
  const declaration = ownerStampedSeedDeclaration(identity, 1234);
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner,
    ...identity, ...identityOverride});
  t.after(() => {
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {dataDir, directoryOwner, identity, draft, declaration, preparation};
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
  ['empty cohort', REASON.INCOMPLETE, (d) => {
    d.members = [];
  }],
  ['anchor-only cohort', REASON.INCOMPLETE, (d) => {
    d.members = d.members.filter((m) => m.replicaId === d.anchorReplicaId);
  }],
  ['missing founder', REASON.INCOMPLETE, (d) => {
    d.members.pop();
  }],
  ['duplicate founder', REASON.IDENTITY, (d) => {
    d.members[1] = d.members[0];
  }],
  ['foreign node', REASON.IDENTITY, (d) => {
    d.nodeId = 'other-node';
  }],
  ['foreign build', REASON.IDENTITY, (d) => {
    d.buildDigest = 'other-build';
  }],
  ['invalid allocation timestamp', REASON.IDENTITY, (d) => {
    d.declaredAt = -1;
  }],
  ['foreign member path', REASON.IDENTITY, (d) => {
    d.members[0].dbPath += '-foreign';
  }],
  ['aliased birth token', REASON.IDENTITY, (d) => {
    d.members[0].createAttemptToken = d.members[0].incarnation ?? d.members[1].createAttemptToken;
  }],
];
for (const operation of ['prepare', 'inspect']) {
  for (const [name, reason, mutate] of MALFORMED) {
    test(`${operation}: ${name} refuses before any member file or callback`, (t) => {
      const f = fixture(t);
      const declaration = structuredClone(operation === 'prepare' ? f.draft : f.declaration);
      mutate(declaration);
      refuseBeforeFiles(f, declaration, reason, operation);
    });
  }
}

for (const field of ['nodeId', 'buildDigest']) {
  test(`missing externally bound ${field} cannot be supplied by the declaration`, (t) => {
    const f = fixture(t, {[field]: undefined});
    refuseBeforeFiles(f, f.draft, REASON.IDENTITY, 'prepare');
  });
}

test('an accessor is refused without invoking it', (t) => {
  const f = fixture(t);
  const declaration = structuredClone(f.draft);
  let calls = 0;
  Object.defineProperty(declaration, 'members', {enumerable: true,
    get() {
      calls++; return f.draft.members;
    }});
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('a proxy is refused without invoking its traps', (t) => {
  const f = fixture(t);
  let calls = 0;
  const declaration = new Proxy(f.draft, {
    get() {
      calls++; throw new Error('unexpected proxy callback');
    },
    ownKeys() {
      calls++; throw new Error('unexpected proxy callback');
    },
    getPrototypeOf() {
      calls++; throw new Error('unexpected proxy callback');
    },
  });
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('a toJSON callback is not invoked during allocation preparation', (t) => {
  const f = fixture(t);
  const declaration = structuredClone(f.draft);
  let calls = 0;
  declaration.toJSON = () => {
    calls++; return f.draft;
  };
  refuseBeforeFiles(f, declaration, REASON.IDENTITY, 'prepare');
  assert.equal(calls, 0);
});

test('complete catalog is durably prepared and closed before any native history', (t) => {
  const {draft, preparation, directoryOwner, dataDir} = fixture(t);
  const declaration = preparation.prepare(draft);
  assert.deepEqual(preparation.observeResources(), []);
  assert.equal(ownsDataDirectoryProcessOwner(directoryOwner, dataDir), true);
  for (const member of declaration.members) {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      const row = readOriginalAllocationRow({db, member});
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
  assert.throws(() => preparation.prepare(draft), hold(REASON.REENTRANT));
});

// Owner decision 2026-10-26 Q2: the lifecycle owner mints the original
// incarnation and the declaration consumes the returned identity.
test('the declaration chooses no incarnation; it consumes each lifecycle-owner stamp', (t) => {
  const f = fixture(t);
  assert.equal(f.draft.members.some((member) => Object.hasOwn(member, 'incarnation')), false,
    'the declaration owner declares founders without an incarnation');
  const declaration = f.preparation.prepare(f.draft);
  assert.equal(Object.isFrozen(declaration), true);
  const stamps = declaration.members.map((member) => {
    const row = readDurableReplicaLifecycle(member.dbPath, member.groupId, member.replicaId);
    assert.equal(row.state, 'active');
    assert.equal(typeof row.incarnation, 'string');
    assert.equal(member.incarnation, row.incarnation,
      'the declared incarnation is the lifecycle row the owner stamped');
    assert.notEqual(member.incarnation, member.createAttemptToken);
    return member.incarnation;
  });
  assert.equal(new Set(stamps).size, declaration.members.length, 'one fresh stamp per founder');
  assert.deepEqual(declaration.members.map(({incarnation: _stamp, ...rest}) => rest),
    structuredClone(f.draft.members), 'the declaration is the draft plus the owner stamps');
});

test('prepare refuses a caller-chosen incarnation before any member file', (t) => {
  const f = fixture(t);
  const draft = structuredClone(f.draft);
  draft.members[0].incarnation = 'caller-chosen-incarnation';
  refuseBeforeFiles(f, draft, REASON.IDENTITY, 'prepare');
});

test('a complete declaration is not a draft: prepare refuses retained stamps', (t) => {
  const f = fixture(t);
  refuseBeforeFiles(f, f.declaration, REASON.IDENTITY, 'prepare');
});

test('inspection refuses a declaration that lacks its lifecycle-owner stamps', (t) => {
  const f = fixture(t);
  refuseBeforeFiles(f, f.draft, REASON.IDENTITY, 'inspect');
});

// Partial preparation is explicit and fails closed: founders born without
// their declaration are never issued, and their files hold a later attempt.
test('a cohort born before its declaration fails closed and is never reissued', (t) => {
  const f = fixture(t);
  const failure = new Error('declaration write failed after every birth');
  const originalExec = Database.prototype.exec;
  const fault = t.mock.method(Database.prototype, 'exec', function(sql, ...rest) {
    if (/ALTER TABLE[\s\S]*original_allocation/u.test(sql)) throw failure;
    return Reflect.apply(originalExec, this, [sql, ...rest]);
  });
  try {
    assert.throws(() => f.preparation.prepare(f.draft), (error) => error === failure);
  } finally {
    fault.mock.restore();
  }
  assert.deepEqual(f.preparation.observeResources(), []);
  for (const member of f.draft.members) {
    const row = readDurableReplicaLifecycle(member.dbPath, member.groupId, member.replicaId);
    assert.equal(row.state, 'active', 'every founder was born before any declaration write');
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      assert.equal(db.prepare(`SELECT native_history_state AS h FROM ${TABLE}
        WHERE replica_identity = ?`).get(member.replicaId).h, HISTORY.NEVER_OPENED);
      assert.equal(RaftRsDurableStore.hasDurableRecordIn(db, member.groupId), false);
    } finally {
      db.close();
    }
  }
  const successor = new RaftRsOriginalAllocationPreparation({directoryOwner: f.directoryOwner,
    ...f.identity});
  t.after(() => successor.close());
  assert.equal(successor.readDeclaration(originalSeedAnchor(f.dataDir)).state, STATE.ABSENT,
    'no declaration was issued');
  const retry = new RaftRsOriginalAllocationPreparation({directoryOwner: f.directoryOwner,
    ...f.identity});
  t.after(() => retry.close());
  assert.throws(() => retry.prepare(f.draft), hold(REASON.HISTORY),
    'the born files hold every later original attempt');
  assert.throws(() => retry.openingFor(f.draft.members[0].replicaId), hold(REASON.CLOSED));
});
