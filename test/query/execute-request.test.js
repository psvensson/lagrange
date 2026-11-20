/**
 * Tests for SqlCore.executeRequest(SqlRequest) dispatch.
 *
 * Requirements: 1.1, 13.1
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
} from '../../src/query/sql-adapter-constants.js';
import {ResultStream} from '../../src/query/result-stream.js';
import {
  CoordinatorMergeSession,
} from '../../src/query/distributed/coordinator-merge-session.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {
  collectBoundedSqliteRows,
  QUERY_RESULT_BUDGET_ERROR_CODE,
} from '../../src/query/query-result-budget.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {PARTITION_STATE} from '../../src/partition/partition-constants.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  DEFAULT_QUERY_BUDGET,
  QUERY_BUDGET_ERROR_MSG,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
  normalizeQueryBudget,
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
      table_id: 'users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_key_type: 'integer',
      partition_version: 1,
      replica_count: 1,
      state: PARTITION_STATE.NORMAL,
      leader_node_id: 'test-node',
    },
  ];
  const services = [PartitionServiceRowOwner.buildServiceRow({
    partitionId: 'p1',
    replicaId: 'p1',
    nodeId: 'test-node',
    status: SERVICE_STATUS.ACTIVE,
    service: {isLeader: true},
  })];
  return {
    get: function(type, _key) {
      if (type === 'tables') {
        if (_key === 'users') {
          return {table_id: 'users', table_name: 'users', primary_key: 'id',
            active_partition_version: 1};
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
    budgets: normalizeQueryBudget(),
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
  const deliveries = [];
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache(),
    messageRouter: {
      deliver: async (_address, message) => {
        assert.equal(message.type, QUERY_MESSAGE_TYPE.QUERY);
        assert.equal(typeof message.sql, 'string');
        assert.ok(Array.isArray(message.params));
        const delivery = {sql: message.sql, params: message.params,
          maxRows: message.resultMaxRows, maxBytes: message.resultMaxBytes};
        deliveries.push(delivery);
        let rows;
        try {
          rows = collectBoundedSqliteRows(db.prepare(message.sql), message.params, {
            maxRows: message.resultMaxRows,
            maxBytes: message.resultMaxBytes,
            deadlineMs: message.resultDeadlineMs,
          });
        } catch (error) {
          delivery.errorCode = error.code;
          throw error;
        }
        delivery.rowCount = rows.length;
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows,
          count: rows.length,
          rowSetComplete: true,
          partitionId: 'p1',
        });
      },
    },
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
    wasmExecutor,
    autoStartDistributedTransactionRecovery: false,
  });
  return {engine, deliveries, close: async () => {
    await engine.shutdown();
    db.close();
  }};
}

function createExpandingStageRequest(budgets, observations, resultStream) {
  return Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users WHERE id = ?',
      parameters: [1],
      executionMode: EXECUTION_MODE.STAGE,
      budgets,
    }),
    resultStream,
    handler: async (batch, stageCtx) => {
      observations.inputs.push(...batch);
      for (const row of batch) {
        for (const id of [row.id, row.id + 1]) {
          const output = {...row, id};
          await stageCtx.out(output);
          observations.outputs.push(output);
        }
      }
      return observations.outputs.length;
    },
  });
}

test('executeRequest STAGE - enforces RESULT_MAX_ROWS and result-byte ' +
  'limits on default ResultStream and preserves injected streams',
async (t) => {
  const {engine, close, deliveries} = createSqliteBackedEngine();
  t.teardown(close);

  // One bounded input row expands into two real ctx.out writes.
  const allowed = {inputs: [], outputs: []};
  const allowTwoReq = createExpandingStageRequest({RESULT_MAX_ROWS: 2}, allowed);
  const allowTwoRes = await engine.executeRequest(allowTwoReq);
  t.equal(allowTwoRes.success, true);
  t.same(allowTwoRes.results, [2]);
  t.same(allowed.inputs, [{id: 1, v: 'ab'}]);
  t.same(allowed.outputs, [{id: 1, v: 'ab'}, {id: 2, v: 'ab'}]);
  t.same(deliveries[0].params, [1], 'actual parameters reach SQLite');
  t.match(deliveries[0].sql, /WHERE/u, 'the delivered predicate reaches SQLite');
  t.equal(deliveries[0].rowCount, 1);

  // 2) RESULT_MAX_ROWS: 1 on default stream -> 2nd write rejected
  const rowLimited = {inputs: [], outputs: []};
  const rejectSecondRowReq = createExpandingStageRequest({RESULT_MAX_ROWS: 1}, rowLimited);
  try {
    await engine.executeRequest(rejectSecondRowReq);
    t.fail('should have rejected 2nd row');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.message, QUERY_BUDGET_ERROR_MSG.RESULT_MAX_ROWS_EXCEEDED);
  }
  t.same(rowLimited.inputs, [{id: 1, v: 'ab'}], 'input fits the real read budget');
  t.same(rowLimited.outputs, [{id: 1, v: 'ab'}], 'only the first output was accepted');

  // 3) Custom result-byte limit on default stream
  // Each row {"id":1,"v":"ab"} is 17 bytes; limit 20 allows 1st and rejects 2nd
  const byteLimited = {inputs: [], outputs: []};
  const byteLimitReq = createExpandingStageRequest({RESULT_MAX_BYTES: 20}, byteLimited);
  try {
    await engine.executeRequest(byteLimitReq);
    t.fail('should have rejected on result byte budget');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.message, QUERY_BUDGET_ERROR_MSG.RESULT_MAX_BYTES_EXCEEDED);
    t.equal(err.limit, 20);
  }
  t.same(byteLimited.inputs, [{id: 1, v: 'ab'}]);
  t.same(byteLimited.outputs, [{id: 1, v: 'ab'}]);

  // 4) Explicitly injected budgeted stream -> preserved and enforced
  const injectedStream = new ResultStream(normalizeQueryBudget({RESULT_MAX_ROWS: 1}));
  const injected = {inputs: [], outputs: []};
  const injectedReq = createExpandingStageRequest(
    {RESULT_MAX_ROWS: 10}, injected, injectedStream,
  );
  try {
    await engine.executeRequest(injectedReq);
    t.fail('should have rejected on injected stream budget');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
  }
  t.same(injectedStream.getRows(), [{id: 1, v: 'ab'}]);
});

test('executeRequest STAGE - bounded input collection refuses before the handler', async (t) => {
  const {engine, close, deliveries} = createSqliteBackedEngine();
  t.teardown(close);
  let handlerCalls = 0;
  const request = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {RESULT_MAX_ROWS: 1},
    }),
    handler: async () => {
      handlerCalls += 1;
    },
  });
  const result = await engine.executeRequest(request);
  t.equal(result.success, false);
  t.equal(handlerCalls, 0);
  t.ok(deliveries.length > 0, 'the production input collection path engaged');
  t.ok(deliveries.every((delivery) =>
    delivery.errorCode === QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED),
  'input was refused for the named row bound');
});

test('executeRequest STAGE - enforces OUT_MAX_BYTES, refuses budgets that ' +
  'are not normalized, and carries every dimension to its reader',
async (t) => {
  const {engine, close} = createSqliteBackedEngine();
  t.teardown(close);

  // 5a) OUT_MAX_BYTES: 1 rejects the 17-byte write {"id":1,"v":"ab"}
  const tightOutReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {OUT_MAX_BYTES: 1},
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

  // 5b) OUT_MAX_BYTES: 128 -> succeeds
  const okReq = Object.freeze({
    ...createSqlRequest({
      statement: 'SELECT id, v FROM users ORDER BY id',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {OUT_MAX_BYTES: 128},
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

  // A field that is not a canonical limit name is refused, never defaulted:
  // at request construction, and at direct admission of a request whose
  // budget was replaced after construction (before the handler runs).
  for (const budgets of [
    {outMaxBytes: 1},
    {OUT_MAX_BYTES: 1, outMaxBytes: 1},
    {OUT_MAX_BYTE: 1},
  ]) {
    t.throws(
      () => createSqlRequest({statement: 'SELECT 1', budgets}),
      new RegExp(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.UNKNOWN_BUDGET_FIELD),
    );
    const rawBudgetReq = Object.freeze({
      ...createSqlRequest({
        statement: 'SELECT id, v FROM users ORDER BY id',
        executionMode: EXECUTION_MODE.STAGE,
      }),
      budgets,
      handler: async () => t.fail('a raw budget must refuse before the handler'),
    });
    await t.rejects(
      engine.executeRequest(rawBudgetReq),
      {message: ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST},
    );
  }
  for (const limit of ['7', -1, 1.5, Number.NaN, null]) {
    t.throws(
      () => createSqlRequest({statement: 'SELECT 1', budgets: {OUT_MAX_BYTES: limit}}),
      new RegExp(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_LIMIT),
    );
  }

  // 6) Audit all 15 budget dimensions between SqlRequest and BudgetEnforcer / ResultStream / CoordinatorMergeSession
  for (const field of Object.keys(DEFAULT_QUERY_BUDGET)) {
    const request = createSqlRequest({
      statement: 'SELECT id, v FROM users',
      executionMode: EXECUTION_MODE.STAGE,
      budgets: {[field]: 77},
    });
    const ctx = engine.createRequestExecutionContext(request);
    t.equal(ctx._budgets, request.budgets, `${field}: the context reads the request budget`);
    t.equal(ctx._budgets[field], 77);
    const mergeSession = new CoordinatorMergeSession({budget: ctx._budgets});
    try {
      const enforcedLimits = [
        ...Object.values(ctx.getBudgetEnforcer()._limits),
        ctx._resultStream.maxRows,
        ctx._resultStream.maxBytes,
        mergeSession.mergeInputMaxRows,
      ];
      t.equal(
        enforcedLimits.filter((limit) => limit === 77).length,
        1,
        `${field} reaches exactly one enforced limit`,
      );
    } finally {
      mergeSession.close();
    }
  }
});
