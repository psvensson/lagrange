import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SCHEMA_VERSION_INVARIANT_REVIEW_V1,
  ZERO_COUNT,
  INVARIANT_KIND,
  INVARIANT_STATE,
  BUDGET_STATE,
  BUDGET_OWNERSHIP_STATE,
  REPORT_OUTCOME,
  asRecord,
  arrayOrEmpty,
  numberOrZero,
  textOrUnknown,
} from './causal-analysis-schema.js';
import {buildCausalGraph, normalizeCausalInput} from './causal-graph-builder.js';
import {accountBudgets} from './budget-timeout-accounting.js';
import {EDGE_STATE} from './topology-convergence-graph.js';

const REASON_NODE_COUNTS_WITHIN_EXPECTED = 'node_counts_within_expected';
const REASON_ACTIVE_EXCEEDS_EXPECTED = 'active_count_exceeds_expected';
const REASON_COVERAGE_WITHIN_EXPECTED = 'snapshot_coverage_within_expected';
const REASON_COVERAGE_EXCEEDS_EXPECTED = 'snapshot_coverage_exceeds_expected';
const REASON_PUBLICATION_ACK_CLOSED = 'publication_ack_closed';
const REASON_PUBLICATION_ACK_OPEN = 'publication_ack_open';
const REASON_PRIORITY_RECOVERY_CLASSIFIED = 'priority_recovery_classified';
const REASON_PRIORITY_RECOVERY_EVIDENCE_MISSING = 'priority_recovery_evidence_missing';
const REASON_READINESS_BLOCKERS_EXPLAINED = 'readiness_blockers_explained';
const REASON_READINESS_BLOCKERS_ABSENT_ON_SUCCESS = 'readiness_blockers_absent_on_success';
const REASON_READINESS_BLOCKERS_MISSING = 'readiness_blockers_missing';
const REASON_BUDGET_ACCOUNTED = 'budget_accounted';
const REASON_BUDGET_UNACCOUNTED = 'budget_unknown_or_unbounded';
const REASON_BUDGET_OWNERSHIP_CLASSIFIED = 'budget_ownership_classified';
const EDGE_PUBLICATION_ACK = 'publication_ack_convergence';
const EDGE_PRIORITY_RECOVERY = 'priority_recovery_partition_progress';
const EVIDENCE_PATH_BUDGETS = 'budgetAccounting.budgets';
const EXPECTATION_READINESS_REASONS = 'readiness reasons for blocked nodes';
const EXPECTATION_BUDGETS_ACCOUNTED =
  'all budgets bounded, observed, or owner-classified';
const LIST_SEPARATOR = ',';
const EVIDENCE_PRESENT = 'present';
const EVIDENCE_ABSENT = ABSENT_VALUE;
const COUNT_INVARIANT_RULES = Object.freeze([
  Object.freeze({
    state: INVARIANT_STATE.PASSED,
    matches: (snapshot) =>
      snapshot.expectedEvidence === EVIDENCE_PRESENT &&
      snapshot.observed <= snapshot.expected,
  }),
  Object.freeze({
    state: INVARIANT_STATE.FAILED,
    matches: (snapshot) =>
      snapshot.expectedEvidence === EVIDENCE_PRESENT &&
      snapshot.observed > snapshot.expected,
  }),
  Object.freeze({
    state: INVARIANT_STATE.PASSED,
    matches: (snapshot) => snapshot.reportOutcome === REPORT_OUTCOME.PASSED,
  }),
  Object.freeze({
    state: INVARIANT_STATE.UNKNOWN,
    matches: () => true,
  }),
]);
const READINESS_INVARIANT_RULES = Object.freeze([
  Object.freeze({
    state: INVARIANT_STATE.PASSED,
    reason: REASON_READINESS_BLOCKERS_EXPLAINED,
    matches: (snapshot) => snapshot.blockedReasonCount > ZERO_COUNT,
  }),
  Object.freeze({
    state: INVARIANT_STATE.PASSED,
    reason: REASON_READINESS_BLOCKERS_ABSENT_ON_SUCCESS,
    matches: (snapshot) => snapshot.reportOutcome === REPORT_OUTCOME.PASSED,
  }),
  Object.freeze({
    state: INVARIANT_STATE.UNKNOWN,
    reason: REASON_READINESS_BLOCKERS_MISSING,
    matches: () => true,
  }),
]);

function reviewInvariants(input = {}) {
  const normalized = normalizeCausalInput(input);
  const graph = buildCausalGraph(input);
  const budgetAccounting = accountBudgets(input);
  const invariants = INVARIANT_RULES.map((rule) => rule.evaluate({
    normalized,
    graph,
    budgetAccounting,
  }));
  return {
    schemaVersion: SCHEMA_VERSION_INVARIANT_REVIEW_V1,
    scenario: normalized.scenario,
    invariants,
    summary: {
      invariantCount: invariants.length,
      failedCount: invariants.filter((invariant) =>
        invariant.state === INVARIANT_STATE.FAILED,
      ).length,
      unknownCount: invariants.filter((invariant) =>
        invariant.state === INVARIANT_STATE.UNKNOWN,
      ).length,
      passedCount: invariants.filter((invariant) =>
        invariant.state === INVARIANT_STATE.PASSED,
      ).length,
    },
  };
}

const INVARIANT_RULES = Object.freeze([
  Object.freeze({
    kind: INVARIANT_KIND.NODE_COUNT_BOUNDS,
    evaluate: ({normalized}) => compareCountInvariant({
      kind: INVARIANT_KIND.NODE_COUNT_BOUNDS,
      observed: normalized.progress.activeNodeCount,
      expected: normalized.progress.expectedNodeCount,
      passReason: REASON_NODE_COUNTS_WITHIN_EXPECTED,
      failReason: REASON_ACTIVE_EXCEEDS_EXPECTED,
      evidencePath: 'publicationConvergence.activeGate.progress.activeNodeCount',
      reportOutcome: normalized.reportOutcome,
    }),
  }),
  Object.freeze({
    kind: INVARIANT_KIND.SNAPSHOT_COVERAGE_BOUNDS,
    evaluate: ({normalized}) => compareCountInvariant({
      kind: INVARIANT_KIND.SNAPSHOT_COVERAGE_BOUNDS,
      observed: normalized.progress.snapshotCoverageNodeCount,
      expected: normalized.progress.expectedNodeCount,
      passReason: REASON_COVERAGE_WITHIN_EXPECTED,
      failReason: REASON_COVERAGE_EXCEEDS_EXPECTED,
      evidencePath: 'publicationConvergence.activeGate.progress.snapshotCoverageNodeCount',
      reportOutcome: normalized.reportOutcome,
    }),
  }),
  Object.freeze({
    kind: INVARIANT_KIND.PUBLICATION_ACK_CLOSED,
    evaluate: ({normalized, graph}) => evaluateTopologyEdgeInvariant({
      graph,
      edgeId: EDGE_PUBLICATION_ACK,
      kind: INVARIANT_KIND.PUBLICATION_ACK_CLOSED,
      passReason: REASON_PUBLICATION_ACK_CLOSED,
      failReason: REASON_PUBLICATION_ACK_OPEN,
      reportOutcome: normalized.reportOutcome,
    }),
  }),
  Object.freeze({
    kind: INVARIANT_KIND.PRIORITY_RECOVERY_CLASSIFIED,
    evaluate: ({normalized, graph}) => evaluateTopologyEdgeInvariant({
      graph,
      edgeId: EDGE_PRIORITY_RECOVERY,
      kind: INVARIANT_KIND.PRIORITY_RECOVERY_CLASSIFIED,
      passReason: REASON_PRIORITY_RECOVERY_CLASSIFIED,
      failReason: REASON_PRIORITY_RECOVERY_EVIDENCE_MISSING,
      reportOutcome: normalized.reportOutcome,
    }),
  }),
  Object.freeze({
    kind: INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED,
    evaluate: ({normalized}) => evaluateReadinessInvariant(normalized),
  }),
  Object.freeze({
    kind: INVARIANT_KIND.BUDGET_ACCOUNTED,
    evaluate: ({budgetAccounting}) => evaluateBudgetInvariant(budgetAccounting),
  }),
]);

function compareCountInvariant({
  kind,
  observed,
  expected,
  passReason,
  failReason,
  evidencePath,
  reportOutcome,
}) {
  const observedCount = numberOrZero(observed);
  const expectedCount = numberOrZero(expected);
  const state = COUNT_INVARIANT_RULES.find((rule) => rule.matches({
    observed: observedCount,
    expected: expectedCount,
    expectedEvidence: expectedCount === ZERO_COUNT ? EVIDENCE_ABSENT : EVIDENCE_PRESENT,
    reportOutcome,
  })).state;
  return {
    kind,
    state,
    reasons: [state === INVARIANT_STATE.FAILED ? failReason : passReason],
    evidencePath,
    observed: observedCount,
    expected: expectedCount || UNKNOWN_VALUE,
  };
}

function evaluateTopologyEdgeInvariant({
  graph,
  edgeId,
  kind,
  passReason,
  failReason,
  reportOutcome,
}) {
  const edge = graph.nodes.find((node) => node.id === `topology:${edgeId}`);
  const state = resolveTopologyInvariantState({edge, reportOutcome});
  return {
    kind,
    state,
    reasons: [state === INVARIANT_STATE.PASSED ? passReason : failReason],
    evidencePath: edge?.evidencePath || ABSENT_VALUE,
    observed: edge?.state || UNKNOWN_VALUE,
    expected: EDGE_STATE.SATISFIED,
  };
}

function resolveTopologyInvariantState({edge, reportOutcome}) {
  const rules = [
    {
      state: INVARIANT_STATE.UNKNOWN,
      matches: () => !edge,
    },
    {
      state: INVARIANT_STATE.PASSED,
      matches: () => edge.state === EDGE_STATE.SATISFIED || edge.state === EDGE_STATE.RETRYABLE,
    },
    {
      state: INVARIANT_STATE.PASSED,
      matches: () => reportOutcome === REPORT_OUTCOME.PASSED && edge.state === EDGE_STATE.UNKNOWN,
    },
    {
      state: INVARIANT_STATE.FAILED,
      matches: () => true,
    },
  ];
  return rules.find((rule) => rule.matches()).state;
}

function evaluateReadinessInvariant(normalized) {
  const reasonEntries = Object.entries(asRecord(normalized.nodeReasonsByNodeId));
  const blockedReasons = reasonEntries.filter((entry) =>
    arrayOrEmpty(entry[1]).length > ZERO_COUNT,
  );
  const decision = READINESS_INVARIANT_RULES.find((rule) => rule.matches({
    blockedReasonCount: blockedReasons.length,
    reportOutcome: normalized.reportOutcome,
  }));
  return {
    kind: INVARIANT_KIND.READINESS_BLOCKERS_EXPLAINED,
    state: decision.state,
    reasons: [decision.reason],
    evidencePath: normalized.readinessEvidencePath,
    observed: blockedReasons.length,
    expected: EXPECTATION_READINESS_REASONS,
  };
}

function evaluateBudgetInvariant(budgetAccounting) {
  const unaccounted = budgetAccounting.budgets.filter((budget) =>
    [BUDGET_STATE.UNKNOWN, BUDGET_STATE.UNBOUNDED].includes(budget.state),
  );
  const unresolved = unaccounted.filter((budget) =>
    budget.ownershipState !== BUDGET_OWNERSHIP_STATE.CLASSIFIED,
  );
  const state = unresolved.length === ZERO_COUNT ?
    INVARIANT_STATE.PASSED :
    INVARIANT_STATE.FAILED;
  return {
    kind: INVARIANT_KIND.BUDGET_ACCOUNTED,
    state,
    reasons: [resolveBudgetInvariantReason({state, unaccounted})],
    evidencePath: EVIDENCE_PATH_BUDGETS,
    observed: unresolved.map((budget) => textOrUnknown(budget.kind)).join(LIST_SEPARATOR) ||
      ABSENT_VALUE,
    expected: EXPECTATION_BUDGETS_ACCOUNTED,
  };
}

function resolveBudgetInvariantReason({state, unaccounted}) {
  const rules = [
    {
      reason: REASON_BUDGET_UNACCOUNTED,
      matches: (snapshot) => snapshot.state === INVARIANT_STATE.FAILED,
    },
    {
      reason: REASON_BUDGET_OWNERSHIP_CLASSIFIED,
      matches: (snapshot) => snapshot.unaccounted.length > ZERO_COUNT,
    },
    {
      reason: REASON_BUDGET_ACCOUNTED,
      matches: () => true,
    },
  ];
  return rules.find((rule) => rule.matches({state, unaccounted})).reason;
}

export {reviewInvariants};
