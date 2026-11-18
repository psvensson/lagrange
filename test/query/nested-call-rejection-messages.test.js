/**
 * Tests for unbounded nested ctx.call rejection with
 * expected error messages per classification reason.
 *
 * Verifies that each unbounded pattern produces the
 * teachable error message directing users to emit +
 * reduceByKey, and that bounded patterns pass through.
 *
 * Requirements: 8.3, 8.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {executeStage} from
  '../../src/query/call-stage.js';
import {classifyNestedCall} from
  '../../src/query/nested-call-classifier.js';
import {CancellationToken} from
  '../../src/query/cancellation-token.js';
import {ExecutionContext} from
  '../../src/query/execution-context.js';
import {BudgetEnforcer} from
  '../../src/query/budget-enforcer.js';
import {LineageTracker} from
  '../../src/query/lineage-tracker.js';
import {PlanDiagnostics} from
  '../../src/query/plan-diagnostics.js';
import {
  NESTED_CALL_CLASSIFICATION as CLS,
  NESTED_CALL_REASON as REASON,
  NESTED_CALL_ERROR_MSG as ERR,
  DEFAULT_SNAPSHOT_MODE,
  DIAGNOSTICS_FIELD as DF,
} from '../../src/query/runtime-constants.js';

/**
 * Build deps for executeStage with optional diagnostics.
 *
 * @param {Object} [opts] - Options.
 * @return {Object} deps for executeStage.
 */
function buildDeps(opts = {}) {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const cancellationToken = new CancellationToken();
  const budgetEnforcer = new BudgetEnforcer();
  const lineageTracker = new LineageTracker('rej-msg-q');
  const executionContext = new ExecutionContext({
    session: 'rej-msg-session',
    snapshot: {mode: DEFAULT_SNAPSHOT_MODE},
    budgetEnforcer,
    cancellationToken,
    lineageTracker,
    queryExecutor: mockExecutor,
    planDiagnostics: opts.planDiagnostics ?? null,
  });
  return {
    cancellationToken,
    executionContext,
    queryExecutor: mockExecutor,
  };
}

/**
 * Run a stage handler that makes a nested call with the
 * given query and return the rejection error (or null).
 *
 * @param {string} nestedQuery - SQL for nested call.
 * @param {Object} [opts] - Options for buildDeps.
 * @return {Promise<Error|null>}
 */
async function captureRejection(nestedQuery, opts) {
  const deps = buildDeps(opts);
  try {
    await executeStage({
      query: 'SELECT * FROM outer WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        await stageCtx.call(nestedQuery);
      },
      opts: {},
      queryExecutor: deps.queryExecutor,
      cancellationToken: deps.cancellationToken,
      executionContext: deps.executionContext,
    });
    return null;
  } catch (err) {
    return err;
  }
}

// ─── Rejection error message content ─────────────────────────

describe('unbounded rejection error message content', () => {
  it('error message mentions ctx.emit as alternative', () => {
    assert.ok(ERR.UNBOUNDED_REJECTED.includes('ctx.emit'));
  });

  it('error message mentions reduceByKey as alternative', () => {
    assert.ok(ERR.UNBOUNDED_REJECTED.includes('reduceByKey'));
  });

  it('error message lists primary-key as allowed pattern', () => {
    assert.ok(
      ERR.UNBOUNDED_REJECTED.includes('primary-key'),
    );
  });

  it('error message lists IN clause as allowed pattern', () => {
    assert.ok(ERR.UNBOUNDED_REJECTED.includes('IN clause'));
  });

  it('error message lists WHERE + LIMIT as allowed pattern',
    () => {
      assert.ok(ERR.UNBOUNDED_REJECTED.includes('LIMIT'));
    });
});

// ─── Each unbounded reason produces same teachable error ─────

describe('full table scan rejection', () => {
  it('rejects with teachable error', async () => {
    const err = await captureRejection(
      'SELECT * FROM users',
    );
    assert.ok(err);
    assert.equal(err.message, ERR.UNBOUNDED_REJECTED);
  });

  it('classifier returns FULL_TABLE_SCAN reason', () => {
    const r = classifyNestedCall('SELECT * FROM users');
    assert.equal(r.classification, CLS.UNBOUNDED);
    assert.equal(r.reason, REASON.FULL_TABLE_SCAN);
  });
});

describe('range scan without LIMIT rejection', () => {
  it('rejects with teachable error', async () => {
    const err = await captureRejection(
      'SELECT * FROM orders WHERE amount > ?',
    );
    assert.ok(err);
    assert.equal(err.message, ERR.UNBOUNDED_REJECTED);
  });

  it('classifier returns RANGE_SCAN_NO_LIMIT reason', () => {
    const r = classifyNestedCall(
      'SELECT * FROM orders WHERE amount > ?',
    );
    assert.equal(r.classification, CLS.UNBOUNDED);
    assert.equal(r.reason, REASON.RANGE_SCAN_NO_LIMIT);
  });
});

describe('JOIN rejection', () => {
  it('rejects with teachable error', async () => {
    const err = await captureRejection(
      'SELECT * FROM a JOIN b ON a.id = b.aid',
    );
    assert.ok(err);
    assert.equal(err.message, ERR.UNBOUNDED_REJECTED);
  });

  it('classifier returns JOIN_DETECTED reason', () => {
    const r = classifyNestedCall(
      'SELECT * FROM a JOIN b ON a.id = b.aid',
    );
    assert.equal(r.classification, CLS.UNBOUNDED);
    assert.equal(r.reason, REASON.JOIN_DETECTED);
  });
});

describe('subquery rejection', () => {
  it('rejects with teachable error', async () => {
    const err = await captureRejection(
      'SELECT * FROM users WHERE id IN ' +
      '(SELECT uid FROM orders)',
    );
    assert.ok(err);
    assert.equal(err.message, ERR.UNBOUNDED_REJECTED);
  });

  it('classifier returns SUBQUERY_DETECTED reason', () => {
    const r = classifyNestedCall(
      'SELECT * FROM users WHERE id IN ' +
      '(SELECT uid FROM orders)',
    );
    assert.equal(r.classification, CLS.UNBOUNDED);
    assert.equal(r.reason, REASON.SUBQUERY_DETECTED);
  });
});

describe('conservative default rejection', () => {
  it('rejects query with IN clause exceeding param limit',
    async () => {
      // Build an IN clause with 101+ params to exceed
      // NESTED_CALL_MAX_IN_PARAMS (100) and also add a
      // range operator so it falls to conservative default.
      const placeholders = Array.from(
        {length: 101}, () => '?',
      ).join(', ');
      const query =
        `SELECT * FROM t WHERE x > ? AND id IN (${placeholders})`;
      const err = await captureRejection(query);
      assert.ok(err);
      assert.equal(err.message, ERR.UNBOUNDED_REJECTED);
    });
});

// ─── Bounded patterns pass through without rejection ─────────

describe('bounded patterns are not rejected', () => {
  it('PK equality lookup passes', async () => {
    const err = await captureRejection(
      'SELECT * FROM users WHERE id = ?',
    );
    assert.equal(err, null);
  });

  it('IN clause with bounded params passes', async () => {
    const err = await captureRejection(
      'SELECT * FROM users WHERE id IN (?, ?, ?)',
    );
    assert.equal(err, null);
  });

  it('WHERE + LIMIT passes', async () => {
    const err = await captureRejection(
      'SELECT * FROM logs WHERE ts > ? LIMIT 10',
    );
    assert.equal(err, null);
  });

  it('ANY clause passes', async () => {
    const err = await captureRejection(
      'SELECT * FROM users WHERE id = ANY(?)',
    );
    assert.equal(err, null);
  });

  it('multiple equality conditions pass', async () => {
    const err = await captureRejection(
      'SELECT * FROM users WHERE id = ? AND status = ?',
    );
    assert.equal(err, null);
  });
});

// ─── Diagnostics record rejection reason ─────────────────────

describe('diagnostics track rejection reasons', () => {
  it('records unbounded classification with reason', async () => {
    const diag = new PlanDiagnostics({queryId: 'diag-rej'});
    await captureRejection(
      'SELECT * FROM users',
      {planDiagnostics: diag},
    );
    const decisions = diag.getDecisions();
    assert.equal(decisions.length, 1);
    assert.equal(
      decisions[0][DF.CLASSIFICATION], CLS.UNBOUNDED,
    );
    assert.equal(
      decisions[0][DF.REASON], REASON.FULL_TABLE_SCAN,
    );
    assert.equal(diag.getRejectionCount(), 1);
  });

  it('records bounded classification for allowed query',
    async () => {
      const diag = new PlanDiagnostics({queryId: 'diag-ok'});
      await captureRejection(
        'SELECT * FROM users WHERE id = ?',
        {planDiagnostics: diag},
      );
      const decisions = diag.getDecisions();
      assert.equal(decisions.length, 1);
      assert.equal(
        decisions[0][DF.CLASSIFICATION], CLS.BOUNDED,
      );
      assert.equal(diag.getBoundedCount(), 1);
      assert.equal(diag.getRejectionCount(), 0);
    });

  it('records multiple decisions across handler calls',
    async () => {
      const diag = new PlanDiagnostics({queryId: 'diag-multi'});
      const deps = buildDeps({planDiagnostics: diag});

      // First stage: bounded call succeeds
      await executeStage({
        query: 'SELECT * FROM outer WHERE id = ?',
        params: [1],
        handler: async (_batch, stageCtx) => {
          await stageCtx.call(
            'SELECT * FROM t WHERE id = ?', [1],
          );
        },
        opts: {},
        queryExecutor: deps.queryExecutor,
        cancellationToken: deps.cancellationToken,
        executionContext: deps.executionContext,
      });

      // Second stage: unbounded call rejected
      const deps2 = buildDeps({planDiagnostics: diag});
      try {
        await executeStage({
          query: 'SELECT * FROM outer WHERE id = ?',
          params: [1],
          handler: async (_batch, stageCtx) => {
            await stageCtx.call('SELECT * FROM t');
          },
          opts: {},
          queryExecutor: deps2.queryExecutor,
          cancellationToken: deps2.cancellationToken,
          executionContext: deps2.executionContext,
        });
      } catch (_e) {
        // expected
      }

      const decisions = diag.getDecisions();
      assert.equal(decisions.length, 2);
      assert.equal(diag.getBoundedCount(), 1);
      assert.equal(diag.getRejectionCount(), 1);
    });
});
