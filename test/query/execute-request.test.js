/**
 * Tests for SqlCore.executeRequest(SqlRequest) dispatch.
 *
 * Requirements: 1.1, 13.1
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
} from '../../src/query/sql-adapter-constants.js';
import {ResultStream} from '../../src/query/result-stream.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  QB_FIELD,
  QUERY_BUDGET_ERROR_MSG,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
} from '../../src/wasm-service/query-budget-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {WasmExecutor} from '../../src/wasm-service/wasm-executor.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
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
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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

function createSqliteBackedEngine(seedRows = [
  {id: 1, v: 'ab'},
  {id: 2, v: 'cd'},
]) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, v TEXT)');
  const insert = db.prepare('INSERT INTO users (id, v) VALUES (?, ?)');
  for (const row of seedRows) {
    insert.run(row.id, row.v);
  }
  const runtimeWiring = createRuntimeStartupWiring();
  const moduleMirror = new ModuleMirror();
  const wasmExecutor = new WasmExecutor({moduleMirror});
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache(),
    messageRouter: {
      deliver: async (_address, message) => {
        const sql = message?.payload?.sql || 'SELECT * FROM users';
        const params = message?.payload?.params || [];
        const rows = db.prepare(sql).all(...params);
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows,
          changes: 0,
        });
      },
    },
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
    wasmExecutor,
  });
  return {engine, close: () => db.close()};
}

test('executeRequest STAGE - enforces RESULT_MAX_ROWS and result-byte ' +
  'limits on default ResultStream and preserves injected streams',
async (t) => {
  const {engine, close} = createSqliteBackedEngine();
  t.teardown(close);

  // 1) RESULT_MAX_ROWS: 2 on default stream -> 2 ctx.out writes succeed
  const emittedRows = [];
  const allowTwoReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {RESULT_MAX_ROWS: 2},
    }),
    handler: async (batch, stageCtx) => {
      for (const row of batch) {
        await stageCtx.out(row);
        emittedRows.push(row);
      }
      return batch.length;
    },
  });
  const allowTwoRes = await engine.executeRequest(allowTwoReq);
  t.equal(allowTwoRes.success, true);
  t.same(allowTwoRes.results, [2]);
  t.same(emittedRows, [{id: 1, v: 'ab'}, {id: 2, v: 'cd'}]);

  // 2) RESULT_MAX_ROWS: 1 on default stream -> 2nd write rejected
  const rejectSecondRowReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {RESULT_MAX_ROWS: 1},
    }),
    handler: async (batch, stageCtx) => {
      for (const row of batch) {
        await stageCtx.out(row);
      }
    },
  });
  try {
    await engine.executeRequest(rejectSecondRowReq);
    t.fail('should have rejected 2nd row');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.message, QUERY_BUDGET_ERROR_MSG.RESULT_MAX_ROWS_EXCEEDED);
  }

  // 3) Custom result-byte limit on default stream (both uppercase & camelCase)
  // Each row {"id":1,"v":"ab"} is 17 bytes; limit 20 allows 1st and rejects 2nd
  for (const byteBudget of [{RESULT_MAX_BYTES: 20}, {resultMaxBytes: 20}]) {
    const byteLimitReq = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT id, v FROM users ORDER BY id',
        executionMode: EXECUTION_MODE.STAGE,
        budgets: byteBudget,
      }),
      handler: async (batch, stageCtx) => {
        for (const row of batch) {
          await stageCtx.out(row);
        }
      },
    });
    try {
      await engine.executeRequest(byteLimitReq);
      t.fail('should have rejected on result byte budget');
    } catch (err) {
      t.ok(err instanceof BudgetLimitError);
      t.equal(err.message, QUERY_BUDGET_ERROR_MSG.RESULT_MAX_BYTES_EXCEEDED);
      t.equal(err.limit, 20);
    }
  }

  // 4) Explicitly injected budgeted stream -> preserved and enforced
  const injectedStream = new ResultStream({RESULT_MAX_ROWS: 1});
  const injectedReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {RESULT_MAX_ROWS: 10},
    }),
    resultStream: injectedStream,
    handler: async (batch, stageCtx) => {
      for (const row of batch) {
        await stageCtx.out(row);
      }
    },
  });
  try {
    await engine.executeRequest(injectedReq);
    t.fail('should have rejected on injected stream budget');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
  }
  t.same(injectedStream.getRows(), [{id: 1, v: 'ab'}]);
});

test('executeRequest STAGE - normalizes OUT_MAX_BYTES and outMaxBytes ' +
  'and rejects conflicting budget limits across all dimensions',
async (t) => {
  const {engine, close} = createSqliteBackedEngine();
  t.teardown(close);

  // 5a) OUT_MAX_BYTES: 1 (uppercase) AND outMaxBytes: 1 (camelCase)
  // both reject 17-byte write {"id":1,"v":"ab"} with BudgetLimitError
  for (const outBudget of [{OUT_MAX_BYTES: 1}, {[QB_FIELD.OUT_MAX_BYTES]: 1}]) {
    const tightOutReq = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT id, v FROM users ORDER BY id',
        executionMode: EXECUTION_MODE.STAGE,
        budgets: outBudget,
      }),
      handler: async (batch, stageCtx) => {
        await stageCtx.out(batch[0]);
      },
    });
    try {
      await engine.executeRequest(tightOutReq);
      t.fail('should have rejected on out byte budget');
    } catch (err) {
      t.ok(err instanceof BudgetLimitError);
      t.equal(err.category, BUDGET_CATEGORY.OUT_BYTES);
      t.equal(err.limit, 1);
      t.equal(err.usage, 17);
    }
  }

  // 5b) OUT_MAX_BYTES: 128 and outMaxBytes: 128 -> both succeed
  for (const generousBudget of [
    {OUT_MAX_BYTES: 128},
    {[QB_FIELD.OUT_MAX_BYTES]: 128},
  ]) {
    const okReq = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT id, v FROM users ORDER BY id',
        executionMode: EXECUTION_MODE.STAGE,
        budgets: generousBudget,
      }),
      handler: async (batch, stageCtx) => {
        for (const row of batch) {
          await stageCtx.out(row);
        }
        return batch.length;
      },
    });
    const okRes = await engine.executeRequest(okReq);
    t.equal(okRes.success, true);
    t.same(okRes.results, [2]);
  }

  // 5c) Conflicting OUT_MAX_BYTES: 128 + outMaxBytes: 1 -> explicit error
  const conflictReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {OUT_MAX_BYTES: 128, outMaxBytes: 1},
    }),
    handler: async (batch, stageCtx) => {
      await stageCtx.out(batch[0]);
    },
  });
  try {
    await engine.executeRequest(conflictReq);
    t.fail('should have rejected conflicting budget limits');
  } catch (err) {
    t.ok(
      err.message.includes(
        QUERY_BUDGET_NORMALIZATION_ERROR_MSG.CONFLICTING_BUDGET_LIMITS,
      ),
    );
  }

  // 6) Audit all 14 budget dimensions between SqlRequest and BudgetEnforcer / ResultStream
  for (const [upperKey, camelKey] of Object.entries(QB_FIELD)) {
    const ctxUpper = engine.createRequestExecutionContext(
      createSqlRequest({
        statement: 'SELECT id, v FROM users',
        executionMode: EXECUTION_MODE.STAGE,
        budgets: {[upperKey]: 77},
      }),
    );
    const ctxCamel = engine.createRequestExecutionContext(
      createSqlRequest({
        statement: 'SELECT id, v FROM users',
        executionMode: EXECUTION_MODE.STAGE,
        budgets: {[camelKey]: 77},
      }),
    );
    t.equal(ctxUpper._budgets[upperKey], 77);
    t.equal(ctxUpper._budgets[camelKey], 77);
    t.equal(ctxCamel._budgets[upperKey], 77);
    t.equal(ctxCamel._budgets[camelKey], 77);
    t.same(ctxUpper.getBudgetEnforcer()._limits, ctxCamel.getBudgetEnforcer()._limits);
    t.equal(ctxUpper._resultStream.maxRows, ctxCamel._resultStream.maxRows);
    t.equal(ctxUpper._resultStream.maxBytes, ctxCamel._resultStream.maxBytes);
  }
});
