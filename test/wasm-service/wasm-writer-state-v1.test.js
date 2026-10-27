// Component proof: real SQLite and application transactions, not native RF3/Ready proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {WasmWriterState} from '../../src/wasm-service/wasm-writer-state.js';
import {SessionKVStore} from '../../src/wasm-service/session-kv-store.js';
import {WASM_WRITER_PROFILE as P, WRITER_REASON as R} from
  '../../src/wasm-service/wasm-writer-profile.js';
import {canonicalWriterCommand, writerCommandFromDelivery, writerDigest,
  exactWriterPosition, boundedJson} from '../../src/wasm-service/wasm-writer-codec.js';

const SERVICE = 'writer-component';
const INCARNATION = 'a'.repeat(64);
const PREFIX = {type: P.type, profile: P.id};
const init = (serviceId = SERVICE) => ({...PREFIX, action: 'INIT', serviceId,
  incarnation: INCARNATION, nonce: 'b'.repeat(64)});
const admin = (slot = 0, changes = {}) => ({...PREFIX, action: 'ENROLL',
  serviceId: SERVICE, incarnation: INCARNATION, slot, expectedGeneration: 0,
  expectedCompletedSequence: 0, expectedReceiptDigest: null, newGeneration: 1,
  nonce: 'c'.repeat(64), ...changes});
const write = (changes = {}, identity = {}) => writerCommandFromDelivery({
  operation: 'write', requestId: {serviceId: SERVICE, incarnation: INCARNATION,
    slot: 0, generation: 1, sequence: 1, ...identity}, ack: null,
  sessionId: 'session', key: 'key', value: 'A', ...changes,
});

function fixture(t, path = ':memory:', service = SERVICE) {
  const db = new Database(path);
  t.after(() => db.close());
  const {state, kv} = db.transaction(() => ({
    state: new WasmWriterState(db, service), kv: new SessionKVStore(db),
  }))();
  let index = 0;
  // The transaction is real; positions are supplied component inputs, not Raft positions.
  const apply = (command, after = () => {}) => db.transaction(() => {
    const answer = state.apply(command, kv, ++index, 1);
    after(answer);
    return answer;
  })();
  const rows = () => ({meta: state.meta(), slots: state.allSlots.all(),
    kv: db.prepare('SELECT * FROM _kv_store ORDER BY session_id,key').all()});
  return {db, state, kv, apply, rows};
}

function ready(t) {
  const f = fixture(t);
  f.apply(init());
  f.apply(admin());
  return f;
}

test('WasmWriterState INIT and enrollment replay retain original outcomes after lost replies', (t) => {
  const f = fixture(t);
  assert.equal(f.state.classify(write()).reason, R.UNINITIALIZED);
  const initialized = f.apply(init());
  assert.equal(f.state.allSlots.all().length, 64);
  const before = f.rows();
  assert.deepEqual(f.apply(init()), initialized);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.apply({...init(), nonce: 'd'.repeat(64)}).reason, R.CONFLICT);
  const enrolled = f.apply(admin());
  f.apply(write());
  const afterWrite = f.rows();
  assert.deepEqual(f.apply(admin()), enrolled);
  assert.deepEqual(f.rows(), afterWrite);
});

test('WasmWriterState orders competing admin intents and retains all 64 fixed slots', (t) => {
  const f = fixture(t);
  f.apply(init());
  for (let slot = 0; slot < 64; slot += 1) {
    assert.equal(f.apply(admin(slot)).accepted, true);
  }
  const full = f.rows();
  assert.equal(f.apply(admin(0, {nonce: 'd'.repeat(64)})).reason, R.FENCED);
  assert.deepEqual(f.rows(), full);
  assert.throws(() => canonicalWriterCommand(admin(64)), {code: R.INVALID});
  const recycle = admin(0, {action: 'RECYCLE', expectedGeneration: 1,
    newGeneration: 2, nonce: 'e'.repeat(64)});
  assert.equal(f.apply(recycle).accepted, true);
  assert.equal(f.apply({...recycle, nonce: 'f'.repeat(64)}).reason, R.FENCED);
  assert.equal(f.state.allSlots.all().length, 64);
  assert.equal(f.state.slot(0).generation, 2);
});

test('WasmWriterState same-slot A/B/A retires detail without reexecuting A', (t) => {
  const f = ready(t);
  const a = write();
  const receipt = f.apply(a).receipt;
  const b = write({value: 'B', ack: writerDigest(receipt)}, {sequence: 2});
  assert.equal(f.apply(b).accepted, true);
  const before = f.rows();
  assert.equal(f.apply(a).reason, R.RETIRED);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.kv.get('session', 'key').toString(), 'B');
});

test('WasmWriterState different-slot A/B/A returns A receipt without overwriting B', (t) => {
  const f = ready(t);
  f.apply(admin(1));
  const a = write();
  const first = f.apply(a);
  f.apply(write({value: 'B'}, {slot: 1}));
  const before = f.rows();
  assert.deepEqual(f.apply(a), first);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.kv.get('session', 'key').toString(), 'B');
});

test('WasmWriterState refuses conflicts, gaps and forged acknowledgments without retirement', (t) => {
  const f = ready(t);
  const first = f.apply(write());
  const before = f.rows();
  const attempts = [
    [write({value: 'changed'}), R.CONFLICT],
    [write({}, {sequence: 3}), R.SEQUENCE],
    [write({}, {sequence: 2}), R.ACK],
    [write({ack: '0'.repeat(64)}, {sequence: 2}), R.ACK],
    [write({}, {generation: 2}), R.SEQUENCE],
  ];
  for (const [command, reason] of attempts) {
    assert.equal(f.apply(command).reason, reason);
    assert.deepEqual(f.rows(), before);
  }
  assert.deepEqual(f.apply(write()), first);
});

test('WasmWriterState write-before-recycle refuses stale expected state; reverse order fences write', (t) => {
  const f = ready(t);
  const stale = admin(0, {action: 'RECYCLE', expectedGeneration: 1, newGeneration: 2});
  const first = f.apply(write());
  assert.equal(f.apply(stale).reason, R.EXPECTED);
  const current = {...stale, expectedCompletedSequence: 1,
    expectedReceiptDigest: writerDigest(first.receipt)};
  assert.equal(f.apply(current).accepted, true);
  const before = f.rows();
  assert.equal(f.apply(write()).reason, R.FENCED);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.kv.get('session', 'key').toString(), 'A');
});

test('WasmWriterState deterministic refusal consumes sequence; transaction rollback consumes nothing', (t) => {
  const f = ready(t);
  f.kv.setLimits(1, 1); // v1 decisions use the common replicated profile, not this tuning.
  const first = f.apply(write({value: Buffer.alloc(P.valueBytes)}));
  assert.equal(first.accepted, true);
  const second = f.apply(write({key: 'second', value: Buffer.alloc(P.valueBytes),
    ack: writerDigest(first.receipt)}, {sequence: 2}));
  assert.equal(second.accepted, true);
  const thirdCommand = write({key: 'overflow', value: 'x',
    ack: writerDigest(second.receipt)}, {sequence: 3});
  const refusal = f.apply(thirdCommand);
  assert.equal(refusal.status, 'RECORDED');
  assert.equal(refusal.accepted, false);
  assert.equal(typeof refusal.receipt.outcome.error, 'string');
  assert.equal(f.state.slot(0).completed, 3);
  assert.equal(f.kv.get('session', 'overflow'), null);
  assert.deepEqual(f.apply(thirdCommand), refusal);
  const before = f.rows();
  const fourth = write({value: 'replacement', ack: writerDigest(refusal.receipt)}, {sequence: 4});
  assert.throws(() => f.apply(fourth, () => {
    throw new Error('transaction abort');
  }),
  /transaction abort/);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.apply(fourth).accepted, true);
});

test('WasmWriterState same-file restart retains generation fence and exact current receipts', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-writer-v1-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'application.sqlite');
  const db = new Database(path);
  try {
    const {state, kv} = db.transaction(() => ({
      state: new WasmWriterState(db, SERVICE), kv: new SessionKVStore(db),
    }))();
    const apply = db.transaction((cmd, index) => state.apply(cmd, kv, index, 1));
    apply(init(), 1);
    apply(admin(), 2);
    apply(admin(0, {action: 'RECYCLE', expectedGeneration: 1, newGeneration: 2}), 3);
    apply(write({}, {generation: 2}), 4);
  } finally {
    db.close();
  }
  const f = fixture(t, path);
  const before = f.rows();
  assert.equal(f.state.classify(write()).reason, R.FENCED);
  const current = f.state.classify(write({}, {generation: 2}));
  assert.equal(current.status, 'RECORDED');
  assert.equal(current.receipt.index, 4);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.kv.get('session', 'key').toString(), 'A');
});

test('WasmWriterState old application format fails closed without creating writer tables', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const kv = new SessionKVStore(db);
  kv.applySet('old', 'key', Buffer.from('retained'));
  const before = db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
  assert.throws(() => new WasmWriterState(db, SERVICE), {code: R.FORMAT});
  assert.deepEqual(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all(), before);
  assert.equal(kv.get('old', 'key').toString(), 'retained');
});

test('WasmWriter codec rejects unsafe numeric identities and positions before mutation', (t) => {
  const f = ready(t);
  const before = f.rows();
  for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1']) {
    assert.throws(() => write({}, {sequence: bad}), {code: R.INVALID});
    assert.throws(() => exactWriterPosition(bad, 1), {code: R.POSITION});
  }
  assert.throws(() => exactWriterPosition(0, 1), {code: R.POSITION});
  assert.throws(() => exactWriterPosition(1, Number.MAX_SAFE_INTEGER + 1), {code: R.POSITION});
  assert.doesNotThrow(() => exactWriterPosition(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  assert.throws(() => canonicalWriterCommand(admin(0, {
    expectedGeneration: Number.MAX_SAFE_INTEGER, newGeneration: Number.MAX_SAFE_INTEGER + 1,
  })), {code: R.INVALID});
  assert.deepEqual(f.rows(), before);
});

test('WasmWriter codec maximum escaped legal shapes fit every retained logical budget', (t) => {
  const serviceId = '\0'.repeat(128);
  const max = Number.MAX_SAFE_INTEGER;
  const identity = {serviceId, incarnation: INCARNATION, slot: 63, generation: max, sequence: max};
  const command = writerCommandFromDelivery({operation: 'write', requestId: identity,
    ack: 'f'.repeat(64), sessionId: '\0'.repeat(256), key: '\0'.repeat(256),
    value: Buffer.alloc(32768, 255)});
  const receipt = {version: 1, identity, commandDigest: writerDigest(command),
    outcome: {accepted: false, error: 'Service size limit exceeded'}, index: max, term: max};
  const f = fixture(t, ':memory:', serviceId);
  const initialization = f.apply(init(serviceId));
  const enrollment = admin(63, {serviceId});
  assert.equal(f.apply(enrollment).accepted, true);
  const maximalAdmin = canonicalWriterCommand(admin(63, {action: 'RECYCLE', serviceId,
    expectedGeneration: max - 1, newGeneration: max, expectedCompletedSequence: max,
    expectedReceiptDigest: 'f'.repeat(64)}));
  const adminReceipt = {version: 1, commandDigest: writerDigest(maximalAdmin),
    outcome: {accepted: true, token: {serviceId, incarnation: INCARNATION,
      slot: 63, generation: max}}, index: max, term: max};
  const shapes = {command, receipt, admin: {command: maximalAdmin, receipt: adminReceipt},
    metadata: {...f.state.meta(), initialization: {command: init(serviceId),
      receipt: {...initialization.receipt, index: max, term: max}}},
    bookkeeping: {slot: 63, generation: max, completed: max}};
  const budgets = {command: 49152, receipt: 2048, admin: 4096, metadata: 4096, bookkeeping: 512};
  const measured = {};
  for (const [name, shape] of Object.entries(shapes)) {
    measured[name] = Buffer.byteLength(boundedJson(shape, budgets[name]));
    assert.ok(measured[name] <= budgets[name], name);
  }
  assert.equal(P.metadataBytes + P.slots *
    (P.commandBytes + P.receiptBytes + P.adminBytes + P.bookkeepingBytes), 3575808);
  t.diagnostic(JSON.stringify({scope: 'encoded logical payload; excludes KV/log/WAL/pages/copies', measured}));
  assert.throws(() => write({value: Buffer.alloc(32769)}), {code: R.INVALID});
  assert.throws(() => canonicalWriterCommand({...command, extra: true}), {code: R.INVALID});
  assert.throws(() => canonicalWriterCommand({...command, value: 'YQ'}), {code: R.INVALID});
});
