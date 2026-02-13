/**
 * Unit tests for Plan_Mode execution via call-plan.js
 * and ctx.call with plan objects.
 *
 * Requirements: 5.3, 5.4
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  executePlan,
  validatePlan,
  executeReduceByKey,
  executeUseBroadcast,
} from '../../src/query/call-plan.js';
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
  PLAN_KIND,
  PLAN_ERROR_MSG as ERR,
} from '../../src/query/runtime-constants.js';
import {
  ExchangeManager,
} from '../../src/query/exchange-manager.js';

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
    exchangeManager: opts.exchangeManager,
  });
}

describe('validatePlan', () => {
  it('should accept reduceByKey kind', () => {
    assert.doesNotThrow(() => {
      validatePlan({kind: PLAN_KIND.REDUCE_BY_KEY});
    });
  });

  it('should accept useBroadcast kind', () => {
    assert.doesNotThrow(() => {
      validatePlan({kind: PLAN_KIND.USE_BROADCAST});
    });
  });

  it('should reject plan without kind field', () => {
    assert.throws(
      () => validatePlan({}),
      (err) => err.message === ERR.PLAN_MISSING_KIND,
    );
  });

  it('should reject plan with null kind', () => {
    assert.throws(
      () => validatePlan({kind: null}),
      (err) => err.message === ERR.PLAN_MISSING_KIND,
    );
  });

  it('should reject unsupported plan kind', () => {
    assert.throws(
      () => validatePlan({kind: 'unknownKind'}),
      (err) => err.message ===
        ERR.PLAN_UNSUPPORTED_KIND + 'unknownKind',
    );
  });
});

describe('executeReduceByKey', () => {
  it('should require a handler function', async () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});

    await assert.rejects(
      () => executeReduceByKey({
        plan: {kind: PLAN_KIND.REDUCE_BY_KEY},
        params: [],
        handler: undefined,
        queryExecutor: async () => ({rows: []}),
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message === ERR.PLAN_REDUCE_HANDLER_REQUIRED,
    );
  });

  it('should read from exchange buffers', async () => {
    const mgr = new ExchangeManager();
    mgr.route('a', {k: 'a', v: 1});
    mgr.route('b', {k: 'b', v: 2});
    const token = new CancellationToken();
    const ctx = createTestContext({
      cancellationToken: token,
      exchangeManager: mgr,
    });

    const collected = [];
    const results = await executeReduceByKey({
      plan: {
        kind: PLAN_KIND.REDUCE_BY_KEY,
        stream: 'SELECT * FROM exchange',
      },
      params: [],
      handler: async (batch) => {
        collected.push(batch);
        return batch.records.length;
      },
      queryExecutor: async () => ({rows: []}),
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.equal(collected.length, 2);
    assert.deepEqual(results, [1, 1]);
  });

  it('should return empty results for empty exchange', async () => {
    const mgr = new ExchangeManager();
    const token = new CancellationToken();
    const ctx = createTestContext({
      cancellationToken: token,
      exchangeManager: mgr,
    });

    const results = await executeReduceByKey({
      plan: {kind: PLAN_KIND.REDUCE_BY_KEY},
      params: [],
      handler: async () => {
        throw new Error('should not be called');
      },
      queryExecutor: async () => ({rows: []}),
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.deepEqual(results, []);
  });
});

describe('executeUseBroadcast', () => {
  it('should return ref and null data for valid ref', async () => {
    const result = await executeUseBroadcast({
      plan: {
        kind: PLAN_KIND.USE_BROADCAST,
        ref: 'my-broadcast',
      },
    });

    assert.deepEqual(result, {ref: 'my-broadcast', data: null});
  });

  it('should reject plan without ref field', async () => {
    await assert.rejects(
      () => executeUseBroadcast({
        plan: {kind: PLAN_KIND.USE_BROADCAST},
      }),
      (err) => err.message === ERR.PLAN_BROADCAST_REF_REQUIRED,
    );
  });

  it('should reject plan with null ref', async () => {
    await assert.rejects(
      () => executeUseBroadcast({
        plan: {kind: PLAN_KIND.USE_BROADCAST, ref: null},
      }),
      (err) => err.message === ERR.PLAN_BROADCAST_REF_REQUIRED,
    );
  });
});

describe('executePlan dispatch', () => {
  it('should dispatch reduceByKey to handler', async () => {
    const mgr = new ExchangeManager();
    mgr.route('k', {id: 1});
    const token = new CancellationToken();
    const ctx = createTestContext({
      cancellationToken: token,
      exchangeManager: mgr,
    });

    const results = await executePlan({
      plan: {kind: PLAN_KIND.REDUCE_BY_KEY, stream: 'q'},
      params: [],
      handler: async (batch) => batch.records.length,
      queryExecutor: async () => ({rows: []}),
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.deepEqual(results, [1]);
  });

  it('should dispatch useBroadcast to ref lookup', async () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});

    const result = await executePlan({
      plan: {kind: PLAN_KIND.USE_BROADCAST, ref: 'bcast-1'},
      params: [],
      queryExecutor: async () => ({rows: []}),
      cancellationToken: token,
      executionContext: ctx,
    });

    assert.deepEqual(result, {ref: 'bcast-1', data: null});
  });

  it('should reject unsupported kind', async () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});

    await assert.rejects(
      () => executePlan({
        plan: {kind: 'badKind'},
        params: [],
        queryExecutor: async () => ({rows: []}),
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message ===
        ERR.PLAN_UNSUPPORTED_KIND + 'badKind',
    );
  });

  it('should reject plan without kind', async () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});

    await assert.rejects(
      () => executePlan({
        plan: {},
        params: [],
        queryExecutor: async () => ({rows: []}),
        cancellationToken: token,
        executionContext: ctx,
      }),
      (err) => err.message === ERR.PLAN_MISSING_KIND,
    );
  });
});


describe('ctx.call Plan_Mode integration', () => {
  it('should dispatch reduceByKey plan via ctx.call', async () => {
    const mgr = new ExchangeManager();
    mgr.route('x', {k: 'x', v: 1});
    const token = new CancellationToken();
    const ctx = createTestContext({
      cancellationToken: token,
      exchangeManager: mgr,
    });

    const results = await ctx.call(
      {kind: PLAN_KIND.REDUCE_BY_KEY, stream: 'q'},
      [],
      async (batch) => batch.records.length,
    );

    assert.deepEqual(results, [1]);
  });

  it('should dispatch useBroadcast plan via ctx.call', async () => {
    const token = new CancellationToken();
    const ctx = createTestContext({cancellationToken: token});

    const result = await ctx.call(
      {kind: PLAN_KIND.USE_BROADCAST, ref: 'ref-1'},
    );

    assert.deepEqual(result, {ref: 'ref-1', data: null});
  });

  it('should handle handler as 2nd arg for plan', async () => {
    const mgr = new ExchangeManager();
    mgr.route('k', {v: 1});
    const token = new CancellationToken();
    const ctx = createTestContext({
      cancellationToken: token,
      exchangeManager: mgr,
    });

    const results = await ctx.call(
      {kind: PLAN_KIND.REDUCE_BY_KEY, stream: 'q'},
      async (batch) => batch.records.length,
    );

    assert.deepEqual(results, [1]);
  });

  it('should reject plan object without kind via ctx.call', async () => {
    const ctx = createTestContext();

    assert.throws(
      () => ctx.call({noKind: true}),
      (err) => err.message === ERR.PLAN_MISSING_KIND,
    );
  });

  it('should reject null/undefined query', () => {
    const ctx = createTestContext();

    assert.throws(
      () => ctx.call(null),
    );
    assert.throws(
      () => ctx.call(undefined),
    );
  });
});

describe('property: Plan_Mode dispatch', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any plan object with a supported kind, executePlan
   * does not throw a validation error.
   */
  it('supported kinds are accepted without validation error',
    async () => {
      const kinds = [
        PLAN_KIND.REDUCE_BY_KEY,
        PLAN_KIND.USE_BROADCAST,
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...kinds),
          fc.string({minLength: 1, maxLength: 10}),
          async (kind, ref) => {
            const token = new CancellationToken();
            const ctx = createTestContext({
              cancellationToken: token,
            });

            const plan =
              kind === PLAN_KIND.REDUCE_BY_KEY ?
                {kind, stream: 'q'} :
                {kind, ref};

            const handler =
              kind === PLAN_KIND.REDUCE_BY_KEY ?
                async () => {} :
                undefined;

            // Should not throw validation errors
            try {
              await executePlan({
                plan,
                params: [],
                handler,
                queryExecutor: async () => ({rows: []}),
                cancellationToken: token,
                executionContext: ctx,
              });
              return true;
            } catch (e) {
              // Only validation errors are failures
              return !e.message.startsWith(
                ERR.PLAN_UNSUPPORTED_KIND,
              ) && e.message !== ERR.PLAN_MISSING_KIND;
            }
          },
        ),
        {numRuns: 10},
      );
    });

  /**
   * **Validates: Requirements 5.4**
   *
   * For any string that is not a supported plan kind,
   * executePlan rejects with the unsupported kind error.
   */
  it('unsupported kinds are always rejected', async () => {
    const supported = new Set([
      PLAN_KIND.REDUCE_BY_KEY,
      PLAN_KIND.USE_BROADCAST,
    ]);

    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => !supported.has(s),
        ),
        async (kind) => {
          const token = new CancellationToken();
          const ctx = createTestContext({
            cancellationToken: token,
          });

          try {
            await executePlan({
              plan: {kind},
              params: [],
              queryExecutor: async () => ({rows: []}),
              cancellationToken: token,
              executionContext: ctx,
            });
            return false;
          } catch (e) {
            return e.message ===
              ERR.PLAN_UNSUPPORTED_KIND + kind;
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
