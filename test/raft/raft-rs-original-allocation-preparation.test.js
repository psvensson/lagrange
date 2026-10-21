// Canonical dependency witnesses. No native core or public startup is opened.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {createSeedOriginalAllocation, originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {RaftRsOriginalAllocationPreparation} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

function fixture(t, contextChanges = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-allocation-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const context = {dataDir, nodeId: 'original-seed', buildDigest: 'test-measured-build'};
  const declaration = createSeedOriginalAllocation({...context, now: 1000});
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner,
    ...context, ...contextChanges});
  t.teardown(() => {
    // Never release directory custody ahead of the owner's actual cleanup.
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {dataDir, directoryOwner, preparation, declaration};
}

function hold(reason) {
  return (error) => error.code === STATE.HOLD && error.reason === reason;
}

const malformed = [
  ['empty cohort', REASON.INCOMPLETE, (value) => { value.members = []; }],
  ['anchor-only cohort', REASON.INCOMPLETE, (value) => {
    value.members = value.members.filter(({replicaId}) => replicaId === value.anchorReplicaId);
  }],
  ['missing member', REASON.INCOMPLETE, (value) => { value.members.pop(); }],
  ['duplicate member', REASON.IDENTITY, (value) => { value.members[1] = value.members[0]; }],
  ['foreign node', REASON.IDENTITY, (value) => { value.nodeId = 'foreign-node'; }],
  ['foreign build', REASON.IDENTITY, (value) => { value.buildDigest = 'foreign-build'; }],
  ['foreign member path', REASON.IDENTITY, (value) => {
    value.members[0].dbPath = path.join(value.dataDir, 'wrong-member.db');
  }],
  ['invalid declaration time', REASON.IDENTITY, (value) => { value.declaredAt = -1; }],
  ['aliased incarnation and birth token', REASON.IDENTITY, (value) => {
    value.members[0].incarnation = value.members[0].createAttemptToken;
  }],
];

for (const operation of ['prepare', 'inspect']) {
  for (const [name, reason, mutate] of malformed) {
    test(`original preparation ${operation} rejects ${name} before member I/O`, async (t) => {
      const {dataDir, preparation, declaration} = fixture(t);
      const before = fs.readdirSync(dataDir).sort();
      const invalid = structuredClone(declaration);
      mutate(invalid);
      let applicationInspections = 0;
      assert.throws(() => preparation[operation](invalid, () => {
        applicationInspections++;
        return STATE.HISTORY_ACCEPTED;
      }), hold(reason));
      assert.equal(applicationInspections, 0);
      assert.deepEqual(preparation.observeResources(), []);
      assert.deepEqual(fs.readdirSync(dataDir).sort(), before);
      assert.throws(() => preparation.assertCurrent(), hold(REASON.CLOSED));
    });
  }
}

for (const [name, contextChanges] of [
  ['missing node identity', {nodeId: undefined}],
  ['missing build identity', {buildDigest: undefined}],
  ['different live node', {nodeId: 'different-live-node'}],
  ['different live build', {buildDigest: 'different-live-build'}],
]) {
  test(`original preparation uses independently supplied context: ${name}`,
    async (t) => {
      const {dataDir, preparation, declaration} = fixture(t, contextChanges);
      const before = fs.readdirSync(dataDir).sort();
      assert.throws(() => preparation.prepare(declaration), hold(REASON.IDENTITY));
      assert.deepEqual(fs.readdirSync(dataDir).sort(), before);
    });
}

test('original preparation persists every canonical member before exact anchor issuance', async (t) => {
  const {preparation, declaration, dataDir} = fixture(t);
  assert.deepEqual(preparation.readDeclaration(originalSeedAnchor(dataDir)), {state: STATE.ABSENT});
  preparation.prepare(declaration);
  assert.deepEqual(preparation.observeResources(), []);
  for (const member of declaration.members) {
    const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
    try {
      const row = db.prepare(`SELECT * FROM ${TABLE}
        WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`)
        .get(member.groupId, member.peerId, member.replicaId);
      const anchor = member.replicaId === declaration.anchorReplicaId;
      assert.equal(row.incarnation, member.incarnation);
      assert.equal(row.state, 'active');
      assert.equal(row.native_history_state, RAFT_RS_OPENING_HISTORY.NEVER_OPENED);
      assert.equal(row[COLUMN.DECLARATION], JSON.stringify(declaration));
      assert.equal(row[COLUMN.MEMBER], JSON.stringify(member));
      assert.equal(row[COLUMN.ISSUE], anchor ? STATE.ISSUED : STATE.PREPARING);
      assert.equal(row[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
      assert.equal(row[COLUMN.IDENTITY_RIGHT], anchor ? STATE.UNUSED : null);
    } finally {
      db.close();
    }
  }
  assert.throws(() => preparation.prepare(declaration), hold(REASON.REENTRANT));
});

test('original preparation checks the entire virgin inventory before opening its first member', async (t) => {
  const {preparation, declaration} = fixture(t);
  const last = declaration.members.at(-1);
  fs.mkdirSync(path.dirname(last.dbPath), {recursive: true});
  fs.writeFileSync(last.dbPath, 'pre-existing-history');
  assert.throws(() => preparation.prepare(declaration), hold(REASON.HISTORY));
  assert.equal(fs.readFileSync(last.dbPath, 'utf8'), 'pre-existing-history');
  for (const member of declaration.members.slice(0, -1)) {
    assert.equal(fs.existsSync(member.dbPath), false);
  }
  assert.deepEqual(preparation.observeResources(), []);
});

test('original preparation cannot use a revoked attempt', async (t) => {
  const {dataDir, preparation, declaration} = fixture(t);
  const before = fs.readdirSync(dataDir).sort();
  preparation.revoke();
  assert.throws(() => preparation.prepare(declaration), hold(REASON.CLOSED));
  assert.deepEqual(fs.readdirSync(dataDir).sort(), before);
});

test('original preparation cannot outlive actual directory custody', async (t) => {
  const {dataDir, directoryOwner, preparation, declaration} = fixture(t);
  directoryOwner.release();
  const before = fs.readdirSync(dataDir).sort();
  assert.throws(() => preparation.prepare(declaration), hold(REASON.DIRECTORY));
  assert.deepEqual(fs.readdirSync(dataDir).sort(), before);
});
