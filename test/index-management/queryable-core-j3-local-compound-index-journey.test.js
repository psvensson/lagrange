/**
 * Unit J3: Local and compound indexes lifecycle, fail-closed materialization,
 * uniqueness, hydration & planner journey.
 *
 * Implements the J3 specification from solve/specs/release-0-3-queryable-core/user-journeys.md.
 */

import Database from 'better-sqlite3';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
import {createMockSystemCache} from '../query/sql-query-engine-test-support.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {QueryOptimizer} from '../../src/index-management/query-optimizer.js';
import {DistributedQueryPlanner} from
  '../../src/query/distributed/distributed-query-planner.js';
import {TABLES} from '../../src/constants/index.js';

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

const ORDERS_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'customer_id', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
    {name: 'created_at', type: 'INTEGER'},
    {name: 'external_ref', type: 'TEXT'},
  ],
};

/**
 * Create an initialized and admitted PartitionService instance.
 * @param {string} partitionId - Partition ID.
 * @param {string} replicaId - Replica ID.
 * @return {Promise<PartitionService>} Initialized partition service.
 */
async function createTestPartition(partitionId, replicaId) {
  const ps = new PartitionService(withFoundingStamp({
    partitionId,
    tableId: 'orders',
    tableName: 'orders',
    replicaId,
    replicaIds: [replicaId],
    nodeId: 'test-node',
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
    dbPath: ':memory:',
    schema: ORDERS_SCHEMA,
  }));
  await ps.initialize();
  await resumeFixtureParticipantAdmission(ps);
  return ps;
}

/**
 * Create an in-memory control-plane system table gateway.
 * @param {Array<Object>} [initialTables] - Tables list.
 * @param {Array<Object>} [initialPartitions] - Partitions list.
 * @return {Object} System table gateway double.
 */
function createTestSystemGateway(initialTables = [], initialPartitions = []) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tables (table_id TEXT PRIMARY KEY, table_name TEXT, partition_key TEXT);
    CREATE TABLE partitions (partition_id TEXT PRIMARY KEY, table_id TEXT, table_name TEXT);
    CREATE TABLE indices (
      index_id TEXT PRIMARY KEY,
      table_id TEXT,
      table_name TEXT,
      index_name TEXT,
      column_names TEXT,
      index_type TEXT,
      is_unique INTEGER,
      unique_flag INTEGER,
      state TEXT,
      created_at INTEGER
    );
  `);
  const insTable = db.prepare(
    'INSERT INTO tables (table_id, table_name, partition_key) VALUES (?, ?, ?)',
  );
  for (const t of initialTables) {
    insTable.run(t.table_id || t.table_name, t.table_name, t.partition_key || 'id');
  }
  const insPart = db.prepare(
    'INSERT INTO partitions (partition_id, table_id, table_name) VALUES (?, ?, ?)',
  );
  for (const p of initialPartitions) {
    insPart.run(p.partition_id, p.table_id || p.table_name, p.table_name);
  }

  return {
    db,
    async readRows(tableName, sql, params = []) {
      const rows = db.prepare(sql).all(...params);
      return {rows};
    },
    async insertSystemTableRow(tableName, data) {
      if (tableName === TABLES.INDICES) {
        db.prepare(`
          INSERT OR REPLACE INTO indices (
            index_id, table_id, table_name, index_name, column_names,
            index_type, is_unique, unique_flag, state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.index_id,
          data.table_id,
          data.table_name,
          data.index_name,
          data.column_names,
          data.index_type,
          data.is_unique,
          data.unique ? 1 : 0,
          data.state || 'READY',
          data.created_at,
        );
      }
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      if (tableName === TABLES.INDICES) {
        db.prepare('DELETE FROM indices WHERE index_name = ?').run(whereClause.index_name);
      }
      return {success: true};
    },
    resolveCdcIntegrationService() {
      return {};
    },
  };
}

/**
 * Handle delivery execution for partition queries.
 * @param {Object} partition - Partition service.
 * @param {Object} message - Query message.
 * @return {Promise<Object>} Execution payload.
 */
async function executePartitionMessage(partition, message) {
  if (partition.db?.prepare) {
    const isSelect = message.sql.trim().toUpperCase().startsWith('SELECT');
    if (isSelect) {
      const rows = partition.db.prepare(message.sql).all(...(message.params || []));
      return {success: true, rows, rowCount: rows.length};
    }
    const info = partition.db.prepare(message.sql).run(...(message.params || []));
    return {success: true, changes: info.changes, lastInsertRowid: info.lastInsertRowid};
  }
  return partition.executeQuery(message.sql, message.params || []);
}

/**
 * Create a message router that forwards partition queries to local PartitionServices.
 * @param {Map<string, PartitionService>} partitionsMap - Map of partitionId to service.
 * @return {Object} Message router double.
 */
function createRealPartitionMessageRouter(partitionsMap) {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[1] === 'partition' ? parts[2] : parts[1];
      const partition = partitionsMap.get(partitionId) || partitionsMap.get(parts[2]);
      if (partition && message.type === 'QUERY') {
        try {
          const result = await executePartitionMessage(partition, message);
          return buildDeliveryEnvelope({acknowledged: true}, result);
        } catch (err) {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false,
            error: err.message,
          });
        }
      }
      return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
    },
  };
}

/**
 * Create an independent reference SQLite database to serve as ground-truth oracle.
 * @return {Database} Oracle database.
 */
function createOracleDatabase() {
  const oracleDb = new Database(':memory:');
  oracleDb.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id TEXT,
      status TEXT,
      created_at INTEGER,
      external_ref TEXT
    );
  `);
  return oracleDb;
}

/**
 * Populate partition and oracle databases with controlled test dataset.
 * @param {Map<string, PartitionService>} partitionsMap - Partition map.
 * @param {Database} oracleDb - Oracle database.
 */
function populateTestOrders(partitionsMap, oracleDb) {
  const p1 = partitionsMap.get('orders-p1');
  const p2 = partitionsMap.get('orders-p2');

  const p1Rows = [
    {id: 1, customer_id: 'cust-101', status: 'PENDING', created_at: 1000, external_ref: 'REF-001'},
    {id: 2, customer_id: 'cust-101', status: 'COMPLETED', created_at: 1200, external_ref: 'REF-002'},
    {id: 3, customer_id: 'cust-101', status: 'COMPLETED', created_at: 1600, external_ref: 'REF-003'},
    {id: 4, customer_id: 'cust-102', status: 'CANCELLED', created_at: 1100, external_ref: 'REF-004'},
  ];

  const p2Rows = [
    {id: 51, customer_id: 'cust-101', status: 'COMPLETED', created_at: 1800, external_ref: 'REF-051'},
    {id: 52, customer_id: 'cust-101', status: 'SHIPPED', created_at: 1900, external_ref: 'REF-052'},
    {id: 53, customer_id: 'cust-103', status: 'COMPLETED', created_at: 1400, external_ref: 'REF-053'},
    {id: 54, customer_id: 'cust-104', status: 'PENDING', created_at: 1700, external_ref: 'REF-054'},
  ];

  const insertSql = `
    INSERT INTO orders (id, customer_id, status, created_at, external_ref)
    VALUES (?, ?, ?, ?, ?)
  `;

  const oracleStmt = oracleDb.prepare(insertSql);
  const p1Stmt = p1.db.prepare(insertSql);
  const p2Stmt = p2.db.prepare(insertSql);

  for (const r of p1Rows) {
    p1Stmt.run(r.id, r.customer_id, r.status, r.created_at, r.external_ref);
    oracleStmt.run(r.id, r.customer_id, r.status, r.created_at, r.external_ref);
  }
  for (const r of p2Rows) {
    p2Stmt.run(r.id, r.customer_id, r.status, r.created_at, r.external_ref);
    oracleStmt.run(r.id, r.customer_id, r.status, r.created_at, r.external_ref);
  }
}

/**
 * Step 1: Verify CREATE INDEX physical materialization and catalog persistence.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {PartitionService} p1 - Partition 1.
 * @param {PartitionService} p2 - Partition 2.
 * @param {Object} t - Tap assert.
 */
async function verifyIndexCreationAndMaterialization(engine, p1, p2, t) {
  const result = await engine.executeQuery(
    'CREATE INDEX idx_orders_cust_status_created ON orders (customer_id, status, created_at)',
  );
  t.equal(result.success, true, 'CREATE INDEX should succeed');
  t.equal(result.indexName, 'idx_orders_cust_status_created');

  const p1Idx = p1.db.prepare(
    'SELECT name, sql FROM sqlite_master WHERE type = \'index\' AND name = ?',
  ).all('idx_orders_cust_status_created');
  const p2Idx = p2.db.prepare(
    'SELECT name, sql FROM sqlite_master WHERE type = \'index\' AND name = ?',
  ).all('idx_orders_cust_status_created');
  t.equal(p1Idx.length, 1, 'idx_orders_cust_status_created materialized in partition 1');
  t.equal(p2Idx.length, 1, 'idx_orders_cust_status_created materialized in partition 2');
  t.match(p1Idx[0].sql, /CREATE INDEX idx_orders_cust_status_created ON orders/i);
  t.match(p2Idx[0].sql, /CREATE INDEX idx_orders_cust_status_created ON orders/i);

  const indices = engine.indexService.getIndicesForTable('orders');
  t.equal(indices.length, 1);
  t.equal(indices[0].indexName, 'idx_orders_cust_status_created');
  t.same(indices[0].columnNames, ['customer_id', 'status', 'created_at']);
  t.equal(indices[0].unique, false);
}

/**
 * Step 2: Verify IF NOT EXISTS idempotency and duplicate error.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Object} t - Tap assert.
 */
async function verifyIdempotentAndDuplicateRejection(engine, t) {
  const ifNotExistsResult = await engine.executeQuery(
    'CREATE INDEX IF NOT EXISTS idx_orders_cust_status_created ON orders (customer_id, status, created_at)',
  );
  t.equal(ifNotExistsResult.success, true, 'CREATE INDEX IF NOT EXISTS should be idempotent');

  const dupResult = await engine.executeQuery(
    'CREATE INDEX idx_orders_cust_status_created ON orders (customer_id, status, created_at)',
  );
  t.equal(dupResult.success, false, 'CREATE INDEX duplicate without IF NOT EXISTS must fail closed');
  t.match(dupResult.error, /already exists/i);
}

/**
 * Verify partial-partition DDL failure rollback on orders-p1 when orders-p2 fails index creation.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {PartitionService} p1 - Partition 1.
 * @param {PartitionService} p2 - Partition 2.
 * @param {Object} t - Tap assert.
 */
async function verifyPartialPartitionRollback(engine, p1, p2, t) {
  p2.db.exec('CREATE TABLE idx_partial_fail (x INTEGER)');
  try {
    const partialFailResult = await engine.executeQuery(
      'CREATE UNIQUE INDEX idx_partial_fail ON orders (id, status)',
    );
    t.equal(partialFailResult.success, false, 'Partial partition failure must fail closed');

    const p1RolledBack = p1.db.prepare(
      'SELECT name FROM sqlite_master WHERE name = ?',
    ).all('idx_partial_fail');
    t.equal(p1RolledBack.length, 0, 'Index on partition 1 must be rolled back on partial partition failure');

    t.equal(
      engine.indexService.getIndex('orders', 'idx_partial_fail'),
      null,
      'Failed partial index must not be stored in IndexService cache',
    );
    t.equal(
      await engine.indexService.findIndexByName('idx_partial_fail'),
      null,
      'Failed partial index must not be persisted to catalog gateway',
    );
  } finally {
    p2.db.exec('DROP TABLE IF EXISTS idx_partial_fail');
  }
}

/**
 * Step 3: Verify local UNIQUE index, partition safety refusal, and partial-partition rollback.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {PartitionService} p1 - Partition 1.
 * @param {PartitionService} p2 - Partition 2.
 * @param {Object} t - Tap assert.
 */
async function verifyUniqueIndexAndNegativeWitness(engine, p1, p2, t) {
  const unScoped = await engine.executeQuery(
    'CREATE UNIQUE INDEX idx_orders_unscoped_ref ON orders (external_ref)',
  );
  t.equal(unScoped.success, false, 'Unscoped UNIQUE index without partition key must fail');
  t.equal(unScoped.errorCode, 'UNSUPPORTED_SQL_FEATURE', 'Must return UNSUPPORTED_SQL_FEATURE');
  t.match(unScoped.error, /must include partition key 'id'/i, 'Must cite partition key id');
  t.equal(
    engine.indexService.getIndex('orders', 'idx_orders_unscoped_ref'),
    null,
    'Refused unscoped index must not be in IndexService cache',
  );

  const res = await engine.executeQuery(
    'CREATE UNIQUE INDEX idx_orders_external_ref ON orders (id, external_ref)',
  );
  t.equal(res.success, true, 'CREATE UNIQUE INDEX should succeed');

  const p1U = p1.db.prepare(
    'SELECT name, sql FROM sqlite_master WHERE name = ?',
  ).all('idx_orders_external_ref');
  const p2U = p2.db.prepare(
    'SELECT name, sql FROM sqlite_master WHERE name = ?',
  ).all('idx_orders_external_ref');
  t.equal(p1U.length, 1, 'UNIQUE index physically created on partition 1');
  t.equal(p2U.length, 1, 'UNIQUE index physically created on partition 2');
  t.match(p1U[0].sql, /CREATE UNIQUE INDEX/i, 'Partition 1 SQLite DDL must preserve UNIQUE');
  t.match(p2U[0].sql, /CREATE UNIQUE INDEX/i, 'Partition 2 SQLite DDL must preserve UNIQUE');

  let uniqueViolated = false;
  try {
    p1.db.prepare(
      'INSERT INTO orders (id, customer_id, status, created_at, external_ref) VALUES (?, ?, ?, ?, ?)',
    ).run(1, 'cust-dup', 'NEW', 2000, 'REF-001');
  } catch (err) {
    uniqueViolated = true;
    t.match(err.message, /UNIQUE constraint failed/i);
  }
  t.ok(uniqueViolated, 'Partition SQLite UNIQUE constraint rejected duplicate (id, external_ref)');

  await verifyPartialPartitionRollback(engine, p1, p2, t);
}

/**
 * Step 4a & 4b: Verify leading equality and compound range queries vs Oracle.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Database} oracleDb - Oracle database.
 * @param {Object} t - Tap assert.
 */
async function verifyLeadingAndRangeQueries(engine, oracleDb, t) {
  // 4a: Leading equality
  const explainLeading = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM orders WHERE customer_id = \'cust-101\'',
  );
  t.equal(explainLeading.success, true);
  const planLeading = explainLeading.distributedPlan;
  t.equal(
    planLeading.selectedIndex?.name,
    'idx_orders_cust_status_created',
    'Leading equality selects compound index',
  );
  t.equal(planLeading.indexAccess?.scanType, 'INDEX_SCAN');
  t.same(planLeading.selectedIndex?.equalityPrefixColumns, ['customer_id']);
  t.equal(planLeading.selectedIndex?.rangeColumn, null);

  const execLeading = await engine.executeQuery(
    'SELECT * FROM orders WHERE customer_id = \'cust-101\'',
  );
  const oracleLeading = oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ?',
  ).all('cust-101');
  t.same(
    execLeading.rows.sort((a, b) => a.id - b.id),
    oracleLeading.sort((a, b) => a.id - b.id),
    'Leading equality query matches oracle results exactly',
  );

  // 4b: Compound equality prefix + range
  const explainRange = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM orders WHERE customer_id = \'cust-101\' AND status = \'COMPLETED\' AND created_at >= 1500',
  );
  t.equal(explainRange.success, true);
  const planRange = explainRange.distributedPlan;
  t.equal(planRange.selectedIndex?.name, 'idx_orders_cust_status_created');
  t.same(planRange.selectedIndex?.equalityPrefixColumns, ['customer_id', 'status']);
  t.equal(planRange.selectedIndex?.rangeColumn, 'created_at');

  const execRange = await engine.executeQuery(
    'SELECT * FROM orders WHERE customer_id = \'cust-101\' AND status = \'COMPLETED\' AND created_at >= 1500',
  );
  const oracleRange = oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ? AND status = ? AND created_at >= ?',
  ).all('cust-101', 'COMPLETED', 1500);
  t.same(
    execRange.rows.sort((a, b) => a.id - b.id),
    oracleRange.sort((a, b) => a.id - b.id),
    'Equality prefix + range query matches oracle results exactly',
  );
}

/**
 * Step 4c & 4d: Verify prefix ORDER BY and non-leading fallback vs Oracle.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Database} oracleDb - Oracle database.
 * @param {Object} t - Tap assert.
 */
async function verifyOrderAndNonLeadingQueries(engine, oracleDb, t) {
  // 4c: Prefix + ORDER BY
  const explainOrder = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM orders WHERE customer_id = \'cust-101\' AND status = \'COMPLETED\' ORDER BY created_at',
  );
  t.equal(explainOrder.success, true);
  t.equal(
    explainOrder.distributedPlan.selectedIndex?.orderBySatisfied,
    true,
    'Compound prefix order satisfies ORDER BY without filesort',
  );

  const execOrder = await engine.executeQuery(
    'SELECT * FROM orders WHERE customer_id = \'cust-101\' AND status = \'COMPLETED\' ORDER BY created_at',
  );
  const oracleOrder = oracleDb.prepare(
    'SELECT * FROM orders WHERE customer_id = ? AND status = ? ORDER BY created_at',
  ).all('cust-101', 'COMPLETED');
  t.same(execOrder.rows, oracleOrder, 'Ordered query rows match oracle order exactly');

  // 4d: Non-leading predicate only
  const explainNonLeading = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM orders WHERE status = \'COMPLETED\'',
  );
  t.equal(explainNonLeading.success, true);
  const planNonLeading = explainNonLeading.distributedPlan;
  t.equal(planNonLeading.selectedIndex, null, 'Non-leading query rejects index');
  t.equal(planNonLeading.indexAccess?.scanType, 'FULL_SCAN');
  t.ok(
    planNonLeading.rejectedIndexes.some(
      (r) => r.name === 'idx_orders_cust_status_created' && r.reason === 'MISSING_LEADING_COLUMN',
    ),
    'Rejected index diagnoses MISSING_LEADING_COLUMN',
  );

  const execNonLeading = await engine.executeQuery(
    'SELECT * FROM orders WHERE status = \'COMPLETED\'',
  );
  const oracleNonLeading = oracleDb.prepare(
    'SELECT * FROM orders WHERE status = ?',
  ).all('COMPLETED');
  t.same(
    execNonLeading.rows.sort((a, b) => a.id - b.id),
    oracleNonLeading.sort((a, b) => a.id - b.id),
    'Non-leading full scan returns complete correct rows identical to oracle',
  );
}

/**
 * Step 5: Verify new/split child partition index materialization.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Object} context - Execution context with partitions and gateway.
 * @param {Object} t - Tap assert.
 */
async function verifyChildPartitionLifecycle(engine, context, t) {
  const {partitionsMap, gateway, cache} = context;
  const p3 = await createTestPartition('orders-p3', 'orders-p3-r1');
  partitionsMap.set('orders-p3', p3);
  cache.partitions.push({
    partition_id: 'orders-p3',
    table_name: 'orders',
    partition_key_start: 100,
    partition_key_end: null,
  });
  gateway.db.prepare(
    'INSERT INTO partitions (partition_id, table_id, table_name) VALUES (?, ?, ?)',
  ).run('orders-p3', 'orders', 'orders');

  const count = await engine.indexService.ensureIndicesOnPartition('orders-p3', 'orders');
  t.equal(count, 2, 'ensureIndicesOnPartition created both indexes on child partition');

  const p3Master = p3.db.prepare(
    'SELECT name, sql FROM sqlite_master WHERE type = \'index\' AND name LIKE \'idx_orders_%\'',
  ).all();
  t.equal(p3Master.length, 2, 'Child partition has both physical indexes in sqlite_master');

  const p3Unique = p3Master.find((i) => i.name === 'idx_orders_external_ref');
  t.match(p3Unique.sql, /CREATE UNIQUE INDEX/i, 'Child partition materialized UNIQUE index');

  p3.db.prepare(
    'INSERT INTO orders (id, customer_id, status, created_at, external_ref) VALUES (?, ?, ?, ?, ?)',
  ).run(101, 'cust-101', 'COMPLETED', 2500, 'REF-101');

  let p3DupFailed = false;
  try {
    p3.db.prepare(
      'INSERT INTO orders (id, customer_id, status, created_at, external_ref) VALUES (?, ?, ?, ?, ?)',
    ).run(101, 'cust-101', 'COMPLETED', 2600, 'REF-101');
  } catch (err) {
    p3DupFailed = true;
    t.match(err.message, /UNIQUE constraint failed/i);
  }
  t.ok(p3DupFailed, 'Child partition enforces UNIQUE constraint physically');
  return p3;
}

/**
 * Step 6: Verify restart hydration from persisted catalog.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Object} gateway - Gateway.
 * @param {Object} t - Tap assert.
 */
async function verifyRestartHydration(engine, gateway, t) {
  const freshIndexService = new IndexService({
    controlPlaneSystemTableGateway: gateway,
    sqlQueryEngine: engine,
  });
  await freshIndexService.initialize();

  t.equal(freshIndexService.getTotalIndexCount(), 2, 'Hydrated 2 indices from system table gateway');
  const hydCompound = freshIndexService.getIndex('orders', 'idx_orders_cust_status_created');
  t.ok(hydCompound, 'idx_orders_cust_status_created hydrated');
  t.same(hydCompound.columnNames, ['customer_id', 'status', 'created_at']);
  t.equal(hydCompound.unique, false);
  t.equal(hydCompound.state, 'READY');

  const hydUnique = freshIndexService.getIndex('orders', 'idx_orders_external_ref');
  t.ok(hydUnique, 'idx_orders_external_ref hydrated');
  t.same(hydUnique.columnNames, ['id', 'external_ref']);
  t.equal(hydUnique.unique, true, 'Unique flag preserved across hydration');
  t.equal(hydUnique.state, 'READY');

  const freshOptimizer = new QueryOptimizer({indexService: freshIndexService});
  const freshPlanner = new DistributedQueryPlanner({
    queryOptimizer: freshOptimizer,
    getTablePartitions: () => [
      {partition_id: 'orders-p1'},
      {partition_id: 'orders-p2'},
      {partition_id: 'orders-p3'},
    ],
  });

  const parsedQuery = new SQLParser(
    'SELECT * FROM orders WHERE customer_id = \'cust-101\'',
  ).parse();
  const freshPlan = freshPlanner.planSelect(parsedQuery);
  t.equal(
    freshPlan.selectedIndex?.name,
    'idx_orders_cust_status_created',
    'Fresh planner reconstructs index scan selection after restart',
  );
}

/**
 * Step 7: Verify DROP INDEX, physical cleanup, and zero-partition fail-closed check.
 * @param {SQLQueryEngine} engine - Query engine.
 * @param {Map<string, PartitionService>} partitionsMap - Partition map.
 * @param {Object} t - Tap assert.
 */
async function verifyDropIndexAndZeroPartitionCheck(engine, partitionsMap, t) {
  const dropResult = await engine.executeQuery(
    'DROP INDEX idx_orders_cust_status_created',
  );
  t.equal(dropResult.success, true, 'DROP INDEX should succeed');

  for (const [pId, part] of partitionsMap.entries()) {
    const droppedCheck = part.db.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'index\' AND name = ?',
    ).all('idx_orders_cust_status_created');
    t.equal(droppedCheck.length, 0, `Index dropped physically from partition ${pId}`);
  }

  t.equal(
    engine.indexService.getIndex('orders', 'idx_orders_cust_status_created'),
    null,
    'Dropped index removed from IndexService catalog',
  );

  const explainAfterDrop = await engine.executeQuery(
    'EXPLAIN DISTRIBUTED SELECT * FROM orders WHERE customer_id = \'cust-101\'',
  );
  t.equal(explainAfterDrop.distributedPlan.selectedIndex, null);
  t.equal(explainAfterDrop.distributedPlan.indexAccess?.scanType, 'FULL_SCAN');

  const dropExistsResult = await engine.executeQuery(
    'DROP INDEX IF EXISTS idx_orders_cust_status_created',
  );
  t.equal(dropExistsResult.success, true, 'DROP INDEX IF EXISTS should be idempotent');

  // Negative witness: zero-partition table provisioning fails closed
  const emptyTableEngine = new SQLQueryEngine({
    systemCache: createMockSystemCache(
      [{table_name: 'zero_table', primaryKey: 'id', partition_key: 'id'}],
      [],
    ),
    messageRouter: createRealPartitionMessageRouter(new Map()),
    controlPlaneSystemTableGateway: createTestSystemGateway(
      [{table_id: 'zero_table', table_name: 'zero_table'}],
      [],
    ),
  });

  const zeroResult = await emptyTableEngine.executeQuery(
    'CREATE INDEX idx_zero_col ON zero_table (col)',
  );
  t.equal(zeroResult.success, false, 'CREATE INDEX on zero-partition table must fail closed');
  t.match(zeroResult.error, /No partitions found/i);
}

test('Unit J3: End-to-end Local & Compound Index Lifecycle Journey', async (t) => {
  const p1 = await createTestPartition('orders-p1', 'orders-p1-r1');
  const p2 = await createTestPartition('orders-p2', 'orders-p2-r1');
  const partitionsMap = new Map([
    ['orders-p1', p1],
    ['orders-p2', p2],
  ]);

  const oracleDb = createOracleDatabase();
  populateTestOrders(partitionsMap, oracleDb);

  const initialTables = [{table_id: 'orders', table_name: 'orders', partition_key: 'id'}];
  const initialPartitions = [
    {partition_id: 'orders-p1', table_id: 'orders', table_name: 'orders'},
    {partition_id: 'orders-p2', table_id: 'orders', table_name: 'orders'},
  ];
  const gateway = createTestSystemGateway(initialTables, initialPartitions);

  const cache = createMockSystemCache(
    [{table_name: 'orders', primaryKey: 'id', partition_key: 'id'}],
    [
      {partition_id: 'orders-p1', table_name: 'orders', partition_key_start: null, partition_key_end: 50},
      {partition_id: 'orders-p2', table_name: 'orders', partition_key_start: 50, partition_key_end: null},
    ],
  );

  const messageRouter = createRealPartitionMessageRouter(partitionsMap);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter,
    controlPlaneSystemTableGateway: gateway,
    partitionServicesProvider: () => partitionsMap,
  });
  engine.indexService.controlPlaneSystemTableGateway = gateway;

  await verifyIndexCreationAndMaterialization(engine, p1, p2, t);
  await verifyIdempotentAndDuplicateRejection(engine, t);
  await verifyUniqueIndexAndNegativeWitness(engine, p1, p2, t);
  await verifyLeadingAndRangeQueries(engine, oracleDb, t);
  await verifyOrderAndNonLeadingQueries(engine, oracleDb, t);
  const p3 = await verifyChildPartitionLifecycle(engine, {partitionsMap, gateway, cache}, t);
  await verifyRestartHydration(engine, gateway, t);
  await verifyDropIndexAndZeroPartitionCheck(engine, partitionsMap, t);

  await p1.shutdown();
  await p2.shutdown();
  await p3.shutdown();
  oracleDb.close();
  gateway.db.close();
});
