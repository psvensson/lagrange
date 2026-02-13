/**
 * Tests for failure/retry/idempotency integration across
 * stage, emit, and out pipelines.
 *
 * Covers:
 * - Emit dedupe: same dedupeKey → second silently skipped
 * - Emit dedupe: different dedupeKeys → both routed
 * - Cancellation propagates through stage batch loop
 * - Wall-time check at stage batch boundaries
 * - Cancellation propagates through reduceByKey group loop
 *
 * Requirements: 9.5, 10.1, 10.2, 10.3, 10.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionContext} from '../../src/query/execution-context.js';
import {BudgetEnforcer} from '../../src/query/budget-enforcer.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';
import {DedupeRegistry} from '../../src/query/dedupe-registry.js';
import {ExchangeManager} from '../../src/query/exchange-manager.js';
import {executeStage} from '../../src/query/call-stage.js';
import {executeReduceByKey} from '../../src/query/call-plan.js';
import {
  EMIT_META_FIELD,
  EXCHANGE_MODE,
  RETRY_SCOPE,
} from '../../src/query/runtime-constants.js';
import {QB_FIELD} from '../../src/wasm-service/query-budget-constants.js';
import {
  GUARDRAIL_ERROR_MSG,
} from '../../src/query/guardrail-constants.js';
import {BudgetLimitError} from '../../src/query/budget-limit-error.js';

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
    new LineageTracker('test-query');
  const dedupeRegistry = overrides.dedupeRegistry ??
    new DedupeRegistry();
  const exchangeManager = overrides.exchangeManager ??
    new ExchangeManager();
  return new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: 'readCommitted'},
    budgetEnforcer,
    cancellationToken: token,
    lineageTracker,
    queryExecutor: overrides.queryExecutor ?? null,
    dedupeRegistry,
    exchangeManager,
  });
}

describe('RETRY_SCOPE constant', () => {
  it('should expose stage and batch scopes', () => {
    assert.equal(RETRY_SCOPE.STAGE, 'stage');
    assert.equal(RETRY_SCOPE.BATCH, 'batch');
  });
});

describe('emit dedupe — same dedupeKey silently skipped', () => {
  it('should skip second emit with same explicit dedupeKey',
    async () => {
      const exchangeManager = new ExchangeManager();
      const ctx = buildCtx({exchangeManager});

      const meta1 = {[EMIT_META_FIELD.DEDUPE_KEY]: 'dup-1'};
      const meta2 = {[EMIT_META_FIELD.DEDUPE_KEY]: 'dup-1'};

      await ctx.emit('k1', 'v1', meta1);
      await ctx.emit('k1', 'v2', meta2);

      const buf = exchangeManager.getLocalBuffer();
      assert.equal(buf.length, 1,
        'second emit with same dedupeKey is skipped');
      assert.equal(buf[0].value, 'v1');
    });
});

describe('emit dedupe — different dedupeKeys both routed',
  () => {
    it('should route both emits with different dedupeKeys',
      async () => {
        const exchangeManager = new ExchangeManager();
        const ctx = buildCtx({exchangeManager});

        const meta1 = {
          [EMIT_META_FIELD.DEDUPE_KEY]: 'key-a',
        };
        const meta2 = {
          [EMIT_META_FIELD.DEDUPE_KEY]: 'key-b',
        };

        await ctx.emit('k1', 'v1', meta1);
        await ctx.emit('k2', 'v2', meta2);

        const buf = exchangeManager.getLocalBuffer();
        assert.equal(buf.length, 2,
          'both emits with different dedupeKeys routed');
      });
  });

describe('cancellation propagates through stage batch loop',
  () => {
    it('should throw on cancellation between batches',
      async () => {
        const token = new CancellationToken();
        const ctx = buildCtx({cancellationToken: token});

        let batchCount = 0;
        const handler = async (batch, _stageCtx) => {
          batchCount++;
          if (batchCount === 1) {
            token.cancel('test-cancel');
          }
          return batch;
        };

        const queryExecutor = async () => ({
          rows: [{a: 1}, {a: 2}, {a: 3}],
        });

        await assert.rejects(
          () => executeStage({
            query: 'SELECT 1',
            params: [],
            handler,
            opts: {batchSize: 1},
            queryExecutor,
            cancellationToken: token,
            executionContext: ctx,
          }),
          (err) => {
            assert.equal(err.message, 'test-cancel');
            return true;
          },
        );

        assert.equal(batchCount, 1,
          'only first batch executed before cancel');
      });
  });

describe('wall-time check at stage batch boundaries', () => {
  it('should throw BudgetLimitError when wall time exceeded',
    async () => {
      // Use a wall time budget of 1ms — already expired by
      // the time the batch loop runs.
      const budgetEnforcer = new BudgetEnforcer({
        [QB_FIELD.WALL_TIME_LIMIT_MS]: 1,
      });
      // Force wallStart into the past so elapsed > 1ms.
      budgetEnforcer._usage.wallStart = Date.now() - 100;

      const token = new CancellationToken();
      const ctx = buildCtx({
        budgetEnforcer,
        cancellationToken: token,
      });

      const handler = async (batch) => batch;
      const queryExecutor = async () => ({
        rows: [{a: 1}],
      });

      await assert.rejects(
        () => executeStage({
          query: 'SELECT 1',
          params: [],
          handler,
          opts: {batchSize: 1},
          queryExecutor,
          cancellationToken: token,
          executionContext: ctx,
        }),
        (err) => {
          assert.ok(err instanceof BudgetLimitError,
            'should be BudgetLimitError');
          assert.equal(err.message,
            GUARDRAIL_ERROR_MSG.WALL_TIME_EXCEEDED);
          return true;
        },
      );
    });
});

describe('cancellation propagates through reduceByKey', () => {
  it('should throw on cancellation between groups',
    async () => {
      const token = new CancellationToken();
      const exchangeManager = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      // Pre-populate exchange buffer with multiple groups.
      exchangeManager.route('g1', 'v1');
      exchangeManager.route('g2', 'v2');
      exchangeManager.route('g3', 'v3');

      const ctx = buildCtx({
        cancellationToken: token,
        exchangeManager,
      });

      let groupCount = 0;
      const handler = async (group, _stageCtx) => {
        groupCount++;
        if (groupCount === 1) {
          token.cancel('reduce-cancel');
        }
        return group;
      };

      await assert.rejects(
        () => executeReduceByKey({
          plan: {kind: 'reduceByKey'},
          params: [],
          handler,
          opts: {maxGroupsPerBatch: 1},
          queryExecutor: async () => ({rows: []}),
          cancellationToken: token,
          executionContext: ctx,
        }),
        (err) => {
          assert.equal(err.message, 'reduce-cancel');
          return true;
        },
      );

      assert.equal(groupCount, 1,
        'only first group processed before cancel');
    });

  it('should throw BudgetLimitError on wall-time in reduce',
    async () => {
      const budgetEnforcer = new BudgetEnforcer({
        [QB_FIELD.WALL_TIME_LIMIT_MS]: 1,
      });
      budgetEnforcer._usage.wallStart = Date.now() - 100;

      const token = new CancellationToken();
      const exchangeManager = new ExchangeManager({
        mode: EXCHANGE_MODE.LOCAL,
      });
      exchangeManager.route('g1', 'v1');

      const ctx = buildCtx({
        budgetEnforcer,
        cancellationToken: token,
        exchangeManager,
      });

      const handler = async (group) => group;

      await assert.rejects(
        () => executeReduceByKey({
          plan: {kind: 'reduceByKey'},
          params: [],
          handler,
          opts: {},
          queryExecutor: async () => ({rows: []}),
          cancellationToken: token,
          executionContext: ctx,
        }),
        (err) => {
          assert.ok(err instanceof BudgetLimitError,
            'should be BudgetLimitError');
          assert.equal(err.message,
            GUARDRAIL_ERROR_MSG.WALL_TIME_EXCEEDED);
          return true;
        },
      );
    });
});
