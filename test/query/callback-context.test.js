/**
 * Unit tests for callback-context.js — bounded primitive
 * surface for partition callback execution.
 *
 * Validates: Requirements 4.5, 8.3, 14.4
 *
 * Verifies that the callback context exposes the same
 * bounded primitives as the stage runtime context and
 * rejects unbounded nested calls.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {buildCallbackContext} from
  '../../src/query/callback/callback-context.js';
import {ExecutionContext} from
  '../../src/query/execution-context.js';
import {BudgetEnforcer} from
  '../../src/query/budget-enforcer.js';
import {CancellationToken} from
  '../../src/query/cancellation-token.js';
import {LineageTracker} from
  '../../src/query/lineage-tracker.js';
import {PlanDiagnostics} from
  '../../src/query/plan-diagnostics.js';
import {
  NESTED_CALL_CLASSIFICATION,
  NESTED_CALL_ERROR_MSG,
} from '../../src/query/runtime-constants.js';

/**
 * Create a minimal ExecutionContext for testing.
 */
function createTestContext(opts = {}) {
  const token = opts.cancellationToken ??
    new CancellationToken();
  const budgets = opts.budgets ?? {};
  const executor = opts.queryExecutor ??
    (async () => ({rows: []}));
  return new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: 'readCommitted'},
    budgetEnforcer: new BudgetEnforcer(budgets),
    cancellationToken: token,
    lineageTracker: new LineageTracker('cb-test'),
    queryExecutor: executor,
  });
}

describe('buildCallbackContext', () => {
  it('should return a frozen object', () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);
    assert.ok(Object.isFrozen(cbCtx));
  });

  it('should expose all bounded primitives', () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);
    assert.equal(typeof cbCtx.emit, 'function');
    assert.equal(typeof cbCtx.out, 'function');
    assert.equal(typeof cbCtx.lookup, 'function');
    assert.equal(typeof cbCtx.broadcast, 'function');
    assert.equal(typeof cbCtx.useBroadcast, 'function');
    assert.equal(typeof cbCtx.call, 'function');
    assert.equal(typeof cbCtx.isCancelled, 'function');
    assert.equal(typeof cbCtx.throwIfCancelled, 'function');
  });

  it('should NOT expose ad-hoc RPC surfaces', () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);
    const keys = Object.keys(cbCtx);
    const allowed = new Set([
      'emit', 'out', 'lookup', 'broadcast',
      'useBroadcast', 'call',
      'isCancelled', 'throwIfCancelled',
    ]);
    for (const key of keys) {
      assert.ok(allowed.has(key),
        `unexpected property: ${key}`);
    }
    assert.equal(keys.length, allowed.size);
  });
});

describe('callback context nested-call guardrails', () => {
  it('should reject unbounded nested calls (full scan)',
    async () => {
      const ctx = createTestContext();
      const cbCtx = buildCallbackContext(ctx);

      await assert.rejects(
        () => cbCtx.call('SELECT * FROM users'),
        (err) => {
          assert.equal(err.message,
            NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
          return true;
        },
      );
    });

  it('should reject nested calls with JOIN', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    await assert.rejects(
      () => cbCtx.call(
        'SELECT * FROM a JOIN b ON a.id = b.id',
      ),
      (err) => {
        assert.equal(err.message,
          NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
        return true;
      },
    );
  });

  it('should reject nested calls with subquery', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    await assert.rejects(
      () => cbCtx.call(
        'SELECT * FROM t WHERE id IN (SELECT id FROM s)',
      ),
      (err) => {
        assert.equal(err.message,
          NESTED_CALL_ERROR_MSG.UNBOUNDED_REJECTED);
        return true;
      },
    );
  });

  it('should allow bounded pk point lookup', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    // pk lookup is bounded — should not throw from
    // classifier. Will throw from stub queryExecutor
    // or succeed with empty rows.
    const result = await cbCtx.call(
      'SELECT * FROM t WHERE id = ?', [1],
    );
    // Iterator mode returns an async iterator
    assert.ok(result !== undefined);
  });

  it('should allow bounded IN clause lookup', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    const result = await cbCtx.call(
      'SELECT * FROM t WHERE id IN (?, ?)', [1, 2],
    );
    assert.ok(result !== undefined);
  });

  it('should allow bounded WHERE + LIMIT query', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    const result = await cbCtx.call(
      'SELECT * FROM t WHERE x > ? LIMIT 10', [5],
    );
    assert.ok(result !== undefined);
  });

  it('should record classification in diagnostics',
    async () => {
      const ctx = createTestContext();
      const diag = new PlanDiagnostics({queryId: 'diag-1'});
      const cbCtx = buildCallbackContext(ctx, diag);

      // Bounded call — should record classification
      await cbCtx.call(
        'SELECT * FROM t WHERE id = ?', [1],
      );

      const decisions = diag.getDecisions();
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].classification,
        NESTED_CALL_CLASSIFICATION.BOUNDED);
    });

  it('should record unbounded classification before reject',
    async () => {
      const ctx = createTestContext();
      const diag = new PlanDiagnostics({queryId: 'diag-2'});
      const cbCtx = buildCallbackContext(ctx, diag);

      await assert.rejects(
        () => cbCtx.call('SELECT * FROM users'),
      );

      const decisions = diag.getDecisions();
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].classification,
        NESTED_CALL_CLASSIFICATION.UNBOUNDED);
    });
});

describe('callback context primitive delegation', () => {
  it('should delegate isCancelled to execution context',
    () => {
      const token = new CancellationToken();
      const ctx = createTestContext({cancellationToken: token});
      const cbCtx = buildCallbackContext(ctx);

      assert.equal(cbCtx.isCancelled(), false);
      token.cancel('test-cancel');
      assert.equal(cbCtx.isCancelled(), true);
    });

  it('should delegate throwIfCancelled to execution context',
    () => {
      const token = new CancellationToken();
      const ctx = createTestContext({cancellationToken: token});
      const cbCtx = buildCallbackContext(ctx);

      // Should not throw when not cancelled
      cbCtx.throwIfCancelled();

      token.cancel('abort');
      assert.throws(
        () => cbCtx.throwIfCancelled(),
        (err) => err.message === 'abort',
      );
    });

  it('should delegate out to execution context', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    await cbCtx.out({result: 42});
    const results = ctx.getResults();
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {result: 42});
  });

  it('should delegate emit to execution context', async () => {
    const ctx = createTestContext();
    const cbCtx = buildCallbackContext(ctx);

    // emit delegates to execCtx.emit which routes through
    // exchange manager. Should not throw.
    await cbCtx.emit('key1', {data: 'val'});
    // Verify exchange manager received the record
    const mgr = ctx.getExchangeManager();
    const buffer = mgr.getLocalBuffer();
    assert.ok(buffer.length > 0);
  });
});

describe('callback context budget enforcement', () => {
  it('should track nested call count via budget enforcer',
    async () => {
      const ctx = createTestContext();
      const cbCtx = buildCallbackContext(ctx);
      const enforcer = ctx.getBudgetEnforcer();

      // Make a bounded nested call
      await cbCtx.call(
        'SELECT * FROM t WHERE id = ?', [1],
      );

      const usage = enforcer.getUsage();
      assert.equal(usage.nestedCalls, 1);
    });

  it('should increment and decrement inflight on nested call',
    async () => {
      const ctx = createTestContext();
      const cbCtx = buildCallbackContext(ctx);
      const enforcer = ctx.getBudgetEnforcer();

      // After call completes, inflight should be back to 0
      await cbCtx.call(
        'SELECT * FROM t WHERE id = ?', [1],
      );

      const usage = enforcer.getUsage();
      assert.equal(usage.inflight, 0);
    });
});
