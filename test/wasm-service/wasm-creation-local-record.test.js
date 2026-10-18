// COMPONENT oracle of the receiver-local creation record as a named phase
// machine (design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D2'/D2, N14):
// real SQLite file, real metadata binding/token from the component owner, no
// native Raft, no serving grant and no retirement CAS claimed here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {createCreationSqliteFixture} from
  '../control-plane/service-instance-creation-sqlite-fixture.js';
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../../src/constants/service-instance.js';
import {CONSENSUS_CREATION_OPENING as OPENING} from
  '../../src/service/service-consensus-creation-intent.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {REPLICA_DB_PRAGMA} from '../../src/storage/storage-constants.js';
import {RAFT_RS_SYNCHRONOUS_PRAGMA} from '../../src/raft/raft-rs-durable-store-constants.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL} from '../../src/wasm-service/wasm-service-constants.js';
import {
  openWasmCreationRecords, readWasmCreationLocal, recordWasmCreationLocalPhase,
  tombstoneWasmCreationLocal, wasmCreationLocalIdentity,
  WASM_CREATION_LOCAL_PHASE as LOCAL_PHASE, WASM_CREATION_LOCAL_RECORD as LOCAL_RECORD,
  WASM_CREATION_RETIREMENT as RETIREMENT, inspectWasmCreationLocal,
} from '../../src/wasm-service/wasm-creation-opening.js';

const LOCAL_BYTES = 8192;
const CLAIM_ID = '7'.repeat(64);
const AT = 1234;
const RETIRE_REASON = 'retire_resource';

function openFile(path) {
  const db = new Database(path);
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  return db;
}

// A replica-shaped owner context for the opening owner: creation, identity,
// opening claim and file identity exactly as the lifecycle supplies them.
async function component(t) {
  const f = await createCreationSqliteFixture(t);
  const selected = await f.primary.selectConsensusInstance(f.request());
  assert.equal(selected.outcome, OUTCOME.SELECTED);
  const binding = selected.binding;
  const request = f.slotRequest();
  const reserved = await f.primary.reserveInstanceResource(binding, request);
  assert.equal(reserved.outcome, OUTCOME.ADMITTED);
  const identity = runtimeServiceConsensusIdentity(binding, request);
  const directory = mkdtempSync(join(tmpdir(), 'wasm-creation-local-'));
  const path = join(directory, `${identity.replicaId}.db`);
  const open = [];
  t.after(() => {
    for (const db of open) if (db.open) db.close();
    rmSync(directory, {recursive: true, force: true});
  });
  const storage = {path, device: '1', inode: '1'};
  const openingRecord = {format: 1, claimId: CLAIM_ID, intentDigest: 'c'.repeat(57),
    token: reserved.token, groupId: identity.groupId, replicaId: identity.replicaId,
    nodeId: identity.nodeId};
  function replica(db, outcome = OPENING.FRESH) {
    return {db, replicaId: identity.replicaId, nodeId: identity.nodeId,
      consensusCreation: {intent: {consensusBinding: binding, consensusSlotRequest: request},
        token: reserved.token, identity},
      creationOpening: {outcome, record: openingRecord},
      dataDirectoryManager: {getWasmServiceFileIdentity: () => storage}};
  }
  function fresh() {
    const db = openFile(path);
    open.push(db);
    const owner = replica(db, OPENING.FRESH);
    db.transaction(() => openWasmCreationRecords(owner))();
    return {db, owner};
  }
  function reopen(db) {
    return db.transaction(() => openWasmCreationRecords(replica(db, OPENING.RETAINED)))();
  }
  return {f, binding, token: reserved.token, identity, path, storage, fresh, reopen, replica,
    open, openFile: () => {
      const db = openFile(path);
      open.push(db);
      return db;
    }};
}

function localIdentityOf(c) {
  return wasmCreationLocalIdentity(c.replica(null, OPENING.RETAINED));
}

test('FRESH opening writes an ADMITTED record with explicit null grant and retirement', async (t) => {
  const c = await component(t);
  const {db} = c.fresh();
  const local = readWasmCreationLocal(db);
  assert.ok(local, 'the local record exists after a fresh opening');
  assert.equal(local.record.phase, LOCAL_PHASE.ADMITTED);
  assert.equal(local.record.grant, null);
  assert.equal(local.record.retirement, null);
  assert.deepEqual(Object.keys(local.record).sort(),
    ['format', 'grant', 'groupId', 'nodeId', 'opening', 'phase', 'replicaId', 'retirement',
      'storage', 'token']);
  assert.ok(Buffer.byteLength(local.encoded) <= LOCAL_BYTES);
  assert.equal(readWasmCreationLocal(openFile(':memory:')), null, 'no table is a typed absence');
});

test('phase CAS table: ADMITTED -> PUBLISHED -> RETIRED, same phase answers ALREADY, RETIRED is terminal',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    const grant = {token: c.token, at: AT};
    const published = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.PUBLISHED, detail: {grant}});
    assert.equal(published.outcome, LOCAL_RECORD.RECORDED);
    assert.deepEqual(readWasmCreationLocal(db).record.grant, grant);
    assert.equal(readWasmCreationLocal(db).record.phase, LOCAL_PHASE.PUBLISHED);
    const again = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.PUBLISHED, detail: {grant}});
    assert.equal(again.outcome, LOCAL_RECORD.ALREADY, 'a recorded PUBLISHED phase is idempotent');
    assert.deepEqual(readWasmCreationLocal(db).record.grant, grant, 'ALREADY rewrites nothing');
    const backwards = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.PUBLISHED, to: LOCAL_PHASE.ADMITTED, detail: {}});
    assert.equal(backwards.outcome, OUTCOME.INVALID_EXPECTED_STATE, 'no phase moves backwards');
    const retirement = {reason: RETIRE_REASON, at: AT + 1};
    const retired = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.PUBLISHED, to: LOCAL_PHASE.RETIRED, detail: {retirement}});
    assert.equal(retired.outcome, LOCAL_RECORD.RECORDED);
    const after = readWasmCreationLocal(db).record;
    assert.equal(after.phase, LOCAL_PHASE.RETIRED);
    assert.deepEqual(after.retirement, retirement);
    assert.deepEqual(after.grant, grant, 'retirement keeps the recorded grant');
    const revive = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.RETIRED, to: LOCAL_PHASE.PUBLISHED, detail: {grant}});
    assert.equal(revive.outcome, WASM_SERVICE_LIFECYCLE_REFUSAL.CREATION_RETIRED,
      'RETIRED is terminal');
    const mismatch = recordWasmCreationLocalPhase(db,
      {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.RETIRED, detail: {retirement}});
    assert.equal(mismatch.outcome, LOCAL_RECORD.ALREADY, 'a RETIRED record answers ALREADY');
    assert.deepEqual(readWasmCreationLocal(db).record, after, 'a refused CAS writes nothing');
  });

test('an admitted, never-published record retires directly', async (t) => {
  const c = await component(t);
  const {db} = c.fresh();
  const retirement = {reason: RETIRE_REASON, at: AT};
  assert.equal(recordWasmCreationLocalPhase(db,
    {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.RETIRED, detail: {retirement}}).outcome,
  LOCAL_RECORD.RECORDED);
  const record = readWasmCreationLocal(db).record;
  assert.equal(record.phase, LOCAL_PHASE.RETIRED);
  assert.equal(record.grant, null);
  assert.deepEqual(record.retirement, retirement);
});

test('the phase CAS commits through commitDurably: synchronous raised to FULL and restored',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    const pragmas = [];
    const pragma = db.pragma.bind(db);
    db.pragma = (statement, options) => {
      pragmas.push(statement);
      return pragma(statement, options);
    };
    const before = pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.READ, {simple: true});
    assert.ok(before < RAFT_RS_SYNCHRONOUS_PRAGMA.FULL_LEVEL, 'the replica file opens below FULL');
    recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.PUBLISHED,
      detail: {grant: {token: c.token, at: AT}}});
    assert.ok(pragmas.includes(RAFT_RS_SYNCHRONOUS_PRAGMA.SET_FULL),
      'DURABLE_COMMIT_DID_NOT_RAISE_SYNCHRONOUS');
    assert.equal(pragma(RAFT_RS_SYNCHRONOUS_PRAGMA.READ, {simple: true}), before,
      'the connection returns to its own level');
    assert.equal(db.inTransaction, false);
  });

test('a RETAINED reopen checks the identity projection with exact fields and canonical bytes',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    assert.doesNotThrow(() => c.reopen(db), 'an untouched record reopens');
    const stored = db.prepare('SELECT record FROM _wasm_creation_local WHERE id=1').get().record;
    const write = (text) => db.prepare('UPDATE _wasm_creation_local SET record=? WHERE id=1').run(text);
    const tamper = (change) => {
      const record = JSON.parse(stored);
      change(record);
      write(JSON.stringify(record));
    };
    tamper((record) => {
      record.nodeId = 'another-node';
    });
    assert.throws(() => c.reopen(db), {outcome: OUTCOME.CONTENT_CONFLICT},
      'IDENTITY_FIELD_CHANGE_REOPENED');
    tamper((record) => {
      record.extra = true;
    });
    assert.throws(() => c.reopen(db), {outcome: OUTCOME.CORRUPT_STATE},
      'EXTRA_KEY_PASSED_EXACT_FIELDS');
    write(`${stored} `);
    assert.throws(() => c.reopen(db), {outcome: OUTCOME.CORRUPT_STATE},
      'NON_CANONICAL_ENCODING_PASSED');
    tamper((record) => {
      record.storage = {...record.storage, inode: '999'};
    });
    assert.throws(() => c.reopen(db), {outcome: OUTCOME.CONTENT_CONFLICT},
      'FILE_IDENTITY_CHANGE_REOPENED');
    write(stored);
    assert.doesNotThrow(() => c.reopen(db));
    const published = recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED,
      to: LOCAL_PHASE.PUBLISHED, detail: {grant: {token: c.token, at: AT}}});
    assert.equal(published.outcome, LOCAL_RECORD.RECORDED);
    assert.doesNotThrow(() => c.reopen(db), 'PUBLISHED is an admitted reopen phase');
  });

test('a RETIRED record refuses a RETAINED reopen typed before any native handle', async (t) => {
  const c = await component(t);
  const {db} = c.fresh();
  assert.equal(recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED,
    to: LOCAL_PHASE.RETIRED, detail: {retirement: {reason: RETIRE_REASON, at: AT}}}).outcome,
  LOCAL_RECORD.RECORDED);
  assert.throws(() => c.reopen(db), {outcome: WASM_SERVICE_LIFECYCLE_REFUSAL.CREATION_RETIRED});
});

test('tombstone by path and by connection: RETIRED, ALREADY, storage missing, identity mismatch',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    db.close();
    const identity = localIdentityOf(c);
    const retirement = {reason: RETIRE_REASON, at: AT};
    const first = tombstoneWasmCreationLocal({dbPath: c.path}, identity, retirement);
    assert.equal(first.outcome, RETIREMENT.RETIRED);
    const reread = c.openFile();
    assert.equal(readWasmCreationLocal(reread).record.phase, LOCAL_PHASE.RETIRED);
    assert.deepEqual(readWasmCreationLocal(reread).record.retirement, retirement);
    reread.close();
    const second = tombstoneWasmCreationLocal({dbPath: c.path}, identity, retirement);
    assert.equal(second.outcome, RETIREMENT.ALREADY);
    const foreign = tombstoneWasmCreationLocal({dbPath: c.path},
      {...identity, token: {...identity.token, operationId: 'other-operation'}}, retirement);
    assert.equal(foreign.outcome, OUTCOME.CONTENT_CONFLICT, 'A_FOREIGN_TOKEN_RETIRED_THE_FILE');
    const missing = tombstoneWasmCreationLocal({dbPath: join(c.path, '..', 'absent.db')},
      identity, retirement);
    assert.equal(missing.outcome, RETIREMENT.CREATION_STORAGE_MISSING);
    assert.equal(existsSync(join(c.path, '..', 'absent.db')), false,
      'A_BY_PATH_TOMBSTONE_CREATED_A_FILE');
    // A partial identity (what a by-token retire can derive) is checked on the
    // fields it supplies; it never passes on a different physical replica.
    const partial = tombstoneWasmCreationLocal({dbPath: c.path},
      {format: identity.format, groupId: identity.groupId, replicaId: 'not-this-replica',
        nodeId: identity.nodeId, token: identity.token}, retirement);
    assert.equal(partial.outcome, OUTCOME.CONTENT_CONFLICT);
  });

test('tombstone on a live connection writes PUBLISHED -> RETIRED durably and keeps the grant',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    const grant = {token: c.token, at: AT};
    recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED, to: LOCAL_PHASE.PUBLISHED,
      detail: {grant}});
    const pragmas = [];
    const pragma = db.pragma.bind(db);
    db.pragma = (statement, options) => {
      pragmas.push(statement);
      return pragma(statement, options);
    };
    const result = tombstoneWasmCreationLocal({db}, localIdentityOf(c),
      {reason: RETIRE_REASON, at: AT + 1});
    assert.equal(result.outcome, RETIREMENT.RETIRED);
    assert.ok(pragmas.includes(RAFT_RS_SYNCHRONOUS_PRAGMA.SET_FULL));
    const record = readWasmCreationLocal(db).record;
    assert.equal(record.phase, LOCAL_PHASE.RETIRED);
    assert.deepEqual(record.grant, grant);
    assert.equal(db.open, true, 'the live tombstone does not close the caller connection');
  });

test('the record byte bound refuses an oversized retirement detail and leaves the record intact',
  async (t) => {
    const c = await component(t);
    const {db} = c.fresh();
    const before = readWasmCreationLocal(db);
    assert.throws(() => recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED,
      to: LOCAL_PHASE.RETIRED, detail: {retirement: {reason: 'x'.repeat(LOCAL_BYTES), at: AT}}}),
    {outcome: OUTCOME.INVALID_REQUEST});
    assert.deepEqual(readWasmCreationLocal(db), before);
    assert.equal(db.inTransaction, false);
  });

// Design RECOVERY-DESIGN-20261017 R1-A, R2-C (N13), R2-F: the by-path local
// reader of the restart inventory, read-only, seven identity fields.
test('R1-A/N13 the by-path reader classifies (opening, file) and the seven identity fields, ' +
  'read-only', async (t) => {
  const c = await component(t);
  const identity = localIdentityOf(c);
  const unclaimed = {...identity, opening: null, storage: null};
  const read = (value = identity, binding = c.binding) =>
    inspectWasmCreationLocal(c.path, value, binding).outcome;
  assert.equal(read(unclaimed), 'ABSENT_UNCLAIMED', '(null, no file)');
  assert.equal(read(), 'ABSENT_CLAIMED', '(claimed, no file)');
  assert.equal(existsSync(c.path), false, 'the reader never creates the file');
  c.openFile().close();
  assert.equal(read(unclaimed), 'ABSENT_UNCLAIMED', '(null, zero tables): a FRESH precondition');
  assert.equal(read(), 'ABSENT_CLAIMED', '(claimed, zero tables)');
  const {db} = c.fresh();
  assert.equal(read(unclaimed), 'CONTENT_CONFLICT', '(null, tables): cannot arise');
  assert.equal(read(), LOCAL_PHASE.ADMITTED);
  for (const field of ['storage', 'opening', 'token']) {
    const other = {...identity, [field]: field === 'storage' ?
      {...identity.storage, inode: '2'} : field === 'opening' ?
        {...identity.opening, claimId: '8'.repeat(64)} : {...identity.token, ordinal: 9}};
    assert.equal(read(other), 'CONTENT_CONFLICT', `${field} mismatch (seven fields)`);
  }
  assert.equal(read(identity, {...c.binding, incarnation: c.binding.incarnation + 1}),
    'CONTENT_CONFLICT', 'root binding mismatch');
  const before = db.prepare('SELECT record FROM _wasm_creation_local').get().record;
  assert.equal(recordWasmCreationLocalPhase(db, {from: LOCAL_PHASE.ADMITTED,
    to: LOCAL_PHASE.PUBLISHED, detail: {grant: {token: c.token, at: AT}}}).outcome,
  LOCAL_RECORD.RECORDED);
  assert.equal(read(), LOCAL_PHASE.PUBLISHED);
  assert.equal(tombstoneWasmCreationLocal({db}, identity, {reason: RETIRE_REASON, at: AT}).outcome,
    RETIREMENT.RETIRED);
  assert.equal(read(), LOCAL_PHASE.RETIRED);
  db.prepare('UPDATE _wasm_creation_local SET record = ?').run('{"corrupt":true}');
  assert.equal(read(), 'CORRUPT_STATE');
  db.prepare('UPDATE _wasm_creation_local SET record = ?').run(before);
  const record = db.prepare('SELECT record FROM _wasm_creation_local').get().record;
  read();
  assert.equal(db.prepare('SELECT record FROM _wasm_creation_local').get().record, record,
    'the reader wrote nothing');
});
