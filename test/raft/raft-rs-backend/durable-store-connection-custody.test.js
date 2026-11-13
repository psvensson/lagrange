// A constructed store keeps the native database selected by its constructor.
// These controls exercise real SQLite reads, writes and rollback; they do not
// claim native Raft restart or constructor-input branding coverage.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';

const GROUP_ID = 'connection-custody-group';
const CONF_STATE = Object.freeze({voters: ['1'], learners: [], votersOutgoing: [],
  learnersNext: [], autoLeave: false});

function observed(work) {
  try {
    return {value: work()};
  } catch (error) {
    return {error};
  }
}

function populatedStore(db, snapshotIndex, appliedIndex, commitIndex) {
  const store = new RaftRsDurableStore(db);
  store.putHardState(GROUP_ID, {term: '2', vote: '1', commit: commitIndex});
  store.putAppliedState(GROUP_ID, appliedIndex, CONF_STATE);
  store.putSnapshot(GROUP_ID, {metadata: {
    index: snapshotIndex, term: '2', confState: CONF_STATE,
  }});
  return store;
}

// Instrument the actual native object, then restore it before independent
// record inspection and cleanup. No substitute database implements SQL here.
function monitor(db, effects) {
  const descriptors = new Map();
  for (const key of ['prepare', 'exec', 'transaction', 'pragma']) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(db, key));
    const method = db[key].bind(db);
    Object.defineProperty(db, key, {configurable: true, get() {
      effects.push({get: key});
      return method;
    }});
  }
  return () => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(db, key, descriptor);
      else delete db[key];
    }
  };
}

function storePair(t) {
  const effects = [];
  const a = new Database(':memory:');
  const b = new Database(':memory:', {verbose: (sql) => effects.push({sql})});
  const store = populatedStore(a, '41', '42', '43');
  populatedStore(b, '91', '92', '93');
  const restore = monitor(b, effects);
  effects.length = 0;
  t.after(() => {
    restore();
    if (a.open) a.close();
    if (b.open) b.close();
  });
  return {a, b, store, effects, restore};
}

for (const retarget of ['assignment', 'accessor']) {
  test(`constructed store refuses ${retarget} retargeting before snapshot, progress and transaction effects`,
    (t) => {
      const f = storePair(t);
      let carrierReads = 0;
      const accepted = retarget === 'assignment' ? Reflect.set(f.store, 'db', f.b) :
        Reflect.defineProperty(f.store, 'db', {configurable: true, get() {
          return ++carrierReads === 1 ? f.a : f.b;
        }});
      const snapshot = observed(() => f.store.readSnapshotIndex(GROUP_ID));
      const progress = observed(() => f.store.readDurableProgress(GROUP_ID));
      const write = observed(() => f.store.transaction(() =>
        f.store.putCommitIndex(GROUP_ID, '44')));
      const bEffects = [...f.effects];
      f.restore();
      const aRecord = RaftRsDurableStore.readDurableRecordIn(f.a, GROUP_ID);
      const bRecord = RaftRsDurableStore.readDurableRecordIn(f.b, GROUP_ID);
      t.diagnostic(JSON.stringify({accepted, carrierReads,
        snapshot: String(snapshot.value), progress: progress.value,
        aCommit: aRecord.hardState.commit, bCommit: bRecord.hardState.commit, bEffects}));
      assert.equal(accepted, false, 'constructed store custody cannot be reassigned or redefined');
      assert.equal(carrierReads, 0, 'a rejected accessor never becomes the store carrier');
      assert.equal(snapshot.error, undefined);
      assert.equal(snapshot.value, 41n, 'snapshot observation belongs to constructor-selected A');
      assert.equal(progress.error, undefined);
      assert.deepEqual(progress.value, {commitIndex: '43', appliedIndex: '42'});
      assert.equal(write.error, undefined);
      assert.equal(aRecord.hardState.commit, '44', 'the real transaction writes A');
      assert.equal(bRecord.hardState.commit, '93', 'B keeps its independent durable prefix');
      assert.deepEqual(bEffects, [], 'B has no foreign property or SQL effects');
    });
}

test('a closed replacement cannot turn the constructed store\'s present snapshot into absence', (t) => {
  const a = new Database(':memory:');
  const store = populatedStore(a, '41', '42', '43');
  const b = new Database(':memory:');
  b.close();
  const effects = [];
  const replacement = new Proxy(b, {get(target, key) {
    effects.push(String(key));
    return Reflect.get(target, key, target);
  }});
  t.after(() => a.close());
  // Snapshot already selects its argument once. Retarget before that selection
  // to exercise constructor custody, without alleging a repeated snapshot read.
  const accepted = Reflect.set(store, 'db', replacement);
  const answer = observed(() => store.readSnapshotIndex(GROUP_ID));
  const write = observed(() => store.transaction(() => store.putCommitIndex(GROUP_ID, '44')));
  const progress = observed(() => store.readDurableProgress(GROUP_ID));
  const aRecord = RaftRsDurableStore.readDurableRecordIn(a, GROUP_ID);
  t.diagnostic(JSON.stringify({accepted, effects, value: String(answer.value),
    error: answer.error?.message, writeError: write.error?.message,
    progress: progress.value, aCommit: aRecord.hardState.commit}));
  assert.equal(accepted, false);
  assert.equal(answer.error, undefined);
  assert.equal(answer.value, 41n, 'closed foreign state cannot manufacture successful absence');
  assert.equal(write.error, undefined, 'the original store remains useful after refusal');
  assert.equal(progress.error, undefined);
  assert.deepEqual(progress.value, {commitIndex: '44', appliedIndex: '42'});
  assert.equal(aRecord.hardState.commit, '44');
  assert.deepEqual(effects, [], 'the closed replacement is never consulted');
});

test('reentrant retargeting cannot move rollback or later useful progress off the original database',
  (t) => {
    const f = storePair(t);
    const failure = new Error('finite transaction failure');
    let accepted;
    const rejected = observed(() => f.store.transaction(() => {
      accepted = Reflect.set(f.store, 'db', f.b);
      f.store.putCommitIndex(GROUP_ID, '44');
      throw failure;
    }));
    const aCommitAfterRollback =
      RaftRsDurableStore.readDurableRecordIn(f.a, GROUP_ID).hardState.commit;
    const healed = observed(() => f.store.transaction(() =>
      f.store.putCommitIndex(GROUP_ID, '45')));
    const bEffects = [...f.effects];
    f.restore();
    const aRecord = RaftRsDurableStore.readDurableRecordIn(f.a, GROUP_ID);
    const bRecord = RaftRsDurableStore.readDurableRecordIn(f.b, GROUP_ID);
    t.diagnostic(JSON.stringify({accepted, aCommitAfterRollback,
      aCommit: aRecord.hardState.commit, bCommit: bRecord.hardState.commit, bEffects}));
    assert.equal(accepted, false);
    assert.equal(rejected.error, failure, 'the original transaction failure is retained');
    assert.equal(aCommitAfterRollback, '43', 'A rolled back its uncommitted change');
    assert.equal(healed.error, undefined, 'the same store progresses after the finite failure');
    assert.equal(aRecord.hardState.commit, '45');
    assert.equal(bRecord.hardState.commit, '93', 'no write escaped A into another connection');
    assert.deepEqual(bEffects, []);
    assert.equal(f.a.inTransaction, false);
    assert.equal(f.b.inTransaction, false);
  });

test('stable constructor custody preserves useful snapshot and progress operations', (t) => {
  const f = storePair(t);
  assert.equal(f.store.readSnapshotIndex(GROUP_ID), 41n);
  assert.deepEqual(f.store.readDurableProgress(GROUP_ID),
    {commitIndex: '43', appliedIndex: '42'});
  f.store.transaction(() => f.store.putCommitIndex(GROUP_ID, '44'));
  assert.deepEqual(f.store.readDurableProgress(GROUP_ID),
    {commitIndex: '44', appliedIndex: '42'});
  assert.deepEqual(f.effects, []);
});
