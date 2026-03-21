/**
 * Write Tracking Recursion Guard Tests
 *
 * Regression tests for infinite recursion when local message delivery
 * keeps the call chain synchronous. Writing to sql_write_operations,
 * sql_transactions, or sql_transaction_participants must NOT trigger
 * fireNonTransactionalWriteStart / fireNonTransactionalWriteResult,
 * because those methods persist rows into sql_write_operations via the
 * SQL engine, which would re-enter executeInsert and overflow the stack.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {
  WRITE_TRACKING_EXCLUDED_TABLES,
} from '../../src/query/query-constants.js';

const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Build a mock system cache that knows about the given table.
 * @param {string} tableName - Table to register.
 * @return {Object} Mock cache.
 */
function createCacheForTable(tableName) {
  const tables = [{table_name: tableName, primaryKey: 'id'}];
  const partitions = [{
    partition_id: `${tableName}-p1`,
    table_name: tableName,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'test-node',
  }];
  const services = [{
    service_id: `${tableName}-p1`,
    service_type: 'partition',
    partition_id: `${tableName}-p1`,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${tableName}-p1`,
    status: 'active',
  }];
  return {
    tables, partitions, services,
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

// ── Constant sanity check ─────────────────────────────────────────

test('WRITE_TRACKING_EXCLUDED_TABLES contains all three ' +
  'transaction metadata tables', (t) => {
  t.ok(WRITE_TRACKING_EXCLUDED_TABLES.has(TABLES.SQL_WRITE_OPERATIONS),
    'sql_write_operations must be excluded');
  t.ok(WRITE_TRACKING_EXCLUDED_TABLES.has(TABLES.SQL_TRANSACTIONS),
    'sql_transactions must be excluded');
  t.ok(WRITE_TRACKING_EXCLUDED_TABLES.has(
    TABLES.SQL_TRANSACTION_PARTICIPANTS),
  'sql_transaction_participants must be excluded');
  t.ok(WRITE_TRACKING_EXCLUDED_TABLES.has(TABLES.NODES),
    'nodes must be excluded');
  t.ok(WRITE_TRACKING_EXCLUDED_TABLES.has(TABLES.SERVICES),
    'services must be excluded');
  t.ok(
    WRITE_TRACKING_EXCLUDED_TABLES.size >= Object.keys(TABLES).length,
    'all system tables should be excluded from non-transactional tracking',
  );
  t.end();
});

// ── INSERT recursion guard ────────────────────────────────────────

test('recursion guard - INSERT into sql_write_operations skips ' +
  'write tracking', async (t) => {
  let fireStartCalled = false;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createCacheForTable(TABLES.SQL_WRITE_OPERATIONS),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteStart = () => {
    fireStartCalled = true;
  };
  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  await engine.executeQuery(
    `INSERT INTO ${TABLES.SQL_WRITE_OPERATIONS} ` +
    '(id, status) VALUES (\'op1\', \'pending\')',
  );

  t.equal(fireStartCalled, false,
    'fireNonTransactionalWriteStart must NOT be called');
  t.equal(fireResultCalled, false,
    'fireNonTransactionalWriteResult must NOT be called');
});

// ── UPDATE recursion guard ────────────────────────────────────────

test('recursion guard - UPDATE on sql_write_operations skips ' +
  'write tracking', async (t) => {
  let fireStartCalled = false;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createCacheForTable(TABLES.SQL_WRITE_OPERATIONS),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteStart = () => {
    fireStartCalled = true;
  };
  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  await engine.executeQuery(
    `UPDATE ${TABLES.SQL_WRITE_OPERATIONS} ` +
    'SET status = \'done\' WHERE id = \'op1\'',
  );

  t.equal(fireStartCalled, false,
    'fireNonTransactionalWriteStart must NOT be called');
  t.equal(fireResultCalled, false,
    'fireNonTransactionalWriteResult must NOT be called');
});

// ── DELETE recursion guard ────────────────────────────────────────

test('recursion guard - DELETE on sql_write_operations skips ' +
  'write tracking', async (t) => {
  let fireStartCalled = false;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createCacheForTable(TABLES.SQL_WRITE_OPERATIONS),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteStart = () => {
    fireStartCalled = true;
  };
  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  await engine.executeQuery(
    `DELETE FROM ${TABLES.SQL_WRITE_OPERATIONS} WHERE id = 'op1'`,
  );

  t.equal(fireStartCalled, false,
    'fireNonTransactionalWriteStart must NOT be called');
  t.equal(fireResultCalled, false,
    'fireNonTransactionalWriteResult must NOT be called');
});

// ── sql_transactions guard ────────────────────────────────────────

test('recursion guard - INSERT into sql_transactions skips ' +
  'write tracking', async (t) => {
  let fireStartCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createCacheForTable(TABLES.SQL_TRANSACTIONS),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteStart = () => {
    fireStartCalled = true;
  };
  engine.fireNonTransactionalWriteResult = () => {};

  await engine.executeQuery(
    `INSERT INTO ${TABLES.SQL_TRANSACTIONS} ` +
    '(id, status) VALUES (\'tx1\', \'active\')',
  );

  t.equal(fireStartCalled, false,
    'fireNonTransactionalWriteStart must NOT be called');
});

// ── Regular table still tracked ───────────────────────────────────

test('recursion guard - INSERT into regular table still triggers ' +
  'write tracking', async (t) => {
  let fireStartCalled = false;
  let fireResultCalled = false;
  const engine = new SQLQueryEngine({
    systemCache: createCacheForTable('users'),
    messageRouter: createTestRouter(),
    cdcIntegrationService: createTestCdc(),
  });

  engine.fireNonTransactionalWriteStart = () => {
    fireStartCalled = true;
  };
  engine.fireNonTransactionalWriteResult = () => {
    fireResultCalled = true;
  };

  await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(fireStartCalled, true,
    'fireNonTransactionalWriteStart must be called for regular tables');
  t.equal(fireResultCalled, true,
    'fireNonTransactionalWriteResult must be called for regular tables');
});
