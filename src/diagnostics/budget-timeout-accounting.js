import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SCHEMA_VERSION_BUDGET_ACCOUNTING_V1,
  ZERO_COUNT,
  BUDGET_KIND,
  BUDGET_STATE,
  BUDGET_OWNERSHIP_STATE,
  REPORT_OUTCOME,
  OWNER,
  BOUNDARY,
  asRecord,
  finiteOrAbsent,
  textOrUnknown,
} from './causal-analysis-schema.js';
import {normalizeCausalInput} from './causal-graph-builder.js';

const ERROR_TIMEOUT_PATTERN = /within (\d+)ms/u;
const CASCADE_REASON_ACTIVE_GATE_EXHAUSTED = 'active_gate_timeout_exhausted';
const CASCADE_REASON_WORKFLOW_STEP_NEAR_LIMIT = 'workflow_step_near_timeout';
const CASCADE_REASON_WORKFLOW_STEP_UNKNOWN = 'workflow_step_timeout_unknown';
const CASCADE_REASON_UNBOUNDED_ATTEMPTS = 'active_gate_attempts_unbounded';
const CASCADE_REASON_UNKNOWN_READINESS_WINDOW = 'readiness_retry_window_unknown';
const BUDGET_REASON_OBSERVED_LIMIT = 'observed_limit';
const BUDGET_REASON_RETRY_SCHEDULED = 'retry_scheduled';
const BUDGET_REASON_ACTIVE_GATE_TERMINAL = 'active_gate_timeout_terminal';
const BUDGET_REASON_READINESS_TERMINAL = 'readiness_terminal';
const BUDGET_REASON_TIMEOUT_RECONCILE = 'timeout_reconcile_due';
const BUDGET_REASON_LIMIT_UNKNOWN = 'limit_unknown';
const NEXT_ACTION_INSPECT_SCENARIO_BUDGET = 'inspect_scenario_timeout_budget';
const NEXT_ACTION_REDUCE_ACTIVE_GATE_BUDGET =
  'reduce_startup_active_gate_budget_contract';
const NEXT_ACTION_REDUCE_WORKFLOW_BUDGET =
  'reduce_operation_workflow_step_timeout_contract';
const NEXT_ACTION_REDUCE_READINESS_BUDGET =
  'reduce_startup_readiness_retry_window_contract';
const EVIDENCE_PATH_SCENARIO_DURATION = 'scenario.duration';
const EVIDENCE_PATH_REPORT_SUMMARY_DURATION = 'reportSummary.duration';
const EVIDENCE_PATH_SUMMARY_DURATION = 'summary.duration';
const EVIDENCE_PATH_ACTIVE_GATE_ELAPSED =
  'publicationConvergence.activeGate.elapsedMs';
const EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS =
  'publicationConvergence.activeGate.attempts';
const EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS =
  'publicationConvergence.priorityRecoveryProgressSummary.dominantWitness';
const EVIDENCE_PATH_PRIORITY_RECOVERY_RETRY_AFTER =
  'publicationConvergence.priorityRecoveryProgressSummary.dominantWitness.retryAfterMs';
const EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL =
  'summary.readinessFailure.progressSignal';
const EVIDENCE_PATH_READINESS_TERMINAL =
  'summary.readinessFailure.terminalReason';
const TYPE_NUMBER = 'number';
const HALF_RATIO = 0.5;
const RATIO_FULL = 1;
const ONE_COUNT = 1;
const WAIT_MODE_RETRY_SCHEDULED = 'retry_scheduled';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const ACTIVE_GATE_REASON_CODE_STALLED_NO_PROGRESS = 'stalled_no_progress';
const READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL = 'no_progress_terminal';
const READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS = 'stalled_no_progress';
const BUDGET_EVIDENCE_PRESENT = 'present';
const BUDGET_EVIDENCE_ABSENT = ABSENT_VALUE;
const BUDGET_PROGRESS_STATE = Object.freeze({
  BOUNDED: 'bounded_progress',
  TERMINAL: 'terminal_progress',
  UNKNOWN: UNKNOWN_VALUE,
  UNBOUNDED: 'unbounded_progress',
});
const BUDGET_PROGRESS_MECHANISM = Object.freeze({
  OBSERVED_LIMIT: 'observed_limit',
  NEXT_ATTEMPT: 'next_attempt',
  TERMINAL_CLASSIFICATION: 'terminal_classification',
  ABSENT: ABSENT_VALUE,
});
const BUDGET_TERMINAL_STATE = Object.freeze({
  NON_TERMINAL: 'non_terminal',
  TERMINAL_DEGRADED: 'terminal_degraded',
});
const BUDGET_NEXT_ATTEMPT_ABSENT = ABSENT_VALUE;
const DEFAULT_BUDGET_PROGRESS = Object.freeze({
  progressState: BUDGET_PROGRESS_STATE.UNKNOWN,
  progressMechanism: BUDGET_PROGRESS_MECHANISM.ABSENT,
  terminalState: BUDGET_TERMINAL_STATE.NON_TERMINAL,
  reason: BUDGET_REASON_LIMIT_UNKNOWN,
  nextAttemptInMs: BUDGET_NEXT_ATTEMPT_ABSENT,
});
const BUDGET_OWNERSHIP_RULES = Object.freeze({
  [BUDGET_KIND.SCENARIO_DURATION]: Object.freeze({
    owner: OWNER.DIAGNOSTICS,
    boundary: BOUNDARY.CAUSAL_ANALYSIS,
    nextRequiredAction: NEXT_ACTION_INSPECT_SCENARIO_BUDGET,
  }),
  [BUDGET_KIND.ACTIVE_GATE_TIMEOUT]: Object.freeze({
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    nextRequiredAction: NEXT_ACTION_REDUCE_ACTIVE_GATE_BUDGET,
  }),
  [BUDGET_KIND.ACTIVE_GATE_ATTEMPTS]: Object.freeze({
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    nextRequiredAction: NEXT_ACTION_REDUCE_ACTIVE_GATE_BUDGET,
  }),
  [BUDGET_KIND.WORKFLOW_STEP_TIMEOUT]: Object.freeze({
    owner: OWNER.OPERATION_WORKFLOW,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
    nextRequiredAction: NEXT_ACTION_REDUCE_WORKFLOW_BUDGET,
  }),
  [BUDGET_KIND.READINESS_RETRY_WINDOW]: Object.freeze({
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    nextRequiredAction: NEXT_ACTION_REDUCE_READINESS_BUDGET,
  }),
});
const FALLBACK_BUDGET_OWNERSHIP = Object.freeze({
  owner: OWNER.DIAGNOSTICS,
  boundary: BOUNDARY.CAUSAL_ANALYSIS,
  nextRequiredAction: NEXT_ACTION_INSPECT_SCENARIO_BUDGET,
});
const ABSENT_DURATION_EVIDENCE = Object.freeze({
  value: ABSENT_VALUE,
  path: EVIDENCE_PATH_SCENARIO_DURATION,
});
const BUDGET_STATE_RULES = Object.freeze([
  Object.freeze({
    state: BUDGET_STATE.EXHAUSTED,
    matches: (snapshot) =>
      snapshot.terminalState === BUDGET_TERMINAL_STATE.TERMINAL_DEGRADED,
  }),
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
      boundedProgressCount: budgets.filter((budget) =>
        budget.progressState === BUDGET_PROGRESS_STATE.BOUNDED,
      ).length,
      terminalProgressCount: budgets.filter((budget) =>
        budget.progressState === BUDGET_PROGRESS_STATE.TERMINAL,
      ).length,
      ownershipGapCount: budgets.filter((budget) =>
        budget.ownershipState !== BUDGET_OWNERSHIP_STATE.CLASSIFIED,
      ).length,
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
    progressEvidence: buildObservedLimitProgressEvidence(observed.value, limitMs),
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
  const snapshot = normalizeActiveGateBudgetSnapshot(activeGate);
  const limitMs = parseTimeoutLimit(summary.error);
  const evidence = selectActiveGateTimeoutBudgetEvidence(snapshot, limitMs);
  return buildBudget({
    kind: BUDGET_KIND.ACTIVE_GATE_TIMEOUT,
    observed: evidence.observed,
    limit: evidence.limit,
    evidencePath: evidence.evidencePath,
    reportOutcome: normalized.reportOutcome,
    progressEvidence: evidence.progressEvidence,
  });
}

function buildAttemptBudget(activeGate, normalized) {
  const evidence = selectActiveGateAttemptBudgetEvidence(activeGate);
  return buildBudget({
    kind: BUDGET_KIND.ACTIVE_GATE_ATTEMPTS,
    observed: evidence.observed,
    limit: evidence.limit,
    evidencePath: evidence.evidencePath,
    reportOutcome: normalized.reportOutcome,
    progressEvidence: evidence.progressEvidence,
  });
}

function buildWorkflowStepBudget(dominantWitness, normalized) {
  const evidence = selectWorkflowStepBudgetEvidence(dominantWitness);
  return buildBudget({
    kind: BUDGET_KIND.WORKFLOW_STEP_TIMEOUT,
    observed: evidence.observed,
    limit: evidence.limit,
    evidencePath: evidence.evidencePath,
    reportOutcome: normalized.reportOutcome,
    progressEvidence: evidence.progressEvidence,
  });
}

function buildReadinessRetryBudget(readinessFailure, normalized) {
  const progressSignal = asRecord(readinessFailure?.progressSignal);
  const evidence = selectReadinessRetryBudgetEvidence(readinessFailure, progressSignal);
  return buildBudget({
    kind: BUDGET_KIND.READINESS_RETRY_WINDOW,
    observed: evidence.observed,
    limit: evidence.limit,
    evidencePath: evidence.evidencePath,
    reportOutcome: normalized.reportOutcome,
    progressEvidence: evidence.progressEvidence,
  });
}

function buildBudget({
  kind,
  observed,
  limit,
  evidencePath,
  reportOutcome,
  progressEvidence = DEFAULT_BUDGET_PROGRESS,
}) {
  const progress = normalizeBudgetProgressEvidence(progressEvidence);
  const state = resolveBudgetState({
    observed,
    limit,
    reportOutcome,
    terminalState: progress.terminalState,
  });
  const ownership = classifyBudgetOwnership(kind);
  return {
    kind,
    state,
    owner: ownership.owner,
    boundary: ownership.boundary,
    ownershipState: ownership.ownershipState,
    nextRequiredAction: ownership.nextRequiredAction,
    observed,
    limit,
    remaining: remainingBudget(observed, limit),
    ratio: budgetRatio(observed, limit),
    evidencePath,
    progressState: progress.progressState,
    progressMechanism: progress.progressMechanism,
    terminalState: progress.terminalState,
    reason: progress.reason,
    nextAttemptInMs: progress.nextAttemptInMs,
  };
}

function selectActiveGateAttemptBudgetEvidence(activeGate) {
  const snapshot = normalizeActiveGateBudgetSnapshot(activeGate);
  return ACTIVE_GATE_ATTEMPT_BUDGET_RULES.find((rule) =>
    rule.matches(snapshot),
  ).build(snapshot);
}

function normalizeActiveGateBudgetSnapshot(activeGate) {
  const snapshot = {
    elapsedMs: finiteOrAbsent(activeGate.elapsedMs),
    attempts: finiteOrAbsent(activeGate.attempts),
    maxAttempts: finiteOrAbsent(activeGate.maxAttempts),
    attemptsSinceProgress: finiteOrAbsent(activeGate.attemptsSinceProgress),
    maxCoordinatorCycles: finiteOrAbsent(activeGate.maxCoordinatorCycles),
    coordinatorCyclesSinceProgress: finiteOrAbsent(
      activeGate.coordinatorCyclesSinceProgress,
    ),
    activeGateState: textOrUnknown(activeGate.state),
    reasonCode: textOrUnknown(activeGate.reasonCode),
  };
  return {
    ...snapshot,
    terminal: ACTIVE_GATE_TERMINAL_DECISION_RULES.find((rule) =>
      rule.matches(snapshot),
    ).terminal,
  };
}

const ACTIVE_GATE_TERMINAL_DECISION_RULES = Object.freeze([
  Object.freeze({
    terminal: true,
    matches: (snapshot) =>
      snapshot.activeGateState === ACTIVE_GATE_STATE_TIMED_OUT,
  }),
  Object.freeze({
    terminal: true,
    matches: (snapshot) =>
      snapshot.reasonCode === ACTIVE_GATE_REASON_CODE_STALLED_NO_PROGRESS,
  }),
  Object.freeze({
    terminal: true,
    matches: (snapshot) =>
      snapshot.attempts !== ABSENT_VALUE &&
      snapshot.maxAttempts !== ABSENT_VALUE &&
      snapshot.attempts >= snapshot.maxAttempts,
  }),
  Object.freeze({
    terminal: true,
    matches: (snapshot) =>
      snapshot.attemptsSinceProgress !== ABSENT_VALUE &&
      snapshot.maxAttempts !== ABSENT_VALUE &&
      snapshot.attemptsSinceProgress >= snapshot.maxAttempts,
  }),
  Object.freeze({
    terminal: true,
    matches: (snapshot) =>
      snapshot.coordinatorCyclesSinceProgress !== ABSENT_VALUE &&
      snapshot.maxCoordinatorCycles !== ABSENT_VALUE &&
      snapshot.coordinatorCyclesSinceProgress >= snapshot.maxCoordinatorCycles,
  }),
  Object.freeze({
    terminal: false,
    matches: () => true,
  }),
]);

function selectActiveGateTimeoutBudgetEvidence(snapshot, configuredLimit) {
  return ACTIVE_GATE_TIMEOUT_BUDGET_RULES.find((rule) =>
    rule.matches(snapshot, configuredLimit),
  ).build(snapshot, configuredLimit);
}

const ACTIVE_GATE_TIMEOUT_BUDGET_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot, configuredLimit) => configuredLimit !== ABSENT_VALUE,
    build: (snapshot, configuredLimit) => buildBudgetEvidence({
      observed: snapshot.elapsedMs,
      limit: configuredLimit,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ELAPSED,
      progressEvidence: buildObservedLimitProgressEvidence(
        snapshot.elapsedMs,
        configuredLimit,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.terminal === true &&
      snapshot.elapsedMs !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.elapsedMs,
      limit: snapshot.elapsedMs,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ELAPSED,
      progressEvidence: buildTerminalProgressEvidence(
        BUDGET_REASON_ACTIVE_GATE_TERMINAL,
      ),
    }),
  }),
  Object.freeze({
    matches: () => true,
    build: (snapshot, configuredLimit) => buildBudgetEvidence({
      observed: snapshot.elapsedMs,
      limit: configuredLimit,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ELAPSED,
      progressEvidence: buildObservedLimitProgressEvidence(
        snapshot.elapsedMs,
        configuredLimit,
      ),
    }),
  }),
]);

const ACTIVE_GATE_ATTEMPT_BUDGET_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) =>
      snapshot.terminal === true &&
      snapshot.attempts !== ABSENT_VALUE &&
      snapshot.maxAttempts !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.attempts,
      limit: snapshot.maxAttempts,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS,
      progressEvidence: buildTerminalProgressEvidence(
        BUDGET_REASON_ACTIVE_GATE_TERMINAL,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) => snapshot.maxAttempts !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.attempts,
      limit: snapshot.maxAttempts,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS,
      progressEvidence: buildObservedLimitProgressEvidence(
        snapshot.attempts,
        snapshot.maxAttempts,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.terminal === true &&
      snapshot.attempts !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.attempts,
      limit: snapshot.attempts,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS,
      progressEvidence: buildTerminalProgressEvidence(
        BUDGET_REASON_ACTIVE_GATE_TERMINAL,
      ),
    }),
  }),
  Object.freeze({
    matches: () => true,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.attempts,
      limit: snapshot.maxAttempts,
      evidencePath: EVIDENCE_PATH_ACTIVE_GATE_ATTEMPTS,
      progressEvidence: buildUnboundedProgressEvidence(),
    }),
  }),
]);

function selectWorkflowStepBudgetEvidence(dominantWitness) {
  const snapshot = {
    observed: finiteOrAbsent(dominantWitness.stepAgeMs),
    configuredLimit: finiteOrAbsent(dominantWitness.stepTimeoutMs),
    retryAfterMs: finiteOrAbsent(dominantWitness.retryAfterMs),
    waitMode: textOrUnknown(dominantWitness.waitMode),
    timeoutReconcileDue: dominantWitness.timeoutReconcileDue === true,
  };
  return WORKFLOW_STEP_BUDGET_RULES.find((rule) =>
    rule.matches(snapshot),
  ).build(snapshot);
}

const WORKFLOW_STEP_BUDGET_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) =>
      snapshot.timeoutReconcileDue === true &&
      snapshot.configuredLimit !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: selectPresentValue(snapshot.observed, snapshot.configuredLimit),
      limit: snapshot.configuredLimit,
      evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS,
      progressEvidence: buildTerminalProgressEvidence(
        BUDGET_REASON_TIMEOUT_RECONCILE,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) => snapshot.configuredLimit !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.observed,
      limit: snapshot.configuredLimit,
      evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS,
      progressEvidence: buildObservedLimitProgressEvidence(
        snapshot.observed,
        snapshot.configuredLimit,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.waitMode === WAIT_MODE_RETRY_SCHEDULED &&
      snapshot.retryAfterMs !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: ZERO_COUNT,
      limit: snapshot.retryAfterMs,
      evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_RETRY_AFTER,
      progressEvidence: buildNextAttemptProgressEvidence(snapshot.retryAfterMs),
    }),
  }),
  Object.freeze({
    matches: () => true,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.observed,
      limit: snapshot.configuredLimit,
      evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS,
      progressEvidence: buildUnknownProgressEvidence(snapshot),
    }),
  }),
]);

function selectReadinessRetryBudgetEvidence(readinessFailure, progressSignal) {
  const snapshot = {
    observed: finiteOrAbsent(progressSignal.attemptsSinceProgress),
    configuredLimit: finiteOrAbsent(progressSignal.maxAttempts),
    retryAfterMs: finiteOrAbsent(progressSignal.retryAfterMs),
    classCode: textOrUnknown(readinessFailure?.classCode),
    terminalReason: textOrUnknown(readinessFailure?.terminalReason),
  };
  return READINESS_RETRY_BUDGET_RULES.find((rule) =>
    rule.matches(snapshot),
  ).build(snapshot);
}

const READINESS_RETRY_BUDGET_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) => snapshot.configuredLimit !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.observed,
      limit: snapshot.configuredLimit,
      evidencePath: EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL,
      progressEvidence: buildObservedLimitProgressEvidence(
        snapshot.observed,
        snapshot.configuredLimit,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL &&
      snapshot.terminalReason === READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS &&
      snapshot.observed !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.observed,
      limit: snapshot.observed,
      evidencePath: EVIDENCE_PATH_READINESS_TERMINAL,
      progressEvidence: buildTerminalProgressEvidence(
        BUDGET_REASON_READINESS_TERMINAL,
      ),
    }),
  }),
  Object.freeze({
    matches: (snapshot) => snapshot.retryAfterMs !== ABSENT_VALUE,
    build: (snapshot) => buildBudgetEvidence({
      observed: ZERO_COUNT,
      limit: snapshot.retryAfterMs,
      evidencePath: EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL,
      progressEvidence: buildNextAttemptProgressEvidence(snapshot.retryAfterMs),
    }),
  }),
  Object.freeze({
    matches: () => true,
    build: (snapshot) => buildBudgetEvidence({
      observed: snapshot.observed,
      limit: snapshot.configuredLimit,
      evidencePath: EVIDENCE_PATH_READINESS_PROGRESS_SIGNAL,
      progressEvidence: buildUnknownProgressEvidence(snapshot),
    }),
  }),
]);

function buildBudgetEvidence({observed, limit, evidencePath, progressEvidence}) {
  return {
    observed,
    limit,
    evidencePath,
    progressEvidence,
  };
}

function selectPresentValue(primaryValue, fallbackValue) {
  return primaryValue !== ABSENT_VALUE ? primaryValue : fallbackValue;
}

function buildObservedLimitProgressEvidence(observed, limit) {
  const snapshot = {
    observed,
    limit,
    observedEvidence: observed === ABSENT_VALUE ?
      BUDGET_EVIDENCE_ABSENT :
      BUDGET_EVIDENCE_PRESENT,
    limitEvidence: limit === ABSENT_VALUE ?
      BUDGET_EVIDENCE_ABSENT :
      BUDGET_EVIDENCE_PRESENT,
  };
  return OBSERVED_LIMIT_PROGRESS_RULES.find((rule) =>
    rule.matches(snapshot),
  ).build();
}

const OBSERVED_LIMIT_PROGRESS_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) =>
      snapshot.observedEvidence === BUDGET_EVIDENCE_PRESENT &&
      snapshot.limitEvidence === BUDGET_EVIDENCE_PRESENT,
    build: () => ({
      progressState: BUDGET_PROGRESS_STATE.BOUNDED,
      progressMechanism: BUDGET_PROGRESS_MECHANISM.OBSERVED_LIMIT,
      terminalState: BUDGET_TERMINAL_STATE.NON_TERMINAL,
      reason: BUDGET_REASON_OBSERVED_LIMIT,
      nextAttemptInMs: BUDGET_NEXT_ATTEMPT_ABSENT,
    }),
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.observedEvidence === BUDGET_EVIDENCE_PRESENT,
    build: buildUnboundedProgressEvidence,
  }),
  Object.freeze({
    matches: () => true,
    build: () => DEFAULT_BUDGET_PROGRESS,
  }),
]);

function buildNextAttemptProgressEvidence(nextAttemptInMs) {
  return {
    progressState: BUDGET_PROGRESS_STATE.BOUNDED,
    progressMechanism: BUDGET_PROGRESS_MECHANISM.NEXT_ATTEMPT,
    terminalState: BUDGET_TERMINAL_STATE.NON_TERMINAL,
    reason: BUDGET_REASON_RETRY_SCHEDULED,
    nextAttemptInMs,
  };
}

function buildTerminalProgressEvidence(reason) {
  return {
    progressState: BUDGET_PROGRESS_STATE.TERMINAL,
    progressMechanism: BUDGET_PROGRESS_MECHANISM.TERMINAL_CLASSIFICATION,
    terminalState: BUDGET_TERMINAL_STATE.TERMINAL_DEGRADED,
    reason,
    nextAttemptInMs: BUDGET_NEXT_ATTEMPT_ABSENT,
  };
}

function buildUnboundedProgressEvidence() {
  return {
    progressState: BUDGET_PROGRESS_STATE.UNBOUNDED,
    progressMechanism: BUDGET_PROGRESS_MECHANISM.ABSENT,
    terminalState: BUDGET_TERMINAL_STATE.NON_TERMINAL,
    reason: BUDGET_REASON_LIMIT_UNKNOWN,
    nextAttemptInMs: BUDGET_NEXT_ATTEMPT_ABSENT,
  };
}

function buildUnknownProgressEvidence(snapshot) {
  return snapshot.observed === ABSENT_VALUE ?
    DEFAULT_BUDGET_PROGRESS :
    buildUnboundedProgressEvidence();
}

function normalizeBudgetProgressEvidence(progressEvidence) {
  return {
    progressState:
      progressEvidence.progressState || DEFAULT_BUDGET_PROGRESS.progressState,
    progressMechanism:
      progressEvidence.progressMechanism ||
      DEFAULT_BUDGET_PROGRESS.progressMechanism,
    terminalState:
      progressEvidence.terminalState || DEFAULT_BUDGET_PROGRESS.terminalState,
    reason: progressEvidence.reason || DEFAULT_BUDGET_PROGRESS.reason,
    nextAttemptInMs:
      progressEvidence.nextAttemptInMs ?? DEFAULT_BUDGET_PROGRESS.nextAttemptInMs,
  };
}

function classifyBudgetOwnership(kind) {
  const ownership = BUDGET_OWNERSHIP_RULES[kind] || FALLBACK_BUDGET_OWNERSHIP;
  return {
    owner: ownership.owner,
    boundary: ownership.boundary,
    ownershipState: BUDGET_OWNERSHIP_STATE.CLASSIFIED,
    nextRequiredAction: ownership.nextRequiredAction,
  };
}

function resolveBudgetState({observed, limit, reportOutcome, terminalState}) {
  const snapshot = {
    observed,
    limit,
    reportOutcome,
    terminalState,
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
      owners: uniqueValues(matches.map((budget) => budget.owner)),
      boundaries: uniqueValues(matches.map((budget) => budget.boundary)),
      ownershipStates: uniqueValues(matches.map((budget) => budget.ownershipState)),
      nextRequiredActions: uniqueValues(matches.map((budget) => budget.nextRequiredAction)),
    }];
  });
}

function uniqueValues(values) {
  return [...new Set(values)];
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
    id: 'workflow-step-unknown-cascade',
    reason: CASCADE_REASON_WORKFLOW_STEP_UNKNOWN,
    select: (budgets) => budgets.filter((budget) =>
      budget.kind === BUDGET_KIND.WORKFLOW_STEP_TIMEOUT &&
        [BUDGET_STATE.UNKNOWN, BUDGET_STATE.UNBOUNDED].includes(budget.state),
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
