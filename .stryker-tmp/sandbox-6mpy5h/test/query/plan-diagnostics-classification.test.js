/**
 * Tests for PlanDiagnostics nested call classification
 * tracking.
 *
 * Requirements: 8.5, 13.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  PlanDiagnostics,
} from '../../src/query/plan-diagnostics.js';
import {ExecutionContext} from '../../src/query/execution-context.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {BudgetEnforcer} from '../../src/query/budget-enforcer.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';
import {executeStage} from '../../src/query/call-stage.js';
import {
  NESTED_CALL_CLASSIFICATION as CLS,
  NESTED_CALL_REASON as REASON,
  NESTED_CALL_ERROR_MSG as ERR,
  DEFAULT_SNAPSHOT_MODE,
  DIAGNOSTICS_FIELD as DF,
} from '../../src/query/runtime-constants.js';

// ─── Helpers ─────────────────────────────────────────────────

function makeDiag() {
  return new PlanDiagnostics({queryId: 'diag-test'});
}

function makeExecCtx(planDiagnostics) {
  const mockExecutor = async () => ({rows: [{id: 1}]});
  const cancellationToken = new CancellationToken();
  const budgetEnforcer = new BudgetEnforcer();
  const lineageTracker = new LineageTracker('diag-q1');
  const ctx = new ExecutionContext({
    session: 'diag-session',
    snapshot: {mode: DEFAULT_SNAPSHOT_MODE},
    budgetEnforcer,
    cancellationToken,
    lineageTracker,
    queryExecutor: mockExecutor,
    planDiagnostics,
  });
  return {ctx, cancellationToken, mockExecutor};
}

// ─── recordClassification ────────────────────────────────────

test('recordClassification - records bounded decision', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'SELECT * FROM users WHERE id = ?',
    CLS.BOUNDED,
    REASON.PK_POINT_LOOKUP,
  );
  const decisions = diag.getDecisions();
  t.equal(decisions.length, 1);
  t.equal(decisions[0][DF.QUERY],
    'SELECT * FROM users WHERE id = ?');
  t.equal(decisions[0][DF.CLASSIFICATION], CLS.BOUNDED);
  t.equal(decisions[0][DF.REASON], REASON.PK_POINT_LOOKUP);
  t.equal(typeof decisions[0][DF.TIMESTAMP], 'number');
  t.end();
});

test('recordClassification - records unbounded decision', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'SELECT * FROM users',
    CLS.UNBOUNDED,
    REASON.FULL_TABLE_SCAN,
  );
  const decisions = diag.getDecisions();
  t.equal(decisions.length, 1);
  t.equal(decisions[0][DF.CLASSIFICATION], CLS.UNBOUNDED);
  t.equal(decisions[0][DF.REASON], REASON.FULL_TABLE_SCAN);
  t.end();
});

// ─── getDecisions ────────────────────────────────────────────

test('getDecisions - returns frozen array', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'SELECT * FROM t WHERE id = ?',
    CLS.BOUNDED,
    REASON.PK_POINT_LOOKUP,
  );
  const decisions = diag.getDecisions();
  t.ok(Object.isFrozen(decisions));
  t.end();
});

test('getDecisions - returns empty array when none recorded',
  (t) => {
    const diag = makeDiag();
    const decisions = diag.getDecisions();
    t.equal(decisions.length, 0);
    t.ok(Object.isFrozen(decisions));
    t.end();
  });

test('getDecisions - returns all recorded decisions', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'SELECT * FROM a WHERE id = ?',
    CLS.BOUNDED,
    REASON.PK_POINT_LOOKUP,
  );
  diag.recordClassification(
    'SELECT * FROM b',
    CLS.UNBOUNDED,
    REASON.FULL_TABLE_SCAN,
  );
  diag.recordClassification(
    'SELECT * FROM c WHERE id IN (?, ?)',
    CLS.BOUNDED,
    REASON.BOUNDED_IN_CLAUSE,
  );
  const decisions = diag.getDecisions();
  t.equal(decisions.length, 3);
  t.end();
});

// ─── getRejectionCount / getBoundedCount ─────────────────────

test('getRejectionCount - counts unbounded decisions', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'q1', CLS.BOUNDED, REASON.PK_POINT_LOOKUP,
  );
  diag.recordClassification(
    'q2', CLS.UNBOUNDED, REASON.FULL_TABLE_SCAN,
  );
  diag.recordClassification(
    'q3', CLS.UNBOUNDED, REASON.JOIN_DETECTED,
  );
  t.equal(diag.getRejectionCount(), 2);
  t.end();
});

test('getBoundedCount - counts bounded decisions', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'q1', CLS.BOUNDED, REASON.PK_POINT_LOOKUP,
  );
  diag.recordClassification(
    'q2', CLS.UNBOUNDED, REASON.FULL_TABLE_SCAN,
  );
  diag.recordClassification(
    'q3', CLS.BOUNDED, REASON.BOUNDED_IN_CLAUSE,
  );
  t.equal(diag.getBoundedCount(), 2);
  t.end();
});

test('getRejectionCount - zero when no unbounded', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'q1', CLS.BOUNDED, REASON.PK_POINT_LOOKUP,
  );
  t.equal(diag.getRejectionCount(), 0);
  t.end();
});

test('getBoundedCount - zero when no bounded', (t) => {
  const diag = makeDiag();
  diag.recordClassification(
    'q1', CLS.UNBOUNDED, REASON.FULL_TABLE_SCAN,
  );
  t.equal(diag.getBoundedCount(), 0);
  t.end();
});

// ─── ExecutionContext integration ────────────────────────────

test('ExecutionContext - getPlanDiagnostics returns null by default',
  (t) => {
    const {ctx} = makeExecCtx();
    t.equal(ctx.getPlanDiagnostics(), null);
    t.end();
  });

test('ExecutionContext - getPlanDiagnostics returns injected instance',
  (t) => {
    const diag = makeDiag();
    const {ctx} = makeExecCtx(diag);
    t.equal(ctx.getPlanDiagnostics(), diag);
    t.end();
  });

// ─── buildStageContext wiring ────────────────────────────────

test('stage context records bounded classification in diagnostics',
  async (t) => {
    const diag = makeDiag();
    const {ctx, cancellationToken, mockExecutor} =
      makeExecCtx(diag);

    await executeStage({
      query: 'SELECT * FROM outer WHERE id = ?',
      params: [1],
      handler: async (_batch, stageCtx) => {
        await stageCtx.call(
          'SELECT * FROM users WHERE id = ?', [1],
        );
      },
      opts: {},
      queryExecutor: mockExecutor,
      cancellationToken,
      executionContext: ctx,
    });

    const decisions = diag.getDecisions();
    t.equal(decisions.length, 1);
    t.equal(decisions[0][DF.CLASSIFICATION], CLS.BOUNDED);
    t.equal(decisions[0][DF.REASON], REASON.PK_POINT_LOOKUP);
    t.end();
  });

test('diagnostics recorded even when unbounded rejection throws',
  async (t) => {
    const diag = makeDiag();
    const {ctx, cancellationToken, mockExecutor} =
      makeExecCtx(diag);

    try {
      await executeStage({
        query: 'SELECT * FROM outer WHERE id = ?',
        params: [1],
        handler: async (_batch, stageCtx) => {
          await stageCtx.call('SELECT * FROM users');
        },
        opts: {},
        queryExecutor: mockExecutor,
        cancellationToken,
        executionContext: ctx,
      });
    } catch (err) {
      t.equal(err.message, ERR.UNBOUNDED_REJECTED);
    }

    const decisions = diag.getDecisions();
    t.equal(decisions.length, 1);
    t.equal(decisions[0][DF.CLASSIFICATION], CLS.UNBOUNDED);
    t.equal(decisions[0][DF.REASON], REASON.FULL_TABLE_SCAN);
    t.equal(diag.getRejectionCount(), 1);
    t.equal(diag.getBoundedCount(), 0);
    t.end();
  });

test('stage context without diagnostics still works', async (t) => {
  const {ctx, cancellationToken, mockExecutor} = makeExecCtx();

  await executeStage({
    query: 'SELECT * FROM outer WHERE id = ?',
    params: [1],
    handler: async (_batch, stageCtx) => {
      await stageCtx.call(
        'SELECT * FROM users WHERE id = ?', [1],
      );
    },
    opts: {},
    queryExecutor: mockExecutor,
    cancellationToken,
    executionContext: ctx,
  });

  t.equal(ctx.getPlanDiagnostics(), null);
  t.end();
});
