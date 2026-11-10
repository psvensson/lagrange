/**
 * Tests for cache-based query routing.
 * Verifies that all queries (SELECT, INSERT, UPDATE, DELETE) route through
 * system cache to find partition leaders and use message router.
 * Requirements: 5.1, 5.2, 5.3
 */

import test from 'node:test';
import assert from 'node:assert';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  createDeliveryTrackingMessageRouter,
} from './cache-based-routing-test-support.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
/**
 * Create a mock system cache with partition and service data.
 * @param {Array<string>} partitionIds - Partition IDs to create.
 * @return {Object} Mock system cache.
 */
function createMockSystemCache(partitionIds) {
  const tables = [{
    table_id: 'test_table',
    table_name: 'test_table',
    primary_key: 'id',
    partition_key: 'id',
    partition_key_type: 'TEXT',
  }];

  const partitions = partitionIds.map((id) => ({
    partition_id: id,
    table_id: 'test_table',
    table_name: 'test_table',
    leader_node_id: 'node1',
    start_key: '',
    end_key: '',
  }));

  const services = partitionIds.map((id) => ({
    partition_id: id,
    service_type: SERVICE_TYPE.PARTITION,
    raft_role: RAFT_ROLE.LEADER,
    status: SERVICE_STATUS.ACTIVE,
    address: `node1/partition/${id}`,
    node_id: 'node1',
    service_id: id,
  }));

  const rowsForTable = (tableName) => {
    if (tableName === TABLES.TABLES) {
      return tables;
    }
    if (tableName === TABLES.PARTITIONS) {
      return partitions;
    }
    if (tableName === TABLES.SERVICES) {
      return services;
    }
    return [];
  };

  return {
    get: function(tableName, key) {
      if (tableName === TABLES.TABLES) {
        return tables.find(
          (row) => row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (tableName === TABLES.PARTITIONS) {
        return partitions.find((row) => row.partition_id === key) || null;
      }
      if (tableName === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
    find: function(tableName, predicate) {
      return rowsForTable(tableName).find(predicate) || null;
    },
    filter: function(tableName, predicate) {
      return rowsForTable(tableName).filter(predicate);
    },
    getAll: function(tableName) {
      return rowsForTable(tableName);
    },
  };
}

test('SELECT query uses cache to find partition leader', async (_t) => {
  const systemCache = createMockSystemCache(['p1']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const ast = new SQLParser('SELECT * FROM test_table').parse();
  await executor.executeSelect(ast, ['p1'], []);

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 1, 'Should deliver to one partition');
  assert.equal(
    deliveries[0].address,
    'node1/partition/p1',
    'Should route to leader address from cache',
  );
});

test('INSERT query uses cache to find partition leader', async (_t) => {
  const systemCache = createMockSystemCache(['p1']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const ast = new SQLParser('INSERT INTO test_table (id) VALUES (1)').parse();
  await executor.executeInsert(ast, 'p1', []);

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 1, 'Should deliver to one partition');
  assert.equal(
    deliveries[0].address,
    'node1/partition/p1',
    'Should route to leader address from cache',
  );
});

test('UPDATE query uses cache to find partition leader', async (_t) => {
  const systemCache = createMockSystemCache(['p1']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const ast = new SQLParser('UPDATE test_table SET value = 1').parse();
  await executor.executeUpdate(ast, ['p1'], []);

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 1, 'Should deliver to one partition');
  assert.equal(
    deliveries[0].address,
    'node1/partition/p1',
    'Should route to leader address from cache',
  );
});

test('DELETE query uses cache to find partition leader', async (_t) => {
  const systemCache = createMockSystemCache(['p1']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const ast = new SQLParser('DELETE FROM test_table WHERE id = 1').parse();
  await executor.executeDelete(ast, ['p1'], []);

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 1, 'Should deliver to one partition');
  assert.equal(
    deliveries[0].address,
    'node1/partition/p1',
    'Should route to leader address from cache',
  );
});

test('All queries route through message router', async (_t) => {
  const systemCache = createMockSystemCache(['p1', 'p2']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  // Test SELECT
  const selectAst = new SQLParser('SELECT * FROM test_table').parse();
  await executor.executeSelect(selectAst, ['p1', 'p2'], []);

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 2, 'SELECT should route through message router');

  messageRouter.clearDeliveries();

  // Test INSERT
  const insertAst = new SQLParser('INSERT INTO test_table (id) VALUES (1)').parse();
  await executor.executeInsert(insertAst, 'p1', []);

  assert.equal(
    messageRouter.getDeliveries().length,
    1,
    'INSERT should route through message router',
  );

  messageRouter.clearDeliveries();

  // Test UPDATE
  const updateAst = new SQLParser('UPDATE test_table SET value = 1').parse();
  await executor.executeUpdate(updateAst, ['p1'], []);

  assert.equal(
    messageRouter.getDeliveries().length,
    1,
    'UPDATE should route through message router',
  );

  messageRouter.clearDeliveries();

  // Test DELETE
  const deleteAst = new SQLParser('DELETE FROM test_table').parse();
  await executor.executeDelete(deleteAst, ['p1'], []);

  assert.equal(
    messageRouter.getDeliveries().length,
    1,
    'DELETE should route through message router',
  );
});

test('Query returns empty when cache missing partition info', async (_t) => {
  const systemCache = {
    filter: function(_tableName, _predicate) {
      return []; // No partitions or services
    },
  };

  const messageRouter = createDeliveryTrackingMessageRouter();

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const ast = new SQLParser('SELECT * FROM test_table').parse();
  const result = await executor.executeSelect(ast, [], []);

  // QueryExecutor returns success with empty rows when no partitions found
  assert.equal(result.success, true, 'Should return success');
  assert.equal(result.rows.length, 0, 'Should return empty rows');
});

test('SQLQueryEngine uses cache for partition lookup', async (_t) => {
  const systemCache = createMockSystemCache(['p1']);
  const messageRouter = createDeliveryTrackingMessageRouter();

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache,
    messageRouter,
    nodeId: 'test-node',
  });

  const result = await engine.executeQuery('SELECT * FROM test_table');

  assert.equal(result.success, true, 'Query should succeed');

  const deliveries = messageRouter.getDeliveries();
  assert.equal(deliveries.length, 1, 'Should route through message router');
  assert.equal(
    deliveries[0].address,
    'node1/partition/p1',
    'Should use address from cache',
  );
});

test('SQLQueryEngine fails when cache not available', async (_t) => {
  const messageRouter = createDeliveryTrackingMessageRouter();

  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: null,
    messageRouter,
    nodeId: 'test-node',
  });

  const result = await engine.executeQuery('SELECT * FROM test_table');

  assert.equal(result.success, false, 'Should fail without cache');
  assert.ok(
    result.error.includes('System cache not available'),
    'Should have clear error about missing cache',
  );
});
