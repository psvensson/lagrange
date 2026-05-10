import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_ID,
  FAILURE_CLASS,
  STOP_OUTCOME,
  buildCausalAnalysisSchema,
} from '../../src/diagnostics/causal-analysis-schema.js';

const EXPECTED_PHASE_COUNT = 10;
const ZERO_COUNT = 0;
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

function assertNoNullOrUndefined(value) {
  assert.notEqual(value, NULL_VALUE);
  assert.notEqual(value, UNDEFINED_VALUE);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoNullOrUndefined(item);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      assertNoNullOrUndefined(childValue);
    }
  }
}

describe('CausalAnalysisSchema', () => {
  it('defines the rolling-restart phase model and stop table deterministically', () => {
    const schema = buildCausalAnalysisSchema();

    assert.equal(schema.phases.length, EXPECTED_PHASE_COUNT);
    assert.equal(schema.phases[ZERO_COUNT].id, PHASE_ID.STARTUP);
    assert.equal(schema.phases.at(-1).id, PHASE_ID.COMPLETION);
    assert.ok(schema.failureClasses.some((entry) =>
      entry.value === FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
    ));
    assert.ok(schema.stopDecisionTable.some((row) =>
      row.outcome === STOP_OUTCOME.WIDEN_ARCHITECTURE_WORK,
    ));
    assertNoNullOrUndefined(schema);
  });
});
