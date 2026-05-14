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
const CURRENT_ACTIVE_GATE_BUDGET_REPORT_PATH =
  'test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json';
const JSON_ENCODING_UTF8 = 'utf8';
const ZERO_COUNT = 0;
const ONE_COUNT = 1;
const TWO_COUNT = 2;
const THREE_COUNT = 3;
const CURRENT_ACTIVE_GATE_ELAPSED_MS = 87249;
const CURRENT_ACTIVE_GATE_ATTEMPTS = 9;
const CURRENT_ACTIVE_GATE_MAX_ATTEMPTS = 8;
const DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS = 250;
const DIRECT_STALLED_ACTIVE_GATE_ATTEMPTS = 1;
const CURRENT_WORKFLOW_RETRY_AFTER_MS = 1000;
const NULL_VALUE = null;
const UNDEFINED_VALUE = undefined;
const PROGRESS_STATE_BOUNDED = 'bounded_progress';
const PROGRESS_STATE_UNBOUNDED = 'unbounded_progress';
const PROGRESS_STATE_TERMINAL = 'terminal_progress';
const PROGRESS_MECHANISM_OBSERVED_LIMIT = 'observed_limit';
const PROGRESS_MECHANISM_NEXT_ATTEMPT = 'next_attempt';
const PROGRESS_MECHANISM_TERMINAL_CLASSIFICATION =
  'terminal_classification';
const TERMINAL_STATE_DEGRADED = 'terminal_degraded';
const TERMINAL_STATE_NON_TERMINAL = 'non_terminal';
const ACTIVE_GATE_STATE_STALLED = 'stalled';
const REASON_ACTIVE_GATE_TERMINAL = 'active_gate_timeout_terminal';
const REASON_LIMIT_UNKNOWN = 'limit_unknown';
const REASON_READINESS_TERMINAL = 'readiness_terminal';
const REASON_RETRY_SCHEDULED = 'retry_scheduled';
const DIRECT_STALLED_ACTIVE_GATE_REPORT = Object.freeze({
  publicationConvergence: Object.freeze({
    activeGate: Object.freeze({
      state: ACTIVE_GATE_STATE_STALLED,
      elapsedMs: DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS,
      attempts: DIRECT_STALLED_ACTIVE_GATE_ATTEMPTS,
    }),
  }),
});

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
  it('accounts terminal attempts and bounded cascades explicitly', () => {
    const accounting = accountBudgets(readArtifact(ACTIVE_FAILURE_BUNDLE_PATH));
    const attemptBudget = findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_ATTEMPTS);

    assert.equal(
      findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_TIMEOUT).state,
      BUDGET_STATE.EXHAUSTED,
    );
    assert.equal(attemptBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(attemptBudget.progressState, PROGRESS_STATE_TERMINAL);
    assert.equal(
      attemptBudget.progressMechanism,
      PROGRESS_MECHANISM_TERMINAL_CLASSIFICATION,
    );
    assert.equal(attemptBudget.terminalState, TERMINAL_STATE_DEGRADED);
    assert.equal(attemptBudget.reason, REASON_ACTIVE_GATE_TERMINAL);
    assert.equal(accounting.summary.unknownCount, ZERO_COUNT);
    assert.equal(accounting.summary.unboundedCount, ZERO_COUNT);
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

    assert.equal(attemptBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(attemptBudget.owner, OWNER.ACTIVE_GATE);
    assert.equal(attemptBudget.boundary, BOUNDARY.SNAPSHOT_COVERAGE);
    assert.equal(attemptBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(attemptBudget.progressState, PROGRESS_STATE_TERMINAL);
    assert.equal(attemptBudget.reason, REASON_ACTIVE_GATE_TERMINAL);
    assert.equal(workflowBudget.state, BUDGET_STATE.WITHIN);
    assert.equal(workflowBudget.owner, OWNER.OPERATION_WORKFLOW);
    assert.equal(workflowBudget.boundary, BOUNDARY.WORKFLOW_PROGRESS);
    assert.equal(workflowBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(workflowBudget.progressState, PROGRESS_STATE_BOUNDED);
    assert.equal(workflowBudget.progressMechanism, PROGRESS_MECHANISM_NEXT_ATTEMPT);
    assert.equal(workflowBudget.reason, REASON_RETRY_SCHEDULED);
    assert.equal(workflowBudget.nextAttemptInMs, CURRENT_WORKFLOW_RETRY_AFTER_MS);
    assert.equal(readinessBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(readinessBudget.owner, OWNER.READINESS);
    assert.equal(readinessBudget.boundary, BOUNDARY.STARTUP_SUPPORT_EVIDENCE);
    assert.equal(readinessBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(readinessBudget.progressState, PROGRESS_STATE_TERMINAL);
    assert.equal(
      readinessBudget.progressMechanism,
      PROGRESS_MECHANISM_TERMINAL_CLASSIFICATION,
    );
    assert.equal(readinessBudget.reason, REASON_READINESS_TERMINAL);
    assert.equal(accounting.summary.boundedProgressCount, THREE_COUNT);
    assert.equal(accounting.summary.terminalProgressCount, TWO_COUNT);
    assert.equal(accounting.summary.unboundedCount, ZERO_COUNT);
    assert.equal(accounting.summary.unknownCount, ZERO_COUNT);
    assert.equal(accounting.summary.ownershipGapCount, ZERO_COUNT);
    assertNoNullOrUndefined(accounting);
  });

  it('uses stalled active-gate snapshot evidence as bounded terminal timeout accounting', () => {
    const accounting = accountBudgets(readArtifact(CURRENT_ACTIVE_GATE_BUDGET_REPORT_PATH));
    const timeoutBudget = findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_TIMEOUT);
    const attemptBudget = findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_ATTEMPTS);

    assert.equal(timeoutBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(timeoutBudget.observed, CURRENT_ACTIVE_GATE_ELAPSED_MS);
    assert.equal(timeoutBudget.limit, CURRENT_ACTIVE_GATE_ELAPSED_MS);
    assert.equal(timeoutBudget.owner, OWNER.ACTIVE_GATE);
    assert.equal(timeoutBudget.boundary, BOUNDARY.SNAPSHOT_COVERAGE);
    assert.equal(timeoutBudget.ownershipState, BUDGET_OWNERSHIP_STATE.CLASSIFIED);
    assert.equal(timeoutBudget.progressState, PROGRESS_STATE_TERMINAL);
    assert.equal(
      timeoutBudget.progressMechanism,
      PROGRESS_MECHANISM_TERMINAL_CLASSIFICATION,
    );
    assert.equal(timeoutBudget.terminalState, TERMINAL_STATE_DEGRADED);
    assert.equal(timeoutBudget.reason, REASON_ACTIVE_GATE_TERMINAL);
    assert.equal(attemptBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(attemptBudget.observed, CURRENT_ACTIVE_GATE_ATTEMPTS);
    assert.equal(attemptBudget.limit, CURRENT_ACTIVE_GATE_MAX_ATTEMPTS);
    assert.equal(attemptBudget.progressState, PROGRESS_STATE_TERMINAL);
    assert.equal(attemptBudget.terminalState, TERMINAL_STATE_DEGRADED);
    assert.equal(accounting.summary.unboundedCount, ONE_COUNT);
    assert.equal(accounting.summary.terminalProgressCount, TWO_COUNT);
    assertNoNullOrUndefined(accounting);
  });

  it('does not treat stalled active-gate state alone as terminal budget proof', () => {
    const accounting = accountBudgets(DIRECT_STALLED_ACTIVE_GATE_REPORT);
    const timeoutBudget = findBudget(accounting, BUDGET_KIND.ACTIVE_GATE_TIMEOUT);

    assert.equal(timeoutBudget.state, BUDGET_STATE.UNBOUNDED);
    assert.equal(timeoutBudget.observed, DIRECT_STALLED_ACTIVE_GATE_ELAPSED_MS);
    assert.equal(timeoutBudget.progressState, PROGRESS_STATE_UNBOUNDED);
    assert.equal(timeoutBudget.terminalState, TERMINAL_STATE_NON_TERMINAL);
    assert.equal(timeoutBudget.reason, REASON_LIMIT_UNKNOWN);
    assertNoNullOrUndefined(accounting);
  });

  it('keeps observed workflow limits as bounded progress evidence', () => {
    const accounting = accountBudgets(readArtifact(ACTIVE_FAILURE_BUNDLE_PATH));
    const workflowBudget = findBudget(accounting, BUDGET_KIND.WORKFLOW_STEP_TIMEOUT);

    assert.equal(workflowBudget.state, BUDGET_STATE.EXHAUSTED);
    assert.equal(workflowBudget.progressState, PROGRESS_STATE_BOUNDED);
    assert.equal(
      workflowBudget.progressMechanism,
      PROGRESS_MECHANISM_OBSERVED_LIMIT,
    );
    assert.equal(accounting.summary.boundedProgressCount, THREE_COUNT);
    assert.equal(accounting.summary.terminalProgressCount, TWO_COUNT);
    assert.equal(accounting.cascades.length, ONE_COUNT);
  });
});
