// Fault the actual better-sqlite3 methods after acquisition. The startup ledger
// is real; no native Raft opening or complete public startup is claimed here.
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
import {RaftRsPreparationCustody} from '../../src/raft/raft-rs-preparation-custody.js';
import {readOriginalAllocationRow} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {acquireDataDirectoryProcessOwner, ownsDataDirectoryProcessOwner,
  DATA_DIRECTORY_OWNER_ERROR_CODE} from '../../src/storage/data-directory-process-owner.js';
import {createStartupAcquisitionLedger, runStartupWithCleanup} from
  '../../src/entrypoint-startup-acquisition-ledger.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-custody-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'custody-node', buildDigest: 'custody-build'};
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
  t.after(() => {
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {dataDir, directoryOwner, draft, preparation};
}

function containsError(error, expected) {
  return error === expected || (error instanceof AggregateError &&
    error.errors.some((part) => containsError(part, expected)));
}

function formatterFault(t, f, failure, observe) {
  const original = Database.prototype.pragma;
  return t.mock.method(Database.prototype, 'pragma', function(...args) {
    if (this.name === f.draft.members[0].dbPath) {
      const held = f.preparation.observeResources();
      assert.equal(held.length, 1);
      assert.equal(held[0].dbPath, this.name);
      assert.equal(held[0].open, true);
      observe(this);
      throw failure;
    }
    return original.apply(this, args);
  });
}

test('actual native open refusal leaves no inaccessible application handle', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-raw-open-'));
  const custody = new RaftRsPreparationCustody();
  t.after(() => {
    custody.closeAll(); fs.rmSync(dataDir, {recursive: true, force: true});
  });
  // Opening a directory as a SQLite file exercises the actual constructor.
  assert.throws(() => custody.open({replicaId: 'raw-refusal', dbPath: dataDir}),
    (error) => error instanceof Error);
  assert.deepEqual(custody.observe(), []);
});

test('formatter failure owns the returned DB before the fault and closes that DB', (t) => {
  const f = fixture(t);
  const failure = new Error('formatter failed after raw open');
  let captured;
  const fault = formatterFault(t, f, failure, (db) => {
    captured = db;
  });
  try {
    assert.throws(() => f.preparation.prepare(f.draft), (error) => error === failure);
  } finally {
    fault.mock.restore();
  }
  assert.ok(captured instanceof Database);
  assert.equal(captured.open, false);
  assert.deepEqual(f.preparation.observeResources(), []);
  assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
  const read = new Database(f.draft.members[0].dbPath, {readonly: true});
  try {
    assert.deepEqual(read.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all(), []);
  } finally {
    read.close();
  }
});

test('formatter and exact close failures retain both errors, the DB and directory custody', async (t) => {
  const f = fixture(t);
  const formatterFailure = new Error('formatter primary');
  const closeFailure = new Error('exact close failed');
  let captured;
  let closes = 0;
  const pragmaFault = formatterFault(t, f, formatterFailure, (db) => {
    captured = db;
  });
  const originalClose = Database.prototype.close;
  const closeFault = t.mock.method(Database.prototype, 'close', function(...args) {
    if (this === captured) {
      closes++; throw closeFailure;
    }
    return originalClose.apply(this, args);
  });
  const ledger = createStartupAcquisitionLedger();
  ledger.defer(() => f.directoryOwner.release(), {requiresSuccessfulCleanup: true});
  ledger.defer(() => f.preparation.close());
  try {
    await assert.rejects(runStartupWithCleanup(ledger, async () => {
      f.preparation.prepare(f.draft);
    }), (error) => containsError(error, formatterFailure) && containsError(error, closeFailure));
    assert.equal(closes, 2, 'one preparation unwind and one explicit startup-owner cleanup');
    assert.equal(captured.open, true);
    assert.equal(f.preparation.observeResources().length, 1);
    assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
    assert.throws(() => acquireDataDirectoryProcessOwner(f.dataDir),
      (error) => error.code === DATA_DIRECTORY_OWNER_ERROR_CODE);
    assert.throws(() => f.preparation.assertCurrent(),
      (error) => error.code === STATE.HOLD && error.reason === REASON.CLOSED);
  } finally {
    pragmaFault.mock.restore();
    closeFault.mock.restore();
  }
  f.preparation.close();
  assert.equal(captured.open, false);
  assert.deepEqual(f.preparation.observeResources(), []);
  f.directoryOwner.release();
  const successor = acquireDataDirectoryProcessOwner(f.dataDir);
  successor.release();
});

test('post-ISSUED close failure retains only the exact failed handle and never returns success', (t) => {
  const f = fixture(t);
  const first = f.draft.members[0];
  const failure = new Error('post-issue exact close failed');
  let captured;
  const closed = [];
  const originalClose = Database.prototype.close;
  const fault = t.mock.method(Database.prototype, 'close', function(...args) {
    if (this.name === first.dbPath) {
      captured = this; throw failure;
    }
    const result = originalClose.apply(this, args);
    closed.push(this);
    return result;
  });
  try {
    assert.throws(() => f.preparation.prepare(f.draft),
      (error) => containsError(error, failure));
    assert.equal(captured.open, true);
    assert.equal(closed.length, f.draft.members.length - 1);
    assert.ok(closed.every((db) => db.open === false));
    assert.deepEqual(f.preparation.observeResources().map((slot) => slot.replicaId),
      [first.replicaId]);
    assert.throws(() => f.preparation.assertCurrent(),
      (error) => error.code === STATE.HOLD && error.reason === REASON.CLOSED);
    assert.equal(ownsDataDirectoryProcessOwner(f.directoryOwner, f.dataDir), true);
  } finally {
    fault.mock.restore();
  }
  f.preparation.close();
  assert.equal(captured.open, false);
  assert.deepEqual(f.preparation.observeResources(), []);
  const anchor = f.draft.members.find((m) => m.replicaId === f.draft.anchorReplicaId);
  const read = new Database(anchor.dbPath, {readonly: true, fileMustExist: true});
  try {
    // The failed preparation returned nothing: read the declaration it issued.
    const issued = JSON.parse(read.prepare(`SELECT ${COLUMN.DECLARATION} AS issued
      FROM ${TABLE} WHERE replica_identity = ?`).get(anchor.replicaId).issued);
    const issuedAnchor = issued.members.find((m) => m.replicaId === issued.anchorReplicaId);
    assert.equal(readOriginalAllocationRow({db: read, member: issuedAnchor})[COLUMN.ISSUE],
      STATE.ISSUED,
      'cleanup cannot undo a durable issue or turn it into a new original allocation');
  } finally {
    read.close();
  }
});
