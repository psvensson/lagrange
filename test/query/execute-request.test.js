/**
 * Tests for SqlCore.executeRequest(SqlRequest) dispatch.
 *
 * Requirements: 1.1, 13.1
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
} from '../../src/query/sql-adapter-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {WasmExecutor} from '../../src/wasm-service/wasm-executor.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createMockMessageRouter() {
  return {
    deliver: async function(_address, _message) {
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows: [{id: 1, name: 'Alice'}],
        changes: 0,
      });
    },
  };
}

function createMockSystemCache() {
  const partitions = [
    {
      partition_id: 'p1',
      table_name: 'users',
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
    get: function(type, _key) {
      if (type === 'tables') {
        if (_key === 'users') {
          return {table_name: 'users', primaryKey: 'id'};
        }
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') return partitions.filter(predicate);
      if (type === 'services') return services.filter(predicate);
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return partitions;
      if (type === 'services') return services;
      return [];
    },
  };
}

function createEngine() {
  const runtimeWiring = createRuntimeStartupWiring();
  const moduleMirror = new ModuleMirror();
  const wasmExecutor = new WasmExecutor({moduleMirror});
  return new SQLQueryEngine({
    systemCache: createMockSystemCache(),
    messageRouter: createMockMessageRouter(),
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
    wasmExecutor,
  });
}

// --- Validation ---

test('executeRequest - rejects non-SqlRequest input', async (t) => {
  const engine = createEngine();

  try {
    await engine.executeRequest({foo: 'bar'});
    t.fail('should have thrown');
  } catch (err) {
    t.equal(err.message, ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST);
  }
});

test('executeRequest - rejects null input', async (t) => {
  const engine = createEngine();

  try {
    await engine.executeRequest(null);
    t.fail('should have thrown');
  } catch (err) {
    t.equal(err.message, ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST);
  }
});

// --- SQL_STATEMENT mode ---

test('executeRequest - dispatches SQL_STATEMENT to executeQuery',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });

    const result = await engine.executeRequest(req);

    t.equal(result.success, true);
    t.ok(result.rows);
  });

test('executeRequest - passes sessionId through for SQL_STATEMENT',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      sessionId: 'sess-42',
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    });

    const result = await engine.executeRequest(req);
    t.equal(result.success, true);
  });

// --- STAGE mode ---

test('executeRequest - dispatches STAGE mode through stage executor',
  async (t) => {
    const engine = createEngine();
    const req = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT * FROM users',
        executionMode: EXECUTION_MODE.STAGE,
      }),
      handler: async (batch) => batch.length,
    });

    const result = await engine.executeRequest(req);
    t.equal(result.success, true);
    t.equal(result.executionMode, EXECUTION_MODE.STAGE);
    t.same(result.results, [1]);
  });

test('executeRequest - rejects STAGE mode without handler',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.STAGE,
    });

    try {
      await engine.executeRequest(req);
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message, ADAPTER_ERROR_MSG.STAGE_HANDLER_REQUIRED);
    }
  });

// --- PLAN mode ---

test('executeRequest - dispatches PLAN mode through plan executor',
  async (t) => {
    const engine = createEngine();
    const req = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT * FROM users',
        executionMode: EXECUTION_MODE.PLAN,
      }),
      plan: {kind: 'useBroadcast', ref: 'shared-ref'},
    });

    const result = await engine.executeRequest(req);
    t.equal(result.success, true);
    t.equal(result.executionMode, EXECUTION_MODE.PLAN);
    t.same(result.result, {ref: 'shared-ref', data: null});
  });

test('executeRequest - rejects PLAN mode without plan object',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.PLAN,
    });

    try {
      await engine.executeRequest(req);
      t.fail('should have thrown');
    } catch (err) {
      t.equal(err.message, ADAPTER_ERROR_MSG.PLAN_OBJECT_REQUIRED);
    }
  });

// --- Unknown execution mode ---

test('executeRequest - throws for unknown execution mode', async (t) => {
  const engine = createEngine();

  // Build a request-shaped object with an unknown mode
  const fakeReq = Object.freeze({
    tenantId: 'system',
    sessionId: 'default',
    statement: 'SELECT 1',
    parameters: [],
    executionMode: 'unknown_mode',
    budgets: Object.freeze({}),
    hints: null,
  });

  try {
    await engine.executeRequest(fakeReq);
    t.fail('should have thrown');
  } catch (err) {
    t.ok(err.message.includes('unknown_mode'));
  }
});

// --- Default mode via createSqlRequest ---

test('executeRequest - defaults to SQL_STATEMENT when no mode given',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
    });

    t.equal(req.executionMode, EXECUTION_MODE.SQL_STATEMENT);

    const result = await engine.executeRequest(req);
    t.equal(result.success, true);
  });
