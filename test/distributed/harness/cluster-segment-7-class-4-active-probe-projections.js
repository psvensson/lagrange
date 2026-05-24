import {CLUSTER_SEGMENT_7_CLASS_SHARED} from './cluster-segment-7-class-shared.js';
import {isStartupAdminReachabilityTransientError} from
  './startup-readiness-evidence.js';
import {
  decideSelectedSnapshotTimeoutOwnerRecoveryProjection,
  normalizeOptionalString,
  normalizeSelectedSnapshotTimeoutOwnerRecoveryEvidence,
} from './cluster-segment-7-class-4-publication-coverage.js';

const {
  ACTIVE_PROBE_ACTIVITY_SOURCE_LOAD_PUBLICATION_GATE_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_SNAPSHOT_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
  ACTIVE_PROBE_REASON_ADMIN_NOT_READY,
  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX,
  ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ACTIVE_PROBE_REASON_LOAD_PUBLICATION_GATE_READY,
  ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING,
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
  ACTIVE_PROBE_REASON_STARTUP_SNAPSHOT_READY,
  ACTIVE_STATE,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  ZERO,
  isTimeoutShapedProbeError,
  normalizeDistinctStringArray,
} = CLUSTER_SEGMENT_7_CLASS_SHARED;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const EMPTY_STRING = '';
const LOAD_PUBLICATION_GATE_WITNESS_READY = 'ready';
const LOAD_PUBLICATION_GATE_WITNESS_CANONICAL_SNAPSHOT =
  'canonical_snapshot';
const LOAD_PUBLICATION_GATE_WITNESS_UNAVAILABLE = 'unavailable';
const ACTIVE_PROBE_REASON_OBSERVABILITY_BACKLOG = 'OBSERVABILITY_BACKLOG';
const ACTIVE_PROBE_REASON_READINESS_STABLE_WINDOW_PENDING =
  'READINESS_STABLE_WINDOW_PENDING';
const ACTIVE_PROBE_REASON_READINESS_TIMEOUT_PREFIX =
  'readiness_probe_timeout=';
const LOAD_PUBLICATION_GATE_PROJECTABLE_TRAFFIC_REASONS = new Set([
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING,
  ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ACTIVE_PROBE_REASON_OBSERVABILITY_BACKLOG,
  ACTIVE_PROBE_REASON_READINESS_STABLE_WINDOW_PENDING,
]);
const LOAD_PUBLICATION_GATE_PROJECTION_OUTCOME_KEEP = Object.freeze({
  project: false,
});
const LOAD_PUBLICATION_GATE_PROJECTION_OUTCOME_APPLY = Object.freeze({
  project: true,
  active: true,
  activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_LOAD_PUBLICATION_GATE_PROJECTION,
  admissionState: STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  admissionReason: ACTIVE_PROBE_REASON_LOAD_PUBLICATION_GATE_READY,
});
const LOAD_PUBLICATION_GATE_PROJECTION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: LOAD_PUBLICATION_GATE_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete === true &&
      evidence.loadPublicationGateWitnessUsable === true &&
      evidence.diagnosticActive !== true &&
      evidence.diagnosticErrorPresent !== true &&
      evidence.diagnosticActivitySource ===
        ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
      evidence.reasonCount > ZERO &&
      evidence.projectableReasonSetComplete === true,
  }),
  Object.freeze({
    outcome: LOAD_PUBLICATION_GATE_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete === true &&
      evidence.loadPublicationGateWitnessUsable === true &&
      evidence.diagnosticActive !== true &&
      evidence.timeoutShaped === true &&
      evidence.diagnosticActivitySource ===
        ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
      evidence.nodeCanonicalActive === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
]);
const STARTUP_SNAPSHOT_PROJECTION_OUTCOME_KEEP = Object.freeze({
  project: false,
});
const STARTUP_SNAPSHOT_PROJECTION_OUTCOME_APPLY = Object.freeze({
  project: true,
  active: true,
  activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_SNAPSHOT_PROJECTION,
  admissionState: STARTUP_ADMISSION_STATE_DEGRADED,
  admissionReason: ACTIVE_PROBE_REASON_STARTUP_SNAPSHOT_READY,
});
const STARTUP_ADMIN_AVAILABILITY_SUPPORT_OUTCOME_KEEP = Object.freeze({
  project: false,
});
const STARTUP_ADMIN_AVAILABILITY_SUPPORT_OUTCOME_APPLY = Object.freeze({
  project: true,
  active: true,
  activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
  admissionState: STARTUP_ADMISSION_STATE_DEGRADED,
  admissionReason: ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
});
const STARTUP_SNAPSHOT_PROJECTION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: STARTUP_SNAPSHOT_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.diagnosticActive !== true &&
      (
        evidence.timeoutShaped === true ||
        evidence.adminProbeTimeoutShaped === true
      ) &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotTimeoutOwnerRecoveryProjectionReady === true &&
      evidence.nodeSelectedOwnerRecoveryObserved === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
  Object.freeze({
    outcome: STARTUP_SNAPSHOT_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.diagnosticActive !== true &&
      (
        evidence.timeoutShaped === true ||
        evidence.adminProbeTimeoutShaped === true
      ) &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotTimeoutOwnerRecoveryProjectionReady === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
  Object.freeze({
    outcome: STARTUP_SNAPSHOT_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.diagnosticActive !== true &&
      evidence.timeoutShaped === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.snapshotWitnessClean === true &&
      evidence.nodeSelectedSnapshotObserved === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
  Object.freeze({
    outcome: STARTUP_SNAPSHOT_PROJECTION_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.diagnosticActive !== true &&
      evidence.timeoutShaped === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete === true &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.snapshotWitnessClean === true &&
      evidence.nodeCanonicalActive === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
]);
const STARTUP_ADMIN_AVAILABILITY_SUPPORT_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: STARTUP_ADMIN_AVAILABILITY_SUPPORT_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
      evidence.diagnosticActive !== true &&
      evidence.adminAvailabilityTransient === true &&
      evidence.publicationGateReady === true &&
      evidence.snapshotCoverageComplete !== true &&
      evidence.selectedSnapshotAdminReady === true &&
      evidence.selectedSnapshotTimeoutOwnerRecoveryProjectionReady === true &&
      evidence.nodeCanonicalActive === true &&
      evidence.nodePublicationDisagreementCount === ZERO,
  }),
]);

function hasSnapshotPublicationDiagnostics(snapshotCoverage) {
  return (
    snapshotCoverage?.selectedControlPlaneDiagnosticsAvailable === true ||
    (
      snapshotCoverage?.selectedPublicationConvergence &&
      typeof snapshotCoverage.selectedPublicationConvergence === TYPEOF_OBJECT
    ) ||
    (
      snapshotCoverage?.selectedPublicationConvergenceGate &&
      typeof snapshotCoverage.selectedPublicationConvergenceGate ===
        TYPEOF_OBJECT
    )
  );
}

function normalizeLoadPublicationGateWitness(snapshotCoverage, gateReady) {
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true ||
    snapshotCoverage?.selectedSnapshotAdminReady === true;
  if (selectedSnapshotAdminReady) {
    return Object.freeze({
      usable: true,
      source: LOAD_PUBLICATION_GATE_WITNESS_READY,
    });
  }
  const selectedError = normalizeOptionalString(snapshotCoverage?.selectedError);
  const selectedReachabilityError = normalizeOptionalString(
    snapshotCoverage?.selectedReachabilityError ??
      snapshotCoverage?.selectedSnapshotReachabilityError,
  );
  const reachabilityProbeTolerable =
    selectedReachabilityError === null ||
    isTimeoutShapedProbeError(selectedReachabilityError);
  const snapshotDiagnosticsAvailable =
    hasSnapshotPublicationDiagnostics(snapshotCoverage);
  const usable =
    gateReady === true &&
    snapshotCoverage?.completeCoverage === true &&
    snapshotDiagnosticsAvailable === true &&
    selectedError === null &&
    reachabilityProbeTolerable === true;
  return Object.freeze({
    usable,
    source:
      usable === true ?
        LOAD_PUBLICATION_GATE_WITNESS_CANONICAL_SNAPSHOT :
        LOAD_PUBLICATION_GATE_WITNESS_UNAVAILABLE,
  });
}

function buildLoadPublicationGateProjectionContext(
  readinessMode,
  snapshotCoverage,
  publicationConvergenceGate,
) {
  const publicationDisagreementByNodeId =
    snapshotCoverage?.publicationDisagreementByNodeId &&
    typeof snapshotCoverage.publicationDisagreementByNodeId === TYPEOF_OBJECT &&
    Array.isArray(snapshotCoverage.publicationDisagreementByNodeId) !== true ?
      snapshotCoverage.publicationDisagreementByNodeId :
      {};
  const publicationGateReady = publicationConvergenceGate?.ready === true;
  const loadPublicationGateWitness = normalizeLoadPublicationGateWitness(
    snapshotCoverage,
    publicationGateReady,
  );
  return Object.freeze({
    readinessMode,
    publicationGateReady,
    snapshotCoverageComplete: snapshotCoverage?.completeCoverage === true,
    selectedSnapshotAdminReady:
      snapshotCoverage?.selectedAdminReady === true ||
      snapshotCoverage?.selectedSnapshotAdminReady === true,
    loadPublicationGateWitnessUsable:
      loadPublicationGateWitness.usable === true,
    loadPublicationGateDecisionSource: loadPublicationGateWitness.source,
    publishedActiveNodeIds: normalizeDistinctStringArray(
      snapshotCoverage?.selectedPublishedActiveNodeIds,
    ),
    healthyReadinessNodeIds: normalizeDistinctStringArray(
      snapshotCoverage?.selectedHealthyReadinessNodeIds,
    ),
    publicationDisagreementByNodeId,
  });
}

function normalizeLoadPublicationGateProjectionEvidence(
  diagnostic,
  projectionContext,
) {
  const nodeId = String(diagnostic?.nodeId || EMPTY_STRING).trim();
  const publicationDisagreements = Array.isArray(
    projectionContext.publicationDisagreementByNodeId?.[nodeId],
  ) ?
    projectionContext.publicationDisagreementByNodeId[nodeId] :
    [];
  const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
  const diagnosticErrorPresent =
    typeof diagnostic?.error === 'string' &&
    diagnostic.error.length > ZERO;
  return Object.freeze({
    readinessMode: projectionContext.readinessMode,
    publicationGateReady: projectionContext.publicationGateReady === true,
    snapshotCoverageComplete:
      projectionContext.snapshotCoverageComplete === true,
    selectedSnapshotAdminReady:
      projectionContext.selectedSnapshotAdminReady === true,
    loadPublicationGateWitnessUsable:
      projectionContext.loadPublicationGateWitnessUsable === true,
    loadPublicationGateDecisionSource:
      projectionContext.loadPublicationGateDecisionSource,
    diagnosticActive: diagnostic?.active === true,
    diagnosticErrorPresent,
    diagnosticActivitySource: diagnostic?.activitySource,
    timeoutShaped: hasDiagnosticReadinessTimeoutSignal(diagnostic),
    nodeCanonicalActive:
      projectionContext.publishedActiveNodeIds.includes(nodeId) ||
      projectionContext.healthyReadinessNodeIds.includes(nodeId),
    nodePublicationDisagreementCount: normalizeDistinctStringArray(
      publicationDisagreements,
    ).length,
    reasonCount: reasons.length,
    projectableReasonSetComplete:
      reasons.length > ZERO &&
      reasons.every((reason) =>
        LOAD_PUBLICATION_GATE_PROJECTABLE_TRAFFIC_REASONS.has(reason),
      ),
  });
}

function decideLoadPublicationGateProjection(evidence) {
  const decision = LOAD_PUBLICATION_GATE_PROJECTION_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || LOAD_PUBLICATION_GATE_PROJECTION_OUTCOME_KEEP;
}

function projectLoadPublicationGateDiagnostic(diagnostic, projectionContext) {
  const evidence = normalizeLoadPublicationGateProjectionEvidence(
    diagnostic,
    projectionContext,
  );
  const outcome = decideLoadPublicationGateProjection(evidence);
  if (outcome.project !== true) {
    return diagnostic;
  }
  return {
    ...diagnostic,
    active: outcome.active,
    state: ACTIVE_STATE.toLowerCase(),
    reasons: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(diagnostic?.reasons),
      outcome.admissionReason,
    ]),
    activitySource: outcome.activitySource,
    admissionState: outcome.admissionState,
    admissionReason: outcome.admissionReason,
    sourceError: diagnostic?.error || null,
    error: null,
  };
}

function buildStartupSnapshotProjectionContext(
  readinessMode,
  snapshotCoverage,
  publicationConvergenceGate,
) {
  const selectedError =
    typeof snapshotCoverage?.selectedError === TYPEOF_STRING &&
    snapshotCoverage.selectedError.length > ZERO ?
      snapshotCoverage.selectedError :
      null;
  const selectedReachabilityError =
    typeof snapshotCoverage?.selectedReachabilityError === TYPEOF_STRING &&
    snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const publicationDisagreementByNodeId =
    snapshotCoverage?.publicationDisagreementByNodeId &&
    typeof snapshotCoverage.publicationDisagreementByNodeId === TYPEOF_OBJECT &&
    Array.isArray(snapshotCoverage.publicationDisagreementByNodeId) !== true ?
      snapshotCoverage.publicationDisagreementByNodeId :
      {};
  const selectedTimeoutOwnerRecoveryEvidence =
    normalizeSelectedSnapshotTimeoutOwnerRecoveryEvidence(snapshotCoverage);
  const selectedTimeoutOwnerRecoveryOutcome =
    decideSelectedSnapshotTimeoutOwnerRecoveryProjection(
      selectedTimeoutOwnerRecoveryEvidence,
    );
  return Object.freeze({
    readinessMode,
    publicationGateReady: publicationConvergenceGate?.ready === true,
    snapshotCoverageComplete: snapshotCoverage?.completeCoverage === true,
    selectedSnapshotAdminReady:
      snapshotCoverage?.selectedAdminReady === true ||
      snapshotCoverage?.selectedSnapshotAdminReady === true,
    snapshotWitnessClean:
      selectedError === null && selectedReachabilityError === null,
    publishedActiveNodeIds: normalizeDistinctStringArray(
      snapshotCoverage?.selectedPublishedActiveNodeIds,
    ),
    selectedObservedNodeIds: normalizeDistinctStringArray(
      snapshotCoverage?.selectedObservedNodeIds,
    ),
    selectedTimeoutOwnerRecoveryProjectionReady:
      selectedTimeoutOwnerRecoveryOutcome.project === true,
    selectedTimeoutOwnerRecoveryNodeIds:
      selectedTimeoutOwnerRecoveryEvidence.pendingRecoveryNodeIds,
    healthyReadinessNodeIds: normalizeDistinctStringArray(
      snapshotCoverage?.selectedHealthyReadinessNodeIds,
    ),
    publicationDisagreementByNodeId,
  });
}

function hasDiagnosticReadinessTimeoutSignal(diagnostic) {
  if (isTimeoutShapedProbeError(diagnostic?.error)) {
    return true;
  }
  return normalizeDistinctStringArray(diagnostic?.reasons).some((reason) =>
    reason.startsWith(ACTIVE_PROBE_REASON_READINESS_TIMEOUT_PREFIX) ||
      reason.startsWith(ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX),
  );
}

function hasDiagnosticAdminProbeTimeoutSignal(diagnostic) {
  return normalizeDistinctStringArray(diagnostic?.reasons).some((reason) => {
    if (!reason.startsWith(ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX)) {
      return false;
    }
    return isTimeoutShapedProbeError(
      reason.slice(ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX.length),
    );
  });
}

function hasDiagnosticTransientAdminAvailabilitySignal(diagnostic) {
  return normalizeDistinctStringArray(diagnostic?.reasons).some((reason) => {
    const adminNotReadyPrefix =
      ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=';
    if (!reason.startsWith(adminNotReadyPrefix)) {
      return false;
    }
    return isStartupAdminReachabilityTransientError(
      reason.slice(adminNotReadyPrefix.length),
    );
  });
}

function normalizeStartupSnapshotProjectionEvidence(
  diagnostic,
  projectionContext,
) {
  const nodeId = String(diagnostic?.nodeId || EMPTY_STRING).trim();
  const publicationDisagreements = Array.isArray(
    projectionContext.publicationDisagreementByNodeId?.[nodeId],
  ) ?
    projectionContext.publicationDisagreementByNodeId[nodeId] :
    [];
  return Object.freeze({
    readinessMode: projectionContext.readinessMode,
    publicationGateReady: projectionContext.publicationGateReady === true,
    snapshotCoverageComplete:
      projectionContext.snapshotCoverageComplete === true,
    selectedSnapshotAdminReady:
      projectionContext.selectedSnapshotAdminReady === true,
    snapshotWitnessClean: projectionContext.snapshotWitnessClean === true,
    diagnosticActive: diagnostic?.active === true,
    timeoutShaped: hasDiagnosticReadinessTimeoutSignal(diagnostic),
    adminProbeTimeoutShaped: hasDiagnosticAdminProbeTimeoutSignal(diagnostic),
    adminAvailabilityTransient:
      hasDiagnosticTransientAdminAvailabilitySignal(diagnostic),
    nodeCanonicalActive:
      projectionContext.publishedActiveNodeIds.includes(nodeId) ||
      projectionContext.healthyReadinessNodeIds.includes(nodeId),
    nodeSelectedSnapshotObserved:
      projectionContext.selectedObservedNodeIds.includes(nodeId),
    selectedSnapshotTimeoutOwnerRecoveryProjectionReady:
      projectionContext.selectedTimeoutOwnerRecoveryProjectionReady === true,
    nodeSelectedOwnerRecoveryObserved:
      projectionContext.selectedTimeoutOwnerRecoveryNodeIds.includes(nodeId),
    nodePublicationDisagreementCount: normalizeDistinctStringArray(
      publicationDisagreements,
    ).length,
  });
}

function decideStartupSnapshotProjection(evidence) {
  const decision = STARTUP_SNAPSHOT_PROJECTION_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || STARTUP_SNAPSHOT_PROJECTION_OUTCOME_KEEP;
}

function decideStartupAdminAvailabilitySupport(evidence) {
  const decision =
    STARTUP_ADMIN_AVAILABILITY_SUPPORT_DECISION_TABLE.find((candidate) =>
      candidate.matches(evidence),
    );
  return decision?.outcome ||
    STARTUP_ADMIN_AVAILABILITY_SUPPORT_OUTCOME_KEEP;
}

function projectStartupSnapshotDiagnostic(diagnostic, projectionContext) {
  const evidence = normalizeStartupSnapshotProjectionEvidence(
    diagnostic,
    projectionContext,
  );
  const outcome = decideStartupSnapshotProjection(evidence);
  if (outcome.project !== true) {
    return diagnostic;
  }
  return {
    ...diagnostic,
    active: outcome.active,
    state: ACTIVE_STATE.toLowerCase(),
    reasons: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(diagnostic?.reasons),
      outcome.admissionReason,
    ]),
    activitySource: outcome.activitySource,
    admissionState: outcome.admissionState,
    admissionReason: outcome.admissionReason,
    sourceError: diagnostic?.error || null,
    error: null,
  };
}

function projectStartupAdminAvailabilityDiagnostic(
  diagnostic,
  projectionContext,
) {
  const evidence = normalizeStartupSnapshotProjectionEvidence(
    diagnostic,
    projectionContext,
  );
  const outcome = decideStartupAdminAvailabilitySupport(evidence);
  if (outcome.project !== true) {
    return diagnostic;
  }
  return {
    ...diagnostic,
    active: outcome.active,
    state: ACTIVE_STATE.toLowerCase(),
    reasons: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(diagnostic?.reasons),
      outcome.admissionReason,
    ]),
    activitySource: outcome.activitySource,
    admissionState: outcome.admissionState,
    admissionReason: outcome.admissionReason,
    sourceError: diagnostic?.error || null,
    error: null,
  };
}

export {
  buildLoadPublicationGateProjectionContext,
  buildStartupSnapshotProjectionContext,
  projectLoadPublicationGateDiagnostic,
  projectStartupAdminAvailabilityDiagnostic,
  projectStartupSnapshotDiagnostic,
};
