import {CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME} from
  '../control-plane/control-plane-error-classification.js';

const CONTROL_SNAPSHOT_QUERY_RESULT_ROW_INDEX = 0;
const CONTROL_SNAPSHOT_QUERY_RESULT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_QUERY_RESULT_CONTROL_PLANE_CONVERGENCE_FIELD =
  'controlPlaneConvergence';
const CONTROL_SNAPSHOT_QUERY_RESULT_CRITICAL_CONVERGENCE_DEFERRED_FIELD =
  'criticalConvergenceDeferred';
const CONTROL_SNAPSHOT_QUERY_RESULT_PRESSURE_OUTCOME_FIELD =
  'pressureOutcome';

const isCriticalConvergenceDeferred = (pressureOutcome) =>
  pressureOutcome ===
    CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED ||
  pressureOutcome === CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;

const resolveControlSnapshotConvergence = (snapshot) =>
  snapshot?.[
    CONTROL_SNAPSHOT_QUERY_RESULT_CONTROL_PLANE_DIAGNOSTICS_FIELD
  ]?.[CONTROL_SNAPSHOT_QUERY_RESULT_CONTROL_PLANE_CONVERGENCE_FIELD];

const resolveControlSnapshotPressureOutcome = (convergence) =>
  convergence?.[CONTROL_SNAPSHOT_QUERY_RESULT_PRESSURE_OUTCOME_FIELD];

/**
 * Normalize control-snapshot query result convergence metadata.
 * @param {Object} result
 * @return {Object}
 */
const resolveControlSnapshotQueryResult = (result = null) => {
  const snapshot = Array.isArray(result?.rows) ?
    result.rows[CONTROL_SNAPSHOT_QUERY_RESULT_ROW_INDEX] :
    null;
  const convergence = resolveControlSnapshotConvergence(snapshot);
  if (!convergence || typeof convergence !== 'object') {
    return result;
  }

  const pressureOutcome =
    resolveControlSnapshotPressureOutcome(convergence);
  return {
    ...result,
    [CONTROL_SNAPSHOT_QUERY_RESULT_CONTROL_PLANE_CONVERGENCE_FIELD]:
      convergence,
    [CONTROL_SNAPSHOT_QUERY_RESULT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
      isCriticalConvergenceDeferred(pressureOutcome),
  };
};

export {resolveControlSnapshotQueryResult};
