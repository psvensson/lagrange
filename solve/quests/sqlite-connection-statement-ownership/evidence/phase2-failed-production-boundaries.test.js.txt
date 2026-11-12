import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {SQLiteConnection, assertSQLiteConnection} from
  '../../src/storage/sqlite-prepared-statement-owner.js';
import {openRaftRsReplicaDatabase} from '../../src/raft/raft-rs-operation-port.js';
import {LIFECYCLE_BIRTH} from '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {readSnapshotIndexIn} from '../../src/raft/raft-rs-snapshot-witness.js';
import {ensureCdcObligationLedger} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {createCommittedStatementOutcomeTable} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {openParticipantTransactionStore, participantStoreConnectionStateOf} from
  '../../src/partition/partition-participant-transaction-store.js';
import {acquireRowReservation} from '../../src/partition/partition-locking-read-reservation.js';
import {birthReplicaLifecycle} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';

const MISSING = 'sqlite_statement_owner_missing';
const cases = [
  ['durable constructor', (db) => new RaftRsDurableStore(db)],
  ['peer constructor', (db) => new RaftRsPeerIdentityRegistry(db)],
  ['CDC init', (db) => ensureCdcObligationLedger(db, {index: 1, term: 1, entryId: 'e'})],
  ['outcome init', createCommittedStatementOutcomeTable],
  ['participant init', openParticipantTransactionStore],
  ['reservation acquisition', (db) => acquireRowReservation({db, partitionId: 'brand-partition',
    tableName: 'facts', pkValues: [1], transactionId: 'brand-transaction'})],
  ['birth', (db) => birthReplicaLifecycle({db, groupId: 'g', replicaIdentity: 'r'})],
];
for (const [name, invoke] of cases) {
  test(`${name} refuses raw handle before SQL or mutation`, () => {
    const db = new Database(':memory:');
    let calls = 0;
    for (const method of ['exec', 'prepare', 'transaction']) {
      const original = db[method].bind(db);
      db[method] = (...args) => {
        calls++;
        return original(...args);
      };
    }
    try {
      assert.throws(() => invoke(db), (error) => error.constructor === Error &&
        error.code === MISSING);
      assert.equal(calls, 0);
    } finally {
      db.close();
    }
  });
}
for (const [name, invoke] of [
  ['snapshot', (db) => readSnapshotIndexIn(db, 'g')],
  ['participant state', participantStoreConnectionStateOf],
]) {
  test(`${name} refuses a closed raw handle before successful absence`, () => {
    const db = new Database(':memory:');
    db.close();
    assert.throws(() => invoke(db), (error) => error.constructor === Error &&
      error.code === MISSING);
  });
}

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
    assert.equal(retained.prepare('SELECT COUNT(*) AS n FROM _replica_lifecycle').get().n, 1);
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
