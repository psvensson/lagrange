// Deterministic application counterexample, conditional on legitimate same-service-ID
// recreation into a new application database without a creation-origin guard.
// Real SQLite transactions; supplied positions are component inputs, NOT RF3 evidence.
// No claim of a native delivery schedule, lost committed data, or snapshot installation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {WasmWriterState} from '../../src/wasm-service/wasm-writer-state.js';
import {SessionKVStore} from '../../src/wasm-service/session-kv-store.js';
import {WASM_WRITER_PROFILE as P, WRITER_REASON as R} from
  '../../src/wasm-service/wasm-writer-profile.js';
import {
  encodeInstanceJson,
  instanceDigest,
  instanceIncarnation,
} from '../../src/control-plane/owners/service-instance-contract.js';
import {canonicalWriterCommand, writerCommandFromDelivery} from
  '../../src/wasm-service/wasm-writer-codec.js';

const SERVICE = 'recreated-service';
const OLD_INCARNATION = '1'.repeat(64);
const RECREATED_REQUEST_DIGEST = '2'.repeat(64);
const NEW_INCARNATION = instanceIncarnation(RECREATED_REQUEST_DIGEST);
const RECREATED_BINDING = Object.freeze({
  format: 1,
  tenantId: 'tenant-1',
  serviceDefinitionId: SERVICE,
  requestId: {
    serviceDefinitionId: SERVICE,
    expectedVersion: 1,
    nonce: '4'.repeat(64),
  },
  selectionVersion: 2,
  incarnation: NEW_INCARNATION,
  requestDigest: RECREATED_REQUEST_DIGEST,
  revisionId: 'rev-1',
  revisionDigest: '6'.repeat(64),
  definitionDigest: '7'.repeat(64),
  profileDigest: instanceDigest(P.id),
  foundingPeers: [{replicaId: `${SERVICE}-r1`, nodeId: 'node-1'}],
});
const PREFIX = {type: P.type, profile: P.id};
const originalInit = canonicalWriterCommand({...PREFIX, action: 'INIT', serviceId: SERVICE,
  incarnation: OLD_INCARNATION, nonce: '3'.repeat(64)});
const intendedFreshInit = canonicalWriterCommand({...PREFIX, action: 'INIT', serviceId: SERVICE,
  incarnation: NEW_INCARNATION, nonce: '4'.repeat(64)});
const originalEnroll = canonicalWriterCommand({...PREFIX, action: 'ENROLL', serviceId: SERVICE,
  incarnation: OLD_INCARNATION, slot: 0, expectedGeneration: 0, expectedCompletedSequence: 0,
  expectedReceiptDigest: null, newGeneration: 1, nonce: '5'.repeat(64)});
const originalWrite = writerCommandFromDelivery({operation: 'write',
  requestId: {serviceId: SERVICE, incarnation: OLD_INCARNATION,
    slot: 0, generation: 1, sequence: 1}, ack: null,
  sessionId: 'session', key: 'key', value: 'old-writer-value'});
const oldCommands = [originalInit, originalEnroll, originalWrite];

function temporaryDirectory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-origin-v1-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function openApplication(path, serviceId = SERVICE, binding = null) {
  const db = new Database(path);
  try {
    if (binding !== null) {
      db.exec(
        'CREATE TABLE _wasm_creation_root (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL);' +
        'CREATE TABLE _wasm_creation_local (id INTEGER PRIMARY KEY CHECK(id=1), record TEXT NOT NULL);',
      );
      db.prepare('INSERT INTO _wasm_creation_root (id,binding) VALUES (1,?)')
        .run(encodeInstanceJson(binding, 4096));
    }
    const {state, kv} = db.transaction(() => ({state: new WasmWriterState(db, serviceId),
      kv: new SessionKVStore(db)}))();
    const apply = db.transaction((command, index) => state.apply(command, kv, index, 1));
    const observe = () => ({meta: state.meta(), slots: state.allSlots.all(),
      kv: db.prepare('SELECT session_id,key,hex(value) AS value_hex,updated_at ' +
        'FROM _kv_store ORDER BY session_id,key').all()});
    return {db, state, kv, apply, observe};
  } catch (error) {
    db.close();
    throw error;
  }
}

function establishOriginal(path) {
  const app = openApplication(path);
  try {
    const events = oldCommands.map((command, offset) => {
      const result = app.apply(command, offset + 1);
      assert.equal(result.status, 'RECORDED');
      assert.equal(result.accepted, true);
      return {position: {index: offset + 1, term: 1}, command, result};
    });
    return {events, state: app.observe()};
  } finally {
    app.db.close();
  }
}

function fileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('WasmWriterState refuses revival of an old writer after same-service recreation', (t) => {
  const dir = temporaryDirectory(t);
  const originalPath = join(dir, 'original.sqlite');
  const freshPath = join(dir, 'explicitly-recreated.sqlite');
  const original = establishOriginal(originalPath);
  const originalHash = fileDigest(originalPath);
  const fresh = openApplication(freshPath, SERVICE, RECREATED_BINDING);
  try {
    const before = fresh.observe();
    assert.equal(before.meta.initialization, null);
    assert.equal(before.slots.length, 0);
    assert.deepEqual(before.kv, []);
    // The recreated service's trusted caller selected J, but that intent has not
    // reached application. No current API binds J to this new physical database.
    const events = oldCommands.map((command, offset) => ({
      position: {index: offset + 1, term: 1}, command,
      result: fresh.apply(command, offset + 1),
    }));
    const after = fresh.observe();
    assert.equal(fileDigest(originalPath), originalHash, 'original database bytes preserved');
    const revived = events[2].result.status === 'RECORDED' &&
      events[2].result.accepted === true &&
      fresh.kv.get('session', 'key')?.toString() === 'old-writer-value';
    t.diagnostic(JSON.stringify({scope: 'conditional deterministic application counterexample',
      condition: 'same serviceId recreated in a fresh database before intended INIT J applies',
      originalDatabaseSha256: originalHash, original, before,
      intendedFreshInit: {command: intendedFreshInit, ordered: false}, events, after, revived}));
    assert.equal(revived, false, 'OLD_WRITER_REVIVED_AFTER_RECREATION');
  } finally {
    fresh.db.close();
  }
});

test('WasmWriterState same-file restart retains exact old outcome without reexecution', (t) => {
  const dir = temporaryDirectory(t);
  const path = join(dir, 'retained.sqlite');
  const original = establishOriginal(path);
  const reopened = openApplication(path);
  try {
    assert.deepEqual(reopened.observe(), original.state);
    const result = reopened.apply(originalWrite, 4);
    assert.deepEqual(result, original.events[2].result);
    assert.deepEqual(reopened.observe(), original.state);
    assert.equal(result.receipt.index, 3);
    t.diagnostic(JSON.stringify({scope: 'clean same-file reopen, not process-loss durability',
      command: originalWrite, replayPosition: 4, result, state: reopened.observe()}));
  } finally {
    reopened.db.close();
  }
});

test('WasmWriterState different service identity rejects the original initialization and writer', (t) => {
  const dir = temporaryDirectory(t);
  const app = openApplication(join(dir, 'different-service.sqlite'), 'different-service');
  try {
    const before = app.observe();
    const events = oldCommands.map((command, offset) => ({command,
      result: app.apply(command, offset + 1)}));
    for (const event of events) {
      assert.equal(event.result.status, 'REFUSED');
      assert.equal(event.result.reason, R.INCARNATION);
    }
    assert.deepEqual(app.observe(), before);
    t.diagnostic(JSON.stringify({scope: 'different service identity control', events,
      state: app.observe()}));
  } finally {
    app.db.close();
  }
});
