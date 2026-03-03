/**
 * Tests for PlanDiagnostics — EXPLAIN output combining strategy
 * decisions with primitive telemetry.
 *
 * Requirements: 6.5, 10.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PlanDiagnostics,
  DIAGNOSTIC_FIELD as DF,
  DIAGNOSTIC_ERROR_MSG,
} from '../../src/query/plan-diagnostics.js';
import {selectStrategy} from '../../src/query/strategy-selector.js';
import {
  PrimitiveTelemetry,
} from '../../src/query/primitive-telemetry.js';
import {
  STRATEGY,
  STRATEGY_REASON,
  STRATEGY_INPUT_FIELD as SIF,
  HINT_FIELD,
} from '../../src/query/strategy-constants.js';
import {
  PRIMITIVE_TYPE,
} from '../../src/query/distributed/distributed-context-constants.js';
import {
  LOOKUP_ACCESS_PATH,
} from '../../src/query/distributed/distributed-context-constants.js';

// ─── Constructor ─────────────────────────────────────────────

test('PlanDiagnostics - requires queryId', (t) => {
  t.throws(
    () => new PlanDiagnostics({}),
    {message: DIAGNOSTIC_ERROR_MSG.QUERY_ID_REQUIRED},
  );
  t.end();
});

test('PlanDiagnostics - creates with queryId', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q1'});
  t.equal(diag.queryId, 'q1');
  t.equal(diag.tenantId, null);
  t.notOk(diag.hasDecision());
  t.notOk(diag.hasTelemetry());
  t.end();
});

test('PlanDiagnostics - creates with tenantId', (t) => {
  const diag = new PlanDiagnostics({
    queryId: 'q1',
    tenantId: 't1',
  });
  t.equal(diag.tenantId, 't1');
  t.end();
});

// ─── recordDecision ──────────────────────────────────────────

test('PlanDiagnostics - recordDecision stores decision', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q1'});
  const decision = selectStrategy({
    [SIF.SIDE_SIZE_BYTES]: 100,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  diag.recordDecision(decision);
  t.ok(diag.hasDecision());
  t.end();
});

test('PlanDiagnostics - recordDecision rejects null', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q1'});
  t.throws(
    () => diag.recordDecision(null),
    {message: DIAGNOSTIC_ERROR_MSG.DECISION_REQUIRED},
  );
  t.end();
});

test('PlanDiagnostics - recordDecision rejects missing strategy',
  (t) => {
    const diag = new PlanDiagnostics({queryId: 'q1'});
    t.throws(
      () => diag.recordDecision({reason: 'test'}),
      {message: DIAGNOSTIC_ERROR_MSG.DECISION_MISSING_STRATEGY},
    );
    t.end();
  });

// ─── recordTelemetry ─────────────────────────────────────────

test('PlanDiagnostics - recordTelemetry stores snapshot', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q1'});
  const tel = new PrimitiveTelemetry({
    queryId: 'q1',
    tenantId: 't1',
  });
  tel.record(PRIMITIVE_TYPE.LOOKUP, 200, 10);
  diag.recordTelemetry(tel.snapshot());
  t.ok(diag.hasTelemetry());
  t.end();
});

test('PlanDiagnostics - recordTelemetry with null', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q1'});
  diag.recordTelemetry(null);
  t.notOk(diag.hasTelemetry());
  t.end();
});

// ─── toExplain ───────────────────────────────────────────────

test('toExplain - full output with decision and telemetry',
  (t) => {
    const diag = new PlanDiagnostics({
      queryId: 'q1',
      tenantId: 't1',
    });

    const decision = selectStrategy({
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    diag.recordDecision(decision);

    const tel = new PrimitiveTelemetry({
      queryId: 'q1',
      tenantId: 't1',
    });
    tel.record(PRIMITIVE_TYPE.LOOKUP, 200, 10);
    tel.record(PRIMITIVE_TYPE.EMIT, 50, 2);
    diag.recordTelemetry(tel.snapshot());

    const explain = diag.toExplain();

    t.equal(explain[DF.QUERY_ID], 'q1');
    t.equal(explain[DF.TENANT_ID], 't1');
    t.ok(explain[DF.STRATEGY]);
    t.equal(explain[DF.STRATEGY].strategy, STRATEGY.BROADCAST);
    t.equal(
      explain[DF.STRATEGY].reason,
      STRATEGY_REASON.SIDE_BELOW_BROADCAST_THRESHOLD,
    );
    t.equal(explain[DF.STRATEGY].hintApplied, false);
    t.equal(explain[DF.STRATEGY].sideSizeBytes, 100);
    t.ok(explain[DF.PRIMITIVES]);
    t.ok(explain[DF.PRIMITIVES][PRIMITIVE_TYPE.LOOKUP]);
    t.ok(explain[DF.PRIMITIVES][PRIMITIVE_TYPE.EMIT]);
    t.equal(typeof explain[DF.TIMESTAMP], 'number');
    t.ok(Object.isFrozen(explain));
    t.end();
  });

test('toExplain - with hint-applied decision', (t) => {
  const diag = new PlanDiagnostics({queryId: 'q2'});

  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.EMIT_SHUFFLE},
  );
  diag.recordDecision(decision);

  const explain = diag.toExplain();
  t.equal(explain[DF.STRATEGY].strategy, STRATEGY.EMIT_SHUFFLE);
  t.equal(explain[DF.STRATEGY].hintApplied, true);
  t.equal(
    explain[DF.STRATEGY].reason,
    STRATEGY_REASON.USER_HINT_EMIT_SHUFFLE,
  );
  t.end();
});

test('toExplain - without decision returns null strategy',
  (t) => {
    const diag = new PlanDiagnostics({queryId: 'q3'});
    const explain = diag.toExplain();
    t.equal(explain[DF.STRATEGY], null);
    t.equal(explain[DF.PRIMITIVES], null);
    t.end();
  });

test('toExplain - without telemetry returns null primitives',
  (t) => {
    const diag = new PlanDiagnostics({queryId: 'q4'});
    const decision = selectStrategy({
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    diag.recordDecision(decision);

    const explain = diag.toExplain();
    t.ok(explain[DF.STRATEGY]);
    t.equal(explain[DF.PRIMITIVES], null);
    t.end();
  });

test('toExplain - lookup strategy with telemetry', (t) => {
  const diag = new PlanDiagnostics({
    queryId: 'q5',
    tenantId: 't2',
  });

  const decision = selectStrategy({
    [SIF.SIDE_SIZE_BYTES]: 300000,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  });
  diag.recordDecision(decision);

  const tel = new PrimitiveTelemetry({
    queryId: 'q5',
    tenantId: 't2',
  });
  tel.record(PRIMITIVE_TYPE.BROADCAST, 1000, 5);
  diag.recordTelemetry(tel.snapshot());

  const explain = diag.toExplain();
  t.equal(explain[DF.STRATEGY].strategy, STRATEGY.LOOKUP);
  t.equal(
    explain[DF.STRATEGY].innerAccessPath,
    LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  );
  t.ok(explain[DF.PRIMITIVES][PRIMITIVE_TYPE.BROADCAST]);
  t.end();
});
