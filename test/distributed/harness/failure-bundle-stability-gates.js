import {FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT} from './failure-bundle-diagnostics-contract-reexport.js';
const {
  ZERO,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  SCENARIO_NAME_FRAGMENT_RESTART,
  isRecord,
  normalizeNonNegativeCount,
  normalizeDistinctStringArray,
  buildStabilityGate,
  hasPublicationMissingActiveNodeBlocker,
  hasBlockingPublicationClosureRecord,
  isStartupReadinessBlocked,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
} = FAILURE_BUNDLE_DIAGNOSTICS_CONTRACT;

function buildRestartRecoveryStabilityGate({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  failure = null,
  logs = null,
}) {
  const scenarioName = String(entry?.scenario || '')
    .trim()
    .toLowerCase();
  const restartBoundaryCount = countRestartBoundaries(logs);
  const hasStartupReadinessBlocker =
    isStartupReadinessBlocked({
      readinessFailure,
      publicationConvergence,
    });
  const startupRecovery = isRecord(controlPlane?.startupRecovery) ?
    controlPlane.startupRecovery :
    null;
  const terminalRecoveryReadiness = isRecord(
    failure?.failureBarrier?.terminalRecoveryReadiness,
  ) ?
    failure.failureBarrier.terminalRecoveryReadiness :
    null;
  const hasAdminReachabilityBlocker =
    terminalRecoveryReadiness?.ownerState ===
      STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED;
  const applicable =
    scenarioName.includes(SCENARIO_NAME_FRAGMENT_RESTART) ||
    restartBoundaryCount > ZERO ||
    !!startupRecovery ||
    hasStartupReadinessBlocker ||
    hasAdminReachabilityBlocker;
  if (!applicable) {
    return buildStabilityGate({
      type: STABILITY_GATE_TYPE_RESTART_RECOVERY,
      status: STABILITY_GATE_STATUS_NOT_APPLICABLE,
      evidence: {
        restartBoundaryCount,
      },
    });
  }
  const blockers = [];
  const hasMissingActiveNodeBlocker =
    hasPublicationMissingActiveNodeBlocker(publicationConvergence);
  const hasBlockingClosureRecord =
    hasBlockingPublicationClosureRecord({
      publicationConvergence,
      readinessFailure,
    });
  if (hasMissingActiveNodeBlocker) {
    blockers.push(STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE);
  }
  if (
    publicationConvergence?.publicationPending === true &&
    hasMissingActiveNodeBlocker !== true
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_PUBLICATION_PENDING);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_BLOCKED_NODES);
  }
  if (publicationConvergence?.prioritySpreadPending === true) {
    blockers.push(STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING);
  }
  if (
    (hasStartupReadinessBlocker &&
      (
        hasMissingActiveNodeBlocker !== true ||
        hasBlockingClosureRecord === true
      )) ||
    startupRecovery?.recoveryBlocked === true
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (hasAdminReachabilityBlocker) {
    blockers.push(STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED);
  }
  if (hasBlockingClosureRecord) {
    blockers.push(STABILITY_GATE_BLOCKER_CLOSURE_RECORD);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_RESTART_RECOVERY,
    status:
      blockers.length > ZERO ?
        STABILITY_GATE_STATUS_OPEN :
        STABILITY_GATE_STATUS_CLOSED,
    blockers,
    evidence: {
      restartBoundaryCount,
      recoveryBlocked: startupRecovery?.recoveryBlocked === true,
      recoveryStage: startupRecovery?.recoveryStage || null,
      pendingAckCount: normalizeNonNegativeCount(
        publicationConvergence?.pendingAckCount,
      ),
      blockedNodeCount: normalizeNonNegativeCount(
        publicationConvergence?.blockedNodeCount,
      ),
      missingPublishedCount: normalizeNonNegativeCount(
        publicationConvergence?.missingPublishedCount,
      ),
      missingPublishedNodeIds: normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedNodeIds,
      ),
      prioritySpreadPending:
        publicationConvergence?.prioritySpreadPending === true,
      closureRecordId: publicationConvergence?.closureRecordId || null,
      closureWitnessClass: publicationConvergence?.closureWitnessClass || null,
      readinessMode: readinessFailure?.mode || null,
      terminalRecoveryReadiness,
    },
  });
}

function buildStabilityGates({
  entry,
  controlPlane = null,
  publicationConvergence = null,
  readinessFailure = null,
  recoveryReadiness = null,
  failure = null,
  logs = null,
}) {
  return {
    [STABILITY_GATE_TYPE_FAILOVER]: buildFailoverStabilityGate({
      publicationConvergence,
      readinessFailure,
      recoveryReadiness,
    }),
    [STABILITY_GATE_TYPE_CONVERGENCE]: buildConvergenceStabilityGate({
      publicationConvergence,
      readinessFailure,
      controlPlane,
    }),
    [STABILITY_GATE_TYPE_RESTART_RECOVERY]: buildRestartRecoveryStabilityGate({
      entry,
      controlPlane,
      publicationConvergence,
      readinessFailure,
      failure,
      logs,
    }),
  };
}

export {
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
};
