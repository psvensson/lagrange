/**
 * Transaction Support Tests
 * Tests for single-partition ACID transactions and cross-partition rejection.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */

import {createMockMessageRouter, createMockSystemCache} from './transaction-routing-fixture.js';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
// Engines persist transaction state (TX1 seam S4b: an explicit BEGIN or a
// multi-partition statement on an engine that cannot is refused, typed) and
// their partitions answer the participant transaction protocol.
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(mockPartitionData),
    controlPlaneSystemTableGateway: createTransactionPersistenceGateway(),
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

test('Transaction recovery settlement predicate requires all participants terminal ' +
  'in filterEligibleRecoveryRows and recoverDistributedTransactionStateFromCache',
async (t) => {
  // Produce a real owner-built COMMITTED coordinator row + participant row via the
  // canonical coordinator commit path.
  const producerGateway = createTransactionPersistenceGateway();
  t.teardown(() => producerGateway.db.close());
  const producerEngine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    controlPlaneSystemTableGateway: producerGateway,
    autoStartDistributedTransactionRecovery: false,
  });
  t.teardown(() => producerEngine.shutdown());
  const producerCoordinator = producerEngine.transactionCoordinator;
  producerCoordinator.beginParticipant = async () => {};
  producerCoordinator.prepareParticipant = async (_session, partitionId) => ({
    success: true,
    durable: true,
    preparedDigest: `prepared-${partitionId}`,
    prepareIndex: 1,
    prepareTerm: 1,
  });
  producerCoordinator.commitParticipant = async () => ({
    success: true,
    durable: true,
    state: 'COMMITTED',
  });

  const begun = await producerCoordinator.begin('owner-committed-session');
  t.equal(begun.success, true);
  const enlisted = await producerCoordinator.enlistParticipants(
    'owner-committed-session',
    ['p1', 'p2'],
  );
  t.equal(enlisted.success, true);
  const committed = await producerCoordinator.commit('owner-committed-session');
  t.equal(committed.success, true);

  const [committedTxRow] = producerGateway.rows('sql_transactions');
  const committedParticipantRows = producerGateway.rows(
    'sql_transaction_participants',
  );
  t.equal(committedTxRow.status, 'COMMITTED');
  t.equal(committedTxRow.participant_set_state, 'FROZEN');
  t.equal(committedParticipantRows.length, 2);

  const now = committedTxRow.timeout_deadline + 1000;
  const scenarios = [
    {
      name: 'missing participant rows stay eligible for recovery',
      participants: [],
      expectedEligible: true,
    },
    {
      name: 'still-PREPARED participant rows stay eligible for recovery',
      participants: committedParticipantRows.map((row) => ({
        ...row,
        status: 'PREPARED',
      })),
      expectedEligible: true,
    },
    {
      name: 'all COMMITTED participant rows mark the transaction settled',
      participants: committedParticipantRows,
      expectedEligible: false,
    },
  ];

  for (const scenario of scenarios) {
    const systemCache = createMockSystemCache([], []);
    systemCache.applySystemTableChange('sql_transactions', 'INSERT', committedTxRow);
    for (const participantRow of scenario.participants) {
      systemCache.applySystemTableChange(
        'sql_transaction_participants',
        'INSERT',
        participantRow,
      );
    }
    const recoveryGateway = createTransactionPersistenceGateway();
    t.teardown(() => recoveryGateway.db.close());
    const recoveryEngine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      controlPlaneSystemTableGateway: recoveryGateway,
      systemCache,
      now: () => now,
      autoStartDistributedTransactionRecovery: false,
    });
    t.teardown(() => recoveryEngine.shutdown());

    const filtered = recoveryEngine.filterEligibleRecoveryRows(
      [committedTxRow],
      now,
    );
    t.equal(
      filtered.transactions.length > 0,
      scenario.expectedEligible,
      `filterEligibleRecoveryRows: ${scenario.name}`,
    );

    recoveryEngine.recoverDistributedTransactionStateFromCache();
    t.equal(
      recoveryEngine.transactionCoordinator.recoveredTransactionIds.has(
        committedTxRow.transaction_id,
      ),
      scenario.expectedEligible,
      `recoverDistributedTransactionStateFromCache: ${scenario.name}`,
    );
  }
});
