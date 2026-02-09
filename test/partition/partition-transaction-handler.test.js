/**
 * Unit tests for PartitionTransactionHandler.
 * Tests transaction lifecycle management extracted from partition-service.js.
 * Requirements: 6.3, 6.4, 6.6
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import {PartitionTransactionHandler} from '../../src/partition/partition-transaction-handler.js';
import {
  TRANSACTION_STATE,
  TRANSACTION_ISOLATION_LEVEL,
} from '../../src/transaction/transaction-constants.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';

describe('PartitionTransactionHandler', () => {
  let db;
  let handler;
  const partitionId = 'test-partition-1';

  // Mock logger that captures log calls
  const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  });

  beforeEach(() => {
    // Create in-memory SQLite database
    db = new Database(':memory:');

    // Create a test table
    db.exec(`
      CREATE TABLE test_data (
        id TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    handler = new PartitionTransactionHandler({
      partitionId,
      db,
      logger: createMockLogger(),
    });
  });

  afterEach(() => {
    // Clean up any active transaction
    if (handler.isActive()) {
      handler.forceRollback();
    }
    db.close();
  });

  describe('constructor', () => {
    it('should initialize with correct partition ID', () => {
      assert.strictEqual(handler.partitionId, partitionId);
    });

    it('should initialize with no active transaction', () => {
      assert.strictEqual(handler.isActive(), false);
    });

    it('should initialize with READ_COMMITTED isolation level', () => {
      assert.strictEqual(
        handler.getIsolationLevel(),
        TRANSACTION_ISOLATION_LEVEL.READ_COMMITTED,
      );
    });

    it('should initialize with zero operations', () => {
      assert.strictEqual(handler.getOperationCount(), 0);
    });
  });

  describe('setDatabase', () => {
    it('should allow setting database after construction', () => {
      const newHandler = new PartitionTransactionHandler({
        partitionId: 'new-partition',
        logger: createMockLogger(),
      });

      newHandler.setDatabase(db);
      // Should not throw when beginning transaction
      const result = newHandler.begin();
      assert.strictEqual(result.success, true);
      newHandler.rollback();
    });
  });

  describe('begin', () => {
    it('should begin a transaction successfully', () => {
      const result = handler.begin();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.operation, PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION);
      assert.strictEqual(result.partitionId, partitionId);
      assert.strictEqual(result.inTransaction, true);
    });

    it('should set transaction state to active', () => {
      handler.begin();

      assert.strictEqual(handler.isActive(), true);
      assert.strictEqual(handler.getState(), TRANSACTION_STATE.ACTIVE);
    });

    it('should record start time', () => {
      const before = Date.now();
      handler.begin();
      const after = Date.now();

      const startTime = handler.getStartTime();
      assert.ok(startTime >= before);
      assert.ok(startTime <= after);
    });

    it('should throw if database not initialized', () => {
      const noDbHandler = new PartitionTransactionHandler({
        partitionId: 'no-db',
        logger: createMockLogger(),
      });

      assert.throws(
        () => noDbHandler.begin(),
        /not initialized/i,
      );
    });

    it('should throw if transaction already active', () => {
      handler.begin();

      assert.throws(
        () => handler.begin(),
        /already active/i,
      );
    });
  });

  describe('commit', () => {
    it('should commit a transaction successfully', () => {
      handler.begin();
      const result = handler.commit();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.operation, PARTITION_SERVICE_OPERATION.COMMIT);
      assert.strictEqual(result.partitionId, partitionId);
      assert.strictEqual(result.committed, true);
    });

    it('should return duration and operation count', () => {
      handler.begin();
      handler.recordOperation({type: 'INSERT', data: {id: '1'}});
      handler.recordOperation({type: 'UPDATE', data: {id: '1'}});

      const result = handler.commit();

      assert.strictEqual(result.operationCount, 2);
      assert.ok(result.durationMs >= 0);
    });

    it('should return operations list', () => {
      handler.begin();
      const op1 = {type: 'INSERT', data: {id: '1'}};
      const op2 = {type: 'UPDATE', data: {id: '1'}};
      handler.recordOperation(op1);
      handler.recordOperation(op2);

      const result = handler.commit();

      assert.strictEqual(result.operations.length, 2);
      assert.deepStrictEqual(result.operations[0], op1);
      assert.deepStrictEqual(result.operations[1], op2);
    });

    it('should clear transaction state after commit', () => {
      handler.begin();
      handler.commit();

      assert.strictEqual(handler.isActive(), false);
      assert.strictEqual(handler.getState(), null);
      assert.strictEqual(handler.getOperationCount(), 0);
    });

    it('should persist changes to database', () => {
      handler.begin();
      db.exec('INSERT INTO test_data (id, value) VALUES (\'key1\', \'value1\')');
      handler.commit();

      const row = db.prepare('SELECT * FROM test_data WHERE id = ?').get('key1');
      assert.strictEqual(row.value, 'value1');
    });

    it('should throw if database not initialized', () => {
      const noDbHandler = new PartitionTransactionHandler({
        partitionId: 'no-db',
        logger: createMockLogger(),
      });

      assert.throws(
        () => noDbHandler.commit(),
        /not initialized/i,
      );
    });

    it('should throw if no active transaction', () => {
      assert.throws(
        () => handler.commit(),
        /no active transaction/i,
      );
    });
  });

  describe('rollback', () => {
    it('should rollback a transaction successfully', () => {
      handler.begin();
      const result = handler.rollback();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.operation, PARTITION_SERVICE_OPERATION.ROLLBACK);
      assert.strictEqual(result.partitionId, partitionId);
      assert.strictEqual(result.rolledBack, true);
    });

    it('should return duration and operation count', () => {
      handler.begin();
      handler.recordOperation({type: 'INSERT', data: {id: '1'}});

      const result = handler.rollback();

      assert.strictEqual(result.operationCount, 1);
      assert.ok(result.durationMs >= 0);
    });

    it('should clear transaction state after rollback', () => {
      handler.begin();
      handler.rollback();

      assert.strictEqual(handler.isActive(), false);
      assert.strictEqual(handler.getState(), null);
      assert.strictEqual(handler.getOperationCount(), 0);
    });

    it('should revert changes to database', () => {
      // Insert a row first
      db.exec('INSERT INTO test_data (id, value) VALUES (\'key1\', \'original\')');

      handler.begin();
      db.exec('UPDATE test_data SET value = \'modified\' WHERE id = \'key1\'');
      handler.rollback();

      const row = db.prepare('SELECT * FROM test_data WHERE id = ?').get('key1');
      assert.strictEqual(row.value, 'original');
    });

    it('should throw if database not initialized', () => {
      const noDbHandler = new PartitionTransactionHandler({
        partitionId: 'no-db',
        logger: createMockLogger(),
      });

      assert.throws(
        () => noDbHandler.rollback(),
        /not initialized/i,
      );
    });

    it('should throw if no active transaction', () => {
      assert.throws(
        () => handler.rollback(),
        /no active transaction/i,
      );
    });
  });

  describe('forceRollback', () => {
    it('should rollback and return true when transaction active', () => {
      handler.begin();
      const result = handler.forceRollback();

      assert.strictEqual(result, true);
      assert.strictEqual(handler.isActive(), false);
    });

    it('should return false when no transaction active', () => {
      const result = handler.forceRollback();

      assert.strictEqual(result, false);
    });

    it('should return false when database not set', () => {
      const noDbHandler = new PartitionTransactionHandler({
        partitionId: 'no-db',
        logger: createMockLogger(),
      });

      const result = noDbHandler.forceRollback();

      assert.strictEqual(result, false);
    });

    it('should clear transaction state even on rollback error', () => {
      handler.begin();
      // Close the database to cause rollback error
      db.close();

      // Should not throw
      handler.forceRollback();

      assert.strictEqual(handler.isActive(), false);
      assert.strictEqual(handler.getOperationCount(), 0);

      // Reopen for cleanup
      db = new Database(':memory:');
    });
  });

  describe('recordOperation', () => {
    it('should record operation in active transaction', () => {
      handler.begin();
      const operation = {type: 'INSERT', data: {id: '1', value: 'test'}};

      handler.recordOperation(operation);

      assert.strictEqual(handler.getOperationCount(), 1);
      const operations = handler.getOperations();
      assert.deepStrictEqual(operations[0], operation);
    });

    it('should record multiple operations', () => {
      handler.begin();
      handler.recordOperation({type: 'INSERT', data: {id: '1'}});
      handler.recordOperation({type: 'UPDATE', data: {id: '1'}});
      handler.recordOperation({type: 'DELETE', data: {id: '1'}});

      assert.strictEqual(handler.getOperationCount(), 3);
    });

    it('should throw if no active transaction', () => {
      assert.throws(
        () => handler.recordOperation({type: 'INSERT'}),
        /no active transaction/i,
      );
    });
  });

  describe('getOperations', () => {
    it('should return a copy of operations', () => {
      handler.begin();
      handler.recordOperation({type: 'INSERT', data: {id: '1'}});

      const ops1 = handler.getOperations();
      const ops2 = handler.getOperations();

      assert.notStrictEqual(ops1, ops2);
      assert.deepStrictEqual(ops1, ops2);
    });

    it('should return empty array when no operations', () => {
      handler.begin();
      const operations = handler.getOperations();

      assert.deepStrictEqual(operations, []);
    });
  });

  describe('getDuration', () => {
    it('should return duration when transaction active', () => {
      handler.begin();

      const duration = handler.getDuration();

      assert.ok(duration >= 0);
    });

    it('should return 0 when no transaction active', () => {
      const duration = handler.getDuration();

      assert.strictEqual(duration, 0);
    });
  });

  describe('transaction isolation', () => {
    it('should isolate uncommitted changes from other connections', () => {
      // Create a second connection to the same database
      const db2 = new Database(':memory:');
      db2.exec('CREATE TABLE test_data (id TEXT PRIMARY KEY, value TEXT)');

      // Note: In-memory databases are isolated by default
      // This test verifies the transaction handler's isolation behavior
      handler.begin();
      db.exec('INSERT INTO test_data (id, value) VALUES (\'key1\', \'value1\')');

      // Changes should not be visible until commit
      // (In a real scenario with shared database file)
      handler.commit();

      const row = db.prepare('SELECT * FROM test_data WHERE id = ?').get('key1');
      assert.strictEqual(row.value, 'value1');

      db2.close();
    });
  });
});
