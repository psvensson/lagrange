import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountBudgets} from '../../src/diagnostics/budget-timeout-accounting.js';
import {
  BOUNDARY,
  BUDGET_KIND,
  BUDGET_OWNERSHIP_STATE,
  BUDGET_STATE,
  OWNER,
} from '../../src/diagnostics/causal-analysis-schema.js';

const ACTIVE_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json';
const ACTIVE_FAILURE_BUNDLE_PATH =
  'test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json';
const CURRENT_REPORT_PATH =
  'test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json';
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

  it('classifies budget ownership for the current timeout cascade frontier', () => {
    const accounting = accountBudgets(readArtifact(CURRENT_REPORT_PATH));
    const attemptBudget = findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_ATTEMPTS);
    const workflowBudget = findBudget(accounting, BUDGET_KIND.WORKFLOW_STEP_TIMEOUT);
    const readinessBudget = findBudget(accounting, BUDGET_KIND.READINESS_RETRY_WINDOW);

    assert.equal(attemptBudget.state, BUDGET_STATE.UNBOUNDED);
    assert.equal(attemptBudget.owner, OWNER.ACTIVE_GATE);
    assert.equal(attemptBudget.boundary, BOUNDARY.SNAPSHOT_COVERAGE);
    assert.equal(attemptBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(workflowBudget.state, BUDGET_STATE.UNKNOWN);
    assert.equal(workflowBudget.owner, OWNER.OPERATION_WORKFLOW);
    assert.equal(workflowBudget.boundary, BOUNDARY.WORKFLOW_PROGRESS);
    assert.equal(workflowBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(readinessBudget.state, BUDGET_STATE.UNBOUNDED);
    assert.equal(readinessBudget.owner, OWNER.READINESS);
    assert.equal(readinessBudget.boundary, BOUNDARY.STARTUP_SUPPORT_EVIDENCE);
    assert.equal(readinessBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(accounting.summary.ownershipGapCount, ZERO_COUNT);
    assertNoNullOrUndefined(accounting);
  });
});
