import * as foundation from './failure-bundle-diagnostics-foundation.js';
import * as diagnostics from './failure-bundle-diagnostics-merge.js';
import * as priority from './failure-bundle-diagnostics-priority-recovery.js';
import * as artifact from './failure-bundle-diagnostics-artifact-builder.js';

const {
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
  EMPTY_STRING,
  JS_OBJECT_TYPE,
  ONE,
  READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE,
  READINESS_DIMENSION_REPAIR_ELIGIBLE,
  READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING,
  READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY,
  READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING,
  READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING,
  hasOpenPublicationOrPriorityRecoveryBlocker,
  hasPublicationMissingActiveNodeBlocker,
} = Object.assign({}, foundation, diagnostics, priority, artifact);
const {
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_FAILOVER,
  ZERO,
  hasBlockingReadinessFailure,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
} = foundation;

export function collectReadinessReasonCodes(readinessSnapshot) {
  const reasons = Array.isArray(readinessSnapshot?.reasons) ?
    readinessSnapshot.reasons :
    [];
  return reasons
    .map((reason) => String(reason?.code || EMPTY_STRING).trim())
    .filter((reason) => reason.length > ZERO);
}

export function buildRecoveryReadinessSummary({
  controlPlane = null,
  nodeDiagnostics = null,
} = {}) {
  const routingDimensionCounts = {};
  const repairRoutedNodeIds = [];
  const recoveryRoutedNodeIds = [];
  for (const [nodeId, nodeDiagnostic] of Object.entries(
    nodeDiagnostics || {},
  )) {
    const decisionDimension = String(
      nodeDiagnostic?.routingDiagnostics?.routingReadinessDimension ||
        EMPTY_STRING,
    ).trim();
    if (decisionDimension.length === ZERO) {
      continue;
    }
    routingDimensionCounts[decisionDimension] =
      (routingDimensionCounts[decisionDimension] || ZERO) + ONE;
    if (decisionDimension === READINESS_DIMENSION_REPAIR_ELIGIBLE) {
      repairRoutedNodeIds.push(nodeId);
    } else if (
      decisionDimension ===
        READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      recoveryRoutedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIds = [];
  const writeUnhealthyNodeIds = [];
  const publicationBlockedNodeIds = [];
  const readinessByNodeId =
    controlPlane?.readinessByNodeId &&
    typeof controlPlane.readinessByNodeId === JS_OBJECT_TYPE ?
      controlPlane.readinessByNodeId :
      {};

  for (const [nodeId, readiness] of Object.entries(readinessByNodeId)) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === JS_OBJECT_TYPE ?
        readiness.dimensions :
        {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible = dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      recoveryOnlyNodeIds.push(nodeId);
    }

    const reasonCodes = collectReadinessReasonCodes(readiness);
    if (reasonCodes.includes(READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY)) {
      writeUnhealthyNodeIds.push(nodeId);
    }
    if (
      reasonCodes.includes(
        READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING,
      ) ||
      reasonCodes.includes(READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING) ||
      reasonCodes.includes(READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING)
    ) {
      publicationBlockedNodeIds.push(nodeId);
    }
  }

  const recoveryOnlyNodeIdSet = new Set(recoveryOnlyNodeIds);
  const repairRoutedRecoveryOnlyNodeIds = repairRoutedNodeIds.filter((nodeId) =>
    recoveryOnlyNodeIdSet.has(nodeId),
  );
  const publicationConvergence =
    controlPlane?.publicationConvergence &&
    typeof controlPlane.publicationConvergence === 'object' ?
      controlPlane.publicationConvergence :
      null;
  const pendingAckNodeIds = Array.isArray(
    publicationConvergence?.pendingAckNodeIds,
  ) ?
    publicationConvergence.pendingAckNodeIds :
    [];
  const pendingAckRecoveryOnlyNodeIds = [];
  const pendingAckRepairEligibleNodeIds = [];
  const pendingAckBlockedNodeIds = [];
  for (const nodeId of pendingAckNodeIds) {
    const readiness = readinessByNodeId[nodeId];
    if (!readiness || typeof readiness !== JS_OBJECT_TYPE) {
      pendingAckBlockedNodeIds.push(nodeId);
      continue;
    }
    const dimensions =
      readiness.dimensions && typeof readiness.dimensions === JS_OBJECT_TYPE ?
        readiness.dimensions :
        {};
    const repairEligible = dimensions.repairEligible === true;
    const recoveryEligible = dimensions.controlPlaneRecoveryEligible === true;
    if (recoveryEligible && !repairEligible) {
      pendingAckRecoveryOnlyNodeIds.push(nodeId);
      continue;
    }
    if (repairEligible) {
      pendingAckRepairEligibleNodeIds.push(nodeId);
      continue;
    }
    pendingAckBlockedNodeIds.push(nodeId);
  }

  if (
    Object.keys(routingDimensionCounts).length === ZERO &&
    recoveryOnlyNodeIds.length === ZERO &&
    writeUnhealthyNodeIds.length === ZERO &&
    publicationBlockedNodeIds.length === ZERO &&
    pendingAckNodeIds.length === ZERO
  ) {
    return null;
  }

  return {
    routingDimensionCounts,
    repairRoutedNodeIds,
    recoveryRoutedNodeIds,
    recoveryOnlyNodeIds,
    repairRoutedRecoveryOnlyNodeIds,
    writeUnhealthyNodeIds,
    publicationBlockedNodeIds,
    pendingAckNodeIds,
    pendingAckRecoveryOnlyNodeIds,
    pendingAckRepairEligibleNodeIds,
    pendingAckBlockedNodeIds,
  };
}

export function buildStabilityGate({
  type,
  status = STABILITY_GATE_STATUS_UNKNOWN,
  blockers = [],
  evidence = null,
}) {
  return {
    type,
    status,
    applicable: status !== STABILITY_GATE_STATUS_NOT_APPLICABLE,
    blockers: normalizeDistinctStringArray(blockers),
    evidence: isRecord(evidence) ? evidence : null,
  };
}

export function hasBlockingPublicationClosureRecord({
  publicationConvergence = null,
  readinessFailure = null,
} = {}) {
  const closureRecordId =
    typeof publicationConvergence?.closureRecordId === 'string' ?
      publicationConvergence.closureRecordId.trim() :
      '';
  if (closureRecordId.length === ZERO) {
    return false;
  }
  const closureWitnessClass =
    typeof publicationConvergence?.closureWitnessClass === 'string' ?
      publicationConvergence.closureWitnessClass.trim() :
      '';
  if (
    closureWitnessClass ===
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG ||
    closureWitnessClass ===
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT
  ) {
    return true;
  }
  const publicationStillOpen =
    publicationConvergence?.publicationPending === true ||
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO ||
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) > ZERO ||
    publicationConvergence?.prioritySpreadPending === true;
  const blockerState = {
    publicationPending: publicationConvergence?.publicationPending === true,
    pendingAckCount:
      normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) ||
      ZERO,
    blockedNodeCount:
      normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) ||
      ZERO,
    prioritySpreadPending:
      publicationConvergence?.prioritySpreadPending === true,
    priorityRecoveryProgressClassCount:
      normalizeNonNegativeCount(
        publicationConvergence?.priorityRecoveryProgressClassCount,
      ) || ZERO,
    priorityRecoveryInvariantFailureCount: Array.isArray(
      publicationConvergence?.priorityRecoveryInvariantFailingIds,
    ) ?
      publicationConvergence.priorityRecoveryInvariantFailingIds.length :
      ZERO,
    readinessBlocked:
      hasBlockingReadinessFailure(readinessFailure) && publicationStillOpen,
  };
  return (
    blockerState.publicationPending ||
    blockerState.pendingAckCount > ZERO ||
    blockerState.blockedNodeCount > ZERO ||
    blockerState.prioritySpreadPending ||
    blockerState.priorityRecoveryProgressClassCount > ZERO ||
    blockerState.priorityRecoveryInvariantFailureCount > ZERO ||
    blockerState.readinessBlocked
  );
}

export function isStartupReadinessBlocked({
  readinessFailure = null,
  publicationConvergence = null,
} = {}) {
  const closureWitnessClass =
    typeof publicationConvergence?.closureWitnessClass === 'string' ?
      publicationConvergence.closureWitnessClass.trim() :
      '';
  const activeGateReady = publicationConvergence?.activeGate?.ready === true;
  const publicationStillOpen =
    publicationConvergence?.publicationPending === true ||
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO ||
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) > ZERO ||
    publicationConvergence?.prioritySpreadPending === true;
  return (
    (
      hasBlockingReadinessFailure(readinessFailure) &&
      (activeGateReady !== true || publicationStillOpen)
    ) ||
    closureWitnessClass ===
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG ||
    closureWitnessClass ===
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT
  );
}

export function countRestartBoundaries(logs = null) {
  let restartBoundaryCount = ZERO;
  for (const boundaries of Object.values(
    logs?.restartBoundariesByNodeId || {},
  )) {
    restartBoundaryCount += Array.isArray(boundaries) ?
      boundaries.length :
      ZERO;
  }
  return restartBoundaryCount;
}

export function buildConvergenceStabilityGate({
  publicationConvergence = null,
  readinessFailure = null,
  controlPlane = null,
}) {
  const hasStartupReadinessBlocker =
    isStartupReadinessBlocked({
      readinessFailure,
      publicationConvergence,
    });
  const hasPublicationGate = isRecord(controlPlane?.publicationConvergenceGate);
  if (
    !isRecord(publicationConvergence) &&
    !hasStartupReadinessBlocker &&
    !hasPublicationGate
  ) {
    return buildStabilityGate({
      type: STABILITY_GATE_TYPE_CONVERGENCE,
      status: STABILITY_GATE_STATUS_UNKNOWN,
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
    hasStartupReadinessBlocker &&
    (
      hasMissingActiveNodeBlocker !== true ||
      hasBlockingClosureRecord === true
    )
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  if (hasBlockingClosureRecord) {
    blockers.push(STABILITY_GATE_BLOCKER_CLOSURE_RECORD);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_CONVERGENCE,
    status:
      blockers.length > ZERO ?
        STABILITY_GATE_STATUS_OPEN :
        STABILITY_GATE_STATUS_CLOSED,
    blockers,
    evidence: {
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
      publicationPending: publicationConvergence?.publicationPending === true,
      prioritySpreadPending:
        publicationConvergence?.prioritySpreadPending === true,
      closureRecordId: publicationConvergence?.closureRecordId || null,
      closureWitnessClass: publicationConvergence?.closureWitnessClass || null,
      readinessMode: readinessFailure?.mode || null,
    },
  });
}

export function buildFailoverStabilityGate({
  publicationConvergence = null,
  readinessFailure = null,
  recoveryReadiness = null,
}) {
  const hasStartupReadinessBlocker =
    isStartupReadinessBlocked({
      readinessFailure,
      publicationConvergence,
    });
  const hasOpenPublicationOrPriorityRecovery =
    hasOpenPublicationOrPriorityRecoveryBlocker(publicationConvergence);
  const hasRecoveryReadiness = isRecord(recoveryReadiness);
  if (
    !isRecord(publicationConvergence) &&
    !hasStartupReadinessBlocker &&
    !hasRecoveryReadiness
  ) {
    return buildStabilityGate({
      type: STABILITY_GATE_TYPE_FAILOVER,
      status: STABILITY_GATE_STATUS_UNKNOWN,
    });
  }
  const blockers = [];
  const rawPendingAckBlockedNodeCount = Array.isArray(
    recoveryReadiness?.pendingAckBlockedNodeIds,
  ) ?
    recoveryReadiness.pendingAckBlockedNodeIds.length :
    ZERO;
  const rawPublicationBlockedNodeCount = Array.isArray(
    recoveryReadiness?.publicationBlockedNodeIds,
  ) ?
    recoveryReadiness.publicationBlockedNodeIds.length :
    ZERO;
  const rawWriteUnhealthyNodeCount = Array.isArray(
    recoveryReadiness?.writeUnhealthyNodeIds,
  ) ?
    recoveryReadiness.writeUnhealthyNodeIds.length :
    ZERO;
  const recoveryReadinessBlocksFailover =
    hasStartupReadinessBlocker ||
    hasOpenPublicationOrPriorityRecovery;
  const hasBlockingClosureRecord =
    hasBlockingPublicationClosureRecord({
      publicationConvergence,
      readinessFailure,
    });
  const pendingAckBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPendingAckBlockedNodeCount :
    ZERO;
  const publicationBlockedNodeCount = recoveryReadinessBlocksFailover ?
    rawPublicationBlockedNodeCount :
    ZERO;
  const writeUnhealthyNodeCount = recoveryReadinessBlocksFailover ?
    rawWriteUnhealthyNodeCount :
    ZERO;
  const hasMissingActiveNodeBlocker =
    hasPublicationMissingActiveNodeBlocker(publicationConvergence);
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
    normalizeNonNegativeCount(publicationConvergence?.pendingAckCount) > ZERO ||
    pendingAckBlockedNodeCount > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT);
  }
  if (
    normalizeNonNegativeCount(publicationConvergence?.blockedNodeCount) >
      ZERO ||
    publicationBlockedNodeCount > ZERO ||
    writeUnhealthyNodeCount > ZERO
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_BLOCKED_NODES);
  }
  if (
    hasStartupReadinessBlocker &&
    (
      hasMissingActiveNodeBlocker !== true ||
      hasBlockingClosureRecord === true
    )
  ) {
    blockers.push(STABILITY_GATE_BLOCKER_STARTUP_READINESS);
  }
  return buildStabilityGate({
    type: STABILITY_GATE_TYPE_FAILOVER,
    status:
      blockers.length > ZERO ?
        STABILITY_GATE_STATUS_OPEN :
        STABILITY_GATE_STATUS_CLOSED,
    blockers,
    evidence: {
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
      pendingAckBlockedNodeCount,
      publicationBlockedNodeCount,
      writeUnhealthyNodeCount,
      readinessMode: readinessFailure?.mode || null,
    },
  });
}
