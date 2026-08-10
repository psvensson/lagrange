/**
 * End-to-end integration tests for multi-partition callback
 * execution, retries, and failure contracts.
 *
 * Validates: Requirements 10.1, 13.4, 14.5
 *
 * Wires the full callback pipeline:
 *   SqlCore.executeRequest → PartitionCallbackDispatcher →
 *   CallbackExecutionHost → runtime driver → handler
 *
 * Uses real SQLQueryEngine with mock system cache and message
 * router (same pattern as execute-request.test.js).
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from
  '../../src/query/sql-query-engine.js';
import {createSqlRequest} from
  '../../src/query/sql-request.js';
import {
  EXECUTION_MODE,
  CALLBACK_RUNTIME_KIND,
} from '../../src/query/sql-adapter-constants.js';
import {
  STAGE_STATE,
} from '../../src/query/callback/callback-stage-constants.js';
import {BudgetEnforcer} from
  '../../src/query/budget-enforcer.js';
import {LineageTracker} from
  '../../src/query/lineage-tracker.js';
import {DedupeRegistry} from
  '../../src/query/dedupe-registry.js';
import {CancellationToken} from
  '../../src/query/cancellation-token.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {QB_FIELD} from
  '../../src/wasm-service/query-budget-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
config.initialize();

// --- Shared helpers ---

const PARTITION_COUNT = 3;

function makePartitions(count) {
  const partitions = [];
  for (let i = 0; i < count; i++) {
    partitions.push({
      partition_id: `p${i}`,
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    });
  }
  return partitions;
}

/**
 * Build per-partition row data for the mock router.
 * @param {number} count - Number of partitions.
 * @return {Object} Map of partitionId → rows.
 */
function makePartitionRows(count) {
  const rows = {};
  for (let i = 0; i < count; i++) {
    rows[`p${i}`] = [
      {id: i * 10 + 1, name: `user-${i}-a`},
      {id: i * 10 + 2, name: `user-${i}-b`},
    ];
  }
  return rows;
}

function createMockSystemCache(partitionCount) {
  const partitions = makePartitions(partitionCount);
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
    get: function(type, _key) {
      if (type === 'tables') {
        return {table_name: 'users', primaryKey: 'id'};
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

function createMockMessageRouter(partitionRows, opts = {}) {
  return {
    deliver: async function(address, _message) {
      // Extract partition id from address
      const parts = address.split('/');
      const partitionId = parts[parts.length - 1];

      if (opts.failPartitions &&
          opts.failPartitions.includes(partitionId)) {
        return {
          acknowledged: true,
          success: false,
          error: 'partition unavailable',
          rows: [],
          changes: 0,
        };
      }

      const rows = partitionRows[partitionId] || [];
      return {
        acknowledged: true,
        success: true,
        rows,
        changes: 0,
      };
    },
  };
}

function createCallbackRequest(overrides = {}) {
  return createSqlRequest({
    statement: overrides.statement || 'SELECT * FROM users',
    executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
    callbackModuleRef: overrides.callbackModuleRef || 'mod-1',
    callbackExport: overrides.callbackExport || 'run_batch',
    runtimeKind:
      overrides.runtimeKind || CALLBACK_RUNTIME_KIND.NATIVE_JS,
    ...overrides,
  });
}

function createEngine(partitionCount, partitionRows, opts) {
  return new SQLQueryEngine({
    systemCache: createMockSystemCache(partitionCount),
    messageRouter: createMockMessageRouter(
      partitionRows, opts,
    ),
  });
}

function createRuntimeDriverRegistry() {
  const runtimeWiring = createRuntimeStartupWiring();
  return runtimeWiring.runtimeDriverRegistry;
}

// ============================================================
// Multi-partition callback execution (Req 14.5)
// ============================================================

test('integration - multi-partition callback processes all ' +
  'partitions and aggregates results', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows);

  const processed = [];
  const handler = (batch) => {
    processed.push(batch.partitionId);
    return batch.rows.map((r) => ({...r, processed: true}));
  };

  const runtimeRegistry = createRuntimeDriverRegistry();
  const req = createCallbackRequest();

  const result = await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
  });

  t.equal(result.success, true);
  t.equal(result.executionMode,
    EXECUTION_MODE.PARTITION_CALLBACK);
  t.equal(result.batches.length, PARTITION_COUNT);
  t.equal(result.hostResult.state, STAGE_STATE.COMPLETED);
  t.equal(result.hostResult.totalPartitions, PARTITION_COUNT);
  t.equal(
    result.hostResult.processedPartitions, PARTITION_COUNT,
  );
  t.equal(result.hostResult.failedPartitions, 0);
  // Each partition had 2 rows
  t.equal(result.hostResult.totalRows, PARTITION_COUNT * 2);
  // All partitions were visited
  t.equal(processed.length, PARTITION_COUNT);
  t.same(processed.sort(), ['p0', 'p1', 'p2']);
});

test('integration - executeRequest dispatches ' +
  'partition_callback through full pipeline', async (t) => {
  const partitionRows = makePartitionRows(1);
  const engine = createEngine(1, partitionRows);

  const req = createCallbackRequest();
  const runtimeRegistry = createRuntimeDriverRegistry();

  // executeRequest is the top-level dispatch entry
  const result = await engine.executeRequest({
    ...req,
    handler: (batch) => batch.rows,
    runtimeDriverRegistry: runtimeRegistry,
  });

  t.equal(result.success, true);
  t.equal(result.executionMode,
    EXECUTION_MODE.PARTITION_CALLBACK);
  t.equal(result.callbackModuleRef, 'mod-1');
  t.equal(result.callbackExport, 'run_batch');
  t.ok(result.hostResult);
  t.equal(result.hostResult.state, STAGE_STATE.COMPLETED);
});

// ============================================================
// Retry with dedupe (Req 10.1, 10.3)
// ============================================================

test('integration - retry with same lineage dedupes ' +
  'already-processed batches', async (t) => {
  const partitionRows = makePartitionRows(2);
  const engine = createEngine(2, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();
  const tracker = new LineageTracker('q-retry');
  const dedupeReg = new DedupeRegistry();

  let callCount = 0;
  const handler = (batch) => {
    callCount++;
    return batch.rows;
  };

  const req = createCallbackRequest();

  // First execution — processes both partitions
  await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
    lineageTracker: tracker,
    dedupeRegistry: dedupeReg,
  });
  t.equal(callCount, 2, 'first run processes both');

  // Second execution (retry) — same lineage, should dedupe
  callCount = 0;
  const retryResult = await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
    lineageTracker: tracker,
    dedupeRegistry: dedupeReg,
  });

  t.equal(callCount, 0,
    'retry skips all batches via dedupe');
  t.equal(retryResult.hostResult.state,
    STAGE_STATE.COMPLETED);
  t.equal(retryResult.hostResult.processedPartitions, 2);
});

// ============================================================
// Failure contracts (Req 10.1, 14.5)
// ============================================================

test('integration - handler error on one partition yields ' +
  'partial failure result', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();

  const handler = (batch) => {
    if (batch.partitionId === 'p1') {
      throw new Error('partition p1 handler error');
    }
    return batch.rows;
  };

  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
  });

  // Overall state is failed because one partition failed
  t.equal(result.hostResult.state, STAGE_STATE.FAILED);
  t.equal(result.hostResult.failedPartitions, 1);
  // But other partitions were still processed
  t.equal(result.hostResult.processedPartitions,
    PARTITION_COUNT);

  const failed = result.hostResult.partitionResults.find(
    (r) => r.state === STAGE_STATE.FAILED,
  );
  t.ok(failed);
  t.ok(failed.error.includes('partition p1 handler error'));

  const completed = result.hostResult.partitionResults.filter(
    (r) => r.state === STAGE_STATE.COMPLETED,
  );
  t.equal(completed.length, PARTITION_COUNT - 1);
});

test('integration - partition read failure on one partition yields ' +
  'typed partial outcome with failed read counts', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows, {
    failPartitions: ['p1'],
  });
  const runtimeRegistry = createRuntimeDriverRegistry();

  const processed = [];
  const handler = (batch) => {
    processed.push(batch.partitionId);
    return batch.rows;
  };

  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
  });

  // The read-side twin of the handler-error partial contract: the
  // failed partition READ surfaces in the host result counts instead
  // of being silently dropped from the batch list (ARCH-0139).
  t.equal(result.hostResult.state, STAGE_STATE.FAILED);
  t.equal(result.hostResult.totalPartitions, PARTITION_COUNT);
  t.equal(result.hostResult.failedPartitions, 1);
  t.equal(
    result.hostResult.processedPartitions, PARTITION_COUNT - 1,
  );
  t.equal(result.hostResult.failedPartitionReads.length, 1);
  t.equal(result.hostResult.failedPartitionReads[0].partitionId, 'p1');
  t.ok(result.hostResult.failedPartitionReads[0].error);
  t.equal(result.failedPartitions.length, 1);
  t.same(processed.sort(), ['p0', 'p2']);
});

test('integration - all partition reads failing yields non-success ' +
  'typed outcome instead of totalPartitions 0', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows, {
    failPartitions: ['p0', 'p1', 'p2'],
  });
  const runtimeRegistry = createRuntimeDriverRegistry();

  let handlerCalled = false;
  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler: () => {
      handlerCalled = true;
      return [];
    },
    runtimeDriverRegistry: runtimeRegistry,
  });

  t.equal(result.success, false,
    'total read failure is a non-success typed outcome, ' +
    'never a clean empty result');
  t.ok(result.error, 'typed outcome carries an error message');
  t.ok(result.errorCode, 'typed outcome carries an errorCode');
  t.equal(handlerCalled, false,
    'callback never invoked when no batch exists');

  // Artifacts record "3 partitions, 3 failed" — not totalPartitions 0.
  t.equal(result.hostResult.state, STAGE_STATE.FAILED);
  t.equal(result.hostResult.totalPartitions, PARTITION_COUNT);
  t.equal(result.hostResult.failedPartitions, PARTITION_COUNT);
  t.equal(result.hostResult.processedPartitions, 0);
  t.equal(
    result.hostResult.failedPartitionReads.length, PARTITION_COUNT,
  );
  for (const entry of result.hostResult.failedPartitionReads) {
    t.ok(entry.partitionId, 'entry names its partition');
    t.ok(entry.error, 'entry carries the read error');
  }
});

test('integration - budget exceeded mid-execution propagates ' +
  'budget error', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();

  // Set an extremely low out-bytes budget so it triggers
  // after the first batch. The first batch's recordOutBytes
  // terminates the enforcer; the second batch's pre-invocation
  // _checkBudget throws before the try/catch in _executeBatch,
  // propagating as a rejected promise from execute().
  const budgetEnforcer = new BudgetEnforcer({
    [QB_FIELD.OUT_MAX_BYTES]: 1,
  });

  const req = createCallbackRequest();
  try {
    await engine.executePartitionCallback({
      ...req,
      handler: (batch) => batch.rows,
      runtimeDriverRegistry: runtimeRegistry,
      budgetEnforcer,
    });
    t.fail('should have thrown budget error');
  } catch (err) {
    t.ok(err.message.includes('budget') ||
      err.message.includes('terminated'),
    'error indicates budget termination');
  }
});

test('integration - cancellation mid-execution stops ' +
  'remaining batches', async (t) => {
  const partitionRows = makePartitionRows(PARTITION_COUNT);
  const engine = createEngine(PARTITION_COUNT, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();
  const token = new CancellationToken();

  let callCount = 0;
  const handler = (batch) => {
    callCount++;
    if (callCount === 2) {
      token.cancel('user_cancel');
    }
    return batch.rows;
  };

  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler,
    runtimeDriverRegistry: runtimeRegistry,
    cancellationToken: token,
  });

  t.equal(result.hostResult.state, STAGE_STATE.CANCELLED);
  t.ok(result.hostResult.processedPartitions < PARTITION_COUNT,
    'not all partitions processed');
});

// ============================================================
// Telemetry integration (Req 13.3, 14.5)
// ============================================================

test('integration - hostResult carries aggregate telemetry ' +
  'fields from full pipeline', async (t) => {
  const partitionRows = makePartitionRows(2);
  const engine = createEngine(2, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();

  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler: (batch) => batch.rows,
    runtimeDriverRegistry: runtimeRegistry,
  });

  const hr = result.hostResult;
  t.equal(hr.state, STAGE_STATE.COMPLETED);
  t.equal(hr.totalPartitions, 2);
  t.equal(hr.processedPartitions, 2);
  t.equal(hr.failedPartitions, 0);
  // 2 rows per partition × 2 partitions
  t.equal(hr.totalRows, 4);
  t.ok(hr.totalBytes > 0,
    'aggregate byte estimate is positive');
  t.equal(typeof hr.totalDurationMs, 'number');

  // Per-batch results carry individual telemetry
  for (const pr of hr.partitionResults) {
    t.equal(pr.state, STAGE_STATE.COMPLETED);
    t.ok(pr.rowCount > 0);
    t.ok(pr.byteEstimate > 0);
    t.equal(typeof pr.durationMs, 'number');
  }
});

// ============================================================
// Compatibility: SQL_STATEMENT still works (Req 13.4)
// ============================================================

test('integration - SQL_STATEMENT mode still works alongside ' +
  'PARTITION_CALLBACK', async (t) => {
  const partitionRows = {'p0': [{id: 1, name: 'Alice'}]};
  const engine = createEngine(1, partitionRows);

  // SQL_STATEMENT request
  const stmtReq = createSqlRequest({
    statement: 'SELECT * FROM users',
    executionMode: EXECUTION_MODE.SQL_STATEMENT,
  });
  const stmtResult = await engine.executeRequest(stmtReq);
  t.equal(stmtResult.success, true);
  t.ok(stmtResult.rows);

  // PARTITION_CALLBACK request on same engine
  const runtimeRegistry = createRuntimeDriverRegistry();
  const cbReq = createCallbackRequest();
  const cbResult = await engine.executeRequest({
    ...cbReq,
    handler: (batch) => batch.rows,
    runtimeDriverRegistry: runtimeRegistry,
  });
  t.equal(cbResult.success, true);
  t.equal(cbResult.executionMode,
    EXECUTION_MODE.PARTITION_CALLBACK);

  // Both modes produce distinct result shapes
  t.equal(stmtResult.executionMode, undefined);
  t.equal(stmtResult.hostResult, undefined);
  t.ok(cbResult.hostResult);
});

// ============================================================
// Lineage attachment integration (Req 10.2)
// ============================================================

test('integration - lineage IDs attached to batch and ' +
  'aggregate results', async (t) => {
  const partitionRows = makePartitionRows(2);
  const engine = createEngine(2, partitionRows);
  const runtimeRegistry = createRuntimeDriverRegistry();
  const tracker = new LineageTracker('q-lineage');

  const req = createCallbackRequest();
  const result = await engine.executePartitionCallback({
    ...req,
    handler: (batch) => batch.rows,
    runtimeDriverRegistry: runtimeRegistry,
    lineageTracker: tracker,
  });

  // Aggregate result has lineage
  t.ok(result.hostResult.lineageId,
    'aggregate result has lineage ID');

  // Per-batch results have lineage
  for (const pr of result.hostResult.partitionResults) {
    t.ok(pr.lineageId,
      `batch ${pr.partitionId} has lineage ID`);
  }
});

// ============================================================
// Pre-cancellation (Req 9.5)
// ============================================================

test('integration - pre-cancelled token skips all batches',
  async (t) => {
    const partitionRows = makePartitionRows(2);
    const engine = createEngine(2, partitionRows);
    const runtimeRegistry = createRuntimeDriverRegistry();
    const token = new CancellationToken();
    token.cancel('already_cancelled');

    let handlerCalled = false;
    const req = createCallbackRequest();
    const result = await engine.executePartitionCallback({
      ...req,
      handler: () => {
        handlerCalled = true;
        return [];
      },
      runtimeDriverRegistry: runtimeRegistry,
      cancellationToken: token,
    });

    t.equal(handlerCalled, false,
      'handler never called when pre-cancelled');
    t.equal(result.hostResult.state, STAGE_STATE.CANCELLED);
  });
