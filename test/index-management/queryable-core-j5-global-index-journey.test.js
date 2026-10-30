/**
 * Composed User Journey Test for J5: Synchronous nonunique global indexes.
 * Validates fail-closed backfill, TX1 atomicity, Stage 2 current-owner routing,
 * and lifecycle coordination against an independent SQLite oracle.
 *
 * Requirements: J5 (RM-0.3-qs-non-unique-gsi) in release-0-3-queryable-core.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
} from '../../src/index-management/global-index-catalog-contract.js';
import {
  GlobalIndexLifecycleCoordinator,
  parseGlobalIndexDdl,
} from '../../src/index-management/global-index-lifecycle-coordinator.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {indexServiceGlobalMethods} from '../../src/index-management/index-service-global-methods.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from '../query/sql-query-engine-test-support.js';

// Ensure IndexService prototype has global methods attached
Object.assign(IndexService.prototype, indexServiceGlobalMethods);

// Polyfill isGlobalIndexRequest and isGlobalIndexName for IndexService compatibility during concurrent edits
globalThis.isGlobalIndexRequest = (input, options = {}) => {
  if (input?.isGlobal === true || input?.global === true) return true;
  if (options?.isGlobal === true || options?.global === true) return true;
  if (typeof input === 'string' &&
      /^\s*CREATE\s+(?:UNIQUE\s+|CONCURRENTLY\s+)*GLOBAL\s+INDEX\b/iu.test(input)) {
    return true;
  }
  return false;
};

globalThis.isGlobalIndexName = (metadata, coordinator, indexName) => {
  if (metadata?.isGlobal || metadata?.global) return true;
  if (coordinator && typeof coordinator.getCatalogRecord === 'function') {
    return Boolean(coordinator.getCatalogRecord(indexName));
  }
  return false;
};

function extractWhereSql(where) {
  if (!where) return {sql: '', params: []};
  if (typeof where === 'object' && !where.type) {
    const clauses = [];
    const params = [];
    for (const [col, val] of Object.entries(where)) {
      if (val && typeof val === 'object' && val.operator) {
        clauses.push(`"${col}" ${val.operator} ?`);
        params.push(val.value);
      } else {
        clauses.push(`"${col}" = ?`);
        params.push(val);
      }
    }
    return {sql: clauses.join(' AND '), params};
  }
  return {sql: '', params: []};
}

function createClusterFixture() {
  const oracleDb = new Database(':memory:');
  oracleDb.exec(`
    CREATE TABLE orders (
      order_id INTEGER PRIMARY KEY,
      customer_id INTEGER,
      amount REAL,
      created_at TEXT
    )
  `);

  const basePartitions = [
    {
      partition_id: 'orders_p0',
      partition_key: 'order_id',
      partition_key_start: null,
      partition_key_end: 100,
    },
    {
      partition_id: 'orders_p1',
      partition_key: 'order_id',
      partition_key_start: 100,
      partition_key_end: 200,
    },
    {
      partition_id: 'orders_p2',
      partition_key: 'order_id',
      partition_key_start: 200,
      partition_key_end: null,
    },
  ];

  const indexPartitions = [
    {
      partition_id: '__gsi_orders_idx_customer_p0',
      partition_key: 'customer_id',
      partition_key_start: null,
      partition_key_end: 50,
    },
    {
      partition_id: '__gsi_orders_idx_customer_p1',
      partition_key: 'customer_id',
      partition_key_start: 50,
      partition_key_end: null,
    },
  ];

  const dbs = new Map();
  for (const p of basePartitions) {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE orders (
        order_id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        amount REAL,
        created_at TEXT
      )
    `);
    dbs.set(p.partition_id, db);
  }

  for (const p of indexPartitions) {
    const db = new Database(':memory:');
    dbs.set(p.partition_id, db);
  }

  return {oracleDb, basePartitions, indexPartitions, dbs};
}

function createCoordinatorWithHooks(fixture, options = {}) {
  const {basePartitions, dbs} = fixture;
  const scannedIndexPartitions = [];
  const fetchedBasePartitions = [];

  const coordinator = new GlobalIndexLifecycleCoordinator({
    ...options,
    fetchBasePartitionBatch: async ({tableName, partitionId, cursorPk, batchSize}) => {
      const db = dbs.get(partitionId);
      const cursorNum = cursorPk ? Number(cursorPk) : 0;
      return db.prepare(
        `SELECT * FROM ${tableName} WHERE order_id > ? ORDER BY order_id ASC LIMIT ?`,
      ).all(cursorNum, batchSize);
    },
    verifyBaseRowImage: async ({tableName, partitionId, pkValues}) => {
      const db = dbs.get(partitionId);
      return db.prepare(
        `SELECT * FROM ${tableName} WHERE order_id = ?`,
      ).get(pkValues.order_id);
    },
    writeIndexBatch: async ({datasetName, indexPartitionId, entries}) => {
      const db = dbs.get(indexPartitionId);
      for (const entry of entries) {
        const cols = Object.keys(entry);
        const quoted = cols.map((c) => `"${c}"`).join(', ');
        const qm = cols.map(() => '?').join(', ');
        db.prepare(
          `INSERT OR REPLACE INTO "${datasetName}" (${quoted}) VALUES (${qm})`,
        ).run(...cols.map((c) => entry[c]));
      }
    },
    executeIndexScan: async ({datasetName, indexPartitions, whereClause}) => {
      const rows = [];
      for (const p of indexPartitions) {
        const pId = typeof p === 'string' ? p : (p.partition_id || p.partitionId);
        scannedIndexPartitions.push(pId);
        const db = dbs.get(pId);
        if (db) {
          const conds = extractWhereSql(whereClause);
          const sql = `SELECT * FROM "${datasetName}" ${conds.sql ? 'WHERE ' + conds.sql : ''}`;
          rows.push(...db.prepare(sql).all(...conds.params));
        }
      }
      return rows;
    },
    executeBaseFetch: async ({tableName, basePartitionId, pkList}) => {
      fetchedBasePartitions.push(basePartitionId);
      const db = dbs.get(basePartitionId);
      if (!db) return [];
      const rows = [];
      for (const pk of pkList) {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE order_id = ?`).get(pk.order_id);
        if (row) rows.push(row);
      }
      return rows;
    },
    executeScatterGather: async ({tableName, whereClause}) => {
      const rows = [];
      const conds = extractWhereSql(whereClause);
      for (const p of basePartitions) {
        const db = dbs.get(p.partition_id);
        const sql = `SELECT * FROM ${tableName} ${conds.sql ? 'WHERE ' + conds.sql : ''}`;
        rows.push(...db.prepare(sql).all(...conds.params));
      }
      return rows;
    },
  });

  return {coordinator, scannedIndexPartitions, fetchedBasePartitions};
}

function setupTestCluster(options = {}) {
  const fixture = createClusterFixture();
  const {
    coordinator,
    scannedIndexPartitions,
    fetchedBasePartitions,
  } = createCoordinatorWithHooks(fixture, options);

  coordinator.registerBasePartitions('orders', fixture.basePartitions);
  coordinator.registerIndexPartitions('idx_orders_customer', fixture.indexPartitions);

  for (const [pId, db] of fixture.dbs.entries()) {
    coordinator.registerPartitionDatabase(pId, db);
  }

  return {
    ...fixture,
    coordinator,
    scannedIndexPartitions,
    fetchedBasePartitions,
  };
}

function insertBaseRow(cluster, row) {
  const {oracleDb, dbs} = cluster;
  const pId = row.order_id < 100 ?
    'orders_p0' :
    (row.order_id < 200 ? 'orders_p1' : 'orders_p2');
  const db = dbs.get(pId);
  const sql = 'INSERT INTO orders (order_id, customer_id, amount, created_at) VALUES (?, ?, ?, ?)';
  db.prepare(sql).run(row.order_id, row.customer_id, row.amount, row.created_at);
  oracleDb.prepare(sql).run(row.order_id, row.customer_id, row.amount, row.created_at);
}

function seedBaseClusterData(cluster) {
  const initialRows = [
    {order_id: 10, customer_id: 42, amount: 25.5, created_at: '2026-10-20'},
    {order_id: 20, customer_id: 42, amount: 45.0, created_at: '2026-10-22'},
    {order_id: 30, customer_id: 15, amount: 12.0, created_at: '2026-10-23'},
    {order_id: 110, customer_id: 42, amount: 75.0, created_at: '2026-10-26'},
    {order_id: 120, customer_id: 60, amount: 150.0, created_at: '2026-10-27'},
    {order_id: 210, customer_id: 42, amount: 99.0, created_at: '2026-10-29'},
    {order_id: 220, customer_id: 85, amount: 210.0, created_at: '2026-10-29'},
  ];
  for (const row of initialRows) {
    insertBaseRow(cluster, row);
  }
}

// ============================================================================
// JOURNEY STEP 1: FAIL-CLOSED REJECTION OF CROSS-PARTITION UNIQUE GSI
// ============================================================================

test('J5 Step 1: Reject CREATE UNIQUE GLOBAL INDEX with UNSUPPORTED_SQL_FEATURE (0A000)', async (t) => {
  const cluster = setupTestCluster();

  // Verify parseGlobalIndexDdl
  const parsed = parseGlobalIndexDdl('CREATE GLOBAL INDEX idx_test ON orders (customer_id, created_at)');
  t.equal(parsed.indexName, 'idx_test');
  t.same(parsed.columnNames, ['customer_id', 'created_at']);

  // Test SQL string DDL form
  let ddlErr = null;
  try {
    await cluster.coordinator.createGlobalIndex(
      'CREATE UNIQUE GLOBAL INDEX idx_u ON orders (customer_id)',
    );
  } catch (err) {
    ddlErr = err;
  }
  t.ok(ddlErr, 'Unique global index DDL statement rejected');
  t.equal(ddlErr?.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
  t.equal(ddlErr?.sqlState, GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED);
  t.match(ddlErr?.message, /unique/i);

  // Test parsed AST object form
  let astErr = null;
  try {
    await cluster.coordinator.createGlobalIndex({
      indexName: 'idx_u2',
      tableName: 'orders',
      columnNames: ['customer_id'],
      isGlobal: true,
      isUnique: true,
    });
  } catch (err) {
    astErr = err;
  }
  t.ok(astErr, 'Unique global index definition object rejected');
  t.equal(astErr?.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
  t.equal(astErr?.sqlState, GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED);

  // Verify direct SQLParser rejection
  let parserErr = null;
  try {
    new SQLParser('CREATE UNIQUE GLOBAL INDEX idx_u3 ON orders (customer_id)').parse();
  } catch (err) {
    parserErr = err;
  }
  t.ok(parserErr, 'SQLParser rejects CREATE UNIQUE GLOBAL INDEX');
  t.equal(parserErr?.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
  t.equal(parserErr?.sqlState, GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED);

  // Verify SQLQueryEngine rejection through public SQL entrypoint
  const cache = createMockSystemCache(
    [{table_name: 'orders', primaryKey: 'order_id'}],
    [
      {
        partition_id: 'orders_p0',
        table_name: 'orders',
        partition_key_start: null,
        partition_key_end: 100,
      },
    ],
  );
  const indexService = new IndexService({
    globalIndexCoordinator: cluster.coordinator,
  });
  const engine = new SQLQueryEngine({
    systemCache: cache,
    indexService,
    messageRouter: createMockMessageRouter(),
  });
  const engineResult = await engine.executeQuery(
    'CREATE UNIQUE GLOBAL INDEX idx_u4 ON orders (customer_id)',
  );
  t.equal(engineResult.success, false, 'SQLQueryEngine rejects CREATE UNIQUE GLOBAL INDEX');
  t.equal(engineResult.errorCode, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
});

// ============================================================================
// JOURNEY STEP 2 & 3: NON-CO-LOCATED DATA, WRITE_ONLY/BACKFILLING READ FALLBACK
// & SYNCHRONOUS TX1 MAINTENANCE
// ============================================================================

test('J5 Step 2 & 3: WRITE_ONLY/BACKFILLING fallback to scatter-gather and sync writes', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  // Verify non-co-located placement across base partitions
  const p0Rows = cluster.dbs.get('orders_p0').prepare('SELECT * FROM orders').all();
  const p1Rows = cluster.dbs.get('orders_p1').prepare('SELECT * FROM orders').all();
  const p2Rows = cluster.dbs.get('orders_p2').prepare('SELECT * FROM orders').all();

  t.equal(p0Rows.length, 3, 'orders_p0 has 3 rows');
  t.equal(p1Rows.length, 2, 'orders_p1 has 2 rows');
  t.equal(p2Rows.length, 2, 'orders_p2 has 2 rows');

  // Verify customer 42 is non-co-located across p0, p1, and p2
  t.ok(p0Rows.some((r) => r.customer_id === 42), 'customer 42 on p0');
  t.ok(p1Rows.some((r) => r.customer_id === 42), 'customer 42 on p1');
  t.ok(p2Rows.some((r) => r.customer_id === 42), 'customer 42 on p2');

  // Defer backfill so index remains in BACKFILLING / WRITE_ONLY
  const createResult = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      deferBackfill: true,
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  t.equal(createResult.state, GLOBAL_INDEX_STATE.BACKFILLING);

  // 1. Reads during BACKFILLING must fall back to scatter-gather and match oracle
  const initialRead = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 42},
    orderBy: 'order_id ASC',
  });

  const oracleInitial = cluster.oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY order_id ASC',
  ).all(42);

  t.same(initialRead, oracleInitial, 'Read in BACKFILLING matches oracle via scatter-gather');
  t.equal(cluster.scannedIndexPartitions.length, 0, 'Zero index partitions scanned in Stage 1');

  // 2. Concurrent base INSERT synchronously maintains global index partition
  const newRow = {order_id: 15, customer_id: 42, amount: 99.0, created_at: '2026-10-30'};
  await cluster.coordinator.executeTransactionalWrite({
    statementType: 'INSERT',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    afterRows: [newRow],
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      cluster.dbs.get('orders_p0').prepare(
        'INSERT INTO orders VALUES (?, ?, ?, ?)',
      ).run(newRow.order_id, newRow.customer_id, newRow.amount, newRow.created_at);
      cluster.oracleDb.prepare(
        'INSERT INTO orders VALUES (?, ?, ?, ?)',
      ).run(newRow.order_id, newRow.customer_id, newRow.amount, newRow.created_at);
    },
  });

  // Verify sync index entry on __gsi_orders_idx_customer_p0 (< 50)
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const entryP0 = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(15);

  t.ok(entryP0, 'New row 15 synchronously maintained in index partition p0');
  t.equal(entryP0.customer_id, 42);

  // 3. Concurrent base UPDATE (moving customer_id from 42 to 75 across index partitions)
  const oldRow = {order_id: 10, customer_id: 42, amount: 25.5, created_at: '2026-10-20'};
  const updatedRow = {order_id: 10, customer_id: 75, amount: 35.0, created_at: '2026-10-20'};

  await cluster.coordinator.executeTransactionalWrite({
    statementType: 'UPDATE',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    beforeRows: [oldRow],
    afterRows: [updatedRow],
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      cluster.dbs.get('orders_p0').prepare(
        'UPDATE orders SET customer_id = ?, amount = ? WHERE order_id = ?',
      ).run(75, 35.0, 10);
      cluster.oracleDb.prepare(
        'UPDATE orders SET customer_id = ?, amount = ? WHERE order_id = ?',
      ).run(75, 35.0, 10);
    },
  });

  const oldEntry = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(10);
  t.notOk(oldEntry, 'Old entry removed from index partition p0');

  const idxP1 = cluster.dbs.get('__gsi_orders_idx_customer_p1');
  const newEntry = idxP1.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(10);
  t.ok(newEntry, 'Updated entry moved to index partition p1 (customer_id 75 >= 50)');
  t.equal(newEntry.customer_id, 75);

  // 4. Concurrent base DELETE
  await cluster.coordinator.executeTransactionalWrite({
    statementType: 'DELETE',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    beforeRows: [updatedRow],
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      cluster.dbs.get('orders_p0').prepare('DELETE FROM orders WHERE order_id = ?').run(10);
      cluster.oracleDb.prepare('DELETE FROM orders WHERE order_id = ?').run(10);
    },
  });

  const deletedEntry = idxP1.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(10);
  t.notOk(deletedEntry, 'Deleted row removed from index partition p1');
});

// ============================================================================
// JOURNEY STEP 4: INTERRUPT & RESUME BACKFILL CONVERGING TO READ_WRITE
// ============================================================================

test('J5 Step 4: Interruption, resume, and clean convergence to READ_WRITE', async (t) => {
  const cluster = setupTestCluster({
    batchSize: 2,
  });
  seedBaseClusterData(cluster);

  let yieldCount = 0;
  const run1 = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
      backfillOptions: {
        shouldYield: () => {
          yieldCount++;
          return yieldCount >= 1; // Yield after first batch
        },
      },
    },
  );

  t.equal(run1.interrupted, true, 'Backfill yielded mid-execution');
  const midCatalog = cluster.coordinator.getCatalogRecord('idx_orders_customer');
  t.equal(midCatalog.state, GLOBAL_INDEX_STATE.BACKFILLING);
  t.equal(midCatalog.backfillCursorPartitionId, 'orders_p0');
  t.ok(midCatalog.backfillCursorPk, 'Durable cursor saved');

  // Resume from checkpoint to completion
  const run2 = await cluster.coordinator.resumeBackfill('idx_orders_customer');
  t.equal(run2.completed, true, 'Resumed backfill completed');

  const finalCatalog = cluster.coordinator.getCatalogRecord('idx_orders_customer');
  t.equal(finalCatalog.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Transitioned to READ_WRITE');

  // Verify total index rows equals total base rows (7 initial base rows)
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const idxP1 = cluster.dbs.get('__gsi_orders_idx_customer_p1');
  const rowsP0 = idxP0.prepare('SELECT * FROM __idx_orders_idx_orders_customer').all();
  const rowsP1 = idxP1.prepare('SELECT * FROM __idx_orders_idx_orders_customer').all();

  t.equal(rowsP0.length + rowsP1.length, 7, 'Exact row count converged with zero duplicates');
});

// ============================================================================
// JOURNEY STEP 5: READ ROUTING & CURRENT-OWNER RESOLUTION ON PARTITION SPLIT
// ============================================================================

test('J5 Step 5: READ_WRITE routing and current-owner Stage 2 resolution on split', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  cluster.scannedIndexPartitions.length = 0;
  cluster.fetchedBasePartitions.length = 0;

  // 1. Point query: WHERE customer_id = 42
  const results42 = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 42},
    orderBy: 'order_id ASC',
  });

  const oracle42 = cluster.oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY order_id ASC',
  ).all(42);

  t.same(results42, oracle42, 'Stage 1 + Stage 2 results match SQLite oracle exactly');

  // Assert Stage 1 scanned ONLY index partition p0 (< 50)
  t.same(
    cluster.scannedIndexPartitions,
    ['__gsi_orders_idx_customer_p0'],
    'Stage 1 routed only to index partition p0',
  );

  // 2. Compound prefix + range query: WHERE customer_id = 42 AND created_at >= '2026-10-25'
  cluster.scannedIndexPartitions.length = 0;
  const resultsRange = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {
      customer_id: 42,
      created_at: {operator: '>=', value: '2026-10-25'},
    },
    orderBy: 'order_id ASC',
  });

  const oracleRange = cluster.oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ? AND created_at >= ? ORDER BY order_id ASC',
  ).all(42, '2026-10-25');

  t.same(resultsRange, oracleRange, 'Prefix + range query matches oracle');
  t.same(cluster.scannedIndexPartitions, ['__gsi_orders_idx_customer_p0']);

  // 3. Simulate base partition split:
  // Move row order_id: 20 from orders_p0 to orders_p2 without touching stored __base_partition_id
  cluster.dbs.get('orders_p0').prepare('DELETE FROM orders WHERE order_id = ?').run(20);
  cluster.dbs.get('orders_p2').prepare(
    'INSERT INTO orders VALUES (?, ?, ?, ?)',
  ).run(20, 42, 45.0, '2026-10-22');

  // Verify stored index entry still has stale __base_partition_id = 'orders_p0'
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const storedEntry = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(20);
  t.equal(storedEntry.__base_partition_id, 'orders_p0', 'Stored index entry has stale partition id');

  // Query must resolve current owner (orders_p2) and recover live row
  const postSplitRead = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 42},
    orderBy: 'order_id ASC',
  });

  t.same(postSplitRead, oracle42, 'Current owner resolution returns complete live rows after split');
  t.ok(postSplitRead.some((r) => r.order_id === 20), 'Migrated row 20 is present');
});

// ============================================================================
// JOURNEY STEP 6: TX1 TRANSACTIONAL ATOMICITY AND ROLLBACK
// ============================================================================

test('J5 Step 6: TX1 atomicity - aborted transaction rolls back base and index mutations', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  const stagedRow = {order_id: 99, customer_id: 42, amount: 88.0, created_at: '2026-10-30'};

  // Inject failure
  await t.rejects(
    cluster.coordinator.executeTransactionalWrite({
      statementType: 'INSERT',
      tableName: 'orders',
      basePartitionId: 'orders_p0',
      afterRows: [stagedRow],
      basePrimaryKeyColumns: ['order_id'],
      baseWriteFn: async () => {
        cluster.dbs.get('orders_p0').prepare(
          'INSERT INTO orders VALUES (?, ?, ?, ?)',
        ).run(stagedRow.order_id, stagedRow.customer_id, stagedRow.amount, stagedRow.created_at);
      },
      txContext: {shouldFail: true},
    }),
    /aborted/i,
    'Transactional write rejected on injected failure',
  );

  // Inspect base partition: row 99 must not exist
  const baseCheck = cluster.dbs.get('orders_p0').prepare(
    'SELECT * FROM orders WHERE order_id = ?',
  ).get(99);
  t.notOk(baseCheck, 'Base row rolled back');

  // Inspect index partition: orphan entry must not exist
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const idxCheck = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(99);
  t.notOk(idxCheck, 'Zero orphan index entries created');
});

// ============================================================================
// JOURNEY STEP 7: FAIL-CLOSED BACKFILL ON UNRESOLVED TARGET PARTITION
// ============================================================================

test('J5 Step 7: Fail-closed backfill refuses READ_WRITE on unresolvable target', async (t) => {
  const cluster = setupTestCluster();

  // Insert a row whose customer_id (150) cannot be resolved by index partitions
  // (index partitions restricted to [0, 50) and [50, 100))
  const restrictedPartitions = [
    {
      partition_id: '__gsi_orders_idx_customer_p0',
      partition_key: 'customer_id',
      partition_key_start: 0,
      partition_key_end: 50,
    },
    {
      partition_id: '__gsi_orders_idx_customer_p1',
      partition_key: 'customer_id',
      partition_key_start: 50,
      partition_key_end: 100,
    },
  ];
  cluster.coordinator.registerIndexPartitions('idx_fail', restrictedPartitions);

  insertBaseRow(cluster, {
    order_id: 15,
    customer_id: 150, // exceeds range [0, 100)
    amount: 10.0,
    created_at: '2026-10-30',
  });

  await t.rejects(
    cluster.coordinator.createGlobalIndex(
      'CREATE GLOBAL INDEX idx_fail ON orders (customer_id)',
      {
        basePrimaryKeyColumns: ['order_id'],
        columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER'},
      },
    ),
    /Unresolved target index partition/i,
    'Backfill fails closed when target index partition cannot be resolved',
  );

  const record = cluster.coordinator.getCatalogRecord('idx_fail');
  t.equal(record.state, GLOBAL_INDEX_STATE.FAILED, 'Catalog state transitions to FAILED');
  t.ok(record.errorMessage || record.lastError, 'Structured error message durably recorded');

  // Reads must refuse READ_WRITE routing on FAILED index and fallback to scatter-gather
  cluster.scannedIndexPartitions.length = 0;
  const readResult = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 150},
  });

  t.equal(readResult.length, 1);
  t.equal(readResult[0].order_id, 15);
  t.equal(cluster.scannedIndexPartitions.length, 0, 'Refuses READ_WRITE routing on FAILED index');
});

// ============================================================================
// JOURNEY STEP 8: DROP INDEX FENCES STALE WORK & RECREATES SAME NAME
// ============================================================================

test('J5 Step 8: DROP INDEX fences stale backfill work and recreates cleanly', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  const created1 = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );
  t.equal(created1.generation, 1, 'Initial creation is generation 1');

  // Drop index
  const dropResult = await cluster.coordinator.dropGlobalIndex('idx_orders_customer');
  t.equal(dropResult.dropped, true, 'Index dropped successfully');

  // Verify dataset table dropped from physical partitions
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const tableCheck = idxP0.prepare(
    'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'__idx_orders_idx_orders_customer\'',
  ).get();
  t.notOk(tableCheck, 'Physical index dataset dropped');

  // Recreate index under same name
  const created2 = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  t.equal(created2.generation, 2, 'Recreated index increments generation to 2');
  t.equal(created2.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Recreated index reaches READ_WRITE');
});

// ============================================================================
// JOURNEY STEP 9: WRITE COST & PARTICIPANT FANOUT MEASUREMENTS (0, 1, 2 GSIs)
// ============================================================================

test('J5 Step 9: Deterministic participant fanout and write cost for 0, 1, and 2 GSIs', async (t) => {
  const cluster = setupTestCluster();
  const usersDb = new Database(':memory:');
  cluster.coordinator.registerPartitionDatabase('users_p0', usersDb);

  // Table with 0 global indexes
  const write0 = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'INSERT',
    tableName: 'users',
    basePartitionId: 'users_p0',
    afterRows: [{id: 1, name: 'Alice'}],
  });
  t.equal(write0.participantFanout, 1, '0 indexes = 1 participant (fanout 1)');

  // Add 1 global index on orders
  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  const write1 = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'INSERT',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    afterRows: [{order_id: 1, customer_id: 42, amount: 10.0, created_at: '2026-10-30'}],
    basePrimaryKeyColumns: ['order_id'],
  });
  t.equal(write1.participantFanout, 2, '1 index = 2 participants (fanout 2: base + 1 index partition)');

  // Add 2nd global index on orders (amount)
  const amountPartitions = [
    {
      partition_id: '__gsi_orders_idx_amount_p0',
      partition_key: 'amount',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  cluster.coordinator.registerIndexPartitions('idx_orders_amount', amountPartitions);
  const amountDb = new Database(':memory:');
  cluster.coordinator.registerPartitionDatabase('__gsi_orders_idx_amount_p0', amountDb);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_amount ON orders (amount)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', amount: 'REAL'},
    },
  );

  const write2 = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'INSERT',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    afterRows: [{order_id: 2, customer_id: 42, amount: 20.0, created_at: '2026-10-30'}],
    basePrimaryKeyColumns: ['order_id'],
  });
  t.equal(write2.participantFanout, 3, '2 indexes = 3 participants (fanout 3: base + 2 index partitions)');

  const metrics = cluster.coordinator.getMetrics();
  t.equal(metrics.fanoutByActiveIndexCount[0], 1);
  t.equal(metrics.fanoutByActiveIndexCount[1], 2);
  t.equal(metrics.fanoutByActiveIndexCount[2], 3);
  t.ok(metrics.latencyHistory.length >= 3, 'Recorded latency history for all writes');
});

// ============================================================================
// JOURNEY STEP 10: PUBLIC SQL ENTRYPOINT & INDEXSERVICE END-TO-END LIFECYCLE
// ============================================================================

test('J5 Step 10: Public SQL CREATE GLOBAL INDEX & DROP INDEX end-to-end wiring', async (t) => {
  const cluster = setupTestCluster();

  // 1. Verify SQLParser parsing of CREATE GLOBAL INDEX
  const parsedAst = new SQLParser(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
  ).parse();
  t.equal(parsedAst.type, 'CREATE_INDEX', 'Parsed AST type is CREATE_INDEX');
  t.equal(parsedAst.indexName, 'idx_orders_customer');
  t.equal(parsedAst.tableName, 'orders');
  t.same(parsedAst.columns, ['customer_id', 'created_at']);
  t.equal(parsedAst.unique, false);
  t.equal(parsedAst.isGlobal, true);
  t.equal(parsedAst.global, true);
  t.equal(parsedAst.ifNotExists, false);
  t.equal(parsedAst.indexType, 'btree');

  // Verify SQLParser with IF NOT EXISTS
  const ifNotExistsAst = new SQLParser(
    'CREATE GLOBAL INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)',
  ).parse();
  t.equal(ifNotExistsAst.ifNotExists, true, 'ifNotExists flag parsed correctly');

  // 2. Verify SQLParser fail-closed feature rejections
  t.throws(
    () => new SQLParser('CREATE GLOBAL INDEX CONCURRENTLY idx_c ON orders (customer_id)').parse(),
    /CREATE INDEX CONCURRENTLY is not supported/,
    'SQLParser rejects CONCURRENTLY with UNSUPPORTED_SQL_FEATURE',
  );

  t.throws(
    () => new SQLParser('CREATE GLOBAL INDEX idx_h ON orders USING hash (customer_id)').parse(),
    /Index access method 'hash' is not supported/,
    'SQLParser rejects USING hash with UNSUPPORTED_SQL_FEATURE',
  );

  t.throws(
    () => new SQLParser('CREATE GLOBAL INDEX idx_expr ON orders (lower(customer_id))').parse(),
    /Expression indexes are not supported/,
    'SQLParser rejects expression columns with UNSUPPORTED_SQL_FEATURE',
  );

  t.throws(
    () => new SQLParser('CREATE GLOBAL INDEX idx_empty ON orders ()').parse(),
    /Index column list cannot be empty/,
    'SQLParser rejects empty column list with UNSUPPORTED_SQL_FEATURE',
  );

  // 3. Verify SQLQueryEngine execution with IndexService + Coordinator
  const cache = createMockSystemCache(
    [{table_name: 'orders', primaryKey: 'order_id'}],
    [
      {
        partition_id: 'orders_p0',
        table_name: 'orders',
        partition_key_start: null,
        partition_key_end: 100,
      },
    ],
  );
  const indexService = new IndexService({
    globalIndexCoordinator: cluster.coordinator,
  });
  const engine = new SQLQueryEngine({
    systemCache: cache,
    indexService,
    messageRouter: createMockMessageRouter(),
  });

  // Execute CREATE GLOBAL INDEX via public engine
  const createResult = await engine.executeQuery(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
  );
  t.equal(createResult.success, true, 'Public SQL CREATE GLOBAL INDEX succeeds');
  t.equal(createResult.operation, 'CREATE_INDEX');
  t.equal(createResult.indexName, 'idx_orders_customer');
  t.equal(createResult.tableName, 'orders');

  // Verify IndexService reflect cached index metadata
  const cachedMeta = indexService.getIndex('idx_orders_customer');
  t.ok(cachedMeta, 'IndexService reflects created global index');
  t.equal(cachedMeta.isGlobal, true, 'Index is flagged as global');
  t.equal(cachedMeta.state, GLOBAL_INDEX_STATE.READ_WRITE);

  const tableIndices = indexService.getIndicesForTable('orders');
  t.ok(
    tableIndices.some((idx) => idx.indexName === 'idx_orders_customer'),
    'getIndicesForTable reflects global index',
  );

  // Verify idempotent CREATE GLOBAL INDEX IF NOT EXISTS
  const ifNotExistsResult = await engine.executeQuery(
    'CREATE GLOBAL INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id, created_at)',
  );
  t.equal(ifNotExistsResult.success, true, 'Idempotent CREATE GLOBAL INDEX IF NOT EXISTS succeeds');

  // Execute DROP INDEX via public engine
  const dropResult = await engine.executeQuery('DROP INDEX idx_orders_customer');
  t.equal(dropResult.success, true, 'Public SQL DROP INDEX succeeds');
  t.equal(dropResult.operation, 'DROP_INDEX');
  t.equal(dropResult.indexName, 'idx_orders_customer');
  t.equal(dropResult.dropped, true);

  // Verify cleaned up in both IndexService and Coordinator
  t.equal(indexService.getIndex('idx_orders_customer'), null, 'Removed from IndexService cache');
  t.equal(
    cluster.coordinator.getCatalogRecord('idx_orders_customer'),
    null,
    'Removed from coordinator',
  );
});

// ============================================================================
// JOURNEY STEP 11: NON-KEY-CHANGING UPDATE BYPASSES INDEX MAINTENANCE
// ============================================================================

test('J5 Step 11: Non-key-changing UPDATE bypasses index maintenance with fanout 1', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  // Row order_id: 110 on orders_p1 with customer_id: 42, amount: 75.0, created_at: '2026-10-26'
  const oldRow = {order_id: 110, customer_id: 42, amount: 75.0, created_at: '2026-10-26'};
  const newRow = {order_id: 110, customer_id: 42, amount: 199.95, created_at: '2026-10-26'};

  // Get index entry before update
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const entryBefore = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(110);
  t.ok(entryBefore, 'Index entry exists before non-key update');

  const writeResult = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'UPDATE',
    tableName: 'orders',
    basePartitionId: 'orders_p1',
    beforeRows: [oldRow],
    afterRows: [newRow],
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      cluster.dbs.get('orders_p1').prepare(
        'UPDATE orders SET amount = ? WHERE order_id = ?',
      ).run(199.95, 110);
    },
  });

  t.equal(writeResult.participantFanout, 1, 'Non-key update involves only base partition (fanout 1)');
  t.same(writeResult.enlistedPartitions, ['orders_p1'], 'Only base partition enlisted');

  // Verify index entry unchanged
  const entryAfter = idxP0.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(110);
  t.same(entryAfter, entryBefore, 'Index entry is byte-for-byte untouched');

  // Query via GSI (WHERE customer_id = 42) to ensure Stage 2 fetches the updated amount
  const readRows = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 42},
    orderBy: 'order_id ASC',
  });
  const updatedReadRow = readRows.find((r) => r.order_id === 110);
  t.ok(updatedReadRow, 'Row 110 is returned');
  t.equal(updatedReadRow.amount, 199.95, 'Updated amount is served via two-stage index query');
});

// ============================================================================
// JOURNEY STEP 12: MULTI-ROW TRANSACTIONAL UPDATE AND DELETE MAINTENANCE
// ============================================================================

test('J5 Step 12: Multi-row transactional UPDATE and DELETE maintain global index accurately', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  // Multi-row UPDATE on orders_p0:
  // Move order_id: 10 from customer 42 (<50) to customer 80 (>=50)
  // Move order_id: 20 from customer 42 (<50) to customer 90 (>=50)
  const oldRows = [
    {order_id: 10, customer_id: 42, amount: 25.5, created_at: '2026-10-20'},
    {order_id: 20, customer_id: 42, amount: 45.0, created_at: '2026-10-22'},
  ];
  const newRows = [
    {order_id: 10, customer_id: 80, amount: 125.5, created_at: '2026-10-20'},
    {order_id: 20, customer_id: 90, amount: 145.0, created_at: '2026-10-22'},
  ];

  const updateResult = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'UPDATE',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    beforeRows: oldRows,
    afterRows: newRows,
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      const db = cluster.dbs.get('orders_p0');
      for (const nr of newRows) {
        db.prepare('UPDATE orders SET customer_id = ?, amount = ? WHERE order_id = ?').run(
          nr.customer_id,
          nr.amount,
          nr.order_id,
        );
      }
    },
  });

  t.ok(updateResult.success, 'Multi-row update succeeded');
  const idxP0 = cluster.dbs.get('__gsi_orders_idx_customer_p0');
  const idxP1 = cluster.dbs.get('__gsi_orders_idx_customer_p1');

  t.notOk(
    idxP0.prepare('SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?').get(10),
    'Order 10 deleted from index p0',
  );
  t.notOk(
    idxP0.prepare('SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?').get(20),
    'Order 20 deleted from index p0',
  );

  const newEntry10 = idxP1.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(10);
  t.ok(newEntry10, 'Order 10 inserted in index p1');
  t.equal(newEntry10.customer_id, 80);

  const newEntry20 = idxP1.prepare(
    'SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?',
  ).get(20);
  t.ok(newEntry20, 'Order 20 inserted in index p1');
  t.equal(newEntry20.customer_id, 90);

  // Multi-row DELETE: delete order 10 and order 20
  const deleteResult = await cluster.coordinator.executeTransactionalWrite({
    statementType: 'DELETE',
    tableName: 'orders',
    basePartitionId: 'orders_p0',
    beforeRows: newRows,
    basePrimaryKeyColumns: ['order_id'],
    baseWriteFn: async () => {
      const db = cluster.dbs.get('orders_p0');
      for (const r of newRows) {
        db.prepare('DELETE FROM orders WHERE order_id = ?').run(r.order_id);
      }
    },
  });

  t.ok(deleteResult.success, 'Multi-row delete succeeded');
  t.notOk(
    idxP1.prepare('SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?').get(10),
    'Order 10 deleted from index p1',
  );
  t.notOk(
    idxP1.prepare('SELECT * FROM __idx_orders_idx_orders_customer WHERE __base_pk_order_id = ?').get(20),
    'Order 20 deleted from index p1',
  );
});

// ============================================================================
// JOURNEY STEP 13: PARTICIPANT UNAVAILABILITY & FAIL-CLOSED ROLLBACK
// ============================================================================

test('J5 Step 13: Fail-closed rejection and rollback when index participant is unavailable', async (t) => {
  const cluster = setupTestCluster();
  seedBaseClusterData(cluster);

  await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );

  // Save participant DB and temporarily corrupt/remove it
  const targetPartition = '__gsi_orders_idx_customer_p0';
  const realDb = cluster.coordinator.partitionDatabases.get(targetPartition);
  cluster.coordinator.partitionDatabases.set(targetPartition, null);

  const failingRow = {order_id: 999, customer_id: 42, amount: 50.0, created_at: '2026-10-30'};
  let writeErr = null;
  let baseWriteExecuted = false;

  try {
    await cluster.coordinator.executeTransactionalWrite({
      statementType: 'INSERT',
      tableName: 'orders',
      basePartitionId: 'orders_p0',
      afterRows: [failingRow],
      basePrimaryKeyColumns: ['order_id'],
      baseWriteFn: async () => {
        baseWriteExecuted = true;
        cluster.dbs.get('orders_p0').prepare(
          'INSERT INTO orders VALUES (?, ?, ?, ?)',
        ).run(
          failingRow.order_id,
          failingRow.customer_id,
          failingRow.amount,
          failingRow.created_at,
        );
      },
    });
  } catch (err) {
    writeErr = err;
  }

  t.ok(writeErr, 'Transactional write failed when participant was unavailable');
  t.equal(writeErr?.code, 'INDEX_PARTICIPANT_UNAVAILABLE', 'Typed error code INDEX_PARTICIPANT_UNAVAILABLE');
  t.match(writeErr?.message, /unavailable/i);
  t.equal(baseWriteExecuted, false, 'Base write function was not executed due to pre-transaction verification');

  // Verify base table has no row 999
  const rowCheck = cluster.dbs.get('orders_p0').prepare(
    'SELECT * FROM orders WHERE order_id = ?',
  ).get(999);
  t.notOk(rowCheck, 'Base table remains clean');

  // Restore participant DB
  cluster.coordinator.partitionDatabases.set(targetPartition, realDb);
});

// ============================================================================
// JOURNEY STEP 14: STALE GENERATION BACKFILL FENCING ON DROP AND RECREATE
// ============================================================================

test('J5 Step 14: Stale generation backfill fencing on index drop and recreation', async (t) => {
  const cluster = setupTestCluster({
    batchSize: 1,
  });
  seedBaseClusterData(cluster);

  // Create index with deferBackfill to simulate paused/interrupted generation 1
  const gen1 = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      deferBackfill: true,
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );
  t.equal(gen1.generation, 1, 'Initial creation is generation 1');

  const staleRecord = cluster.coordinator.getCatalogRecord('idx_orders_customer');
  t.equal(staleRecord.index_generation, 1);

  // Drop index idx_orders_customer
  await cluster.coordinator.dropGlobalIndex('idx_orders_customer');

  // Recreate index idx_orders_customer as generation 2
  const gen2 = await cluster.coordinator.createGlobalIndex(
    'CREATE GLOBAL INDEX idx_orders_customer ON orders (customer_id, created_at)',
    {
      basePrimaryKeyColumns: ['order_id'],
      columnTypes: {order_id: 'INTEGER', customer_id: 'INTEGER', created_at: 'TEXT'},
    },
  );
  t.equal(gen2.generation, 2, 'Recreated index is generation 2');
  t.equal(gen2.state, GLOBAL_INDEX_STATE.READ_WRITE);

  // Attempt to execute backfill using the stale generation 1 record and generation 1 marker
  const fencedResult = await cluster.coordinator._runBackfillToCompletion(
    staleRecord,
    1, // generation 1
    {},
  );

  t.equal(fencedResult.fenced, true, 'Stale backfill was fenced');
  t.equal(fencedResult.generation, 1);

  // Verify generation 2 catalog record is completely preserved and undisturbed
  const liveRecord = cluster.coordinator.getCatalogRecord('idx_orders_customer');
  t.equal(liveRecord.index_generation, 2, 'Live record remains generation 2');
  t.equal(liveRecord.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Live record remains READ_WRITE');

  // Verify live queries continue to work against generation 2
  const results = await cluster.coordinator.planAndExecuteRead({
    tableName: 'orders',
    where: {customer_id: 42},
    orderBy: 'order_id ASC',
  });
  t.ok(results.length > 0, 'Read queries continue working against generation 2');
});
