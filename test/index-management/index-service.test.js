/**
 * Unit tests for IndexService.
 * Tests index creation, storage in indices system table, and index management.
 * Requirements: 12.1, 12.2
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {IndexService, IndexType} from '../../src/index-management/index-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

/**
 * Create a mock CDC integration service.
 */
function createMockCDCService() {
  const insertedRows = [];
  const deletedRows = [];

  return {
    insertedRows,
    deletedRows,
    async insertSystemTableRow(tableName, data) {
      insertedRows.push({tableName, data});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      deletedRows.push({tableName, whereClause});
      return {success: true};
    },
  };
}

/**
 * Create a mock SQL query engine.
 * @param {Array} indices - Index records.
 * @param {Array} partitions - Partition records or services.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlEngine(indices = [], partitions = []) {
  return {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM indices')) {
        return {rows: indices};
      }
      if (sql.includes('FROM partitions WHERE table_id = ?')) {
        const rows = partitions
          .map((p) => ({
            partition_id: p.partition_id || p.partitionId,
            table_id: p.table_id || p.tableId,
          }))
          .filter((p) => p.table_id === params[0]);
        return {rows};
      }
      if (sql.includes('FROM partitions WHERE partition_id = ?')) {
        const found = partitions.find((p) =>
          (p.partition_id || p.partitionId) === params[0],
        );
        return {rows: found ? [found] : []};
      }
      return {rows: []};
    },
  };
}

test('IndexService - initialization', async (t) => {
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  t.ok(indexService.initialized, 'Service should be initialized');
  t.equal(
    indexService.getTotalIndexCount(), 0,
    'Should have no indices initially',
  );

  await indexService.shutdown();
});

test('IndexService - loads indices from cache on init', async (t) => {
  const existingIndices = [
    {
      index_id: 'idx-1',
      table_id: 'table-1',
      index_name: 'idx_name',
      column_names: '["name"]',
      index_type: 'btree',
      created_at: Date.now(),
    },
    {
      index_id: 'idx-2',
      table_id: 'table-1',
      index_name: 'idx_value',
      column_names: '["value"]',
      index_type: 'btree',
      created_at: Date.now(),
    },
  ];

  const sqlEngine = createMockSqlEngine(existingIndices);
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: sqlEngine,
  });

  await indexService.initialize();

  t.equal(
    indexService.getTotalIndexCount(), 2,
    'Should load 2 indices from cache',
  );
  t.ok(
    indexService.indexExists('table-1', 'idx_name'),
    'idx_name should exist',
  );
  t.ok(
    indexService.indexExists('table-1', 'idx_value'),
    'idx_value should exist',
  );

  await indexService.shutdown();
});

test('IndexService - createIndex stores metadata', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  const result = await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
    indexType: IndexType.BTREE,
  });

  t.ok(result.indexId, 'Should return index ID');
  t.equal(
    result.tableId, 'users-table', 'Should have correct table ID',
  );
  t.equal(
    result.indexName, 'idx_users_email',
    'Should have correct index name',
  );
  t.same(
    result.columnNames, ['email'],
    'Should have correct column names',
  );
  t.equal(result.indexType, 'btree', 'Should have correct index type');

  // Verify CDC service was called
  t.equal(
    cdcService.insertedRows.length, 1, 'Should insert one row',
  );
  t.equal(
    cdcService.insertedRows[0].tableName, 'indices',
    'Should insert into indices table',
  );
  t.equal(
    cdcService.insertedRows[0].data.index_name,
    'idx_users_email',
    'Should have correct index name in data',
  );

  await indexService.shutdown();
});

test('IndexService - createIndex with multiple columns', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  const result = await indexService.createIndex({
    tableId: 'orders-table',
    tableName: 'orders',
    indexName: 'idx_orders_customer_date',
    columnNames: ['customer_id', 'order_date'],
    indexType: IndexType.BTREE,
  });

  t.same(
    result.columnNames, ['customer_id', 'order_date'],
    'Should have multiple columns',
  );

  const insertedData = cdcService.insertedRows[0].data;
  t.equal(
    insertedData.column_names,
    '["customer_id","order_date"]',
    'Should store columns as JSON array',
  );

  await indexService.shutdown();
});

test('IndexService - createIndex prevents duplicates', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  try {
    await indexService.createIndex({
      tableId: 'users-table',
      tableName: 'users',
      indexName: 'idx_users_email',
      columnNames: ['email'],
    });
    t.fail('Should throw error for duplicate index');
  } catch (error) {
    t.match(
      error.message, /already exists/,
      'Should indicate index already exists',
    );
  }

  await indexService.shutdown();
});

test('IndexService - createIndex validates required params', async (t) => {
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });
  await indexService.initialize();

  try {
    await indexService.createIndex({});
    t.fail('Should throw error for missing tableId');
  } catch (error) {
    t.match(
      error.message, /tableId/, 'Should indicate tableId is required',
    );
  }

  try {
    await indexService.createIndex({tableId: 'test'});
    t.fail('Should throw error for missing indexName');
  } catch (error) {
    t.match(
      error.message, /indexName/,
      'Should indicate indexName is required',
    );
  }

  try {
    await indexService.createIndex({
      tableId: 'test', indexName: 'idx',
    });
    t.fail('Should throw error for missing columnNames');
  } catch (error) {
    t.match(
      error.message, /columnNames/,
      'Should indicate columnNames is required',
    );
  }

  await indexService.shutdown();
});

test('IndexService - dropIndex removes index metadata', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  // Create an index first
  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  t.ok(
    indexService.indexExists('users-table', 'idx_users_email'),
    'Index should exist',
  );

  // Drop the index
  const result = await indexService.dropIndex(
    'users-table', 'idx_users_email',
  );

  t.ok(result, 'Should return true on successful drop');
  t.notOk(
    indexService.indexExists('users-table', 'idx_users_email'),
    'Index should not exist',
  );

  // Verify CDC service was called for delete
  t.equal(
    cdcService.deletedRows.length, 1, 'Should delete one row',
  );
  t.equal(
    cdcService.deletedRows[0].tableName, 'indices',
    'Should delete from indices table',
  );

  await indexService.shutdown();
});

test('IndexService - dropIndex throws for non-existent', async (t) => {
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });
  await indexService.initialize();

  try {
    await indexService.dropIndex(
      'users-table', 'non_existent_index',
    );
    t.fail('Should throw error for non-existent index');
  } catch (error) {
    t.match(
      error.message, /not found/, 'Should indicate index not found',
    );
  }

  await indexService.shutdown();
});

test('IndexService - getIndicesForTable returns all', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_name',
    columnNames: ['name'],
  });

  await indexService.createIndex({
    tableId: 'orders-table',
    tableName: 'orders',
    indexName: 'idx_orders_date',
    columnNames: ['order_date'],
  });

  const userIndices = indexService.getIndicesForTable('users-table');
  t.equal(
    userIndices.length, 2, 'Should have 2 indices for users table',
  );

  const orderIndices = indexService.getIndicesForTable('orders-table');
  t.equal(
    orderIndices.length, 1, 'Should have 1 index for orders table',
  );

  await indexService.shutdown();
});

test('IndexService - getAllIndices returns all indices', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  await indexService.createIndex({
    tableId: 'orders-table',
    tableName: 'orders',
    indexName: 'idx_orders_date',
    columnNames: ['order_date'],
  });

  const allIndices = indexService.getAllIndices();
  t.equal(allIndices.length, 2, 'Should have 2 total indices');

  await indexService.shutdown();
});

test('IndexService - handleCDCEvent updates on INSERT', async (t) => {
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });
  await indexService.initialize();

  await indexService.handleCDCEvent({
    tableName: 'indices',
    operation: 'INSERT',
    data: {
      index_id: 'idx-new',
      table_id: 'table-1',
      index_name: 'idx_new_index',
      column_names: '["col1"]',
      index_type: 'btree',
      created_at: Date.now(),
    },
  });

  t.ok(
    indexService.indexExists('table-1', 'idx_new_index'),
    'Index should exist after CDC event',
  );

  await indexService.shutdown();
});

test('IndexService - handleCDCEvent updates on DELETE', async (t) => {
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });

  await indexService.initialize();

  // Create an index
  await indexService.createIndex({
    tableId: 'table-1',
    tableName: 'test_table',
    indexName: 'idx_to_delete',
    columnNames: ['col1'],
  });

  t.ok(
    indexService.indexExists('table-1', 'idx_to_delete'),
    'Index should exist',
  );

  // Simulate CDC DELETE event
  await indexService.handleCDCEvent({
    tableName: 'indices',
    operation: 'DELETE',
    data: {
      index_id: 'some-id',
      table_id: 'table-1',
      index_name: 'idx_to_delete',
    },
  });

  t.notOk(
    indexService.indexExists('table-1', 'idx_to_delete'),
    'Index should not exist',
  );

  await indexService.shutdown();
});

test('IndexService - creates SQLite index on partitions', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'users-table',
    tableName: 'users',
    replicaId: 'test-partition-r1',
    replicaIds: ['test-partition-r1'],
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT'},
        {name: 'name', type: 'TEXT'},
      ],
    },
  });

  await partition.initialize();
  partition.role = 'leader';
  partition.isLeader = true;

  const sqlEngine = createMockSqlEngine([], [partition]);
  const cdcService = createMockCDCService();
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: sqlEngine,
  });

  await indexService.initialize();

  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  // Verify the index was created in SQLite
  const result = await partition.executeQuery(
    'SELECT name FROM sqlite_master WHERE type = \'index\'' +
    ' AND name = ?',
    ['idx_users_email'],
  );

  t.equal(result.rows.length, 1, 'SQLite index should be created');
  t.equal(
    result.rows[0].name, 'idx_users_email',
    'Index name should match',
  );

  await indexService.shutdown();
  await partition.shutdown();
});


test('IndexService - creates indices on new partition via CDC', async (t) => {
  const cdcService = createMockCDCService();

  // Create a partition that will be added later
  const newPartition = new PartitionService({
    partitionId: 'new-partition',
    tableId: 'users-table',
    tableName: 'users',
    replicaId: 'new-partition-r1',
    replicaIds: ['new-partition-r1'],
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT'},
        {name: 'name', type: 'TEXT'},
      ],
    },
  });

  await newPartition.initialize();
  newPartition.role = 'leader';
  newPartition.isLeader = true;

  const sqlEngine = createMockSqlEngine([], [newPartition]);
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: sqlEngine,
  });

  await indexService.initialize();

  // Create an index first (no partitions matched for filter)
  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  // Simulate a new partition being created via CDC
  await indexService.handleCDCEvent({
    tableName: 'partitions',
    operation: 'INSERT',
    data: {
      partition_id: 'new-partition',
      table_id: 'users-table',
    },
  });

  // Verify the index was created on the new partition
  const result = await newPartition.executeQuery(
    'SELECT name FROM sqlite_master WHERE type = \'index\'' +
    ' AND name = ?',
    ['idx_users_email'],
  );

  t.equal(
    result.rows.length, 1,
    'Index should be created on new partition',
  );

  await indexService.shutdown();
  await newPartition.shutdown();
});

test('IndexService - ensureIndicesOnPartition creates all', async (t) => {
  const cdcService = createMockCDCService();

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'users-table',
    tableName: 'users',
    replicaId: 'test-partition-r1',
    replicaIds: ['test-partition-r1'],
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT'},
        {name: 'name', type: 'TEXT'},
        {name: 'status', type: 'TEXT'},
      ],
    },
  });

  await partition.initialize();
  partition.role = 'leader';
  partition.isLeader = true;

  const sqlEngine = createMockSqlEngine([], [partition]);
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: sqlEngine,
  });

  await indexService.initialize();

  // Manually add to cache to simulate indices existing
  indexService.indexCache.set('users-table', new Map([
    ['idx_users_email', {
      indexId: 'idx-1',
      tableId: 'users-table',
      indexName: 'idx_users_email',
      columnNames: ['email'],
      indexType: 'btree',
    }],
    ['idx_users_status', {
      indexId: 'idx-2',
      tableId: 'users-table',
      indexName: 'idx_users_status',
      columnNames: ['status'],
      indexType: 'btree',
    }],
  ]));

  // Ensure indices on partition
  const createdCount = await indexService.ensureIndicesOnPartition(
    'test-partition',
    'users-table',
  );

  t.equal(createdCount, 2, 'Should create 2 indices');

  // Verify indices exist in SQLite
  const result = await partition.executeQuery(
    'SELECT name FROM sqlite_master WHERE type = \'index\'' +
    ' AND name LIKE \'idx_users_%\'',
    [],
  );

  t.equal(
    result.rows.length, 2, 'Both indices should exist in SQLite',
  );

  await indexService.shutdown();
  await partition.shutdown();
});

test('IndexService - rebuildIndex recreates on partitions', async (t) => {
  const cdcService = createMockCDCService();

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'users-table',
    tableName: 'users',
    replicaId: 'test-partition-r1',
    replicaIds: ['test-partition-r1'],
    dbPath: ':memory:',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'email', type: 'TEXT'},
      ],
    },
  });

  await partition.initialize();
  partition.role = 'leader';
  partition.isLeader = true;

  const sqlEngine = createMockSqlEngine([], [partition]);
  const indexService = new IndexService({
    cdcIntegrationService: cdcService,
    systemTableCache: {},
    sqlQueryEngine: sqlEngine,
  });

  await indexService.initialize();

  // Create an index
  await indexService.createIndex({
    tableId: 'users-table',
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
  });

  // Rebuild the index
  const result = await indexService.rebuildIndex(
    'users-table', 'idx_users_email',
  );

  t.equal(result.successCount, 1, 'Should rebuild on 1 partition');
  t.equal(result.failCount, 0, 'Should have no failures');

  // Verify index still exists
  const sqlResult = await partition.executeQuery(
    'SELECT name FROM sqlite_master WHERE type = \'index\'' +
    ' AND name = ?',
    ['idx_users_email'],
  );

  t.equal(
    sqlResult.rows.length, 1, 'Index should exist after rebuild',
  );

  await indexService.shutdown();
  await partition.shutdown();
});

test('IndexService - ignores non-INSERT partition CDC', async (t) => {
  const indexService = new IndexService({
    systemTableCache: {},
    sqlQueryEngine: createMockSqlEngine(),
  });
  await indexService.initialize();

  // Add an index to the cache
  indexService.indexCache.set('users-table', new Map([
    ['idx_test', {
      indexId: 'idx-1',
      tableId: 'users-table',
      indexName: 'idx_test',
      columnNames: ['col1'],
      indexType: 'btree',
    }],
  ]));

  // These should not trigger any index creation
  await indexService.handleCDCEvent({
    tableName: 'partitions',
    operation: 'UPDATE',
    data: {partition_id: 'p1', table_id: 'users-table'},
  });

  await indexService.handleCDCEvent({
    tableName: 'partitions',
    operation: 'DELETE',
    data: {partition_id: 'p1', table_id: 'users-table'},
  });

  // No errors should occur
  t.pass('Non-INSERT partition CDC events handled gracefully');

  await indexService.shutdown();
});
