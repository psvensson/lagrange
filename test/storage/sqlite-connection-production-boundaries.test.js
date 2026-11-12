import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SQLiteConnection, assertSQLiteConnection} from
  '../../src/storage/sqlite-prepared-statement-owner.js';
import {openRaftRsReplicaDatabase} from '../../src/raft/raft-rs-operation-port.js';
import {LIFECYCLE_BIRTH, REPLICA_LIFECYCLE_TABLE} from '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RaftRsDurableStore, commitDurably} from '../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry, readRaftRsPeerIdentityReservations} from
  '../../src/raft/raft-rs-peer-identity.js';
import {readSnapshotIndexIn, readCompactedMaxHlcIn} from '../../src/raft/raft-rs-snapshot-witness.js';
import {ensureCdcObligationLedger, readCdcObligationCensusIn} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {createCommittedStatementOutcomeTable, readCommittedStatementCensusIn,
  settleFailedCommittedStatement} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {openParticipantTransactionStore, participantStoreConnectionStateOf,
  readPartitionWriteOriginHistory, readPartitionWriteOriginIn,
  readParticipantTransactionCensusIn} from
  '../../src/partition/partition-participant-transaction-store.js';
import {acquireRowReservation, registerPartitionDatabase, releaseTransactionReservations,
  releaseSessionReservations, sweepExpiredReservations} from
  '../../src/partition/partition-locking-read-reservation.js';
import {birthReplicaLifecycle, prepareReplicaLifecycleForOriginalAllocation,
  prepareReplicaLifecycleForSnapshot, readOriginalAllocationDeclaration,
  markOriginalAllocationIssued, prepareOriginalAllocationRow, readOriginalAllocationRow,
  transitionOriginalRight} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {ORIGINAL_ALLOCATION, ORIGINAL_ALLOCATION_COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {readTransactionSchemaEnforcement, installTransactionSchemaEnforcement,
  TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {readTransactionReleaseCensus, TRANSACTION_RELEASE_CENSUS_STATE} from
  '../../src/query/distributed/distributed-transaction-release-census.js';

const MISSING = 'sqlite_statement_owner_missing';
const SQLITE_SYNCHRONOUS = Object.freeze({NORMAL: 1, FULL: 2});
const snapshotCases = [
  ['readPartitionWriteOriginIn', (db) => readPartitionWriteOriginIn(db, 'g', {})],
  ['readParticipantTransactionCensusIn', readParticipantTransactionCensusIn],
  ['readCommittedStatementCensusIn', readCommittedStatementCensusIn],
  ['readCdcObligationCensusIn', readCdcObligationCensusIn],
];
const cases = [
  ['durable constructor', (db) => new RaftRsDurableStore(db)],
  ['peer constructor', (db) => new RaftRsPeerIdentityRegistry(db)],
  ['CDC init', (db) => ensureCdcObligationLedger(db, {index: 1, term: 1, entryId: 'e'})],
  ['outcome init', createCommittedStatementOutcomeTable],
  ['participant init', openParticipantTransactionStore],
  ['reservation acquisition', (db) => acquireRowReservation({db, partitionId: 'brand-partition',
    tableName: 'facts', pkValues: [1], transactionId: 'brand-transaction'})],
  ['birth', (db) => birthReplicaLifecycle({db, groupId: 'g', replicaIdentity: 'r'})],
  ['original preparation', (db) => prepareReplicaLifecycleForOriginalAllocation({db})],
  ['snapshot preparation', (db) => prepareReplicaLifecycleForSnapshot({db})],
  ['original declaration absence', (db) => readOriginalAllocationDeclaration({db})],
  ['readPartitionWriteOriginHistory', (db) => readPartitionWriteOriginHistory(db, 'g')],
  ...snapshotCases,
  ['markOriginalAllocationIssued', (db) => markOriginalAllocationIssued({db,
    declaration: {anchorReplicaId: 'r'}, anchor: {replicaId: 'r'}})],
  ['prepareOriginalAllocationRow', (db) => prepareOriginalAllocationRow({db, member: {}})],
  ['readOriginalAllocationRow', (db) => readOriginalAllocationRow({db, member: {}})],
  ['transitionOriginalRight', (db) => transitionOriginalRight({db, member: {},
    right: ORIGINAL_ALLOCATION_COLUMN.SERVICE_RIGHT,
    from: ORIGINAL_ALLOCATION.UNUSED, to: ORIGINAL_ALLOCATION.SUBMITTED})],
  ['settleFailedCommittedStatement', (db, effects) => settleFailedCommittedStatement({db}, {
    error: new Error('storage unavailable'),
    afterRollback: () => effects.push('afterRollback'),
    afterCommit: () => effects.push('afterCommit'),
  })],
  ['durable retained history transaction', (db) => RaftRsDurableStore.readRetainedHistoryIn(db, 'g')],
  ['durable record', (db) => RaftRsDurableStore.readDurableRecordIn(db, 'g')],
  ['peer reservation reader', readRaftRsPeerIdentityReservations],
  ['reservation registration', (db) => registerPartitionDatabase('brand-partition', db)],
  ['reservation release before empty transaction', (db) => releaseTransactionReservations('', {db})],
  ['reservation release before empty session', (db) => releaseSessionReservations('', {db})],
  ['reservation sweep', sweepExpiredReservations],
];

function assertForeignRefused(invoke, db, effects) {
  let failure;
  try {
    invoke(db, effects);
  } catch (error) {
    failure = error;
  }
  assert.deepEqual(effects, [], 'no SQL, getter, pragma, transaction or callback before refusal');
  assert.equal(failure?.constructor, Error, 'ordinary ownership error, never aggregate or conversion');
  assert.equal(failure.code, MISSING);
}

function observeRawDatabase(db, effects) {
  for (const method of ['exec', 'prepare', 'transaction', 'pragma']) {
    const original = db[method].bind(db);
    db[method] = (...args) => {
      effects.push(method);
      return original(...args);
    };
  }
}

for (const [name, invoke] of cases) {
  test(`${name} refuses raw handle before SQL or mutation`, () => {
    const effects = [];
    const db = new Database(':memory:', {verbose: (sql) => effects.push(sql)});
    db.pragma('synchronous = NORMAL');
    effects.length = 0;
    observeRawDatabase(db, effects);
    try {
      assertForeignRefused(invoke, db, effects);
    } finally {
      db.close();
    }
  });
  test(`${name} refuses foreign getters before property access`, () => {
    const effects = [];
    const db = {};
    for (const property of ['open', 'inTransaction', 'exec', 'prepare', 'transaction', 'pragma']) {
      Object.defineProperty(db, property, {get() {
        effects.push(property);
        throw new Error('foreign getter reached');
      }});
    }
    assertForeignRefused(invoke, db, effects);
  });
}

for (const [name, invoke] of snapshotCases) {
  test(`${name} refuses an unowned open read transaction before SQL or absence`, () => {
    const effects = [];
    const db = new Database(':memory:', {verbose: (sql) => effects.push(sql)});
    db.exec('BEGIN');
    effects.length = 0;
    observeRawDatabase(db, effects);
    try {
      assertForeignRefused(invoke, db, effects);
    } finally {
      db.close();
    }
  });
}
for (const [name, invoke] of [
  ['snapshot', (db) => readSnapshotIndexIn(db, 'g')],
  ['compacted HLC', (db) => readCompactedMaxHlcIn(db, 'g')],
  ['participant state', participantStoreConnectionStateOf],
]) {
  test(`${name} refuses a closed raw handle before successful absence`, () => {
    const db = new Database(':memory:');
    db.close();
    assert.throws(() => invoke(db), (error) => error.constructor === Error &&
      error.code === MISSING);
  });
}

test('schema and census preserve explicit unavailability without touching a foreign handle', () => {
  const db = new Database(':memory:');
  let calls = 0;
  for (const method of ['exec', 'prepare', 'transaction']) {
    db[method] = () => {
      calls++;
      throw new Error('foreign handle was touched');
    };
  }
  try {
    assert.equal(readTransactionSchemaEnforcement(db).state,
      TRANSACTION_SCHEMA_ENFORCEMENT_STATE.UNAVAILABLE);
    assert.equal(readTransactionReleaseCensus(db).state,
      TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE);
    assert.throws(() => installTransactionSchemaEnforcement(db),
      {code: 'transaction_schema_enforcement_unavailable'});
    assert.equal(calls, 0);
  } finally {
    db.close();
  }
});

test('commitDurably preserves raw uncached commit, rollback and synchronous restoration', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('synchronous = NORMAL');
    db.exec('CREATE TABLE uncached (value INTEGER)');
    assert.equal(commitDurably(db, () => {
      assert.equal(db.inTransaction, true);
      assert.equal(db.pragma('synchronous', {simple: true}), SQLITE_SYNCHRONOUS.FULL);
      db.prepare('INSERT INTO uncached VALUES (?)').run(1);
      return 'committed';
    }), 'committed');
    assert.deepEqual(db.prepare('SELECT value FROM uncached').all(), [{value: 1}]);
    assert.equal(db.pragma('synchronous', {simple: true}), SQLITE_SYNCHRONOUS.NORMAL);
    const refusal = new Error('rollback uncached work');
    assert.throws(() => commitDurably(db, () => {
      db.prepare('INSERT INTO uncached VALUES (?)').run(2);
      throw refusal;
    }), (error) => error === refusal);
    assert.equal(db.inTransaction, false);
    assert.deepEqual(db.prepare('SELECT value FROM uncached').all(), [{value: 1}]);
    assert.equal(db.pragma('synchronous', {simple: true}), SQLITE_SYNCHRONOUS.NORMAL);
  } finally {
    db.close();
  }
});

test('explicit replica birth acquires a branded connection and keeps initialization valid', () => {
  let retained;
  const opened = openRaftRsReplicaDatabase({dbPath: ':memory:', groupId: 'g', replicaIdentity: 'r',
    takeDatabaseCustody: (db) => {
      retained = db;
      assertSQLiteConnection(db);
    }});
  try {
    assert.equal(opened.db, retained);
    assert.ok(retained instanceof SQLiteConnection);
    assert.equal(retained.prepare(`SELECT COUNT(*) AS n FROM ${REPLICA_LIFECYCLE_TABLE}`).get().n, 1);
    const store = new RaftRsDurableStore(retained);
    assert.equal(store.readSnapshotIndex('g'), 0n);
    new RaftRsPeerIdentityRegistry(retained);
    openParticipantTransactionStore(retained);
    createCommittedStatementOutcomeTable(retained);
    ensureCdcObligationLedger(retained, {index: 1, term: 1, entryId: 'e'});
    assert.equal(birthReplicaLifecycle({db: retained, groupId: 'g', replicaIdentity: 'r'}),
      LIFECYCLE_BIRTH.NOT_EMPTY);
  } finally {
    retained.close();
  }
});
