/**
 * Unit tests for Stage_Mode execution via call-stage.js
 * and ctx.call with a handler.
 *
 * Requirements: 5.2, 5.5
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  executeStage,
  buildStageContext,
  batchRows,
} from '../../src/query/call-stage.js';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {
  BudgetEnforcer,
} from '../../src/query/budget-enforcer.js';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  ExecutionContext,
} from '../../src/query/execution-context.js';
import {
  STAGE_OPTION,
  EXCHANGE_MODE,
  DEFAULT_EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
} from '../../src/query/runtime-constants.js';

/**
 * Helper: create a minimal ExecutionContext for testing.
 */
function createTestContext(opts = {}) {
  const token = opts.cancellationToken ??
    new CancellationToken();
  const executor = opts.queryExecutor ??
    (async () => ({rows: []}));
  return new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: 'readCommitted'},
    budgetEnforcer: new BudgetEnforcer(),
    cancellationToken: token,
    lineageTracker: new LineageTracker('test-q'),
    queryExecutor: executor,
  });
}

describe('batchRows', () => {
  it('should return empty array for empty input', () => {
    assert.deepEqual(batchRows([], 10), []);
  });

  it('should return single batch when rows < batchSize', () => {
    const rows = [{a: 1}, {a: 2}];
    const result = batchRows(rows, 10);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], rows);
  });

  it('should split rows into correct batch count', () => {
    const rows = [{a: 1}, {a: 2}, {a: 3}, {a: 4}, {a: 5}];
    const result = batchRows(rows, 2);
    assert.equal(result.length, 3);
    assert.deepEqual(result[0], [{a: 1}, {a: 2}]);
    assert.deepEqual(result[1], [{a: 3}, {a: 4}]);
    assert.deepEqual(result[2], [{a: 5}]);
  });

  it('should handle batchSize equal to row count', () => {
    const rows = [{a: 1}, {a: 2}];
    const result = batchRows(rows, 2);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], rows);
  });
});

describe('buildStageContext', () => {
  it('should expose frozen context with all primitives', () => {
    const ctx = createTestContext();
    const stageCtx = buildStageContext(ctx);
    assert.equal(typeof stageCtx.emit, 'function');
    assert.equal(typeof stageCtx.out, 'function');
    assert.equal(typeof stageCtx.lookup, 'function');
    assert.equal(typeof stageCtx.broadcast, 'function');
    assert.equal(typeof stageCtx.useBroadcast, 'function');
    assert.equal(typeof stageCtx.call, 'function');
    assert.equal(typeof stageCtx.isCancelled, 'function');
    assert.equal(typeof stageCtx.throwIfCancelled, 'function');
    assert.ok(Object.isFrozen(stageCtx));
  });

  it('should delegate isCancelled to execution context', () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});
    const stageCtx = buildStageContext(ctx);
    assert.equal(stageCtx.isCancelled(), false);
    token.cancel('test');
    assert.equal(stageCtx.isCancelled(), true);
  });
});

describe('executeStage', () => {
  it('should invoke handler once per batch', async () => {
    const rows = [{id: 1}, {id: 2}, {id: 3}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    const batches = [];
    const handler = async (batch) => {
      batches.push(batch);
      return batch.length;
    };

    const results = await executeStage({
      query: 'SELECT 1',
      params: [],
      handler,
      opts: {[STAGE_OPTION.BATCH_SIZE]: 2},
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(batches.length, 2);
    assert.deepEqual(batches[0], [{id: 1}, {id: 2}]);
    assert.deepEqual(batches[1], [{id: 3}]);
    assert.deepEqual(results, [2, 1]);
  });

  it('should use DEFAULT_BATCH_SIZE when not specified', async () => {
    const rows = Array.from(
      {length: 5}, (_, i) => ({id: i}),
    );
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    let batchCount = 0;
    const handler = async () => {
      batchCount++;
    };

    await executeStage({
      query: 'SELECT 1',
      params: [],
      handler,
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    // 5 rows with DEFAULT_BATCH_SIZE=1000 → 1 batch
    assert.equal(batchCount, 1);
  });

  it('should pass query and params to executor', async () => {
    let capturedQuery;
    let capturedParams;
    const executor = async (q, p) => {
      capturedQuery = q;
      capturedParams = p;
      return {rows: []};
    };
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await executeStage({
      query: 'SELECT * FROM t WHERE id = ?',
      params: [42],
      handler: async () => {},
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(capturedQuery, 'SELECT * FROM t WHERE id = ?');
    assert.deepEqual(capturedParams, [42]);
  });

  it('should handle empty result set', async () => {
    const executor = async () => ({rows: []});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    let called = false;
    const results = await executeStage({
      query: 'SELECT 1',
      params: [],
      handler: async () => {
        called = true;
      },
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(called, false);
    assert.deepEqual(results, []);
  });

  it('should handle undefined rows as empty', async () => {
    const executor = async () => ({});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    const results = await executeStage({
      query: 'q',
      params: [],
      handler: async () => 'x',
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.deepEqual(results, []);
  });

  it('should throw when cancelled before execution', async () => {
    const token = new CancellationToken();
    token.cancel('pre-cancel');
    const executor = async () => ({rows: [{id: 1}]});
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await assert.rejects(
      () => executeStage({
        query: 'q',
        params: [],
        handler: async () => {},
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message === 'pre-cancel',
    );
  });

  it('should throw when cancelled between batches', async () => {
    const rows = [{id: 1}, {id: 2}, {id: 3}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    let callCount = 0;
    const handler = async () => {
      callCount++;
      if (callCount === 1) {
        token.cancel('mid-cancel');
      }
    };

    await assert.rejects(
      () => executeStage({
        query: 'q',
        params: [],
        handler,
        opts: {[STAGE_OPTION.BATCH_SIZE]: 1},
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message === 'mid-cancel',
    );

    assert.equal(callCount, 1);
  });

  it('should provide stage context with primitives', async () => {
    const executor = async () => ({rows: [{id: 1}]});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    let receivedCtx;
    await executeStage({
      query: 'q',
      params: [],
      handler: async (_batch, stageCtx) => {
        receivedCtx = stageCtx;
      },
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(typeof receivedCtx.emit, 'function');
    assert.equal(typeof receivedCtx.out, 'function');
    assert.equal(typeof receivedCtx.lookup, 'function');
    assert.equal(typeof receivedCtx.broadcast, 'function');
    assert.equal(typeof receivedCtx.useBroadcast, 'function');
    assert.equal(typeof receivedCtx.call, 'function');
    assert.ok(Object.isFrozen(receivedCtx));
  });

  it('should propagate handler errors', async () => {
    const executor = async () => ({rows: [{id: 1}]});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await assert.rejects(
      () => executeStage({
        query: 'q',
        params: [],
        handler: async () => {
          throw new Error('handler-boom');
        },
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message === 'handler-boom',
    );
  });
});

describe('ctx.call Stage_Mode integration', () => {
  it('should execute stage when handler is 3rd arg', async () => {
    const rows = [{v: 1}, {v: 2}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    const collected = [];
    const results = await ctx.call(
      'SELECT 1', [],
      async (batch) => {
        collected.push(...batch);
        return batch.length;
      },
    );

    assert.deepEqual(collected, rows);
    assert.deepEqual(results, [2]);
  });

  it('should execute stage when handler is 2nd arg', async () => {
    const rows = [{v: 10}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    const results = await ctx.call(
      'SELECT 1',
      async (batch) => batch.length,
    );

    assert.deepEqual(results, [1]);
  });

  it('should pass opts when handler is 2nd arg', async () => {
    const rows = [{v: 1}, {v: 2}, {v: 3}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    let batchCount = 0;
    await ctx.call(
      'SELECT 1',
      async () => {
        batchCount++;
      },
      {[STAGE_OPTION.BATCH_SIZE]: 1},
    );

    assert.equal(batchCount, 3);
  });

  it('should respect batchSize in opts as 4th arg', async () => {
    const rows = [{v: 1}, {v: 2}, {v: 3}, {v: 4}];
    const executor = async () => ({rows});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    const batches = [];
    await ctx.call(
      'SELECT 1', [],
      async (batch) => {
        batches.push(batch);
      },
      {[STAGE_OPTION.BATCH_SIZE]: 3},
    );

    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 3);
    assert.equal(batches[1].length, 1);
  });
});


describe('property: Stage_Mode batch coverage', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any array of rows and any positive batchSize,
   * the handler receives every row exactly once across
   * all batches.
   */
  it('handler receives all rows exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({id: fc.integer()}), {
          maxLength: 30,
        }),
        fc.integer({min: 1, max: 20}),
        async (rows, batchSize) => {
          const executor = async () => ({rows});
          const token = new CancellationToken();
          const ctx = createTestContext({
            queryExecutor: executor,
            cancellationToken: token,
          });

          const collected = [];
          await executeStage({
            query: 'q',
            params: [],
            handler: async (batch) => {
              collected.push(...batch);
            },
            opts: {[STAGE_OPTION.BATCH_SIZE]: batchSize},
            queryExecutor: executor,
            cancellationToken: token,
            executionContext: ctx,
          });

          return collected.length === rows.length &&
            collected.every((r, i) => r.id === rows[i].id);
        },
      ),
      {numRuns: 10},
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any positive batchSize, no batch exceeds that size.
   */
  it('no batch exceeds batchSize', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({id: fc.integer()}), {
          minLength: 1, maxLength: 30,
        }),
        fc.integer({min: 1, max: 10}),
        async (rows, batchSize) => {
          const batches = batchRows(rows, batchSize);
          return batches.every((b) => b.length <= batchSize);
        },
      ),
      {numRuns: 10},
    );
  });
});


describe('exchangeBy stage option', () => {
  it('should accept "local" as valid exchangeBy', async () => {
    const executor = async () => ({rows: [{id: 1}]});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await executeStage({
      query: 'SELECT 1',
      params: [],
      handler: async () => {},
      opts: {[STAGE_OPTION.EXCHANGE_BY]: EXCHANGE_MODE.LOCAL},
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(
      ctx.getExchangeMode(), EXCHANGE_MODE.LOCAL,
    );
  });

  it('should accept "key" as valid exchangeBy', async () => {
    const executor = async () => ({rows: [{id: 1}]});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await executeStage({
      query: 'SELECT 1',
      params: [],
      handler: async () => {},
      opts: {[STAGE_OPTION.EXCHANGE_BY]: EXCHANGE_MODE.KEY},
      queryExecutor: executor,
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(ctx.getExchangeMode(), EXCHANGE_MODE.KEY);
  });

  it('should throw for invalid exchangeBy value', async () => {
    const executor = async () => ({rows: []});
    const token = new CancellationToken();
    const ctx = createTestContext({
      queryExecutor: executor,
      cancellationToken: token,
    });

    await assert.rejects(
      () => executeStage({
        query: 'SELECT 1',
        params: [],
        handler: async () => {},
        opts: {[STAGE_OPTION.EXCHANGE_BY]: 'invalid'},
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message ===
        EXCHANGE_ERROR_MSG.INVALID_EXCHANGE_MODE,
    );
  });

  it('should default to "local" when exchangeBy omitted',
    async () => {
      const executor = async () => ({rows: [{id: 1}]});
      const token = new CancellationToken();
      const ctx = createTestContext({
        queryExecutor: executor,
        cancellationToken: token,
      });

      await executeStage({
        query: 'SELECT 1',
        params: [],
        handler: async () => {},
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      });

      assert.equal(
        ctx.getExchangeMode(), DEFAULT_EXCHANGE_MODE,
      );
      assert.equal(
        ctx.getExchangeMode(), EXCHANGE_MODE.LOCAL,
      );
    });

  it('should pass exchange mode to execution context',
    async () => {
      const executor = async () => ({rows: [{id: 1}]});
      const token = new CancellationToken();
      const ctx = createTestContext({
        queryExecutor: executor,
        cancellationToken: token,
      });

      let capturedMode;
      await executeStage({
        query: 'SELECT 1',
        params: [],
        handler: async () => {
          capturedMode = ctx.getExchangeMode();
        },
        opts: {[STAGE_OPTION.EXCHANGE_BY]: EXCHANGE_MODE.KEY},
        queryExecutor: executor,
        cancellationToken: token,
        executionContext: ctx,
      });

      assert.equal(capturedMode, EXCHANGE_MODE.KEY);
    });
});
