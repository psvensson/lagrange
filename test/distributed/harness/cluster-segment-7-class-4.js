import {CLUSTER_SEGMENT_7_CLASS_SHARED} from './cluster-segment-7-class-shared.js';
import {buildCanonicalPublicationEvidenceFromControlPlane} from
  './publication-evidence-contract.js';

const {
  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_LOAD_PUBLICATION_GATE_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY,
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
  ADMIN_QUERY_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_PROBE,
  CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD,
  CONTROL_SNAPSHOT_NODES_FIELD,
  CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY,
  CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD,
  CONTROL_SNAPSHOT_REVISION_FIELD,
  CONTROL_SNAPSHOT_REVISION_GAP_FIELD,
  CONTROL_SNAPSHOT_REVISION_STATE_FIELD,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  INACTIVE_STATE,
  MIN_TIMEOUT_MS,
  STARTUP_ADMISSION_STATE_BLOCKED,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  ZERO,
  buildPublicationRecoveryGateSnapshot,
  canProjectStartupActiveFromTransientAdmin,
  evaluateLoadPublishedConvergence,
  evaluatePriorityRecoveryCrossServiceInvariants,
  isTimeoutShapedProbeError,
  normalizeDistinctStringArray,
  normalizeProbeError,
  parseFiniteNumberField,
  parseJsonArrayField,
  parseJsonObjectField,
  withTimeout,
} = CLUSTER_SEGMENT_7_CLASS_SHARED;
import {Cluster3} from './cluster-segment-7-class-3.js';

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
const STARTUP_SNAPSHOT_PROJECTION_DECISION_TABLE = Object.freeze([
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
const READINESS_TIMEOUT_FALLBACK_OUTCOME_STATUS = Object.freeze({
  fallbackToStatus: true,
});
const READINESS_TIMEOUT_FALLBACK_OUTCOME_BLOCK = Object.freeze({
  fallbackToStatus: false,
});
const READINESS_TIMEOUT_FALLBACK_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: READINESS_TIMEOUT_FALLBACK_OUTCOME_STATUS,
    matches: (evidence) =>
      evidence.attemptedReadinessProbe === true &&
      evidence.timeoutShaped === true &&
      evidence.readinessMode === CLUSTER_READINESS_MODE_STARTUP,
  }),
]);

function normalizeOptionalString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO ? value : null;
}

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
    loadPublicationGateWitnessSource: loadPublicationGateWitness.source,
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
    loadPublicationGateWitnessSource:
      projectionContext.loadPublicationGateWitnessSource,
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
    reason.startsWith(ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX),
  );
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
    nodeCanonicalActive:
      projectionContext.publishedActiveNodeIds.includes(nodeId) ||
      projectionContext.healthyReadinessNodeIds.includes(nodeId),
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

function normalizeReadinessTimeoutFallbackEvidence({
  attemptedReadinessProbe,
  error,
  readinessMode,
}) {
  return Object.freeze({
    attemptedReadinessProbe: attemptedReadinessProbe === true,
    timeoutShaped: isTimeoutShapedProbeError(error),
    readinessMode,
  });
}

function decideReadinessTimeoutFallback(evidence) {
  const decision = READINESS_TIMEOUT_FALLBACK_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || READINESS_TIMEOUT_FALLBACK_OUTCOME_BLOCK;
}

function buildReadinessTimeoutFallbackReason(error) {
  return ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX +
    String(normalizeProbeError(error));
}

class Cluster4 extends Cluster3 {
  async _probeClusterActiveState(deadline, options = {}) {
    const readinessMode =
      options.mode === CLUSTER_READINESS_MODE_LOAD ?
        CLUSTER_READINESS_MODE_LOAD :
        CLUSTER_READINESS_MODE_STARTUP;
    const nodes = [...this._nodes.values()];
    const nodeDiagnostics = await Promise.all(
      nodes.map(async (node) => {
        const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
        const probeTimeoutMs = Math.min(
          ADMIN_QUERY_TIMEOUT_MS,
          CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
          remainingMs,
        );
        let attemptedReadinessProbe = false;
        const buildStatusProbeResult = async (
          statusReason = null,
          activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY,
        ) => {
          const status = await withTimeout(
            node.getStatus({
              timeoutMs: probeTimeoutMs,
              lane: ADMIN_SOCKET_LANE_PROBE,
            }),
            probeTimeoutMs,
            'Node status probe timed out for ' + node.id,
          );
          const active = this._isNodeActive(status);
          const state = active ?
            ACTIVE_STATE.toLowerCase() :
            this._extractNodeState(status) || INACTIVE_STATE;
          return {
            nodeId: node.id,
            active,
            state,
            phase: null,
            reasons: statusReason ? [statusReason] : [],
            activitySource,
            admissionState:
              status.active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED,
            error: null,
          };
        };
        try {
          let active = false;
          let state = INACTIVE_STATE;
          let phase = null;
          let reasons = [];
          let activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS;
          let admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
          let admissionReason = null;

          const readinessProbeOrder =
            readinessMode === CLUSTER_READINESS_MODE_LOAD ?
              [
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
                  'probeTrafficReadiness',
                ],
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
                  'probeBootstrapReadiness',
                ],
              ] :
              [
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
                  'probeBootstrapReadiness',
                ],
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
                  'probeTrafficReadiness',
                ],
              ];
          let readiness = null;
          for (const [probeSource, probeMethod] of readinessProbeOrder) {
            if (typeof node?.[probeMethod] !== 'function') {
              continue;
            }
            attemptedReadinessProbe = true;
            readiness = await withTimeout(
              node[probeMethod]({
                timeoutMs: probeTimeoutMs,
              }),
              probeTimeoutMs,
              'Node readiness probe timed out for ' + node.id,
            );
            active =
              readiness.status >= HTTP_OK_LOWER &&
              readiness.status <= HTTP_OK_UPPER;
            admissionState =
              active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED;
            admissionReason =
              active === true ?
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK;
            phase =
              typeof readiness.phase === 'string' ? readiness.phase : null;
            reasons = Array.isArray(readiness.reasons) ? readiness.reasons : [];
            if (active) {
              state = ACTIVE_STATE.toLowerCase();
            } else if (
              typeof readiness.state === 'string' &&
              readiness.state.length > 0
            ) {
              state = readiness.state.toLowerCase();
            } else if (phase && phase.length > 0) {
              state = phase.toLowerCase();
            }
            activitySource = probeSource;
            break;
          }
          if (readiness) {
            if (typeof node.getReachabilityDiagnostics === 'function') {
              try {
                const adminDiagnostics = await withTimeout(
                  node.getReachabilityDiagnostics({
                    timeoutMs: probeTimeoutMs,
                  }),
                  probeTimeoutMs,
                  'Node admin readiness probe timed out for ' + node.id,
                );
                if (
                  readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
                  canProjectStartupActiveFromTransientAdmin(
                    readiness,
                    adminDiagnostics,
                  )
                ) {
                  admissionState = STARTUP_ADMISSION_STATE_DEGRADED;
                  admissionReason =
                    ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                  activitySource =
                    ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                  reasons = [...reasons];
                } else if (adminDiagnostics?.adminReady !== true) {
                  active = false;
                  state = INACTIVE_STATE;
                  admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
                  const adminLastError =
                    typeof adminDiagnostics?.lastError === 'string' &&
                    adminDiagnostics.lastError.length > 0 ?
                      adminDiagnostics.lastError :
                      ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
                  admissionReason =
                    ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=' + adminLastError;
                  reasons = [
                    ...reasons,
                    ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=' + adminLastError,
                  ];
                }
              } catch (adminProbeError) {
                active = false;
                state = INACTIVE_STATE;
                reasons = [
                  ...reasons,
                  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
                    normalizeProbeError(adminProbeError),
                ];
              }
            }
          } else {
            const statusResult = await buildStatusProbeResult();
            active = statusResult.active;
            state = statusResult.state;
            phase = statusResult.phase;
            reasons = statusResult.reasons;
            activitySource = statusResult.activitySource;
            admissionState =
              statusResult.active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED;
            admissionReason =
              statusResult.active === true ?
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
                ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
          }

          return {
            nodeId: node.id,
            active,
            state,
            phase,
            reasons,
            activitySource,
            admissionState,
            admissionReason,
            error: null,
          };
        } catch (error) {
          const fallbackEvidence = normalizeReadinessTimeoutFallbackEvidence({
            attemptedReadinessProbe,
            error,
            readinessMode,
          });
          const fallbackDecision =
            decideReadinessTimeoutFallback(fallbackEvidence);
          if (
            fallbackDecision.fallbackToStatus === true &&
            typeof node.getStatus === 'function'
          ) {
            try {
              const timeoutFallbackReason =
                buildReadinessTimeoutFallbackReason(error);
              const fallbackResult = await buildStatusProbeResult(
                timeoutFallbackReason,
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
              );
              return {
                ...fallbackResult,
                admissionReason: timeoutFallbackReason,
              };
            } catch (_fallbackError) {
              // Fall through to explicit error classification below.
            }
          }
          if (
            fallbackEvidence.attemptedReadinessProbe === true &&
            fallbackEvidence.timeoutShaped === true
          ) {
            const timeoutFallbackReason =
              buildReadinessTimeoutFallbackReason(error);
            return {
              nodeId: node.id,
              active: false,
              state: INACTIVE_STATE,
              phase: null,
              reasons: [timeoutFallbackReason],
              activitySource:
                readinessMode === CLUSTER_READINESS_MODE_LOAD ?
                  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS :
                  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
              admissionState: STARTUP_ADMISSION_STATE_BLOCKED,
              admissionReason: timeoutFallbackReason,
              error: normalizeProbeError(error),
            };
          }
          return {
            nodeId: node.id,
            active: false,
            state: INACTIVE_STATE,
            phase: null,
            reasons: [],
            activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
            admissionState: STARTUP_ADMISSION_STATE_BLOCKED,
            admissionReason:
              ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
              String(normalizeProbeError(error)),
            error: normalizeProbeError(error),
          };
        }
      }),
    );
    const snapshotCoverage = await this._probeControlSnapshotCoverage(
      deadline,
      nodes.map((node) => node.id),
      {
        forceRepair: options.forceRepair === true,
        readinessMode,
      },
    );
    const publicationConvergenceGate =
      readinessMode === CLUSTER_READINESS_MODE_LOAD ?
        evaluateLoadPublishedConvergence(
          snapshotCoverage,
          nodes.map((node) => node.id),
        ) :
        {
          ready: true,
          reasons: Object.freeze([]),
        };
    const projectionContext = buildLoadPublicationGateProjectionContext(
      readinessMode,
      snapshotCoverage,
      publicationConvergenceGate,
    );
    const startupProjectionContext = buildStartupSnapshotProjectionContext(
      readinessMode,
      snapshotCoverage,
      publicationConvergenceGate,
    );
    const startupProjectedNodeDiagnostics = nodeDiagnostics.map((diagnostic) =>
      projectStartupSnapshotDiagnostic(diagnostic, startupProjectionContext),
    );
    const projectedNodeDiagnostics = startupProjectedNodeDiagnostics.map(
      (diagnostic) =>
        projectLoadPublicationGateDiagnostic(diagnostic, projectionContext),
    );
    const activeByStatus = projectedNodeDiagnostics.every(
      (diagnostic) => diagnostic.active === true,
    );

    const loadModeConvergedPartialCoverage =
      readinessMode === CLUSTER_READINESS_MODE_LOAD &&
      activeByStatus === true &&
      publicationConvergenceGate.ready === true &&
      snapshotCoverage.completeCoverage !== true &&
      Number.isInteger(snapshotCoverage.bestCoverageNodeCount) &&
      snapshotCoverage.bestCoverageNodeCount > ZERO &&
      !(
        typeof snapshotCoverage.selectedError === 'string' &&
        snapshotCoverage.selectedError.length > ZERO
      );

    const allActive =
      activeByStatus &&
      (snapshotCoverage.completeCoverage === true ||
        loadModeConvergedPartialCoverage) &&
      publicationConvergenceGate.ready === true;
    const priorityRecoveryInvariants =
      evaluatePriorityRecoveryCrossServiceInvariants({
        readinessMode,
        nodeDiagnostics: projectedNodeDiagnostics,
        publicationConvergenceGate,
        allActive,
      });

    return {
      allActive,
      nodeDiagnostics: projectedNodeDiagnostics,
      snapshotCoverage,
      publicationConvergenceGate,
      priorityRecoveryInvariants,
    };
  }

  _extractControlSnapshotNodes(snapshotResult) {
    return this._extractControlSnapshotSummary(snapshotResult).nodes;
  }

  _extractControlSnapshotPayload(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (rows.length === ZERO || !rows[ZERO] || typeof rows[ZERO] !== 'object') {
      return null;
    }
    return rows[ZERO];
  }

  _extractControlSnapshotSummary(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (rows.length === 0) {
      return {
        nodes: [],
        capturedAtMs: null,
        snapshotRevision: null,
        snapshotRevisionState: null,
        snapshotExpectedMinimumRevision: null,
        snapshotRevisionGap: null,
        snapshotResumeToken: null,
      };
    }
    const row = rows[0];
    const controlPlaneDiagnostics =
      row?.controlPlaneDiagnostics &&
      typeof row.controlPlaneDiagnostics === 'object' ?
        row.controlPlaneDiagnostics :
        null;
    const activeNodeViews =
      controlPlaneDiagnostics?.activeNodeViews &&
      typeof controlPlaneDiagnostics.activeNodeViews === 'object' ?
        controlPlaneDiagnostics.activeNodeViews :
        null;
    const nodes = normalizeDistinctStringArray([
      ...parseJsonArrayField(row?.[CONTROL_SNAPSHOT_NODES_FIELD]),
      ...parseJsonArrayField(row?.publishedNodes ?? row?.published_nodes),
      ...parseJsonArrayField(row?.projectedNodes ?? row?.projected_nodes),
      ...parseJsonArrayField(
        row?.suspectedOrTransitioningNodes ??
          row?.suspected_or_transitioning_nodes,
      ),
      ...parseJsonArrayField(activeNodeViews?.authoritativeNodeIds),
      ...parseJsonArrayField(activeNodeViews?.effectiveNodeIds),
      ...parseJsonArrayField(activeNodeViews?.projectedNodeIds),
      ...parseJsonArrayField(activeNodeViews?.publishedNodeIds),
    ]);
    const capturedAtMs =
      parseFiniteNumberField(row?.capturedAtMs) ??
      parseFiniteNumberField(row?.capturedAt);
    const snapshotRevision = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_REVISION_FIELD],
    );
    const snapshotExpectedMinimumRevision = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD],
    );
    const snapshotRevisionGap = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_REVISION_GAP_FIELD],
    );
    const snapshotRevisionState =
      typeof row?.[CONTROL_SNAPSHOT_REVISION_STATE_FIELD] === 'string' &&
      row[CONTROL_SNAPSHOT_REVISION_STATE_FIELD].length > ZERO ?
        row[CONTROL_SNAPSHOT_REVISION_STATE_FIELD] :
        null;
    const snapshotResumeToken =
      typeof row?.[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD] === 'string' &&
      row[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD].length > ZERO ?
        row[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD] :
        null;
    return {
      nodes,
      capturedAtMs,
      snapshotRevision,
      snapshotRevisionState,
      snapshotExpectedMinimumRevision,
      snapshotRevisionGap,
      snapshotResumeToken,
    };
  }

  _summarizeControlSnapshotPublication(publication) {
    if (!publication || typeof publication !== 'object') {
      return null;
    }
    const publishedActiveNodeIds = parseJsonArrayField(
      publication.publishedActiveNodeIds ??
        publication.published_active_node_ids,
    );
    const pendingAckNodeIds = parseJsonArrayField(
      publication.pendingAckNodeIds ?? publication.pending_ack_node_ids,
    );
    const acknowledgedNodeIds = parseJsonArrayField(
      publication.acknowledgedNodeIds ?? publication.acknowledged_node_ids,
    );
    const membershipLifecycleSummaryRaw =
      publication.membershipLifecycleSummary &&
      typeof publication.membershipLifecycleSummary === 'object' ?
        publication.membershipLifecycleSummary :
        publication.membership_lifecycle_summary &&
            typeof publication.membership_lifecycle_summary === 'object' ?
          publication.membership_lifecycle_summary :
          null;
    const projectionDiagnosticsRaw =
      publication.projectionDiagnostics &&
      typeof publication.projectionDiagnostics === 'object' ?
        publication.projectionDiagnostics :
        membershipLifecycleSummaryRaw?.projectionDiagnostics &&
            typeof membershipLifecycleSummaryRaw.projectionDiagnostics ===
              'object' ?
          membershipLifecycleSummaryRaw.projectionDiagnostics :
          null;
    const participationByNodeIdRaw = parseJsonObjectField(
      publication.participationByNodeId ??
        publication.participation_by_node_id ??
        membershipLifecycleSummaryRaw?.participationByNodeId ??
        membershipLifecycleSummaryRaw?.participation_by_node_id,
    );
    const participationByNodeId = participationByNodeIdRaw ?
      Object.keys(participationByNodeIdRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, nodeId) => {
          const normalizedNodeId = String(nodeId || '').trim();
          if (normalizedNodeId.length === ZERO) {
            return accumulator;
          }
          const participation = participationByNodeIdRaw[nodeId];
          accumulator[normalizedNodeId] = {
            state:
                typeof participation?.state === 'string' &&
                participation.state.length > ZERO ?
                  participation.state :
                  null,
            durable: participation?.durable === true,
            publishedActive: participation?.publishedActive === true,
            recoveryActive: participation?.recoveryActive === true,
            projectedServing: participation?.projectedServing === true,
            locallyEligible: participation?.locallyEligible === true,
            suspectedOrTransitioning:
                participation?.suspectedOrTransitioning === true,
            recoverySource:
                typeof participation?.recoverySource === 'string' &&
                participation.recoverySource.length > ZERO ?
                  participation.recoverySource :
                  null,
            reasons: normalizeDistinctStringArray(
              parseJsonArrayField(participation?.reasons),
            ),
          };
          return accumulator;
        }, {}) :
      null;
    const participationStateCountsRaw = parseJsonObjectField(
      publication.participationStateCounts ??
        publication.participation_state_counts ??
        membershipLifecycleSummaryRaw?.participationStateCounts ??
        membershipLifecycleSummaryRaw?.participation_state_counts,
    );
    const participationStateCounts = participationStateCountsRaw ?
      Object.keys(participationStateCountsRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, state) => {
          const normalizedState = String(state || '').trim();
          const count = parseFiniteNumberField(
            participationStateCountsRaw[state],
          );
          if (normalizedState.length === ZERO || count === null) {
            return accumulator;
          }
          accumulator[normalizedState] = count;
          return accumulator;
        }, {}) :
      null;
    const priorityPartitionSummaryRaw =
      publication.priorityPartitionSummary &&
      typeof publication.priorityPartitionSummary === 'object' ?
        publication.priorityPartitionSummary :
        publication.priority_partition_summary &&
            typeof publication.priority_partition_summary === 'object' ?
          publication.priority_partition_summary :
          null;
    const blockedPartitions = parseJsonArrayField(
      priorityPartitionSummaryRaw?.blockedPartitions ??
        priorityPartitionSummaryRaw?.blocked_partitions,
    );
    const missingPartitionIds = parseJsonArrayField(
      priorityPartitionSummaryRaw?.missingPartitionIds ??
        priorityPartitionSummaryRaw?.missing_partition_ids,
    );
    const totalSpreadGap = blockedPartitions.reduce((sum, partition) => {
      const spreadGap = Number.isFinite(partition?.spreadGap) ?
        Math.max(ZERO, Math.floor(partition.spreadGap)) :
        ZERO;
      return sum + spreadGap;
    }, ZERO);
    const largestSpreadGap = blockedPartitions.reduce(
      (largestGap, partition) => {
        const spreadGap = Number.isFinite(partition?.spreadGap) ?
          Math.max(ZERO, Math.floor(partition.spreadGap)) :
          ZERO;
        return Math.max(largestGap, spreadGap);
      },
      ZERO,
    );
    const priorityPartitionSummary = priorityPartitionSummaryRaw ?
      {
        satisfied:
            priorityPartitionSummaryRaw.satisfied === true ?
              true :
              priorityPartitionSummaryRaw.satisfied === false ?
                false :
                null,
        requiredDistinctNodeCount: Number.isFinite(
          priorityPartitionSummaryRaw.requiredDistinctNodeCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(
              priorityPartitionSummaryRaw.requiredDistinctNodeCount,
            ),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.required_distinct_node_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.required_distinct_node_count,
              ),
            ) :
            null,
        readyEligibleNodeCount: Number.isFinite(
          priorityPartitionSummaryRaw.readyEligibleNodeCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(priorityPartitionSummaryRaw.readyEligibleNodeCount),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.ready_eligible_node_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.ready_eligible_node_count,
              ),
            ) :
            null,
        totalPriorityPartitionCount: Number.isFinite(
          priorityPartitionSummaryRaw.totalPriorityPartitionCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(
              priorityPartitionSummaryRaw.totalPriorityPartitionCount,
            ),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.total_priority_partition_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.total_priority_partition_count,
              ),
            ) :
            null,
        missingPartitionIds: missingPartitionIds
          .map((partitionId) => String(partitionId || ''))
          .filter((partitionId) => partitionId.length > ZERO),
        blockedPartitionCount: blockedPartitions.length,
        largestSpreadGap,
        totalSpreadGap,
      } :
      null;
    const projectionDiagnostics = projectionDiagnosticsRaw ?
      {
        readinessDecisionMode:
            typeof projectionDiagnosticsRaw.readinessDecisionMode ===
              'string' &&
            projectionDiagnosticsRaw.readinessDecisionMode.length > ZERO ?
              projectionDiagnosticsRaw.readinessDecisionMode :
              null,
        readinessDecisionDimensions: parseJsonArrayField(
          projectionDiagnosticsRaw.readinessDecisionDimensions,
        )
          .map((dimension) => String(dimension || ''))
          .filter((dimension) => dimension.length > ZERO),
        recoveryEligibleProjectionEnabled:
            projectionDiagnosticsRaw.recoveryEligibleProjectionEnabled === true,
        recoveryEligibleIncludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.recoveryEligibleIncludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        readinessExcludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.readinessExcludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        clusterMemberUnhealthyExcludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.clusterMemberUnhealthyExcludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
      } :
      null;
    const publishedActiveNodeIdsNormalized = publishedActiveNodeIds
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromParticipation = participationByNodeId ?
      Object.entries(participationByNodeId)
        .filter(([, participation]) => participation?.recoveryActive === true)
        .map(([nodeId]) => nodeId) :
      [];
    const recoveryActiveNodeIdsFromPublication = parseJsonArrayField(
      publication.recoveryActiveNodeIds ?? publication.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromLifecycle = parseJsonArrayField(
      membershipLifecycleSummaryRaw?.recoveryActiveNodeIds ??
        membershipLifecycleSummaryRaw?.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIds = normalizeDistinctStringArray(
      recoveryActiveNodeIdsFromParticipation.length > ZERO ?
        recoveryActiveNodeIdsFromParticipation :
        recoveryActiveNodeIdsFromPublication.length > ZERO ?
          recoveryActiveNodeIdsFromPublication :
          recoveryActiveNodeIdsFromLifecycle.length > ZERO ?
            recoveryActiveNodeIdsFromLifecycle :
            parseJsonArrayField(
              membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
            )
              .map((nodeId) => String(nodeId || ''))
              .filter((nodeId) => nodeId.length > ZERO).length > ZERO ?
              parseJsonArrayField(
                membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
              )
                .map((nodeId) => String(nodeId || ''))
                .filter((nodeId) => nodeId.length > ZERO) :
              publishedActiveNodeIdsNormalized,
    );
    const recoveryActiveNodeSourceRaw =
      typeof publication.recoveryActiveNodeSource === 'string' &&
      publication.recoveryActiveNodeSource.length > ZERO ?
        publication.recoveryActiveNodeSource :
        typeof membershipLifecycleSummaryRaw?.recoveryActiveNodeSource ===
              'string' &&
            membershipLifecycleSummaryRaw.recoveryActiveNodeSource.length > ZERO ?
          membershipLifecycleSummaryRaw.recoveryActiveNodeSource :
          null;
    const recoveryActiveNodeSource =
      recoveryActiveNodeSourceRaw ||
      (recoveryActiveNodeIds.length > ZERO ?
        publishedActiveNodeIdsNormalized.length > ZERO &&
          recoveryActiveNodeIds.every((nodeId) =>
            publishedActiveNodeIdsNormalized.includes(nodeId),
          ) ?
          'published_membership' :
          'locally_eligible_projection' :
        null);
    const missingPublishedRecoveryActiveNodeIdsRaw = parseJsonArrayField(
      publication.missingPublishedRecoveryActiveNodeIds ??
        publication.missing_published_recovery_active_node_ids ??
        membershipLifecycleSummaryRaw?.missingPublishedRecoveryActiveNodeIds ??
        membershipLifecycleSummaryRaw?.missing_published_recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const missingPublishedRecoveryActiveNodeIds = normalizeDistinctStringArray(
      missingPublishedRecoveryActiveNodeIdsRaw.length > ZERO ?
        missingPublishedRecoveryActiveNodeIdsRaw :
        recoveryActiveNodeIds.filter(
          (nodeId) => !publishedActiveNodeIdsNormalized.includes(nodeId),
        ),
    );
    const recoveryProtocolState =
      typeof publication.recoveryProtocolState === 'string' &&
      publication.recoveryProtocolState.length > ZERO ?
        publication.recoveryProtocolState :
        typeof membershipLifecycleSummaryRaw?.recoveryProtocolState ===
              'string' &&
            membershipLifecycleSummaryRaw.recoveryProtocolState.length > ZERO ?
          membershipLifecycleSummaryRaw.recoveryProtocolState :
          null;
    const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
      parseJsonArrayField(
        publication.priorityRecoveryReasonCodes ??
          publication.priority_recovery_reason_codes ??
          membershipLifecycleSummaryRaw?.recoveryProtocolReasonCodes ??
          membershipLifecycleSummaryRaw?.recovery_protocol_reason_codes,
      ),
    );
    const publicationRecoveryGateRaw =
      publication.publicationRecoveryGate &&
      typeof publication.publicationRecoveryGate === 'object' ?
        publication.publicationRecoveryGate :
        null;
    const membershipLifecycleSummary = membershipLifecycleSummaryRaw ?
      {
        lifecycleState:
            typeof membershipLifecycleSummaryRaw.lifecycleState === 'string' &&
            membershipLifecycleSummaryRaw.lifecycleState.length > ZERO ?
              membershipLifecycleSummaryRaw.lifecycleState :
              null,
        epochBoundary:
            typeof membershipLifecycleSummaryRaw.epochBoundary === 'string' &&
            membershipLifecycleSummaryRaw.epochBoundary.length > ZERO ?
              membershipLifecycleSummaryRaw.epochBoundary :
              null,
        publishedActiveNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.publishedActiveNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        projectedServingNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.projectedServingNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        locallyEligibleNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.locallyEligibleNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        suspectedOrTransitioningNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.suspectedOrTransitioningNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        recoveryActiveNodeIds,
        recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds,
        projectionDiagnostics,
        ...(participationByNodeId &&
          Object.keys(participationByNodeId).length > ZERO ?
          {
            participationByNodeId,
          } :
          {}),
        ...(participationStateCounts &&
          Object.keys(participationStateCounts).length > ZERO ?
          {
            participationStateCounts,
          } :
          {}),
        ...(typeof recoveryProtocolState === 'string' &&
          recoveryProtocolState.length > ZERO ?
          {
            recoveryProtocolState,
          } :
          {}),
        ...(priorityRecoveryReasonCodes.length > ZERO ?
          {
            recoveryProtocolReasonCodes: priorityRecoveryReasonCodes,
          } :
          {}),
      } :
      null;
    return {
      publicationEpoch:
        parseFiniteNumberField(
          publication.publicationEpoch ?? publication.publication_epoch,
        ) ?? null,
      publicationStatus:
        typeof publication.publicationStatus === 'string' &&
        publication.publicationStatus.length > ZERO ?
          publication.publicationStatus :
          typeof publication.status === 'string' &&
              publication.status.length > ZERO ?
            publication.status :
            null,
      publishedActiveNodeIds: publishedActiveNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      pendingAckNodeIds: pendingAckNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      acknowledgedNodeIds: acknowledgedNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      priorityPartitionSummary,
      membershipLifecycleSummary,
      projectionDiagnostics,
      ...(participationByNodeId &&
      Object.keys(participationByNodeId).length > ZERO ?
        {
          participationByNodeId,
        } :
        {}),
      ...(participationStateCounts &&
      Object.keys(participationStateCounts).length > ZERO ?
        {
          participationStateCounts,
        } :
        {}),
      ...(typeof recoveryProtocolState === 'string' &&
      recoveryProtocolState.length > ZERO ?
        {
          recoveryProtocolState,
        } :
        {}),
      ...(priorityRecoveryReasonCodes.length > ZERO ?
        {
          priorityRecoveryReasonCodes,
        } :
        {}),
      ...(publicationRecoveryGateRaw ?
        {
          publicationRecoveryGate: buildPublicationRecoveryGateSnapshot({
            ...publicationRecoveryGateRaw,
            publicationStatus:
                publicationRecoveryGateRaw.publicationStatus ??
                publication.publicationStatus ??
                publication.status,
            recoveryProtocolState:
                publicationRecoveryGateRaw.recoveryProtocolState ??
                recoveryProtocolState,
            priorityRecoveryReasonCodes:
                publicationRecoveryGateRaw.reasonCodes ??
                priorityRecoveryReasonCodes,
            priorityPartitionSummary:
                publicationRecoveryGateRaw.priorityPartitionSummary ??
                priorityPartitionSummary,
            pendingAckNodeIds:
                publicationRecoveryGateRaw.pendingAckNodeIds ??
                pendingAckNodeIds,
            missingPublishedNodeIds:
                publicationRecoveryGateRaw.missingPublishedNodeIds ??
                missingPublishedRecoveryActiveNodeIds,
          }),
        } :
        {}),
    };
  }

  _extractControlSnapshotCoverageDiagnostics(snapshotResult) {
    const snapshotPayload =
      this._extractControlSnapshotPayload(snapshotResult) || {};
    const controlPlaneDiagnostics =
      snapshotPayload?.controlPlaneDiagnostics &&
      typeof snapshotPayload.controlPlaneDiagnostics === 'object' ?
        snapshotPayload.controlPlaneDiagnostics :
        null;
    const publicationConvergenceGateRaw =
      controlPlaneDiagnostics?.publicationConvergenceGate &&
      typeof controlPlaneDiagnostics.publicationConvergenceGate === 'object' ?
        controlPlaneDiagnostics.publicationConvergenceGate :
        controlPlaneDiagnostics?.publicationConvergence?.publicationRecoveryGate &&
            typeof controlPlaneDiagnostics.publicationConvergence
              .publicationRecoveryGate === 'object' ?
          controlPlaneDiagnostics.publicationConvergence
            .publicationRecoveryGate :
          null;
    const readinessByNodeId =
      controlPlaneDiagnostics?.readinessByNodeId &&
      typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId :
        {};
    const priorityRecoveryDecisionSnapshots =
      controlPlaneDiagnostics?.priorityRecoveryDecisionSnapshots &&
      typeof controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots ===
        'object' ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
          ),
        ) :
        null;
    const priorityRecoveryInvariants =
      controlPlaneDiagnostics?.priorityRecoveryInvariants &&
      typeof controlPlaneDiagnostics.priorityRecoveryInvariants === 'object' ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics.priorityRecoveryInvariants,
          ),
        ) :
        null;
    const logsTable =
      controlPlaneDiagnostics?.logsTable &&
      typeof controlPlaneDiagnostics.logsTable === 'object' ?
        controlPlaneDiagnostics.logsTable :
        null;
    const cdcReplay =
      controlPlaneDiagnostics?.cdcReplay &&
      typeof controlPlaneDiagnostics.cdcReplay === 'object' ?
        controlPlaneDiagnostics.cdcReplay :
        null;
    const controlPlaneOwnerQueueDepth = logsTable ?
      {
        pendingWrites: Number.isFinite(logsTable.pendingWrites) ?
          Math.max(ZERO, Math.floor(logsTable.pendingWrites)) :
          ZERO,
        pendingWriteGrowthCount: Number.isFinite(
          logsTable.pendingWriteGrowthCount,
        ) ?
          Math.max(ZERO, Math.floor(logsTable.pendingWriteGrowthCount)) :
          ZERO,
        retainedBacklogGrowthCount: Number.isFinite(
          logsTable.retainedBacklogGrowthCount,
        ) ?
          Math.max(ZERO, Math.floor(logsTable.retainedBacklogGrowthCount)) :
          ZERO,
        sharedPressureBackpressured:
            logsTable.sharedPressureBackpressured === true,
      } :
      null;
    const cdcReplayLag = cdcReplay ?
      {
        bufferedEvents: Number.isFinite(cdcReplay.bufferedEvents) ?
          Math.max(ZERO, Math.floor(cdcReplay.bufferedEvents)) :
          ZERO,
        replayBufferGrowthCount: Number.isFinite(
          cdcReplay.replayBufferGrowthCount,
        ) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayBufferGrowthCount)) :
          ZERO,
        replayRetryDepth: Number.isFinite(cdcReplay.replayRetryDepth) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayRetryDepth)) :
          ZERO,
        replayInFlightPartitionCount: Number.isFinite(
          cdcReplay.replayInFlightPartitionCount,
        ) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayInFlightPartitionCount)) :
          ZERO,
        partitionCount: Number.isFinite(cdcReplay.partitionCount) ?
          Math.max(ZERO, Math.floor(cdcReplay.partitionCount)) :
          ZERO,
      } :
      null;
    const healthyReadinessNodeIds = Object.entries(readinessByNodeId)
      .filter(([, readiness]) => {
        const dimensions =
          readiness?.dimensions && typeof readiness.dimensions === 'object' ?
            readiness.dimensions :
            null;
        return (
          dimensions?.[
            CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY
          ] === true
        );
      })
      .map(([nodeId]) => String(nodeId))
      .filter((nodeId) => nodeId.length > ZERO)
      .sort();
    const rawPublicationConvergence =
      this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publicationConvergence || null,
      );
    const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate: publicationConvergenceGateRaw,
      priorityRecoveryObservation:
        controlPlaneDiagnostics?.priorityRecoveryObservation || null,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate: controlPlaneDiagnostics?.activeGate || null,
      activeGateProgress: controlPlaneDiagnostics?.activeGateProgress || null,
      activeGateBestProgress:
        controlPlaneDiagnostics?.activeGateBestProgress || null,
      activeGateNoProgress: controlPlaneDiagnostics?.activeGateNoProgress || null,
      activeGateBlockerHistory:
        controlPlaneDiagnostics?.activeGateBlockerHistory || null,
      activeGateAdmissionState:
        controlPlaneDiagnostics?.activeGateAdmissionState || null,
      logsTable,
    });
    const publicationConvergence = publicationEvidence.publicationConvergence;
    const publicationConvergenceGate =
      publicationEvidence.publicationConvergenceGate;
    const priorityRecoveryObservation =
      publicationEvidence.priorityRecoveryObservation;
    return {
      controlPlaneDiagnosticsAvailable: Boolean(controlPlaneDiagnostics),
      publicationConvergence,
      publicationConvergenceGate,
      publishedMembershipObservation: this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publishedMembershipObservation || null,
      ),
      priorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots,
      controlPlaneOwnerQueueDepth,
      cdcReplayLag,
      healthyReadinessNodeIds,
    };
  }
}

export {Cluster4};
