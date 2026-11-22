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
import pg from 'pg';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  acquireRowReservation,
  clearAllReservations,
  clearMemoryReservations,
  getTransactionReservations,
  hasLockingReadReservations,
  registerPartitionDatabase,
  releaseTransactionReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {PostgresWireRuntimeModule} from '../../src/runtime/pgwire-runtime-module.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {answerParticipantTransactionRequest} from '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from '../test-helpers/transaction-persistence-gateway.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';

const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

const ACCOUNTS_TABLE = 'accounts';
const ACCOUNTS_PARTITION_ID = 'accounts-p1';
const ACCOUNTS_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'balance', type: 'INTEGER', nullable: false},
    {name: 'tier', type: 'TEXT', nullable: false},
  ],
});
const GROUP_BUDGET_MS = 20000;
const RAFT_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const PG_HOST = '127.0.0.1';
const PG_USER = 'postgres';
const PG_DATABASE = 'lagrange';
const LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';

function initEnvironment(nodeId = 'locking-node-1') {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: nodeId},
    raft: RAFT_TIMING,
  });
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function createAccountsTableRow(leaderNodeId = 'node-1') {
  return {
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    active_partition_version: 1,
    schema: JSON.stringify(ACCOUNTS_SCHEMA),
    partition_key: 'id',
    partition_key_type: 'INTEGER',
    primary_key: 'id',
    leader_node_id: leaderNodeId,
  };
}

function createAccountsPartitionRow(replicaCount, leaderNodeId = 'node-1') {
  return {
    partition_id: ACCOUNTS_PARTITION_ID,
    table_id: ACCOUNTS_TABLE,
    table_name: ACCOUNTS_TABLE,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
    replica_count: replicaCount,
    leader_node_id: leaderNodeId,
  };
}

function buildServiceRows(group, members, leaderReplicaId) {
  return members.map(([replicaId, nodeId]) => ({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: ACCOUNTS_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: group.addressOf([replicaId, nodeId]),
    raft_role: replicaId === leaderReplicaId ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
  }));
}

function buildNodeCache(group, members, leaderMember) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    TABLES.TABLES,
    CDC_OPERATION.INSERT,
    createAccountsTableRow(leaderMember[1]),
  );
  cache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDC_OPERATION.INSERT,
    createAccountsPartitionRow(members.length, leaderMember[1]),
  );
  for (const row of buildServiceRows(group, members, leaderMember[0])) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  }
  return cache;
}

async function seedAccountsData(engine) {
  const inserts = [
    [1, 100, 'gold'],
    [2, 200, 'silver'],
    [3, 300, 'gold'],
  ];
  for (const [id, balance, tier] of inserts) {
    const res = await engine.executeQuery(
      'INSERT INTO accounts (id, balance, tier) VALUES (?, ?, ?)',
      [id, balance, tier],
    );
    assert.equal(res.success, true, `seed row ${id} failed: ${res.error}`);
  }
  const leaderService = engine.partitionServicesProvider?.()?.values()?.next()?.value;
  if (leaderService?.db) {
    for (const service of [leaderService]) {
      service.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
    }
  }
}

async function startPgWireNode(engine) {
  const runtime = new PostgresWireRuntimeModule({logger: QUIET_LOGGER});
  const prepared = await runtime.prepare({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: PG_HOST,
      authMode: 'trust',
      tlsMode: 'disable',
    }),
  });
  assert.equal(prepared.status, 'ready');
  const started = await runtime.start({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    host: PG_HOST,
    port: 0,
    sqlRequestExecutor: (sqlRequest, opts) => engine.executeRequest(sqlRequest, opts),
  });
  assert.equal(started.status, 'running');
  return {
    runtime,
    port: started.endpointIntent.port,
    async connectClient() {
      const client = new pg.Client({
        host: PG_HOST,
        port: started.endpointIntent.port,
        user: PG_USER,
        database: PG_DATABASE,
      });
      await client.connect();
      return client;
    },
    async stop() {
      await runtime.stop({serviceId: META_SERVICE_ID.POSTGRES_WIRE});
    },
  };
}

async function setupTwoNodeCluster(options = {}) {
  clearAllReservations();
  initEnvironment('node-1');
  const members = [
    [`${ACCOUNTS_PARTITION_ID}-r1`, 'node-1'],
    [`${ACCOUNTS_PARTITION_ID}-r2`, 'node-2'],
    [`${ACCOUNTS_PARTITION_ID}-r3`, 'node-3'],
  ];
  const group = await formAdmittedGroup({
    partitionId: ACCOUNTS_PARTITION_ID,
    members,
    tempPrefix: options.tempPrefix || 'lock-auth-cluster-',
    budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {
      tableId: ACCOUNTS_TABLE,
      tableName: ACCOUNTS_TABLE,
      schema: ACCOUNTS_SCHEMA,
      concurrencyGranularity:
        options.concurrencyGranularity || PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY,
    },
  });
  const releaseOwners = await attachPartitionReleaseOwners(group.services, {
    directory: path.dirname(group.dbFileOf(members[0])),
    budgetMs: GROUP_BUDGET_MS,
  });
  for (const sysTable of [TABLES.PARTITIONS, TABLES.SERVICES]) {
    const rows = group.services[0].systemTableCache.getAll(sysTable) || [];
    for (const row of rows) {
      if (row.partition_id === releaseOwners.control.partitionId ||
          row.service_id === releaseOwners.control.replicaId) {
        for (const svc of group.services.slice(1)) {
          svc.systemTableCache.applySystemTableChange(sysTable, CDC_OPERATION.INSERT, row);
        }
      }
    }
  }
  await releaseOwners.release(ACCOUNTS_PARTITION_ID);

  for (const svc of group.services) {
    svc.systemTableCache.applySystemTableChange(
      TABLES.TABLES,
      CDC_OPERATION.INSERT,
      createAccountsTableRow(members[0][1]),
    );
    svc.db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier)');
  }

  const gateway = createTransactionPersistenceGateway();
  const makeNodeEngine = (memberIndex) => {
    const member = members[memberIndex];
    const localService = group.services[memberIndex];
    const cache = buildNodeCache(group, members, members[0]);
    const localMap = new Map([[localService.replicaId, localService]]);
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: cache,
      messageRouter: group.services[0].transport,
      controlPlaneSystemTableGateway: gateway,
      partitionServicesProvider: () => localMap,
      nodeId: member[1],
      autoStartDistributedTransactionRecovery: false,
      migrationAutoWire: false,
      unrefRetryDelayTimers: true,
    });
    return {engine, cache, localService, member};
  };

  const node1 = makeNodeEngine(0);
  const node2 = makeNodeEngine(1);
  node2.engine.queryExecutor.setBootstrapTopologySnapshotOwner({
    resolveCanonicalPartitionLeaderNodeId: (pid) =>
      pid === releaseOwners.control.partitionId ? members[0][1] : null,
  });
  group.services[1].sqlQueryEngine = node2.engine;
  await seedAccountsData(node1.engine);

  const pg1 = await startPgWireNode(node1.engine);
  const pg2 = await startPgWireNode(node2.engine);

  return {
    group,
    members,
    releaseOwners,
    gateway,
    node1,
    node2,
    pg1,
    pg2,
    leader: () =>
      group.services.find(
        (svc) => svc.raft?.readStatus?.().role === RAFT_ROLE.LEADER,
      ) ?? null,
    updateLeaderRouting(newLeaderMember) {
      for (const node of [node1, node2]) {
        for (const row of buildServiceRows(group, members, newLeaderMember[0])) {
          node.cache.applySystemTableChange(
            TABLES.SERVICES,
            CDC_OPERATION.UPDATE,
            row,
          );
        }
      }
    },
    async cleanup() {
      await pg1.stop().catch(() => {});
      await pg2.stop().catch(() => {});
      await node1.engine.shutdown().catch(() => {});
      await node2.engine.shutdown().catch(() => {});
      await releaseOwners.dispose().catch(() => {});
      await group.dispose().catch(() => {});
      gateway.db.close();
      clearAllReservations();
    },
  };
}

async function expectSqlState(client, sql, params, expectedSqlState) {
  let caught = null;
  try {
    await client.query(sql, params);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `Expected SQLSTATE ${expectedSqlState} for "${sql}", but it succeeded`);
  assert.equal(
    caught.code,
    expectedSqlState,
    `Expected SQLSTATE ${expectedSqlState} for "${sql}", got ${caught.code}: ${caught.message}`,
  );
  return caught;
}

function countDbReservations(db, tableName = ACCOUNTS_TABLE) {
  const exists = db
    .prepare(
      'SELECT 1 AS ok FROM sqlite_master WHERE type = \'table\' AND name = ?',
    )
    .get('_lagrange_locking_read_reservations');
  if (!exists) return 0;
  const row = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM _lagrange_locking_read_reservations WHERE table_name = ?',
    )
    .get(tableName);
  return Number(row?.cnt || 0);
}

function assertNumericRowValues(rows, expectedRows) {
  assert.equal(rows.length, expectedRows.length);
  for (let i = 0; i < expectedRows.length; i += 1) {
    const actual = rows[i];
    const expected = expectedRows[i];
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) {
      assert.equal(Number(actual[k]), v, `Mismatch on column ${k}`);
    }
  }
}

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
