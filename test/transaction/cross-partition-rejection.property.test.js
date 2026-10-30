/**
 * Property Test: Cross-Partition Transaction Coordination
 * Property 47: For any transaction that modifies data in multiple partitions,
 * the system should coordinate the write across all touched participants.
 * All queries route through message router using service addresses from system cache.
 * Validates: Requirements 21.3
 */

import {createMockMessageRouter, createMockSystemCache} from './transaction-routing-fixture.js';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
// Engines persist transaction state (TX1 seam S4b: an explicit BEGIN or a
// multi-partition statement on an engine that cannot is refused, typed) and
// their partitions answer the participant transaction protocol.
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

/**
 * Create a mock message router that routes queries to mock partition data.
 */
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

function createTwoPartitionUsersEngine() {
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

  return new SQLQueryEngine({
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
    systemCache: cache,
  });
}

/**
 * Execute statements in a multi-partition transaction and return execution outcome.
 *
 * @param {Array<string>} statements - SQL statements to execute after BEGIN.
 * @return {Promise<Object>} Execution result, active transaction flag, and participant IDs.
 */
async function executeTransactionWithStatements(statements) {
  const engine = createTwoPartitionUsersEngine();
  const sessionId = `session-${Date.now()}-${Math.random()}`;

  await engine.executeQuery('BEGIN TRANSACTION', [], {sessionId});

  let lastResult = null;
  for (const sql of statements) {
    lastResult = await engine.executeQuery(sql, [], {sessionId});
  }

  const txState = engine.activeTransactions.get(sessionId);
  const participants = getParticipantIds(txState);
  const active = engine.hasActiveTransaction(sessionId);
  mockPartitionData.clear();

  return {
    engine,
    sessionId,
    result: lastResult,
    participants,
    active,
  };
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
        const {result, participants} = await executeTransactionWithStatements([
          `INSERT INTO users (id, name) VALUES ('${key1}', 'User1'), ('${key2}', 'User2')`,
        ]);
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
        const {result, participants} = await executeTransactionWithStatements([
          `INSERT INTO users (id, name) VALUES ('${key}', 'User1')`,
          'UPDATE users SET status = \'active\' WHERE age > 18',
        ]);
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
        const {result, participants} = await executeTransactionWithStatements([
          `INSERT INTO users (id, name) VALUES ('${key}', 'User1')`,
          'DELETE FROM users WHERE age > 18',
        ]);
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
        const {result, active} = await executeTransactionWithStatements([
          `INSERT INTO users (id, name) VALUES ('${key1}', 'User1'), ('${key2}', 'User2')`,
        ]);
        return result.success === true && active === true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cross-partition transaction active-state property holds');
});
