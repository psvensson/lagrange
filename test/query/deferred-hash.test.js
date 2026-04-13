/**
 * Deferred Payload Hash Unit Tests
 *
 * Verifies that non-transactional writes defer hash computation
 * to the async fire-and-forget result path, while transactional
 * writes compute the hash synchronously before recordWriteOperation.
 *
 * Requirements: 3.1, 3.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Creates a minimal mock system cache with one table and one partition.
 */
function createTestCache() {
  const tables = [
    {table_name: 'users', primaryKey: 'id'},
  ];
  const partitions = [
    {
      partition_id: 'p1',
      table_name: 'users',
      leader_node_id: 'test-node',
      partition_key_start: null,
      partition_key_end: null,
    },
  ];
  const services = [
    {
      service_id: 'p1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'test-node',
      raft_role: 'leader',
      address: 'test-node/partition/p1',
      status: 'active',
    },
  ];
  return {
    tables,
    partitions,
    services,
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return this.partitions.filter(predicate);
      if (type === 'services') return this.services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      return [];
    },
  };
}

function createTestRouter() {
  return {
    deliver: async () => ({
      acknowledged: true,
      success: true,
      rows: [],
      changes: 1,
    }),
  };
}

function createTestCdc() {
  return {
    async upsertSystemTableRow() {
      return {success: true};
    },
  };
}

// ── Non-transactional path tests ──────────────────────────────────
//
// Strategy: stub fireNonTransactionalWriteResult so it does NOT call
// the original (which internally calls createWriteOperationPayloadHash).
// Then verify that createWriteOperationPayloadHash is never called
// directly by executeInsert/Update/Delete on the non-tx path.
// This proves the hash call stays out of the synchronous hot path.

test('deferred hash - non-transactional INSERT does not call ' +
  'createWriteOperationPayloadHash directly', async (t) => {
  let hashCallCount = 0;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    hashCallCount++;
    return originalHash(...args);
  };

  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(fireResultCalled, true,
    'fireNonTransactionalWriteResult must be called');
  t.equal(hashCallCount, 0,
    'hash must not be called directly by executeInsert on non-tx path');
});

test('deferred hash - non-transactional UPDATE does not call ' +
  'createWriteOperationPayloadHash directly', async (t) => {
  let hashCallCount = 0;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    hashCallCount++;
    return originalHash(...args);
  };

  await engine.executeQuery(
    'UPDATE users SET name = \'Bob\' WHERE id = \'alice\'',
  );

  t.equal(fireResultCalled, true,
    'fireNonTransactionalWriteResult must be called');
  t.equal(hashCallCount, 0,
    'hash must not be called directly by executeUpdate on non-tx path');
});

test('deferred hash - non-transactional DELETE does not call ' +
  'createWriteOperationPayloadHash directly', async (t) => {
  let hashCallCount = 0;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    hashCallCount++;
    return originalHash(...args);
  };

  await engine.executeQuery(
    'DELETE FROM users WHERE id = \'alice\'',
  );

  t.equal(fireResultCalled, true,
    'fireNonTransactionalWriteResult must be called');
  t.equal(hashCallCount, 0,
    'hash must not be called directly by executeDelete on non-tx path');
});

// ── Transactional path tests ──────────────────────────────────────

test('deferred hash - transactional INSERT calls ' +
  'createWriteOperationPayloadHash before recordWriteOperation',
async (t) => {
  const callLog = [];
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  await engine.executeQuery('BEGIN TRANSACTION');

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    callLog.push('hash');
    return originalHash(...args);
  };

  const originalRecord = engine.transactionCoordinator
    .recordWriteOperation
    .bind(engine.transactionCoordinator);
  engine.transactionCoordinator.recordWriteOperation =
    async function(...args) {
      callLog.push('recordWriteOperation');
      return originalRecord(...args);
    };

  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  const hashIdx = callLog.indexOf('hash');
  const recordIdx = callLog.indexOf('recordWriteOperation');

  t.ok(hashIdx >= 0, 'hash must be called on tx path');
  t.ok(recordIdx >= 0, 'recordWriteOperation must be called');
  t.ok(
    hashIdx < recordIdx,
    'hash must be called before recordWriteOperation',
  );

  await engine.executeQuery('ROLLBACK');
});

test('deferred hash - transactional UPDATE calls ' +
  'createWriteOperationPayloadHash before recordWriteOperation',
async (t) => {
  const callLog = [];
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  await engine.executeQuery('BEGIN TRANSACTION');

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    callLog.push('hash');
    return originalHash(...args);
  };

  const originalRecord = engine.transactionCoordinator
    .recordWriteOperation
    .bind(engine.transactionCoordinator);
  engine.transactionCoordinator.recordWriteOperation =
    async function(...args) {
      callLog.push('recordWriteOperation');
      return originalRecord(...args);
    };

  await engine.executeQuery(
    'UPDATE users SET name = \'Bob\' WHERE id = \'alice\'',
  );

  const hashIdx = callLog.indexOf('hash');
  const recordIdx = callLog.indexOf('recordWriteOperation');

  t.ok(hashIdx >= 0, 'hash must be called on tx UPDATE path');
  t.ok(recordIdx >= 0, 'recordWriteOperation must be called');
  t.ok(
    hashIdx < recordIdx,
    'hash before recordWriteOperation on tx UPDATE',
  );

  await engine.executeQuery('ROLLBACK');
});

test('deferred hash - transactional DELETE calls ' +
  'createWriteOperationPayloadHash before recordWriteOperation',
async (t) => {
  const callLog = [];
  const engine = new SQLQueryEngine({
    systemCache: createTestCache(),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  await engine.executeQuery('BEGIN TRANSACTION');

  const originalHash = engine.createWriteOperationPayloadHash
    .bind(engine);
  engine.createWriteOperationPayloadHash = function(...args) {
    callLog.push('hash');
    return originalHash(...args);
  };

  const originalRecord = engine.transactionCoordinator
    .recordWriteOperation
    .bind(engine.transactionCoordinator);
  engine.transactionCoordinator.recordWriteOperation =
    async function(...args) {
      callLog.push('recordWriteOperation');
      return originalRecord(...args);
    };

  await engine.executeQuery(
    'DELETE FROM users WHERE id = \'alice\'',
  );

  const hashIdx = callLog.indexOf('hash');
  const recordIdx = callLog.indexOf('recordWriteOperation');

  t.ok(hashIdx >= 0, 'hash must be called on tx DELETE path');
  t.ok(recordIdx >= 0, 'recordWriteOperation must be called');
  t.ok(
    hashIdx < recordIdx,
    'hash before recordWriteOperation on tx DELETE',
  );

  await engine.executeQuery('ROLLBACK');
});
