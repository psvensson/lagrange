import * as foundation from './failure-bundle-diagnostics-foundation.js';
import * as diagnostics from './failure-bundle-diagnostics-merge.js';
import * as priority from './failure-bundle-diagnostics-priority-recovery.js';
import * as artifact from './failure-bundle-diagnostics-artifact-builder.js';

const {ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG, ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT, CONTROL_PLANE_PRIORITY_RECOVERY_REASON, CONTROL_PLANE_PUBLICATION_STATUS, CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET, CONTROL_PLANE_QUIESCENCE_REASON, CONTROL_PLANE_QUIESCENCE_STATE, CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET, CONTROL_PLANE_READINESS_REASON, EDGE_ID, EDGE_STATE, EMPTY_STRING, FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER, FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES, FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY, FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX, FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX, FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR, FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET, FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_PHASE_CONVERGENCE, FAILURE_BARRIER_PHASE_RESTART_RECOVERY, FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT, FAILURE_BARRIER_REASON_COUNT, FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT, FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET, FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET, FAILURE_BUNDLE_SEGMENT_3, FINAL_CONSISTENCY_CACHE_REASON_SET, FINAL_CONSISTENCY_CACHE_STATE_SET, FINAL_CONSISTENCY_CDC_REASON_SET, FINAL_CONSISTENCY_CDC_STATE_SET, FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX, FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE, FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG, FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_REASON_UNCLASSIFIED, FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED, FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH, FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG, FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG, FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED, FINAL_CONSISTENCY_TOPOLOGY_REASON_SET, FINAL_CONSISTENCY_TOPOLOGY_STATE_SET, JS_OBJECT_TYPE, LOAD_WAIT_REASON_ATTEMPT_ERRORS, LOAD_WAIT_REASON_HARD_LOAD_FAILURES, ONE, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_PROGRESS_OWNER, PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES, PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES, PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE, PUBLICATION_OWNER_ACK_STATE, PUBLICATION_OWNER_FRESHNESS_FENCE, PUBLICATION_OWNER_RECOVERY_OUTCOME, PUBLICATION_OWNER_STREAM_OUTCOME, PUBLICATION_OWNER_TEXT, PUBLICATION_RECOVERY_GATE_STATE, PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE, READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE, READINESS_DIMENSION_REPAIR_ELIGIBLE, READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING, READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY, READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING, READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING, REASON, RECOVERY_PROTOCOL_STATE, RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT, RESTART_RECOVERY_READINESS_BOOLEAN_FALSE, RESTART_RECOVERY_READINESS_BOOLEAN_TRUE, RESTART_RECOVERY_READINESS_FIELD, RESTART_RECOVERY_READINESS_FIELD_SEPARATOR, RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR, RESTART_RECOVERY_READINESS_NODE_MARKER, RESTART_RECOVERY_READINESS_NO_VALUE, RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER, RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER, RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH, RESTART_RECOVERY_READINESS_UNKNOWN_VALUE, addOwnerContractReasonCounts, attachCanonicalPublicationEvidence, buildActiveGatePendingAckEvidence, buildActiveGatePriorityRecoveryActuationEvidence, buildCanonicalControlPlaneDiagnosticsFromControlPlane, buildCanonicalPublicationEvidenceFromControlPlane, buildFailureArtifact, buildFailureArtifactOwnerContractPresentation, buildFocusedNodeDiagnostics, buildPriorityRecoveryActuationWitnessEvidence, buildPriorityRecoveryProgressSummary, buildPriorityRecoveryWitnessFreshnessKey, buildPublicationConvergenceSummary, buildPublicationMissingPublishedEvidence, buildPublicationRecoveryGateSnapshot, buildTopologyConvergenceGraphFromArtifacts, buildTopologyConvergenceOwnerPresentation, classifyActiveGateClosureWitness, collectPublicationMissingActiveNodeReasonCandidates, dedupePriorityRecoveryObservationWitnesses, filterReasonCountsForClosedPublication, filterReasonCountsForPublicationMissingActiveNode, hasActionableOwnerContractWitness, hasActiveGatePendingAckDebt, hasActiveGatePriorityRecoveryActuationEvidence, hasActiveGateSnapshotCoveragePending, hasActivePrioritySpreadGate, hasClosedPostActiveConvergenceOwners, hasClosedPublicationConvergenceEvidence, hasClosedPublishedPublicationRecoveryGate, hasCompletePriorityRecoveryOperationEvidence, hasConvergenceTimeoutError, hasCurrentActiveGatePendingAckClosure, hasNewerBestProgressPendingAckClosure, hasOpenPublicationOrPriorityRecoveryBlocker, hasPriorityRecoveryOperationDetail, hasPrioritySpreadReasonCode, hasPublicationMissingActiveNodeBlocker, hasPublishedPrioritySpreadRecoveryConvergence, hasReadyActiveGatePublicationConvergence, hasRestartRecoveryPrioritySpreadEvidence, hasRestartRecoveryTimeoutError, hasSatisfiedPrioritySpreadEvidence, hasStalePublicationClosureEvidence, isPendingAckOwnerContractWitness, isPrioritySpreadSummarySatisfied, isPublicationMissingActiveNodeReason, isRestartRecoveryAdminReachabilityRefused, isSupersededFailureBarrierReason, isSupersededFailureBarrierRootCause, mapFirstFaultMarkerToReason, mergeControlPlaneDiagnostics, mergeControlSnapshotByNodeId, mergePriorityRecoveryObservationSnapshots, mergeRetainedPriorityRecoveryObservation, normalizeActiveGateBlockerReason, normalizePriorityRecoveryActiveGateSnapshot, normalizePriorityRecoveryPartitionWitnessesForDiagnostics, normalizeRestartRecoveryReadinessFieldValue, normalizeRestartRecoveryReadinessNumber, parseRestartRecoveryReadinessFieldMap, priorityRecoveryPartitionMapHasEntries, resolveActiveGateDominantBlockerReason, resolveActiveGatePublicationDebtSuppressionProgress, resolveActiveGateSelectedMissingPublishedNodeIds, resolveActiveGateSelectedPublishedMembershipDeficitNodeIds, resolveActiveGateSnapshotCoverageBlocker, resolveAuthoritativePublicationMembershipNodeIds, resolveControlPlaneQuiescenceRootCauseClass, resolveConvergenceFailureBarrier, resolveCurrentPendingAckNodeIds, resolveDominantReasonFromFirstFaultTimeline, resolveDominantReasonOverride, resolveFailureBarrier, resolveFinalConsistencyFailure, resolveFinalConsistencyFailureFromMessage, resolveFinalConsistencyRootCauseClass, resolveFirstFaultTimeline, resolveFreshRetainedPriorityRecoveryObservationWitnesses, resolveOwnerContractDominantReason, resolveOwnerContractRootCauseClass, resolvePendingRequiredAckNodeIds, resolvePriorityRecoveryObservationCount, resolvePriorityRecoveryObservationList, resolvePriorityRecoveryObservationMap, resolvePriorityRecoveryObservationWitnesses, resolvePriorityRecoveryWitnessFreshnessAtMs, resolvePublicationBlockedDominantReason, resolvePublicationConvergenceRecoveryProtocolState, resolvePublicationMissingActiveNodeReason, resolvePublicationMissingActiveNodeReasonNodeIds, resolveRelevantPublicationMembershipNodeIds, resolveRestartRecoveryFailureBarrier, resolveRestartRecoveryFailureBarrierReason, resolveRestartRecoveryFailureBarrierRootCauseClass, resolveRestartRecoveryReadinessObservation, resolveRestartRecoveryReadinessOwnerState, resolveStructuredControlPlaneQuiescenceFailure, resolveStructuredFinalConsistencyFailure, selectActiveGateForPublicationConvergence, shouldApplyConvergenceFailureBarrier, shouldMergeRetainedPriorityRecoveryObservation, shouldSuppressActiveGateSnapshotPublicationDebt, shouldUsePublicationRecoveryGatePendingAckCount} = Object.assign({}, foundation, diagnostics, priority, artifact);
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
