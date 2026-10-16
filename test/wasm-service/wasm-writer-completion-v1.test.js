// COMPONENT boundary: real replica/application/SQLite owners; consensus entry
// delivery is controlled here and is NOT a native RF3 or quorum witness.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {WasmServiceReplica} from '../../src/wasm-service/wasm-service-replica.js';
import {WasmWriterState} from '../../src/wasm-service/wasm-writer-state.js';
import {SessionKVStore} from '../../src/wasm-service/session-kv-store.js';
import {writerDigest} from '../../src/wasm-service/wasm-writer-codec.js';
import {WRITER_REASON as R} from '../../src/wasm-service/wasm-writer-profile.js';
import {WASM_SERVICE_REPLICA_STATE as STATE, WRITE_CONSISTENCY_MODE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {applyCommittedEntryTransaction} from
  '../../src/raft/raft-rs-application-transaction-owner.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const SERVICE = 'writer-completion-component';
const INCARNATION = '11'.repeat(32);
const PREFIX = {type: 'WASM_WRITER_V1', profile: 'wasm-writer-v1/1'};
const CONF = {voters: ['1'], learners: [], votersOutgoing: [], learnersNext: [], autoLeave: false};

function admin(slot, action = 'ENROLL', expectedGeneration = 0) {
  return {...PREFIX, action, serviceId: SERVICE, incarnation: INCARNATION,
    slot, expectedGeneration, expectedCompletedSequence: 0,
    expectedReceiptDigest: null, newGeneration: expectedGeneration + 1,
    nonce: (slot + 2).toString(16).padStart(64, '0')};
}

function write(slot = 0, changes = {}) {
  return {...PREFIX, action: 'WRITE', identity: {serviceId: SERVICE,
    incarnation: INCARNATION, slot, generation: 1, sequence: 1}, ack: null,
  sessionId: 'session', key: `key-${slot}`, value: Buffer.from('value').toString('base64'),
  valueEncoding: 'base64', ...changes};
}

function openComponent(path) {
  const clock = new VirtualTimeSource({startMs: 1000});
  const replica = new WasmServiceReplica({replicaId: 'writer-1', nodeId: 'writer-node',
    replicaIds: ['writer-1'], serviceDefinitionId: SERVICE, dbPath: path,
    systemTableCache: {}, timeSource: clock});
  const db = new Database(path);
  replica.db = db;
  replica.writerState = new WasmWriterState(db, SERVICE);
  replica.kvStore = new SessionKVStore(db);
  const store = new RaftRsDurableStore(db);
  replica.lifecycleState = STATE.READY;
  replica.isLeader = true;
  let index = Number(store.readDurableRecord(SERVICE).appliedIndex);
  const proposed = [];
  // The only controlled authority boundary: no claim that these callbacks
  // constitute Raft acceptance, persistence, commitment or scheduler service.
  replica.proposeEntry = (command) => {
    proposed.push(command);
    return {outcome: 'CORE_OK'};
  };
  function apply(command) {
    index += 1;
    return applyCommittedEntryTransaction({store, groupId: SERVICE,
      entry: {entryType: RAFT_RS_ENTRY_TYPE.NORMAL, index: String(index), term: '1',
        data: Buffer.from(JSON.stringify(command)).toString('base64')}, confState: CONF,
      applyCommittedEntry: (bytes, position) => replica.applyCommittedEntry({
        command: JSON.parse(bytes), ...position,
        index: Number(position.index), term: Number(position.term)}),
    });
  }
  return {replica, db, store, clock, proposed, apply, path,
    completion: replica.writerCompletion};
}

function component(t, slots = 1) {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) config.initialize({node: {id: 'writer-node'}, logging: {level: 'fatal'}});
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'fatal'});
  const dir = mkdtempSync(join(tmpdir(), 'wasm-writer-component-'));
  const f = openComponent(join(dir, 'application.db'));
  f.owned = [f];
  t.after(async () => {
    const results = await Promise.allSettled(f.owned.map((item) => item.replica.shutdown()));
    const failures = results.filter((item) => item.status === 'rejected').map((item) => item.reason);
    if (failures.length) throw new AggregateError(failures, 'component cleanup failed');
    rmSync(dir, {recursive: true, force: true});
  });
  f.apply({...PREFIX, action: 'INIT', serviceId: SERVICE,
    incarnation: INCARNATION, nonce: '00'.repeat(32)});
  for (let slot = 0; slot < slots; slot += 1) f.apply(admin(slot));
  return f;
}

function snapshot(f) {
  return {slots: f.db.prepare('SELECT * FROM _wasm_writer_slots ORDER BY slot').all(),
    kv: f.db.prepare('SELECT * FROM _kv_store ORDER BY session_id,key').all(),
    applied: f.store.readDurableRecord(SERVICE).appliedIndex};
}

function emptyInterest(f) {
  assert.equal(f.completion.pending.size, 0);
  assert.equal(f.completion.waiterCount, 0);
  assert.equal(f.clock.pendingTimerCount(), 0);
}

function recorded(result, accepted = true) {
  assert.equal(result.status, 'RECORDED');
  assert.equal(result.accepted, accepted);
  assert.equal(result.receipt.outcome.accepted, accepted);
}

test('component registers interest before synchronous application and proposal return', async (t) => {
  const f = component(t);
  const command = write();
  f.replica.proposeEntry = (input) => {
    assert.equal(f.completion.pending.size, 1);
    assert.equal(f.completion.waiterCount, 1);
    f.apply(input);
    return {outcome: 'CORE_OK'};
  };
  const result = await f.completion.submit(command);
  recorded(result);
  assert.equal(result.receipt.index, 3);
  assert.equal(f.store.readDurableRecord(SERVICE).appliedIndex, '3');
  assert.equal(f.replica.kvStore.get('session', 'key-0').toString(), 'value');
  emptyInterest(f);
});

test('component SQLite rollback publishes UNKNOWN and preserves KV, sequence, result and applied', async (t) => {
  const f = component(t);
  const command = write();
  const before = snapshot(f);
  const pending = f.completion.submit(command);
  f.db.exec('CREATE TRIGGER fail_writer_progress BEFORE INSERT ON _raft_rs_applied_state ' +
    'BEGIN SELECT RAISE(ABORT, \'writer progress failed\'); END');
  assert.throws(() => f.apply(command), /writer progress failed/u);
  assert.deepEqual(await pending, {status: 'UNKNOWN', reason: R.ROLLBACK, identity: command.identity});
  assert.deepEqual(snapshot(f), before);
  emptyInterest(f);
  f.db.exec('DROP TRIGGER fail_writer_progress');
  f.apply(command);
  const replay = await f.completion.submit(command);
  recorded(replay);
  assert.equal(f.proposed.length, 1, 'durable retry does not propose again');
});

test('component deterministic quota refusal records and replays its exact application outcome', async (t) => {
  const f = component(t);
  let ack = null;
  for (let sequence = 1; sequence <= 2; sequence += 1) {
    const command = write(0, {identity: {...write().identity, sequence}, ack,
      key: `large-${sequence}`, value: Buffer.alloc(32768, sequence).toString('base64')});
    f.apply(command);
    ack = writerDigest(f.replica.writerState.classify(command).receipt);
  }
  const command = write(0, {identity: {...write().identity, sequence: 3}, ack});
  const pending = f.completion.submit(command);
  f.apply(command);
  const result = await pending;
  recorded(result, false);
  assert.equal(typeof result.receipt.outcome.error, 'string');
  assert.equal(f.replica.kvStore.get('session', command.key), null);
  assert.equal(f.replica.writerState.slot(0).completed, 3);
  assert.deepEqual(await f.completion.submit(command), result);
  assert.equal(f.proposed.length, 1);
  emptyInterest(f);
});

test('component application-time recycle and content conflict wake only the exact pending interest', async (t) => {
  for (const cause of ['recycle', 'conflict']) {
    const f = component(t);
    const command = write();
    const pending = f.completion.submit(command);
    if (cause === 'recycle') f.apply(admin(0, 'RECYCLE', 1));
    else f.apply(write(0, {value: Buffer.from('winner').toString('base64')}));
    assert.equal(f.completion.waiterCount, 1, 'another command cannot answer this exact waiter');
    const before = snapshot(f);
    f.apply(command);
    const result = await pending;
    assert.deepEqual(result, {status: 'REFUSED',
      reason: cause === 'recycle' ? R.FENCED : R.CONFLICT, identity: command.identity});
    assert.deepEqual(snapshot(f).slots, before.slots);
    assert.deepEqual(snapshot(f).kv, before.kv);
    emptyInterest(f);
  }
});

test('component role loss, timeout and shutdown remove only local interest; late application remains replayable', async (t) => {
  for (const cause of ['role', 'timeout', 'shutdown']) {
    const f = component(t);
    const command = write();
    const pending = f.completion.submit(command, 100);
    if (cause === 'role') {
      f.replica.isLeader = false; // Controlled lifecycle observation, not a native election.
      f.replica.onBecameFollower();
    }
    if (cause === 'timeout') f.clock.advance(100);
    if (cause === 'shutdown') await f.replica.shutdown();
    const reason = {role: R.NOT_LEADER, timeout: R.DEADLINE, shutdown: R.SHUTDOWN}[cause];
    assert.deepEqual(await pending, {status: 'UNKNOWN', reason, identity: command.identity});
    emptyInterest(f);
    const successor = cause === 'shutdown' ? openComponent(f.path) : f;
    if (successor !== f) f.owned.push(successor);
    successor.apply(command);
    successor.replica.isLeader = true; // Controlled retry ingress after application.
    const before = snapshot(successor);
    const replay = await successor.completion.submit(command);
    recorded(replay);
    assert.deepEqual(snapshot(successor), before);
    emptyInterest(successor);
  }
});

test('component bounded interest: 64 intents, four joined callers, 128 aggregate waiters', async (t) => {
  const f = component(t, 64);
  const first = Array.from({length: 64}, (_, slot) => f.completion.submit(write(slot)));
  assert.equal(f.completion.pending.size, 64);
  assert.equal((await f.completion.submit(admin(0, 'RECYCLE', 1))).reason, R.FULL);
  const second = Array.from({length: 64}, (_, slot) => f.completion.submit(write(slot)));
  assert.equal(f.completion.waiterCount, 128);
  assert.equal((await f.completion.submit(write())).reason, R.FULL);
  assert.equal(f.proposed.length, 64, 'pending duplicates join one proposal');
  f.clock.advance(5000);
  assert.ok((await Promise.all([...first, ...second])).every((r) => r.reason === R.DEADLINE));
  emptyInterest(f);
  const duplicates = Array.from({length: 4}, () => f.completion.submit(write()));
  assert.equal((await f.completion.submit(write())).reason, R.FULL);
  assert.equal(f.completion.waiterCount, 4);
  f.apply(write());
  const results = await Promise.all(duplicates);
  for (const result of results) assert.deepEqual(result, results[0]);
  recorded(results[0]);
  emptyInterest(f);
});

test('component ASYNC delivery retains acceptance-only shared-helper semantics', async (t) => {
  const f = component(t);
  f.replica.writeConsistency = WRITE_CONSISTENCY_MODE.ASYNC;
  const unresolved = Promise.withResolvers();
  f.replica.proposeEntry = (command) => {
    f.proposed.push(command);
    return unresolved.promise;
  };
  const before = snapshot(f);
  assert.deepEqual(await f.replica._handleWrite({sessionId: 'session', key: 'async', value: 'value'}),
    {accepted: true, async: true});
  assert.equal(f.proposed.length, 1);
  assert.deepEqual(snapshot(f), before);
  emptyInterest(f);
  unresolved.resolve({outcome: 'CORE_OK'});
});
