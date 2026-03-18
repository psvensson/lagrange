/**
 * Tests for SQL engine read migration (Task 12.4).
 * Verifies that migrated components call sqlQueryEngine.executeQuery
 * instead of direct systemTableCache access, and that queries return
 * equivalent results to former cache reads.
 */

import {test, beforeEach, afterEach} from '../src/test-helpers/tap.js';
import {TablePolicyService} from '../src/policy/table-policy-service.js';
import {RaftRoleTracker} from '../src/policy/raft-role-tracker.js';
import {DynamicConfigService} from '../src/config/dynamic-config-service.js';
import {FunctionRegistry} from '../src/function/function-registry.js';
import {ContextManager, ContextType} from '../src/function/context-manager.js';
import {IndexService} from '../src/index-management/index-service.js';
import {ConfigurationManager} from '../src/config/configuration-manager.js';
import {LoggingService} from '../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a tracking SQL engine that records all queries.
 * @param {Function} handler - Query handler.
 * @return {Object} SQL engine with query log.
 */
function createTrackingEngine(handler) {
  const queries = [];
  return {
    queries,
    executeQuery: async (sql, params) => {
      queries.push({sql, params});
      return handler(sql, params);
    },
  };
}

// --- TablePolicyService ---

test('TablePolicyService uses SQL engine for getTablePolicy',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('FROM tables')) {
        return {
          rows: [{
            table_id: params[0],
            table_policies: '{"replicaCount": 5}',
          }],
        };
      }
      return {rows: []};
    });

    const service = new TablePolicyService({
      sqlQueryEngine: engine,
    });

    const policy = await service.getTablePolicy('t1');

    t.equal(engine.queries.length, 1,
      'Should make exactly 1 SQL query');
    t.match(engine.queries[0].sql, /FROM tables/,
      'Should query tables table');
    t.same(engine.queries[0].params, ['t1'],
      'Should pass table ID as param');
    t.equal(policy.replicaCount, 5,
      'Should return parsed policy');
  });

test('TablePolicyService uses SQL engine for getPolicyForPartition',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('FROM partitions')) {
        return {
          rows: [{partition_id: 'p1', table_id: 't1'}],
        };
      }
      if (sql.includes('FROM tables')) {
        return {
          rows: [{
            table_id: 't1',
            table_policies: '{"replicaCount": 7}',
          }],
        };
      }
      return {rows: []};
    });

    const service = new TablePolicyService({
      sqlQueryEngine: engine,
    });

    const policy = await service.getPolicyForPartition('p1');

    t.equal(engine.queries.length, 2,
      'Should make 2 SQL queries');
    t.match(engine.queries[0].sql, /FROM partitions/,
      'First query should be partitions');
    t.match(engine.queries[1].sql, /FROM tables/,
      'Second query should be tables');
    t.equal(policy.replicaCount, 7,
      'Should return correct policy');
  });

// --- RaftRoleTracker ---

test('RaftRoleTracker uses SystemTableCache for getServiceRole',
  async (t) => {
    const tracker = new RaftRoleTracker({
      systemTableCache: {
        get: (_table, key) => {
          if (key === 'svc-1') {
            return {service_id: 'svc-1', raft_role: 'leader'};
          }
          return null;
        },
        filter: () => [],
      },
    });

    const role = await tracker.getServiceRole('svc-1');

    t.equal(role, 'leader',
      'Should return role from cache');
  });

test('RaftRoleTracker uses SystemTableCache for getServicesByRole',
  async (t) => {
    const tracker = new RaftRoleTracker({
      systemTableCache: {
        get: () => null,
        filter: (_table, predicate) => {
          const rows = [
            {service_id: 'svc-1', raft_role: 'follower'},
            {service_id: 'svc-2', raft_role: 'follower'},
            {service_id: 'svc-3', raft_role: 'leader'},
          ];
          return rows.filter(predicate);
        },
      },
    });

    const services = await tracker.getServicesByRole('follower');

    t.equal(services.length, 2,
      'Should return 2 services');
  });

// --- DynamicConfigService ---

test('DynamicConfigService uses SQL engine for getConfigFromTable',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('FROM config WHERE')) {
        return {
          rows: [{
            config_key: params[0],
            config_value: '42',
            value_type: 'number',
          }],
        };
      }
      return {rows: []};
    });

    const service = new DynamicConfigService({
      sqlQueryEngine: engine,
    });

    const value = await service.get('test.key');

    t.ok(engine.queries.length >= 1,
      'Should make at least 1 SQL query');
    t.match(engine.queries[0].sql, /FROM config/,
      'Should query config table');
  });

test('DynamicConfigService uses SQL engine for getAll',
  async (t) => {
    const engine = createTrackingEngine((sql) => {
      if (sql === 'SELECT * FROM config') {
        return {
          rows: [{
            config_key: 'k1',
            config_value: 'v1',
            value_type: 'string',
          }],
        };
      }
      return {rows: []};
    });

    const service = new DynamicConfigService({
      sqlQueryEngine: engine,
    });

    const all = await service.getAll();

    const getAllQuery = engine.queries.find(
      (q) => q.sql === 'SELECT * FROM config',
    );
    t.ok(getAllQuery, 'Should query all config rows');
    t.equal(all.k1, 'v1',
      'Should include value from SQL');
  });

// --- FunctionRegistry ---

test('FunctionRegistry uses SQL engine for getFunction',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('FROM code WHERE code_id')) {
        return {
          rows: [{
            code_id: params[0],
            function_id: params[0],
            function_name: 'test-fn',
            executor_type: 'wasm',
          }],
        };
      }
      return {rows: []};
    });

    const registry = new FunctionRegistry({
      sqlQueryEngine: engine,
    });

    const func = await registry.getFunction('fn-1');

    t.equal(engine.queries.length, 1,
      'Should make 1 SQL query');
    t.match(engine.queries[0].sql, /FROM code/,
      'Should query code table');
    t.equal(func.function_name, 'test-fn',
      'Should return function from SQL');
  });

test('FunctionRegistry uses SQL engine for getFunctionByName',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('function_name = ?')) {
        return {
          rows: [{
            code_id: 'fn-1',
            function_id: 'fn-1',
            function_name: params[0],
            executor_type: 'wasm',
          }],
        };
      }
      return {rows: []};
    });

    const registry = new FunctionRegistry({
      sqlQueryEngine: engine,
    });

    const func = await registry.getFunctionByName('my-func');

    t.equal(engine.queries.length, 1,
      'Should make 1 SQL query');
    t.match(engine.queries[0].sql, /function_name/,
      'Should query by function_name');
    t.equal(func.function_id, 'fn-1',
      'Should return correct function');
  });

// --- ContextManager ---

test('ContextManager uses SQL engine for getContext',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('context_type = ?') &&
          sql.includes('context_name = ?')) {
        return {
          rows: [{
            context_id: 'ctx-1',
            context_type: params[0],
            context_name: params[1],
            context_data: '{"key":"val"}',
            owner_id: null,
            created_at: 1000,
            updated_at: 1000,
          }],
        };
      }
      return {rows: []};
    });

    const manager = new ContextManager({
      sqlQueryEngine: engine,
    });

    const ctx = await manager.getContext(
      ContextType.FUNCTION, 'test-ctx',
    );

    t.equal(engine.queries.length, 1,
      'Should make 1 SQL query');
    t.match(engine.queries[0].sql, /FROM contexts/,
      'Should query contexts table');
    t.same(ctx.data, {key: 'val'},
      'Should return parsed context data');
  });

test('ContextManager uses SQL engine for getContextsByOwner',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('owner_id = ?')) {
        return {
          rows: [{
            context_id: 'ctx-1',
            context_type: 'function',
            context_name: 'c1',
            context_data: '{}',
            owner_id: params[0],
            created_at: 1000,
            updated_at: 1000,
          }],
        };
      }
      return {rows: []};
    });

    const manager = new ContextManager({
      sqlQueryEngine: engine,
    });

    const contexts = await manager.getContextsByOwner('owner-1');

    t.equal(engine.queries.length, 1,
      'Should make 1 SQL query');
    t.match(engine.queries[0].sql, /owner_id/,
      'Should query by owner_id');
    t.equal(contexts.length, 1,
      'Should return 1 context');
  });

// --- IndexService ---

test('IndexService uses SQL engine for loadIndicesFromCache',
  async (t) => {
    const engine = createTrackingEngine((sql) => {
      if (sql === 'SELECT * FROM indices') {
        return {
          rows: [{
            index_id: 'idx-1',
            table_id: 't1',
            index_name: 'idx_test',
            column_names: '["col1"]',
            index_type: 'btree',
            created_at: 1000,
          }],
        };
      }
      return {rows: []};
    });

    const service = new IndexService({
      sqlQueryEngine: engine,
    });

    await service.initialize();

    const loadQuery = engine.queries.find(
      (q) => q.sql === 'SELECT * FROM indices',
    );
    t.ok(loadQuery, 'Should query indices table on init');
    t.equal(service.getTotalIndexCount(), 1,
      'Should load 1 index');

    await service.shutdown();
  });

test('IndexService uses SQL engine for getPartitionsForTable',
  async (t) => {
    const engine = createTrackingEngine((sql, params) => {
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [
            {partition_id: 'p1', table_id: params[0]},
          ],
        };
      }
      if (sql.includes('FROM partitions WHERE partition_id')) {
        return {
          rows: [{
            partition_id: params[0],
            table_id: 't1',
            tableName: 'test_table',
          }],
        };
      }
      return {rows: []};
    });

    const service = new IndexService({
      sqlQueryEngine: engine,
    });

    // Access private method directly for testing
    const partitions =
      await service.getPartitionsForTable('t1');

    t.ok(engine.queries.length >= 1,
      'Should make SQL queries');
    t.match(engine.queries[0].sql, /FROM partitions/,
      'Should query partitions table');
    t.equal(partitions.length, 1,
      'Should return 1 partition');
  });

// --- Null guard tests ---

test('Services return empty results without SQL engine',
  async (t) => {
    // FunctionRegistry
    const registry = new FunctionRegistry();
    try {
      await registry.getFunction('fn-1');
      t.fail('FunctionRegistry should throw typed gateway error without engine');
    } catch (error) {
      t.equal(error.code, 'SYSTEM_METADATA_GATEWAY_REQUIRED',
        'FunctionRegistry should expose typed gateway-required code');
      t.equal(error.outcome, 'owner_not_ready',
        'FunctionRegistry should expose owner_not_ready outcome');
    }

    // ContextManager
    const manager = new ContextManager();
    const contexts = await manager.getContextsByOwner('o1');
    t.same(contexts, [],
      'ContextManager returns empty array without engine');

    // RaftRoleTracker
    const tracker = new RaftRoleTracker();
    const role = await tracker.getServiceRole('svc-1');
    t.equal(role, null,
      'RaftRoleTracker returns null without cache');

    const services = await tracker.getServicesByRole('leader');
    t.same(services, [],
      'RaftRoleTracker returns empty array without cache');

    // DynamicConfigService
    const configService = new DynamicConfigService();
    const configRow = await configService.getAll();
    t.ok(configRow,
      'DynamicConfigService returns defaults without engine');
  });
