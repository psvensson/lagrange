import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountBudgets} from '../../src/diagnostics/budget-timeout-accounting.js';
import {BUDGET_KIND, BUDGET_STATE} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json';
const ACTIVE_FAILURE_BUNDLE_PATH =
  'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
const JSON_ENCODING_UTF8 = 'utf8';
const ZERO_COUNT = 0;
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;

function readArtifact(artifactPath) {
  return JSON.parse(fs.readFileSync(artifactPath, JSON_ENCODING_UTF8));
}

function findBudget(accounting, kind) {
  return accounting.budgets.find((budget) => budget.kind === kind);
}

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

describe('BudgetTimeoutAccounting', () => {
  it('accounts timeout, unbounded attempts, and cascades explicitly', () => {
    const accounting = accountBudgets(readArtifact(ACTIVE_FAILURE_BUNDLE_PATH));

    assert.equal(
      findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_TIMEOUT).state,
      BUDGET_STATE.EXHAUSTED,
    );
    assert.equal(
      findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_ATTEMPTS).state,
      BUDGET_STATE.UNBOUNDED,
    );
    assert.ok(accounting.cascades.length > ZERO_COUNT);
    assertNoNullOrUndefined(accounting);
  });

  it('accounts failure-bundle report summary duration like report scenario duration', () => {
    const reportAccounting = accountBudgets(readArtifact(ACTIVE_REPORT_PATH));
    const failureBundleAccounting = accountBudgets(readArtifact(ACTIVE_FAILURE_BUNDLE_PATH));

    assert.equal(
      findBudget(reportAccounting, BUDGET_KIND.SCENARIO_DURATION).state,
      BUDGET_STATE.EXHAUSTED,
    );
    assert.equal(
      findBudget(failureBundleAccounting, BUDGET_KIND.SCENARIO_DURATION).state,
      BUDGET_STATE.EXHAUSTED,
    );
    assert.equal(
      failureBundleAccounting.summary.exhaustedCount,
      reportAccounting.summary.exhaustedCount,
    );
  });
});
