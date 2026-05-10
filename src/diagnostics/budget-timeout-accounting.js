import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SCHEMA_VERSION_BUDGET_ACCOUNTING_V1,
  ZERO_COUNT,
  BUDGET_KIND,
  BUDGET_STATE,
  REPORT_OUTCOME,
  asRecord,
  finiteOrAbsent,
  textOrUnknown,
} from './causal-analysis-schema.js';
import {normalizeCausalInput} from './causal-graph-builder.js';

const ERROR_TIMEOUT_PATTERN = /within (\d+)ms/u;
const CASCADE_REASON_ACTIVE_GATE_EXHAUSTED = 'active_gate_timeout_exhausted';
const CASCADE_REASON_WORKFLOW_STEP_NEAR_LIMIT = 'workflow_step_near_timeout';
const CASCADE_REASON_UNBOUNDED_ATTEMPTS = 'active_gate_attempts_unbounded';
const CASCADE_REASON_UNKNOWN_READINESS_WINDOW = 'readiness_retry_window_unknown';
const EVIDENCE_PATH_SCENARIO_DURATION = 'scenario.duration';
const EVIDENCE_PATH_REPORT_SUMMARY_DURATION = 'reportSummary.duration';
const EVIDENCE_PATH_SUMMARY_DURATION = 'summary.duration';
const EVIDENCE_PATH_ACTIVE_GATE_ELAPSED =
  'publicationConvergence.activeGate.elapsedMs';
const EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS =
  'publicationConvergence.activeGate.attempts';
const EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS =
  'publicationConvergence.priorityRecoveryProgressSummary.dominantWitness';
const EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL =
  'summary.readinessFailure.progressSignal';
const TYPE_NUMBER = 'number';
const HALF_RATIO = 0.5;
const RATIO_FULL = 1;
const ONE_COUNT = 1;
const BUDGET_EVIDENCE_PRESENT = 'present';
const BUDGET_EVIDENCE_ABSENT = ABSENT_VALUE;
const ABSENT_DURATION_EVIDENCE = Object.freeze({
  value: ABSENT_VALUE,
  path: EVIDENCE_PATH_SCENARIO_DURATION,
});
const BUDGET_STATE_RULES = Object.freeze([
  Object.freeze({
    state: BUDGET_STATE.EXHAUSTED,
    matches: (snapshot) =>
      snapshot.observedEvidence === BUDGET_EVIDENCE_PRESENT &&
      snapshot.limitEvidence === BUDGET_EVIDENCE_PRESENT &&
      snapshot.observed >= snapshot.limit,
  }),
  Object.freeze({
    state: BUDGET_STATE.WITHIN,
    matches: (snapshot) =>
      snapshot.observedEvidence === BUDGET_EVIDENCE_PRESENT &&
      snapshot.limitEvidence === BUDGET_EVIDENCE_PRESENT &&
      snapshot.observed < snapshot.limit,
  }),
  Object.freeze({
    state: BUDGET_STATE.WITHIN,
    matches: (snapshot) => snapshot.reportOutcome === REPORT_OUTCOME.PASSED,
  }),
  Object.freeze({
    state: BUDGET_STATE.UNKNOWN,
    matches: (snapshot) => snapshot.observedEvidence === BUDGET_EVIDENCE_ABSENT,
  }),
  Object.freeze({
    state: BUDGET_STATE.UNBOUNDED,
    matches: (snapshot) => snapshot.limitEvidence === BUDGET_EVIDENCE_ABSENT,
  }),
]);

function accountBudgets(input = {}) {
  const normalized = normalizeCausalInput(input);
  const budgets = buildBudgets(normalized);
  const cascades = buildCascades(budgets);
  return {
    schemaVersion: SCHEMA_VERSION_BUDGET_ACCOUNTING_V1,
    scenario: normalized.scenario,
    budgets,
    cascades,
    summary: {
      budgetCount: budgets.length,
      exhaustedCount: budgets.filter((budget) => budget.state === BUDGET_STATE.EXHAUSTED).length,
      cascadeCount: cascades.length,
      unknownCount: budgets.filter((budget) => budget.state === BUDGET_STATE.UNKNOWN).length,
      unboundedCount: budgets.filter((budget) => budget.state === BUDGET_STATE.UNBOUNDED).length,
    },
  };
}

function buildBudgets(normalized) {
  const scenario = normalized.scenarioRecord;
  const activeGate = normalized.activeGate;
  const dominantWitness = normalized.dominantWitness;
  return [
    buildDurationBudget(scenario, normalized.reportSummary, normalized.summary, normalized),
    buildActiveGateTimeoutBudget(activeGate, normalized.summary, normalized),
    buildAttemptBudget(activeGate, normalized),
    buildWorkflowStepBudget(dominantWitness, normalized),
    buildReadinessRetryBudget(normalized.summary.readinessFailure, normalized),
  ];
}

function buildDurationBudget(scenario, reportSummary, summary, normalized) {
  const observed = selectDurationEvidence(scenario, reportSummary, summary);
  const limitMs = parseTimeoutLimit(summary.error || scenario.error);
  return buildBudget({
    kind: BUDGET_KIND.SCENARIO_DURATION,
    observed: observed.value,
    limit: limitMs,
    evidencePath: observed.path,
    reportOutcome: normalized.reportOutcome,
  });
}

function selectDurationEvidence(scenario, reportSummary, summary) {
  const candidates = [
    {
      value: finiteOrAbsent(scenario.duration),
      path: EVIDENCE_PATH_SCENARIO_DURATION,
    },
    {
      value: finiteOrAbsent(reportSummary.duration),
      path: EVIDENCE_PATH_REPORT_SUMMARY_DURATION,
    },
    {
      value: finiteOrAbsent(summary.duration),
      path: EVIDENCE_PATH_SUMMARY_DURATION,
    },
  ];
  return candidates.find((candidate) => candidate.value !== ABSENT_VALUE) ||
    ABSENT_DURATION_EVIDENCE;
}

function buildActiveGateTimeoutBudget(activeGate, summary, normalized) {
  const observedMs = finiteOrAbsent(activeGate.elapsedMs);
  const limitMs = parseTimeoutLimit(summary.error);
  return buildBudget({
    kind: BUDGET_KIND.ACTIVE_GATE_TIMEOUT,
    observed: observedMs,
    limit: limitMs,
    evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ELAPSED,
    reportOutcome: normalized.reportOutcome,
  });
}

function buildAttemptBudget(activeGate, normalized) {
  const observed = finiteOrAbsent(activeGate.attempts);
  const limit = finiteOrAbsent(activeGate.maxAttempts);
  return buildBudget({
    kind: BUDGET_KIND.ACTIVE_GATE_ATTEMPTS,
    observed,
    limit,
    evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS,
    reportOutcome: normalized.reportOutcome,
  });
}

function buildWorkflowStepBudget(dominantWitness, normalized) {
  return buildBudget({
    kind: BUDGET_KIND.WORKFLOW_STEP_TIMEOUT,
    observed: finiteOrAbsent(dominantWitness.stepAgeMs),
    limit: finiteOrAbsent(dominantWitness.stepTimeoutMs),
    evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS,
    reportOutcome: normalized.reportOutcome,
  });
}

function buildReadinessRetryBudget(readinessFailure, normalized) {
  const progressSignal = asRecord(readinessFailure?.progressSignal);
  return buildBudget({
    kind: BUDGET_KIND.READINESS_RETRY_WINDOW,
    observed: finiteOrAbsent(progressSignal.attemptsSinceProgress),
    limit: finiteOrAbsent(progressSignal.maxAttempts),
    evidencePath: EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL,
    reportOutcome: normalized.reportOutcome,
  });
}

function buildBudget({kind, observed, limit, evidencePath, reportOutcome}) {
  const state = resolveBudgetState({observed, limit, reportOutcome});
  return {
    kind,
    state,
    observed,
    limit,
    remaining: remainingBudget(observed, limit),
    ratio: budgetRatio(observed, limit),
    evidencePath,
  };
}

function resolveBudgetState({observed, limit, reportOutcome}) {
  const snapshot = {
    observed,
    limit,
    reportOutcome,
    observedEvidence: observed === ABSENT_VALUE ? BUDGET_EVIDENCE_ABSENT : BUDGET_EVIDENCE_PRESENT,
    limitEvidence: limit === ABSENT_VALUE ? BUDGET_EVIDENCE_ABSENT : BUDGET_EVIDENCE_PRESENT,
  };
  return BUDGET_STATE_RULES.find((rule) => rule.matches(snapshot)).state;
}

function remainingBudget(observed, limit) {
  if (typeof observed !== TYPE_NUMBER || typeof limit !== TYPE_NUMBER) {
    return UNKNOWN_VALUE;
  }
  return limit - observed;
}

function budgetRatio(observed, limit) {
  if (typeof observed !== TYPE_NUMBER || typeof limit !== TYPE_NUMBER || limit === ZERO_COUNT) {
    return UNKNOWN_VALUE;
  }
  return observed / limit;
}

function parseTimeoutLimit(errorText) {
  const match = textOrUnknown(errorText).match(ERROR_TIMEOUT_PATTERN);
  if (!match) {
    return ABSENT_VALUE;
  }
  return Number(match[ONE_COUNT]);
}

function buildCascades(budgets) {
  return CASCADE_RULES.flatMap((rule) => {
    const matches = rule.select(budgets);
    if (matches.length === ZERO_COUNT) {
      return [];
    }
    return [{
      id: rule.id,
      state: BUDGET_STATE.CASCADE,
      reason: rule.reason,
      budgetKinds: matches.map((budget) => budget.kind),
    }];
  });
}

const CASCADE_RULES = Object.freeze([
  Object.freeze({
    id: 'active-gate-timeout-cascade',
    reason: CASCADE_REASON_ACTIVE_GATE_EXHAUSTED,
    select: (budgets) => budgets.filter((budget) =>
      budget.kind === BUDGET_KIND.ACTIVE_GATE_TIMEOUT &&
        budget.state === BUDGET_STATE.EXHAUSTED,
    ),
  }),
  Object.freeze({
    id: 'workflow-step-timeout-cascade',
    reason: CASCADE_REASON_WORKFLOW_STEP_NEAR_LIMIT,
    select: (budgets) => budgets.filter((budget) =>
      budget.kind === BUDGET_KIND.WORKFLOW_STEP_TIMEOUT &&
        typeof budget.ratio === 'number' &&
        budget.ratio >= HALF_RATIO &&
        budget.ratio < RATIO_FULL,
    ),
  }),
  Object.freeze({
    id: 'attempt-budget-unbounded-cascade',
    reason: CASCADE_REASON_UNBOUNDED_ATTEMPTS,
    select: (budgets) => budgets.filter((budget) =>
      budget.kind === BUDGET_KIND.ACTIVE_GATE_ATTEMPTS &&
        budget.state === BUDGET_STATE.UNBOUNDED,
    ),
  }),
  Object.freeze({
    id: 'readiness-window-unknown-cascade',
    reason: CASCADE_REASON_UNKNOWN_READINESS_WINDOW,
    select: (budgets) => budgets.filter((budget) =>
      budget.kind === BUDGET_KIND.READINESS_RETRY_WINDOW &&
        [BUDGET_STATE.UNKNOWN, BUDGET_STATE.UNBOUNDED].includes(budget.state),
    ),
  }),
]);

export {accountBudgets};
