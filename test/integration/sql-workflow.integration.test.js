/**
 * End-to-end SQL workflow integration tests.
 * Tests CREATE TABLE, INSERT, SELECT, UPDATE, DELETE, partition split/merge.
 * Requirements: 6.1-6.5, 15.1-15.6, 22.1-22.7
 */

import {test} from 'tap';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
// PartitionSplitMergeManager reserved for future split/merge integration tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const insertedRows = [];
  const updatedRows = [];
  const deletedRows = [];

  return {
    insertedRows,
    updatedRows,
    deletedRows,
    async insertSystemTableRow(tableName, data) {
      insertedRows.push({tableName, data});
      return {success: true};
    },
    async updateSystemTableRow(tableName, where, data) {
      updatedRows.push({tableName, where, data});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, where) {
      deletedRows.push({tableName, where});
      return {success: true};
    },
  };
}

/**
 * Create a partition service for testing.
 * @param {Object} options - Partition options.
 * @return {PartitionService} Partition service.
 */
function createTestPartition(options = {}) {
  return new PartitionService({
    partitionId: options.partitionId || 'test-partition-1',
    tableId: options.tableId || 'test-table',
    tableName: options.tableName || 'users',
    replicaId: options.replicaId || 'replica-1',
    replicaIds: options.replicaIds || ['replica-1'],
    nodeId: options.nodeId || 'node-1',
    dbPath: ':memory:',
    schema: options.schema || {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'name', type: 'TEXT', notNull: true},
        {name: 'email', type: 'TEXT'},
        {name: 'age', type: 'INTEGER'},
      ],
    },
    keyRange: options.keyRange || {start: null, end: null},
  });
}

test('End-to-end SQL workflow integration tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('CREATE TABLE - creates table with PRIMARY KEY', async (t) => {
    const cache = new SystemTableCache();
    const cdcService = createMockCDCService();

    const engine = new SQLQueryEngine({
      systemCache: cache,
      cdcIntegrationService: cdcService,
    });

    const result = await engine.executeQuery(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL,
        quantity INTEGER DEFAULT 0
      )
    `);

    t.equal(result.success, true, 'should succeed');
    t.equal(result.operation, 'CREATE_TABLE', 'should be CREATE_TABLE');
    t.equal(result.tableName, 'products', 'should have table name');
    t.ok(result.tableId, 'should have table ID');
    t.ok(result.partitionId, 'should have partition ID');
    t.equal(result.partitionKey, 'id', 'should derive partition key from PRIMARY KEY');

    // Verify CDC was called
    t.ok(cdcService.insertedRows.length >= 2, 'should insert table and partition');
  });

  t.test('CREATE TABLE - rejects table without PRIMARY KEY', async (t) => {
    const cache = new SystemTableCache();
    const cdcService = createMockCDCService();

    const engine = new SQLQueryEngine({
      systemCache: cache,
      cdcIntegrationService: cdcService,
    });

    const result = await engine.executeQuery(`
      CREATE TABLE invalid_table (
        name TEXT,
        value INTEGER
      )
    `);

    t.equal(result.success, false, 'should fail');
    t.ok(result.error.includes('PRIMARY KEY'), 'should mention PRIMARY KEY');
  });

  t.test('INSERT - inserts data into partition', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    const result = await partition.insertData('users', {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      age: 30,
    });

    t.equal(result.success, true, 'should succeed');
    t.ok(result.changes >= 1, 'should have changes');

    // Verify data was inserted
    const queryResult = await partition.executeQuery(
      'SELECT * FROM users WHERE id = ?',
      [1],
    );
    t.equal(queryResult.rows.length, 1, 'should find inserted row');
    t.equal(queryResult.rows[0].name, 'Alice', 'should have correct name');

    await partition.shutdown();
  });

  t.test('SELECT - queries data from partition', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Insert test data directly
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES
      (1, 'Alice', 'alice@example.com', 30),
      (2, 'Bob', 'bob@example.com', 25),
      (3, 'Charlie', 'charlie@example.com', 35)
    `);

    // Query all
    const allResult = await partition.executeQuery('SELECT * FROM users');
    t.equal(allResult.rows.length, 3, 'should return all rows');

    // Query with WHERE
    const filteredResult = await partition.executeQuery(
      'SELECT * FROM users WHERE age > ?',
      [28],
    );
    t.equal(filteredResult.rows.length, 2, 'should filter correctly');

    // Query with ORDER BY
    const orderedResult = await partition.executeQuery(
      'SELECT * FROM users ORDER BY age DESC',
    );
    t.equal(orderedResult.rows[0].name, 'Charlie', 'should order correctly');

    await partition.shutdown();
  });

  t.test('UPDATE - updates data in partition', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Insert test data
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES (1, 'Alice', 'alice@example.com', 30)
    `);

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    const result = await partition.updateData(
      'users',
      {id: 1},
      {age: 31, email: 'alice.new@example.com'},
    );

    t.equal(result.success, true, 'should succeed');
    t.ok(result.changes >= 1, 'should have changes');

    // Verify update
    const queryResult = await partition.executeQuery(
      'SELECT * FROM users WHERE id = ?',
      [1],
    );
    t.equal(queryResult.rows[0].age, 31, 'should have updated age');
    t.equal(queryResult.rows[0].email, 'alice.new@example.com', 'should have updated email');

    await partition.shutdown();
  });

  t.test('DELETE - deletes data from partition', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Insert test data
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES
      (1, 'Alice', 'alice@example.com', 30),
      (2, 'Bob', 'bob@example.com', 25)
    `);

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    const result = await partition.deleteData('users', {id: 1});

    t.equal(result.success, true, 'should succeed');
    t.ok(result.changes >= 1, 'should have changes');

    // Verify deletion
    const queryResult = await partition.executeQuery('SELECT * FROM users');
    t.equal(queryResult.rows.length, 1, 'should have one row left');
    t.equal(queryResult.rows[0].id, 2, 'should be Bob');

    await partition.shutdown();
  });

  t.test('Transaction - BEGIN, operations, COMMIT', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    // Begin transaction
    const beginResult = await partition.beginTransaction();
    t.equal(beginResult.success, true, 'BEGIN should succeed');
    t.equal(partition.isInTransaction(), true, 'should be in transaction');

    // Insert within transaction
    const insertResult = await partition.executeQuery(
      'INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)',
      [1, 'Alice', 'alice@example.com', 30],
    );
    t.equal(insertResult.success, true, 'INSERT should succeed');

    // Commit
    const commitResult = await partition.commitTransaction();
    t.equal(commitResult.success, true, 'COMMIT should succeed');
    t.equal(partition.isInTransaction(), false, 'should not be in transaction');

    // Verify data persisted
    const queryResult = await partition.executeQuery('SELECT * FROM users');
    t.equal(queryResult.rows.length, 1, 'should have committed data');

    await partition.shutdown();
  });

  t.test('Transaction - ROLLBACK reverts changes', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Insert initial data
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES (1, 'Alice', 'alice@example.com', 30)
    `);

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    // Begin transaction
    await partition.beginTransaction();

    // Delete within transaction
    await partition.executeQuery('DELETE FROM users WHERE id = ?', [1]);

    // Verify deletion visible within transaction
    const duringTx = await partition.executeQuery('SELECT * FROM users');
    t.equal(duringTx.rows.length, 0, 'should see deletion during transaction');

    // Rollback
    const rollbackResult = await partition.rollbackTransaction();
    t.equal(rollbackResult.success, true, 'ROLLBACK should succeed');

    // Verify data restored
    const afterRollback = await partition.executeQuery('SELECT * FROM users');
    t.equal(afterRollback.rows.length, 1, 'should have original data after rollback');

    await partition.shutdown();
  });

  t.test('CDC - generates events for data changes', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    // Track CDC events
    const cdcEvents = [];
    partition.subscribeToCDC((event) => {
      cdcEvents.push(event);
    });

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert
    await partition.insertData('users', {id: 1, name: 'Alice', email: 'a@b.com', age: 30});

    // Update
    await partition.updateData('users', {id: 1}, {age: 31});

    // Delete
    await partition.deleteData('users', {id: 1});

    // Verify CDC events
    t.equal(cdcEvents.length, 3, 'should have 3 CDC events');
    t.equal(cdcEvents[0].operation, 'INSERT', 'first should be INSERT');
    t.equal(cdcEvents[1].operation, 'UPDATE', 'second should be UPDATE');
    t.equal(cdcEvents[2].operation, 'DELETE', 'third should be DELETE');

    await partition.shutdown();
  });

  t.test('Partition size tracking - updates after writes', async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    const initialSize = partition.getSize();
    t.ok(initialSize >= 0, 'should have initial size');

    // Become leader for writes
    partition.role = 'leader';
    partition.isLeader = true;

    // Insert data
    for (let i = 1; i <= 10; i++) {
      await partition.insertData('users', {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
      });
    }

    // Force size update
    await partition.updatePartitionSize();

    const newSize = partition.getSize();
    t.ok(newSize >= initialSize, 'size should increase after inserts');

    await partition.shutdown();
  });

  t.test('Key range - checks if key is in partition range', async (t) => {
    const partition = createTestPartition({
      keyRange: {start: 10, end: 20},
    });
    await partition.initialize();

    t.equal(partition.isKeyInRange(15), true, '15 should be in range [10, 20)');
    t.equal(partition.isKeyInRange(10), true, '10 should be in range (inclusive start)');
    t.equal(partition.isKeyInRange(20), false, '20 should not be in range (exclusive end)');
    t.equal(partition.isKeyInRange(5), false, '5 should not be in range');
    t.equal(partition.isKeyInRange(25), false, '25 should not be in range');

    await partition.shutdown();
  });

  t.test('Key range - unbounded ranges', async (t) => {
    // Full range [NULL, NULL)
    const fullRange = createTestPartition({
      keyRange: {start: null, end: null},
    });
    await fullRange.initialize();
    t.equal(fullRange.isKeyInRange(0), true, 'any key in full range');
    t.equal(fullRange.isKeyInRange(1000000), true, 'any key in full range');
    await fullRange.shutdown();

    // Lower unbounded [NULL, 50)
    const lowerUnbounded = createTestPartition({
      keyRange: {start: null, end: 50},
    });
    await lowerUnbounded.initialize();
    t.equal(lowerUnbounded.isKeyInRange(0), true, '0 in [NULL, 50)');
    t.equal(lowerUnbounded.isKeyInRange(49), true, '49 in [NULL, 50)');
    t.equal(lowerUnbounded.isKeyInRange(50), false, '50 not in [NULL, 50)');
    await lowerUnbounded.shutdown();

    // Upper unbounded [50, NULL)
    const upperUnbounded = createTestPartition({
      keyRange: {start: 50, end: null},
    });
    await upperUnbounded.initialize();
    t.equal(upperUnbounded.isKeyInRange(49), false, '49 not in [50, NULL)');
    t.equal(upperUnbounded.isKeyInRange(50), true, '50 in [50, NULL)');
    t.equal(upperUnbounded.isKeyInRange(1000), true, '1000 in [50, NULL)');
    await upperUnbounded.shutdown();
  });

  t.test('Cross-partition query - scatter-gather pattern', async (t) => {
    // Create multiple partitions for the same table
    const partition1 = createTestPartition({
      partitionId: 'users-p1',
      keyRange: {start: null, end: 50},
    });
    const partition2 = createTestPartition({
      partitionId: 'users-p2',
      keyRange: {start: 50, end: null},
    });

    await partition1.initialize();
    await partition2.initialize();

    // Insert data into each partition
    partition1.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES
      (10, 'Alice', 'alice@example.com', 30),
      (20, 'Bob', 'bob@example.com', 25)
    `);

    partition2.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES
      (60, 'Charlie', 'charlie@example.com', 35),
      (70, 'Diana', 'diana@example.com', 28)
    `);

    // Query each partition
    const result1 = await partition1.executeQuery('SELECT * FROM users');
    const result2 = await partition2.executeQuery('SELECT * FROM users');

    // Combine results (scatter-gather)
    const allRows = [...result1.rows, ...result2.rows];
    t.equal(allRows.length, 4, 'should have all rows from both partitions');

    await partition1.shutdown();
    await partition2.shutdown();
  });
});
