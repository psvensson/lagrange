/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data for routing
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions, services) {
  return {
    tables,
    partitions,
    services: services || partitions.map((p) => ({
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    })),
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

test('SQLQueryEngine - executes SELECT query', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - resolves partitions by table_id when table_name is missing',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const cache = createMockSystemCache(
      [{table_id: 'tbl-users', table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: null,
        },
      ],
    );

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');
    t.equal(result.rows.length, 1);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - falls back to tables.find when tables.get is keyed by table_id',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const tableRecord = {table_id: 'tbl-users', table_name: 'users', primaryKey: 'id'};
    const partitionRecords = [{
      partition_id: 'p1',
      table_id: 'tbl-users',
      partition_key_start: null,
      partition_key_end: null,
    }];
    const serviceRecords = [{
      service_id: 'p1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'test-node',
      raft_role: 'leader',
      address: 'test-node/partition/p1',
      status: 'active',
    }];

    const cache = {
      get(type, key) {
        if (type === TABLES.TABLES && key === tableRecord.table_id) {
          return tableRecord;
        }
        return null;
      },
      find(type, predicate) {
        if (type === TABLES.TABLES && predicate(tableRecord)) {
          return tableRecord;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === TABLES.PARTITIONS) {
          return partitionRecords.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.PARTITIONS) {
          return partitionRecords;
        }
        if (type === TABLES.TABLES) {
          return [tableRecord];
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords;
        }
        return [];
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');
    t.equal(result.rows.length, 1);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - routes SELECT with key filter to single partition', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 'bob', name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes INSERT and routes to correct partition', async (t) => {
  // Set up mock partition data
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
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1'); // 'alice' < 'm'

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - routes INSERT to multiple partitions', async (t) => {
  // Set up mock partition data
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
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - merges RETURNING rows for distributed INSERT', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  const returningRouter = {
    deliver: async (address, message) => {
      const partitionId = address.split('/')[2];
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      if (!message.sql.startsWith('INSERT')) {
        return {acknowledged: true, success: true, rows: [], changes: 0};
      }
      const rows = partitionId === 'p1' ?
        [{id: 'alice'}] :
        [{id: 'zack'}];
      return {
        acknowledged: true,
        success: true,
        rows,
        changes: 1,
      };
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: returningRouter,
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), ' +
    '(\'zack\', \'Zack\') RETURNING id',
  );

  t.equal(result.success, true);
  t.equal(result.affectedRows, 2);
  t.same(result.rows.map((row) => row.id).sort(), ['alice', 'zack']);
});

test('SQLQueryEngine - surfaces partial failure for distributed UPDATE', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  const failingRouter = {
    deliver: async (address, message) => {
      const partitionId = address.split('/')[2];
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      if (partitionId === 'p2') {
        return {
          acknowledged: true,
          success: false,
          error: 'partition unavailable',
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 'alice'}],
        changes: 1,
      };
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: failingRouter,
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18 RETURNING id',
  );

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p2']);
  t.equal(result.affectedRows, 1);
  t.same(result.rows, [{id: 'alice'}]);
});

test('SQLQueryEngine - executes UPDATE with key filter', async (t) => {
  // Set up mock partition data
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
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes UPDATE on all partitions without key filter', async (t) => {
  // Set up mock partition data
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
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes DELETE with key filter', async (t) => {
  // Set up mock partition data
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
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('DELETE FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');
  t.equal(result.partitions.length, 1);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - returns error for non-existent table', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM nonexistent');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - handles transaction statements', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const beginResult = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult.success, true);
  t.equal(beginResult.operation, 'BEGIN_TRANSACTION');

  const commitResult = await engine.executeQuery('COMMIT');
  t.equal(commitResult.success, true);
  t.equal(commitResult.operation, 'COMMIT');

  // Start a new transaction before testing ROLLBACK
  const beginResult2 = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult2.success, true);
  t.equal(beginResult2.operation, 'BEGIN_TRANSACTION');

  const rollbackResult = await engine.executeQuery('ROLLBACK');
  t.equal(rollbackResult.success, true);
  t.equal(rollbackResult.operation, 'ROLLBACK');
});

test('SQLQueryEngine - returns syntax error for invalid SQL', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('INVALID SQL STATEMENT');

  t.equal(result.success, false);
  t.ok(result.errorCode);
});

test('SQLQueryEngine - parse method returns AST', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const ast = engine.parse('SELECT id, name FROM users WHERE age > 18');

  t.equal(ast.type, 'SELECT');
  t.ok(ast.columns);
  t.ok(ast.from);
  t.ok(ast.where);
});

test('SQLQueryEngine - resolvePartitions method works', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const partitions = engine.resolvePartitions('users', null);

  t.equal(partitions.length, 2);
});

test('SQLQueryEngine - throws error when system cache not available', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: null,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('System cache not available'));
});

test('SQLQueryEngine - returns empty array when no partitions found in cache', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - persists non-transactional distributed write operations',
  async (t) => {
    const upserts = [];
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
        },
        {
          partition_id: 'p2',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
        },
      ],
    );
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, row) {
        upserts.push({tableName, row});
        return {success: true};
      },
    };
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      cdcIntegrationService,
    });

    const result = await engine.executeQuery(
      'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    );

    t.equal(result.success, true);

    // Write operation persistence is fire-and-forget for non-transactional
    // writes. Allow microtasks to flush before checking upserts.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const writeOpRows = upserts.filter((entry) =>
      entry.tableName === TABLES.SQL_WRITE_OPERATIONS);
    t.equal(writeOpRows.length, 2);
    t.equal(writeOpRows[0].row.status, 'PENDING');
    t.equal(writeOpRows[1].row.status, 'SUCCEEDED');
  });

test('SQLQueryEngine - recovers distributed transactions from system cache snapshots',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const transactionRows = [{
      transaction_id: 'tx-recovery-1',
      session_id: 'recovery-session',
      status: 'PREPARED',
      created_at: 1,
      updated_at: 2,
    }];
    const participantRows = [{
      participant_id: 'tx-recovery-1:p1',
      transaction_id: 'tx-recovery-1',
      partition_id: 'p1',
      status: 'PREPARED',
      created_at: 1,
      updated_at: 2,
    }];
    const writeOperationRows = [{
      operation_id: 'op-recovery-1',
      transaction_id: 'tx-recovery-1',
      statement_type: 'UPDATE',
      status: 'PENDING',
      idempotency_key: 'idem-op-recovery-1',
      payload_hash: 'hash-op-recovery-1',
      partition_ids: '["p1"]',
      retry_count: 0,
      created_at: 1,
      updated_at: 2,
    }];
    const originalGetAll = cache.getAll.bind(cache);
    cache.getAll = function(type) {
      if (type === TABLES.SQL_TRANSACTIONS) {
        return transactionRows;
      }
      if (type === TABLES.SQL_TRANSACTION_PARTICIPANTS) {
        return participantRows;
      }
      if (type === TABLES.SQL_WRITE_OPERATIONS) {
        return writeOperationRows;
      }
      return originalGetAll(type);
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    t.equal(engine.hasActiveTransaction('recovery-session'), true);
    t.equal(engine.getTransactionPartition('recovery-session'), 'p1');
  });

test('SQLQueryEngine - EXPLAIN DISTRIBUTED returns canonical plan output',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
        },
      ],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'EXPLAIN DISTRIBUTED SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.equal(result.operation, 'EXPLAIN_DISTRIBUTED');
    t.equal(result.rows.length, 1);
    t.ok(result.rows[0].plan_id.startsWith('dqp-'));
    t.same(Object.keys(result.rows[0].diagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);
  });

test('SQLQueryEngine - distributed diagnostics schema is stable for SELECT',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.same(Object.keys(result.distributedMetrics).sort(), [
      'executionDurationMs',
      'fanout',
      'mergeDurationMs',
      'planningDurationMs',
    ]);
    t.same(Object.keys(result.distributedDiagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - remains correct before and after partition split updates',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    mockPartitionData.set('users-p1', [{id: 'alice'}]);
    const beforeSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(beforeSplit.success, true);
    t.equal(beforeSplit.rows.length, 1);

    cache.partitions = [
      {
        partition_id: 'users-p1a',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: 'm',
      },
      {
        partition_id: 'users-p1b',
        table_name: 'users',
        partition_key_start: 'm',
        partition_key_end: null,
      },
    ];
    cache.services = cache.partitions.map((partition) => ({
      service_id: partition.partition_id,
      service_type: 'partition',
      partition_id: partition.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${partition.partition_id}`,
      status: 'active',
    }));

    mockPartitionData.clear();
    mockPartitionData.set('users-p1a', [{id: 'alice'}]);
    mockPartitionData.set('users-p1b', [{id: 'zack'}]);

    const afterSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(afterSplit.success, true);
    t.equal(afterSplit.rows.length, 2);
    t.same(afterSplit.partitions.sort(), ['users-p1a', 'users-p1b']);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'INSERT critical path', async (t) => {
  // Bug: persistNonTransactionalWriteStart and persistNonTransactionalWriteResult
  // are awaited in the INSERT path, adding 2 full SQL round-trips per write.
  // For non-transactional single-partition writes, this tracking is not needed
  // for correctness (only used in distributed transaction recovery).
  // The persistence should be fire-and-forget to avoid tripling write latency.
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  // CDC service that takes SLOW_PERSIST_MS per upsert to simulate real
  // Raft consensus + CDC cache wait overhead on sql_write_operations.
  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row, timestamp: Date.now()});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');

  // If persistence is fire-and-forget, the INSERT should complete well
  // under the combined persistence delay (2 * SLOW_PERSIST_MS = 100ms).
  // Allow generous margin but the key assertion is that we don't wait
  // for both persist calls sequentially.
  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `INSERT took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  // Allow fire-and-forget upserts to complete before test cleanup.
  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'UPDATE critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(_tableName, _row) {
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'UPDATE users SET name = \'Bob\' WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `UPDATE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'DELETE critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(_tableName, _row) {
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'DELETE FROM users WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `DELETE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});
