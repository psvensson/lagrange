import {
  ABSENT_VALUE,
  SCHEMA_VERSION_STOP_DECISION_V1,
  ZERO_COUNT,
  STOP_CONDITION,
  STOP_OUTCOME,
  RESOLUTION_STRATEGY,
  FAILURE_CLASS,
  FAILURE_CLASS_RESOLUTION_TABLE,
  STOP_DECISION_TABLE,
  INVARIANT_STATE,
} from './causal-analysis-schema.js';
import {reviewInvariants} from './invariant-review.js';
import {classifyFailures} from './failure-class-taxonomy.js';

const REASON_ALL_INVARIANTS_PASSED = 'all_invariants_passed';
const REASON_BUDGET_TIMEOUT_CASCADE = 'budget_timeout_cascade';
const REASON_STARTUP_READINESS_BOUNDARY = 'startup_readiness_boundary';
const REASON_PRIORITY_RECOVERY_BACKPRESSURE = 'priority_recovery_backpressure';
const REASON_LOCAL_RUNTIME_OWNER_BLOCKER = 'local_runtime_owner_blocker';
const REASON_INSUFFICIENT_EVIDENCE = 'insufficient_evidence';
const LOCAL_BLOCKER_FAILURE_CLASSES = Object.freeze([
  FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
  FAILURE_CLASS.PUBLICATION_ACK_BLOCKED,
]);
const STOP_CONDITION_RULES = Object.freeze([
  Object.freeze({
    condition: STOP_CONDITION.ALL_INVARIANTS_PASSED,
    reasons: Object.freeze([REASON_ALL_INVARIANTS_PASSED]),
    matches: (snapshot) =>
      snapshot.failedInvariantCount === ZERO_COUNT &&
      snapshot.unknownInvariantCount === ZERO_COUNT &&
      snapshot.failureClasses.includes(FAILURE_CLASS.HEALTHY),
  }),
  Object.freeze({
    condition: STOP_CONDITION.ARCHITECTURE_GAP,
    reasons: Object.freeze([REASON_BUDGET_TIMEOUT_CASCADE]),
    matches: (snapshot) => snapshot.failureClasses.includes(
      FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE,
    ),
  }),
  Object.freeze({
    condition: STOP_CONDITION.OWNER_BOUNDARY_MIGRATION,
    reasons: Object.freeze([REASON_STARTUP_READINESS_BOUNDARY]),
    matches: (snapshot) => snapshot.failureClasses.includes(
      FAILURE_CLASS.STARTUP_READINESS_BLOCKED,
    ),
  }),
  Object.freeze({
    condition: STOP_CONDITION.CLASSIFIED_BACKPRESSURE,
    reasons: Object.freeze([REASON_PRIORITY_RECOVERY_BACKPRESSURE]),
    matches: (snapshot) => snapshot.failureClasses.includes(
      FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT,
    ),
  }),
  Object.freeze({
    condition: STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER,
    reasons: Object.freeze([REASON_LOCAL_RUNTIME_OWNER_BLOCKER]),
    matches: (snapshot) => hasLocalBlocker(snapshot.failureClasses),
  }),
  Object.freeze({
    condition: STOP_CONDITION.INSUFFICIENT_EVIDENCE,
    reasons: Object.freeze([REASON_INSUFFICIENT_EVIDENCE]),
    matches: (snapshot) =>
      snapshot.unknownInvariantCount > ZERO_COUNT ||
      snapshot.failureClasses.includes(FAILURE_CLASS.EVIDENCE_INCOMPLETE),
  }),
]);

function decideStopCondition(input = {}) {
  const invariantReview = reviewInvariants(input);
  const taxonomy = classifyFailures(input);
  const conditionEvidence = buildConditionEvidence(invariantReview, taxonomy);
  const selectedCondition = selectCondition(conditionEvidence);
  const decisionRow = STOP_DECISION_TABLE.find((row) => row.condition === selectedCondition);
  return {
    schemaVersion: SCHEMA_VERSION_STOP_DECISION_V1,
    scenario: invariantReview.scenario,
    condition: selectedCondition,
    outcome: decisionRow?.outcome || STOP_OUTCOME.ASK_HUMAN,
    strategy: decisionRow?.strategy || RESOLUTION_STRATEGY.ASK_HUMAN,
    reasons: conditionEvidence[selectedCondition] || [REASON_INSUFFICIENT_EVIDENCE],
    dominantFailureClass: taxonomy.dominantFailureClass,
    decisionTable: STOP_DECISION_TABLE.map((row) => ({...row})),
    summary: {
      invariantFailedCount: invariantReview.summary.failedCount,
      invariantUnknownCount: invariantReview.summary.unknownCount,
      failureClassCount: taxonomy.summary.classCount,
    },
  };
}

function buildConditionEvidence(invariantReview, taxonomy) {
  const failedInvariants = invariantReview.invariants.filter((invariant) =>
    invariant.state === INVARIANT_STATE.FAILED,
  );
  const unknownInvariants = invariantReview.invariants.filter((invariant) =>
    invariant.state === INVARIANT_STATE.UNKNOWN,
  );
  const snapshot = {
    failedInvariantCount: failedInvariants.length,
    unknownInvariantCount: unknownInvariants.length,
    failureClasses: taxonomy.classes.map((entry) => entry.failureClass),
  };
  return Object.fromEntries(STOP_DECISION_TABLE.map((row) => [
    row.condition,
    selectConditionReasons(row.condition, snapshot),
  ]));
}

function hasLocalBlocker(failureClasses) {
  return LOCAL_BLOCKER_FAILURE_CLASSES.some((failureClass) =>
    failureClasses.includes(failureClass),
  );
}

function selectConditionReasons(condition, snapshot) {
  const rule = STOP_CONDITION_RULES.find((entry) => entry.condition === condition);
  if (!rule || rule.matches(snapshot) !== true) {
    return [];
  }
  return [...rule.reasons];
}

function selectCondition(conditionEvidence) {
  const selected = STOP_DECISION_TABLE.find((row) =>
    conditionEvidence[row.condition]?.length > ZERO_COUNT,
  );
  return selected?.condition || STOP_CONDITION.INSUFFICIENT_EVIDENCE;
}

function buildStopDecisionTable() {
  return {
    schemaVersion: SCHEMA_VERSION_STOP_DECISION_V1,
    conditions: STOP_DECISION_TABLE.map((row) => ({...row})),
    resolutionStrategies: {...FAILURE_CLASS_RESOLUTION_TABLE},
    absentCondition: ABSENT_VALUE,
  };
}

export {decideStopCondition, buildStopDecisionTable};
