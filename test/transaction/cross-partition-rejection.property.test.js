/**
 * Property Test: Cross-Partition Transaction Coordination
 * Property 47: For any transaction that modifies data in multiple partitions,
 * the system should coordinate the write across all touched participants.
 * All queries route through message router using service addresses from system cache.
 * Validates: Requirements 21.3
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

/**
 * Create a mock message router that routes queries to mock partition data.
 */
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
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

/**
 * Create a mock system cache with services for routing.
 */
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
 * Generate keys that span multiple partitions.
 */
const crossPartitionKeysArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abc'), {minLength: 1, maxLength: 2}),
  fc.stringOf(fc.constantFrom(...'xyz'), {minLength: 1, maxLength: 2}),
);

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

test('Property 47: Cross-partition INSERT enlists all touched partitions', async (t) => {
  /**
   * Property: For any cross-partition INSERT within a transaction,
   * the transaction tracks all touched participants.
   */
  await fc.assert(
    fc.asyncProperty(
      crossPartitionKeysArb,
      async ([key1, key2]) => {
        mockPartitionData.set('p1', []);
        mockPartitionData.set('p2', []);

        const cache = createMockSystemCache(
          [{table_name: 'users', primaryKey: 'id'}],
          [
            {partition_id: 'p1', table_name: 'users', partition_key_start: null,
              partition_key_end: 'm'},
            {partition_id: 'p2', table_name: 'users', partition_key_start: 'm',
              partition_key_end: null},
          ],
        );

        const engine = new SQLQueryEngine({
          messageRouter: createMockMessageRouter(),
          systemCache: cache,
        });

        const sessionId = `session-${Date.now()}-${Math.random()}`;

        // Start transaction
        await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId});

        // Try to insert into multiple partitions
        // key1 starts with a-c (< m), key2 starts with x-z (>= m)
        const result = await engine.executeQuery(
          `INSERT INTO users (id, name) VALUES ('${key1}', 'User1'), ('${key2}', 'User2')`,
          [],
          {sessionId},
        );

        const txState = engine.activeTransactions.get(sessionId);
        const participants = getParticipantIds(txState);
        mockPartitionData.clear();

        return result.success === true &&
               participants.includes('p1') &&
               participants.includes('p2');
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cross-partition INSERT participant tracking property holds');
});

test('Property 47: Cross-partition UPDATE enlists all touched partitions', async (t) => {
  /**
   * Property: For any cross-partition UPDATE within a transaction,
   * the transaction tracks all touched participants.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.stringOf(fc.constantFrom(...'abc'), {minLength: 1, maxLength: 2}),
      async (key) => {
        mockPartitionData.set('p1', []);
        mockPartitionData.set('p2', []);

        const cache = createMockSystemCache(
          [{table_name: 'users', primaryKey: 'id'}],
          [
            {partition_id: 'p1', table_name: 'users', partition_key_start: null,
              partition_key_end: 'm'},
            {partition_id: 'p2', table_name: 'users', partition_key_start: 'm',
              partition_key_end: null},
          ],
        );

        const engine = new SQLQueryEngine({
          messageRouter: createMockMessageRouter(),
          systemCache: cache,
        });

        const sessionId = `session-${Date.now()}-${Math.random()}`;

        // Start transaction
        await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId});

        // First, bind to partition p1 with an insert
        await engine.executeQuery(
          `INSERT INTO users (id, name) VALUES ('${key}', 'User1')`,
          [],
          {sessionId},
        );

        // Try to update all partitions (no key filter) - should be rejected
        const result = await engine.executeQuery(
          'UPDATE users SET status = \'active\' WHERE age > 18',
          [],
          {sessionId},
        );

        const txState = engine.activeTransactions.get(sessionId);
        const participants = getParticipantIds(txState);
        mockPartitionData.clear();

        return result.success === true &&
               participants.includes('p1') &&
               participants.includes('p2');
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cross-partition UPDATE participant tracking property holds');
});

test('Property 47: Cross-partition DELETE enlists all touched partitions', async (t) => {
  /**
   * Property: For any cross-partition DELETE within a transaction,
   * the transaction tracks all touched participants.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.stringOf(fc.constantFrom(...'abc'), {minLength: 1, maxLength: 2}),
      async (key) => {
        mockPartitionData.set('p1', []);
        mockPartitionData.set('p2', []);

        const cache = createMockSystemCache(
          [{table_name: 'users', primaryKey: 'id'}],
          [
            {partition_id: 'p1', table_name: 'users', partition_key_start: null,
              partition_key_end: 'm'},
            {partition_id: 'p2', table_name: 'users', partition_key_start: 'm',
              partition_key_end: null},
          ],
        );

        const engine = new SQLQueryEngine({
          messageRouter: createMockMessageRouter(),
          systemCache: cache,
        });

        const sessionId = `session-${Date.now()}-${Math.random()}`;

        // Start transaction
        await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId});

        // First, bind to partition p1 with an insert
        await engine.executeQuery(
          `INSERT INTO users (id, name) VALUES ('${key}', 'User1')`,
          [],
          {sessionId},
        );

        // Try to delete from all partitions (no key filter) - should be rejected
        const result = await engine.executeQuery(
          'DELETE FROM users WHERE age > 18',
          [],
          {sessionId},
        );

        const txState = engine.activeTransactions.get(sessionId);
        const participants = getParticipantIds(txState);
        mockPartitionData.clear();

        return result.success === true &&
               participants.includes('p1') &&
               participants.includes('p2');
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cross-partition DELETE participant tracking property holds');
});

test('Property 47: Cross-partition writes keep transaction active', async (t) => {
  /**
   * Property: A successful cross-partition write keeps the transaction active
   * until explicit COMMIT/ROLLBACK.
   */
  await fc.assert(
    fc.asyncProperty(
      crossPartitionKeysArb,
      async ([key1, key2]) => {
        mockPartitionData.set('p1', []);
        mockPartitionData.set('p2', []);

        const cache = createMockSystemCache(
          [{table_name: 'users', primaryKey: 'id'}],
          [
            {partition_id: 'p1', table_name: 'users', partition_key_start: null,
              partition_key_end: 'm'},
            {partition_id: 'p2', table_name: 'users', partition_key_start: 'm',
              partition_key_end: null},
          ],
        );

        const engine = new SQLQueryEngine({
          messageRouter: createMockMessageRouter(),
          systemCache: cache,
        });

        const sessionId = `session-${Date.now()}-${Math.random()}`;

        await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId});

        const result = await engine.executeQuery(
          `INSERT INTO users (id, name) VALUES ('${key1}', 'User1'), ('${key2}', 'User2')`,
          [],
          {sessionId},
        );

        const active = engine.hasActiveTransaction(sessionId);
        mockPartitionData.clear();

        return result.success === true && active === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cross-partition transaction active-state property holds');
});
