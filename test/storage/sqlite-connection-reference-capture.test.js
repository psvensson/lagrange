// Supplied carriers may change their database value synchronously. Each whole
// operation selects A once, then keeps its transaction, writes and notifications
// on A. B is either a real raw native handle or another genuinely owned handle.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {acquireRowReservation, releaseTransactionReservations, releaseSessionReservations,
  getTransactionReservations, clearAllReservations, registerPartitionDatabase} from
  '../../src/partition/partition-locking-read-reservation.js';
import {prepareReplicaLifecycleForSnapshot, prepareReplicaLifecycleForOriginalAllocation} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {REPLICA_LIFECYCLE_TABLE, LIFECYCLE_ERROR, LIFECYCLE_REASON} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {RAFT_OPERATION_OUTCOME as CORE} from '../../src/raft/raft-operation-port-constants.js';
import {createCommittedStatementOutcomeTable, settleFailedCommittedStatement,
  readCommittedStatementOutcome} from '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE as ERROR,
  PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL as OUTCOME_SQL} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';

const TRANSACTION = 'capture-transaction';
const SESSION = 'capture-session';
const IDENTITY = Object.freeze({groupId: 'capture-group', peerId: '1',
  replicaIdentity: 'capture-replica'});
const RESERVATIONS = '_lagrange_locking_read_reservations';
const ENTRY_KEY = 'entry:capture-entry';
const CONSTRAINT_CODE = 'SQLITE_CONSTRAINT_UNIQUE';
const MISSING = 'sqlite_statement_owner_missing';
const STORE_GROUP = 'capture-store-group';
const STORE_CONF = Object.freeze({voters: ['1'], learners: [], votersOutgoing: [],
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
  store.putHardState(STORE_GROUP, {term: '2', vote: '1', commit: commitIndex});
  store.putAppliedState(STORE_GROUP, appliedIndex, STORE_CONF);
  store.putSnapshot(STORE_GROUP, {metadata: {
    index: snapshotIndex, term: '2', confState: STORE_CONF,
  }});
  return store;
}

// These are actual constructed stores and native connections. Retargeting is
// attempted on the public carrier; no borrowed prototype or fake store bypasses
// construction. The witness covers SQLite custody, not a native Raft journey.
function storePair(t) {
  const effects = [];
  const a = new SQLiteConnection(':memory:');
  const b = new SQLiteConnection(':memory:', {verbose: (sql) => effects.push({sql})});
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
  test(`RaftRsDurableStore refuses ${retarget} retargeting before snapshot, progress and transaction effects`,
    (t) => {
      const f = storePair(t);
      let carrierReads = 0;
      const accepted = retarget === 'assignment' ? Reflect.set(f.store, 'db', f.b) :
        Reflect.defineProperty(f.store, 'db', {configurable: true, get() {
          return ++carrierReads === 1 ? f.a : f.b;
        }});
      const snapshot = observed(() => f.store.readSnapshotIndex(STORE_GROUP));
      const progress = observed(() => f.store.readDurableProgress(STORE_GROUP));
      const write = observed(() => f.store.transaction(() =>
        f.store.putCommitIndex(STORE_GROUP, '44')));
      const bEffects = [...f.effects];
      f.restore();
      const aRecord = RaftRsDurableStore.readDurableRecordIn(f.a, STORE_GROUP);
      const bRecord = RaftRsDurableStore.readDurableRecordIn(f.b, STORE_GROUP);
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

test('RaftRsDurableStore cannot turn a present A snapshot into absence through a closed raw replacement',
  (t) => {
    const a = new SQLiteConnection(':memory:');
    const store = populatedStore(a, '41', '42', '43');
    const raw = new Database(':memory:');
    raw.close();
    const effects = [];
    const replacement = new Proxy(raw, {get(target, key) {
      effects.push(String(key));
      return Reflect.get(target, key, target);
    }});
    let reads = 0;
    t.after(() => a.close());
    const accepted = Reflect.defineProperty(store, 'db', {configurable: true, get() {
      return ++reads === 1 ? a : replacement;
    }});
    const answer = observed(() => store.readSnapshotIndex(STORE_GROUP));
    t.diagnostic(JSON.stringify({accepted, reads, effects, value: String(answer.value),
      error: answer.error?.message}));
    assert.equal(accepted, false);
    assert.equal(answer.error, undefined);
    assert.equal(answer.value, 41n, 'closed foreign state cannot manufacture successful absence');
    assert.equal(reads, 0);
    assert.deepEqual(effects, []);
  });

test('RaftRsDurableStore keeps rollback and later useful progress on A after a reentrant retarget attempt',
  (t) => {
    const f = storePair(t);
    const failure = new Error('finite transaction failure');
    let accepted;
    const rejected = observed(() => f.store.transaction(() => {
      accepted = Reflect.set(f.store, 'db', f.b);
      f.store.putCommitIndex(STORE_GROUP, '44');
      throw failure;
    }));
    const aCommitAfterRollback =
      RaftRsDurableStore.readDurableRecordIn(f.a, STORE_GROUP).hardState.commit;
    const healed = observed(() => f.store.transaction(() =>
      f.store.putCommitIndex(STORE_GROUP, '45')));
    const bEffects = [...f.effects];
    f.restore();
    const aRecord = RaftRsDurableStore.readDurableRecordIn(f.a, STORE_GROUP);
    const bRecord = RaftRsDurableStore.readDurableRecordIn(f.b, STORE_GROUP);
    t.diagnostic(JSON.stringify({accepted, aCommitAfterRollback,
      aCommit: aRecord.hardState.commit,
      bCommit: bRecord.hardState.commit, bEffects}));
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

for (const closed of [false, true]) {
  test(`RaftRsDurableStore refuses ${closed ? 'closed' : 'open'} raw input before foreign inspection`,
    (t) => {
      const raw = new Database(':memory:');
      if (closed) raw.close();
      t.after(() => { if (raw.open) raw.close(); });
      const effects = [];
      const supplied = new Proxy(raw, {get(target, key) {
        effects.push(String(key));
        return Reflect.get(target, key, target);
      }});
      const answer = observed(() => new RaftRsDurableStore(supplied));
      assert.equal(answer.error?.code, MISSING);
      assert.equal(answer.error?.constructor, Error);
      assert.deepEqual(effects, [], 'brand refusal precedes open state, SQL and absence shortcuts');
    });
}

test('RaftRsDurableStore stable constructor ownership preserves useful snapshot and progress operations',
  (t) => {
    const f = storePair(t);
    assert.equal(f.store.readSnapshotIndex(STORE_GROUP), 41n);
    assert.deepEqual(f.store.readDurableProgress(STORE_GROUP),
      {commitIndex: '43', appliedIndex: '42'});
    f.store.transaction(() => f.store.putCommitIndex(STORE_GROUP, '44'));
    assert.deepEqual(f.store.readDurableProgress(STORE_GROUP),
      {commitIndex: '44', appliedIndex: '42'});
    assert.deepEqual(f.effects, []);
  });

function carrier(a, b, stable = false, ownedReads = 1) {
  let reads = 0;
  return {get db() {
    reads++;
    return reads <= ownedReads || stable ? a : b;
  }, reads: () => reads};
}

// Preserve the exact native object/private brand. These probes only record B
// being touched; they are removed before state inspection and native close.
function monitor(db, effects) {
  const descriptors = new Map();
  for (const key of ['prepare', 'exec', 'transaction', 'pragma']) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(db, key));
    const value = db[key];
    Object.defineProperty(db, key, {configurable: true, get() {
      effects.push({get: key});
      return typeof value === 'function' ? value.bind(db) : value;
    }});
  }
  return () => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(db, key, descriptor);
      else delete db[key];
    }
  };
}

function pair(t, replacement, setup = () => {}, ownedReads = 1) {
  const sql = [];
  const a = new SQLiteConnection(':memory:', {verbose: (text) => sql.push(text)});
  setup(a);
  const effects = [];
  const Constructor = replacement === 'foreign' ? Database : SQLiteConnection;
  const b = new Constructor(a.serialize(), {verbose: (text) => effects.push({sql: text})});
  const restore = monitor(b, effects);
  const foreign = new Proxy(b, {get(target, key) {
    effects.push({get: String(key)});
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const selected = carrier(a, replacement === 'foreign' ? foreign : b,
    replacement === 'stable', ownedReads);
  t.after(() => {
    restore();
    clearAllReservations();
    a.close();
    b.close();
  });
  sql.length = 0;
  return {a, b, sql, effects, selected, restore};
}

function assertCaptured(f, result) {
  console.log(JSON.stringify({reads: f.selected.reads(), bEffects: f.effects,
    aSql: f.sql, error: result.error?.message, value: result.value}));
  assert.equal(f.selected.reads(), 1, 'carrier selects exactly one native handle');
  assert.deepEqual(f.effects, [], 'B has no properties, SQL or transaction effects');
}

function reserve(db) {
  const result = acquireRowReservation({db, partitionId: 'capture-partition', tableName: 'facts',
    pkValues: [1], transactionId: TRANSACTION, sessionId: SESSION});
  assert.equal(result.success, true);
  assert.equal(getTransactionReservations(TRANSACTION).length, 1);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM ${RESERVATIONS}`).get().n, 1);
}

const releases = [
  ['transaction', (options) => releaseTransactionReservations(TRANSACTION, options)],
  ['session', (options) => releaseSessionReservations(SESSION, options)],
];
for (const [name, release] of releases) {
  for (const replacement of ['foreign', 'owned', 'stable']) {
    test(`${name} release keeps durable and memory reservations on selected A: ${replacement} B`,
      (t) => {
        // The rejected guard read the carrier three times. Retarget after
        // admission to expose the later use after memory was released.
        const f = pair(t, replacement, reserve, 3);
        const result = observed(() => release(f.selected));
        assertCaptured(f, result);
        assert.equal(result.value, 1);
        assert.equal(getTransactionReservations(TRANSACTION).length, 0);
        assert.equal(f.a.prepare(`SELECT count(*) AS n FROM ${RESERVATIONS}`).get().n, 0);
        f.restore();
        assert.equal(f.b.prepare(`SELECT count(*) AS n FROM ${RESERVATIONS}`).get().n, 1,
          'unregistered B keeps its durable reservation even when B is owned');
      });
  }
  test(`${name} release rejects raw explicit database before changing nonempty memory`, (t) => {
    const f = pair(t, 'foreign', reserve);
    const result = observed(() => release({db: f.b}));
    console.log(JSON.stringify({error: result.error?.code, effects: f.effects}));
    assert.equal(result.error?.code, MISSING);
    assert.deepEqual(f.effects, []);
    assert.equal(getTransactionReservations(TRANSACTION).length, 1);
    assert.equal(f.a.prepare(`SELECT count(*) AS n FROM ${RESERVATIONS}`).get().n, 1);
  });
  test(`${name} release without explicit DB keeps existing registered-store behavior`, (t) => {
    const f = pair(t, 'owned', reserve);
    f.restore();
    registerPartitionDatabase('second-registered-partition', f.b);
    assert.equal(release(), 1);
    assert.equal(getTransactionReservations(TRANSACTION).length, 0);
    for (const db of [f.a, f.b]) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${RESERVATIONS}`).get().n, 0);
    }
  });
}

for (const replacement of ['foreign', 'owned', 'stable']) {
  test(`snapshot lifecycle commits A opening history in A transaction: ${replacement} B`, (t) => {
    const f = pair(t, replacement);
    const request = Object.assign(f.selected, IDENTITY);
    const result = observed(() => prepareReplicaLifecycleForSnapshot(request));
    assertCaptured(f, result);
    assert.equal(result.value?.outcome, CORE.CORE_OK);
    assert.equal(result.value.reason, LIFECYCLE_REASON.STAGING_PREPARED);
    assert.ok(f.sql.includes('BEGIN'));
    assert.ok(f.sql.includes('COMMIT'));
    const row = f.a.prepare(`SELECT incarnation, native_history_state
      FROM ${REPLICA_LIFECYCLE_TABLE}`).get();
    assert.equal(row.incarnation, result.value.detail.incarnation);
    assert.equal(row.native_history_state, HISTORY.ESTABLISHED);
    f.restore();
    assert.deepEqual(f.b.prepare('SELECT name FROM sqlite_master').all(), []);
    assert.equal(f.a.inTransaction, false);
    assert.equal(f.b.inTransaction, false);
  });

  test(`original lifecycle prepares A inside A transaction: ${replacement} B`, (t) => {
    const f = pair(t, replacement);
    const request = Object.assign(f.selected, IDENTITY);
    const result = observed(() => f.a.transaction(() =>
      prepareReplicaLifecycleForOriginalAllocation(request))());
    assertCaptured(f, result);
    assert.equal(result.value?.outcome, CORE.CORE_OK);
    assert.equal(result.value.reason, LIFECYCLE_REASON.ORIGINAL_PREPARED);
    const row = f.a.prepare(`SELECT incarnation, native_history_state
      FROM ${REPLICA_LIFECYCLE_TABLE}`).get();
    assert.equal(row.incarnation, result.value.detail.incarnation);
    assert.equal(row.native_history_state, HISTORY.NEVER_OPENED);
    f.restore();
    assert.deepEqual(f.b.prepare('SELECT name FROM sqlite_master').all(), []);
  });

  test(`original lifecycle retains A transaction-required refusal: ${replacement} B`, (t) => {
    const f = pair(t, replacement);
    const result = observed(() =>
      prepareReplicaLifecycleForOriginalAllocation(Object.assign(f.selected, IDENTITY)));
    assertCaptured(f, result);
    assert.equal(result.error?.message, LIFECYCLE_ERROR.TRANSACTION_REQUIRED);
    assert.deepEqual(f.sql, []);
  });
}

function settlementService(selected, notifications) {
  // Notifications use the actual supplied service object, not a fabricated
  // replacement carrying a different database field.
  return Object.assign(selected, {partitionId: 'capture-partition',
    logger: {error() {}},
    resolveCommittedWrite(entryId, answer) {
      notifications.push({service: this, kind: 'commit', entryId, answer});
    },
    rejectCommittedWrite(entryId, error) {
      notifications.push({service: this, kind: 'rollback', entryId, error});
    }});
}

function settlementRequest(error, commits, rollbacks) {
  return {error, command: {entryId: 'capture-entry', sql: 'INSERT INTO facts VALUES (1)',
    params: []}, entryKey: ENTRY_KEY, index: 1, term: 1,
  identity: {partitionId: 'capture-partition', logIndex: 1},
  afterCommit: (callback) => commits.push(callback),
  afterRollback: (callback) => rollbacks.push(callback)};
}

for (const replacement of ['foreign', 'owned', 'stable']) {
  test(`environmental settlement keeps A classification and rollback-only cause: ${replacement} B`,
    (t) => {
      const f = pair(t, replacement, createCommittedStatementOutcomeTable);
      const notifications = [];
      const commits = [];
      const rollbacks = [];
      const service = settlementService(f.selected, notifications);
      const cause = new Error('environmental storage failure');
      const result = observed(() => f.a.transaction(() =>
        settleFailedCommittedStatement(service, settlementRequest(cause, commits, rollbacks)))());
      assertCaptured(f, result);
      assert.equal(result.error?.code, ERROR.STATEMENT_ENVIRONMENT_FAILED);
      assert.equal(result.error.cause, cause);
      assert.equal(commits.length, 0);
      assert.equal(rollbacks.length, 1);
      assert.deepEqual(notifications, []);
      assert.ok(f.sql.includes('ROLLBACK'));
      rollbacks[0]();
      assert.equal(notifications[0].service, service);
      assert.equal(notifications[0].error, result.error);
      assert.equal(readCommittedStatementOutcome({db: f.a}, ENTRY_KEY).state, RECORD.UNSETTLED);
      f.restore();
      assert.equal(f.b.prepare(OUTCOME_SQL.SELECT_BY_ENTRY_KEY).get(ENTRY_KEY), undefined);
      assert.equal(f.selected.reads(), 1);
    });

  test(`native deterministic failure persists in A and notifies after commit: ${replacement} B`,
    (t) => {
      const f = pair(t, replacement, (db) => {
        createCommittedStatementOutcomeTable(db);
        db.exec('CREATE TABLE facts (id INTEGER UNIQUE); INSERT INTO facts VALUES (1)');
      });
      const notifications = [];
      const commits = [];
      const rollbacks = [];
      const service = settlementService(f.selected, notifications);
      let cause;
      const result = observed(() => f.a.transaction(() => {
        try {
          f.a.prepare('INSERT INTO facts VALUES (1)').run();
        } catch (error) {
          cause = error;
        }
        assert.equal(cause?.code, CONSTRAINT_CODE, 'actual native constraint must engage');
        return settleFailedCommittedStatement(service,
          settlementRequest(cause, commits, rollbacks));
      })());
      assertCaptured(f, result);
      assert.equal(result.value, OUTCOME.STATEMENT_FAILED);
      assert.equal(commits.length, 1);
      assert.equal(rollbacks.length, 0);
      assert.deepEqual(notifications, []);
      const record = readCommittedStatementOutcome({db: f.a}, ENTRY_KEY);
      assert.equal(record.state, RECORD.SETTLED);
      assert.equal(record.outcome, OUTCOME.STATEMENT_FAILED);
      assert.equal(record.failureCode, cause.code);
      assert.equal(record.failureMessage, cause.message);
      assert.equal(record.logIndex, 1);
      assert.equal(record.term, 1);
      f.restore();
      assert.equal(f.b.prepare(OUTCOME_SQL.SELECT_BY_ENTRY_KEY).get(ENTRY_KEY), undefined);
      assert.ok(f.sql.includes('COMMIT'));
      commits[0]();
      assert.equal(notifications[0].service, service);
      assert.equal(notifications[0].answer.failureCode, cause.code);
      assert.equal(notifications[0].answer.committed, true);
      assert.equal(f.selected.reads(), 1);
    });
}
