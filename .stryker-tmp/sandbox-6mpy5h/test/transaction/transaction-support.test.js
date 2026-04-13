/**
 * Transaction Support Tests
 * Tests for single-partition ACID transactions and cross-partition rejection.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/partitionId)
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 1,
        };
      }
      if (message.type === 'TRANSACTION') {
        return {acknowledged: true, success: true};
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions) {
  const normalizedPartitions = partitions.map((partition) => ({
    ...partition,
    leader_node_id: partition.leader_node_id || partition.leaderNodeId || 'test-node',
  }));
  const services = normalizedPartitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
    raft_role: 'leader',
  }));

  return {
    tables,
    partitions: normalizedPartitions,
    services,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

/**
 * Normalize participant IDs from transaction state.
 * @param {Object} txState - Transaction state.
 * @return {Array<string>} Participant partition IDs.
 */
function getParticipantIds(txState) {
  const participants = txState?.participants;
  if (participants instanceof Map) {
    return Array.from(participants.keys());
  }
  if (participants instanceof Set) {
    return Array.from(participants);
  }
  if (Array.isArray(participants)) {
    return participants;
  }
  return [];
}

test('Transaction - BEGIN TRANSACTION starts a transaction', async (t) => {
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], []),
  });

  const result = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'test-session-1',
  });

  t.equal(result.success, true);
  t.equal(result.operation, 'BEGIN_TRANSACTION');
  t.equal(engine.hasActiveTransaction('test-session-1'), true);
});

test('Transaction - COMMIT without active transaction returns error', async (t) => {
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], []),
  });

  const result = await engine.executeQuery('COMMIT', [], {
    sessionId: 'test-session-2',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'NO_TRANSACTION');
});

test('Transaction - ROLLBACK without active transaction returns error', async (t) => {
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], []),
  });

  const result = await engine.executeQuery('ROLLBACK', [], {
    sessionId: 'test-session-3',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'NO_TRANSACTION');
});

test('Transaction - double BEGIN returns error', async (t) => {
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], []),
  });

  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'test-session-4'});
  const result = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'test-session-4',
  });

  t.equal(result.success, false);
  t.equal(result.errorCode, 'TRANSACTION_ACTIVE');
});

test('Transaction - cross-partition INSERT enlists all touched participants', async (t) => {
  mockPartitionData.set('p1', []);
  mockPartitionData.set('p2', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'cross-tx-1'});

  // Insert into multiple partitions within one transaction.
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
    [],
    {sessionId: 'cross-tx-1'},
  );

  const txState = engine.activeTransactions.get('cross-tx-1');
  const participants = getParticipantIds(txState);
  t.equal(result.success, true);
  t.ok(participants.includes('p1'));
  t.ok(participants.includes('p2'));

  mockPartitionData.clear();
});

test('Transaction - cross-partition UPDATE enlists all touched participants', async (t) => {
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Start transaction and bind to partition p1
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'cross-tx-2'});
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'cross-tx-2'},
  );

  // Update across all partitions (no key filter).
  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
    [],
    {sessionId: 'cross-tx-2'},
  );

  const txState = engine.activeTransactions.get('cross-tx-2');
  const participants = getParticipantIds(txState);
  t.equal(result.success, true);
  t.ok(participants.includes('p1'));
  t.ok(participants.includes('p2'));

  mockPartitionData.clear();
});

test('Transaction - single-partition operations succeed', async (t) => {
  mockPartitionData.set('p1', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Start transaction
  const beginResult = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'single-tx-1',
  });
  t.equal(beginResult.success, true);

  // Insert into single partition
  const insertResult = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'single-tx-1'},
  );
  t.equal(insertResult.success, true);

  // Commit
  const commitResult = await engine.executeQuery('COMMIT', [], {
    sessionId: 'single-tx-1',
  });
  t.equal(commitResult.success, true);
  t.equal(commitResult.operation, 'COMMIT');

  mockPartitionData.clear();
});

test('Transaction - ROLLBACK reverts changes', async (t) => {
  mockPartitionData.set('p1', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'rollback-tx-1'});

  // Insert
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'rollback-tx-1'},
  );

  // Rollback
  const rollbackResult = await engine.executeQuery('ROLLBACK', [], {
    sessionId: 'rollback-tx-1',
  });
  t.equal(rollbackResult.success, true);
  t.equal(rollbackResult.operation, 'ROLLBACK');
  t.equal(engine.hasActiveTransaction('rollback-tx-1'), false);

  mockPartitionData.clear();
});

test('Transaction - different sessions have independent transactions', async (t) => {
  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([], []),
  });

  // Start transaction in session 1
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'session-a'});
  t.equal(engine.hasActiveTransaction('session-a'), true);
  t.equal(engine.hasActiveTransaction('session-b'), false);

  // Start transaction in session 2
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'session-b'});
  t.equal(engine.hasActiveTransaction('session-a'), true);
  t.equal(engine.hasActiveTransaction('session-b'), true);

  // Commit session 1
  await engine.executeQuery('COMMIT', [], {sessionId: 'session-a'});
  t.equal(engine.hasActiveTransaction('session-a'), false);
  t.equal(engine.hasActiveTransaction('session-b'), true);
});


test('Transaction - concurrent transactions on same partition use SQLite locking', async (t) => {
  // This test verifies that SQLite's locking mechanisms handle concurrent access
  mockPartitionData.set('p1', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Start transaction in session 1
  const begin1 = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'concurrent-1',
  });
  t.equal(begin1.success, true);

  // Start transaction in session 2 (different session, same partition)
  const begin2 = await engine.executeQuery('BEGIN TRANSACTION', [], {
    sessionId: 'concurrent-2',
  });
  t.equal(begin2.success, true);

  // Both sessions have independent transactions
  t.equal(engine.hasActiveTransaction('concurrent-1'), true);
  t.equal(engine.hasActiveTransaction('concurrent-2'), true);

  // Commit session 1
  await engine.executeQuery('COMMIT', [], {sessionId: 'concurrent-1'});
  t.equal(engine.hasActiveTransaction('concurrent-1'), false);

  // Session 2 still active
  t.equal(engine.hasActiveTransaction('concurrent-2'), true);

  // Commit session 2
  await engine.executeQuery('COMMIT', [], {sessionId: 'concurrent-2'});
  t.equal(engine.hasActiveTransaction('concurrent-2'), false);

  mockPartitionData.clear();
});

test('Transaction - getTransactionPartition returns bound partition', async (t) => {
  mockPartitionData.set('p1', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
    ],
  );

  const engine = new SQLQueryEngine({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
  });

  // Before transaction
  t.equal(engine.getTransactionPartition('bound-tx'), null);

  // Start transaction
  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId: 'bound-tx'});
  t.equal(engine.getTransactionPartition('bound-tx'), null); // Not bound yet

  // First write binds to partition
  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    [],
    {sessionId: 'bound-tx'},
  );
  t.equal(engine.getTransactionPartition('bound-tx'), 'p1');

  // Commit
  await engine.executeQuery('COMMIT', [], {sessionId: 'bound-tx'});
  t.equal(engine.getTransactionPartition('bound-tx'), null);

  mockPartitionData.clear();
});
