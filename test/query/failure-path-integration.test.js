/**
 * Failure-path integration tests — wires BudgetEnforcer,
 * CallbackStageExecutor, CancellationToken, DedupeRegistry,
 * ShuffleBuffer, and BroadcastStore together to verify
 * end-to-end failure scenarios.
 *
 * Scenarios:
 * - Budget exceed during emit/lookup/broadcast terminates
 *   with descriptive error
 * - Cancellation during active stage execution stops
 *   remaining batches
 * - Retry with dedupe registry skips already-committed work
 * - Combined: budget exceed + cancellation, retry after
 *   budget failure
 *
 * Requirements: 9.1, 9.3, 9.4, 9.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  BudgetEnforcer,
} from '../../src/query/budget-enforcer.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  CallbackStageExecutor,
} from '../../src/query/callback-stage-executor.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {
  DedupeRegistry,
} from '../../src/query/dedupe-registry.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  ShuffleBuffer,
} from '../../src/query/emit-primitive.js';
import {
  BroadcastStore,
} from '../../src/query/broadcast-primitive.js';
import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
} from '../../src/query/callback-stage-constants.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../../src/query/guardrail-constants.js';
import {
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed-context-constants.js';
import {
  QB_FIELD,
} from '../../src/wasm-service/query-budget-constants.js';

// -------------------------------------------------------
// Budget exceed during emit terminates operation (9.1, 9.4)
// -------------------------------------------------------

test('budget exceed during emit terminates and returns ' +
  'descriptive error', async (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.EMIT_MAX_BYTES]: 10,
  });
  const buffer = new ShuffleBuffer({maxBytes: 10});

  // Emit within budget succeeds
  await buffer.emit('k1', new Uint8Array([1, 2, 3]));
  enforcer.recordEmitBytes(5);
  t.equal(enforcer.isTerminated(), false);

  // Emit that exceeds budget terminates enforcer
  try {
    enforcer.recordEmitBytes(6);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.category, BUDGET_CATEGORY.EMIT_BYTES);
    t.ok(err.message.includes('Emit'));
  }
  t.equal(enforcer.isTerminated(), true);

  // ShuffleBuffer also rejects when its own limit is hit
  try {
    await buffer.emit(
      'k2', new Uint8Array(11),
    );
    t.fail('Expected emit budget error');
  } catch (err) {
    t.equal(
      err.message,
      PRIMITIVE_ERROR_MSG.EMIT_MAX_BYTES_EXCEEDED,
    );
  }
  t.end();
});

// -------------------------------------------------------
// Budget exceed during broadcast terminates (9.1, 9.4)
// -------------------------------------------------------

test('budget exceed during broadcast terminates and ' +
  'returns descriptive error', (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 30,
  });
  // Store allows small payloads but rejects large ones
  const store = new BroadcastStore({maxPayloadBytes: 50});

  // Small broadcast succeeds (24 bytes serialized)
  store.broadcast('r1', {version: 1, data: 'a'});
  enforcer.recordBroadcastBytes(24);
  t.equal(enforcer.isTerminated(), false);

  // Exceeding enforcer budget terminates it
  try {
    enforcer.recordBroadcastBytes(7);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(
      err.category, BUDGET_CATEGORY.BROADCAST_BYTES,
    );
  }
  t.equal(enforcer.isTerminated(), true);

  // BroadcastStore rejects oversized payload
  t.throws(
    () => store.broadcast('r2', {
      version: 2,
      data: 'x'.repeat(100),
    }),
    {message: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED},
  );
  t.end();
});

// -------------------------------------------------------
// Budget exceed in callback terminates stage (9.1, 9.4)
// -------------------------------------------------------

test('budget exceed inside callback marks batch failed ' +
  'with descriptive error', async (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.CPU_TIME_LIMIT_MS]: 5,
  });

  const cb = async (_ctx, batch) => {
    enforcer.recordCpuTime(6);
    return batch.rows;
  };

  const executor = new CallbackStageExecutor({callback: cb});
  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ];

  const result = await executor.execute(batches);

  t.equal(result[SF.STATE], STAGE_STATE.FAILED);
  t.equal(result.failedPartitions, 1);
  const pr = result.partitionResults[0];
  t.equal(pr[SF.STATE], STAGE_STATE.FAILED);
  t.ok(pr[SF.ERROR].includes('CPU'));
  t.equal(enforcer.isTerminated(), true);
  t.end();
});

// -------------------------------------------------------
// Cancellation during active stage stops remaining (9.5)
// -------------------------------------------------------

test('cancellation during multi-batch execution stops ' +
  'remaining batches', async (t) => {
  const token = new CancellationToken();
  const invocations = [];

  const cb = async (_ctx, batch) => {
    invocations.push(batch.partitionId);
    if (batch.partitionId === 'p2') {
      token.cancel('user-abort');
    }
    return batch.rows;
  };

  const executor = new CallbackStageExecutor({
    callback: cb,
    cancellationToken: token,
  });

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
    {partitionId: 'p3', rows: [{v: 3}], rowCount: 1},
    {partitionId: 'p4', rows: [{v: 4}], rowCount: 1},
  ];

  const result = await executor.execute(batches);

  t.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
  t.ok(invocations.length <= 2,
    'p3 and p4 must not execute');
  t.equal(result.failedPartitions, 0);
  t.end();
});

// -------------------------------------------------------
// Timeout propagation cancels child stages (9.5)
// -------------------------------------------------------

test('timeout propagation cancels child executor via ' +
  'parent token', async (t) => {
  const parent = new CancellationToken();
  const child = parent.createChild();

  parent.cancel(ERR.TIMEOUT_EXCEEDED);

  const cb = async () => [];
  const executor = new CallbackStageExecutor({
    callback: cb,
    cancellationToken: child,
  });

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ];
  const result = await executor.execute(batches);

  t.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
  t.equal(result.cancelReason, ERR.TIMEOUT_EXCEEDED);
  t.equal(result.partitionResults.length, 0);
  t.end();
});

// -------------------------------------------------------
// Retry with dedupe skips already-committed work (9.3)
// -------------------------------------------------------

test('retry with dedupe registry skips committed ' +
  'batches and returns cached results', async (t) => {
  const registry = new DedupeRegistry();
  const tracker = new LineageTracker('q-fp-retry-1');

  let callCount = 0;
  const cb = async (_ctx, batch) => {
    callCount++;
    return batch.rows.map((r) => ({...r, done: true}));
  };

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  // First execution: both batches run
  const exec1 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const firstResult = await exec1.execute(batches);
  t.equal(callCount, 2);
  t.equal(firstResult[SF.STATE], STAGE_STATE.COMPLETED);

  // Retry: both batches skipped via dedupe
  callCount = 0;
  const exec2 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const retryResult = await exec2.execute(batches);
  t.equal(callCount, 0, 'no callbacks on retry');
  t.equal(
    retryResult[SF.STATE], STAGE_STATE.COMPLETED,
  );
  t.equal(retryResult.partitionResults.length, 2);

  // Cached results match original
  for (let i = 0; i < 2; i++) {
    t.same(
      retryResult.partitionResults[i][SF.ROWS],
      firstResult.partitionResults[i][SF.ROWS],
    );
  }
  t.end();
});

// -------------------------------------------------------
// Failed batch not registered in dedupe (9.3)
// -------------------------------------------------------

test('failed batch is not registered in dedupe so ' +
  'retry re-executes it', async (t) => {
  const registry = new DedupeRegistry();
  const tracker = new LineageTracker('q-fp-retry-2');

  let attempt = 0;
  const cb = async (_ctx, batch) => {
    attempt++;
    if (attempt === 1) {
      throw new Error('transient failure');
    }
    return batch.rows.map((r) => ({...r, fixed: true}));
  };

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
  ];

  // First attempt: fails
  const exec1 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const r1 = await exec1.execute(batches);
  t.equal(r1[SF.STATE], STAGE_STATE.FAILED);
  t.equal(registry.size(), 0, 'failed not registered');

  // Retry: re-executes and succeeds
  const exec2 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const r2 = await exec2.execute(batches);
  t.equal(r2[SF.STATE], STAGE_STATE.COMPLETED);
  t.equal(registry.size(), 1, 'success registered');
  t.end();
});

// -------------------------------------------------------
// Combined: budget exceed triggers cancellation (9.4, 9.5)
// -------------------------------------------------------

test('budget exceed in callback triggers cancellation ' +
  'of remaining batches', async (t) => {
  const token = new CancellationToken();
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.LOOKUP_MAX_KEYS]: 2,
  });
  const invocations = [];

  const cb = async (_ctx, batch) => {
    invocations.push(batch.partitionId);
    try {
      enforcer.recordLookupKeys(3);
    } catch (err) {
      token.cancel(err.message);
      throw err;
    }
    return batch.rows;
  };

  const executor = new CallbackStageExecutor({
    callback: cb,
    cancellationToken: token,
  });

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  const result = await executor.execute(batches);

  t.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
  t.equal(invocations.length, 1, 'only first batch ran');
  t.equal(token.isCancelled(), true);
  t.ok(token.getReason().includes('Lookup'));
  t.equal(enforcer.isTerminated(), true);
  t.end();
});

// -------------------------------------------------------
// Combined: retry after budget failure (9.3, 9.4)
// -------------------------------------------------------

test('retry after budget failure re-executes with ' +
  'fresh enforcer and dedupes prior success', async (t) => {
  const registry = new DedupeRegistry();
  const tracker = new LineageTracker('q-fp-combo-1');

  let attempt = 0;
  const cb = async (_ctx, batch) => {
    attempt++;
    if (batch.partitionId === 'p2' && attempt <= 2) {
      throw new BudgetLimitError(ERR.EMIT_BYTES_EXCEEDED, {
        category: BUDGET_CATEGORY.EMIT_BYTES,
        limit: 100,
        usage: 101,
      });
    }
    return batch.rows.map((r) => ({...r, ok: true}));
  };

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  // First attempt: p1 succeeds, p2 fails
  const exec1 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const r1 = await exec1.execute(batches);
  t.equal(r1[SF.STATE], STAGE_STATE.FAILED);
  t.equal(r1.failedPartitions, 1);
  t.equal(registry.size(), 1, 'p1 success registered');

  // Retry: p1 deduped, p2 re-executes and succeeds
  const exec2 = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
  });
  const r2 = await exec2.execute(batches);
  t.equal(r2[SF.STATE], STAGE_STATE.COMPLETED);
  t.equal(r2.failedPartitions, 0);
  t.equal(registry.size(), 2, 'both now registered');
  t.end();
});

// -------------------------------------------------------
// Emit budget + enforcer wired together (9.1, 9.4)
// -------------------------------------------------------

test('emit through ShuffleBuffer with BudgetEnforcer ' +
  'terminates on combined limit', async (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.EMIT_MAX_BYTES]: 20,
  });
  const buffer = new ShuffleBuffer({maxBytes: 50});

  // Emit records, tracking bytes in enforcer
  const data1 = new Uint8Array([1, 2, 3, 4, 5]);
  await buffer.emit('k1', data1);
  enforcer.recordEmitBytes(7);

  const data2 = new Uint8Array([6, 7, 8, 9, 10]);
  await buffer.emit('k2', data2);
  enforcer.recordEmitBytes(7);

  t.equal(enforcer.isTerminated(), false);

  // Third emit pushes enforcer over its limit
  const data3 = new Uint8Array([11, 12, 13, 14, 15]);
  await buffer.emit('k3', data3);
  try {
    enforcer.recordEmitBytes(7);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.category, BUDGET_CATEGORY.EMIT_BYTES);
    t.equal(err.limit, 20);
    t.ok(err.usage > 20);
  }

  t.equal(enforcer.isTerminated(), true);

  // Enforcer rejects further recording
  try {
    enforcer.recordEmitBytes(1);
    t.fail('Expected terminated error');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(err.message, ERR.OPERATION_TERMINATED);
  }
  t.end();
});

// -------------------------------------------------------
// Cancellation + dedupe: cancelled batches not deduped (9.3, 9.5)
// -------------------------------------------------------

test('cancelled batches are not registered in dedupe ' +
  'registry', async (t) => {
  const registry = new DedupeRegistry();
  const tracker = new LineageTracker('q-fp-cancel-dedupe');
  const token = new CancellationToken();

  let callCount = 0;
  const cb = async (_ctx, batch) => {
    callCount++;
    if (batch.partitionId === 'p1') {
      token.cancel('abort');
    }
    return batch.rows;
  };

  const batches = [
    {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
    {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
  ];

  const executor = new CallbackStageExecutor({
    callback: cb,
    lineageTracker: tracker,
    stageIndex: 0,
    dedupeRegistry: registry,
    cancellationToken: token,
  });

  const result = await executor.execute(batches);

  t.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
  t.equal(callCount, 1, 'only p1 ran');
  // p1 was cancelled during execution, so its result
  // should be marked cancelled, not registered
  t.equal(registry.size(), 0,
    'cancelled batch not registered');
  t.end();
});

// -------------------------------------------------------
// Broadcast size cap + enforcer wired together (9.1, 9.4)
// -------------------------------------------------------

test('broadcast store rejects oversized payload and ' +
  'enforcer terminates on budget', (t) => {
  const enforcer = new BudgetEnforcer({
    [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 50,
  });
  const store = new BroadcastStore({maxPayloadBytes: 50});

  // Small broadcast succeeds
  store.broadcast('ref-a', {version: 1, data: 'ok'});
  enforcer.recordBroadcastBytes(25);
  t.equal(enforcer.isTerminated(), false);

  // Oversized broadcast rejected by store
  try {
    store.broadcast('ref-b', {
      version: 2,
      data: 'x'.repeat(100),
    });
    t.fail('Expected broadcast size error');
  } catch (err) {
    t.equal(
      err.message,
      PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED,
    );
  }

  // Enforcer also terminates on its own limit
  try {
    enforcer.recordBroadcastBytes(26);
    t.fail('Expected BudgetLimitError');
  } catch (err) {
    t.ok(err instanceof BudgetLimitError);
    t.equal(
      err.category, BUDGET_CATEGORY.BROADCAST_BYTES,
    );
  }
  t.equal(enforcer.isTerminated(), true);
  t.end();
});
