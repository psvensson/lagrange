/**
 * Tests for unbounded nested ctx.call rejection in stage
 * handlers.
 *
 * Requirements: 8.3, 8.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {executeStage} from '../../src/query/call-stage.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {ExecutionContext} from '../../src/query/execution-context.js';
import {BudgetEnforcer} from '../../src/query/budget-enforcer.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';
import {
  NESTED_CALL_ERROR_MSG as ERR,
  DEFAULT_SNAPSHOT_MODE,
  PLAN_KIND,
} from '../../src/query/runtime-constants.js';

/**
 * Build an ExecutionContext with a mock queryExecutor.
 *
 * @param {Function} queryExecutor - Mock query executor.
 * @return {Object} deps for executeStage.
 */
function buildDeps(queryExecutor) {
  const cancellationToken = new CancellationToken();
  const budgetEnforcer = new BudgetEnforcer();
  const lineageTracker = new LineageTracker('test-query-1');
  const executionContext = new ExecutionContext({
    session: 'test-session',
    snapshot: {mode: DEFAULT_SNAPSHOT_MODE},
    budgetEnforcer,
    cancellationToken,
    lineageTracker,
    queryExecutor,
  });
  return {cancellationToken, executionContext, queryExecutor};
}

// ─── Bounded query in stage handler → succeeds ──────────────

test('bounded PK lookup in stage handler succeeds', async (t) => {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const deps = buildDeps(mockExecutor);
  let nestedResult = null;

  await executeStage({
    query: 'SELECT * FROM outer_table WHERE id = ?',
    params: [1],
    handler: async (_batch, stageCtx) => {
      nestedResult = stageCtx.call(
        'SELECT * FROM users WHERE id = ?', [1],
      );
    },
    opts: {},
    queryExecutor: deps.queryExecutor,
    cancellationToken: deps.cancellationToken,
    executionContext: deps.executionContext,
  });

  t.ok(nestedResult !== null, 'nested call returned a result');
  t.end();
});

test('bounded IN clause in stage handler succeeds', async (t) => {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const deps = buildDeps(mockExecutor);
  let called = false;

  await executeStage({
    query: 'SELECT * FROM outer_table WHERE id = ?',
    params: [1],
    handler: async (_batch, stageCtx) => {
      stageCtx.call(
        'SELECT * FROM users WHERE id IN (?, ?)', [1, 2],
      );
      called = true;
    },
    opts: {},
    queryExecutor: deps.queryExecutor,
    cancellationToken: deps.cancellationToken,
    executionContext: deps.executionContext,
  });

  t.ok(called, 'handler completed without error');
  t.end();
});

// ─── Unbounded query in stage handler → throws ──────────────

test('unbounded full scan in stage handler throws', async (t) => {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const deps = buildDeps(mockExecutor);

  await t.rejects(
    executeStage({
      query: 'SELECT * FROM outer_table WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        await stageCtx.call('SELECT * FROM users');
      },
      opts: {},
      queryExecutor: deps.queryExecutor,
      cancellationToken: deps.cancellationToken,
      executionContext: deps.executionContext,
    }),
    {message: ERR.UNBOUNDED_REJECTED},
  );
  t.end();
});

test('unbounded range scan in stage handler throws', async (t) => {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const deps = buildDeps(mockExecutor);

  await t.rejects(
    executeStage({
      query: 'SELECT * FROM outer_table WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        await stageCtx.call(
          'SELECT * FROM orders WHERE amount > ?', [100],
        );
      },
      opts: {},
      queryExecutor: deps.queryExecutor,
      cancellationToken: deps.cancellationToken,
      executionContext: deps.executionContext,
    }),
    {message: ERR.UNBOUNDED_REJECTED},
  );
  t.end();
});

test('unbounded JOIN in stage handler throws', async (t) => {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const deps = buildDeps(mockExecutor);

  await t.rejects(
    executeStage({
      query: 'SELECT * FROM outer_table WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        await stageCtx.call(
          'SELECT * FROM a JOIN b ON a.id = b.aid',
        );
      },
      opts: {},
      queryExecutor: deps.queryExecutor,
      cancellationToken: deps.cancellationToken,
      executionContext: deps.executionContext,
    }),
    {message: ERR.UNBOUNDED_REJECTED},
  );
  t.end();
});

// ─── Error message contains emit + reduceByKey guidance ─────

test('rejection error mentions emit and reduceByKey', (t) => {
  t.ok(
    ERR.UNBOUNDED_REJECTED.includes('ctx.emit'),
    'error mentions ctx.emit',
  );
  t.ok(
    ERR.UNBOUNDED_REJECTED.includes('reduceByKey'),
    'error mentions reduceByKey',
  );
  t.ok(
    ERR.UNBOUNDED_REJECTED.includes('primary-key'),
    'error mentions primary-key lookup',
  );
  t.ok(
    ERR.UNBOUNDED_REJECTED.includes('IN clause'),
    'error mentions IN clause',
  );
  t.ok(
    ERR.UNBOUNDED_REJECTED.includes('LIMIT'),
    'error mentions LIMIT query',
  );
  t.end();
});

// ─── Plan objects bypass classification ──────────────────────

test('plan object in stage handler bypasses classifier',
  async (t) => {
    const mockExecutor = async () => ({rows: [{id: 1}]});
    const deps = buildDeps(mockExecutor);
    let called = false;

    await executeStage({
      query: 'SELECT * FROM outer_table WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        try {
          stageCtx.call(
            {kind: PLAN_KIND.REDUCE_BY_KEY, stream: 'test'},
            (_grouped) => ({}),
          );
        } catch (err) {
          // Plan execution may throw for other reasons
          // (e.g. not fully wired), but NOT for unbounded
          // rejection.
          t.not(
            err.message, ERR.UNBOUNDED_REJECTED,
            'error is not unbounded rejection',
          );
        }
        called = true;
      },
      opts: {},
      queryExecutor: deps.queryExecutor,
      cancellationToken: deps.cancellationToken,
      executionContext: deps.executionContext,
    });

    t.ok(called, 'handler completed');
    t.end();
  });

// ─── Top-level ctx.call does NOT classify ────────────────────

test('top-level ctx.call does not reject unbounded query',
  async (t) => {
    const mockExecutor = async () => ({rows: []});
    const deps = buildDeps(mockExecutor);

    // Direct call on ExecutionContext (not stage context)
    // should NOT classify — it returns an async iterator.
    const iter = deps.executionContext.call(
      'SELECT * FROM users',
    );
    t.ok(iter !== null, 'top-level call returned a result');
    t.ok(
      typeof iter[Symbol.asyncIterator] === 'function',
      'result is an async iterator',
    );
    t.end();
  });
