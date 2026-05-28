const FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD = 'queryEngineAvailable';
const FAILURE_BUNDLE_QUERY_ENGINE_AVAILABILITY_FIELD =
  'queryEngineAvailability';
const FAILURE_BUNDLE_OBJECT_TYPE = 'object';
const FAILURE_BUNDLE_BOOLEAN_TYPE = 'boolean';

export const FAILURE_BUNDLE_NO_ARTIFACT = null;
export const FAILURE_BUNDLE_NO_PUBLICATION_MEMBERSHIP_NODE_IDS = null;
export const FAILURE_BUNDLE_NO_PUBLICATION_CONVERGENCE_SUMMARY = null;
export const FAILURE_BUNDLE_EMPTY_BLOCKED_NODE_IDS = Object.freeze([]);

function isSqlQueryEngineFieldRecord(value) {
  return value !== null &&
    typeof value === FAILURE_BUNDLE_OBJECT_TYPE &&
    !Array.isArray(value);
}

function normalizeSqlQueryEngineFields(source = null) {
  if (!isSqlQueryEngineFieldRecord(source)) {
    return null;
  }
  const queryEngineAvailability =
    source[FAILURE_BUNDLE_QUERY_ENGINE_AVAILABILITY_FIELD];
  if (isSqlQueryEngineFieldRecord(queryEngineAvailability)) {
    const queryEngineAvailable = Boolean(
      queryEngineAvailability[FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD] ===
        true,
    );
    return {
      [FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD]: queryEngineAvailable,
      [FAILURE_BUNDLE_QUERY_ENGINE_AVAILABILITY_FIELD]: {
        ...queryEngineAvailability,
        [FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD]: queryEngineAvailable,
      },
    };
  }
  if (
    typeof source[FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD] ===
      FAILURE_BUNDLE_BOOLEAN_TYPE
  ) {
    return {
      [FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD]:
        source[FAILURE_BUNDLE_QUERY_ENGINE_AVAILABLE_FIELD] === true,
    };
  }
  return null;
}

export function resolveSqlFields(
  controlPlane,
  activeGate,
  publicationConvergence,
  publicationConvergenceGate,
) {
  const activeGateSnapshotCoverage =
    isSqlQueryEngineFieldRecord(controlPlane?.activeGateSnapshotCoverage) ?
      controlPlane.activeGateSnapshotCoverage :
      null;
  const sources = [
    publicationConvergence,
    controlPlane?.publicationConvergence,
    publicationConvergenceGate,
    controlPlane?.publicationConvergenceGate,
    activeGate?.progress,
    activeGate?.bestProgress,
    activeGateSnapshotCoverage?.selectedPublicationConvergence,
    activeGateSnapshotCoverage?.selectedPublishedMembershipObservation,
    activeGateSnapshotCoverage,
  ];
  for (const source of sources) {
    const queryEngineAvailability = normalizeSqlQueryEngineFields(source);
    if (queryEngineAvailability !== null) {
      return queryEngineAvailability;
    }
  }
  return {};
}
