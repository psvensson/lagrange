/**
 * End-to-end SQL workflow integration tests.
 * Tests CREATE TABLE, INSERT, SELECT, UPDATE, DELETE, partition split/merge.
 * Requirements: 6.1-6.5, 15.1-15.6, 22.1-22.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
// PartitionSplitMergeManager reserved for future split/merge integration tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {
  resumeFixtureParticipantGroupAdmission,
} from '../test-helpers/participant-transaction-fixture.js';

const PARTICIPANT_RELEASE_BUDGET_MS = 1000;

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
    transport: {wsHost: '127.0.0.1'},
  });
  // Single-replica table creation: this suite runs the SQL engine without a
  // rebalance coordinator, so the durable schema-provisioning job can only
  // converge when one routable replica satisfies the provisioning contract.
  config.setByPath('partition.defaultReplicaCount', 1);

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Create a mock CDC integration service returning the canonical system-table
 * mutation envelope ({success, operation, tableName, data, partitionResult,
 * visibilityState, contractState, nextAction}). The control-plane gateway
 * fail-closes on unknown mutation outcomes, and the durable schema job owner
 * requires partitionResult.affectedRows to accept workflow transitions.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const insertedRows = [];
  const updatedRows = [];
  const deletedRows = [];

  const buildMutationEnvelope = (operation, tableName, extra) => ({
    success: true,
    operation,
    tableName,
    partitionResult: {success: true, affectedRows: 1},
    visibilityState: 'visible',
    contractState: 'ready',
    nextAction: 'proceed',
    ...extra,
  });

  return {
    insertedRows,
    updatedRows,
    deletedRows,
    async insertSystemTableRow(tableName, data) {
      insertedRows.push({tableName, data});
      return buildMutationEnvelope('INSERT', tableName, {data});
    },
    async updateSystemTableRow(tableName, where, data) {
      updatedRows.push({tableName, where, data});
      return buildMutationEnvelope('UPDATE', tableName, {
        whereClause: where,
        data,
      });
    },
    async deleteSystemTableRow(tableName, where) {
      deletedRows.push({tableName, where});
      return buildMutationEnvelope('DELETE', tableName, {whereClause: where});
    },
  };
}

/**
 * Create a partition service for testing.
 * @param {Object} options - Partition options.
 * @return {PartitionService} Partition service.
 */
function createTestPartition(options = {}) {
  return new PartitionService(withFoundingStamp({
    partitionId: options.partitionId || 'test-partition-1',
    tableId: options.tableId || 'test-table',
    tableName: options.tableName || 'users',
    replicaId: options.replicaId || 'replica-1',
    replicaIds: options.replicaIds || ['replica-1'],
    nodeId: options.nodeId || 'node-1',
    dbPath: ':memory:',
    systemTableCache: options.systemTableCache || new SystemTableCache(),
    schema: options.schema || {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'name', type: 'TEXT', notNull: true},
        {name: 'email', type: 'TEXT'},
        {name: 'age', type: 'INTEGER'},
      ],
    },
    keyRange: options.keyRange || {start: null, end: null},
  }));
}

async function initializeReleasedPartition(partition) {
  await partition.initialize();
  await resumeFixtureParticipantGroupAdmission(
    [partition],
    (predicate) => waitForCondition(
      predicate, PARTICIPANT_RELEASE_BUDGET_MS),
  );
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

    // CREATE TABLE runs as a durable schema-provisioning job; a SUCCEEDED
    // job spreads the created-table result plus the owner contract outcome.
    t.equal(result.success, true, 'should succeed');
    t.equal(result.contractState, 'ready', 'durable job should reach ready');
    t.equal(result.nextAction, 'proceed', 'ready job should say proceed');
    t.equal(result.operation, 'CREATE_TABLE', 'should be CREATE_TABLE');
    t.equal(result.tableName, 'products', 'should have table name');
    t.ok(result.tableId, 'should have table ID');
    t.ok(result.partitionId, 'should have partition ID');
    t.equal(result.partitionKey, 'id', 'should derive partition key from PRIMARY KEY');
    t.ok(result.jobId, 'should expose the durable schema job ID');

    // Verify CDC persisted the table and partition metadata
    const insertedTables = cdcService.insertedRows.map((row) => row.tableName);
    t.ok(insertedTables.includes('tables'), 'should insert the tables row');
    t.ok(insertedTables.includes('partitions'), 'should insert the partitions row');
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
    await initializeReleasedPartition(partition);

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
    await initializeReleasedPartition(partition);

    // Insert test data
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES (1, 'Alice', 'alice@example.com', 30)
    `);

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
    await initializeReleasedPartition(partition);

    // Insert test data
    partition.db.exec(`
      INSERT INTO users (id, name, email, age) VALUES
      (1, 'Alice', 'alice@example.com', 30),
      (2, 'Bob', 'bob@example.com', 25)
    `);

    const result = await partition.deleteData('users', {id: 1});

    t.equal(result.success, true, 'should succeed');
    t.ok(result.changes >= 1, 'should have changes');

    // Verify deletion
    const queryResult = await partition.executeQuery('SELECT * FROM users');
    t.equal(queryResult.rows.length, 1, 'should have one row left');
    t.equal(queryResult.rows[0].id, 2, 'should be Bob');

    await partition.shutdown();
  });

  t.test('CDC - generates events for data changes', async (t) => {
    const partition = createTestPartition({
      tableName: 'nodes',
      schema: {
        columns: [
          {name: 'node_id', type: 'INTEGER', primaryKey: true},
          {name: 'name', type: 'TEXT', notNull: true},
          {name: 'email', type: 'TEXT'},
          {name: 'age', type: 'INTEGER'},
        ],
      },
    });
    await initializeReleasedPartition(partition);

    try {
      // Track CDC events
      const cdcEvents = [];
      let committedIndex = 0;
      partition.subscribeToCDC((event) => {
        cdcEvents.push(event);
        committedIndex += 1;
        return buildCommittedCdcOutcome([event], 'mg-1', {index: committedIndex, term: 1});
      });

      // Insert
      await partition.insertData('nodes', {node_id: 1, name: 'Alice', email: 'a@b.com', age: 30});

      // Update
      await partition.updateData('nodes', {node_id: 1}, {age: 31});

      // Delete
      await partition.deleteData('nodes', {node_id: 1});

      await waitForCondition(() => cdcEvents.length === 3, PARTICIPANT_RELEASE_BUDGET_MS);

      // Verify CDC events
      t.equal(cdcEvents.length, 3, 'should have 3 CDC events');
      t.equal(cdcEvents[0].operation, 'INSERT', 'first should be INSERT');
      t.equal(cdcEvents[1].operation, 'UPDATE', 'second should be UPDATE');
      t.equal(cdcEvents[2].operation, 'DELETE', 'third should be DELETE');
    } finally {
      await partition.shutdown();
    }
  });

  t.test('Partition size tracking - updates after writes', async (t) => {
    const partition = createTestPartition();
    await initializeReleasedPartition(partition);

    const initialSize = partition.getSize();
    t.ok(initialSize >= 0, 'should have initial size');

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
