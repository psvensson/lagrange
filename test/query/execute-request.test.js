/**
 * Tests for SqlCore.executeRequest(SqlRequest) dispatch.
 *
 * Requirements: 1.1, 13.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
  CALLBACK_RUNTIME_KIND,
} from '../../src/query/sql-adapter-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createMockMessageRouter() {
  return {
    deliver: async function(_address, message) {
      const sql = String(message?.sql || '').toLowerCase();
      if (sql.includes('from code')) {
        return {
          acknowledged: true,
          success: true,
          rows: [{
            function_id: 'mod-1',
            function_name: 'mod-1',
            code_blob: '\'use strict\';\n' +
              'module.exports.run_batch = async function runBatch(_ctx, batch) {\n' +
              '  return (batch.rows || []).map((row) => ({...row, nativeLoaded: true}));\n' +
              '};\n',
          }],
          changes: 0,
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 1, name: 'Alice'}],
        changes: 0,
      };
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
    {
      partition_id: 'code-p1',
      table_name: 'code',
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
    {
      service_id: 'code-p1',
      service_type: 'partition',
      partition_id: 'code-p1',
      node_id: 'test-node',
      raft_role: 'leader',
      address: 'test-node/partition/code-p1',
      status: 'active',
    },
  ];
  return {
    get: function(type, _key) {
      if (type === 'tables') {
        if (_key === 'users') {
          return {table_name: 'users', primaryKey: 'id'};
        }
        if (_key === 'code') {
          return {table_name: 'code', primaryKey: 'function_id'};
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
  return new SQLQueryEngine({
    systemCache: createMockSystemCache(),
    messageRouter: createMockMessageRouter(),
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
  });
}

function createEngineWithoutRuntime() {
  return new SQLQueryEngine({
    systemCache: createMockSystemCache(),
    messageRouter: createMockMessageRouter(),
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

// --- PARTITION_CALLBACK mode ---

test('executeRequest - dispatches PARTITION_CALLBACK to dedicated path',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: 'mod-1',
      callbackExport: 'run_batch',
      runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
    });

    const result = await engine.executeRequest(req);
    t.equal(result.success, true);
    t.equal(result.executionMode, EXECUTION_MODE.PARTITION_CALLBACK);
    t.equal(result.callbackModuleRef, 'mod-1');
    t.equal(result.callbackExport, 'run_batch');
    t.equal(result.hostResult.state, 'completed');
  });

test('executeRequest - native_js partition callback loads handler from code table',
  async (t) => {
    const engine = createEngine();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: 'mod-1',
      callbackExport: 'run_batch',
      runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
    });

    const result = await engine.executeRequest(req);
    t.equal(result.hostResult.state, 'completed');
    t.equal(result.hostResult.failedPartitions, 0);
    t.equal(result.hostResult.totalRows, 1);
    t.same(result.hostResult.partitionResults[0].rows, [
      {id: 1, name: 'Alice', nativeLoaded: true},
    ]);
  });

test('executeRequest - PARTITION_CALLBACK returns different shape ' +
  'than SQL_STATEMENT', async (t) => {
  const engine = createEngine();

  const stmtReq = createSqlRequest({
    statement: 'SELECT * FROM users',
    executionMode: EXECUTION_MODE.SQL_STATEMENT,
  });
  const cbReq = createSqlRequest({
    statement: 'SELECT * FROM users',
    executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
    callbackModuleRef: 'mod-1',
    callbackExport: 'run_batch',
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
  });

  const stmtResult = await engine.executeRequest(stmtReq);
  const cbResult = await engine.executeRequest(cbReq);

  // SQL_STATEMENT result does not carry callback metadata
  t.equal(stmtResult.callbackModuleRef, undefined);
  t.equal(stmtResult.callbackExport, undefined);
  t.equal(stmtResult.executionMode, undefined);

  // PARTITION_CALLBACK result carries callback metadata
  t.equal(cbResult.callbackModuleRef, 'mod-1');
  t.equal(cbResult.callbackExport, 'run_batch');
  t.equal(cbResult.executionMode, EXECUTION_MODE.PARTITION_CALLBACK);
});

test('executeRequest - PARTITION_CALLBACK rejects missing ' +
  'callbackModuleRef', async (t) => {
  const engine = createEngine();

  // Build a request-shaped object with missing callbackModuleRef
  const fakeReq = Object.freeze({
    tenantId: 'system',
    sessionId: 'default',
    statement: 'SELECT * FROM users',
    parameters: [],
    executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
    callbackModuleRef: null,
    callbackExport: 'run_batch',
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
    budgets: Object.freeze({}),
    hints: null,
  });

  try {
    await engine.executeRequest(fakeReq);
    t.fail('should have thrown');
  } catch (err) {
    t.equal(
      err.message,
      ADAPTER_ERROR_MSG.PARTITION_CALLBACK_MISSING_FIELDS,
    );
  }
});

test('executeRequest - PARTITION_CALLBACK rejects missing ' +
  'callbackExport', async (t) => {
  const engine = createEngine();

  const fakeReq = Object.freeze({
    tenantId: 'system',
    sessionId: 'default',
    statement: 'SELECT * FROM users',
    parameters: [],
    executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
    callbackModuleRef: 'mod-1',
    callbackExport: null,
    runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
    budgets: Object.freeze({}),
    hints: null,
  });

  try {
    await engine.executeRequest(fakeReq);
    t.fail('should have thrown');
  } catch (err) {
    t.equal(
      err.message,
      ADAPTER_ERROR_MSG.PARTITION_CALLBACK_MISSING_FIELDS,
    );
  }
});

test('executeRequest - PARTITION_CALLBACK fails closed without runtime ownership',
  async (t) => {
    const engine = createEngineWithoutRuntime();
    const req = createSqlRequest({
      statement: 'SELECT * FROM users',
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: 'mod-1',
      callbackExport: 'run_batch',
      runtimeKind: CALLBACK_RUNTIME_KIND.NATIVE_JS,
    });

    try {
      await engine.executeRequest(req);
      t.fail('should have thrown');
    } catch (err) {
      t.equal(
        err.message,
        ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED,
      );
    }
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
    callbackModuleRef: null,
    callbackExport: null,
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
