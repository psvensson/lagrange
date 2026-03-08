/**
 * Integration tests for InternalSqlAdapter → SQLQueryEngine (SqlCore) path.
 *
 * Verifies that internal SQL calls routed through the unified adapter
 * produce identical results to direct SqlCore calls, preserving existing
 * SQL table/index semantics.
 *
 * Requirements: 1.5, 10.1, 10.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {InternalSqlAdapter} from '../../src/query/internal-sql-adapter.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  EXECUTION_MODE,
  DEFAULT_TENANT_ID,
  DEFAULT_SESSION_ID,
} from '../../src/query/sql-adapter-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_OPERATION,
} from '../../src/query/query-constants.js';

// Initialize configuration for tests
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

// Shared mock partition data store keyed by replicaId
const partitionStore = new Map();

/**
 * Create a mock message router that simulates partition query execution.
 * @return {Object} Mock message router.
 */
function createMockMessageRouter() {
  return {
    async deliver(address, message) {
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = partitionStore.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      if (message.type === 'TRANSACTION') {
        return {acknowledged: true, success: true};
      }
      return {acknowledged: true, success: true};
    },
  };
}

/**
 * Create a mock system cache with tables, partitions, and services.
 * @param {Array} tables - Table metadata entries.
 * @param {Array} partitions - Partition metadata entries.
 * @return {Object} Mock system cache.
 */
function createMockSystemCache(tables, partitions) {
  const normalizedPartitions = partitions.map((partition) => ({
    ...partition,
    leader_node_id: partition.leader_node_id || partition.leaderNodeId || 'test-node',
  }));
  const services = partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));

  return {
    get(type, key) {
      if (type === 'tables') {
        return tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') return normalizedPartitions.filter(predicate);
      if (type === 'services') return services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === 'partitions') return normalizedPartitions;
      if (type === 'tables') return tables;
      if (type === 'services') return services;
      return [];
    },
  };
}

/**
 * Create a wired adapter + engine pair for integration testing.
 * @param {Object} [cacheOverride] - Optional system cache override.
 * @return {{adapter: InternalSqlAdapter, engine: SQLQueryEngine}}
 */
function createAdapterWithEngine(cacheOverride) {
  const cache = cacheOverride || createMockSystemCache(
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

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const adapter = new InternalSqlAdapter({sqlCore: engine});
  return {adapter, engine};
}

// ---------------------------------------------------------------------------
// SELECT through adapter path
// ---------------------------------------------------------------------------

test('integration: SELECT through adapter returns rows from engine',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice', name: 'Alice'}]);
    partitionStore.set('p2', [{id: 'zack', name: 'Zack'}]);

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.rows.length, 2);
    t.equal(result.tableName, 'users');

    partitionStore.clear();
    t.end();
  });

test('integration: SELECT with WHERE key filter routes to single partition',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice', name: 'Alice'}]);
    partitionStore.set('p2', [{id: 'zack', name: 'Zack'}]);

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'SELECT * FROM users WHERE id = \'alice\'',
    );

    t.equal(result.success, true);
    t.ok(result.partitions);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// INSERT through adapter path
// ---------------------------------------------------------------------------

test('integration: INSERT through adapter routes to correct partition',
  async (t) => {
    partitionStore.clear();

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'INSERT INTO users (id, name) VALUES (\'bob\', \'Bob\')',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.INSERT);
    t.ok(result.partitions);
    t.equal(result.partitions.length, 1);
    // 'bob' < 'm' → p1
    t.equal(result.partitions[0], 'p1');

    partitionStore.clear();
    t.end();
  });

test('integration: INSERT multi-row through adapter spans partitions',
  async (t) => {
    partitionStore.clear();

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'INSERT INTO users (id, name) ' +
      'VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.INSERT);
    t.equal(result.partitions.length, 2);

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// UPDATE through adapter path
// ---------------------------------------------------------------------------

test('integration: UPDATE through adapter with key filter',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice'}]);
    partitionStore.set('p2', [{id: 'zack'}]);

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'UPDATE users SET name = \'A\' WHERE id = \'alice\'',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.UPDATE);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');

    partitionStore.clear();
    t.end();
  });

test('integration: UPDATE without key filter hits all partitions',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice'}]);
    partitionStore.set('p2', [{id: 'zack'}]);

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'UPDATE users SET status = \'active\' WHERE age > 18',
    );

    t.equal(result.success, true);
    t.equal(result.partitions.length, 2);

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// DELETE through adapter path
// ---------------------------------------------------------------------------

test('integration: DELETE through adapter with key filter',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice'}]);
    partitionStore.set('p2', [{id: 'zack'}]);

    const {adapter} = createAdapterWithEngine();
    const result = await adapter.execute(
      'DELETE FROM users WHERE id = \'alice\'',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.DELETE);
    t.equal(result.partitions.length, 1);

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// Error semantics preserved through adapter
// ---------------------------------------------------------------------------

test('integration: adapter preserves table-not-found error from engine',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const {adapter} = createAdapterWithEngine(cache);

    const result = await adapter.execute('SELECT * FROM nonexistent');

    t.equal(result.success, false);
    t.ok(result.error.includes('not found'));
    t.equal(result.errorCode, QUERY_ERROR_CODE.TABLE_NOT_FOUND);
    t.end();
  });

test('integration: adapter preserves syntax error from engine',
  async (t) => {
    const {adapter} = createAdapterWithEngine();

    const result = await adapter.execute('INVALID SQL GARBAGE');

    t.equal(result.success, false);
    t.equal(result.errorCode, QUERY_ERROR_CODE.SYNTAX_ERROR);
    t.end();
  });

test('integration: adapter preserves system-cache-unavailable error',
  async (t) => {
    const engine = new SQLQueryEngine({
      systemCache: null,
      messageRouter: createMockMessageRouter(),
    });
    const adapter = new InternalSqlAdapter({sqlCore: engine});

    const result = await adapter.execute('SELECT * FROM users');

    t.equal(result.success, false);
    t.ok(result.error.includes('System cache not available'));
    t.end();
  });

// ---------------------------------------------------------------------------
// SqlRequest contract verification through adapter
// ---------------------------------------------------------------------------

test('integration: buildRequest produces valid SqlRequest for engine',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const req = adapter.buildRequest(
      'SELECT * FROM users WHERE id = ?',
      [42],
      {tenantId: 'tenant-x', sessionId: 'sess-1'},
    );

    t.ok(isSqlRequest(req));
    t.equal(req.statement, 'SELECT * FROM users WHERE id = ?');
    t.same(req.parameters, [42]);
    t.equal(req.tenantId, 'tenant-x');
    t.equal(req.sessionId, 'sess-1');
    t.equal(req.executionMode, EXECUTION_MODE.SQL_STATEMENT);
    t.ok(Object.isFrozen(req));
    t.end();
  });

test('integration: buildRequest uses system defaults when no overrides',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const req = adapter.buildRequest('SELECT 1');

    t.equal(req.tenantId, DEFAULT_TENANT_ID);
    t.equal(req.sessionId, DEFAULT_SESSION_ID);
    t.same(req.parameters, []);
    t.equal(req.hints, null);
    t.end();
  });

// ---------------------------------------------------------------------------
// Adapter + engine parity: same result via adapter vs direct engine call
// ---------------------------------------------------------------------------

test('integration: adapter result matches direct engine result for SELECT',
  async (t) => {
    partitionStore.set('p1', [{id: 'alice', name: 'Alice'}]);
    partitionStore.set('p2', [{id: 'zack', name: 'Zack'}]);

    const {adapter, engine} = createAdapterWithEngine();

    const adapterResult = await adapter.execute('SELECT * FROM users');
    const directResult = await engine.executeQuery('SELECT * FROM users');

    t.equal(adapterResult.success, directResult.success);
    t.equal(adapterResult.rows.length, directResult.rows.length);
    t.equal(adapterResult.tableName, directResult.tableName);

    partitionStore.clear();
    t.end();
  });

test('integration: adapter result matches direct engine result for INSERT',
  async (t) => {
    partitionStore.clear();

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

    const sql = 'INSERT INTO users (id, name) VALUES (\'eve\', \'Eve\')';

    // Create two separate engines with the same cache to avoid shared state
    const engine1 = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });
    const engine2 = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const adapter = new InternalSqlAdapter({sqlCore: engine1});

    const adapterResult = await adapter.execute(sql);
    const directResult = await engine2.executeQuery(sql);

    t.equal(adapterResult.success, directResult.success);
    t.equal(adapterResult.operation, directResult.operation);
    t.same(adapterResult.partitions, directResult.partitions);

    partitionStore.clear();
    t.end();
  });

test('integration: adapter result matches direct engine for error cases',
  async (t) => {
    const cache = createMockSystemCache([], []);

    const engine1 = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });
    const engine2 = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const adapter = new InternalSqlAdapter({sqlCore: engine1});

    const adapterResult = await adapter.execute('SELECT * FROM missing');
    const directResult = await engine2.executeQuery('SELECT * FROM missing');

    t.equal(adapterResult.success, directResult.success);
    t.equal(adapterResult.error, directResult.error);
    t.equal(adapterResult.errorCode, directResult.errorCode);

    t.end();
  });

// ---------------------------------------------------------------------------
// Session propagation through adapter to engine
// ---------------------------------------------------------------------------

test('integration: adapter propagates sessionId to engine for transactions',
  async (t) => {
    const {adapter, engine} = createAdapterWithEngine();

    // Execute via adapter with a specific session
    const beginResult = await adapter.execute(
      'BEGIN TRANSACTION',
      [],
      {sessionId: 'tx-session-1'},
    );

    t.equal(beginResult.success, true);
    t.equal(beginResult.operation, QUERY_OPERATION.BEGIN_TRANSACTION);

    // Verify the engine tracks the transaction for that session
    t.ok(engine.hasActiveTransaction('tx-session-1'));

    // Commit via adapter
    const commitResult = await adapter.execute(
      'COMMIT',
      [],
      {sessionId: 'tx-session-1'},
    );

    t.equal(commitResult.success, true);
    t.equal(commitResult.operation, QUERY_OPERATION.COMMIT);
    t.notOk(engine.hasActiveTransaction('tx-session-1'));

    t.end();
  });

// ---------------------------------------------------------------------------
// Budget and hints pass-through
// ---------------------------------------------------------------------------

test('integration: adapter passes budget overrides into SqlRequest',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const req = adapter.buildRequest('SELECT 1', [], {
      budgets: {LOOKUP_MAX_KEYS: 5},
    });

    t.equal(req.budgets.LOOKUP_MAX_KEYS, 5);
    t.ok(Object.isFrozen(req.budgets));
    t.end();
  });

test('integration: adapter passes planner hints into SqlRequest',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const req = adapter.buildRequest('SELECT 1', [], {
      hints: {preferBroadcast: true},
    });

    t.ok(req.hints);
    t.equal(req.hints.preferBroadcast, true);
    t.ok(Object.isFrozen(req.hints));
    t.end();
  });
