import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
import {
  buildConsistencyMismatch,
} from './assertions-consistency-comparison.js';
import {
  CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH,
  CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
  CONSISTENCY_OBSERVATION_COHORT_STATE_CONTROL_SNAPSHOT,
  CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT,
  CONSISTENCY_OBSERVATION_COHORT_STATE_MIXED_UNAVAILABLE,
  CONSISTENCY_OBSERVATION_COHORT_STATE_SQL_FALLBACK,
  CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
  EMPTY_LIST_LENGTH,
  VALUE_UNKNOWN,
} from './assertions-consistency-shared.js';
const {
  isControlSnapshotObservation,
} = ASSERTIONS_CONVERGENCE_WAIT;

function buildObservationCohortSummary(nodeStates) {
  return {
    controlSnapshotNodeIds: (Array.isArray(nodeStates) ? nodeStates : [])
      .filter(isControlSnapshotObservation)
      .map((state) => String(state?.nodeId || VALUE_UNKNOWN))
      .sort(),
    sqlFallbackNodeIds: (Array.isArray(nodeStates) ? nodeStates : [])
      .filter((state) => !isControlSnapshotObservation(state))
      .map((state) => String(state?.nodeId || VALUE_UNKNOWN))
      .sort(),
  };
}

function buildMixedObservationModeMismatch(nodeStates, cohortState) {
  const summary = buildObservationCohortSummary(nodeStates);
  return buildConsistencyMismatch(
    'Cannot compare consistency from mixed observation modes. ' +
      'Control snapshot nodes: ' +
      JSON.stringify(summary.controlSnapshotNodeIds) +
      '. SQL fallback nodes: ' +
      JSON.stringify(summary.sqlFallbackNodeIds),
    CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
    summary.controlSnapshotNodeIds[EMPTY_LIST_LENGTH] || VALUE_UNKNOWN,
    summary.sqlFallbackNodeIds[EMPTY_LIST_LENGTH] || VALUE_UNKNOWN,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH,
      observationCohortState: cohortState,
      observationCohort: summary,
    },
  );
}

export function resolveConsistencyObservationCohort(nodeStates) {
  const allStates = Array.isArray(nodeStates) ? nodeStates : [];
  const controlSnapshotStates = allStates.filter(isControlSnapshotObservation);
  const sqlFallbackStates = allStates.filter(
    (state) => !isControlSnapshotObservation(state),
  );
  const evidence = Object.freeze({
    allStates,
    controlSnapshotStates,
    sqlFallbackStates,
    controlSnapshotCount: controlSnapshotStates.length,
    sqlFallbackCount: sqlFallbackStates.length,
  });
  const decisionTable = Object.freeze([
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_CONTROL_SNAPSHOT,
      match: (candidate) =>
        candidate.controlSnapshotCount >=
        CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
      records: (candidate) => candidate.controlSnapshotStates,
    }),
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_SQL_FALLBACK,
      match: (candidate) =>
        candidate.controlSnapshotCount === EMPTY_LIST_LENGTH &&
        candidate.sqlFallbackCount >=
          CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
      records: (candidate) => candidate.sqlFallbackStates,
    }),
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_MIXED_UNAVAILABLE,
      match: (candidate) =>
        candidate.controlSnapshotCount > EMPTY_LIST_LENGTH &&
        candidate.sqlFallbackCount > EMPTY_LIST_LENGTH,
      mismatch: (candidate, state) =>
        buildMixedObservationModeMismatch(candidate.allStates, state),
    }),
  ]);
  for (const decision of decisionTable) {
    if (decision.match(evidence) !== true) {
      continue;
    }
    return {
      state: decision.state,
      records:
        typeof decision.records === 'function' ?
          decision.records(evidence) :
          [],
      mismatch:
        typeof decision.mismatch === 'function' ?
          decision.mismatch(evidence, decision.state) :
          null,
    };
  }
  return {
    state: CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT,
    records: [],
    mismatch: buildMixedObservationModeMismatch(
      allStates,
      CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT,
    ),
  };
}
