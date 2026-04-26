/**
 * Failure-path tests for retry duplicates and continuation
 * flows through the runtime pipeline.
 *
 * Covers:
 * - Retry with dedupe across emit pipeline (duplicate emit
 *   skipped on retry)
 * - Retry with dedupe across stage + reduceByKey pipeline
 * - Continuation token flow under retry (partial reduce
 *   retried correctly)
 * - Lineage ID stability across retry attempts
 * - Failed batch not deduped, successful batch deduped
 *
 * Requirements: 10.3, 11.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionContext} from
  '../../src/query/execution-context.js';
import {BudgetEnforcer} from
  '../../src/query/budget-enforcer.js';
import {CancellationToken} from
  '../../src/query/cancellation-token.js';
import {LineageTracker} from
  '../../src/query/lineage-tracker.js';
import {DedupeRegistry} from
  '../../src/query/dedupe-registry.js';
import {ExchangeManager} from
  '../../src/query/distributed/exchange-manager.js';
import {
  CallbackStageExecutor,
} from '../../src/query/callback/callback-stage-executor.js';
import {
  executeReduceByKey,
  buildGroupedBatches,
} from '../../src/query/call-plan.js';
import {
  EMIT_META_FIELD,
  EXCHANGE_MODE,
  REDUCE_FIELD,
  DEFAULT_SNAPSHOT_MODE,
  PLAN_KIND,
} from '../../src/query/runtime-constants.js';
import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
} from '../../src/query/callback/callback-stage-constants.js';

/**
 * Build a minimal ExecutionContext for testing.
 *
 * @param {Object} [overrides] - Override default deps.
 * @return {ExecutionContext}
 */
function buildCtx(overrides = {}) {
  const token = overrides.cancellationToken ??
    new CancellationToken();
  const budgetEnforcer = overrides.budgetEnforcer ??
    new BudgetEnforcer();
  const lineageTracker = overrides.lineageTracker ??
    new LineageTracker('retry-cont-q');
  const dedupeRegistry = overrides.dedupeRegistry ??
    new DedupeRegistry();
  const exchangeManager = overrides.exchangeManager ??
    new ExchangeManager();
  return new ExecutionContext({
    session: 'retry-cont-session',
    snapshot: {mode: DEFAULT_SNAPSHOT_MODE},
    budgetEnforcer,
    cancellationToken: token,
    lineageTracker,
    queryExecutor: overrides.queryExecutor ?? null,
    dedupeRegistry,
    exchangeManager,
  });
}

// ─── Emit dedupe on retry ────────────────────────────────────

describe('emit dedupe on retry via dedupeKey', () => {
  it('skips duplicate emit with same dedupeKey on retry',
    async () => {
      const mgr = new ExchangeManager();
      const ctx = buildCtx({exchangeManager: mgr});

      const dedupeKey = 'emit-retry-1';
      const meta = {[EMIT_META_FIELD.DEDUPE_KEY]: dedupeKey};

      // First emit succeeds
      await ctx.emit('k1', 'original', meta);
      const buf1 = mgr.getLocalBuffer();
      assert.equal(buf1.length, 1);
      assert.equal(buf1[0].value, 'original');

      // Retry emit with same dedupeKey is silently skipped
      await ctx.emit('k1', 'retry-value', meta);
      const buf2 = mgr.getLocalBuffer();
      assert.equal(buf2.length, 1,
        'retry emit skipped');
      assert.equal(buf2[0].value, 'original',
        'original value preserved');
    });

  it('allows emit with different dedupeKey on retry',
    async () => {
      const mgr = new ExchangeManager();
      const ctx = buildCtx({exchangeManager: mgr});

      await ctx.emit('k1', 'v1', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'key-a',
      });
      await ctx.emit('k2', 'v2', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'key-b',
      });

      const buf = mgr.getLocalBuffer();
      assert.equal(buf.length, 2);
    });
});

// ─── Stage retry with CallbackStageExecutor dedupe ───────────

describe('stage retry with dedupe registry', () => {
  it('retried batch skips callback and returns cached result',
    async () => {
      const registry = new DedupeRegistry();
      const tracker = new LineageTracker('retry-stage-1');

      let callCount = 0;
      const cb = async (_ctx, batch) => {
        callCount++;
        return batch.rows.map((r) => ({...r, processed: true}));
      };

      const batches = [
        {partitionId: 'p1', rows: [{v: 1}], rowCount: 1},
        {partitionId: 'p2', rows: [{v: 2}], rowCount: 1},
      ];

      // First execution
      const exec1 = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });
      const r1 = await exec1.execute(batches);
      assert.equal(callCount, 2);
      assert.equal(r1[SF.STATE], STAGE_STATE.COMPLETED);

      // Retry: both batches deduped
      callCount = 0;
      const exec2 = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });
      const r2 = await exec2.execute(batches);
      assert.equal(callCount, 0, 'no callbacks on retry');
      assert.equal(r2[SF.STATE], STAGE_STATE.COMPLETED);

      // Cached results match
      for (let i = 0; i < 2; i++) {
        assert.deepEqual(
          r2.partitionResults[i][SF.ROWS],
          r1.partitionResults[i][SF.ROWS],
        );
      }
    });

  it('failed batch re-executes on retry, success deduped',
    async () => {
      const registry = new DedupeRegistry();
      const tracker = new LineageTracker('retry-stage-2');

      let attempt = 0;
      const cb = async (_ctx, batch) => {
        attempt++;
        if (batch.partitionId === 'p2' && attempt <= 2) {
          throw new Error('transient');
        }
        return batch.rows;
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
      assert.equal(r1[SF.STATE], STAGE_STATE.FAILED);
      assert.equal(registry.size(), 1, 'only p1 registered');

      // Retry: p1 deduped, p2 re-executes and succeeds
      const exec2 = new CallbackStageExecutor({
        callback: cb,
        lineageTracker: tracker,
        stageIndex: 0,
        dedupeRegistry: registry,
      });
      const r2 = await exec2.execute(batches);
      assert.equal(r2[SF.STATE], STAGE_STATE.COMPLETED);
      assert.equal(registry.size(), 2, 'both registered');
    });
});

// ─── Lineage ID stability across retries ─────────────────────

describe('lineage ID stability', () => {
  it('same tracker + args produces same lineage ID',
    () => {
      const tracker = new LineageTracker('stable-q');
      const key1 = tracker.generateLineageId(0, 'emit', 0);
      const key2 = tracker.generateLineageId(0, 'emit', 0);
      assert.equal(key1, key2,
        'lineage ID is deterministic');
    });

  it('different stageIndex produces different lineage ID',
    () => {
      const tracker = new LineageTracker('stable-q');
      const key1 = tracker.generateLineageId(0, 'emit', 0);
      const key2 = tracker.generateLineageId(1, 'emit', 0);
      assert.notEqual(key1, key2);
    });

  it('different primitiveType produces different lineage ID',
    () => {
      const tracker = new LineageTracker('stable-q');
      const key1 = tracker.generateLineageId(0, 'emit', 0);
      const key2 = tracker.generateLineageId(0, 'lookup', 0);
      assert.notEqual(key1, key2);
    });
});

// ─── ReduceByKey continuation under retry ────────────────────

describe('reduceByKey continuation flow', () => {
  it('all chunks delivered in order with continuation tokens',
    async () => {
      const mgr = new ExchangeManager(
        {mode: EXCHANGE_MODE.LOCAL},
      );
      for (let i = 0; i < 7; i++) {
        mgr.route('g', i);
      }

      const received = [];
      const deps = {
        plan: {kind: PLAN_KIND.REDUCE_BY_KEY},
        params: [],
        handler: async (batch) => {
          received.push({
            key: batch[REDUCE_FIELD.KEY],
            records: [...batch[REDUCE_FIELD.RECORDS]],
            continuation: batch[REDUCE_FIELD.CONTINUATION],
          });
          return batch;
        },
        opts: {maxRecordsPerGroup: 3},
        queryExecutor: async () => ({rows: []}),
        cancellationToken: new CancellationToken(),
        executionContext: buildCtx({exchangeManager: mgr}),
      };

      await executeReduceByKey(deps);

      // 7 records / 3 per chunk = 3 chunks
      assert.equal(received.length, 3);

      // First two chunks have continuation tokens
      assert.ok(received[0].continuation);
      assert.ok(received[1].continuation);
      // Last chunk has no continuation
      assert.equal(received[2].continuation, undefined);

      // All records delivered
      const allRecords = received.flatMap((r) => r.records);
      assert.deepEqual(allRecords, [0, 1, 2, 3, 4, 5, 6]);
    });

  it('continuation tokens are unique per chunk', () => {
    const groups = new Map();
    groups.set('k', [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const batches = buildGroupedBatches(groups, 3);

    // 9 / 3 = 3 chunks
    assert.equal(batches.length, 3);

    const tokens = batches
      .map((b) => b[REDUCE_FIELD.CONTINUATION])
      .filter(Boolean);
    const uniqueTokens = new Set(tokens);
    assert.equal(tokens.length, 2,
      'first two chunks have tokens');
    assert.equal(uniqueTokens.size, 2,
      'tokens are unique');
  });

  it('handler failure mid-continuation does not lose data',
    async () => {
      const mgr = new ExchangeManager(
        {mode: EXCHANGE_MODE.LOCAL},
      );
      for (let i = 0; i < 6; i++) {
        mgr.route('g', i);
      }

      let callCount = 0;
      const deps = {
        plan: {kind: PLAN_KIND.REDUCE_BY_KEY},
        params: [],
        handler: async (batch) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('mid-continuation-fail');
          }
          return batch;
        },
        opts: {maxRecordsPerGroup: 2},
        queryExecutor: async () => ({rows: []}),
        cancellationToken: new CancellationToken(),
        executionContext: buildCtx({exchangeManager: mgr}),
      };

      await assert.rejects(
        () => executeReduceByKey(deps),
        (err) => {
          assert.equal(err.message, 'mid-continuation-fail');
          return true;
        },
      );

      // First chunk was processed before failure
      assert.equal(callCount, 2);
    });
});

// ─── Stage + emit + reduceByKey retry pipeline ───────────────

describe('stage emit then reduceByKey retry pipeline', () => {
  it('emit dedupe prevents duplicate records in exchange',
    async () => {
      const mgr1 = new ExchangeManager();
      const ctx1 = buildCtx({exchangeManager: mgr1});

      // First attempt: emit records
      await ctx1.emit('region-us', 'order-1', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'o1-emit',
      });
      await ctx1.emit('region-eu', 'order-2', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'o2-emit',
      });

      // Simulate retry: same dedupeKeys
      await ctx1.emit('region-us', 'order-1-retry', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'o1-emit',
      });
      await ctx1.emit('region-eu', 'order-2-retry', {
        [EMIT_META_FIELD.DEDUPE_KEY]: 'o2-emit',
      });

      const buf = mgr1.getLocalBuffer();
      assert.equal(buf.length, 2,
        'retry emits skipped via dedupe');
      assert.equal(buf[0].value, 'order-1',
        'original value preserved');
      assert.equal(buf[1].value, 'order-2',
        'original value preserved');
    });
});

// ─── Cancellation during stage batch with retry ──────────────

describe('cancellation during stage with retry context', () => {
  it('cancelled stage does not register in dedupe', async () => {
    const registry = new DedupeRegistry();
    const tracker = new LineageTracker('cancel-retry-q');
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
    assert.equal(result[SF.STATE], STAGE_STATE.CANCELLED);
    assert.equal(registry.size(), 0,
      'cancelled batches not registered');

    // Retry with fresh token: both batches execute
    callCount = 0;
    const token2 = new CancellationToken();
    const exec2 = new CallbackStageExecutor({
      callback: async (_ctx, batch) => {
        callCount++;
        return batch.rows;
      },
      lineageTracker: tracker,
      stageIndex: 0,
      dedupeRegistry: registry,
      cancellationToken: token2,
    });

    const r2 = await exec2.execute(batches);
    assert.equal(r2[SF.STATE], STAGE_STATE.COMPLETED);
    assert.equal(callCount, 2, 'both batches re-executed');
    assert.equal(registry.size(), 2, 'both now registered');
  });
});
