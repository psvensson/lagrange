/**
 * Production integration tests for Global Secondary Index TX1 real-participant
 * transactional maintenance, dynamic index-partition provisioning, distributed
 * execution without local DB handles, and cross-engine catalog propagation.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
} from '../../src/index-management/global-index-read-router.js';
import {
  buildIndexDatasetSchema,
} from '../../src/index-management/global-index-dataset-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {seedRealSystemTableCache} from './global-index-founding-witness-support.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  createSeededSchemaAwareGateway,
} from './global-index-founding-witness-support.js';
import {
  withIndependentCacheCdcEnvironment,
} from './global-index-cdc-witness-support.js';
import {
  withLaggingFollowerEnvironment,
} from './global-index-lagging-follower-witness-support.js';

const USERS_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'email', type: 'TEXT'},
    {name: 'name', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
  ],
};

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function resolveTargetPartition(partitionServicesMap, address) {
  const parts = address.split('/');
  const targetId = parts[1] === 'partition' ? parts[2] : parts[1];
  const direct = partitionServicesMap.get(targetId);
  if (direct) return direct;
  for (const svc of partitionServicesMap.values()) {
    if (svc.partitionId === targetId || svc.replicaId === targetId) {
      return svc;
    }
  }
  return null;
}

function createStrictRealMessageRouter(partitionServicesMap) {
  return {
    async deliver(address, message) {
      const partition = resolveTargetPartition(partitionServicesMap, address);
      if (!partition) {
        return buildDeliveryEnvelope(
          {acknowledged: false, error: `Participant unavailable: ${address}`},
          {success: false, error: `Participant unavailable: ${address}`},
        );
      }
      const response = await partition.handleApplicationMessage(message);
      return buildDeliveryEnvelope({acknowledged: true}, response);
    },
  };
}

async function createRealPartition(dir, {partitionId, tableName, keyRange, schema, systemCache}) {
  const dbPath = path.join(dir, `${partitionId}.db`);
  const ps = new PartitionService(withFoundingStamp({
    partitionId,
    tableId: tableName,
    tableName,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'test-node',
    systemTableCache: systemCache || {getAll: () => [], get: () => null, filter: () => []},
    dbPath,
    keyRange,
    schema,
  }));
  await ps.initialize();
  ps.startElection();
  await turnChainValue(ps.raft.campaign());
  await waitForCondition(() => ps.role === 'leader', 2000, 5);
  if (schema) {
    await resumeFixtureParticipantAdmission(ps);
  }
  return ps;
}

function buildStrictUsersAndIndexDefs(includeIndexPartitions) {
  const tables = [
    {
      table_id: 'users',
      table_name: 'users',
      partition_key: 'id',
      primaryKey: ['id'],
      partition_key_type: 'INTEGER',
      active_partition_version: 1,
      schema: USERS_SCHEMA,
    },
  ];
  const basePartitions = [
    {
      partition_id: 'users_p0',
      table_id: 'users',
      table_name: 'users',
      partition_key: 'id',
      partition_key_start: null,
      partition_key_end: 100,
      partition_key_type: 'INTEGER',
    },
    {
      partition_id: 'users_p1',
      table_id: 'users',
      table_name: 'users',
      partition_key: 'id',
      partition_key_start: 100,
      partition_key_end: null,
      partition_key_type: 'INTEGER',
    },
  ];
  const indexPartitions = includeIndexPartitions ?
    [
      {
        partition_id: '__gsi_users_idx_users_email_p0',
        table_id: '__idx_users_idx_users_email',
        table_name: '__idx_users_idx_users_email',
        partition_key: 'email',
        partition_key_start: null,
        partition_key_end: 'm',
        partition_key_type: 'TEXT',
      },
      {
        partition_id: '__gsi_users_idx_users_email_p1',
        table_id: '__idx_users_idx_users_email',
        table_name: '__idx_users_idx_users_email',
        partition_key: 'email',
        partition_key_start: 'm',
        partition_key_end: null,
        partition_key_type: 'TEXT',
      },
    ] :
    [];
  return {tables, partitions: [...basePartitions, ...indexPartitions]};
}


function createOracleUsersDb() {
  const oracleDb = new Database(':memory:');
  oracleDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT,
      name TEXT,
      status TEXT
    )
  `);
  return oracleDb;
}

function seedUsers(env, rows) {
  const sql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
  const oracleStmt = env.oracleDb.prepare(sql);
  const p0Stmt = env.usersP0.db.prepare(sql);
  const p1Stmt = env.usersP1.db.prepare(sql);
  for (const row of rows) {
    oracleStmt.run(row.id, row.email, row.name, row.status);
    const targetStmt = row.id < 100 ? p0Stmt : p1Stmt;
    targetStmt.run(row.id, row.email, row.name, row.status);
  }
}

function teardownClusterResources(t, partitionServices, oracleDb, gateway, tmpDir) {
  t.teardown(async () => {
    for (const ps of partitionServices.values()) {
      await ps.shutdown().catch(() => {});
    }
    oracleDb.close();
    gateway.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });
}

async function setupStrictCluster(t, options = {}) {
  const includeIndexPartitions = options.includeIndexPartitions !== false;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-gsi-strict-'));
  const {tables, partitions} = buildStrictUsersAndIndexDefs(includeIndexPartitions);
  const oracleDb = createOracleUsersDb();
  const catalogDbPath = path.join(tmpDir, 'catalog.db');
  const systemCache = seedRealSystemTableCache(tables, partitions);
  const {gateway, cdcService} = createSeededSchemaAwareGateway(
    catalogDbPath,
    tables,
    partitions,
    systemCache,
  );

  const usersP0 = await createRealPartition(tmpDir, {
    partitionId: 'users_p0',
    tableName: 'users',
    keyRange: {start: null, end: 100},
    schema: USERS_SCHEMA,
    systemCache,
  });
  const usersP1 = await createRealPartition(tmpDir, {
    partitionId: 'users_p1',
    tableName: 'users',
    keyRange: {start: 100, end: null},
    schema: USERS_SCHEMA,
    systemCache,
  });
  const partitionServices = new Map([
    ['users_p0-r1', usersP0],
    ['users_p1-r1', usersP1],
  ]);

  let idxP0 = null;
  let idxP1 = null;
  if (includeIndexPartitions) {
    const idxSchema = buildIndexDatasetSchema({
      tableName: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      basePrimaryKeyColumns: ['id'],
      columnTypes: {id: 'INTEGER', email: 'TEXT'},
    });
    idxP0 = await createRealPartition(tmpDir, {
      partitionId: '__gsi_users_idx_users_email_p0',
      tableName: '__idx_users_idx_users_email',
      keyRange: {start: null, end: 'm'},
      schema: idxSchema,
      systemCache,
    });
    idxP1 = await createRealPartition(tmpDir, {
      partitionId: '__gsi_users_idx_users_email_p1',
      tableName: '__idx_users_idx_users_email',
      keyRange: {start: 'm', end: null},
      schema: idxSchema,
      systemCache,
    });
    partitionServices.set('__gsi_users_idx_users_email_p0-r1', idxP0);
    partitionServices.set('__gsi_users_idx_users_email_p1-r1', idxP1);
  }

  const messageRouter = createStrictRealMessageRouter(partitionServices);

  const provisioner = async (ctx) => {
    const ps = await createRealPartition(tmpDir, {
      partitionId: ctx.partitionId,
      tableName: ctx.tableName,
      keyRange: ctx.keyRange || {start: null, end: null},
      schema: ctx.schema,
      systemCache,
    });
    partitionServices.set(ps.replicaId, ps);
    const partRow = ctx.partitionMetadata || {
      partition_id: ctx.partitionId,
      table_id: ctx.tableId || ctx.tableName,
      table_name: ctx.tableName,
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'TEXT',
      leader_node_id: 'test-node',
    };
    await gateway.insertSystemTableRow(TABLES.PARTITIONS, partRow);
    systemCache.applySystemTableChange(TABLES.PARTITIONS, CACHE_CDC_OPERATIONS.INSERT, partRow);
    systemCache.applySystemTableChange(TABLES.SERVICES, CACHE_CDC_OPERATIONS.INSERT, {
      service_id: ps.replicaId,
      service_type: 'partition',
      partition_id: ctx.partitionId,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${ctx.partitionId}`,
      status: 'active',
    });
    return {
      partitionId: ctx.partitionId,
      replicaIds: [ps.replicaId],
    };
  };

  const createStrictEngine = async ({attachProvisioner = false} = {}) => {
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter,
      cdcIntegrationService: cdcService,
      controlPlaneSystemTableGateway: gateway,
      ...(attachProvisioner ? {tablePartitionProvisioner: provisioner} : {}),
    });
    engine.queryExecutor.leaderRetryDelayMs = 5;
    engine.queryExecutor.queryTimeoutMs = 1500;
    await engine.indexService.initialize();
    return engine;
  };

  teardownClusterResources(t, partitionServices, oracleDb, gateway, tmpDir);
  return {
    tmpDir,
    usersP0,
    usersP1,
    idxP0,
    idxP1,
    partitionServices,
    oracleDb,
    gateway,
    cdcService,
    systemCache,
    createStrictEngine,
  };
}

test('TX1 real-participant isolation, rollback atomicity, and unavailable participant refusal', async (t) => {
  const env = await setupStrictCluster(t, {includeIndexPartitions: true});
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
    {id: 110, email: 'bob@example.com', name: 'Bob', status: 'pending'},
  ]);

  const engine = await env.createStrictEngine();
  const createRes = await engine.executeQuery(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );
  t.equal(
    createRes.success,
    true,
    `CREATE GLOBAL INDEX succeeds on strict cluster: ${JSON.stringify(createRes)}`,
  );

  const selectByEmailSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';

  // 1. Explicit BEGIN -> INSERT -> uncommitted isolation -> COMMIT
  const begin1 = await engine.executeQuery('BEGIN', [], {sessionId: 'tx1-s1'});
  t.equal(begin1.success, true, 'BEGIN tx1-s1 succeeds');

  const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
  const insertParams = [35, 'lara@example.com', 'Lara', 'active'];
  const stagedInsert = await engine.executeQuery(insertSql, insertParams, {
    sessionId: 'tx1-s1',
  });
  t.equal(
    stagedInsert.success,
    true,
    `Staged TX1 INSERT succeeds: ${JSON.stringify(stagedInsert)}`,
  );

  // Outside reader must NOT see uncommitted base or index row
  t.notOk(
    env.idxP0.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(35),
    'Index partition p0 has NO committed entry before TX1 COMMIT',
  );
  const outsideBeforeCommit = await engine.executeQuery(
    selectByEmailSql,
    ['lara@example.com'],
    {sessionId: 'outside-reader'},
  );
  t.equal(outsideBeforeCommit.success, true);
  t.same(outsideBeforeCommit.rows, [], 'Outside reader sees 0 rows before COMMIT');

  // Same-session read sees staged write via participant replay
  const sameSessionRead = await engine.executeQuery(
    'SELECT * FROM users WHERE id = ?',
    [35],
    {sessionId: 'tx1-s1'},
  );
  t.equal(sameSessionRead.success, true);
  t.equal(sameSessionRead.rows.length, 1, 'Same-session TX1 reader sees uncommitted INSERT');

  const commit1 = await engine.executeQuery('COMMIT', [], {sessionId: 'tx1-s1'});
  t.equal(commit1.success, true, 'TX1 COMMIT succeeds atomically across base and index');
  env.oracleDb.prepare(insertSql).run(...insertParams);

  const outsideAfterCommit = await engine.executeQuery(
    selectByEmailSql,
    ['lara@example.com'],
    {sessionId: 'outside-reader'},
  );
  t.equal(outsideAfterCommit.success, true);
  t.equal(
    outsideAfterCommit.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
    'Outside SELECT after COMMIT engages GLOBAL_SECONDARY_INDEX',
  );
  t.same(
    outsideAfterCommit.rows,
    env.oracleDb.prepare(selectByEmailSql).all('lara@example.com'),
    'Outside SELECT after COMMIT matches oracle',
  );

  // 2. Explicit BEGIN -> DELETE -> ROLLBACK preserves base and index atomically
  t.equal((await engine.executeQuery('BEGIN', [], {sessionId: 'tx1-s2'})).success, true);
  const stagedDelete = await engine.executeQuery(
    'DELETE FROM users WHERE id = ?',
    [35],
    {sessionId: 'tx1-s2'},
  );
  t.equal(stagedDelete.success, true, 'Staged TX1 DELETE succeeds');
  t.ok(
    env.idxP0.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(35),
    'Index partition p0 retains entry while TX1 DELETE is uncommitted',
  );
  t.equal((await engine.executeQuery('ROLLBACK', [], {sessionId: 'tx1-s2'})).success, true);

  const afterDeleteRollback = await engine.executeQuery(
    selectByEmailSql,
    ['lara@example.com'],
    {sessionId: 'outside-reader'},
  );
  t.equal(
    afterDeleteRollback.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
  );
  t.same(
    afterDeleteRollback.rows,
    env.oracleDb.prepare(selectByEmailSql).all('lara@example.com'),
    'ROLLBACK after DELETE preserves both base and global index rows',
  );

  // 3. Explicit BEGIN -> UPDATE across index partitions -> ROLLBACK preserves original entry
  t.equal((await engine.executeQuery('BEGIN', [], {sessionId: 'tx1-s3'})).success, true);
  const stagedUpdate = await engine.executeQuery(
    'UPDATE users SET email = ? WHERE id = ?',
    ['wendy@example.com', 35],
    {sessionId: 'tx1-s3'},
  );
  t.equal(stagedUpdate.success, true, 'Staged TX1 cross-partition UPDATE succeeds');
  t.equal((await engine.executeQuery('ROLLBACK', [], {sessionId: 'tx1-s3'})).success, true);

  t.notOk(
    env.idxP1.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(35),
    'ROLLBACK after UPDATE leaves no orphan entry in target index partition p1',
  );
  const afterUpdateRollback = await engine.executeQuery(
    selectByEmailSql,
    ['lara@example.com'],
    {sessionId: 'outside-reader'},
  );
  t.same(
    afterUpdateRollback.rows,
    env.oracleDb.prepare(selectByEmailSql).all('lara@example.com'),
    'ROLLBACK after UPDATE preserves original indexed row',
  );

  // 4. Autocommit unavailable index participant fails closed via TX1 without partial base write
  env.partitionServices.delete('__gsi_users_idx_users_email_p1-r1');
  env.systemCache.applySystemTableChange(
    TABLES.SERVICES,
    CACHE_CDC_OPERATIONS.DELETE,
    {service_id: '__gsi_users_idx_users_email_p1'},
  );
  const blockedRes = await engine.executeQuery(
    insertSql,
    [130, 'xavier@example.com', 'Xavier', 'active'],
    {timeoutMs: 300},
  );
  t.equal(blockedRes.success, false, 'INSERT refuses atomically when index participant is unavailable');
  t.notOk(
    env.usersP1.db.prepare('SELECT * FROM users WHERE id = ?').get(130),
    'Base partition has NO partial row on TX1 index participant refusal',
  );

  await engine.shutdown();
});

test('Shared-cache peer engine sees dynamic index provisioning and executes distributed queries (2C shared-cache component witness)', async (t) => {
  const env = await setupStrictCluster(t, {includeIndexPartitions: false});
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
    {id: 120, email: 'zoe@example.com', name: 'Zoe', status: 'pending'},
  ]);

  // Both engines have NO partitionServicesProvider / partitionDatabases (distributed-only)
  const engineA = await env.createStrictEngine({attachProvisioner: true});
  const engineB = await env.createStrictEngine({attachProvisioner: false});
  t.equal(
    engineA.systemCache,
    engineB.systemCache,
    'Shared-cache component witness explicitly shares one SystemTableCache instance across engines',
  );

  // 1. engineA creates global index with zero pre-created index partitions
  const createRes = await engineA.executeQuery(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );
  t.equal(
    createRes.success,
    true,
    `CREATE GLOBAL INDEX dynamically provisions index partitions: ${JSON.stringify(createRes)}`,
  );

  const provisionedIndexPartitions = env.systemCache
    .getAll(TABLES.PARTITIONS)
    .filter((p) => p.table_name === '__idx_users_idx_users_email');
  t.ok(provisionedIndexPartitions.length >= 1, 'Index partition registered in SystemTableCache');

  // 2. engineB (already running) observes the new READ_WRITE global index via SystemTableCache
  const selectSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';
  const selectOnB = await engineB.executeQuery(selectSql, ['zoe@example.com']);
  t.equal(selectOnB.success, true, 'Peer running engineB executes GSI query');
  t.equal(
    selectOnB.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
    'Peer running engineB engages GLOBAL_SECONDARY_INDEX without restart',
  );
  t.same(
    selectOnB.rows,
    env.oracleDb.prepare(selectSql).all('zoe@example.com'),
    'Peer running engineB matches oracle over distributed read router',
  );

  // 3. Peer engineB INSERTs via TX1 distributed execution, visible via GSI on engineA
  const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
  const ninaParams = [45, 'nina@example.com', 'Nina', 'active'];
  env.oracleDb.prepare(insertSql).run(...ninaParams);
  const insertOnB = await engineB.executeQuery(insertSql, ninaParams);
  t.equal(insertOnB.success, true, 'Peer engineB maintains provisioned GSI partition via TX1');

  const selectOnA = await engineA.executeQuery(selectSql, ['nina@example.com']);
  t.equal(selectOnA.success, true);
  t.equal(
    selectOnA.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
    'engineA reads peer-inserted row via GLOBAL_SECONDARY_INDEX',
  );
  t.same(
    selectOnA.rows,
    env.oracleDb.prepare(selectSql).all('nina@example.com'),
    'engineA GSI read matches oracle after peer INSERT',
  );

  await engineB.shutdown();
  await engineA.shutdown();
});

test('Hosted lagging follower replica routes GSI SELECT and backfill writes authoritatively and fails closed without leader (2B)', async (t) => {
  await withLaggingFollowerEnvironment(async ({
    oracleDb,
    usersGroup,
    idxGroup,
    engineLeader,
    engineFollower,
    setFollowerUsersLag,
    setFollowerIdxLag,
    setLeaderDown,
  }) => {
    const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
    oracleDb.prepare(insertSql).run(1, 'alice@example.com', 'AliceOne', 'active');
    const row1Res = await engineLeader.executeQuery(
      insertSql,
      [1, 'alice@example.com', 'AliceOne', 'active'],
    );
    t.equal(row1Res.success, true, 'Row 1 committed on replicated base group');

    await waitForCondition(
      () => usersGroup.services[1].db.prepare('SELECT id FROM users WHERE id = 1').get() != null,
      3000,
      20,
    );

    // Pause Raft APPEND to node-follower's users_p0 replica so node-follower holds stale rows
    // while leader+witness commit row 2.
    setFollowerUsersLag(true);
    oracleDb.prepare(insertSql).run(2, 'alice@example.com', 'AliceTwo', 'active');
    const row2Res = await engineLeader.executeQuery(
      insertSql,
      [2, 'alice@example.com', 'AliceTwo', 'active'],
    );
    t.equal(row2Res.success, true, 'Row 2 committed with quorum on leader+witness');
    t.equal(
      usersGroup.services[1].db.prepare('SELECT id FROM users').all().length,
      1,
      'Hosted follower base replica genuinely lags with only 1 row',
    );
    t.equal(usersGroup.services[1].role, 'follower', 'Hosted base replica is a follower');

    // Trigger backfill FROM engineFollower (which locally hosts follower replicas in
    // partitionServicesProvider). Both base reads AND index backfill writes must route
    // through authoritative partition owners and replicate across Raft to all replicas.
    const createRes = await engineFollower.executeQuery(
      'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    );
    t.equal(createRes.success, true, 'CREATE GLOBAL INDEX succeeds from follower-hosting node');

    await waitForCondition(
      () => idxGroup.services[1].db
        .prepare('SELECT __base_pk_id FROM __idx_users_idx_users_email').all().length === 2,
      3000,
      20,
    );

    const leaderIdxRows = idxGroup.services[0].db.prepare(
      'SELECT __base_pk_id, email FROM __idx_users_idx_users_email ORDER BY __base_pk_id ASC',
    ).all();
    const followerIdxRows = idxGroup.services[1].db.prepare(
      'SELECT __base_pk_id, email FROM __idx_users_idx_users_email ORDER BY __base_pk_id ASC',
    ).all();
    const witnessIdxRows = idxGroup.services[2].db.prepare(
      'SELECT __base_pk_id, email FROM __idx_users_idx_users_email ORDER BY __base_pk_id ASC',
    ).all();

    t.same(
      leaderIdxRows.map((r) => r.__base_pk_id),
      [1, 2],
      'Backfill replicated both base rows to authoritative index leader replica',
    );
    t.same(
      witnessIdxRows.map((r) => r.__base_pk_id),
      [1, 2],
      'Backfill replicated both base rows via Raft to witness index replica',
    );
    t.same(
      followerIdxRows.map((r) => r.__base_pk_id),
      [1, 2],
      'Backfill replicated both base rows via Raft to follower index replica',
    );

    // Pause Raft APPEND to node-follower on BOTH base and index groups, then insert row 3
    // via TX1 on engineLeader so hosted follower replica has stale index & base SQLite state.
    setFollowerIdxLag(true);
    oracleDb.prepare(insertSql).run(3, 'alice@example.com', 'AliceThree', 'active');
    const row3Res = await engineLeader.executeQuery(
      insertSql,
      [3, 'alice@example.com', 'AliceThree', 'active'],
    );
    t.equal(row3Res.success, true, 'Row 3 committed via TX1 while follower lags');
    t.equal(
      idxGroup.services[1].db.prepare('SELECT __base_pk_id FROM __idx_users_idx_users_email')
        .all().length,
      2,
      'Hosted follower index replica genuinely lags behind authoritative leader (2 vs 3 rows)',
    );

    const selectSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';
    const selectRes = await engineFollower.executeQuery(selectSql, ['alice@example.com']);
    t.equal(selectRes.success, true, 'GSI SELECT from follower-hosting node succeeds');
    t.equal(
      selectRes.globalIndexPlan?.accessPath,
      GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
      'GSI SELECT engages GLOBAL_SECONDARY_INDEX',
    );
    t.same(
      selectRes.rows,
      oracleDb.prepare(selectSql).all('alice@example.com'),
      'GSI SELECT must read from authoritative leader, not hosted lagging follower',
    );

    // Make authoritative leader unavailable while hosted lagging follower stays alive locally:
    // GSI SELECT must fail closed with typed unavailability instead of returning stale follower rows.
    setLeaderDown(true);
    const unavailableRes = await engineFollower.executeQuery(selectSql, ['alice@example.com']);
    t.equal(
      unavailableRes.success,
      false,
      'GSI SELECT fails closed instead of reading hosted lagging follower when leader unavailable',
    );
    t.ok(
      unavailableRes.errorCode || unavailableRes.error,
      'Unavailable authoritative read surfaces typed failure details',
    );
  });
});

test('Independent peer SystemTableCache instances propagate GSI catalog, table, partition, and drop changes via real CDC (2C)', async (t) => {
  await withIndependentCacheCdcEnvironment(async ({
    cacheA,
    cacheB,
    engineA,
    engineB,
    oracleDb,
    propagatedCdcEvents,
  }) => {
    t.not(
      cacheA,
      cacheB,
      'node-a and node-b hold distinct SystemTableCache instances',
    );
    t.not(
      engineA.systemCache,
      engineB.systemCache,
      'engineA and engineB do not share a SystemTableCache instance',
    );

    const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
    oracleDb.prepare(insertSql).run(10, 'alice@example.com', 'Alice', 'active');
    oracleDb.prepare(insertSql).run(120, 'zoe@example.com', 'Zoe', 'pending');
    t.equal((await engineA.executeQuery(insertSql, [10, 'alice@example.com', 'Alice', 'active'])).success, true);
    t.equal((await engineA.executeQuery(insertSql, [120, 'zoe@example.com', 'Zoe', 'pending'])).success, true);

    t.same(
      cacheB.getAll(TABLES.INDICES),
      [],
      'Peer cacheB starts with zero global index catalog entries before CREATE GLOBAL INDEX',
    );

    const createRes = await engineA.executeQuery(
      'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    );
    t.equal(createRes.success, true, 'engineA creates fresh global index over real CDC-backed gateway');

    t.equal(
      await waitForCondition(() => {
        const idx = cacheB.get(TABLES.INDICES, 'idx_users_email-gen1') ||
          cacheB.getAll(TABLES.INDICES).find((r) => r.index_name === 'idx_users_email');
        const part = cacheB.get(TABLES.PARTITIONS, '__gsi_users_idx_users_email_p0');
        return Boolean(
          idx &&
          idx.state === 'READ_WRITE' &&
          part &&
          part.leader_node_id === 'node-a' &&
          cacheB.get(TABLES.TABLES, '__idx_users_idx_users_email') &&
          cacheB.get(TABLES.SERVICES, '__gsi_users_idx_users_email_p0-r1'),
        );
      }, 3000, 10),
      true,
      'cacheB converges to READ_WRITE index, table, partition leader, and service via real CDC',
    );

    const cdcTablesObserved = new Set(propagatedCdcEvents.map((evt) => evt.tableName));
    t.ok(cdcTablesObserved.has(TABLES.INDICES), 'Real CDC events propagated for TABLES.INDICES');
    t.ok(cdcTablesObserved.has(TABLES.TABLES), 'Real CDC events propagated for TABLES.TABLES');
    t.ok(cdcTablesObserved.has(TABLES.PARTITIONS), 'Real CDC events propagated for TABLES.PARTITIONS');
    t.ok(cdcTablesObserved.has(TABLES.SERVICES), 'Real CDC events propagated for TABLES.SERVICES');

    const selectSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';
    const selectOnB = await engineB.executeQuery(selectSql, ['zoe@example.com']);
    t.equal(selectOnB.success, true, 'Independent-cache peer engineB executes GSI query');
    t.equal(
      selectOnB.globalIndexPlan?.accessPath,
      GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
      'Peer engineB engages GLOBAL_SECONDARY_INDEX via CDC-hydrated cacheB',
    );
    t.same(
      selectOnB.rows,
      oracleDb.prepare(selectSql).all('zoe@example.com'),
      'Peer engineB GSI SELECT matches oracle',
    );

    oracleDb.prepare(insertSql).run(45, 'nina@example.com', 'Nina', 'active');
    const insertOnB = await engineB.executeQuery(insertSql, [45, 'nina@example.com', 'Nina', 'active']);
    t.equal(insertOnB.success, true, 'Peer engineB maintains GSI via TX1 using CDC-hydrated cacheB');

    const selectOnA = await engineA.executeQuery(selectSql, ['nina@example.com']);
    t.equal(selectOnA.success, true);
    t.equal(selectOnA.globalIndexPlan?.accessPath, GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);
    t.same(selectOnA.rows, oracleDb.prepare(selectSql).all('nina@example.com'));

    const dropRes = await engineA.executeQuery('DROP INDEX idx_users_email');
    t.equal(dropRes.success, true, 'engineA DROP INDEX succeeds');

    t.equal(
      await waitForCondition(
        () => cacheB.getAll(TABLES.INDICES).filter((r) => r.index_name === 'idx_users_email').length === 0,
        3000,
        10,
      ),
      true,
      'cacheB observes index removal via real CDC after DROP INDEX',
    );

    const postDropSelectOnB = await engineB.executeQuery(selectSql, ['nina@example.com']);
    t.equal(postDropSelectOnB.success, true, 'Peer engineB falls back cleanly to scatter-gather after DROP CDC');
    t.equal(
      postDropSelectOnB.globalIndexPlan,
      undefined,
      'Peer engineB no longer plans any GSI after CDC delete propagation',
    );
    t.same(
      engineB.indexService.globalIndexCoordinator?.getIndexesForTable('users') || [],
      [],
      'Peer engineB global index catalog evicted dropped index after CDC delete propagation',
    );
    t.same(postDropSelectOnB.rows, oracleDb.prepare(selectSql).all('nina@example.com'));
  });
});
