/**
 * Production-construction integration tests for Global Secondary Index lifecycle.
 * Witnesses that ordinary IndexService production construction (without
 * setGlobalIndexCoordinator or manual callback injection) provides durable
 * TABLES.INDICES catalog persistence, physical index dataset provisioning,
 * cross-partition backfill, restart reconstruction, TX1 synchronous write
 * maintenance, resumable checkpointing, generation fencing, and read routing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {
  buildIndexDatasetSchema,
} from '../../src/index-management/global-index-dataset-manager.js';
import {
  GLOBAL_INDEX_STATE,
} from '../../src/index-management/global-index-catalog-contract.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
  GlobalIndexReadRouter,
  INDEX_REJECTION_REASON,
} from '../../src/index-management/global-index-read-router.js';
import {
  GlobalIndexBackfillCoordinator,
} from '../../src/index-management/global-index-backfill-coordinator.js';
import {
  GLOBAL_INDEX_ERROR_CODE,
} from '../../src/index-management/index-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  createMockSystemCache,
} from '../query/sql-query-engine-test-support.js';
import {ledgerRows} from '../partition/placement-admission-fixture.js';
import {
  createSeededSchemaAwareGateway,
  withFoundingPlacementEnvironment,
} from './global-index-founding-witness-support.js';

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
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
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

function createPartitionMessageRouter(partitionServicesMap) {
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

async function createRealPartition(dir, {
  partitionId,
  tableName,
  keyRange,
  schema,
  systemCache,
}) {
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

async function setupProductionEnvironment(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-gsi-prod-'));

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

  const basePartitionDefs = [
    {
      partition_id: 'users_p0',
      table_id: 'users',
      table_name: 'users',
      partition_key: 'id',
      partition_key_start: null,
      partition_key_end: 100,
    },
    {
      partition_id: 'users_p1',
      table_id: 'users',
      table_name: 'users',
      partition_key: 'id',
      partition_key_start: 100,
      partition_key_end: null,
    },
  ];

  const indexPartitionDefs = [
    {
      partition_id: '__gsi_users_idx_users_email_p0',
      table_id: '__idx_users_idx_users_email',
      table_name: '__idx_users_idx_users_email',
      partition_key: 'email',
      partition_key_start: null,
      partition_key_end: 'm',
    },
    {
      partition_id: '__gsi_users_idx_users_email_p1',
      table_id: '__idx_users_idx_users_email',
      table_name: '__idx_users_idx_users_email',
      partition_key: 'email',
      partition_key_start: 'm',
      partition_key_end: null,
    },
  ];

  const allPartitionDefs = [...basePartitionDefs, ...indexPartitionDefs];

  const systemCache = createMockSystemCache(tables, allPartitionDefs);
  const idxSchema = buildIndexDatasetSchema({
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
    basePrimaryKeyColumns: ['id'],
    columnTypes: {id: 'INTEGER', email: 'TEXT'},
  });

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
  const idxP0 = await createRealPartition(tmpDir, {
    partitionId: '__gsi_users_idx_users_email_p0',
    tableName: '__idx_users_idx_users_email',
    keyRange: {start: null, end: 'm'},
    schema: idxSchema,
    systemCache,
  });
  const idxP1 = await createRealPartition(tmpDir, {
    partitionId: '__gsi_users_idx_users_email_p1',
    tableName: '__idx_users_idx_users_email',
    keyRange: {start: 'm', end: null},
    schema: idxSchema,
    systemCache,
  });

  const partitionServices = new Map([
    ['users_p0-r1', usersP0],
    ['users_p1-r1', usersP1],
    ['__gsi_users_idx_users_email_p0-r1', idxP0],
    ['__gsi_users_idx_users_email_p1-r1', idxP1],
  ]);

  const oracleDb = new Database(':memory:');
  oracleDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT,
      name TEXT,
      status TEXT
    )
  `);

  const catalogDbPath = path.join(tmpDir, 'catalog.db');
  const {gateway, cdcService} = createSeededSchemaAwareGateway(
    catalogDbPath,
    tables,
    allPartitionDefs,
  );
  const messageRouter = createPartitionMessageRouter(partitionServices);

  const createEngineAndService = async () => {
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter,
      cdcIntegrationService: cdcService,
      controlPlaneSystemTableGateway: gateway,
      partitionServicesProvider: () => partitionServices,
    });
    engine.queryExecutor.leaderRetryDelayMs = 5;
    engine.queryExecutor.queryTimeoutMs = 1500;
    await engine.indexService.initialize();
    return {engine, indexService: engine.indexService};
  };

  t.teardown(async () => {
    await usersP0.shutdown().catch(() => {});
    await usersP1.shutdown().catch(() => {});
    await idxP0.shutdown().catch(() => {});
    await idxP1.shutdown().catch(() => {});
    oracleDb.close();
    gateway.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

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
    createEngineAndService,
  };
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

test('Production construction 1: durable TABLES.INDICES persistence, dataset provisioning, backfill, and restart reconstruction', async (t) => {
  const env = await setupProductionEnvironment(t);
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
    {id: 20, email: 'bob@example.com', name: 'Bob', status: 'active'},
    {id: 110, email: 'alice@example.com', name: 'Alice Two', status: 'pending'},
    {id: 120, email: 'zoe@example.com', name: 'Zoe', status: 'active'},
  ]);

  const {engine, indexService} = await env.createEngineAndService();

  // Ordinary production creation without setGlobalIndexCoordinator or manual callback wiring
  const created = await indexService.createIndex(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );

  t.equal(created.indexName, 'idx_users_email', 'Index name matches');
  t.equal(created.isGlobal, true, 'Index is marked global');
  t.equal(created.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Backfill completes to READ_WRITE');

  // 1. Verify durable catalog persistence in TABLES.INDICES
  const catalogRow = env.gateway.db.prepare(
    'SELECT * FROM indices WHERE index_name = ?',
  ).get('idx_users_email');
  t.ok(catalogRow, 'Catalog row persisted in TABLES.INDICES');
  t.equal(catalogRow.is_global, 1, 'Catalog row marks is_global = 1');
  t.equal(catalogRow.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Catalog row persisted READ_WRITE');
  t.equal(catalogRow.backfill_total_rows, 4, 'Catalog recorded all 4 backfilled rows');

  // 2. Verify physical index dataset provisioned and backfilled on real SQLite index partitions
  const idxP0Rows = env.idxP0.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email ORDER BY __base_pk_id ASC',
  ).all();
  const idxP1Rows = env.idxP1.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email ORDER BY __base_pk_id ASC',
  ).all();

  t.equal(idxP0Rows.length, 3, 'Index partition p0 (< m) has 3 backfilled entries');
  t.equal(idxP1Rows.length, 1, 'Index partition p1 (>= m) has 1 backfilled entry');
  t.same(
    idxP0Rows.map((r) => r.__base_pk_id),
    [10, 20, 110],
    'Base PKs from both base partitions backfilled into p0',
  );
  t.equal(idxP1Rows[0].email, 'zoe@example.com');
  t.equal(idxP1Rows[0].__base_partition_id, 'users_p1');

  await engine.shutdown();

  // 3. Restart reconstruction: fresh IndexService constructed against same durable catalog & storage
  const freshIndexService = new IndexService({
    systemTableCache: env.systemCache,
    controlPlaneSystemTableGateway: env.gateway,
    cdcIntegrationService: env.cdcService,
    partitionService: env.partitionServices,
  });
  await freshIndexService.initialize();

  const reconstructed = freshIndexService.getIndex('users', 'idx_users_email');
  t.ok(reconstructed, 'Fresh IndexService reconstructed global index metadata');
  t.equal(reconstructed.isGlobal, true, 'Reconstructed metadata preserves isGlobal');
  t.equal(reconstructed.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Reconstructed state is READ_WRITE');

  const coordinator = freshIndexService.getGlobalIndexCoordinator();
  const explain = coordinator.readRouter.explainDistributed({
    tableName: 'users',
    whereClause: {email: 'alice@example.com'},
    projectedColumns: ['*'],
    basePartitionKey: 'id',
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(
    explain.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
    'Reconstructed coordinator selects GLOBAL_SECONDARY_INDEX',
  );

  const readRows = await coordinator.planAndExecuteRead({
    tableName: 'users',
    where: {email: 'alice@example.com'},
    orderBy: 'id ASC',
  });
  const oracleRows = env.oracleDb.prepare(
    'SELECT * FROM users WHERE email = ? ORDER BY id ASC',
  ).all('alice@example.com');

  t.same(readRows, oracleRows, 'Restarted IndexService query returns exact oracle rows');

  // 4. Mixed indexed + non-indexed residual predicate and params forwarding (Condition C1)
  const mixedExplain = coordinator.readRouter.explainDistributed({
    tableName: 'users',
    whereClause: {email: 'alice@example.com', status: 'pending'},
    projectedColumns: ['id', 'email'],
    basePartitionKey: 'id',
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(mixedExplain.accessPath, GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);
  t.equal(mixedExplain.covering, false, 'Residual non-indexed predicate prevents covering skip');

  const mixedRows = await coordinator.planAndExecuteRead({
    tableName: 'users',
    where: {email: 'alice@example.com', status: 'pending'},
    orderBy: 'id ASC',
  });
  const oracleMixed = env.oracleDb.prepare(
    'SELECT * FROM users WHERE email = ? AND status = ? ORDER BY id ASC',
  ).all('alice@example.com', 'pending');
  t.same(mixedRows, oracleMixed, 'GSI read enforces residual non-indexed predicate');

  const mixedProjectedRows = await coordinator.planAndExecuteRead({
    tableName: 'users',
    where: {email: 'alice@example.com', status: 'pending'},
    projectedColumns: ['id', 'email'],
    orderBy: 'id ASC',
  });
  const oracleMixedProjected = env.oracleDb.prepare(
    'SELECT id, email FROM users WHERE email = ? AND status = ? ORDER BY id ASC',
  ).all('alice@example.com', 'pending');
  t.same(
    mixedProjectedRows,
    oracleMixedProjected,
    'Projected GSI read enforces residual predicate and projects requested columns',
  );

  const paramAstRows = await coordinator.planAndExecuteRead({
    tableName: 'users',
    whereClause: {
      type: 'AND',
      left: {type: '=', left: {type: 'column', name: 'email'}, right: {type: 'param', index: 0}},
      right: {type: '=', left: {type: 'column', name: 'status'}, right: {type: 'param', index: 1}},
    },
    params: ['alice@example.com', 'pending'],
    orderBy: 'id ASC',
  });
  t.same(paramAstRows, oracleMixed, 'planAndExecuteRead forwards params through GSI Stage 1/2');

  await freshIndexService.shutdown();
});

test('Production construction 2: TX1 synchronous INSERT/UPDATE/DELETE maintenance and unavailable participant refusal', async (t) => {
  const env = await setupProductionEnvironment(t);
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
  ]);

  const {engine, indexService} = await env.createEngineAndService();
  await indexService.createIndex('CREATE GLOBAL INDEX idx_users_email ON users (email)');
  const coordinator = indexService.getGlobalIndexCoordinator();

  // 1. INSERT via transactional write hook
  const insertedRow = {id: 15, email: 'charlie@example.com', name: 'Charlie', status: 'active'};
  await coordinator.executeTransactionalWrite({
    statementType: 'INSERT',
    tableName: 'users',
    basePartitionId: 'users_p0',
    afterRows: [insertedRow],
    basePrimaryKeyColumns: ['id'],
    baseWriteFn: async () => {
      env.usersP0.db.prepare(
        'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      ).run(insertedRow.id, insertedRow.email, insertedRow.name, insertedRow.status);
      env.oracleDb.prepare(
        'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      ).run(insertedRow.id, insertedRow.email, insertedRow.name, insertedRow.status);
    },
  });

  const idxInsert = env.idxP0.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?',
  ).get(15);
  t.ok(idxInsert, 'INSERT synchronously created index entry in p0');
  t.equal(idxInsert.email, 'charlie@example.com');

  // 2. UPDATE indexed column across index partitions (charlie < m -> zack >= m)
  const updatedRow = {id: 15, email: 'zack@example.com', name: 'Charlie', status: 'active'};
  await coordinator.executeTransactionalWrite({
    statementType: 'UPDATE',
    tableName: 'users',
    basePartitionId: 'users_p0',
    beforeRows: [insertedRow],
    afterRows: [updatedRow],
    basePrimaryKeyColumns: ['id'],
    baseWriteFn: async () => {
      env.usersP0.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(updatedRow.email, 15);
      env.oracleDb.prepare('UPDATE users SET email = ? WHERE id = ?').run(updatedRow.email, 15);
    },
  });

  t.notOk(
    env.idxP0.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(15),
    'UPDATE removed old index entry from p0',
  );
  const idxUpdate = env.idxP1.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?',
  ).get(15);
  t.ok(idxUpdate, 'UPDATE inserted new index entry in p1');
  t.equal(idxUpdate.email, 'zack@example.com');

  // 3. DELETE removes from both base and index partition
  await coordinator.executeTransactionalWrite({
    statementType: 'DELETE',
    tableName: 'users',
    basePartitionId: 'users_p0',
    beforeRows: [updatedRow],
    basePrimaryKeyColumns: ['id'],
    baseWriteFn: async () => {
      env.usersP0.db.prepare('DELETE FROM users WHERE id = ?').run(15);
      env.oracleDb.prepare('DELETE FROM users WHERE id = ?').run(15);
    },
  });

  t.notOk(
    env.usersP0.db.prepare('SELECT * FROM users WHERE id = ?').get(15),
    'DELETE removed base row',
  );
  t.notOk(
    env.idxP1.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(15),
    'DELETE removed index entry from p1',
  );

  // 4. Refuse atomically when index participant is unavailable
  env.partitionServices.delete('__gsi_users_idx_users_email_p1-r1');
  const blockedRow = {id: 125, email: 'wendy@example.com', name: 'Wendy', status: 'active'};
  let writeErr = null;
  try {
    await coordinator.executeTransactionalWrite({
      statementType: 'INSERT',
      tableName: 'users',
      basePartitionId: 'users_p1',
      afterRows: [blockedRow],
      basePrimaryKeyColumns: ['id'],
      baseWriteFn: async () => {
        env.usersP1.db.prepare(
          'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
        ).run(blockedRow.id, blockedRow.email, blockedRow.name, blockedRow.status);
      },
    });
  } catch (err) {
    writeErr = err;
  }

  t.ok(writeErr, 'Write refused when index participant is unavailable');
  t.equal(writeErr?.code, 'INDEX_PARTICIPANT_UNAVAILABLE');
  t.notOk(
    env.usersP1.db.prepare('SELECT * FROM users WHERE id = ?').get(125),
    'Base partition was NOT mutated on participant refusal',
  );

  env.partitionServices.set('__gsi_users_idx_users_email_p1-r1', env.idxP1);
  await engine.shutdown();
});

test('Production construction 3: checkpoint resume across restart, unreadable fallback, GSI read, and stale generation fencing', async (t) => {
  const env = await setupProductionEnvironment(t);
  seedUsers(env, [
    {id: 1, email: 'amy@example.com', name: 'Amy', status: 'active'},
    {id: 2, email: 'brian@example.com', name: 'Brian', status: 'active'},
    {id: 3, email: 'claire@example.com', name: 'Claire', status: 'active'},
    {id: 101, email: 'nora@example.com', name: 'Nora', status: 'active'},
    {id: 102, email: 'oscar@example.com', name: 'Oscar', status: 'active'},
  ]);

  const {engine, indexService} = await env.createEngineAndService();

  // 1. Interrupt backfill after first batch of 2 rows
  let batchCount = 0;
  const interrupted = await indexService.createIndex(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    {
      batchSize: 2,
      backfillOptions: {
        shouldYield: () => {
          batchCount++;
          return batchCount >= 1;
        },
      },
    },
  );
  t.equal(interrupted.interrupted, true, 'Backfill interrupted at checkpoint');
  t.equal(interrupted.state, GLOBAL_INDEX_STATE.BACKFILLING);

  const checkpointRow = env.gateway.db.prepare(
    'SELECT * FROM indices WHERE index_name = ?',
  ).get('idx_users_email');
  t.equal(checkpointRow.state, GLOBAL_INDEX_STATE.BACKFILLING, 'BACKFILLING state persisted');
  t.equal(checkpointRow.backfill_cursor_partition_id, 'users_p0', 'Cursor partition persisted');
  t.equal(checkpointRow.backfill_cursor_pk, '2', 'Cursor PK persisted');
  t.equal(checkpointRow.backfill_total_rows, 2, 'Total rows persisted at checkpoint');

  // 2. Unreadable (BACKFILLING) index must fall back to complete scatter-gather without implying index coverage
  const coordinator1 = indexService.getGlobalIndexCoordinator();
  const explainDuringBackfill = coordinator1.readRouter.explainDistributed({
    tableName: 'users',
    whereClause: {email: 'nora@example.com'},
    projectedColumns: ['*'],
    basePartitionKey: 'id',
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(
    explainDuringBackfill.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.SCATTER_GATHER,
    'BACKFILLING index uses SCATTER_GATHER fallback',
  );
  t.equal(
    explainDuringBackfill.rejectedIndexes[0].reason,
    INDEX_REJECTION_REASON.INDEX_NOT_READ_WRITE,
    'Rejects BACKFILLING index explicitly',
  );

  const fallbackRows = await coordinator1.planAndExecuteRead({
    tableName: 'users',
    where: {email: 'nora@example.com'},
    orderBy: 'id ASC',
  });
  const oracleNora = env.oracleDb.prepare(
    'SELECT * FROM users WHERE email = ? ORDER BY id ASC',
  ).all('nora@example.com');
  t.same(fallbackRows, oracleNora, 'Scatter-gather fallback returns complete authoritative row');

  await engine.shutdown();

  // 3. Fresh IndexService resumes from durable checkpoint in TABLES.INDICES
  const freshIndexService = new IndexService({
    systemTableCache: env.systemCache,
    controlPlaneSystemTableGateway: env.gateway,
    cdcIntegrationService: env.cdcService,
    partitionService: env.partitionServices,
  });
  await freshIndexService.initialize();
  const freshCoordinator = freshIndexService.getGlobalIndexCoordinator();

  const resumed = await freshCoordinator.resumeBackfill('idx_users_email');
  t.equal(resumed.completed, true, 'Resumed backfill completed');
  t.equal(resumed.state, GLOBAL_INDEX_STATE.READ_WRITE);

  const completedRow = env.gateway.db.prepare(
    'SELECT * FROM indices WHERE index_name = ?',
  ).get('idx_users_email');
  t.equal(completedRow.state, GLOBAL_INDEX_STATE.READ_WRITE);
  t.equal(completedRow.backfill_total_rows, 5, 'All 5 rows indexed after resume without loss');

  // 4. Eligible query engages GLOBAL_SECONDARY_INDEX and matches oracle
  const explainReady = freshCoordinator.readRouter.explainDistributed({
    tableName: 'users',
    whereClause: {email: 'claire@example.com'},
    projectedColumns: ['*'],
    basePartitionKey: 'id',
    basePrimaryKeyColumns: ['id'],
  });
  t.equal(explainReady.accessPath, GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);

  const gsiRows = await freshCoordinator.planAndExecuteRead({
    tableName: 'users',
    where: {email: 'claire@example.com'},
    orderBy: 'id ASC',
  });
  const oracleClaire = env.oracleDb.prepare(
    'SELECT * FROM users WHERE email = ? ORDER BY id ASC',
  ).all('claire@example.com');
  t.same(gsiRows, oracleClaire, 'GSI read matches oracle');

  // 5. Stale dropped generation is fenced on recreate
  await freshIndexService.dropIndex('idx_users_email');
  t.notOk(
    env.gateway.db.prepare('SELECT * FROM indices WHERE index_name = ?').get('idx_users_email'),
    'Drop removed index from TABLES.INDICES',
  );

  const gen1Deferred = await freshIndexService.createIndex(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    {deferBackfill: true},
  );
  const staleRecord = freshCoordinator.getCatalogRecord('idx_users_email');
  const staleGen = gen1Deferred.generation;

  await freshIndexService.dropIndex('idx_users_email');
  const recreated = await freshIndexService.createIndex(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );
  t.ok(recreated.generation > staleGen, 'Recreated index advances generation');
  t.equal(recreated.state, GLOBAL_INDEX_STATE.READ_WRITE);

  const fenced = await freshCoordinator._runBackfillToCompletion(staleRecord, staleGen, {});
  t.equal(fenced.fenced, true, 'Stale dropped generation backfill is fenced');
  t.equal(
    freshCoordinator.getCatalogRecord('idx_users_email').state,
    GLOBAL_INDEX_STATE.READ_WRITE,
    'Live recreated generation remains READ_WRITE',
  );

  await freshIndexService.shutdown();
});

test('Production construction 4: unwired backfill and read-router fail closed (no silent no-ops)', async (t) => {
  const backfill = new GlobalIndexBackfillCoordinator();
  let backfillErr = null;
  try {
    await backfill.executeBackfill({
      indexId: 'idx-1',
      tableName: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      state: GLOBAL_INDEX_STATE.WRITE_ONLY,
    });
  } catch (err) {
    backfillErr = err;
  }
  t.ok(backfillErr, 'Unwired GlobalIndexBackfillCoordinator rejects executeBackfill');
  t.equal(backfillErr?.code, GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE);

  const router = new GlobalIndexReadRouter({
    getIndexCatalog: () => [
      {
        index_name: 'idx_users_email',
        column_names: ['email'],
        is_global: 1,
        state: GLOBAL_INDEX_STATE.READ_WRITE,
      },
    ],
    getIndexPartitions: () => [{partition_id: 'p-idx-0'}],
    getBaseTablePartitions: () => [{partition_id: 'p-base-0'}],
  });

  let scanErr = null;
  try {
    await router.executeQuery({
      tableName: 'users',
      whereClause: {email: 'alice@example.com'},
    });
  } catch (err) {
    scanErr = err;
  }
  t.ok(scanErr, 'Unwired GlobalIndexReadRouter rejects executeQuery');
  t.equal(scanErr?.code, GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE);
});

test('Production construction 5: SQLQueryEngine public DML and SELECT engage global indexes end-to-end', async (t) => {
  const env = await setupProductionEnvironment(t);
  seedUsers(env, [
    {id: 10, email: 'alice@example.com', name: 'Alice', status: 'active'},
    {id: 110, email: 'bob@example.com', name: 'Bob', status: 'pending'},
  ]);

  const {engine, indexService} = await env.createEngineAndService();

  // 1. CREATE GLOBAL INDEX through ordinary SQLQueryEngine.executeQuery
  const createRes = await engine.executeQuery(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
  );
  t.equal(createRes.success, true, 'CREATE GLOBAL INDEX via engine.executeQuery succeeds');

  // 2. Public INSERT via engine.executeQuery synchronously updates index partition p0 (< m)
  const insertSql = 'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)';
  const insertParams = [25, 'diana@example.com', 'Diana', 'active'];
  env.oracleDb.prepare(insertSql).run(...insertParams);
  const insertRes = await engine.executeQuery(insertSql, insertParams);
  t.equal(insertRes.success, true, 'Public INSERT via engine.executeQuery succeeds');

  const insertedIdxRow = env.idxP0.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?',
  ).get(25);
  t.ok(insertedIdxRow, 'Public INSERT maintained global index partition p0');
  t.equal(insertedIdxRow.email, 'diana@example.com');

  // 3. Public UPDATE of indexed column across index partitions (diana < m -> zora >= m)
  const updateIndexedSql = 'UPDATE users SET email = ? WHERE id = ?';
  env.oracleDb.prepare(updateIndexedSql).run('zora@example.com', 25);
  const updateRes = await engine.executeQuery(updateIndexedSql, ['zora@example.com', 25]);
  t.equal(updateRes.success, true, 'Public UPDATE via engine.executeQuery succeeds');

  t.notOk(
    env.idxP0.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(25),
    'Public UPDATE removed old index entry from p0',
  );
  const movedIdxRow = env.idxP1.db.prepare(
    'SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?',
  ).get(25);
  t.ok(movedIdxRow, 'Public UPDATE inserted new index entry into p1');
  t.equal(movedIdxRow.email, 'zora@example.com');

  // 4. Public UPDATE of non-indexed column by WHERE email = ? updates base across partitions
  const updateNonIndexedSql = 'UPDATE users SET status = ? WHERE email = ?';
  env.oracleDb.prepare(updateNonIndexedSql).run('vip', 'alice@example.com');
  const updateNonIdxRes = await engine.executeQuery(
    updateNonIndexedSql,
    ['vip', 'alice@example.com'],
  );
  t.equal(updateNonIdxRes.success, true, 'Non-indexed column UPDATE succeeds');

  // 5. Public SELECT via engine.executeQuery engages GLOBAL_SECONDARY_INDEX and matches oracle
  const selectSql = 'SELECT * FROM users WHERE email = ? ORDER BY id ASC';
  const selectRes = await engine.executeQuery(selectSql, ['zora@example.com']);
  t.equal(selectRes.success, true, 'Public SELECT via engine.executeQuery succeeds');
  t.equal(
    selectRes.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
    'Public SELECT engaged GLOBAL_SECONDARY_INDEX',
  );
  t.same(
    selectRes.rows,
    env.oracleDb.prepare(selectSql).all('zora@example.com'),
    'Public SELECT via GSI matches oracle',
  );

  // Mixed indexed + non-indexed predicate through engine.executeQuery
  const mixedSql = 'SELECT id, email FROM users WHERE email = ? AND status = ? ORDER BY id ASC';
  const mixedRes = await engine.executeQuery(mixedSql, ['alice@example.com', 'vip']);
  t.equal(mixedRes.success, true);
  t.equal(
    mixedRes.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
  );
  t.equal(mixedRes.globalIndexPlan?.covering, false);
  t.same(
    mixedRes.rows,
    env.oracleDb.prepare(mixedSql).all('alice@example.com', 'vip'),
    'Public SELECT with residual predicate matches oracle',
  );

  // 6. Public DELETE removes both base row and index entry
  const deleteSql = 'DELETE FROM users WHERE id = ?';
  env.oracleDb.prepare(deleteSql).run(25);
  const deleteRes = await engine.executeQuery(deleteSql, [25]);
  t.equal(deleteRes.success, true, 'Public DELETE via engine.executeQuery succeeds');
  t.notOk(
    env.usersP0.db.prepare('SELECT * FROM users WHERE id = ?').get(25),
    'Public DELETE removed base row',
  );
  t.notOk(
    env.idxP1.db.prepare('SELECT * FROM __idx_users_idx_users_email WHERE __base_pk_id = ?').get(25),
    'Public DELETE removed index entry',
  );

  // 7. Fail closed on unavailable index participant via engine.executeQuery
  env.partitionServices.delete('__gsi_users_idx_users_email_p1-r1');
  const blockedRes = await engine.executeQuery(insertSql, [130, 'xavier@example.com', 'Xavier', 'active']);
  t.equal(blockedRes.success, false, 'Public INSERT fails closed when index participant is unavailable');
  t.notOk(
    env.usersP1.db.prepare('SELECT * FROM users WHERE id = ?').get(130),
    'Base partition rolled back / untouched when index participant is unavailable',
  );
  env.partitionServices.set('__gsi_users_idx_users_email_p1-r1', env.idxP1);

  // 8. Unreadable BACKFILLING index falls back to canonical scatter-gather without claiming index coverage
  await engine.executeQuery('DROP INDEX idx_users_email');
  await indexService.createIndex(
    'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    {
      batchSize: 1,
      backfillOptions: {shouldYield: () => true},
    },
  );
  const backfillingSelect = await engine.executeQuery(selectSql, ['alice@example.com']);
  t.equal(backfillingSelect.success, true, 'SELECT during BACKFILLING succeeds');
  t.equal(
    backfillingSelect.globalIndexPlan?.accessPath,
    GLOBAL_INDEX_ACCESS_PATH.SCATTER_GATHER,
    'SELECT during BACKFILLING uses SCATTER_GATHER without implying index coverage',
  );
  t.same(
    backfillingSelect.rows,
    env.oracleDb.prepare(selectSql).all('alice@example.com'),
    'SELECT during BACKFILLING returns complete scatter-gather oracle rows',
  );

  await engine.shutdown();
});

test('Production construction 6 (2A positive): fresh global index provisioning through real provisionInitialTablePartition and placement admission', async (t) => {
  await withFoundingPlacementEnvironment(async ({
    engine,
    leader,
    gateway,
    cache,
    createdReplicas,
  }) => {
    await engine.executeQuery(
      'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      [10, 'alice@example.com', 'Alice', 'active'],
    );
    await engine.executeQuery(
      'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      [20, 'bob@example.com', 'Bob', 'pending'],
    );

    const preExisting = cache.filter(
      TABLES.PARTITIONS,
      (p) => p.table_name === '__idx_users_idx_users_email',
    );
    t.equal(preExisting.length, 0, 'No pre-created index partitions exist before CREATE GLOBAL INDEX');

    const createRes = await engine.executeQuery(
      'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    );
    t.equal(createRes.success, true, 'Fresh CREATE GLOBAL INDEX succeeds with placement admission');
    t.equal(createdReplicas.length, 1, 'Founding operation instantiated 1 real PartitionService');

    const schemaOps = gateway.db.prepare('SELECT * FROM schema_operations').all();
    const gsiJob = schemaOps.find((row) => row.table_name === '__idx_users_idx_users_email');
    t.ok(gsiJob, 'Durable schema provisioning job row recorded for GSI dataset');
    t.equal(gsiJob.status, 'SUCCEEDED', 'GSI durable schema provisioning job reached SUCCEEDED');

    const rows = ledgerRows(leader);
    t.ok(rows.length >= 1, 'Real placement admission ledger recorded native FOUND row(s)');
    const foundedOp = rows.find((row) =>
      row.partition_id === '__gsi_users_idx_users_email_p0',
    );
    t.ok(foundedOp, 'Ledger recorded native FOUND operation for GSI partition');
    const [initialStep] = JSON.parse(foundedOp.steps_history);
    t.equal(
      initialStep.placementAdmission?.foundingIntentId,
      `${gsiJob.job_id}:__gsi_users_idx_users_email_p0`,
      'Founding admission intent binds deterministically to durable schema job identity',
    );

    const idxRecord = gateway.db.prepare(
      'SELECT * FROM indices WHERE index_name = ?',
    ).get('idx_users_email');
    t.equal(idxRecord?.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Fresh GSI reached READ_WRITE');
    t.equal(idxRecord?.backfill_total_rows, 2, 'Backfilled existing base rows into founded GSI');

    const selectRes = await engine.executeQuery(
      'SELECT * FROM users WHERE email = ? ORDER BY id ASC',
      ['alice@example.com'],
    );
    t.equal(selectRes.success, true);
    t.equal(
      selectRes.globalIndexPlan?.accessPath,
      GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
      'Query after real founding engages GLOBAL_SECONDARY_INDEX',
    );
    t.same(
      selectRes.rows.map((r) => ({id: r.id, email: r.email, name: r.name})),
      [{id: 10, email: 'alice@example.com', name: 'Alice'}],
      'Query against newly founded GSI partition returns authoritative row',
    );
  });
});

test('Production construction 7 (2A negative): missing/conflicting founding identity and unavailable placement authority fail closed', async (t) => {
  await withFoundingPlacementEnvironment(async ({engine, leader, coordinator}) => {
    await t.rejects(
      engine.provisionInitialTablePartition({
        tableId: '__idx_users_idx_missing_id',
        tableName: '__idx_users_idx_missing_id',
        partitionId: '__gsi_users_idx_missing_id_p0',
        replicaCount: 1,
        targetNodeIds: ['test-node'],
      }),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'provisionInitialTablePartition rejects missing founding identity fail-closed',
    );

    await t.rejects(
      engine.provisionInitialTablePartition({
        tableId: '__idx_users_idx_conflict_id',
        tableName: '__idx_users_idx_conflict_id',
        partitionId: '__gsi_users_idx_conflict_id_p0',
        replicaCount: 1,
        targetNodeIds: ['test-node'],
        schemaJobId: 'schema-job-1',
        partitionWorkflowId: 'workflow-1',
      }),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'provisionInitialTablePartition preserves XOR founding identity guard fail-closed',
    );
    t.same(ledgerRows(leader), [], 'Refused founding attempts leave zero ledger rows');

    const originalNodeId = coordinator.nodeId;
    coordinator.nodeId = '';
    await t.rejects(
      engine.indexService.createIndex('CREATE GLOBAL INDEX idx_users_no_host ON users (email)'),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'CREATE GLOBAL INDEX fails closed when placement coordinator lacks hosting nodeId',
    );
    coordinator.nodeId = originalNodeId;

    coordinator.controlPlaneReadinessService.answerCommittedNodes = () => ({
      formation: {state: 'UNAVAILABLE', latchEpoch: null},
    });
    await t.rejects(
      engine.indexService.createIndex('CREATE GLOBAL INDEX idx_users_unlatched ON users (email)'),
      {failureCode: 'FORMATION_NOT_LATCHED'},
      'CREATE GLOBAL INDEX fails closed with typed placement refusal when formation unlatched',
    );
  });
});
