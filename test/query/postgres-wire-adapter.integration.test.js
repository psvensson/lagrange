/**
 * Integration tests for PostgresWireAdapter → SQLQueryEngine (SqlCore) path.
 *
 * Verifies that external SQL protocol sessions routed through the
 * PostgresWireAdapter produce correct results via SqlCore, that
 * session authentication maps to tenant/service policy, and that
 * unsupported features fail explicitly.
 *
 * Requirements: 3.1, 3.2, 3.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PostgresWireAdapter,
  PG_SESSION_STATE,
} from '../../src/query/pg/postgres-wire-adapter.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
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
 * Create a wired PostgresWireAdapter + SQLQueryEngine pair.
 * @param {Object} [opts] - Options.
 * @param {Object} [opts.cache] - Optional system cache override.
 * @param {Function} [opts.authenticator] - Optional authenticator.
 * @return {{adapter: PostgresWireAdapter, engine: SQLQueryEngine}}
 */
function createAdapterWithEngine(opts = {}) {
  const cache = opts.cache || createMockSystemCache(
    [{table_name: 'orders', primaryKey: 'id'}],
    [
      {
        partition_id: 'p1',
        table_name: 'orders',
        partition_key_start: null,
        partition_key_end: 'm',
      },
      {
        partition_id: 'p2',
        table_name: 'orders',
        partition_key_start: 'm',
        partition_key_end: null,
      },
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const adapter = new PostgresWireAdapter({
    sqlCore: engine,
    authenticator: opts.authenticator,
  });

  return {adapter, engine};
}

// ---------------------------------------------------------------------------
// Req 3.1 / 3.2: Authenticated session executes SQL via SqlCore
// ---------------------------------------------------------------------------

test('integration: SELECT through wire adapter returns rows from engine',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1', total: 100}]);
    partitionStore.set('p2', [{id: 'z1', total: 200}]);

    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-1', {tenantId: 'tenant-a'});
    const result = await adapter.execute('ws-1', 'SELECT * FROM orders');

    t.equal(result.success, true);
    t.equal(result.rows.length, 2);
    t.equal(result.tableName, 'orders');

    partitionStore.clear();
    t.end();
  });

test('integration: INSERT through wire adapter routes to correct partition',
  async (t) => {
    partitionStore.clear();

    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-2', {tenantId: 'tenant-b'});
    const result = await adapter.execute(
      'ws-2',
      'INSERT INTO orders (id, total) VALUES (\'abc\', 50)',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.INSERT);
    t.ok(result.partitions);
    t.equal(result.partitions.length, 1);
    // 'abc' < 'm' → p1
    t.equal(result.partitions[0], 'p1');

    partitionStore.clear();
    t.end();
  });

test('integration: UPDATE through wire adapter with key filter',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1'}]);
    partitionStore.set('p2', [{id: 'z1'}]);

    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-3', {tenantId: 'tenant-c'});
    const result = await adapter.execute(
      'ws-3',
      'UPDATE orders SET total = 999 WHERE id = \'a1\'',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.UPDATE);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');

    partitionStore.clear();
    t.end();
  });

test('integration: DELETE through wire adapter with key filter',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1'}]);
    partitionStore.set('p2', [{id: 'z1'}]);

    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-4', {tenantId: 'tenant-d'});
    const result = await adapter.execute(
      'ws-4',
      'DELETE FROM orders WHERE id = \'a1\'',
    );

    t.equal(result.success, true);
    t.equal(result.operation, QUERY_OPERATION.DELETE);
    t.equal(result.partitions.length, 1);

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Wire adapter result matches direct engine result
// ---------------------------------------------------------------------------

test('integration: wire adapter result matches direct engine for SELECT',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1', total: 10}]);
    partitionStore.set('p2', [{id: 'z1', total: 20}]);

    const {adapter, engine} = createAdapterWithEngine();
    await adapter.authenticate('ws-5', {tenantId: 'tenant-e'});

    const adapterResult = await adapter.execute(
      'ws-5',
      'SELECT * FROM orders',
    );
    const directResult = await engine.executeQuery('SELECT * FROM orders');

    t.equal(adapterResult.success, directResult.success);
    t.equal(adapterResult.rows.length, directResult.rows.length);
    t.equal(adapterResult.tableName, directResult.tableName);

    partitionStore.clear();
    t.end();
  });

test('integration: wire adapter result matches direct engine for errors',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const {adapter, engine} = createAdapterWithEngine({cache});
    await adapter.authenticate('ws-6', {tenantId: 'tenant-f'});

    const adapterResult = await adapter.execute(
      'ws-6',
      'SELECT * FROM missing',
    );
    const directResult = await engine.executeQuery(
      'SELECT * FROM missing',
    );

    t.equal(adapterResult.success, directResult.success);
    t.equal(adapterResult.error, directResult.error);
    t.equal(adapterResult.errorCode, directResult.errorCode);

    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.1 / 3.2: Error semantics preserved through wire adapter
// ---------------------------------------------------------------------------

test('integration: wire adapter preserves table-not-found from engine',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const {adapter} = createAdapterWithEngine({cache});
    await adapter.authenticate('ws-7', {tenantId: 'tenant-g'});

    const result = await adapter.execute(
      'ws-7',
      'SELECT * FROM nonexistent',
    );

    t.equal(result.success, false);
    t.ok(result.error.includes('not found'));
    t.equal(result.errorCode, QUERY_ERROR_CODE.TABLE_NOT_FOUND);
    t.end();
  });

test('integration: wire adapter preserves syntax error from engine',
  async (t) => {
    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-8', {tenantId: 'tenant-h'});

    const result = await adapter.execute('ws-8', 'INVALID SQL GARBAGE');

    t.equal(result.success, false);
    t.equal(result.errorCode, QUERY_ERROR_CODE.SYNTAX_ERROR);
    t.end();
  });

test('integration: wire adapter rejects unauthenticated session',
  async (t) => {
    const {adapter} = createAdapterWithEngine();

    try {
      await adapter.execute('no-session', 'SELECT 1');
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('must be authenticated'));
    }
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Session authentication maps to tenant/service policy
// ---------------------------------------------------------------------------

test('integration: tenant policy from authentication flows to engine',
  async (t) => {
    // Track the options passed to executeQuery
    const capturedOptions = [];
    const trackingEngine = {
      async executeQuery(sql, params, options) {
        capturedOptions.push({sql, params, options});
        return {success: true, rows: [], affectedRows: 0};
      },
      async executeRequest(sqlRequest) {
        return trackingEngine.executeQuery(
          sqlRequest.statement,
          sqlRequest.parameters,
          {sessionId: sqlRequest.sessionId},
        );
      },
    };

    const adapter = new PostgresWireAdapter({sqlCore: trackingEngine});
    await adapter.authenticate('ws-9', {
      tenantId: 'tenant-policy-1',
      user: 'admin',
    });

    await adapter.execute('ws-9', 'SELECT 1');

    t.equal(capturedOptions.length, 1);
    t.equal(capturedOptions[0].options.sessionId, 'ws-9');
    t.end();
  });

test('integration: custom authenticator gates session creation',
  async (t) => {
    let authCalled = false;
    const authenticator = async (creds) => {
      authCalled = true;
      // Only allow tenant-allowed
      return {authenticated: creds.tenantId === 'tenant-allowed'};
    };

    const {adapter} = createAdapterWithEngine({authenticator});

    // Rejected tenant
    try {
      await adapter.authenticate('ws-10', {tenantId: 'tenant-denied'});
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('Authentication failed'));
    }
    t.ok(authCalled);
    t.notOk(adapter.hasSession('ws-10'));

    // Allowed tenant
    const session = await adapter.authenticate('ws-11', {
      tenantId: 'tenant-allowed',
    });
    t.equal(session.state, PG_SESSION_STATE.AUTHENTICATED);
    t.ok(adapter.hasSession('ws-11'));

    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.4: Feature negotiation — unsupported features fail explicitly
// ---------------------------------------------------------------------------

test('integration: negotiateFeatures reports all as unsupported',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const result = adapter.negotiateFeatures('ws-12', [
      'prepared_statements',
      'copy_protocol',
      'extended_query',
    ]);

    t.same(result.supported, []);
    t.same(result.unsupported, [
      'prepared_statements',
      'copy_protocol',
      'extended_query',
    ]);
    t.end();
  });

test('integration: negotiateFeatures with empty list returns empty',
  (t) => {
    const {adapter} = createAdapterWithEngine();

    const result = adapter.negotiateFeatures('ws-13', []);

    t.same(result.supported, []);
    t.same(result.unsupported, []);
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Session lifecycle — close prevents further execution
// ---------------------------------------------------------------------------

test('integration: closed session rejects subsequent queries',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1'}]);

    const {adapter} = createAdapterWithEngine();
    await adapter.authenticate('ws-14', {tenantId: 'tenant-j'});

    // First query succeeds
    const result = await adapter.execute(
      'ws-14',
      'SELECT * FROM orders',
    );
    t.equal(result.success, true);

    // Close session
    adapter.closeSession('ws-14');
    t.notOk(adapter.hasSession('ws-14'));

    // Subsequent query fails
    try {
      await adapter.execute('ws-14', 'SELECT * FROM orders');
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('must be authenticated'));
    }

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Multiple sessions execute independently
// ---------------------------------------------------------------------------

test('integration: multiple sessions execute independently',
  async (t) => {
    partitionStore.set('p1', [{id: 'a1', total: 10}]);
    partitionStore.set('p2', [{id: 'z1', total: 20}]);

    const {adapter} = createAdapterWithEngine();

    await adapter.authenticate('ws-15', {tenantId: 'tenant-k'});
    await adapter.authenticate('ws-16', {tenantId: 'tenant-l'});

    const result1 = await adapter.execute(
      'ws-15',
      'SELECT * FROM orders',
    );
    const result2 = await adapter.execute(
      'ws-16',
      'SELECT * FROM orders',
    );

    t.equal(result1.success, true);
    t.equal(result2.success, true);
    t.equal(result1.rows.length, 2);
    t.equal(result2.rows.length, 2);

    // Closing one session does not affect the other
    adapter.closeSession('ws-15');
    t.notOk(adapter.hasSession('ws-15'));
    t.ok(adapter.hasSession('ws-16'));

    const result3 = await adapter.execute(
      'ws-16',
      'SELECT * FROM orders',
    );
    t.equal(result3.success, true);

    partitionStore.clear();
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: SqlCore error propagation through wire adapter
// ---------------------------------------------------------------------------

test('integration: sqlCore exception propagates through wire adapter',
  async (t) => {
    const failingEngine = {
      async executeQuery() {
        throw new Error('internal engine failure');
      },
      async executeRequest() {
        throw new Error('internal engine failure');
      },
    };

    const adapter = new PostgresWireAdapter({sqlCore: failingEngine});
    await adapter.authenticate('ws-17', {tenantId: 'tenant-m'});

    try {
      await adapter.execute('ws-17', 'SELECT 1');
      t.fail('should have thrown');
    } catch (err) {
      t.ok(err.message.includes('internal engine failure'));
    }
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Parameters pass through to SqlCore
// ---------------------------------------------------------------------------

test('integration: bind parameters pass through wire adapter to engine',
  async (t) => {
    const capturedCalls = [];
    const trackingEngine = {
      async executeQuery(sql, params, options) {
        capturedCalls.push({sql, params, options});
        return {success: true, rows: []};
      },
      async executeRequest(sqlRequest) {
        return trackingEngine.executeQuery(
          sqlRequest.statement,
          sqlRequest.parameters,
          {sessionId: sqlRequest.sessionId},
        );
      },
    };

    const adapter = new PostgresWireAdapter({sqlCore: trackingEngine});
    await adapter.authenticate('ws-18', {tenantId: 'tenant-n'});

    await adapter.execute('ws-18', 'SELECT * FROM t WHERE id = ?', [42]);

    t.equal(capturedCalls.length, 1);
    t.equal(capturedCalls[0].sql, 'SELECT * FROM t WHERE id = ?');
    t.same(capturedCalls[0].params, [42]);
    t.end();
  });

// ---------------------------------------------------------------------------
// Req 3.2: Transaction lifecycle through wire adapter
// ---------------------------------------------------------------------------

test('integration: transaction lifecycle through wire adapter',
  async (t) => {
    partitionStore.clear();

    const {adapter, engine} = createAdapterWithEngine();
    await adapter.authenticate('ws-19', {tenantId: 'tenant-o'});

    // BEGIN
    const beginResult = await adapter.execute(
      'ws-19',
      'BEGIN TRANSACTION',
    );
    t.equal(beginResult.success, true);
    t.equal(beginResult.operation, QUERY_OPERATION.BEGIN_TRANSACTION);
    t.ok(engine.hasActiveTransaction('ws-19'));

    // INSERT within transaction
    const insertResult = await adapter.execute(
      'ws-19',
      'INSERT INTO orders (id, total) VALUES (\'b1\', 100)',
    );
    t.equal(insertResult.success, true);

    // COMMIT
    const commitResult = await adapter.execute('ws-19', 'COMMIT');
    t.equal(commitResult.success, true);
    t.equal(commitResult.operation, QUERY_OPERATION.COMMIT);
    t.notOk(engine.hasActiveTransaction('ws-19'));

    partitionStore.clear();
    t.end();
  });
