/**
 * Authoritative Locking-Read Reservations (SELECT ... FOR UPDATE) verification.
 *
 * Covers the five quest receipts in
 * solve/quests/locking-read-authoritative-reservations/quest.json:
 * 1. public-cross-node-conflict-enforced-or-refused
 * 2. reservation-admission-failure-visible
 * 3. participant-restart-and-owner-change
 * 4. terminal-resolution-and-resource-release
 * 5. all-write-consumers-censused
 *
 * @module test/query/locking-read-authoritative-reservations.test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {
  readSettledOwnerCommandIn,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  acquireRowReservation,
  clearAllReservations,
  clearMemoryReservations,
  getTransactionReservations,
  hasLockingReadReservations,
  registerPartitionDatabase,
  releaseSessionReservations,
  releaseTransactionReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  requestLockingReadReservation,
} from '../../src/partition/partition-locking-read-service.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
  PARTICIPANT_TRANSACTION_COMMAND,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  listActiveParticipantSessions,
} from '../../src/partition/partition-participant-transaction-session.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {decodeCommittedProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {
  ACCOUNTS_PARTITION_ID,
  ACCOUNTS_SCHEMA,
  ACCOUNTS_TABLE,
  GROUP_BUDGET_MS,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  assertNumericRowValues,
  countDbReservations,
  expectSqlState,
  initEnvironment,
  setupTwoNodeCluster,
} from './locking-read-authoritative-test-support.js';

test('Receipt 1: public cross-node SELECT FOR UPDATE enforces 55P03 across separate PgWire nodes and allows disjoint progress', async () => {
  const cluster = await setupTwoNodeCluster({tempPrefix: 'lock-r1-'});
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    // Session A on Node 1 acquires FOR UPDATE with omitted PK projection.
    await clientA.query('BEGIN');
    const selOmitted = await clientA.query(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
    );
    assertNumericRowValues(selOmitted.rows, [{balance: 100}]);

    // Session A also acquires FOR UPDATE with aliased PK projection on id = 2.
    const selAliased = await clientA.query(
      'SELECT id AS acct_key, balance FROM accounts WHERE id = 2 FOR UPDATE',
    );
    assertNumericRowValues(selAliased.rows, [{acct_key: 2, balance: 200}]);

    // Session B on Node 2 (separate engine + coordinator) tests conflicting UPDATE.
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 50 WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Conflicting DELETE on Node 2.
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'DELETE FROM accounts WHERE id = 2',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Conflicting INSERT on Node 2.
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'INSERT INTO accounts (id, balance, tier) VALUES (1, 999, \'gold\')',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Conflicting SELECT ... FOR UPDATE on Node 2.
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Conflicting secondary-index / scan UPDATE matching id = 1 and id = 3 on Node 2.
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 55 WHERE tier = \'gold\'',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Disjoint row id = 3 on Node 2 MUST make forward progress and commit!
    await clientB.query('BEGIN');
    await clientB.query('UPDATE accounts SET balance = 350 WHERE id = 3');
    await clientB.query('COMMIT');

    const disjointVerify = await clientB.query(
      'SELECT balance FROM accounts WHERE id = 3',
    );
    assertNumericRowValues(disjointVerify.rows, [{balance: 350}]);

    // Re-entrant FOR UPDATE and write in Session A on Node 1 succeed and commit.
    const reentrant = await clientA.query(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
    );
    assertNumericRowValues(reentrant.rows, [{balance: 100}]);
    await clientA.query('UPDATE accounts SET balance = 125 WHERE id = 1');
    await clientA.query('COMMIT');

    const finalRead = await clientB.query(
      'SELECT balance FROM accounts WHERE id = 1',
    );
    assertNumericRowValues(finalRead.rows, [{balance: 125}]);
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Receipt 1b: intervening write between candidate selection and reservation acquisition refuses stale lock', async () => {
  const cluster = await setupTwoNodeCluster({tempPrefix: 'lock-r1b-'});
  try {
    const {node1, node2} = cluster;
    const origExecuteSelect = node1.engine.queryExecutor.executeSelect.bind(
      node1.engine.queryExecutor,
    );

    await node1.engine.transactionCoordinator.begin('s-intervene');
    let injected = false;
    node1.engine.queryExecutor.executeSelect = async (...args) => {
      const selectRes = await origExecuteSelect(...args);
      if (!injected && args[0]?.locking) {
        injected = true;
        // Conflicting committed write on id = 1 from Node 2 between select and reservation.
        const w = await node2.engine.executeQuery(
          'UPDATE accounts SET balance = 777 WHERE id = 1',
        );
        assert.equal(w.success, true, w.error);
      }
      return selectRes;
    };

    const res = await node1.engine.executeQuery(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's-intervene'},
    );
    assert.equal(
      res.success,
      false,
      'locking read must fail when candidate row was concurrently modified before reservation',
    );
    assert.equal(node1.engine.transactionCoordinator.getTransaction('s-intervene'), null);

    // Disjoint intervening write on id = 3 must still allow locking id = 2.
    injected = false;
    node1.engine.queryExecutor.executeSelect = async (...args) => {
      const selectRes = await origExecuteSelect(...args);
      if (!injected && args[0]?.locking) {
        injected = true;
        const w = await node2.engine.executeQuery(
          'UPDATE accounts SET balance = 888 WHERE id = 3',
        );
        assert.equal(w.success, true, w.error);
      }
      return selectRes;
    };
    await node1.engine.transactionCoordinator.begin('s-disjoint-intervene');
    const okRes = await node1.engine.executeQuery(
      'SELECT id, balance FROM accounts WHERE id = 2 FOR UPDATE',
      [],
      {sessionId: 's-disjoint-intervene'},
    );
    assert.equal(okRes.success, true, okRes.error);
    await node1.engine.transactionCoordinator.commit('s-disjoint-intervene');
  } finally {
    await cluster.cleanup();
  }
});

test('Receipt 2: admission and persistence failures fail closed with zero phantom reservations', async () => {
  clearAllReservations();
  initEnvironment('fail-closed-node');

  // 2a: Direct acquireRowReservation with store === null must fail closed for FOR_UPDATE.
  const noStoreRes = acquireRowReservation({
    tableName: ACCOUNTS_TABLE,
    partitionId: ACCOUNTS_PARTITION_ID,
    pkValues: [1],
    transactionId: 'tx-no-store',
    sessionId: 's-no-store',
    kind: 'FOR_UPDATE',
    db: null,
  });
  assert.equal(noStoreRes.success, false);
  assert.equal(hasLockingReadReservations('tx-no-store'), false);
  assert.equal(getTransactionReservations('tx-no-store').length, 0);

  // 2b: Read-only / unwritable SQLite partition store must fail SELECT ... FOR UPDATE closed.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-ro-'));
  const roDbPath = path.join(tmpDir, 'ro.db');
  const writableDb = new Database(roDbPath);
  writableDb.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
  writableDb.prepare('INSERT INTO accounts (id, balance) VALUES (1, 100)').run();
  writableDb.close();

  const roDb = new Database(roDbPath, {readonly: true});
  const p2Db = new Database(':memory:');
  p2Db.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
  p2Db.prepare('INSERT INTO accounts (id, balance) VALUES (150, 500)').run();

  const tables = [{table_name: ACCOUNTS_TABLE, primaryKey: 'id', partition_key_type: 'INTEGER'}];
  const partitions = [
    {table_name: ACCOUNTS_TABLE, partition_id: 'accounts-p1', partition_key_start: null, partition_key_end: 100, partition_key_type: 'INTEGER'},
    {table_name: ACCOUNTS_TABLE, partition_id: 'accounts-p2', partition_key_start: 101, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];
  const partitionServices = new Map([
    ['accounts-p2', {db: p2Db, partitionId: 'accounts-p2'}],
    ['accounts-p1', {db: roDb, partitionId: 'accounts-p1'}],
  ]);
  const systemCache = createMockSystemCache(tables, partitions);
  const gateway = createTransactionPersistenceGateway();

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    controlPlaneSystemTableGateway: gateway,
    partitionServicesProvider: () => partitionServices,
    messageRouter: {
      async deliver(address, message) {
        if (message.type === 'TRANSACTION') {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            answerParticipantTransactionRequest(message),
          );
        }
        const pid = address?.split('/')?.at(-1);
        const rows = pid === 'accounts-p2' ? [{id: 150, balance: 500}] : [{id: 1, balance: 100}];
        return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows});
      },
    },
  });

  try {
    // Multi-partition query: accounts-p2 (id=150, writable) acquires first, then accounts-p1 (id=1, read-only) fails!
    const tx = await engine.transactionCoordinator.begin('s-partial-fail');
    const lockRes = await engine.executeQuery(
      'SELECT id, balance FROM accounts ORDER BY id DESC FOR UPDATE',
      [],
      {sessionId: 's-partial-fail'},
    );
    assert.equal(lockRes.success, false, 'read-only store must refuse SELECT FOR UPDATE');
    assert.equal(
      hasLockingReadReservations(tx.transactionId),
      false,
      'failed reservation persistence must leave zero phantom in-memory reservations',
    );
    assert.equal(getTransactionReservations(tx.transactionId).length, 0);
    assert.equal(
      countDbReservations(p2Db, ACCOUNTS_TABLE),
      0,
      'partial multi-row/partition reservation on accounts-p2 must be rolled back',
    );
  } finally {
    await engine.shutdown().catch(() => {});
    roDb.close();
    p2Db.close();
    gateway.db.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
    clearAllReservations();
  }
});

test('Receipt 3: participant restart on disk and Raft leader change preserve and release authoritative reservations', async () => {
  // 3a: File-backed participant restart with empty in-memory reservation maps.
  clearAllReservations();
  initEnvironment('restart-node-1');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-restart-'));
  const dbPath = path.join(tmpDir, 'accounts-p1.db');
  const transport = createLoopbackTransport();
  const tables = [{table_name: ACCOUNTS_TABLE, primaryKey: 'id', partition_key_type: 'INTEGER'}];
  const partitions = [
    {table_name: ACCOUNTS_TABLE, partition_id: ACCOUNTS_PARTITION_ID, partition_key_start: null, partition_key_end: null, partition_key_type: 'INTEGER'},
  ];

  const makeSingleService = (db) => {
    registerPartitionDatabase(ACCOUNTS_PARTITION_ID, db);
    const services = new Map([[ACCOUNTS_PARTITION_ID, {db, partitionId: ACCOUNTS_PARTITION_ID}]]);
    const cache = createMockSystemCache(tables, partitions);
    const gateway = createTransactionPersistenceGateway();
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      controlPlaneSystemTableGateway: gateway,
      partitionServicesProvider: () => services,
      messageRouter: {
        async deliver(_address, message) {
          if (message.type === 'TRANSACTION') {
            return buildDeliveryEnvelope(
              {acknowledged: true},
              answerParticipantTransactionRequest(message),
            );
          }
          if (message.sql) {
            const trimmed = message.sql.trim().toUpperCase();
            if (trimmed.startsWith('SELECT')) {
              return buildDeliveryEnvelope(
                {acknowledged: true},
                {success: true, rows: db.prepare(message.sql).all(message.params || [])},
              );
            }
            const info = db.prepare(message.sql).run(message.params || []);
            return buildDeliveryEnvelope(
              {acknowledged: true},
              {success: true, affectedRows: info.changes},
            );
          }
          return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
        },
      },
    });
    return {engine, gateway};
  };

  const db1 = new Database(dbPath);
  db1.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER, tier TEXT)');
  db1.prepare('INSERT INTO accounts (id, balance, tier) VALUES (1, 100, \'gold\')').run();
  const s1 = makeSingleService(db1);
  let holdTxId;
  try {
    const tx1 = await s1.engine.transactionCoordinator.begin('s-before-restart');
    holdTxId = tx1.transactionId;
    const res = await s1.engine.executeQuery(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's-before-restart'},
    );
    assert.equal(res.success, true, res.error);
    assert.equal(countDbReservations(db1), 1);
  } finally {
    // Simulate crash/restart BEFORE closing: close DB WITHOUT calling releasePendingReservations
    // by closing handle directly and wiping ALL in-memory Maps!
    s1.gateway.db.close();
    db1.close();
    clearAllReservations();
  }

  // Reopen the SAME SQLite file with empty in-memory RESERVATIONS / TRANSACTION_RESERVATIONS!
  const db2 = new Database(dbPath);
  const s2 = makeSingleService(db2);
  try {
    assert.equal(countDbReservations(db2), 1, 'persisted reservation must survive restart');
    assert.equal(hasLockingReadReservations(holdTxId), false, 'in-memory map must be empty');

    await s2.engine.transactionCoordinator.begin('s-after-restart');
    const conflictUpdate = await s2.engine.executeQuery(
      'UPDATE accounts SET balance = 500 WHERE id = 1',
      [],
      {sessionId: 's-after-restart'},
    );
    assert.equal(conflictUpdate.success, false);
    assert.equal(conflictUpdate.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);

    await s2.engine.transactionCoordinator.begin('s-after-restart-2');
    const conflictSelect = await s2.engine.executeQuery(
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's-after-restart-2'},
    );
    assert.equal(conflictSelect.success, false);
    assert.equal(conflictSelect.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);

    // Terminal release of the survived durable transaction releases the SQLite lock.
    releaseTransactionReservations(holdTxId, {db: db2});
    assert.equal(countDbReservations(db2), 0);

    await s2.engine.transactionCoordinator.begin('s-successor');
    const okUpdate = await s2.engine.executeQuery(
      'UPDATE accounts SET balance = 500 WHERE id = 1',
      [],
      {sessionId: 's-successor'},
    );
    assert.equal(okUpdate.success, true, okUpdate.error);
    await s2.engine.transactionCoordinator.commit('s-successor');
  } finally {
    await s2.engine.shutdown().catch(() => {});
    s2.gateway.db.close();
    db2.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
    clearAllReservations();
  }

  // 3b: Raft leader change (r1 -> r2) in 3-replica group preserves lock and releases on COMMIT.
  const cluster = await setupTwoNodeCluster({tempPrefix: 'lock-leader-change-'});
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    await clientA.query('BEGIN');
    const sel = await clientA.query('SELECT balance FROM accounts WHERE id = 1 FOR UPDATE');
    assertNumericRowValues(sel.rows, [{balance: 100}]);

    // Transfer Raft leadership from r1 (node-1) to r2 (node-2).
    const r1 = cluster.group.services[0];
    const r2 = cluster.group.services[1];
    const transfer = await turnChainValue(
      r1.raft.transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: r2.replicaId,
      }),
    );
    assert.equal(
      transfer.outcome,
      RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(transfer),
    );
    const elected = await cluster.group.waitFor(
      () => r2.raft?.readStatus?.().role === RAFT_ROLE.LEADER,
    );
    assert.equal(elected, true, 'r2 must become leader');
    await cluster.releaseOwners.release(ACCOUNTS_PARTITION_ID);
    cluster.updateLeaderRouting(cluster.members[1]);

    // Clear in-memory map on process to guarantee r2 enforces from its replicated SQLite state.
    clearMemoryReservations();

    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 600 WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Terminal resolution (ROLLBACK) on new leader r2 releases the replicated SQLite reservation.
    await clientA.query('ROLLBACK');
    assert.equal(countDbReservations(r2.db), 0);

    // Successor write on Node 2 succeeds.
    await clientB.query('BEGIN');
    await clientB.query('UPDATE accounts SET balance = 600 WHERE id = 1');
    await clientB.query('COMMIT');
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
  void transport;
  void PartitionService;
  void withFoundingStamp;
});

test('Receipt 4: terminal resolution (COMMIT, ROLLBACK, socket disconnect, cancel, timeout, partial conflict) releases all reservations', async () => {
  const cluster = await setupTwoNodeCluster({tempPrefix: 'lock-r4-'});
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    const leaderDb = () => cluster.leader().db;

    // 4a: COMMIT releases lock.
    await clientA.query('BEGIN');
    await clientA.query('SELECT balance FROM accounts WHERE id = 1 FOR UPDATE');
    assert.equal(countDbReservations(leaderDb()), 1);
    await clientA.query('COMMIT');
    assert.equal(countDbReservations(leaderDb()), 0);

    // 4b: ROLLBACK releases lock.
    await clientA.query('BEGIN');
    await clientA.query('SELECT balance FROM accounts WHERE id = 1 FOR UPDATE');
    assert.equal(countDbReservations(leaderDb()), 1);
    await clientA.query('ROLLBACK');
    assert.equal(countDbReservations(leaderDb()), 0);

    // 4c: Abrupt TCP disconnect on clientA releases lock so clientB succeeds.
    const clientDisconnect = await cluster.pg1.connectClient();
    clientDisconnect.on('error', () => {});
    await clientDisconnect.query('BEGIN');
    await clientDisconnect.query('SELECT balance FROM accounts WHERE id = 1 FOR UPDATE');
    assert.equal(countDbReservations(leaderDb()), 1);
    clientDisconnect.connection.stream.destroy();
    const releasedOnDisconnect = await cluster.group.waitFor(
      () => countDbReservations(leaderDb()) === 0,
    );
    assert.equal(releasedOnDisconnect, true, 'abrupt PG disconnect must release reservation');

    // 4d: Coordinator cancel and timeout release reservations.
    await cluster.node1.engine.transactionCoordinator.begin('s-cancel');
    const lockCancel = await cluster.node1.engine.executeQuery(
      'SELECT id FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's-cancel'},
    );
    assert.equal(lockCancel.success, true);
    assert.equal(countDbReservations(leaderDb()), 1);
    await cluster.node1.engine.transactionCoordinator.cancel('s-cancel');
    assert.equal(countDbReservations(leaderDb()), 0);

    await cluster.node1.engine.transactionCoordinator.begin('s-timeout');
    const lockTimeout = await cluster.node1.engine.executeQuery(
      'SELECT id FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId: 's-timeout'},
    );
    assert.equal(lockTimeout.success, true);
    assert.equal(countDbReservations(leaderDb()), 1);
    const txObj = cluster.node1.engine.transactionCoordinator.transactionsBySession.get('s-timeout');
    await cluster.node1.engine.transactionCoordinator.abortTimedOutTransaction(txObj, 'PREPARE');
    assert.equal(countDbReservations(leaderDb()), 0);

    // 4e: Partial multi-row acquisition conflict rolls back row 1 reservation.
    await clientA.query('BEGIN');
    await clientA.query('SELECT id FROM accounts WHERE id = 2 FOR UPDATE');
    assert.equal(countDbReservations(leaderDb()), 1);

    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'SELECT id FROM accounts ORDER BY id ASC FOR UPDATE',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');
    // Only clientA's reservation on id = 2 may remain; id = 1 must NOT be leaked!
    assert.equal(countDbReservations(leaderDb()), 1);
    const heldRows = leaderDb()
      .prepare('SELECT row_key FROM _lagrange_locking_read_reservations')
      .all();
    assert.deepEqual(
      heldRows.map((r) => r.row_key),
      ['accounts:accounts-p1:2'],
    );
    await clientA.query('COMMIT');
    assert.equal(countDbReservations(leaderDb()), 0);
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Receipt 5: all write consumers enforce durable SQLite reservations even when in-memory maps are empty', async () => {
  const cluster = await setupTwoNodeCluster({tempPrefix: 'lock-r5-'});
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    // Acquire FOR UPDATE on id = 1 via Node 1.
    await clientA.query('BEGIN');
    await clientA.query('SELECT balance FROM accounts WHERE id = 1 FOR UPDATE');

    // Wipe in-memory maps to simulate empty process-local bookkeeping on Node 2 / post-restart.
    clearMemoryReservations();

    // 1. Scoped INSERT
    await expectSqlState(
      clientB,
      'INSERT INTO accounts (id, balance, tier) VALUES (1, 10, \'gold\')',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    // 2. Unscoped INSERT (omitted PK via PgWire & INSERT OR REPLACE via SQLite dialect)
    await expectSqlState(
      clientB,
      'INSERT INTO accounts (balance, tier) VALUES (10, \'gold\')',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    const replaceRes = await cluster.node2.engine.executeQuery(
      'INSERT OR REPLACE INTO accounts (id, balance, tier) VALUES (99, 10, \'gold\')',
      [],
      {dialect: 'sqlite'},
    );
    assert.equal(replaceRes.success, false);
    assert.equal(replaceRes.sqlState, LOCK_NOT_AVAILABLE_SQLSTATE);
    // 3. Equality UPDATE
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 10 WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    // 4. Equality DELETE
    await expectSqlState(
      clientB,
      'DELETE FROM accounts WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    // 5. Scan / non-PK UPDATE
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 10 WHERE tier = \'gold\'',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    // 6. Scan / non-PK DELETE
    await expectSqlState(
      clientB,
      'DELETE FROM accounts WHERE balance = 100',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    // 7. Competing SELECT ... FOR UPDATE
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'SELECT balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // Disjoint scan write (tier = 'silver' only matches id = 2) MUST succeed!
    await clientB.query('UPDATE accounts SET balance = 222 WHERE tier = \'silver\'');
    const verify = await clientB.query('SELECT balance FROM accounts WHERE id = 2');
    assertNumericRowValues(verify.rows, [{balance: 222}]);

    await clientA.query('ROLLBACK');
    assert.equal(countDbReservations(cluster.leader().db), 0);
    await clientB.query('UPDATE accounts SET balance = 111 WHERE id = 1');
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Witness 1a: staged write W on leader blocks competing FOR UPDATE across processes (zero shared RESERVATIONS memory)', async () => {
  const cluster = await setupTwoNodeCluster({
    tempPrefix: 'lock-w1a-',
    concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
  });
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    const [r1, r2, r3] = cluster.group.services;

    // Schedule 1a (scoped): Gateway B stages write W on id = 1, then local RESERVATIONS memory is cleared.
    await clientB.query('BEGIN');
    await clientB.query('UPDATE accounts SET balance = 777 WHERE id = 1');
    clearMemoryReservations();

    // Gateway A attempts SELECT ... FOR UPDATE on id = 1 without shared memory; leader r1 must refuse 55P03.
    await clientA.query('BEGIN');
    await expectSqlState(
      clientA,
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    assert.equal(countDbReservations(r1.db), 0);
    assert.equal(countDbReservations(r2.db), 0);
    assert.equal(countDbReservations(r3.db), 0);
    await clientA.query('ROLLBACK');

    // Disjoint row id = 2 CAN still be locked by Gateway A while W holds staged write on id = 1!
    await clientA.query('BEGIN');
    const disjointLock = await clientA.query(
      'SELECT id, balance FROM accounts WHERE id = 2 FOR UPDATE',
    );
    assertNumericRowValues(disjointLock.rows, [{id: 2, balance: 200}]);
    await clientA.query('COMMIT');

    // Once W commits, Gateway A can acquire FOR UPDATE on id = 1 and sees balance = 777.
    await clientB.query('COMMIT');
    await clientA.query('BEGIN');
    const afterCommitLock = await clientA.query(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
    );
    assertNumericRowValues(afterCommitLock.rows, [{id: 1, balance: 777}]);
    await clientA.query('COMMIT');

    // Schedule 1a (unscoped): Gateway B stages non-PK scan write, memory cleared, Gateway A FOR UPDATE refuses 55P03.
    await clientB.query('BEGIN');
    await clientB.query('UPDATE accounts SET balance = 888 WHERE tier = \'gold\'');
    clearMemoryReservations();

    await clientA.query('BEGIN');
    await expectSqlState(
      clientA,
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientA.query('ROLLBACK');
    await clientB.query('ROLLBACK');
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Witness 1b: committed Raft apply of ACQUIRE is 100% deterministic across replicas despite divergent process-local RESERVATIONS', async () => {
  const cluster = await setupTwoNodeCluster({
    tempPrefix: 'lock-w1b-',
    concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
  });
  const clientA = await cluster.pg1.connectClient();
  const clientB = await cluster.pg2.connectClient();
  try {
    const [r1, r2, r3] = cluster.group.services;
    let capturedAcquireCommand = null;

    // Simulate separate process on r2 holding a divergent process-local WRITE_STAGED entry
    // in RESERVATIONS right before r2 applies the committed ACQUIRE command.
    const origR2Apply = r2.applyCommittedEntry.bind(r2);
    r2.applyCommittedEntry = (committedArg) => {
      if (committedArg?.command?.type === 'LOCKING_READ_RESERVATION' &&
          committedArg?.command?.reservation?.op === 'ACQUIRE') {
        capturedAcquireCommand = committedArg.command;
        clearMemoryReservations();
        acquireRowReservation({
          tableName: ACCOUNTS_TABLE,
          partitionId: ACCOUNTS_PARTITION_ID,
          pkValues: [1],
          transactionId: 'tx-divergent-gateway-b',
          sessionId: 's-divergent-gateway-b',
          kind: 'WRITE_STAGED',
          db: null,
        });
      }
      return origR2Apply(committedArg);
    };

    await clientA.query('BEGIN');
    const sel = await clientA.query('SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE');
    assertNumericRowValues(sel.rows, [{id: 1, balance: 100}]);

    // Transfer Raft leadership r1 -> r2 so all replicas have applied through the ACQUIRE entry.
    const transfer = await turnChainValue(
      r1.raft.transferLeadership({
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: r2.replicaId,
      }),
    );
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK, JSON.stringify(transfer));
    const elected = await cluster.group.waitFor(
      () => r2.raft?.readStatus?.().role === RAFT_ROLE.LEADER,
    );
    assert.equal(elected, true, 'r2 must become leader');
    await cluster.releaseOwners.release(ACCOUNTS_PARTITION_ID);
    cluster.updateLeaderRouting(cluster.members[1]);

    const r3Applied = await cluster.group.waitFor(() => countDbReservations(r3.db) === 1);
    assert.equal(r3Applied, true, 'r3 must have persisted the replicated reservation');
    assert.equal(countDbReservations(r1.db), 1, 'r1 must hold 1 durable reservation');
    assert.equal(countDbReservations(r2.db), 1, 'r2 must hold 1 durable reservation (no divergence)');

    assert.ok(capturedAcquireCommand, 'r2 must have applied the ACQUIRE command');
    for (const svc of [r1, r2, r3]) {
      const settled = readSettledOwnerCommandIn(svc.db, {
        entryId: capturedAcquireCommand.entryId,
        commandDigest: capturedAcquireCommand.commandDigest,
      });
      const parsed = JSON.parse(settled.recorded.ownerResultText);
      assert.equal(parsed.success, true, `replica ${svc.replicaId} settled outcome diverged`);
    }

    // Clear process memory and verify new leader r2 refuses competing write from its durable state.
    clearMemoryReservations();
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 600 WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');
    await clientA.query('ROLLBACK');
    assert.equal(countDbReservations(r2.db), 0);
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Witness 2: per-participant release clears ONLY target partition reservations without wiping other partitions', async () => {
  clearAllReservations();
  initEnvironment('release-scope-node');
  const transport = createLoopbackTransport();
  const groupP1 = await formAdmittedGroup({
    partitionId: 'accounts-p1',
    members: [['accounts-p1-r1', 'node-1']],
    tempPrefix: 'lock-w2-p1-',
    budgetMs: GROUP_BUDGET_MS,
    transport,
    serviceOptions: {
      tableId: ACCOUNTS_TABLE,
      tableName: ACCOUNTS_TABLE,
      schema: ACCOUNTS_SCHEMA,
      concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    },
  });
  const groupP2 = await formAdmittedGroup({
    partitionId: 'accounts-p2',
    members: [['accounts-p2-r1', 'node-1']],
    tempPrefix: 'lock-w2-p2-',
    budgetMs: GROUP_BUDGET_MS,
    transport,
    serviceOptions: {
      tableId: ACCOUNTS_TABLE,
      tableName: ACCOUNTS_TABLE,
      schema: ACCOUNTS_SCHEMA,
      concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    },
  });
  const p1 = groupP1.services[0];
  const p2 = groupP2.services[0];
  const txId = 'tx-two-part-scope';
  const sessionId = 's-two-part-scope';
  try {
    const acq1 = await requestLockingReadReservation(p1, {
      op: 'ACQUIRE',
      tableName: ACCOUNTS_TABLE,
      pkValues: [1],
      transactionId: txId,
      sessionId,
      participantId: `${txId}:accounts-p1`,
    });
    const acq2 = await requestLockingReadReservation(p2, {
      op: 'ACQUIRE',
      tableName: ACCOUNTS_TABLE,
      pkValues: [150],
      transactionId: txId,
      sessionId,
      participantId: `${txId}:accounts-p2`,
    });
    assert.equal(acq1.success, true);
    assert.equal(acq2.success, true);
    assert.equal(countDbReservations(p1.db), 1);
    assert.equal(countDbReservations(p2.db), 1);

    // Releasing accounts-p1 MUST leave accounts-p2 untouched until accounts-p2 releases itself.
    const rel1 = await requestLockingReadReservation(p1, {
      op: 'RELEASE_TRANSACTION',
      transactionId: txId,
      sessionId,
      participantId: `${txId}:accounts-p1`,
    });
    assert.equal(rel1.success, true);
    assert.equal(countDbReservations(p1.db), 0, 'accounts-p1 durable reservation must be released');
    assert.equal(
      countDbReservations(p2.db),
      1,
      'accounts-p2 durable reservation must remain intact until accounts-p2 applies release',
    );

    const rel2 = await requestLockingReadReservation(p2, {
      op: 'RELEASE_TRANSACTION',
      transactionId: txId,
      sessionId,
      participantId: `${txId}:accounts-p2`,
    });
    assert.equal(rel2.success, true);
    assert.equal(countDbReservations(p2.db), 0);

    // Also verify partition-scoped release inside a shared SQLite DB only deletes the target partition.
    const sharedDb = new Database(':memory:');
    try {
      acquireRowReservation({
        tableName: ACCOUNTS_TABLE,
        partitionId: 'accounts-p1',
        pkValues: [1],
        transactionId: txId,
        sessionId,
        kind: 'FOR_UPDATE',
        db: sharedDb,
      });
      acquireRowReservation({
        tableName: ACCOUNTS_TABLE,
        partitionId: 'accounts-p2',
        pkValues: [150],
        transactionId: txId,
        sessionId,
        kind: 'FOR_UPDATE',
        db: sharedDb,
      });
      assert.equal(countDbReservations(sharedDb), 2);
      releaseTransactionReservations(txId, {db: sharedDb, partitionId: 'accounts-p1'});
      assert.equal(countDbReservations(sharedDb), 1);
      releaseTransactionReservations(txId, {db: sharedDb, partitionId: 'accounts-p2'});
      assert.equal(countDbReservations(sharedDb), 0);
    } finally {
      sharedDb.close();
    }
  } finally {
    await groupP1.dispose().catch(() => {});
    await groupP2.dispose().catch(() => {});
    clearAllReservations();
  }
});

test('Witness 3: writer staged while ACQUIRE awaits consensus cannot prepare or commit under live lock (deterministic, disjoint progresses)', {timeout: 30000}, async () => {
  const cluster = await setupTwoNodeCluster({
    tempPrefix: 'lock-w3-race-',
    concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
  });
  const clientT = await cluster.pg1.connectClient();
  const clientW = await cluster.pg2.connectClient();
  const clientDisjoint = await cluster.pg2.connectClient();
  const clientW2 = await cluster.pg2.connectClient();
  const [r1, r2, r3] = cluster.group.services;
  const network = r1.transport;
  const origDeliver = network.deliver.bind(network);
  const origR2Apply = r2.applyCommittedEntry.bind(r2);
  const origR3Apply = r3.applyCommittedEntry.bind(r3);

  let armHoldOnAcquire = false;
  let holdAppendEntries = false;
  const heldDeliveries = [];
  let proposedAcquireCmd = null;
  let capturedPrepare2TxId = null;
  let poisonOnR2Apply = false;
  let wipeOnR3Apply = false;

  const decodeAppendCommands = (entries) => {
    const commands = [];
    for (const entry of entries || []) {
      if (!entry?.data || entry.data.length === 0) continue;
      try {
        const bytes = typeof entry.data === 'string' ?
          Buffer.from(entry.data, 'base64') :
          entry.data;
        commands.push(decodeCommittedProposal(bytes));
      } catch (_err) {
        // Non-proposal entry (e.g. conf change or empty noop).
      }
    }
    return commands;
  };

  const flushHeldDeliveries = () => {
    holdAppendEntries = false;
    armHoldOnAcquire = false;
    const queued = heldDeliveries.splice(0, heldDeliveries.length);
    for (const deliverNow of queued) {
      void deliverNow().catch(() => {});
    }
  };

  network.deliver = (address, payload) => {
    if ((armHoldOnAcquire || holdAppendEntries) &&
        isRaftRsTransportEnvelope(payload) &&
        payload.groupId === ACCOUNTS_PARTITION_ID &&
        payload.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND &&
        Array.isArray(payload.message.entries) &&
        payload.message.entries.length > 0) {
      const commands = decodeAppendCommands(payload.message.entries);
      if (armHoldOnAcquire) {
        const acquireCmd = commands.find(
          (cmd) => cmd?.type === 'LOCKING_READ_RESERVATION' &&
            cmd?.reservation?.op === 'ACQUIRE',
        );
        if (acquireCmd) {
          armHoldOnAcquire = false;
          holdAppendEntries = true;
          proposedAcquireCmd = acquireCmd;
        }
      }
      if (holdAppendEntries) {
        const prepCmd = commands.find(
          (cmd) => cmd?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE,
        );
        if (prepCmd?.transactionId) {
          capturedPrepare2TxId = prepCmd.transactionId;
        }
        heldDeliveries.push(() => origDeliver(address, payload));
        // Return immediately like an async wire send so r1.raft's turn chain stays unblocked
        // while the AppendEntries packets remain held before quorum delivery to r2/r3.
        return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}, undefined));
      }
    }
    return origDeliver(address, payload);
  };

  r2.applyCommittedEntry = (committedArg) => {
    if (committedArg?.command?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE &&
        committedArg?.command?.transactionId) {
      capturedPrepare2TxId = committedArg.command.transactionId;
    }
    if (poisonOnR2Apply &&
        (committedArg?.command?.type === 'LOCKING_READ_RESERVATION' ||
         committedArg?.command?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE)) {
      clearMemoryReservations();
      acquireRowReservation({
        tableName: ACCOUNTS_TABLE,
        partitionId: ACCOUNTS_PARTITION_ID,
        pkValues: [1],
        transactionId: 'tx-divergent-memory-r2',
        sessionId: 's-divergent-memory-r2',
        kind: 'WRITE_STAGED',
        db: null,
      });
    }
    return origR2Apply(committedArg);
  };

  r3.applyCommittedEntry = (committedArg) => {
    if (wipeOnR3Apply &&
        (committedArg?.command?.type === 'LOCKING_READ_RESERVATION' ||
         committedArg?.command?.type === PARTICIPANT_TRANSACTION_COMMAND.PREPARE)) {
      clearMemoryReservations();
    }
    return origR3Apply(committedArg);
  };

  const readAccountBalance = (db, id) =>
    Number(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(id)?.balance);

  try {
    // --- Schedule 3a: ACQUIRE held after precheck/proposal, W & W_disjoint stage in already-open sessions,
    // ACQUIRE commits/applies & acknowledges lock, then W attempts PREPARE/COMMIT while W_disjoint commits. ---
    await clientW.query('BEGIN');
    const wSeedRead = await clientW.query('SELECT balance FROM accounts WHERE id = 2');
    assertNumericRowValues(wSeedRead.rows, [{balance: 200}]);

    await clientDisjoint.query('BEGIN');
    const dSeedRead = await clientDisjoint.query('SELECT balance FROM accounts WHERE id = 3');
    assertNumericRowValues(dSeedRead.rows, [{balance: 300}]);

    assert.ok(
      Array.from(listActiveParticipantSessions(r1)).length >= 2,
      'W and W_disjoint must have already-open participant sessions on leader r1',
    );

    await clientT.query('BEGIN');
    proposedAcquireCmd = null;
    armHoldOnAcquire = true;
    const tAcquirePromise = clientT.query(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
    );

    const acquirePaused = await cluster.group.waitFor(
      () => proposedAcquireCmd !== null && heldDeliveries.length >= 2,
    );
    assert.equal(
      acquirePaused,
      true,
      'ACQUIRE must pass precheck/proposal and have AppendEntries to r2/r3 held before quorum',
    );
    const proposedAcquire = proposedAcquireCmd;
    assert.equal(countDbReservations(r1.db), 0, 'ACQUIRE must not be applied yet on r1');

    // Stage conflicting write W (id = 1) and disjoint write W_disjoint (id = 3) while ACQUIRE awaits consensus.
    await clientW.query('UPDATE accounts SET balance = 500 WHERE id = 1');
    await clientDisjoint.query('UPDATE accounts SET balance = 350 WHERE id = 3');
    assert.equal(countDbReservations(r1.db), 0, 'durable reservation still absent before quorum');

    // Diverge process-local memory on r2/r3 before releasing ACQUIRE to verify memory-independent apply.
    poisonOnR2Apply = true;
    wipeOnR3Apply = true;
    flushHeldDeliveries();

    const tLockRes = await tAcquirePromise;
    assertNumericRowValues(tLockRes.rows, [{id: 1, balance: 100}]);

    const allHoldLock = await cluster.group.waitFor(
      () => countDbReservations(r1.db) === 1 &&
        countDbReservations(r2.db) === 1 &&
        countDbReservations(r3.db) === 1,
    );
    assert.equal(allHoldLock, true, 'all three replicas must durably hold T lock on id = 1');
    for (const svc of [r1, r2, r3]) {
      const settled = readSettledOwnerCommandIn(svc.db, {
        entryId: proposedAcquire.entryId,
        commandDigest: proposedAcquire.commandDigest,
      });
      assert.equal(JSON.parse(settled.recorded.ownerResultText).success, true);
    }

    // Clear process-local memory before W attempts PREPARE/COMMIT so refusal is 100% SQLite-authoritative.
    clearMemoryReservations();

    // Conflicting writer W MUST NOT prepare or commit under T's acknowledged live lock!
    await expectSqlState(clientW, 'COMMIT', [], LOCK_NOT_AVAILABLE_SQLSTATE);
    for (const svc of [r1, r2, r3]) {
      assert.equal(
        readAccountBalance(svc.db, 1),
        100,
        `conflicting writer W must not modify locked row id = 1 on ${svc.replicaId}`,
      );
      assert.equal(
        countDbReservations(svc.db),
        1,
        `T live reservation must stay intact on ${svc.replicaId} after W refusal`,
      );
    }

    // Positive control: disjoint-row writer W_disjoint staged in the same window MUST commit cleanly!
    await clientDisjoint.query('COMMIT');
    const disjointCommitted = await cluster.group.waitFor(
      () => readAccountBalance(r1.db, 3) === 350 &&
        readAccountBalance(r2.db, 3) === 350 &&
        readAccountBalance(r3.db, 3) === 350,
    );
    assert.equal(disjointCommitted, true, 'disjoint writer must commit on all three replicas');
    assert.equal(countDbReservations(r1.db), 1, 'T reservation on id = 1 still held');

    // T updates its own locked row and commits, releasing its lock across all replicas.
    await clientT.query('UPDATE accounts SET balance = 175 WHERE id = 1');
    await clientT.query('COMMIT');
    const tCommitted = await cluster.group.waitFor(
      () => readAccountBalance(r1.db, 1) === 175 &&
        readAccountBalance(r2.db, 1) === 175 &&
        readAccountBalance(r3.db, 1) === 175 &&
        countDbReservations(r1.db) === 0 &&
        countDbReservations(r2.db) === 0 &&
        countDbReservations(r3.db) === 0,
    );
    assert.equal(tCommitted, true, 'T commit must apply and release locks across r1/r2/r3');

    // --- Schedule 3b: W2 proposes PARTICIPANT_PREPARE into consensus behind held ACQUIRE;
    // deterministic applyParticipantPrepare must refuse W2 identically on r1/r2/r3 without local memory. ---
    capturedPrepare2TxId = null;
    await clientW2.query('BEGIN');
    await clientW2.query('SELECT balance FROM accounts WHERE id = 2');

    await clientT.query('BEGIN');
    proposedAcquireCmd = null;
    armHoldOnAcquire = true;
    const t2AcquirePromise = clientT.query(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
    );

    const acquire2Paused = await cluster.group.waitFor(
      () => proposedAcquireCmd !== null && heldDeliveries.length >= 2,
    );
    assert.equal(acquire2Paused, true);
    const indexAfterAcquire = r1.raft.readStatus().lastIndex;

    await clientW2.query('UPDATE accounts SET balance = 600 WHERE id = 1');
    const w2CommitOutcome = expectSqlState(
      clientW2,
      'COMMIT',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );

    const prepareProposedInLog = await cluster.group.waitFor(
      () => r1.raft.readStatus().lastIndex > indexAfterAcquire,
    );
    assert.equal(
      prepareProposedInLog,
      true,
      'W2 PARTICIPANT_PREPARE must enter r1 Raft log behind uncommitted ACQUIRE',
    );

    // Release ACQUIRE followed by PARTICIPANT_PREPARE with poisoned/wiped local memory on r2/r3.
    flushHeldDeliveries();

    const t2LockRes = await t2AcquirePromise;
    assertNumericRowValues(t2LockRes.rows, [{id: 1, balance: 175}]);
    await w2CommitOutcome;

    assert.ok(capturedPrepare2TxId, 'W2 PARTICIPANT_PREPARE transactionId must be observed');
    const allSettledRefused = await cluster.group.waitFor(() =>
      [r1, r2, r3].every((svc) => {
        const row = svc.db
          .prepare(
            'SELECT state, refusal_cause FROM _participant_transactions WHERE transaction_id = ?',
          )
          .get(capturedPrepare2TxId);
        return row?.state === 'REFUSED' && row?.refusal_cause === 'lock_conflict';
      }),
    );
    assert.equal(
      allSettledRefused,
      true,
      'all three replicas must deterministically settle W2 PREPARE as REFUSED(lock_conflict)',
    );
    for (const svc of [r1, r2, r3]) {
      assert.equal(
        readAccountBalance(svc.db, 1),
        175,
        `W2 must not mutate locked row id = 1 on ${svc.replicaId}`,
      );
      assert.equal(countDbReservations(svc.db), 1, `T2 lock must remain live on ${svc.replicaId}`);
    }

    await clientT.query('ROLLBACK');
    const allReleased = await cluster.group.waitFor(
      () => countDbReservations(r1.db) === 0 &&
        countDbReservations(r2.db) === 0 &&
        countDbReservations(r3.db) === 0,
    );
    assert.equal(allReleased, true, 'T2 rollback must release lock across all replicas');
  } finally {
    flushHeldDeliveries();
    network.deliver = origDeliver;
    r2.applyCommittedEntry = origR2Apply;
    r3.applyCommittedEntry = origR3Apply;
    await clientT.end().catch(() => {});
    await clientW.end().catch(() => {});
    await clientDisjoint.end().catch(() => {});
    await clientW2.end().catch(() => {});
    await cluster.cleanup();
  }
});

test('Witness 4: gateway cleanup (write-error, unscoped helper, shutdown) never erases unresolved durable reservations on co-located participant DB', {timeout: 30000}, async () => {
  const cluster = await setupTwoNodeCluster({
    tempPrefix: 'lock-w4-gateway-cleanup-',
    concurrencyGranularity: PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
  });
  const clientB = await cluster.pg2.connectClient();
  const [r1, r2, r3] = cluster.group.services;
  try {
    // Co-located participant DB on node1 (r1.db) is also registered in PARTITION_DBS.
    registerPartitionDatabase(ACCOUNTS_PARTITION_ID, r1.db);

    const sessionId = 's-unresolved-colocated';
    const tx = await cluster.node1.engine.transactionCoordinator.begin(sessionId);
    assert.equal(tx.success, true);

    const lockRes = await cluster.node1.engine.executeQuery(
      'SELECT id, balance FROM accounts WHERE id = 1 FOR UPDATE',
      [],
      {sessionId},
    );
    assert.equal(lockRes.success, true, lockRes.error);
    const replicated = await cluster.group.waitFor(
      () => countDbReservations(r1.db) === 1 &&
        countDbReservations(r2.db) === 1 &&
        countDbReservations(r3.db) === 1,
    );
    assert.equal(replicated, true, 'durable reservation must replicate to r1/r2/r3');

    // 4a. Write-error cleanup inside an explicit transaction MUST NOT release explicit tx reservations
    // (neither memory nor co-located durable SQLite rows).
    const origExecutePlan = cluster.node1.engine.distributedWriteCoordinator.executePlan.bind(
      cluster.node1.engine.distributedWriteCoordinator,
    );
    cluster.node1.engine.distributedWriteCoordinator.executePlan = async () => {
      throw new Error('simulated transient write execution failure');
    };
    let writeErrRes = null;
    try {
      writeErrRes = await cluster.node1.engine.executeQuery(
        'UPDATE accounts SET balance = 250 WHERE id = 1',
        [],
        {sessionId},
      );
    } finally {
      cluster.node1.engine.distributedWriteCoordinator.executePlan = origExecutePlan;
    }
    assert.equal(writeErrRes?.success, false, 'simulated write execution failure must return error');
    assert.match(String(writeErrRes?.error || ''), /simulated transient write execution failure/u);
    assert.ok(
      cluster.node1.engine.transactionCoordinator.getTransaction(sessionId),
      'explicit transaction must remain active after non-rollback write exception',
    );
    assert.equal(
      countDbReservations(r1.db),
      1,
      'write-error cleanup must not erase explicit transaction durable reservation on co-located DB',
    );
    assert.equal(countDbReservations(r2.db), 1);
    assert.equal(countDbReservations(r3.db), 1);

    // 4b. Unscoped release helpers MUST clear only local memory and NEVER iterate PARTITION_DBS.
    releaseTransactionReservations(tx.transactionId);
    releaseSessionReservations(sessionId);
    assert.equal(
      getTransactionReservations(tx.transactionId).length,
      0,
      'unscoped helper clears local gateway memory mirror only',
    );
    assert.equal(
      countDbReservations(r1.db),
      1,
      'unscoped helper must never delete durable reservation rows out-of-log',
    );
    assert.equal(countDbReservations(r2.db), 1);
    assert.equal(countDbReservations(r3.db), 1);

    // 4c. Lost settlement reply followed by gateway shutdown (SQLQueryEngine.shutdown ->
    // releasePendingReservations) MUST NOT erase unresolved durable reservations on r1.db.
    const coord = cluster.node1.engine.transactionCoordinator;
    const origRollbackParticipant = coord.rollbackParticipant.bind(coord);
    const origMaxRetries = coord.participantRetryMaxRetries;
    coord.participantRetryMaxRetries = 0;
    coord.rollbackParticipant = async () => {
      throw new Error('simulated lost participant settlement reply');
    };
    let lostRollbackRes = null;
    try {
      lostRollbackRes = await coord.rollback(sessionId);
    } finally {
      coord.rollbackParticipant = origRollbackParticipant;
      coord.participantRetryMaxRetries = origMaxRetries;
    }
    assert.equal(lostRollbackRes.success, false, 'lost settlement reply must leave rollback unsettled');
    assert.equal(
      countDbReservations(r1.db),
      1,
      'lost settlement reply must preserve unresolved durable reservation on co-located DB',
    );

    await cluster.pg1.stop();
    await cluster.node1.engine.shutdown();
    assert.equal(
      countDbReservations(r1.db),
      1,
      'gateway shutdown / releasePendingReservations must not delete unresolved durable reservation',
    );
    assert.equal(countDbReservations(r2.db), 1);
    assert.equal(countDbReservations(r3.db), 1);

    // Competing writer on Node 2 MUST STILL be blocked with 55P03 while reservation is unresolved!
    await clientB.query('BEGIN');
    await expectSqlState(
      clientB,
      'UPDATE accounts SET balance = 999 WHERE id = 1',
      [],
      LOCK_NOT_AVAILABLE_SQLSTATE,
    );
    await clientB.query('ROLLBACK');

    // 4d. Canonical replicated participant release settles the survived reservation cleanly across all replicas.
    const canonicalRelease = await requestLockingReadReservation(r1, {
      op: 'RELEASE_TRANSACTION',
      transactionId: tx.transactionId,
      sessionId,
      participantId: `${tx.transactionId}:${ACCOUNTS_PARTITION_ID}`,
    });
    assert.equal(canonicalRelease.success, true, canonicalRelease.error);
    const settledRelease = await cluster.group.waitFor(
      () => countDbReservations(r1.db) === 0 &&
        countDbReservations(r2.db) === 0 &&
        countDbReservations(r3.db) === 0,
    );
    assert.equal(settledRelease, true, 'canonical participant release must clear lock across r1/r2/r3');

    // Now successor write on Node 2 succeeds and commits cleanly.
    await clientB.query('BEGIN');
    await clientB.query('UPDATE accounts SET balance = 420 WHERE id = 1');
    await clientB.query('COMMIT');
    const verify = await clientB.query('SELECT balance FROM accounts WHERE id = 1');
    assertNumericRowValues(verify.rows, [{balance: 420}]);
  } finally {
    await clientB.end().catch(() => {});
    await cluster.cleanup();
  }
});
