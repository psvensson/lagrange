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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
} from '../../src/index-management/global-index-read-router.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  createTransactionPersistenceGateway,
} from '../test-helpers/transaction-persistence-gateway.js';

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

function initCatalogSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      table_id TEXT PRIMARY KEY,
      table_name TEXT,
      partition_key TEXT,
      primary_key TEXT,
      partition_key_type TEXT
    );
    CREATE TABLE IF NOT EXISTS partitions (
      partition_id TEXT PRIMARY KEY,
      table_id TEXT,
      table_name TEXT,
      partition_key TEXT,
      partition_key_start TEXT,
      partition_key_end TEXT
    );
    CREATE TABLE IF NOT EXISTS indices (
      index_id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      table_name TEXT,
      index_name TEXT NOT NULL,
      column_names TEXT NOT NULL,
      index_type TEXT NOT NULL DEFAULT 'btree',
      is_global INTEGER NOT NULL DEFAULT 1,
      is_unique INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'CREATING',
      backfill_cursor_partition_id TEXT,
      backfill_cursor_pk TEXT,
      backfill_total_rows INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );
  `);
}

function serializeBoundaryValue(val) {
  return val === null || val === undefined ? null : String(val);
}

function seedCatalogTables(db, tables) {
  const insertTable = db.prepare(
    'INSERT OR REPLACE INTO tables (table_id, table_name, partition_key, primary_key, partition_key_type) VALUES (?, ?, ?, ?, ?)',
  );
  for (const t of tables) {
    const pkCol = t.partition_key || 'id';
    insertTable.run(
      t.table_id || t.table_name,
      t.table_name,
      pkCol,
      JSON.stringify(t.primaryKey || [pkCol]),
      t.partition_key_type || 'INTEGER',
    );
  }
}

function seedCatalogPartitions(db, partitions) {
  const insertPartition = db.prepare(
    'INSERT OR REPLACE INTO partitions (partition_id, table_id, table_name, partition_key, partition_key_start, partition_key_end) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const p of partitions) {
    insertPartition.run(
      p.partition_id,
      p.table_id || p.table_name,
      p.table_name,
      p.partition_key || null,
      serializeBoundaryValue(p.partition_key_start),
      serializeBoundaryValue(p.partition_key_end),
    );
  }
}

function serializeColumns(rawCols) {
  return typeof rawCols === 'string' ? rawCols : JSON.stringify(rawCols || []);
}

function normalizeIndicesParams(data) {
  const createdAt = data.created_at || Date.now();
  const isGlobal = data.is_global !== undefined ? Number(Boolean(data.is_global)) : 0;
  return [
    data.index_id,
    data.table_id,
    data.table_name || null,
    data.index_name,
    serializeColumns(data.column_names),
    data.index_type || 'btree',
    isGlobal,
    data.is_unique ? 1 : 0,
    data.state || 'CREATING',
    data.backfill_cursor_partition_id ?? null,
    data.backfill_cursor_pk ?? null,
    Number(data.backfill_total_rows || 0),
    data.error_message ?? null,
    createdAt,
    data.updated_at || createdAt,
  ];
}

function runIndicesInsert(db, data) {
  db.prepare(`
    INSERT OR REPLACE INTO indices (
      index_id, table_id, table_name, index_name, column_names,
      index_type, is_global, is_unique, state,
      backfill_cursor_partition_id, backfill_cursor_pk, backfill_total_rows,
      error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...normalizeIndicesParams(data));
}

function runIndicesUpdate(db, whereClause, data) {
  const setEntries = Object.entries(data);
  const whereEntries = Object.entries(whereClause);
  if (setEntries.length === 0 || whereEntries.length === 0) return;
  const setParts = setEntries.map(([col]) => `${col} = ?`);
  const whereParts = whereEntries.map(([col]) => `${col} = ?`);
  const sql = `UPDATE indices SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
  db.prepare(sql).run(
    ...setEntries.map(([, val]) => val),
    ...whereEntries.map(([, val]) => val),
  );
}

function runIndicesDelete(db, whereClause) {
  if (whereClause.index_id) {
    db.prepare('DELETE FROM indices WHERE index_id = ?').run(whereClause.index_id);
  } else if (whereClause.index_name) {
    db.prepare('DELETE FROM indices WHERE index_name = ?').run(whereClause.index_name);
  }
}

function runPartitionsInsert(db, data) {
  db.prepare(`
    INSERT OR REPLACE INTO partitions (
      partition_id, table_id, table_name, partition_key,
      partition_key_start, partition_key_end
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.partition_id,
    data.table_id || data.table_name,
    data.table_name,
    data.partition_key || null,
    serializeBoundaryValue(data.partition_key_start),
    serializeBoundaryValue(data.partition_key_end),
  );
}

function handleGatewayInsert(db, tableName, data) {
  if (tableName === TABLES.INDICES) runIndicesInsert(db, data);
  if (tableName === TABLES.PARTITIONS) runPartitionsInsert(db, data);
  return {success: true};
}

function handleGatewayUpdate(db, tableName, whereClause, data) {
  if (tableName === TABLES.INDICES) runIndicesUpdate(db, whereClause, data);
  return {success: true};
}

function handleGatewayDelete(db, tableName, whereClause) {
  if (tableName === TABLES.INDICES) runIndicesDelete(db, whereClause);
  if (tableName === TABLES.PARTITIONS && whereClause?.partition_id) {
    db.prepare('DELETE FROM partitions WHERE partition_id = ?').run(whereClause.partition_id);
  }
  return {success: true};
}

function createDurableSystemGateway(catalogDbPath, tables, partitions) {
  const db = new Database(catalogDbPath);
  initCatalogSchema(db);
  seedCatalogTables(db, tables);
  seedCatalogPartitions(db, partitions);
  const txGateway = createTransactionPersistenceGateway();
  const txTables = new Set([
    TABLES.SQL_TRANSACTIONS,
    TABLES.SQL_TRANSACTION_PARTICIPANTS,
    TABLES.SQL_WRITE_OPERATIONS,
  ]);

  let cdcService = null;
  const gateway = {
    db,
    resolveCdcIntegrationService() {
      return cdcService;
    },
    supportsMutationSubmission: () => true,
    async submitMutation(mutation, mutationOptions = {}) {
      return txGateway.submitMutation(mutation, mutationOptions);
    },
    async readAuthoritativeRows(tableName, sql, params = []) {
      if (txTables.has(tableName)) {
        return txGateway.readAuthoritativeRows(tableName, sql, params);
      }
      return {success: true, rows: db.prepare(sql).all(...params)};
    },
    async readRows(_tableName, sql, params = []) {
      return {rows: db.prepare(sql).all(...params)};
    },
    async insertSystemTableRow(tableName, data) {
      return handleGatewayInsert(db, tableName, data);
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      return handleGatewayUpdate(db, tableName, whereClause, data);
    },
    async deleteSystemTableRow(tableName, whereClause) {
      return handleGatewayDelete(db, tableName, whereClause);
    },
    close() {
      txGateway.db.close();
      db.close();
    },
  };

  cdcService = {
    async insertSystemTableRow(tableName, data) {
      return gateway.insertSystemTableRow(tableName, data);
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      return gateway.updateSystemTableRow(tableName, whereClause, data);
    },
    async deleteSystemTableRow(tableName, whereClause) {
      return gateway.deleteSystemTableRow(tableName, whereClause);
    },
  };

  return {gateway, cdcService};
}

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

async function createRealPartition(dir, {partitionId, tableName, keyRange, schema}) {
  const dbPath = path.join(dir, `${partitionId}.db`);
  const ps = new PartitionService(withFoundingStamp({
    partitionId,
    tableId: tableName,
    tableName,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'test-node',
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
    dbPath,
    keyRange,
    schema,
  }));
  await ps.initialize();
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

function seedRealSystemTableCache(tables, partitions) {
  const cache = new SystemTableCache();
  for (const t of tables) {
    cache.applySystemTableChange(TABLES.TABLES, CACHE_CDC_OPERATIONS.INSERT, t);
  }
  for (const p of partitions) {
    cache.applySystemTableChange(TABLES.PARTITIONS, CACHE_CDC_OPERATIONS.INSERT, p);
    cache.applySystemTableChange(TABLES.SERVICES, CACHE_CDC_OPERATIONS.INSERT, {
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    });
  }
  return cache;
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

  const usersP0 = await createRealPartition(tmpDir, {
    partitionId: 'users_p0',
    tableName: 'users',
    keyRange: {start: null, end: 100},
    schema: USERS_SCHEMA,
  });
  const usersP1 = await createRealPartition(tmpDir, {
    partitionId: 'users_p1',
    tableName: 'users',
    keyRange: {start: 100, end: null},
    schema: USERS_SCHEMA,
  });
  const partitionServices = new Map([
    ['users_p0-r1', usersP0],
    ['users_p1-r1', usersP1],
  ]);

  let idxP0 = null;
  let idxP1 = null;
  if (includeIndexPartitions) {
    idxP0 = await createRealPartition(tmpDir, {
      partitionId: '__gsi_users_idx_users_email_p0',
      tableName: '__idx_users_idx_users_email',
      keyRange: {start: null, end: 'm'},
      schema: null,
    });
    idxP1 = await createRealPartition(tmpDir, {
      partitionId: '__gsi_users_idx_users_email_p1',
      tableName: '__idx_users_idx_users_email',
      keyRange: {start: 'm', end: null},
      schema: null,
    });
    partitionServices.set('__gsi_users_idx_users_email_p0-r1', idxP0);
    partitionServices.set('__gsi_users_idx_users_email_p1-r1', idxP1);
  }

  const oracleDb = createOracleUsersDb();
  const catalogDbPath = path.join(tmpDir, 'catalog.db');
  const {gateway, cdcService} = createDurableSystemGateway(catalogDbPath, tables, partitions);
  const systemCache = seedRealSystemTableCache(tables, partitions);
  const messageRouter = createStrictRealMessageRouter(partitionServices);

  const provisioner = async (ctx) => {
    const ps = await createRealPartition(tmpDir, {
      partitionId: ctx.partitionId,
      tableName: ctx.tableName,
      keyRange: ctx.keyRange || {start: null, end: null},
      schema: ctx.schema,
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
  t.equal(createRes.success, true, 'CREATE GLOBAL INDEX succeeds on strict cluster');
  await resumeFixtureParticipantAdmission(env.idxP0);
  await resumeFixtureParticipantAdmission(env.idxP1);

  const selectByEmailSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';

  // 1. Explicit BEGIN -> INSERT -> uncommitted isolation -> COMMIT
  const begin1 = await engine.executeQuery('BEGIN', [], {sessionId: 'tx1-s1'});
  t.equal(begin1.success, true, 'BEGIN tx1-s1 succeeds');

  const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
  const insertParams = [35, 'lara@example.com', 'Lara', 'active'];
  const stagedInsert = await engine.executeQuery(insertSql, insertParams, {
    sessionId: 'tx1-s1',
  });
  t.equal(stagedInsert.success, true, 'Staged TX1 INSERT succeeds');

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

test('Dynamic index partition provisioning, distributed execution without local DB handles, and cross-engine catalog propagation', async (t) => {
  const env = await setupStrictCluster(t, {includeIndexPartitions: false});
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
    {id: 120, email: 'zoe@example.com', name: 'Zoe', status: 'pending'},
  ]);

  // Both engines have NO partitionServicesProvider / partitionDatabases (distributed-only)
  const engineA = await env.createStrictEngine({attachProvisioner: true});
  const engineB = await env.createStrictEngine({attachProvisioner: false});

  // 1. engineA creates global index with zero pre-created index partitions
  const createRes = await engineA.executeQuery(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );
  t.equal(createRes.success, true, 'CREATE GLOBAL INDEX dynamically provisions index partitions');

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
